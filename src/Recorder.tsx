import { useCallback, useEffect, useRef, useState } from "react";

export interface RecorderProps {
  stream: MediaStream | null;
  memoryLimitBytes: number;
}

export default function Recorder({ stream, memoryLimitBytes }: RecorderProps) {
  const [recording, setRecording] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sizeRef = useRef(0);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  const start = useCallback(() => {
    if (!stream) return;
    if (recording) return;
    chunksRef.current = [];
    sizeRef.current = 0;
    const mr = new MediaRecorder(stream);
    mr.ondataavailable = (e) => {
      if (!e.data || e.data.size === 0) return;
      const nextSize = sizeRef.current + e.data.size;
      if (nextSize > memoryLimitBytes) {
        mr.stop();
        return;
      }
      chunksRef.current.push(e.data);
      sizeRef.current = nextSize;
    };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mr.mimeType });
      if (url) URL.revokeObjectURL(url);
      setUrl(URL.createObjectURL(blob));
      setRecording(false);
    };
    mr.start();
    mediaRecorderRef.current = mr;
    setRecording(true);
  }, [stream, memoryLimitBytes, recording, url]);

  const stop = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <button onClick={recording ? stop : start} disabled={!stream}>
        {recording ? "Stop Recording" : "Start Recording"}
      </button>
      {url && (
        <audio controls src={url} />
      )}
    </div>
  );
}

