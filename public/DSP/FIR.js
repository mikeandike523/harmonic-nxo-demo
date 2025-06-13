/**
 * Design a linear-phase FIR low-pass filter using windowed sinc method.
 * Ideal for attenuating high-frequency noise (e.g., above ~19 kHz) with a flat passband and controllable rolloff.
 *
 * @param {number} sampleRate - Sampling rate in Hz (e.g., 48000)
 * @param {number} cutoffFreq - Cutoff frequency in Hz (0 < cutoffFreq < sampleRate/2)
 * @param {number} numTaps - Number of filter taps (length), e.g. 64
 * @param {'rectangular'|'hann'|'hamming'|'blackman'|'kaiser'} window - Window type
 * @param {number} [kaiserBeta=5.0] - Beta parameter for Kaiser window (ignored for other windows)
 * @returns {Float32Array} Filter coefficients (normalized)
 */
export function designLowpassFIR(sampleRate, cutoffFreq, numTaps, window = 'blackman', kaiserBeta = 5.0) {
  const fc = cutoffFreq / sampleRate; // normalized freq (0 to 0.5)
  const M = numTaps - 1;
  const h = new Float32Array(numTaps);

  for (let n = 0; n <= M; n++) {
    const k = n - M / 2;
    const ideal = 2 * fc * sinc(2 * fc * k);
    let w;
    switch (window) {
      case 'hann':
        w = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / M);
        break;
      case 'hamming':
        w = 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / M);
        break;
      case 'blackman':
        w = 0.42 - 0.5 * Math.cos((2 * Math.PI * n) / M)
          + 0.08 * Math.cos((4 * Math.PI * n) / M);
        break;
      case 'kaiser':
        const ratio = (2 * n) / M - 1;
        w = bessel0(kaiserBeta * Math.sqrt(1 - ratio * ratio)) / bessel0(kaiserBeta);
        break;
      default:
        w = 1.0;
    }
    h[n] = ideal * w;
  }

  // Normalize DC gain to 1
  const sum = h.reduce((acc, val) => acc + val, 0);
  for (let i = 0; i < numTaps; i++) {
    h[i] /= sum;
  }

  return h;
}

/**
 * Sinc function implementation
 * @param {number} x
 * @returns {number}
 */
function sinc(x) {
  if (Math.abs(x) < 1e-8) return 1.0;
  return Math.sin(Math.PI * x) / (Math.PI * x);
}

/**
 * Zeroth-order modified Bessel function of the first kind (for Kaiser window)
 * @param {number} x
 * @returns {number}
 */
function bessel0(x) {
  let sum = 1.0;
  let term = 1.0;
  const x2 = (x * x) / 4;
  for (let k = 1; k <= 25; k++) {
    term *= x2 / (k * k);
    sum += term;
  }
  return sum;
}

export function normalizeFIRFilter(h) {
  const hCopy = h.slice();
  const  total = h.reduce((acc, val) => acc + val, 0);
  for (let i = 0; i < h.length; i++) {
    hCopy[i] /= total;
  }
  return hCopy;
}