import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShieldCheck, KeyRound } from "lucide-react";

const API = "/api";

/** Two-factor authentication setup (admin / finance / HR). */
export default function TotpSetupButton() {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState("idle"); // idle | qr | verify
  const [qr, setQr] = useState(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/auth/2fa/setup`);
      setQr(data);
      setStage("qr");
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    if (!/^\d{6}$/.test(code)) return toast.error("Enter 6-digit code");
    setBusy(true);
    try {
      await axios.post(`${API}/auth/2fa/verify`, { code });
      toast.success("2FA enabled ✓");
      setOpen(false); setStage("idle"); setQr(null); setCode("");
    } catch (e) { toast.error(e.response?.data?.detail || "Invalid code"); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => { setOpen(true); setStage("idle"); }}
        className="rounded-full text-xs border-[#3B5249] text-[#3B5249] hover:bg-[#3B5249] hover:text-white"
        data-testid="totp-setup-btn">
        <ShieldCheck className="w-3.5 h-3.5 mr-1"/>Enable 2FA
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader><DialogTitle className="font-heading flex items-center gap-2"><ShieldCheck className="w-5 h-5"/>Two-Factor Authentication</DialogTitle></DialogHeader>
          {stage === "idle" && (
            <div className="space-y-3">
              <p className="text-xs text-[#59615D]">Adds a second factor after password. Use Google Authenticator, Authy, or any TOTP app.</p>
              <Button onClick={start} disabled={busy} className="w-full rounded-full bg-[#3B5249] text-white">
                {busy ? "Starting…" : "Start Setup"}
              </Button>
            </div>
          )}
          {stage === "qr" && qr && (
            <div className="space-y-3">
              <p className="text-xs text-[#59615D]">Scan this QR with your authenticator app:</p>
              <div className="flex justify-center bg-white p-4 rounded-xl border border-[#E5E3DB]">
                <img src={qr.qr_data_uri} alt="2FA QR" className="w-48 h-48"/>
              </div>
              <p className="text-[10px] text-center text-[#59615D]">Or enter this code manually: <code className="text-[10px] font-mono bg-[#F9F8F6] px-2 py-1 rounded">{qr.secret}</code></p>
              <div>
                <Label className="text-xs flex items-center gap-1"><KeyRound className="w-3 h-3"/>Enter the 6-digit code from your app:</Label>
                <Input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456" className="rounded-xl text-center text-2xl tracking-widest font-mono" maxLength={6} data-testid="totp-code"/>
              </div>
              <Button onClick={verify} disabled={busy || code.length !== 6} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="totp-verify">
                {busy ? "Verifying…" : "Verify & Enable"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
