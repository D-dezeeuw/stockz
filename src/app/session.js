import { setValue, appState } from './engine.js'
import { PATHS } from '../state/paths.js'
import { createLogger } from '../utils/log.js'

/**
 * Who is at the desk, as far as the backend is concerned.
 *
 * The backend (server/main.js) authenticates every request and answers `/api/session`
 * with the signed-in role: `usr` (paper only) or `admin` (everything). The desk reads it
 * once at boot and gates the money controls on it — the *server* remains the enforcement
 * for its own routes; this is the UI agreeing with it rather than offering buttons that
 * would only ever earn a 401.
 *
 * Absence is admin, deliberately: the Vite dev server has no backend and no login, and a
 * dev desk with the live controls missing would be a desk where the money path cannot be
 * developed. In production the backend always answers, so absence never happens there.
 */

const log = createLogger('session')

/** The role granted when no backend is answering (dev, tests). */
export const DEV_ROLE = 'admin'

/**
 * Fetch the signed-in role from the backend.
 *
 * @param {{fetch?: Function}} [deps] - injectable transport.
 * @returns {Promise<string>} 'usr' | 'admin'.
 */
export async function fetchRole(deps = {}) {
  const fetchImpl = deps.fetch ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') return DEV_ROLE

  try {
    const reply = await fetchImpl('/api/session')
    if (!reply?.ok) return DEV_ROLE

    const body = await reply.json()
    return body?.role === 'usr' ? 'usr' : 'admin'
  } catch {
    return DEV_ROLE
  }
}

/**
 * Load the role into state, where the bindings gate on it.
 *
 * @param {{fetch?: Function}} [deps] - injectable transport.
 * @returns {Promise<string>} the role now in state.
 */
export async function adoptRole(deps = {}) {
  const role = await fetchRole(deps)
  setValue(PATHS.ui.role, role)
  if (role !== 'admin') log.info(`signed in as ${role} — live trading controls are admin-only`)
  return role
}

/**
 * May this session touch real money?
 *
 * @param {object} [state] - engine state.
 * @returns {boolean} true for admin (and for a desk with no role loaded yet, which only
 *   happens where there is no backend to enforce anything anyway).
 */
export function isAdmin(state = appState) {
  return (state?.ui?.role ?? DEV_ROLE) === 'admin'
}
