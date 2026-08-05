/**
 * Which deploy this is.
 *
 * `APP_VERSION` answers "which release" and only moves when a phase closes, so between
 * closes every deploy carries the same number — and the one question a trader actually
 * has after a fix ships is "am I looking at it yet", which the release number cannot
 * answer.
 *
 * So the deploy script stamps the pushed commit here before it pushes, and the footer
 * shows it. Written as a literal for the same reason `version.js` is: the site is served
 * as raw ES modules straight from the repo, so there is no build step to inject anything
 * and nothing may import JSON.
 *
 * `scripts/stamp-build.sh` maintains the two constants below. Editing them by hand is
 * harmless but pointless — the next deploy overwrites both.
 */

/** Short SHA of the commit this build was cut from. */
export const BUILD_SHA = 'f44ff26'

/** When it was stamped, ISO-8601 to the minute. */
export const BUILD_AT = '2026-08-05T07:07'

/**
 * The build stamp as the footer shows it.
 *
 * @param {string} [sha] - the commit.
 * @param {string} [at] - when it was stamped.
 * @returns {string} e.g. 'a1b2c3d · 2026-08-04 18:31'.
 */
export function buildStamp(sha = BUILD_SHA, at = BUILD_AT) {
  const commit = String(sha ?? '').trim() || 'dev'
  // Space rather than the ISO 'T', and minutes without seconds: this is read at a glance
  // to answer "is this the one I just pushed", and a full ISO string makes that a parsing
  // exercise. Anchored on `HH:MM` rather than trimming a trailing `:NN`, which would eat
  // the minutes off a stamp that never carried seconds.
  const when = String(at ?? '')
    .trim()
    .replace('T', ' ')
    .replace(/(\d{2}:\d{2})(:\d{2})?(\.\d+)?Z?$/, '$1')

  return when ? `${commit} · ${when}` : commit
}
