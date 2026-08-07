#!/usr/bin/env node
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import process from 'node:process'

/**
 * Which OKX do these keys belong to?
 *
 * OKX runs four separate key universes — the global platform and the separately-regulated
 * EEA one, each with a live and a simulated environment — and a key exists in exactly one
 * of them. Ask the wrong one and the venue refuses in a way that reads like a broken key:
 * `50119 "API key doesn't exist"` from a platform that has never heard of it, or
 * `50101 "APIKey does not match current environment"` from one that has, under the other
 * environment.
 *
 * The desk resolves this by itself at boot. This script exists for the moment *before*
 * that — standing on the host with a .env and a question — and for the moment after, when
 * the desk reports that no universe accepted the key and the next question is whether the
 * credential is wrong or the network is. It asks all four directly, over curl-grade plumbing
 * with no browser and no desk in the way, and names the one that answers.
 *
 * It reads keys and never prints them: the output is four verdicts and a conclusion.
 *
 *   node scripts/okx-whoami.mjs [path/to/.env]
 */

/** Authenticated, cheap, side-effect free — the smallest "do you know me". */
const CONFIG_PATH = '/api/v5/account/config'

/** The four cells of OKX's grid, and the settings each one implies for the desk. */
const UNIVERSES = [
  { host: 'https://eea.okx.com', demo: false, label: 'OKX EU (my.okx.com) live', okxEea: true, okxDemo: false },
  { host: 'https://www.okx.com', demo: false, label: 'OKX global (okx.com) live', okxEea: false, okxDemo: false },
  { host: 'https://eea.okx.com', demo: true, label: 'OKX EU (my.okx.com) demo', okxEea: true, okxDemo: true },
  { host: 'https://www.okx.com', demo: true, label: 'OKX global (okx.com) demo', okxEea: false, okxDemo: true },
]

/**
 * Read a dotenv file into a plain object.
 *
 * Deliberately minimal — `KEY=value`, comments, optional surrounding quotes. A dependency
 * would be a strange thing to install in order to debug a credential.
 *
 * @param {string} path - the file to read.
 * @returns {Record<string, string>} the parsed pairs; empty when the file is unreadable.
 */
function readEnvFile(path) {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return {}
  }

  const out = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eq = trimmed.indexOf('=')
    if (eq < 1) continue

    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
    if (value) out[key] = value
  }
  return out
}

/**
 * Ask one universe whether it knows this key.
 *
 * @param {{host: string, demo: boolean}} universe - where to ask.
 * @param {{apiKey: string, secretKey: string, passphrase: string}} keys - the credential.
 * @returns {Promise<{ok: boolean, code: string, msg: string}>} what the venue said.
 */
async function ask(universe, keys) {
  const ts = new Date().toISOString().replace(/(\.\d{3})\d*Z$/, '$1Z')
  const sign = createHmac('sha256', keys.secretKey).update(`${ts}GET${CONFIG_PATH}`).digest('base64')

  try {
    const response = await fetch(`${universe.host}${CONFIG_PATH}`, {
      headers: {
        'OK-ACCESS-KEY': keys.apiKey,
        'OK-ACCESS-SIGN': sign,
        'OK-ACCESS-TIMESTAMP': ts,
        'OK-ACCESS-PASSPHRASE': keys.passphrase,
        'Content-Type': 'application/json',
        ...(universe.demo ? { 'x-simulated-trading': '1' } : {}),
      },
    })
    const body = await response.json()
    return { ok: String(body?.code) === '0', code: String(body?.code ?? ''), msg: String(body?.msg ?? '') }
  } catch (err) {
    return { ok: false, code: '', msg: `unreachable: ${err?.message ?? err}` }
  }
}

/**
 * What a set of verdicts means, in words.
 *
 * Separated from the asking so the conclusion is one readable thing rather than a branch
 * buried in a loop — this is the entire output anybody actually reads.
 *
 * @param {Array<{universe: object, result: object}>} verdicts - one per universe.
 * @returns {string} the conclusion.
 */
