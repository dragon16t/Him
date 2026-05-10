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

const TERM_FIELDS = [
  { k: "work_hours", l: "Work Hours" },
  { k: "total_break", l: "Total Break" },
  { k: "lunch_break", l: "Lunch Break" },
  { k: "tea_breaks", l: "Tea Breaks" },
  { k: "friday_extra", l: "Friday Extra" },
  { k: "weekly_off", l: "Weekly Off" },
  { k: "probation", l: "Probation" },
  { k: "notice_period", l: "Notice Period" },
  { k: "leave_policy", l: "Leave Policy" },
];

export default function DocumentTemplatesEditor({ open, onOpenChange }) {
  const [tab, setTab] = useState("templates"); // "templates" | "terms"

  // ---------- Letter templates state ----------
  const [overrides, setOverrides] = useState([]);
  const [activeKey, setActiveKey] = useState("offer");
  const [form, setForm] = useState({ subject: "", body_html: "" });
  const [isDefault, setIsDefault] = useState(true);
  const [loading, setLoading] = useState(false);

  const loadTemplate = useCallback(async (k) => {
    try {
      const { data } = await axios.get(`${API}/hr/document-templates/${k}`);
      setForm({
        subject: data.template?.subject || "",
        body_html: data.template?.body_html || "",
      });
      setIsDefault(!!data.is_default);
    } catch {
      setForm({ subject: "", body_html: "" });
      setIsDefault(true);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/hr/document-templates`);
      setOverrides(data.templates || []);
    } catch {}
    await loadTemplate(activeKey);
  }, [activeKey, loadTemplate]);

  // ---------- Employment terms state ----------
  const [terms, setTerms] = useState({});
  const [termsDefaults, setTermsDefaults] = useState({});
  const [termsIsDefault, setTermsIsDefault] = useState(true);
  const [termsMeta, setTermsMeta] = useState({ updated_by_name: "", updated_at: "" });
  const [termsSaving, setTermsSaving] = useState(false);

  const fetchTerms = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/hr/employment-terms`);
      setTerms(data.terms || {});
      setTermsDefaults(data.defaults || {});
      setTermsIsDefault(!!data.is_default);
      setTermsMeta({ updated_by_name: data.updated_by_name || "", updated_at: data.updated_at || "" });
    } catch {}
  }, []);

  useEffect(() => {
    if (!open) return;
    if (tab === "templates") fetchAll();
    else fetchTerms();
  }, [open, tab, fetchAll, fetchTerms]);

  const switchKey = async (k) => {
    setActiveKey(k);
    await loadTemplate(k);
  };

  const save = async () => {
    if (!form.body_html.trim()) { toast.error("Body HTML cannot be empty"); return; }
    setLoading(true);
    try {
      await axios.put(`${API}/hr/document-templates/${activeKey}`, form);
      toast.success("Template saved — will be used for future emails");
      await fetchAll();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    setLoading(false);
  };

  const reset = async () => {
    if (!window.confirm("Revert to built-in default? Your custom version will be deleted.")) return;
    try {
      await axios.delete(`${API}/hr/document-templates/${activeKey}`);
      await fetchAll();
      toast.success("Reverted to built-in default");
    } catch { toast.error("Failed"); }
  };

  const saveTerms = async () => {
    for (const f of TERM_FIELDS) {
      if (!(terms[f.k] || "").trim()) { toast.error(`${f.l} cannot be empty`); return; }
    }
    setTermsSaving(true);
    try {
      await axios.put(`${API}/hr/employment-terms`, terms);
      toast.success("Standard employment terms updated — every future letter will use these");
      await fetchTerms();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    setTermsSaving(false);
  };

  const resetTerms = async () => {
    if (!window.confirm("Revert all 9 terms to built-in defaults?")) return;
    try {
      await axios.delete(`${API}/hr/employment-terms`);
      await fetchTerms();
      toast.success("Reverted to built-in defaults");
    } catch { toast.error("Failed"); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-4xl max-h-[92vh] overflow-y-auto" data-testid="doc-templates-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">Document Templates Editor</DialogTitle>
          <p className="text-xs text-[#59615D] mt-1">Customise the letter HTML and the standard employment terms shown at the bottom of every letter. Changes apply only to letters sent from now on.</p>
        </DialogHeader>

        {/* Tab switcher */}
        <div className="flex gap-2 border-b border-[#E5E3DB] mb-1">
          <button
            onClick={() => setTab("templates")}
            className={`text-xs font-semibold px-4 py-2 -mb-px border-b-2 transition-all ${tab === "templates" ? "border-[#3B5249] text-[#3B5249]" : "border-transparent text-[#59615D] hover:text-[#3B5249]"}`}
            data-testid="tab-templates"
          >Letter Templates</button>
          <button
            onClick={() => setTab("terms")}
            className={`text-xs font-semibold px-4 py-2 -mb-px border-b-2 transition-all ${tab === "terms" ? "border-[#3B5249] text-[#3B5249]" : "border-transparent text-[#59615D] hover:text-[#3B5249]"}`}
            data-testid="tab-terms"
          >Standard Employment Terms</button>
        </div>

        {tab === "templates" && (
          <>
            <p className="text-xs text-[#59615D]">Use placeholders like {"{emp_name}, {position}, {salary}, {joining_date}, {department}, {effective_date}, {reason}, {today_date}, {company_name}"} — they will be auto-filled when the letter is sent.</p>
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
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Body HTML</Label>
                    <span className={`text-[9px] px-2 py-0.5 rounded-full ${isDefault ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-orange-50 text-orange-700 border border-orange-200"}`} data-testid="tpl-status-badge">
                      {isDefault ? "BUILT-IN DEFAULT — editing will create a custom version" : "CUSTOM VERSION (in use)"}
                    </span>
                  </div>
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
          </>
        )}

        {tab === "terms" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs text-[#59615D]">These 9 lines are the "Standard Employment Terms" block that appears in the footer of every Welcome / Offer / Agreement letter. Edit them once here and every future letter will reflect the new values.</p>
              <span className={`text-[9px] px-2 py-0.5 rounded-full whitespace-nowrap ${termsIsDefault ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-orange-50 text-orange-700 border border-orange-200"}`} data-testid="terms-status-badge">
                {termsIsDefault ? "BUILT-IN DEFAULTS" : "CUSTOM (in use)"}
              </span>
            </div>
            {!termsIsDefault && termsMeta.updated_by_name && (
              <p className="text-[10px] text-[#59615D]">Last updated by <b>{termsMeta.updated_by_name}</b> on {new Date(termsMeta.updated_at).toLocaleString()}</p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {TERM_FIELDS.map(f => (
                <div key={f.k}>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">{f.l}</Label>
                    {termsDefaults[f.k] && terms[f.k] !== termsDefaults[f.k] && (
                      <button
                        type="button"
                        onClick={() => setTerms(t => ({ ...t, [f.k]: termsDefaults[f.k] }))}
                        className="text-[9px] text-orange-600 hover:underline"
                        data-testid={`term-reset-${f.k}`}
                      >reset to default</button>
                    )}
                  </div>
                  <Input
                    value={terms[f.k] || ""}
                    onChange={e => setTerms(t => ({ ...t, [f.k]: e.target.value }))}
                    placeholder={termsDefaults[f.k] || ""}
                    className="rounded-xl text-xs"
                    data-testid={`term-input-${f.k}`}
                  />
                  {termsDefaults[f.k] && terms[f.k] !== termsDefaults[f.k] && (
                    <p className="text-[10px] text-[#59615D] mt-1 italic truncate">Default: {termsDefaults[f.k]}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap pt-2">
              <Button onClick={saveTerms} disabled={termsSaving} className="rounded-full bg-[#3B5249] text-white" data-testid="terms-save">{termsSaving ? "Saving..." : "Save Terms"}</Button>
              <Button variant="outline" onClick={resetTerms} className="rounded-full border-orange-300 text-orange-600" data-testid="terms-reset">Revert All to Defaults</Button>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full">Close</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
