import { Div, H1, Span } from "style-props-html";

import useMonitorSize, { type BBox } from "./hooks/useMonitorSize";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function PianoWidget({
  onNotePress,
  onNoteRelease,
  bbox,
}: {
  bbox: BBox;
  onNotePress: (note: number) => void;
  onNoteRelease: (note: number) => void;
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
              opacity={heldNotes.has(noteIndex) ? 1 : 0}
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
              opacity={heldNotes.has(noteIndex) ? 1 : 0}
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
  const pianoDivRef = useRef<HTMLDivElement | null>(null);
  const bboxOrNull = useMonitorSize(pianoDivRef);

  function onNotePress(note: number) {
    // TODO!
  }

  function onNoteRelease(note: number) {
    // TODO!
  }

  return (
    <Div
      width="100%"
      height="100%"
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      padding="1rem"
    >
      <H1 fontSize="2rem">Harmonic NXO Demo</H1>

      {/* Piano Widget */}

      <Div
        width="min(100%, 88rem)"
        height="5rem"
        position="relative"
        ref={pianoDivRef}
      >
        {bboxOrNull && (
          <PianoWidget
            bbox={bboxOrNull}
            onNotePress={onNotePress}
            onNoteRelease={onNoteRelease}
          />
        )}
      </Div>
    </Div>
  );
}

export default App;
