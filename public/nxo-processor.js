import { midiNoteToFrequency } from "./piano.js";

import ufo from "./presets/ufo.js";
import jazzOrgan from "./presets/jazz-organ.js";

const presets={
  jazzOrgan,
  ufo,
}

// Raw peak amplitude (peak-peak = 2 * PER_NOTE_VOLUME). Will want to add this to the UI eventually. Here, we use
// Here, we expect, on average, up to 8 notes to be playing simultaneously, but it is not a hard limit.
// Note: According to browser standards, the hardware/underlying-audio-engine will do the clipping automatically. No need to clip on JS side.
const PER_NOTE_VOLUME = 1 / 6;

// Considered complete at 5 tau
const COMPLETE_IN_N_TAU = 5;

// For now, we'll hard-code some ADSR for different harmonics to test out some sounds

const PRESET = "ufo";

const exampleNXODef = presets[PRESET]



// This will need to be greatly optimized ASAP
function scaleAmplitudeADSR(harmonicDef, timeSinceNoteStart) {
  if (timeSinceNoteStart < harmonicDef.attack) {
    const tau = harmonicDef.attack / COMPLETE_IN_N_TAU;
    const param = timeSinceNoteStart / harmonicDef.attack;
    const scale = 1 - Math.exp(-param / tau);
    return scale * harmonicDef.amplitude;
  }
  if (timeSinceNoteStart < harmonicDef.attack + harmonicDef.decay) {
    const param = (timeSinceNoteStart - harmonicDef.attack) / harmonicDef.decay;
    const tau = harmonicDef.decay / COMPLETE_IN_N_TAU;
    const scale = Math.exp(-param / tau);
    return (
      harmonicDef.sustainAmplitude +
      scale * (harmonicDef.amplitude - harmonicDef.sustainAmplitude)
    );
  }
  if (
    timeSinceNoteStart <
    harmonicDef.attack + harmonicDef.decay + harmonicDef.sustain
  ) {
    return harmonicDef.sustainAmplitude;
  }
  const param =
    (timeSinceNoteStart -
      (harmonicDef.attack + harmonicDef.decay + harmonicDef.sustain)) /
    harmonicDef.release;
  const tau = harmonicDef.release / COMPLETE_IN_N_TAU;
  const scale = Math.exp(-param / tau);
  return scale * harmonicDef.sustainAmplitude;
}

class NXOProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Midi notes: A0 = 21
    this.notes = new Map();

    this.port.onmessage = (event) => {
      const { type, note, velocity = 127 } = event.data;

      // sampCount: sampleCount since start
      if (type === "noteOn")
        this.notes.set(note, { velocity, startedOn: this.sampCount });
      if (type === "noteOff") this.notes.delete(note);
      if (type === "start") {
        this.start();
      }
      if (type === "stop") {
        this.stop();
      }
    };

    this.playing = false;
    this.sampCount = 0;

    // Prevent unnecessary heap allocations

    this.genSampleBuffer = new Float32Array(2);
  }

  start() {
    this.playing = true;
  }

  stop() {
    this.playing = false;
    this.sampCount = 0;
  }

  genSample(globalStartSamp, bufferOffSamp) {
    let lSample = 0;
    let rSample = 0;

    // For now, balanced / centered / mono audio (i.e. L=R)

    const t = (globalStartSamp + bufferOffSamp) / sampleRate;

    let total = 0.0;

    for (const [midiNote, { velocity, startedOn }] of this.notes.entries()) {
      const timeSinceNoteStart =
        (globalStartSamp + bufferOffSamp - startedOn) / sampleRate;

      const amplitude = (velocity / 127) * PER_NOTE_VOLUME;

      for (const [harmonic, harmonicDef] of Object.entries(exampleNXODef)) {
        const theta =
          2 * Math.PI * midiNoteToFrequency(midiNote) * harmonic * t;
        total +=
          amplitude *
          scaleAmplitudeADSR(harmonicDef, timeSinceNoteStart) *
          Math.sin(theta);
      }
    }

    lSample = total;
    rSample = total;

    this.genSampleBuffer[0] = lSample;
    this.genSampleBuffer[1] = rSample;
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];

    const numChannels = output.length;

    if (numChannels !== 2) {
      throw new Error("Expected 2 output channels.");
    }

    const outputChannel0 = output[0];
    const outputChannel1 = output[1];

    if (outputChannel0.length !== outputChannel1.length) {
      throw new Error(
        `
Output channel 0 and 1 must have the same length.
Note: this error should never occur. If it does, there is a major issue with your computer.
            `.trim()
      );
    }

    const outputLength = outputChannel0.length;

    for (let i = 0; i < outputLength; ++i) {
      this.genSample(this.sampCount, i);
      outputChannel0[i] = this.genSampleBuffer[0];
      outputChannel1[i] = this.genSampleBuffer[1];
    }

    this.sampCount += outputLength;

    return true; // Keep alive
  }
}

registerProcessor("nxo-processor", NXOProcessor);
