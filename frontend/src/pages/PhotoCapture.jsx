/**
 * PhotoCapture (Customer-facing, no auth)
 * ---------------------------------------------------------------------------
 * URL: /photo-capture/:token
 *
 * Mobile-first 3-step camera flow (FRONT → LEFT → RIGHT) + optional BEFORE/AFTER.
 * Uses the browser <input capture> attribute so it opens the native camera on
 * phones. Falls back to file picker on desktops.
 *
 * Photos are uploaded directly to /api/customer-photos/:token/upload — no JWT
 * is required because the token IS the auth.
 */
import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Camera, Check, Loader2, AlertTriangle, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

const STEPS = [
  { id: "front", label: "Front", hint: "Face the camera, head straight" },
  { id: "left", label: "Left Side", hint: "Turn slowly to your right so the left of your face is visible" },
  { id: "right", label: "Right Side", hint: "Turn slowly to your left for the right side" },
];

const EXTRA_STEPS = [
  { id: "before", label: "Before (optional)", hint: "How your skin looks today" },
  { id: "after", label: "After (optional)", hint: "Progress photo (after 2 weeks of routine)" },
];

export default function PhotoCapture() {
  const { token } = useParams();
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const [stepIdx, setStepIdx] = useState(0);
  const [captured, setCaptured] = useState({}); // {front: dataURL, left: dataURL, ...}
  const [uploading, setUploading] = useState({});
  const [done, setDone] = useState(false);
  const fileRef = useRef({});

  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get(`${API}/customer-photos/session/${token}`);
        setSession(data.session);
      } catch (e) {
        setError(e?.response?.data?.detail || "Invalid or expired link");
      }
    })();
  }, [token]);

  const handleFile = async (kind, file) => {
    if (!file) return;
    // Show local preview
    const reader = new FileReader();
    reader.onload = () => setCaptured((p) => ({ ...p, [kind]: reader.result }));
    reader.readAsDataURL(file);
    // Upload
    setUploading((u) => ({ ...u, [kind]: true }));
    try {
      const fd = new FormData();
      fd.append("kind", kind);
      fd.append("file", file, file.name || `${kind}.jpg`);
      await axios.post(`${API}/customer-photos/${token}/upload`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(`${kind.toUpperCase()} uploaded`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    } finally {
      setUploading((u) => ({ ...u, [kind]: false }));
    }
  };

  const allDone = STEPS.every((s) => captured[s.id]);

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#FFF7EC] to-[#F4F0E6] flex items-center justify-center px-5">
        <div className="bg-white rounded-3xl border border-[#E5E3DB] shadow-xl p-8 max-w-md text-center">
          <AlertTriangle className="w-12 h-12 mx-auto text-[#B75D69] mb-4" />
          <h1 className="font-serif text-2xl text-[#2C3531] mb-2">Link Expired</h1>
          <p className="text-sm text-[#59615D]">{error}</p>
          <p className="text-xs text-[#7B6D5A] mt-4">Please ask the Celesta Glow team to send you a new link.</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#3B5249]" />
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#F0F9F4] to-white flex items-center justify-center px-5">
        <div className="bg-white rounded-3xl border border-[#D7F0DD] shadow-xl p-8 max-w-md text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-[#DCFCE7] flex items-center justify-center mb-4">
            <Check className="w-8 h-8 text-[#15803D]" strokeWidth={3} />
          </div>
          <h1 className="font-serif text-3xl text-[#15803D] mb-2">All set!</h1>
          <p className="text-sm text-[#59615D]">Your photos have been received. Our expert will reach out to you with a personalised skin plan soon.</p>
          <p className="text-xs text-[#7B6D5A] mt-5">Thank you for trusting Celesta Glow ✨</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FFF7EC] to-[#F4F0E6]" data-testid="photo-capture-page">
      <div className="max-w-md mx-auto px-5 py-6">
        {/* Brand header */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.18em] uppercase text-[#A66E4E] mb-2">
            <Sparkles className="w-3.5 h-3.5" /> Celesta Glow Skin Analysis
          </div>
          <h1 className="font-serif text-2xl text-[#2C3531]">
            {session.customer_name ? `Hi ${session.customer_name.split(" ")[0]}!` : "Welcome!"}
          </h1>
          <p className="text-[12px] text-[#59615D] mt-1">Please share 3 quick selfies so our expert can craft your personalised routine.</p>
        </div>

        {/* Step progress dots */}
        <div className="flex items-center justify-center gap-2 mb-5">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center" data-testid={`step-dot-${s.id}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                captured[s.id] ? "bg-[#15803D] text-white" : i === stepIdx ? "bg-[#3B5249] text-white" : "bg-white border border-[#E5E3DB] text-[#7B6D5A]"
              }`}>
                {captured[s.id] ? <Check className="w-3.5 h-3.5"/> : i + 1}
              </div>
              {i < STEPS.length - 1 && <div className={`w-7 h-0.5 ${captured[s.id] ? "bg-[#15803D]" : "bg-[#E5E3DB]"}`} />}
            </div>
          ))}
        </div>

        {/* Each step card */}
        {STEPS.map((step, i) => (
          <div key={step.id} className={`bg-white rounded-2xl border border-[#E5E3DB] p-4 mb-3 transition-all ${
            i === stepIdx ? "ring-2 ring-[#3B5249]/30 shadow-md" : "opacity-80"
          }`} data-testid={`step-card-${step.id}`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-[14px] text-[#2C3531]">{step.label}</h3>
              {captured[step.id] && <span className="text-[10px] text-[#15803D] font-medium inline-flex items-center"><Check className="w-3 h-3 mr-0.5"/>Done</span>}
            </div>
            <p className="text-[11px] text-[#7B6D5A] mb-3">{step.hint}</p>

            {captured[step.id] ? (
              <div className="relative">
                <img src={captured[step.id]} alt={step.label} className="w-full rounded-xl object-cover max-h-72"/>
                {uploading[step.id] && <div className="absolute inset-0 bg-black/30 rounded-xl flex items-center justify-center"><Loader2 className="w-8 h-8 text-white animate-spin"/></div>}
              </div>
            ) : (
              <input
                type="file"
                accept="image/*"
                capture="user"
                ref={(el) => (fileRef.current[step.id] = el)}
                onChange={(e) => handleFile(step.id, e.target.files?.[0])}
                className="hidden"
                data-testid={`file-input-${step.id}`}
              />
            )}

            <div className="flex gap-2 mt-3">
              <Button
                onClick={() => fileRef.current[step.id]?.click()}
                disabled={uploading[step.id]}
                variant={captured[step.id] ? "outline" : "default"}
                className={`flex-1 rounded-full h-11 ${captured[step.id] ? "border-[#3B5249] text-[#3B5249]" : "bg-[#3B5249] text-white"}`}
                data-testid={`capture-btn-${step.id}`}
              >
                <Camera className="w-4 h-4 mr-2"/>
                {captured[step.id] ? "Retake" : "Open Camera"}
              </Button>
              {captured[step.id] && i < STEPS.length - 1 && (
                <Button onClick={() => setStepIdx(i + 1)} variant="outline" className="rounded-full h-11 px-4 border-[#3B5249] text-[#3B5249]">
                  Next <ArrowRight className="w-4 h-4 ml-1"/>
                </Button>
              )}
            </div>
          </div>
        ))}

        {/* Optional extras */}
        <details className="mt-2 bg-white/60 rounded-2xl border border-[#E5E3DB] p-3">
          <summary className="text-[12px] font-medium text-[#3B5249] cursor-pointer">+ Add Before / After progress photos</summary>
          <div className="mt-3 space-y-3">
            {EXTRA_STEPS.map((step) => (
              <div key={step.id} className="bg-[#FBF7F0] rounded-xl p-3">
                <h3 className="text-[12px] font-medium text-[#2C3531]">{step.label}</h3>
                <p className="text-[10px] text-[#7B6D5A] mb-2">{step.hint}</p>
                {captured[step.id] && <img src={captured[step.id]} alt={step.label} className="w-full rounded-lg object-cover max-h-48 mb-2"/>}
                <input type="file" accept="image/*" capture="user" ref={(el) => (fileRef.current[step.id] = el)} onChange={(e) => handleFile(step.id, e.target.files?.[0])} className="hidden"/>
                <Button onClick={() => fileRef.current[step.id]?.click()} variant="outline" size="sm" className="rounded-full text-[11px] h-8 border-[#3B5249] text-[#3B5249]"><Camera className="w-3.5 h-3.5 mr-1.5"/>{captured[step.id] ? "Retake" : "Capture"}</Button>
              </div>
            ))}
          </div>
        </details>

        {/* Submit */}
        <div className="mt-5">
          <Button
            onClick={() => setDone(true)}
            disabled={!allDone}
            className="w-full rounded-full h-12 bg-gradient-to-r from-[#15803D] to-[#166534] text-white text-[13px] font-medium disabled:opacity-50"
            data-testid="finish-btn"
          >
            <Check className="w-4 h-4 mr-2"/>
            {allDone ? "Finish & Submit" : `Capture all 3 photos to finish (${Object.keys(captured).filter(k => STEPS.find(s => s.id === k)).length}/3)`}
          </Button>
          <p className="text-[10px] text-center text-[#7B6D5A] mt-2">Your photos are encrypted and only visible to your Celesta Glow consultant.</p>
        </div>
      </div>
    </div>
  );
}
