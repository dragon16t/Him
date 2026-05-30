import { useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const API = "/api";

/**
 * Voice-note recorder → uploads to /api/transcribe → returns text via onTranscribed callback.
 * Falls back gracefully when MediaRecorder is unavailable or backend lacks EMERGENT_LLM_KEY.
 */
export default function VoiceNoteButton({ onTranscribed, disabled = false, compact = false, label = "Voice note" }) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return toast.error("Mic not supported on this browser");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || "audio/webm" });
        if (blob.size < 1000) { toast.error("Recording too short"); return; }
        setBusy(true);
        try {
          const fd = new FormData();
          fd.append("file", blob, "voice.webm");
          const { data } = await axios.post(`${API}/transcribe`, fd, { headers: { "Content-Type": "multipart/form-data" } });
          if (data?.text) { onTranscribed?.(data.text); toast.success("Transcribed!"); }
          else toast.error("No text returned");
        } catch (e) { toast.error(e.response?.data?.detail || "Transcription unavailable"); }
        setBusy(false);
      };
      mediaRef.current = mr;
      mr.start();
      setRecording(true);
    } catch { toast.error("Mic permission denied"); }
  };

  const stop = () => { try { mediaRef.current?.stop(); } catch {} setRecording(false); };

  return (
    <Button
      type="button"
      size={compact ? "icon" : "sm"}
      variant={recording ? "default" : "outline"}
      onClick={recording ? stop : start}
      disabled={disabled || busy}
      className={`rounded-full ${recording ? "bg-red-600 text-white hover:bg-red-700 animate-pulse" : ""} ${compact ? "h-8 w-8" : ""}`}
      data-testid="voice-note-btn"
      aria-label={recording ? "Stop recording" : "Start voice note"}
      title={recording ? "Tap to stop" : label}
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
      {!compact && <span className="ml-1 text-xs">{busy ? "Processing…" : recording ? "Stop" : label}</span>}
    </Button>
  );
}