function conclude(verdicts) {
  const found = verdicts.find((v) => v.result.ok)
  if (found) {
    return [
      `\n  ✓ Your key lives on ${found.universe.label}.`,
      '',
      '  In the desk (settings → keys), these two boxes should be:',
      `    “My OKX account is on my.okx.com (EU / EEA)”  →  ${found.universe.okxEea ? 'TICKED' : 'unticked'}`,
      `    “These are OKX demo trading keys”             →  ${found.universe.okxDemo ? 'TICKED' : 'unticked'}`,
      '',
      '  The desk sets these itself once the 50101 fix is deployed — this is just the',
      '  answer it will arrive at.',
    ].join('\n')
  }

  const codes = new Set(verdicts.map((v) => v.result.code))

  // Every platform saying "never heard of it" is the one verdict that really does point at
  // the credential — this is where "make a new key" becomes the right move, and nowhere else.
  if (codes.size === 1 && codes.has('50119')) {
    return [
      '\n  ✗ No OKX platform recognises this key at all (50119 everywhere).',
      '',
      '  That is the one answer that genuinely means the credential is gone: deleted,',
      '  revoked, or mistyped into .env. Create a new key — and note which site you are',
      '  logged into when you do (my.okx.com = EU, okx.com = global).',
    ].join('\n')
  }

  if (codes.has('50113')) {
    return '\n  ✗ Secret key does not match the API key (50113) — they must come from the same OKX key pair.'
  }
  if (codes.has('50105')) {
    return '\n  ✗ Wrong passphrase (50105) — it is the one you chose when creating the key, not your login password.'
  }
  if (codes.has('50114')) {
    return `\n  ✗ The key is restricted to an IP this host is not on (50114). Clear the allowlist on the key, or add this machine's public IP.`
  }
  if (codes.has('50102') || codes.has('50112')) {
    return `\n  ✗ This host's clock is too far off OKX's (50102/50112). Fix NTP on the host.`
  }

  return '\n  ✗ No universe accepted the key, and the codes above are not one of the usual causes.'
}

/**
 * Probe every universe and report.
 *
 * @param {string} [envPath] - the .env to read.
 * @returns {Promise<number>} a process exit code.
 */
async function main(envPath = process.argv[2] ?? '.env') {
  // The named file wins; the process environment only fills what it does not set. The
  // other way round is the usual dotenv precedence and exactly wrong for a diagnostic:
  // pointing this at a file and having it silently probe a *different* key inherited from
  // the shell is how you end up debugging the wrong credential.
  const env = { ...process.env, ...readEnvFile(envPath) }
  const keys = {
    apiKey: env.STOCKZ_OKX_API_KEY,
    secretKey: env.STOCKZ_OKX_SECRET_KEY,
    passphrase: env.STOCKZ_OKX_PASSPHRASE,
  }

  const missing = Object.entries(keys).filter(([, value]) => !value).map(([field]) => field)
  if (missing.length > 0) {
    console.error(`No OKX credentials found (missing: ${missing.join(', ')}).`)
    console.error(`Looked in ${envPath} and the environment.`)
    return 2
  }

  // The key is identified by shape alone. Enough to tell two keys apart in a screenshot,
  // useless to anybody who obtains it.
  console.log(`\nProbing OKX with key ${keys.apiKey.slice(0, 4)}…${keys.apiKey.slice(-4)} (from ${envPath})\n`)

  const verdicts = []
  for (const universe of UNIVERSES) {
    const result = await ask(universe, keys)
    verdicts.push({ universe, result })
    const mark = result.ok ? '✓' : '·'
    console.log(`  ${mark} ${universe.label.padEnd(30)} ${result.ok ? 'ACCEPTED' : `${result.code} ${result.msg}`}`)
  }

  console.log(conclude(verdicts))
  console.log('')
  return verdicts.some((v) => v.result.ok) ? 0 : 1
}

process.exit(await main())
