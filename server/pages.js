/**
 * The login page, as a string.
 *
 * Hand-written HTML rather than a template engine, for the same reason the server has no
 * framework: it is one page, it changes never, and it must render before any credential
 * exists — including on a half-provisioned server where its whole job is to say so.
 */

/**
 * Render the login page.
 *
 * @param {{message?: string, configured?: boolean}} [options] - what to tell the trader.
 * @returns {string} the HTML.
 */
export function loginPage(options = {}) {
  const { message = '', configured = true } = options

  const notice = !configured
    ? 'No credentials configured yet — set STOCKZ_USER_PASSWORD / STOCKZ_ADMIN_PASSWORD in the server’s .env and restart.'
    : message

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>STOCKZ — sign in</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
         background: #0a0f0a; color: #d7e4d7; font: 14px/1.5 ui-monospace, monospace; }
  form { display: grid; gap: 12px; padding: 28px; min-width: 280px;
         border: 1px solid #1d3a1d; border-radius: 6px; background: #0d140d; }
  h1 { margin: 0 0 4px; font-size: 16px; color: #35d235; letter-spacing: 2px; }
  label { display: grid; gap: 4px; font-size: 12px; color: #7fa77f; }
  input, select { padding: 8px 10px; border: 1px solid #1d3a1d; border-radius: 4px;
          background: #0a0f0a; color: #d7e4d7; font: inherit; }
  button { padding: 9px 10px; border: 0; border-radius: 4px; background: #35d235;
           color: #04140a; font: inherit; font-weight: 700; cursor: pointer; }
  .notice { color: #ffab40; font-size: 12px; max-width: 320px; }
</style>
</head>
<body>
<form method="post" action="/api/login">
  <h1>STOCKZ</h1>
  ${notice ? `<p class="notice">${notice}</p>` : ''}
  <label>account
    <select name="user">
      <option value="usr">usr — paper trading</option>
      <option value="admin">admin — full desk</option>
    </select>
  </label>
  <label>password
    <input type="password" name="pass" autocomplete="current-password" autofocus ${configured ? '' : 'disabled'}>
  </label>
  <button type="submit" ${configured ? '' : 'disabled'}>sign in</button>
</form>
</body>
</html>`
}

/**
 * Parse a x-www-form-urlencoded body.
 *
 * @param {Buffer|string} body - the raw body.
 * @returns {Record<string, string>} field → value.
 */
export function parseForm(body) {
  const out = {}
  for (const [key, value] of new URLSearchParams(String(body ?? ''))) out[key] = value
  return out
}
