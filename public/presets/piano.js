// piano.js
import { normalizeNXODef } from "../nxo.js";

export default normalizeNXODef({
  // Fundamental
  1: {
    amplitude: 0,
    attack: 0.005,           // 5 ms very fast hammer attack
    decay: 0.200,            // 200 ms decay to simulate string vibration
    sustainAmplitude: 0.200, // no true sustain
    sustain: 0.100,          // brief hold (ignored since sustainAmplitude is zero)
    release: 0.500,          // 500 ms gentle release
  },
});