import { midiNoteToFrequency } from "./piano.js";
import { buildNXOComputer, computeReleasedNoteExpirationTime } from "./nxo.js";
import StereoAntiPopFilter from "./DSP/StereoAntiPopFilter.js";

import jazzOrgan from "./presets/jazz-organ.js";
import idk from "./presets/idk.js";

// Maximum number of simultaneous voices (including note releases)
const MAX_VOICES = 10;
// General expected number of simultaneous pressed-down notes
const AVERAGE_EXPECTED_SIMULTANEOUS_PRESSED_NOTES = 6;
const PRESET = "idk";
// Because the synthesizer is deterministic, we overlap computed regions to avoid computing in-between hardware buffers
const RECOMPUTE_AFTER = 512;
const BUFFER_SIZE = 1024;
const RING_BUFFER_SIZE = BUFFER_SIZE * 2;


const presets = {
  jazzOrgan,
  idk
};
const exampleNXODef = presets[PRESET];
const computer = buildNXOComputer(exampleNXODef, sampleRate, 5, 32);
const harmonics = Array.from(Object.keys(exampleNXODef)).map(Number);
const releaseNoteExpirationTime =
  computeReleasedNoteExpirationTime(exampleNXODef);
const per_note_volume = 1 / AVERAGE_EXPECTED_SIMULTANEOUS_PRESSED_NOTES;
const antiPopFilter = new StereoAntiPopFilter(RING_BUFFER_SIZE);


function trueMod(n, m) {
  return ((n % m) + m) % m;
}

class NXOProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Midi notes state
    this.notes = new Map();

    // ring-buffer / playhead state
    this.ringBufferLeft = new Float32Array(RING_BUFFER_SIZE).fill(0);
    this.ringBufferRight = new Float32Array(RING_BUFFER_SIZE).fill(0);
    this.playhead = 0;
    this.generationHead = 0;
    this.generationBuffer = new Float32Array(BUFFER_SIZE).fill(0);
    this.samplesSinceLastCompute = RECOMPUTE_AFTER;

    this.lastLeftWet = 0;
    this.lastRightWet = 0;

    // —— GC debouncing state —— 
    // wait 1.5× the longest release envelope before collecting
    this.GC_DEBOUNCE_SAMPLES = Math.ceil(
      releaseNoteExpirationTime * 1.5 * sampleRate
    );
    this.pendingGCDebounce = false;
    // counts up only while a GC is pending
    this.samplesSinceLastGCCounter = 0;

    this.port.onmessage = (event) => {
      const { type, note, velocity = 127 } = event.data;

      if (type === "noteOn") {
        this.runNoteGarbageCollection();

        // Enforce maximum polyphony (including releases)
        if (this.notes.size >= MAX_VOICES) {
          // find the note that has been running the longest
          let oldestNoteId = null;
          let maxSamples = -Infinity;
          for (const [id, data] of this.notes.entries()) {
            if (data.samplesSinceNoteOn > maxSamples) {
              maxSamples = data.samplesSinceNoteOn;
              oldestNoteId = id;
            }
          }
          if (oldestNoteId !== null) {
            this.notes.delete(oldestNoteId);
          }
        }

        // immediately start tracking the new note
        this.notes.set(note, {
          velocity,
          samplesSinceNoteOn: 0,
          on: true,
        });
      }

      if (type === "noteOff") {
        const nd = this.notes.get(note);
        if (!nd) {
          throw new Error(`No note found for noteOff: ${note}`);
        }
        nd.on = false;
        nd.totalTimeNoteWasOn = nd.samplesSinceNoteOn / sampleRate;

        // debounce GC: reset counter and mark pending
        this.pendingGCDebounce = true;
        this.samplesSinceLastGCCounter = 0;
      }
    };
  }

  runNoteGarbageCollection() {
    for (const [noteId, noteData] of this.notes) {
      if (!noteData.on) {
        const timeSinceOff =
          noteData.samplesSinceNoteOn / sampleRate -
          noteData.totalTimeNoteWasOn;
        if (timeSinceOff > releaseNoteExpirationTime) {
          this.notes.delete(noteId);
        }
      }
    }
  }

  generateMoreSamples() {
    // Clear buffer
    this.generationBuffer.fill(0);

    // Sum all active notes + harmonics
    for (const [midiNoteIndex, noteData] of this.notes.entries()) {
      const baseFreq = midiNoteToFrequency(midiNoteIndex);
      for (const harmonic of harmonics) {
        const freq = baseFreq * harmonic;
        const processor = computer.processors.get(harmonic);
        for (let i = 0; i < BUFFER_SIZE; i++) {
          const j = noteData.samplesSinceNoteOn + i;
          const t = j / sampleRate;
          const sin = Math.sin(2 * Math.PI * freq * t);
          const env = noteData.on
            ? processor.whileNoteOn(t)
            : processor.whileNoteOff(
                noteData.totalTimeNoteWasOn,
                t - noteData.totalTimeNoteWasOn
              );
          if(!isFinite(env)){
            console.log(noteData, harmonic,env.toString())
          }
          this.generationBuffer[i] +=
            (sin * env * per_note_volume * noteData.velocity) / 127;
        }
      }
    }

    // Write into ring buffer (mono → stereo)
    for (let i = 0; i < BUFFER_SIZE; i++) {
      const idx = trueMod(this.generationHead + i, RING_BUFFER_SIZE);
      const v = this.generationBuffer[i];
      if(!isFinite(v)){
        console.error(`Non-finite value at index ${i}: ${v}`);
        console.log(Array.from(this.notes.values()).map(x=>JSON.stringify(x,null,2 )).join('\n\n'));
      }
      this.ringBufferLeft[idx] = v;
      this.ringBufferRight[idx] = v;
    }

    this.generationHead = trueMod(
      this.generationHead + RECOMPUTE_AFTER,
      RING_BUFFER_SIZE
    );
  }

  getHeadRelativeIndex(k) {
    return trueMod(this.playhead - k, RING_BUFFER_SIZE);
  }

  process(inputs, outputs) {
    const output = outputs[0];

    if (output.length !== 2) {
      throw new Error("Expected 2 output channels.");
    }

    const outputL = output[0];
    const outputR = output[1];
    const outputLen = outputL.length;

    // recompute if needed
    if (this.samplesSinceLastCompute >= RECOMPUTE_AFTER) {
      this.generateMoreSamples();
      this.samplesSinceLastCompute = 0;
    }

    
    // zero out and pull from ring buffer
    for (let i = 0; i < outputLen; i++) {

      const idx = trueMod(this.playhead + i, RING_BUFFER_SIZE);
      const dryLeft = this.ringBufferLeft[idx];
      const dryRight = this.ringBufferRight[idx];
      // const [wetLeft, wetRight] = antiPopFilter.process(dryLeft, dryRight);

      // outputL[i] = wetLeft;
      // outputR[i] = wetRight;

      outputL[i] = dryLeft
      outputR[i] = dryRight

    }

    // advance per-note sample counters
    for (const note of this.notes.values()) {
      note.samplesSinceNoteOn += outputLen;
    }

    // advance playhead & compute counter
    this.playhead = trueMod(this.playhead + outputLen, RING_BUFFER_SIZE);
    this.samplesSinceLastCompute += outputLen;

    // —— GC debounce check —— 
    if (this.pendingGCDebounce) {
      this.samplesSinceLastGCCounter += outputLen;
      if (this.samplesSinceLastGCCounter >= this.GC_DEBOUNCE_SAMPLES) {
        this.runNoteGarbageCollection();
        this.pendingGCDebounce = false;
      }
    }

    return true;
  }
}

registerProcessor("nxo-processor", NXOProcessor);
