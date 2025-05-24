import { normalizeNXODef } from "../nxo.js";

export default normalizeNXODef({
  // 16' stop (sub-octave)
  0.5: {
    amplitude: 0.625,        // drawbar 5/8
    attack: 0.001,           // 1 ms
    decay: 0.01,             // 10 ms
    sustainAmplitude: 1.0,   // hold full level
    sustain: 10,             // 10 s
    release: 0.2,            // 200 ms fade
  },
  // 8' stop (fundamental)
  1: {
    amplitude: 0.875,        // drawbar 7/8
    attack: 0.001,
    decay: 0.01,
    sustainAmplitude: 1.0,
    sustain: 10,
    release: 0.2,
  },
  // 5 1/3' (twelfth)
  1.5: {
    amplitude: 0.375,        // drawbar 3/8
    attack: 0.001,
    decay: 0.01,
    sustainAmplitude: 1.0,
    sustain: 10,
    release: 0.2,
  },
  // 4' stop (octave)
  2: {
    amplitude: 0.625,        // drawbar 5/8
    attack: 0.001,
    decay: 0.01,
    sustainAmplitude: 1.0,
    sustain: 10,
    release: 0.2,
  },
  // 2 2/3' (twelfth above octave)
  3: {
    amplitude: 0.375,        // drawbar 3/8
    attack: 0.001,
    decay: 0.01,
    sustainAmplitude: 1.0,
    sustain: 10,
    release: 0.2,
  },
  // 2' (two octaves)
  4: {
    amplitude: 0.25,         // drawbar 2/8
    attack: 0.001,
    decay: 0.01,
    sustainAmplitude: 1.0,
    sustain: 10,
    release: 0.2,
  },
  // 1 3/5' (quint above two octaves)
  5: {
    amplitude: 0.25,         // drawbar 2/8
    attack: 0.001,
    decay: 0.01,
    sustainAmplitude: 1.0,
    sustain: 10,
    release: 0.2,
  },
  // 1 1/3' (maj third above)
  6: {
    amplitude: 0.25,         // drawbar 2/8
    attack: 0.001,
    decay: 0.01,
    sustainAmplitude: 1.0,
    sustain: 10,
    release: 0.2,
  },
  // 1' (three octaves)
  8: {
    amplitude: 0.125,        // drawbar 1/8
    attack: 0.001,
    decay: 0.01,
    sustainAmplitude: 1.0,
    sustain: 10,
    release: 0.2,
  },
});
