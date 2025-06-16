import { Button, Div, H1, Span } from "style-props-html";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { throttle } from "lodash";
import { ToastContainer, toast } from "react-toastify";
import useMonitorSize, { type BBox } from "./hooks/useMonitorSize";
import type { Navigator as WebMidiNavigator, WebMidiApi } from "./webmidi.esm";
import Recorder from "./Recorder";

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

  const whiteNotesInOctave = [0, 2, 3, 5, 7, 8, 10];

  const [whiteNoteIndices, blackNoteIndices] = useMemo(() => {
    const white: number[] = [],
      black: number[] = [];
    for (let i = 0; i < 88; i++) {
      (whiteNotesInOctave.includes(i % 12) ? white : black).push(i);
    }
    return [white, black] as const;
  }, []);

  const releaseQueueRef = useRef<Set<number>>(new Set());
  const [heldNotes, setHeldNotes] = useState<Set<number>>(new Set());

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

  const handleWindowMouseUp = useCallback(() => {
    for (const note of releaseQueueRef.current) {
      noteUp(note);
    }
    releaseQueueRef.current.clear();
  }, [noteUp]);

  useEffect(() => {
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => window.removeEventListener("mouseup", handleWindowMouseUp);
  }, [handleWindowMouseUp]);

  return (
    <>
      {whiteNoteIndices.map((noteIndex, idx) => {
        const left = idx * whiteKeyWidth;
        const active =
          heldNotes.has(noteIndex) || midiActiveNoteIndices.has(noteIndex);
        return (
          <Span
            key={`w-${noteIndex}`}
            position="absolute"
            left={`${left}px`}
            top="0"
            width={`${whiteKeyWidth}px`}
            height={`${height}px`}
            outline="1px solid black"
            onMouseDown={() => noteDown(noteIndex)}
            backgroundColor={active ? "hsl(100,100%,50%)" : "white"}
            transition="background-color 0.100s ease-in-out"
          ></Span>
        );
      })}
      {blackNoteIndices.map((noteIndex) => {
        const noteInOct = noteIndex % 12;
        const floorOct = Math.floor(noteIndex / 12);
        const whiteOffset = whiteNotesInOctave.indexOf(noteInOct - 1);
        const whitePos = floorOct * 7 + whiteOffset;
        const left = (whitePos + 1) * whiteKeyWidth - blackKeyWidth / 2;
        const active =
          heldNotes.has(noteIndex) || midiActiveNoteIndices.has(noteIndex);
        return (
          <Span
            key={`b-${noteIndex}`}
            position="absolute"
            left={`${left}px`}
            top="0"
            width={`${blackKeyWidth}px`}
            height={`${blackKeyHeight}px`}
            backgroundColor={active ? "hsl(100,100%,40%)" : "black"}
            onMouseDown={() => noteDown(noteIndex)}
            transition="backgroundColor 0.100s ease-in-out"
          ></Span>
        );
      })}
    </>
  );
}

