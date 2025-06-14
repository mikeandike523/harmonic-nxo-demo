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

/**
 * Design a symmetric exponential-decay FIR filter.
 * Produces a real-valued, linear-phase, lowpass-like shape centered around the middle tap.
 * The time constant defines where the response drops to 1/e of its maximum.
 *
 * @param {number} numTaps - Number of filter taps (must be >= 1)
 * @param {number} tau - Time constant in samples; 1/e point occurs tau samples from center
 * @returns {Float32Array} Filter coefficients (normalized to unity gain)
 */
export function symmetricExDecay(numTaps, tau) {
  if (numTaps < 1) throw new Error("numTaps must be at least 1");
  if (tau <= 0) throw new Error("tau must be positive");

  const h = new Float32Array(numTaps);
  const M = numTaps - 1;
  const center = M / 2;

  for (let n = 0; n <= M; n++) {
    const dist = Math.abs(n - center);
    h[n] = Math.exp(-dist / tau);
  }

  // Normalize DC gain to 1
  const sum = h.reduce((acc, val) => acc + val, 0);
  for (let i = 0; i < numTaps; i++) {
    h[i] /= sum;
  }

  return h;
}

/**
 * Design a causal exponential-decay FIR filter.
 * Starts at 1.0 and decays toward zero with time constant `tau` (samples).
 * Good for transient softening or anti-pop smoothing, but introduces phase distortion.
 *
 * @param {number} numTaps - Number of taps (filter length)
 * @param {number} tau - Time constant in samples
 * @returns {Float32Array} Filter coefficients (normalized)
 */
export function asymmetricExDecay(numTaps, tau) {
  if (numTaps < 1) throw new Error("numTaps must be at least 1");
  if (tau <= 0) throw new Error("tau must be positive");

  const h = new Float32Array(numTaps);

  for (let n = 0; n < numTaps; n++) {
    h[n] = Math.exp(-n / tau);
  }

  // Normalize DC gain to 1
  const sum = h.reduce((acc, val) => acc + val, 0);
  for (let i = 0; i < numTaps; i++) {
    h[i] /= sum;
  }

  return h;
}