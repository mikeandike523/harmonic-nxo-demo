import { buildADSREngine, DEFAULT_NUM_TAU, DEFAULT_SAMPLES_PER_TABLE_ENTRY} from './ADSR.js';

/**
 * @typedef {import('./ADSR').ADSRParameters} ADSRParameters
 */

/**
 * @typedef {Record<number, ADSRParameters>} NXODef
 */

/**
 * 
 * @param {NXODef} def
 * @returns {NXODef}
 */
export function normalizeNXODef(def) {
  let totalAmplitude = 0;
  let totalSustain = 0;

  for (const { amplitude } of Object.values(def)) {
    totalAmplitude += amplitude;
  }

  for (const { sustain } of Object.values(def)) {
    totalSustain += sustain;
  }

  return Object.fromEntries(
    Object.entries(def).map(
      ([harmonic, { amplitude, sustain, ...rest }]) => {
        return [
          harmonic,
          {
            ...rest,
            amplitude: amplitude / totalAmplitude,
            sustain: sustain / totalSustain,
          },
        ];
      }
    )
  );
}

export function buildNXOComputer(
  nxoDef,
  sampleRate,
  numTau = DEFAULT_NUM_TAU,
  samplesPerTableEntry = DEFAULT_SAMPLES_PER_TABLE_ENTRY
) {
  /** @type {Map<number, { whileNoteOn: fn, whileNoteOff: fn }>} */
  const processors = new Map();

  for (const [harmonicKey, definition] of Object.entries(nxoDef)) {
    const h = Number(harmonicKey);
    const { ads, r } = buildADSREngine(
      definition,
      sampleRate,
      numTau,
      samplesPerTableEntry
    );

    const sustainTime = definition.attack + definition.decay;

    // capture in closure; no Map lookup on every sample
    processors.set(h, {
      whileNoteOn: timeSinceNoteOn =>
        ads.interp(timeSinceNoteOn),
      whileNoteOff: (totalTimeNoteWasOn, timeSinceNoteOff) => {
        const startVal =
          totalTimeNoteWasOn >= sustainTime
            ? definition.sustain
            : ads.interp(totalTimeNoteWasOn);
        return startVal * r.interp(timeSinceNoteOff);
      }
    });
  }

  return { processors };
}

export function computeReleasedNoteExpirationTime(nxoDef){
  return Math.max(...Object.values(nxoDef).map(({ release }) => release));
}