function App() {
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const synthNodeRef = useRef<AudioWorkletNode | null>(null);
  const [recordStream, setRecordStream] = useState<MediaStream | null>(null);
  const [memoryLimit, setMemoryLimit] = useState<number>(() => {
    const dm = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
    if (typeof dm === "number" && Number.isFinite(dm)) {
      return (dm * 1024 ** 3) / 4;
    }
    const jsHeapLimit = (performance as any).memory?.jsHeapSizeLimit;
    if (typeof jsHeapLimit === "number" && Number.isFinite(jsHeapLimit)) {
      return jsHeapLimit / 4;
    }
    return 256 * 1024 ** 2;
  });

  const [code, setCode] = useState<string>("\nreturn {};\n");
  const [presets, setPresets] = useState<Record<string, string>>({});
  const [selectedPreset, setSelectedPreset] = useState<string>("jazz-organ");

  const compileCode = useCallback(() => {
    if (!synthNodeRef.current) return;
    synthNodeRef.current.port.postMessage({ type: "compile", code });
  }, [code]);

  useEffect(() => {
    fetch("/presets.json")
      .then((r) => r.json())
      .then(setPresets)
      .catch((e) => console.error("presets", e));
  }, []);

  useEffect(() => {
    if (selectedPreset && presets[selectedPreset]) {
      fetch(presets[selectedPreset])
        .then((r) => r.text())
        .then(setCode)
        .catch((e) => console.error(e));
    }
  }, [selectedPreset, presets]);

  const startAudio = useCallback(async () => {
    const ctx = new AudioContext({
      sampleRate: 48000,
      latencyHint: "interactive",
    });
    await ctx.audioWorklet.addModule("nxo-processor.js");
    const node = new AudioWorkletNode(ctx, "nxo-processor", {
      outputChannelCount: [2],
    });
    const dest = new MediaStreamAudioDestinationNode(ctx);
    node.connect(ctx.destination);
    node.connect(dest);
    synthNodeRef.current = node;
    setRecordStream(dest.stream);
    setAudioContext(ctx);
    node.port.postMessage({ type: "start" });
    compileCode();
    toast("Audio started successfully!", { type: "success", autoClose: 3000 });
  }, [compileCode]);

  const onNotePress = useCallback((note: number) => {
    synthNodeRef.current?.port.postMessage({
      type: "noteOn",
      note: note + 21,
      velocity: 127,
    });
  }, []);

  const onNoteRelease = useCallback((note: number) => {
    synthNodeRef.current?.port.postMessage({
      type: "noteOff",
      note: note + 21,
    });
  }, []);

  const midiCache = useRef<Set<number>>(new Set());
  const [midiActive, setMidiActive] = useState<Set<number>>(new Set());
  const sync = useMemo(
    () =>
      throttle(() => setMidiActive(new Set(midiCache.current)), 100, {
        leading: true,
        trailing: true,
      }),
    []
  );
  const activate = (n: number) => {
    midiCache.current.add(n);
    sync();
  };
  const deactivate = (n: number) => {
    midiCache.current.delete(n);
    sync();
  };

  useEffect(() => {
    if (!navigator.requestMIDIAccess) return;
    (navigator as unknown as WebMidiNavigator)
      .requestMIDIAccess({ sysex: false })
      .then((m) => {
        for (const input of m.inputs.values()) input.onmidimessage = onM;
        m.onstatechange = (e) => {
          if (e.port.type === "input" && e.port.state === "connected") {
            (e.port as WebMidiApi.MIDIInput).onmidimessage = onM;
          }
        };
      });
    function onM(msg: WebMidiApi.MIDIMessageEvent) {
      const [st, nn, vel] = msg.data;
      const cmd = st & 0xf0;
      if (cmd === 0x90 && vel > 0) {
        onNotePress(nn - 21);
        activate(nn - 21);
      } else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) {
        onNoteRelease(nn - 21);
        deactivate(nn - 21);
      }
    }
  }, [onNotePress, onNoteRelease]);

  const pianoRef = useRef<HTMLDivElement>(null);
  const bbox = useMonitorSize(pianoRef);

  const [pianoWidth, setPianoWidth] = useState<number>(0);
  useEffect(() => {
    if (pianoRef.current) {
      const newWidth = pianoRef.current.clientWidth;
      if (newWidth !== pianoWidth) {
        setPianoWidth(newWidth);
      }
    }
  });

  return (
    <Div width="100%" height="100%" display="flex">
      <Div
        width="50%"
        padding="1rem"
        display="flex"
        flexDirection="column"
        gap="0.5rem"
      >
        <H1 fontSize="2rem">Preset Builder</H1>
        <select
          value={selectedPreset}
          onChange={(e) => setSelectedPreset(e.target.value)}
        >
          {Object.keys(presets).map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
          <option value="">custom</option>
        </select>
        <Div flex="1">
          <Editor
            height="100%"
            language="javascript"
            value={code}
            onChange={(v) => setCode(v ?? "")}
          />
        </Div>
        <Button
          onClick={compileCode}
          disabled={!audioContext}
          fontSize="1.5rem"
        >
          {audioContext ? "Compile" : "Start audio to enable compiling..."}
        </Button>
      </Div>
      <Div
        width="50%"
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        padding="1rem"
        gap="1rem"
      >
        <H1 fontSize="3rem">Harmonic NXO Demo</H1>
        {!audioContext ? (
          <Button fontSize="1.5rem" padding="0.5rem" onClick={startAudio}>
            Click to Start Audio
          </Button>
        ) : (
          <>
            <Div
              width="min(100%,88rem)"
              height="5rem"
              position="relative"
              ref={pianoRef}
            >
              {bbox && (
                <PianoWidget
                  midiActiveNoteIndices={midiActive}
                  bbox={bbox}
                  onNotePress={onNotePress}
                  onNoteRelease={onNoteRelease}
                />
              )}
            </Div>
            <Recorder stream={recordStream} memoryLimitBytes={memoryLimit} />
          </>
        )}
        <ToastContainer />
      </Div>
    </Div>
  );
}

export default App;
