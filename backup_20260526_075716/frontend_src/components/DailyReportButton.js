import { useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Mail, FileText } from "lucide-react";
import { toast } from "sonner";

const API = "/api";

/** Daily Report PDF download + Email-to-anyone.
 *  Backend scopes the report automatically based on JWT role.
 */
export default function DailyReportButton({ defaultEmail = "shadnazar123@gmail.com", className = "" }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState(new Date().toISOString().slice(0, 10));
  const [email, setEmail] = useState(defaultEmail);
  const [sending, setSending] = useState(false);

  const download = async () => {
    try {
      const res = await axios.get(`${API}/reports/daily.pdf?d=${d}`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = `daily-${d}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Download failed");
    }
  };

  const send = async () => {
    if (!email) return toast.error("Email required");
    setSending(true);
    try {
      const { data } = await axios.post(`${API}/reports/daily/send`, { email, date: d });
      toast.success(data.message);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Send failed");
    } finally { setSending(false); }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}
        className={`rounded-full bg-[#A66E4E] hover:bg-[#8E5A3F] text-white text-xs ${className}`}
        data-testid="daily-report-btn">
        <FileText className="w-3.5 h-3.5 mr-1" />
        Daily Report
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader><DialogTitle className="font-heading">Daily Report</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-[#59615D]">Generates a PDF scoped to your role — leads, orders, revenue, lead-status distribution and per-employee performance for the selected day.</p>
            <div><Label className="text-xs">Date</Label>
              <Input type="date" value={d} onChange={e => setD(e.target.value)} className="rounded-xl" data-testid="report-date" />
            </div>
            <div><Label className="text-xs">Email To</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} className="rounded-xl" placeholder="you@example.com" data-testid="report-email" />
            </div>
            <div className="flex gap-2">
              <Button onClick={download} className="flex-1 rounded-full bg-[#3B5249] text-white" data-testid="report-download">
                <Download className="w-3.5 h-3.5 mr-1" /> Download PDF
              </Button>
              <Button onClick={send} disabled={sending} className="flex-1 rounded-full bg-[#A66E4E] text-white" data-testid="report-send">
                <Mail className="w-3.5 h-3.5 mr-1" /> {sending ? "Sending…" : "Email"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
