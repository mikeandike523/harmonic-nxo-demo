// piano.js
import { normalizeNXODef } from "../nxo.js";

export default normalizeNXODef({
  // Fundamental
  1: {
    amplitude: 1.0,
    attack: 0.010,           
    decay: 0.100,            
    sustainAmplitude: 0.3, 
    sustain: 0.100,          
    release: 0.200,          
  },
  1: {
    amplitude: 0.4,
    attack: 0.005,           
    decay: 0.005,            
    sustainAmplitude: 0.4, 
    sustain: 1.75,          
    release: 1.75,          
  },
  1.5: {
    amplitude: 1.0*0.6,
    attack: 0.010,           
    decay: 0.100,            
    sustainAmplitude: 0.3*0.6, 
    sustain: 0.100,          
    release: 0.200,          
  },
  1.75: {
    amplitude: 1.0*0.3,
    attack: 0.010,           
    decay: 0.100,            
    sustainAmplitude: 0.3*0.3, 
    sustain: 0.100,          
    release: 0.200,          
  },
  1.75: {
    amplitude: 0.8,
    attack: 0.010,           
    decay: 0.100,            
    sustainAmplitude: 0.4, 
    sustain: 0.100,          
    release: 0.200,          
  },
  2: {
    amplitude: 1.0*0.8,
    attack: 0.010,           
    decay: 0.100,            
    sustainAmplitude: 0.3*0.8, 
    sustain: 0.100,          
    release: 0.200,          
  },
  3: {
    amplitude: 0.8,
    attack: 0.010,           
    decay: 0.100,            
    sustainAmplitude: 0.4, 
    sustain: 0.100,          
    release: 0.200,          
  },
});