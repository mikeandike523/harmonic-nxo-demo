/**
 * EnvelopeParameters defines the shape of an ADSR envelope.
 * @typedef {object} EnvelopeParameters
 * @param {number} amplitude - Peak amplitude (0–1).
 * @param {number} attack - Attack time in seconds.
 * @param {number} decay - Decay time in seconds.
 * @param {number} sustain - Sustain level (0–1).
 * @param {number} release - Release time in seconds.
 */

/**
 * Default number of time constants to consider an exponential complete.
 */
export const DEFAULT_NUM_TAU = 5;

/**
 * Default samples per table entry (1 = no interpolation, full table).
 */
export const DEFAULT_SAMPLES_PER_TABLE_ENTRY = 1;

/**
 * Evaluate the Attack/Decay/Sustain-level (ADS) portion at time t since note-on.
 */
function evaluateTrueADS(
  { amplitude, attack, decay, sustain },
  timeSinceNoteOn,
  numTau = DEFAULT_NUM_TAU
) {
  if (timeSinceNoteOn < attack) {
    const tau = attack / numTau;
    const p = timeSinceNoteOn / attack;
    return amplitude * (1 - Math.exp(-p / tau));
  }

  // Decay phase
  const decayStart = attack;
  const decayEnd = attack + decay;
  if (timeSinceNoteOn < decayEnd) {
    const t = timeSinceNoteOn - decayStart;
    const tau = decay / numTau;
    const p = t / decay;
    return sustain + Math.exp(-p / tau) * (amplitude - sustain);
  }

  // Sustain level
  return sustain;
}

/**
 * Evaluate the Release portion at time t since note-off.
 * Note: this is normalized (1 → 0); caller should multiply by the amplitude at note-off.
 */
function evaluateTrueR(
  { release },
  timeSinceNoteOff,
  numTau = DEFAULT_NUM_TAU
) {
  if (timeSinceNoteOff >= release) {
    return 0;
  }
  const p = timeSinceNoteOff / release;
  return Math.exp(-p / numTau);
}

/**
 * Precompute ADS table (Attack + Decay portion).
 */
export function precomputeADSTable(
  envelopeParameters,
  sampleRate,
  numTau = DEFAULT_NUM_TAU,
  samplesPerTableEntry = DEFAULT_SAMPLES_PER_TABLE_ENTRY
) {
  const duration = envelopeParameters.attack + envelopeParameters.decay;
  const totalSamples = Math.ceil(duration * sampleRate);
  const numEntries = Math.ceil(totalSamples / samplesPerTableEntry);
  const table = new Float32Array(numEntries);

  for (let i = 0; i < numEntries; i++) {
    const t = (i * samplesPerTableEntry) / sampleRate;
    table[i] = evaluateTrueADS(envelopeParameters, t, numTau);
  }
  return table;
}

/**
 * Precompute R table (Release portion, normalized 1 → 0).
 */
export function precomputeRTable(
  envelopeParameters,
  sampleRate,
  numTau = DEFAULT_NUM_TAU,
  samplesPerTableEntry = DEFAULT_SAMPLES_PER_TABLE_ENTRY
) {
  const duration = envelopeParameters.release;
  const totalSamples = Math.ceil(duration * sampleRate);
  const numEntries = Math.ceil(totalSamples / samplesPerTableEntry);
  const table = new Float32Array(numEntries);

  for (let i = 0; i < numEntries; i++) {
    const t = (i * samplesPerTableEntry) / sampleRate;
    table[i] = evaluateTrueR(envelopeParameters, t, numTau);
  }
  return table;
}

/**
 * Generic table-based interpolator generator.
 */
export function createTableInterpolator(
  table,
  duration,
  sampleRate,
  samplesPerTableEntry,
  valueBefore,
  valueAfter
) {
  if (samplesPerTableEntry === 1) {
    return (time) => {
      if (time <= 0) return valueBefore;
      if (time >= duration) return valueAfter;
      const idx = Math.floor(time * sampleRate);
      return table[idx];
    };
  }

  return (time) => {
    if (time <= 0) return valueBefore;
    if (time >= duration) return valueAfter;
    const samples = time * sampleRate;
    const entry = Math.floor(samples / samplesPerTableEntry);
    const frac = (samples % samplesPerTableEntry) / samplesPerTableEntry;
    const left = table[entry];
    const right = entry + 1 < table.length ? table[entry + 1] : valueAfter;
    return left + (right - left) * frac;
  };
}

/**
 * ADS wrapper: returns 0 before, ADS curve until ADS end, then sustain.
 */
export function createADSTableInterpolator(
  table,
  envelopeParameters,
  sampleRate,
  samplesPerTableEntry = DEFAULT_SAMPLES_PER_TABLE_ENTRY
) {
  const sustainLevel = envelopeParameters.sustain;
  const duration = envelopeParameters.attack + envelopeParameters.decay;
  return createTableInterpolator(
    table,
    duration,
    sampleRate,
    samplesPerTableEntry,
    0,
    sustainLevel
  );
}

/**
 * Release wrapper: returns 1 before, then runs R table down to 0.
 */
export function createRTableInterpolator(
  table,
  envelopeParameters,
  sampleRate,
  samplesPerTableEntry = DEFAULT_SAMPLES_PER_TABLE_ENTRY
) {
  const duration = envelopeParameters.release;
  return createTableInterpolator(
    table,
    duration,
    sampleRate,
    samplesPerTableEntry,
    1,
    0
  );
}

/**
 * Build Attack+Decay/Sustain engine.
 * @returns {{ table: Float32Array, interp: function }}
 */
export function buildADSEngine(
  envelopeParameters,
  sampleRate,
  numTau = DEFAULT_NUM_TAU,
  samplesPerTableEntry = DEFAULT_SAMPLES_PER_TABLE_ENTRY
) {
  const table = precomputeADSTable(
    envelopeParameters,
    sampleRate,
    numTau,
    samplesPerTableEntry
  );
  const interp = createADSTableInterpolator(
    table,
    envelopeParameters,
    sampleRate,
    samplesPerTableEntry
  );
  return { table, interp };
}

/**
 * Build Release engine (normalized 1→0).
 * @returns {{ table: Float32Array, interp: function }}
 */
export function buildREngine(
  envelopeParameters,
  sampleRate,
  numTau = DEFAULT_NUM_TAU,
  samplesPerTableEntry = DEFAULT_SAMPLES_PER_TABLE_ENTRY
) {
  const table = precomputeRTable(
    envelopeParameters,
    sampleRate,
    numTau,
    samplesPerTableEntry
  );
  const interp = createRTableInterpolator(
    table,
    envelopeParameters,
    sampleRate,
    samplesPerTableEntry
  );
  return { table, interp };
}

/**
 * Build both ADS and Release engines at once.
 * @returns {{
 *   ads: { table: Float32Array, interp: function },
 *   r:   { table: Float32Array, interp: function }
 * }}
 */
export function buildADSREngine(
  envelopeParameters,
  sampleRate,
  numTau = DEFAULT_NUM_TAU,
  samplesPerTableEntry = DEFAULT_SAMPLES_PER_TABLE_ENTRY
) {
  const ads = buildADSEngine(
    envelopeParameters,
    sampleRate,
    numTau,
    samplesPerTableEntry
  );
  const r = buildREngine(
    envelopeParameters,
    sampleRate,
    numTau,
    samplesPerTableEntry
  );
  return { ads, r };
}
