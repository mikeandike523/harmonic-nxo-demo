import { Button, Div, H1, Span } from "style-props-html";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ToastContainer, toast } from "react-toastify";


import useMonitorSize, { type BBox } from "./hooks/useMonitorSize";

import {type Navigator as WebMidiNavigator, type WebMidiApi} from "./webmidi.esm"


function PianoWidget({
  onNotePress,
  onNoteRelease,
  bbox,
  midiActiveNoteIndices,
}: {
  bbox: BBox;
  onNotePress: (note: number) => void;
  onNoteRelease: (note: number) => void;
  midiActiveNoteIndices: Set<number>;
}) {
  const { width, height } = bbox;
  const whiteKeyWidth = width / 52;
  const blackKeyWidth = 0.6 * whiteKeyWidth;
  const blackKeyHeight = 0.8 * height;

  // 1️⃣ build the key arrays once
  const [whiteNoteIndices, blackNoteIndices] = useMemo(() => {
    const white: number[] = [],
      black: number[] = [];
    const whiteNotesInOctave = [0, 2, 3, 5, 7, 8, 10];
    for (let i = 0; i < 88; i++) {
      (whiteNotesInOctave.includes(i % 12) ? white : black).push(i);
    }
    return [white, black] as const;
  }, []);

  const releaseQueueRef = useRef<Set<number>>(new Set());
  const [heldNotes, setHeldNotes] = useState<Set<number>>(new Set());

  // 2️⃣ stable note handlers
  const noteDown = useCallback(
    (note: number) => {
      setHeldNotes((prev) => {
        const next = new Set(prev);
        next.add(note);
        return next;
      });
      onNotePress(note);
      releaseQueueRef.current.add(note);
    },
    [onNotePress]
  );

  const noteUp = useCallback(
    (note: number) => {
      setHeldNotes((prev) => {
        const next = new Set(prev);
        next.delete(note);
        return next;
      });
      onNoteRelease(note);
    },
    [onNoteRelease]
  );

  // 3️⃣ stable window‐up listener
  const handleWindowMouseUp = useCallback(() => {
    for (const note of releaseQueueRef.current) {
      noteUp(note);
    }
    releaseQueueRef.current.clear();
  }, [noteUp]);

  useEffect(() => {
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [handleWindowMouseUp]);

  return (
    <>
      {whiteNoteIndices.map((noteIndex, indexInArray) => {
        const left = indexInArray * whiteKeyWidth;
        return (
          <Span
            key={`note-index-${noteIndex}`}
            display="block"
            zIndex={1}
            position="absolute"
            width={`${whiteKeyWidth}px`}
            height={`${height}px`}
            top="0"
            left={`${left}px`}
            outline="1px solid black"
            onMouseDown={() => noteDown(noteIndex)}
          >
            <Span
              position="absolute"
              top="0"
              bottom="0"
              left="0"
              right="0"
              pointerEvents="none"
              opacity={heldNotes.has(noteIndex) || midiActiveNoteIndices.has(noteIndex) ? 1 : 0}
              background="rgba(0,0,0,0.25)"
              zIndex={2}
            ></Span>
          </Span>
        );
      })}
      {blackNoteIndices.map((noteIndex) => {
        // Find the white key to the *left* of this black key
        const noteInOctave = noteIndex % 12;
        // Early was confused, but now realize it needs to be centered at A not C
        const whiteNoteOffsetMap = {
          // A sharp (1) goes to A (0), which is the first white note
          1: 0,
          // C sharp (4) goes to C (3), which is the third white note
          4: 2,
          // D sharp (6) goes to D (5), which is the fourth white note
          6: 3,
          // F sharp (9) goes to F (8), which is the sixth white note
          9: 5,
          // G sharp (11) goes to G (10), which is the seventh white note
          11: 6,
        } as const;

        const floorOctave = (noteIndex - noteInOctave) / 12;
        const whiteKeyOffset =
          whiteNoteOffsetMap[noteInOctave as keyof typeof whiteNoteOffsetMap];
        const fullWhiteKeyOffset = floorOctave * 7 + whiteKeyOffset;

        const left =
          (fullWhiteKeyOffset + 1) * whiteKeyWidth - blackKeyWidth / 2;

        return (
          <Span
            key={`note-index-${noteIndex}`}
            display="block"
            zIndex={3}
            position="absolute"
            width={`${blackKeyWidth}px`}
            height={`${blackKeyHeight}px`}
            top="0"
            left={`${left}px`}
            background="black"
            outline="1px solid black"
            onMouseDown={() => noteDown(noteIndex)}
          >
            <Span
              position="absolute"
              top="0"
              bottom="0"
              left="0"
              right="0"
              pointerEvents="none"
              opacity={heldNotes.has(noteIndex)|| midiActiveNoteIndices.has(noteIndex)  ? 1 : 0}
              background="rgba(255,255,255,0.25)"
              zIndex={4}
            ></Span>
          </Span>
        );
      })}
    </>
  );
}

function App() {
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);

  const synthNodeRef = useRef<AudioWorkletNode | null>(null);

  const startAudio = useCallback(async () => {
    const ctx = new AudioContext({
      sampleRate: 48000, // Preferred
      latencyHint: "interactive", // For lowest latency
    });

    await ctx.audioWorklet.addModule("nxo-processor.js"); // Worklet file we'll define later

    const synthNode = new AudioWorkletNode(ctx, "nxo-processor", {
      outputChannelCount: [2],
    });

    // Example connection (you may adapt this to your actual synth routing later)
    synthNode.connect(ctx.destination);

    synthNodeRef.current = synthNode;

    setAudioContext(ctx);

    synthNode.port.postMessage({
      type: "start",
    });

    setIsPlaying(true);

    toast("Audio started successfully!", {
      type: "success",
      autoClose: 3000,
    });
  }, []);


  const midiActiveNoteIndicesCacheRef = useRef<Set<number>>(new Set());

  // To propagate to piano widget
  const [midiActiveNoteIndices, setMidiActiveNoteIndices] = useState<Set<number>>(new Set());

  function midiActivateNoteIndexOn(noteIndex: number) {
    midiActiveNoteIndicesCacheRef.current.add(noteIndex);
  }

  function midiDeactivateNoteIndexOn(noteIndex: number) {
    midiActiveNoteIndicesCacheRef.current.delete(noteIndex);
  }

  function syncPianoWidgetVisuals(){
    const next = new Set(midiActiveNoteIndicesCacheRef.current);
    setMidiActiveNoteIndices(next);
  }

  useEffect(() => {
    setInterval(syncPianoWidgetVisuals, 250);
  }, []);


  const pianoDivRef = useRef<HTMLDivElement | null>(null);
  const bboxOrNull = useMonitorSize(pianoDivRef);

  function onNotePress(note: number) {
    synthNodeRef.current?.port.postMessage({
      type: "noteOn",
      note: note + 21,
      velocity: 127,
    });
  }

  function onNoteRelease(note: number) {
    synthNodeRef.current?.port.postMessage({
      type: "noteOff",
      note: note + 21,
    });
  }

    useEffect(() => {
    // Bail early if the browser doesn't support it
    if (!navigator.requestMIDIAccess) {
      console.warn("Web MIDI API not supported in this browser.");
      return;
    }

    (navigator as object as WebMidiNavigator)
      .requestMIDIAccess({ sysex: false })
      .then(onMIDISuccess)
      .catch((err) => {
        console.error("Failed to get MIDI access", err);
      });

    function onMIDISuccess(midiAccess: WebMidiApi.MIDIAccess) {
      // Hook up all currently-connected inputs
      for (let input of midiAccess.inputs.values()) {
        input.onmidimessage = handleMIDIMessage;
      }
      // If devices connect/disconnect later, hook up the new ones too
      midiAccess.onstatechange = (event) => {
        const port = event.port;
        if (port.type === "input" && port.state === "connected") {
          (port as WebMidiApi.MIDIInput).onmidimessage = handleMIDIMessage;
        }
      };
    }

    function handleMIDIMessage(message: WebMidiApi.MIDIMessageEvent) {


      const [status, noteNumber, velocity] = message.data;
      const command = status & 0xf0;

      // 0x90 = note on, 0x80 = note off
      if (command === 0x90 && velocity > 0) {
        // your pianoWidget uses 0–87; MIDI keys are 21–108
        onNotePress(noteNumber - 21);
        midiActivateNoteIndexOn(noteNumber - 21);
      } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
        onNoteRelease(noteNumber - 21);
        midiDeactivateNoteIndexOn(noteNumber - 21);
      }
    }
  }, [onNotePress, onNoteRelease]);

  return (
    <Div
      width="100%"
      height="100%"
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      padding="1rem"
      gap="1rem"
    >
      <H1 fontSize="3rem">Harmonic NXO Demo</H1>

      {!audioContext && (
        <Button fontSize="1.5rem" padding="0.5rem" onClick={startAudio}>
          Click to Start Audio
        </Button>
      )}

      {audioContext && (
        <Button
          fontSize="1.5rem"
          padding="0.5rem"
          onClick={() => {
            if (synthNodeRef.current) {
              if (isPlaying) {
                synthNodeRef.current.port.postMessage({ type: "stop" });
                setIsPlaying(false);
              } else {
                synthNodeRef.current.port.postMessage({ type: "start" });
                setIsPlaying(true);
              }
            } else {
              toast("Audio not started yet!", {
                type: "error",
                autoClose: 3000,
              });
            }
          }}
        >
          {isPlaying ? "Stop Audio" : "Start Audio"}
        </Button>
      )}

      {/* Piano Widget */}

      <Div
        width="min(100%, 88rem)"
        height="5rem"
        position="relative"
        ref={pianoDivRef}
      >
        {bboxOrNull && (
          <PianoWidget
            midiActiveNoteIndices={midiActiveNoteIndices}
            bbox={bboxOrNull}
            onNotePress={onNotePress}
            onNoteRelease={onNoteRelease}
          />
        )}
      </Div>
      <ToastContainer />
    </Div>
  );
}

export default App;
