import { formatHumanReadableByteCountBinary } from "./human-readable.js";
import { precomputeADSRTable, createADSRTableInterpolator } from "./ADSR.js";

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
  let total = 0;

  for (const { amplitude } of Object.values(def)) {
    total += amplitude;
  }

  return Object.fromEntries(
    Object.entries(def).map(
      ([harmonic, { amplitude, sustainAmplitude, ...rest }]) => {
        return [
          harmonic,
          {
            ...rest,
            amplitude: amplitude / total,
            sustainAmplitude: sustainAmplitude / total,
          },
        ];
      }
    )
  );
}

/**
 *
 * @param {NXODef} def
 * @param {number} sampleRate
 * @param {number} [numTau=undefined]
 * @param {number} [samplesPerTableEntry=undefined]
 * @param {boolean} [reportMemoryUsage=false]
 *
 * @returns {Map<number, (time: number) => number>}
 */
export function buildADSRComputer(
  def,
  sampleRate,
  numTau,
  samplesPerTableEntry,
  reportMemoryUsage = false
) {
  const computer = new Map();
  let report = "";
  if (reportMemoryUsage) {
    report += "ADSR Computer Memory Usage Report:";
  }
  for (const [harmonic, envelopeParameters] of Object.entries(def)) {
    const table = precomputeADSRTable(
      envelopeParameters,
      sampleRate,
      numTau,
      samplesPerTableEntry
    );
    if (reportMemoryUsage) {
      report +=
        " " * 4 +
        `
  ${harmonic} -- ${formatHumanReadableByteCountBinary(
          table.buffer.byteLength
        )} of memory.
  `.trim() +
        "\n";
    }
    computer.set(
      Number(harmonic),
      createADSRTableInterpolator(table, sampleRate, samplesPerTableEntry)
    );
  }
  if (reportMemoryUsage) {
    console.log(report);
  }
  return computer;
}
