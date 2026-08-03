import pkg from '../../package.json'

/**
 * The running desk version, sourced from the package manifest so a release bump
 * is the single place a version changes.
 *
 * @returns {string} semver string, e.g. '0.1.0'.
 */
export function appVersion() {
  return String(pkg.version)
}
