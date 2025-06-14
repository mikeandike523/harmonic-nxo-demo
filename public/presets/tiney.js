import { normalizeNXODef } from "../nxo.js";

const harms = {}

for(let i=1; i<=3; i++) {
  harms[i] = {
    amplitude: 1/i,
    attack: (i-1+0.50)/5,
    decay: 2/i,
    sustain: 0,
    release: 0.5/i,
  }
}

for(let i=1; i<=3; i++) {
  harms[i+0.5] = {
    amplitude: 0.5/i,
    attack: 0.005,
    decay: 2/i,
    sustain: 0,
    release: 0.5/i,
  }
}

export default normalizeNXODef(harms)