/**
 * What each venue can actually do.
 *
 * A ticket that offers a control the venue cannot honour produces one of two outcomes,
 * both bad: a rejection the trader has to interpret, or — worse — a silent downgrade,
 * where post-only quietly becomes an ordinary limit and a maker rebate becomes a taker
 * fee. So the controls are gated on this map, and anything the *engine* emulates rather
 * than the venue is labelled as emulated rather than passed off as native.
 */

/** Per-venue capability records. */
export const VENUES = Object.freeze({
  okx: Object.freeze({
    venue: 'okx',
    orderTypes: Object.freeze(['market', 'limit']),
    tifs: Object.freeze(['gtc', 'ioc', 'fok', 'post_only']),
    reduceOnly: true,
    amend: true,
    batchCancel: true,
    // OKX carries brackets natively as attached algo orders, so the desk does not have
    // to babysit the legs.
    brackets: Object.freeze({ supported: true, emulated: false }),
    trailing: Object.freeze({ supported: true, emulated: false }),
  }),
  etoro: Object.freeze({
    venue: 'etoro',
    orderTypes: Object.freeze(['market', 'limit']),
    // EToro has no IOC or FOK: the engine emulates them by placing and immediately
    // cancelling, which is *not* the same guarantee and says so.
    tifs: Object.freeze(['gtc']),
    reduceOnly: false,
    amend: false,
    batchCancel: false,
    brackets: Object.freeze({ supported: true, emulated: true }),
    trailing: Object.freeze({ supported: false, emulated: false }),
  }),
})

/** Instrument-shaped overrides — spot and swap differ on the same venue. */
export const INSTRUMENT_OVERRIDES = Object.freeze({
  // Spot cannot reduce a position it does not hold as a position.
  'okx:spot': Object.freeze({ reduceOnly: false }),
})

/**
 * Whether an instrument looks like a perpetual swap.
 *
 * @param {string} instrument - the instrument id.
 * @returns {string} 'swap' or 'spot'.
 */
export function instrumentKind(instrument) {
  return /-swap$/i.test(String(instrument ?? '')) ? 'swap' : 'spot'
}

/**
 * The capabilities in effect for a venue and instrument.
 *
 * @param {string} venue - the venue.
 * @param {string} [instrument] - the instrument id.
 * @returns {object} the merged capability record.
 */
export function capabilityFor(venue, instrument = '') {
  const base = VENUES[String(venue ?? '').toLowerCase()]
  // An unknown venue gets the empty set rather than a permissive default: showing a
  // control that cannot work is worse than showing none.
  if (!base) {
    return {
      venue: String(venue ?? ''),
      orderTypes: [],
      tifs: [],
      reduceOnly: false,
      amend: false,
      batchCancel: false,
      brackets: { supported: false, emulated: false },
      trailing: { supported: false, emulated: false },
    }
  }

  const override = INSTRUMENT_OVERRIDES[`${base.venue}:${instrumentKind(instrument)}`] ?? {}
  return { ...base, ...override, instrument: String(instrument ?? '') }
}

/**
 * The adapter capability list a venue record implies.
 *
 * @param {object} record - a capability record.
 * @returns {string[]} flags in the adapter contract's vocabulary.
 */
export function capabilityFlags(record) {
  const flags = [...(record?.orderTypes ?? []), ...(record?.tifs ?? [])].filter(
    (flag) => flag !== 'gtc',
  )

  if (record?.reduceOnly) flags.push('reduce_only')
  if (record?.amend) flags.push('amend')
  if (record?.batchCancel) flags.push('batch_cancel')

  return [...new Set(flags)]
}

/**
 * Whether the desk should badge a feature as emulated.
 *
 * @param {object} record - a capability record.
 * @param {string} feature - 'brackets' or 'trailing'.
 * @returns {boolean} true when the engine runs it, not the venue.
 */
export function isEmulated(record, feature) {
  const entry = record?.[String(feature ?? '')]
  return Boolean(entry?.supported && entry?.emulated)
}
