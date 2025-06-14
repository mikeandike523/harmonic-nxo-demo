
/**
 * Proper modular arithmetic for ring buffer wrapping
 */
function trueMod(a, m) {
return ((a % m) + m) % m;
}

/**
 * Soft clipping to keep signal in [-1, 1] range smoothly
 * @param {number} x
 * @returns {number}
 */
function softClip(x) {
  return x / (1 + Math.abs(x));
}


/**
 * Applies a 4-coefficient IIR filter to stereo audio.
 * Good for pop/transient smoothing.
 */
export default class StereoAntiPopFilter {
  constructor(bufferSize = 64) {
    this.bufferSize = bufferSize;

    this.inputL = new Float32Array(bufferSize).fill(0);
    this.inputR = new Float32Array(bufferSize).fill(0);
    this.outputL = new Float32Array(bufferSize).fill(0);
    this.outputR = new Float32Array(bufferSize).fill(0);

    this.index = 0;

    // Coefficients: tweak for your specific smoothing needs
    this.b0 = 0.15;
    this.b1 = 0.15;
    this.a1 = 0.7;
    this.a2 = 0.0;
  }

  /**
   * Process a single stereo frame
   * @param {number} inL - Left channel input sample
   * @param {number} inR - Right channel input sample
   * @returns {[number, number]} - [outL, outR] smoothed and soft-clipped samples
   */
  process(inL, inR) {

    if(!isFinite(inL) || !isFinite(inR)) {
        console.warn("Invalid input sample:", inL, inR);
    }

    // soft clip input as well just in case
    inL = softClip(inL);
    inR = softClip(inR);

    const i = this.index;
    const prev1 = trueMod(i - 1, this.bufferSize);
    const prev2 = trueMod(i - 2, this.bufferSize);

    // Left channel
    this.inputL[i] = inL;
    let yL =
      this.b0 * this.inputL[i] +
      this.b1 * this.inputL[prev1] +
      this.a1 * this.outputL[prev1] +
      this.a2 * this.outputL[prev2];
    yL = softClip(yL);
    this.outputL[i] = yL;

    // Right channel
    this.inputR[i] = inR;
    let yR =
      this.b0 * this.inputR[i] +
      this.b1 * this.inputR[prev1] +
      this.a1 * this.outputR[prev1] +
      this.a2 * this.outputR[prev2];
    yR = softClip(yR);
    this.outputR[i] = yR;

    // Update ring buffer index
    this.index = (i + 1) % this.bufferSize;

    if (!isFinite(yL) || !isFinite(yR)) {
      console.warn("Filter instability detected:", yL, yR);
    }

    return [yL, yR];
  }
}