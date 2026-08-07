/**
 * The running desk version.
 *
 * Declared as a literal rather than imported from package.json: the site is served as
 * raw ES modules straight from the repo (no bundler in production), and a JSON import
 * is a build-tool feature the browser would not resolve. `appVersion`'s single test
 * asserts this constant still matches package.json, so the two cannot drift.
 */
export const APP_VERSION = '0.28.6'

/**
 * @returns {string} semver string, e.g. '0.1.0'.
 */
export function appVersion() {
  return APP_VERSION
}
