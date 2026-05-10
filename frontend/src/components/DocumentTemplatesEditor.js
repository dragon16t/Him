import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const API = "/api";

const TPL_KEYS = [
  { k: "welcome", l: "Welcome / Joining" },
  { k: "offer", l: "Offer Letter" },
  { k: "employment", l: "Employment Confirmation" },
  { k: "agreement", l: "Employment Agreement" },
  { k: "increment", l: "Increment Letter" },
  { k: "termination", l: "Termination Letter" },
  { k: "warning", l: "Warning Letter" },
  { k: "relieving", l: "Relieving Letter" },
  { k: "experience", l: "Experience Certificate" },
];

export default function DocumentTemplatesEditor({ open, onOpenChange }) {
  const [overrides, setOverrides] = useState([]);
  const [activeKey, setActiveKey] = useState("offer");
  const [form, setForm] = useState({ subject: "", body_html: "" });
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/hr/document-templates`);
      setOverrides(data.templates || []);
      const cur = (data.templates || []).find(t => t.key === activeKey);
      setForm({ subject: cur?.subject || "", body_html: cur?.body_html || "" });
    } catch {}
  }, [activeKey]);

  useEffect(() => { if (open) fetchAll(); }, [open, fetchAll]);

  const switchKey = async (k) => {
    setActiveKey(k);
    try {
      const { data } = await axios.get(`${API}/hr/document-templates/${k}`);
      setForm({ subject: data.template?.subject || "", body_html: data.template?.body_html || "" });
    } catch { setForm({ subject: "", body_html: "" }); }
  };

  const save = async () => {
    if (!form.body_html.trim()) { toast.error("Body HTML cannot be empty"); return; }
    setLoading(true);
    try {
      await axios.put(`${API}/hr/document-templates/${activeKey}`, form);
      toast.success("Template saved — will be used for future emails");
      fetchAll();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    setLoading(false);
  };

  const reset = async () => {
    if (!window.confirm("Revert to built-in default? Your custom version will be deleted.")) return;
    try {
      await axios.delete(`${API}/hr/document-templates/${activeKey}`);
      setForm({ subject: "", body_html: "" });
      fetchAll();
      toast.success("Reverted to built-in default");
    } catch { toast.error("Failed"); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-4xl max-h-[92vh] overflow-y-auto" data-testid="doc-templates-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">Document Templates Editor</DialogTitle>
          <p className="text-xs text-[#59615D] mt-1">Customise the HTML body for each HR letter. Use placeholders like {"{emp_name}, {position}, {salary}, {joining_date}, {department}, {effective_date}, {reason}, {today_date}, {company_name}"} — they will be auto-filled when the letter is sent. Only the updated/customised version will be sent to the candidate.</p>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-1 space-y-1">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-[#59615D] mb-2">Template</p>
            {TPL_KEYS.map(t => {
              const isOverride = overrides.some(o => o.key === t.k);
              return (
                <button key={t.k} onClick={() => switchKey(t.k)} className={`w-full text-left text-xs px-3 py-2 rounded-xl border transition-all ${activeKey === t.k ? "bg-[#3B5249] text-white border-[#3B5249]" : "bg-white border-[#E5E3DB] hover:bg-[#F9F8F6]"}`} data-testid={`tpl-key-${t.k}`}>
                  <div className="flex justify-between items-center">
                    <span>{t.l}</span>
                    {isOverride && <span className={`text-[8px] px-1.5 py-0.5 rounded ${activeKey === t.k ? "bg-white/20 text-white" : "bg-orange-100 text-orange-700"}`}>CUSTOM</span>}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="md:col-span-3 space-y-3">
            <div>
              <Label className="text-xs font-medium">Subject (optional override)</Label>
              <Input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Leave empty to use built-in subject" className="rounded-xl" data-testid="tpl-subject" />
            </div>
            <div>
              <Label className="text-xs font-medium">Body HTML</Label>
              <Textarea value={form.body_html} onChange={e => setForm(f => ({ ...f, body_html: e.target.value }))} placeholder="<p>Dear {emp_name},</p><p>...</p>" className="rounded-xl font-mono text-xs min-h-[320px]" data-testid="tpl-body" />
              <p className="text-[10px] text-[#59615D] mt-1">The system automatically wraps your HTML inside the company letterhead and footer with employment terms.</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={save} disabled={loading} className="rounded-full bg-[#3B5249] text-white" data-testid="tpl-save">{loading ? "Saving..." : "Save Template"}</Button>
              <Button variant="outline" onClick={reset} className="rounded-full border-orange-300 text-orange-600" data-testid="tpl-reset">Revert to Default</Button>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full">Close</Button>
            </div>
            <div className="rounded-xl bg-[#F9F8F6] border border-[#E5E3DB] p-3">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-[#3B5249] mb-1">Available Placeholders</p>
              <p className="text-[11px] text-[#2C3531] font-mono leading-relaxed">{"{emp_name} {position} {salary} {incentive} {joining_date} {effective_date} {department} {reporting_to} {old_salary} {new_salary} {reason} {details} {today_date} {company_name} {company_email} {company_phone} {company_address} {work_hours} {weekly_off}"}</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
