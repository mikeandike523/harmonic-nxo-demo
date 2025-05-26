/**
 * @typedef {object} EnvelopeParameters
 *
 * @param {number} amplitude - The amplitude of the envelope, between 0 and 1.
 * @param {number} attack - The time it takes for the envelope to reach its maximum amplitude, in seconds.
 * @param {number} decay - The time it takes for the envelope to reach its sustain amplitude, in seconds.
 * @param {number} sustainAmplitude - The amplitude of the envelope when it reaches its sustain point, between 0 and 1.
 * @param {number} sustain - The amount of time the envelope stays at its sustain amplitude, in seconds.
 * @param {number} release - The time it takes for the envelope to reach 0 after the sustain period.
 */

/**
 * The default number of time-constants that must pass to consider an exponential decay to be considered complete.
 */
export const DEFAULT_NUM_TAU = 5;

/**
 * How many samples will fit within on entry on the pre-computed table, where these sample will be interpolated linearly.
 * If the values is 1, we skip the linear interpolation and use the pre-computed value directly.
 * However this will lead to large memory usage.
 */
export const DEFAULT_SAMPLES_PER_TABLE_ENTRY = 1;

/**
 * Evaluates an ADSR envelope at a given time point, in seconds, with full accuracy.
 * Used to construct the pre-computed ADSR table.
 */
export function evaluateTrueADSR(
  envelopeParameters,
  time,
  numTau = DEFAULT_NUM_TAU
) {
  // By using early returns, we can avoid branch logic

  // Attack Section

  if (time < envelopeParameters.attack) {
    // Step 1, compute tau
    const tau = envelopeParameters.attack / numTau;
    // Step 2, compute p (progress along attack section, ranging from 0 to 1)
    const p = time / envelopeParameters.attack;
    // Step 3, negative exponential
    return 1 - Math.exp(-p / tau);
  }

  // Decay Section
  const decayStart = envelopeParameters.attack;
  const decayEnd = envelopeParameters.attack + envelopeParameters.decay;
  if (time < decayEnd) {
    const timeSinceDecayStart = time - decayStart;
    const tau = envelopeParameters.decay / numTau;
    const p = timeSinceDecayStart / envelopeParameters.decay;
    return (
      envelopeParameters.sustainAmplitude +
      Math.exp(-p / tau) *
        (envelopeParameters.amplitude - envelopeParameters.sustainAmplitude)
    );
  }

  // Sustain Section
  const sustainStart = decayEnd;
  const sustainEnd = sustainStart + envelopeParameters.sustain;
  if (time < sustainEnd) {
    return envelopeParameters.sustainAmplitude;
  }

  // Release Section
  const releaseStart = sustainEnd;
  const releaseEnd = releaseStart + envelopeParameters.release;
  if (time < releaseEnd) {
    const timeSinceReleaseStart = time - releaseStart;
    const tau = envelopeParameters.release / numTau;
    const p = timeSinceReleaseStart / envelopeParameters.release;
    return envelopeParameters.sustainAmplitude * Math.exp(-p / tau);
  }

  // If we reach this point, the time is outside the envelope's duration
  // We return 0 as the envelope has ended
  return 0;
}

/**
 *
 * @param {EnvelopeParameters} envelopeParameters - The envelope parameters to precompute.
 * @param {number} sampleRate - The sample rate at which the envelope should be precomputed.
 * @param {number} numTau - Number of time-constant to consider exponential decay complete.
 * @param {number} samplesPerTableEntry -
 * Number of samples per table entry.
 * Samples in between will be interpolated linearly.
 * If 1, then direct sampling is used without interpolation.
 * However, this will lead to large memory usage.
 *
 * @returns {Float32Array} - A pre-computed table of samples for the given envelope parameters.
 */
export function precomputeADSRTable(
  envelopeParameters,
  sampleRate,
  numTau = DEFAULT_NUM_TAU,
  samplesPerTableEntry = DEFAULT_SAMPLES_PER_TABLE_ENTRY
) {
  // Step 1, compute how long, in seconds, the envelope lasts

  const totalDuration =
    envelopeParameters.attack +
    envelopeParameters.decay +
    envelopeParameters.sustain +
    envelopeParameters.release;

  // Step 2, compute duration in samples, we must round up the sample count so we cover the entire duration
  const numSamples = Math.ceil(totalDuration * sampleRate);

  // Step 3, determine number of table entries

  const numTableEntries = Math.ceil(numSamples / samplesPerTableEntry);

  const table = new Float32Array(numTableEntries);

  for (let i = 0; i < numTableEntries; i++) {
    const samplesPassed = i * samplesPerTableEntry;
    const timePassed = samplesPassed / sampleRate;
    const trueEnvelopeValue = evaluateTrueADSR(
      envelopeParameters,
      timePassed,
      numTau
    );
    table[i] = trueEnvelopeValue;
  }

  return table;
}

export function createADSRTableInterpolator(
  table,
  sampleRate,
  samplesPerTableEntry = DEFAULT_SAMPLES_PER_TABLE_ENTRY
) {
  // Direct sampler
  if (samplesPerTableEntry === 1) {
    /**
     * @param {number} time - Time in seconds
     * @returns {number} - Envelope value at the given time
     */
    return function (time) {

      const sampleIndex = Math.floor(time * sampleRate);
      if (sampleIndex < 0) {
        return 0;
      }
      if (sampleIndex >= table.length) {
        return 0;
      }
      return table[sampleIndex];
    };
  }

  // Linear interpolator
  /**
   * @param {number} time - Time in seconds
   * @returns {number} - Envelope value at the given time
   */
  return function (time) {
    const asSamples = Math.floor(time * sampleRate);
    const asTableEntryIndex = Math.floor(asSamples / samplesPerTableEntry);
    const progressAlongEntry =
      (asSamples % samplesPerTableEntry) / samplesPerTableEntry;
    const indexLeft = asTableEntryIndex;
    const indexRight = asTableEntryIndex + 1;
    const valueLeft =
      indexLeft >= 0 && indexLeft < table.length ? table[indexLeft] : 0;
    const valueRight =
      indexRight >= 0 && indexRight < table.length ? table[indexRight] : 0;
    const delta = valueRight - valueLeft;
    return valueLeft + delta * progressAlongEntry;
  };
}


