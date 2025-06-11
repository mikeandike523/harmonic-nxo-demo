import { midiNoteToFrequency } from "./piano.js";
import { buildNXOComputer, computeReleasedNoteExpirationTime } from "./nxo.js";

import jazzOrgan from "./presets/jazz-organ.js";

const PER_NOTE_VOLUME = 1 / 6;
const PRESET = "jazzOrgan";
// Because the synthesizer is deterministic, we overlap computed regions to avoid computing in-between hardware buffers
const RECOMPUTE_AFTER = 512;
const BUFFER_SIZE = 1024;
const RING_BUFFER_SIZE = BUFFER_SIZE * 2;
const NOTE_GARBAGE_COLLECTION_INTERVAL = 0.2;

const presets = {
  jazzOrgan,
};
const exampleNXODef = presets[PRESET];
const computer = buildNXOComputer(exampleNXODef, sampleRate, 5, 32,);
const harmonics = Array.from(Object.keys(exampleNXODef)).map(Number);
const releaseNoteExpirationTime =
  computeReleasedNoteExpirationTime(exampleNXODef);
const noteGarbageCollectionIntervalSamples = Math.floor(
  NOTE_GARBAGE_COLLECTION_INTERVAL * sampleRate
);

function trueMod(n, m) {
  return ((n % m) + m) % m;
}

class NXOProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Midi notes: A0 = 21
    this.notes = new Map();

    this.port.onmessage = (event) => {
      const { type, note, velocity = 127 } = event.data;

      if (type === "noteOn") {
        this.notes.set(note, { velocity, samplesSinceNoteOn: 0, on: true });
      }
      if (type === "noteOff") {
        const existingNote = this.notes.get(note);
        if (!existingNote) {
          throw new Error(`No note found for noteOff: ${note}`);
        }
        existingNote.on = false;
        existingNote.totalTimeNoteWasOn =
          existingNote.samplesSinceNoteOn / sampleRate;
      }
    };

    this.ringBufferLeft = new Float32Array(RING_BUFFER_SIZE).fill(0);
    this.ringBufferRight = new Float32Array(RING_BUFFER_SIZE).fill(0);

    this.playhead = 0;

    this.generationHead = 0;

    // Helps easily invert the loop order for the generation to increase its performance

    this.generationBuffer = new Float32Array(BUFFER_SIZE).fill(0);

    // Kick of generation by setting to RECOMPUTE_AFTER
    this.samplesSinceLastCompute = RECOMPUTE_AFTER;

    this.gcSamplesElapsed = 0;
  }

  runNoteGarbageCollection() {
    const currentNoteIds = Array.from(this.notes.keys());
    for (const noteId of currentNoteIds) {
      const noteData = this.notes.get(noteId);
      if (noteData) {
        if (!noteData.on) {
          const timeSinceNoteOff =
            noteData.samplesSinceNoteOn / sampleRate -
            noteData.totalTimeNoteWasOn;
          if (timeSinceNoteOff > releaseNoteExpirationTime) {
            this.notes.delete(noteId);
          }
        }
      }
    }
    // Comment out when not debugging
    // console.log(`Num Active Notes: ${this.notes.size}`);
    this.gcSamplesElapsed = 0;
  }

  generateMoreSamples() {
    // Clear the generation buffer
    this.generationBuffer.fill(0);

    // Generate the samples and store in generation buffer
    // This is easier than loading directly into ring buffer and dealing with index conversion headache
    for (const [midiNoteIndex, noteData] of this.notes.entries()) {
      const baseFrequency = midiNoteToFrequency(midiNoteIndex);
      for (const harmonic of harmonics) {
        const harmonicFrequency = baseFrequency * harmonic;
        const processor = computer.processors.get(harmonic);
        for (let i = 0; i < BUFFER_SIZE; i++) {
          const j = noteData.samplesSinceNoteOn + i;
          const elapsedTime = j / sampleRate;
          const sinValue = Math.sin(
            2 * Math.PI * harmonicFrequency * elapsedTime
          );
          const envelopeValue = noteData.on
            ? processor.whileNoteOn(elapsedTime)
            : processor.whileNoteOff(
                noteData.totalTimeNoteWasOn,
                elapsedTime - noteData.totalTimeNoteWasOn
              );

          this.generationBuffer[i] +=
            (sinValue * envelopeValue * PER_NOTE_VOLUME * noteData.velocity) /
            127;
        }
      }
    }

    // Load the generation buffer into the ring buffer

    // Generally speaking, this should be equal to this.playhead, but we play it safe
    for (let i = 0; i < BUFFER_SIZE; i++) {
      const ringBufferIndex = trueMod(
        this.generationHead + i,
        RING_BUFFER_SIZE
      );

      // For now, mono (balanced) audio (i.e. L=R)
      this.ringBufferLeft[ringBufferIndex] = this.generationBuffer[i];
      this.ringBufferRight[ringBufferIndex] = this.generationBuffer[i];
    }

    // Here is where "overlapping computations" happens

    // RECOMPUTE_AFTER is expected to be smaller than BUFFER_SIZE, so we are always producing more samples than will
    // be played before the next computation. This is what we WANT to avoid pops
    // If we just computed as much as needed per RECOMPUTE_AFTER, we would add delay between hardware buffers
    // that will cause a pop or other audio artifacts

    this.generationHead = trueMod(
      this.generationHead + RECOMPUTE_AFTER,
      RING_BUFFER_SIZE
    );

    // Note: This entire system relies heavily on the playhead always being within the generation buffer
    // If computation takes long enough and the playhead escapes the buffer, then it will be noisy since the other regions
    // of the ring buffer are NOT cleared (performance reasons)
    // And also, even if they were cleared it would just remain as silence which is not desired either
    // The computation of each buffer MUST fit within the time of RECOMPUTE_AFTER samples, and RECOMPUTE_AFTER
    // must be smaller than BUFFER_SIZE, and BUFFER_SIZE must be smaller than RING_BUFFER_SIZE,
    // and RECOMPUTE_AFTER should be at least twice the mean buffer length of the hardware buffers,
    // which are unfortunately unpredictable in JavaScript Web Audio API.
  }

  /**
   *
   * Get the true buffer index relative to the playhead.
   *
   * @param {number} k - Number of samples in the PAST. 0 = current sample, 1 = previous sample, etc.
   */
  getHeadRelativeIndex(k) {
    return trueMod(this.playhead - k, RING_BUFFER_SIZE);
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];

    const numChannels = output.length;

    if (numChannels !== 2) {
      throw new Error("Expected 2 output channels.");
    }

    const outputChannelL = output[0];
    const outputChannelR = output[1];

    if (outputChannelL.length !== outputChannelR.length) {
      throw new Error(
        `
Output channel 0 and 1 must have the same length.
Note: this error should never occur. If it does, there is a major issue with your computer.
            `.trim()
      );
    }

    if (this.samplesSinceLastCompute >= RECOMPUTE_AFTER) {
      this.generateMoreSamples();
      this.samplesSinceLastCompute = 0;
    }

    const outputLength = outputChannelL.length;
    for (let i = 0; i < outputLength; ++i) {
      outputChannelL[i] = 0;
      outputChannelR[i] = 0;
    }
    for (let i = 0; i < outputLength; ++i) {
      const k = outputLength - 1 - i;
      const ringBufferIndex = this.getHeadRelativeIndex(k);

      outputChannelL[i] = this.ringBufferLeft[ringBufferIndex];
      outputChannelR[i] = this.ringBufferRight[ringBufferIndex];
    }
    for (const note of this.notes.values()) {
      note.samplesSinceNoteOn += outputLength;
    }

    this.playhead = trueMod(this.playhead + outputLength, RING_BUFFER_SIZE);
    this.samplesSinceLastCompute += outputLength;
    this.gcSamplesElapsed += outputLength;
    if (this.gcSamplesElapsed >= noteGarbageCollectionIntervalSamples) {
      this.runNoteGarbageCollection()
    }

    return true; // Keep alive
  }
}

registerProcessor("nxo-processor", NXOProcessor);
