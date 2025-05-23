export function midiNoteToFrequency(midiNoteNumber) {
    const A4_midiNoteNumber = 69;
    const A4_frequency = 440;
    const semitoneDifference = midiNoteNumber - A4_midiNoteNumber;
    const frequency = A4_frequency * Math.pow(2, semitoneDifference / 12);
    return frequency;
}