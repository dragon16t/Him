import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileDown, Eye, Mail, FileText, BadgeCheck, Award, AlertTriangle, FileSignature, TrendingUp, LogOut } from "lucide-react";

const API = "/api";

// Letter catalogue with icons + which extra inputs they need
const LETTERS = [
  { k: "welcome",     l: "Welcome / Joining Letter",  Icon: BadgeCheck,    needs: ["joining_date"] },
  { k: "offer",       l: "Offer Letter",              Icon: Mail,          needs: ["joining_date"] },
  { k: "employment",  l: "Employment Confirmation",   Icon: FileText,      needs: ["effective_date"] },
  { k: "agreement",   l: "Employment Agreement",      Icon: FileSignature, needs: ["joining_date"] },
  { k: "increment",   l: "Increment Letter",          Icon: TrendingUp,    needs: ["old_salary", "new_salary", "effective_date"] },
  { k: "warning",     l: "Warning Letter",            Icon: AlertTriangle, needs: ["reason", "details"] },
  { k: "termination", l: "Termination Letter",        Icon: LogOut,        needs: ["effective_date", "reason"] },
  { k: "relieving",   l: "Relieving Letter",          Icon: LogOut,        needs: ["joining_date", "effective_date", "reason"] },
  { k: "experience",  l: "Experience Certificate",    Icon: Award,         needs: ["joining_date", "effective_date"] },
];

const ROLE_LABEL = (r = "") => r.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

export default function EmployeeDocumentsDialog({ open, onOpenChange, employee }) {
  const [activeLetter, setActiveLetter] = useState("agreement");
  const [extras, setExtras] = useState({});
  const [busy, setBusy] = useState(false);
  const [templateInfo, setTemplateInfo] = useState({ source: "default", role: "", subject: "" });

  useEffect(() => {
    if (!open || !employee) return;
    setExtras({
      joining_date: employee.joining_date || (employee.created_at || "").slice(0, 10) || "",
      effective_date: new Date().toISOString().slice(0, 10),
      old_salary: employee.salary || 0,
      new_salary: (employee.salary || 0) + 1000,
      reason: "",
      details: "",
    });
  }, [open, employee]);

  useEffect(() => {
    if (!open || !employee?.role) return;
    const key = `${employee.role}:${activeLetter}`;
    axios.get(`${API}/hr/document-templates/${key}`)
      .then(({ data }) => setTemplateInfo({
        source: data.source || "default",
        role: employee.role,
        subject: data.template?.subject || "",
      }))
      .catch(() => setTemplateInfo({ source: "default", role: employee.role, subject: "" }));
  }, [open, employee, activeLetter]);

  if (!employee) return null;

  const buildQuery = () => {
    const params = new URLSearchParams({ letter_key: activeLetter, employee_id: employee.id });
    Object.entries(extras).forEach(([k, v]) => { if (v !== "" && v !== null && v !== undefined) params.append(k, v); });
    return params.toString();
  };

  const openInTab = async (mode) => {
    setBusy(true);
    try {
      const url = `${API}/hr/document/${mode}?${buildQuery()}`;
      // Use axios to fetch with auth header, then create a blob URL so the browser inherits the auth context
      const { data } = await axios.get(url, { responseType: "blob" });
      const blobUrl = URL.createObjectURL(new Blob([data], { type: "text/html" }));
      if (mode === "preview") {
        const w = window.open(blobUrl, "_blank");
        if (!w) toast.error("Pop-up blocked — allow pop-ups for this site");
        else toast.success("Letter opened in new tab — click 'Print / Save as PDF' to download");
      } else {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `${employee.role}_${activeLetter}_${(employee.name || "employee").replace(/\s+/g, "_")}.html`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast.success("Letter downloaded — open it and use Print > Save as PDF to share");
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to generate letter");
    }
    setBusy(false);
  };

  const sendEmail = async () => {
    if (!employee.email) { toast.error("Employee has no email on record"); return; }
    setBusy(true);
    try {
      await axios.post(`${API}/hr/send-email`, {
        template: activeLetter,
        to_email: employee.email,
        emp_name: employee.name,
        emp_role: employee.role,        // ← picks up the role-specific override
        position: ROLE_LABEL(employee.role),
        salary: employee.salary || 0,
        incentive: employee.incentive || 0,
        department: ROLE_LABEL(employee.role),
        reporting_to: employee.managed_by_name || "Reporting Manager",
        joining_date: extras.joining_date,
        effective_date: extras.effective_date,
        old_salary: extras.old_salary,
        new_salary: extras.new_salary,
        reason: extras.reason,
        details: extras.details,
      });
      toast.success(`Letter emailed to ${employee.email}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Email failed (SMTP may not be configured)");
    }
    setBusy(false);
  };

  const cur = LETTERS.find(l => l.k === activeLetter) || LETTERS[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-4xl max-h-[92vh] overflow-y-auto" data-testid="emp-documents-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <FileDown className="w-5 h-5 text-[#3B5249]" />
            Documents — {employee.name}
          </DialogTitle>
          <DialogDescription className="text-xs text-[#59615D] mt-1">
            Role: <b className="text-[#3B5249]">{ROLE_LABEL(employee.role)}</b> · Letters are generated using the template specific to this role (or fall back to the global / built-in default).
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Letter list */}
          <div className="md:col-span-1 space-y-1.5" data-testid="emp-doc-letters">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-[#59615D] mb-1">Letter Type</p>
            {LETTERS.map(({ k, l, Icon }) => (
              <button
                key={k}
                onClick={() => setActiveLetter(k)}
                data-testid={`emp-doc-letter-${k}`}
                className={`w-full text-left text-xs px-3 py-2 rounded-xl border transition-all flex items-center gap-2 ${activeLetter === k ? "bg-[#3B5249] text-white border-[#3B5249]" : "bg-white border-[#E5E3DB] hover:bg-[#F9F8F6]"}`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{l}</span>
              </button>
            ))}
          </div>

          {/* Letter form + actions */}
          <div className="md:col-span-2 space-y-3">
            <div className={`rounded-xl px-3 py-2 text-[11px] flex items-start gap-2 ${
              templateInfo.source === "role_override" ? "bg-emerald-50 border border-emerald-200 text-emerald-800" :
              templateInfo.source === "inherited_global" ? "bg-amber-50 border border-amber-200 text-amber-800" :
              templateInfo.source === "global_override" ? "bg-blue-50 border border-blue-200 text-blue-800" :
              "bg-slate-50 border border-slate-200 text-slate-700"
            }`} data-testid="emp-doc-template-source">
              <FileSignature className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>
                {templateInfo.source === "role_override" ? <>Using <b>{ROLE_LABEL(employee.role)}-specific</b> version of this letter (set by HR).</> :
                 templateInfo.source === "inherited_global" ? <>No {ROLE_LABEL(employee.role)} override — using the <b>global custom</b> version.</> :
                 templateInfo.source === "global_override" ? <>Using the <b>global custom</b> version (no role-specific override exists).</> :
                 <>Using the <b>built-in default</b> for this letter. HR can create a role-specific version from <b>Document Templates Editor</b>.</>}
              </span>
            </div>

            {/* Dynamic input fields based on letter type */}
            <div className="grid grid-cols-2 gap-3">
              {cur.needs.includes("joining_date") && (
                <div>
                  <Label className="text-[11px]">Date of Joining</Label>
                  <Input type="date" value={extras.joining_date || ""} onChange={e => setExtras(x => ({ ...x, joining_date: e.target.value }))} className="rounded-xl text-xs" data-testid="emp-doc-joining-date"/>
                </div>
              )}
              {cur.needs.includes("effective_date") && (
                <div>
                  <Label className="text-[11px]">Effective Date</Label>
                  <Input type="date" value={extras.effective_date || ""} onChange={e => setExtras(x => ({ ...x, effective_date: e.target.value }))} className="rounded-xl text-xs" data-testid="emp-doc-effective-date"/>
                </div>
              )}
              {cur.needs.includes("old_salary") && (
                <div>
                  <Label className="text-[11px]">Previous Monthly Salary (Rs)</Label>
                  <Input type="number" value={extras.old_salary ?? ""} onChange={e => setExtras(x => ({ ...x, old_salary: e.target.value }))} className="rounded-xl text-xs" data-testid="emp-doc-old-salary"/>
                </div>
              )}
              {cur.needs.includes("new_salary") && (
                <div>
                  <Label className="text-[11px]">Revised Monthly Salary (Rs)</Label>
                  <Input type="number" value={extras.new_salary ?? ""} onChange={e => setExtras(x => ({ ...x, new_salary: e.target.value }))} className="rounded-xl text-xs" data-testid="emp-doc-new-salary"/>
                </div>
              )}
              {cur.needs.includes("reason") && (
                <div className="col-span-2">
                  <Label className="text-[11px]">Reason / Subject</Label>
                  <Input value={extras.reason || ""} onChange={e => setExtras(x => ({ ...x, reason: e.target.value }))} placeholder="Brief reason or subject line" className="rounded-xl text-xs" data-testid="emp-doc-reason"/>
                </div>
              )}
              {cur.needs.includes("details") && (
                <div className="col-span-2">
                  <Label className="text-[11px]">Additional Details</Label>
                  <Input value={extras.details || ""} onChange={e => setExtras(x => ({ ...x, details: e.target.value }))} placeholder="Specific incident / context" className="rounded-xl text-xs" data-testid="emp-doc-details"/>
                </div>
              )}
            </div>

            {/* Employee summary card */}
            <div className="rounded-xl bg-[#F9F8F6] border border-[#E5E3DB] p-3 text-[11px] grid grid-cols-2 gap-x-4 gap-y-1">
              <span><b className="text-[#3B5249]">Name:</b> {employee.name}</span>
              <span><b className="text-[#3B5249]">Email:</b> {employee.email || "—"}</span>
              <span><b className="text-[#3B5249]">Phone:</b> {employee.phone || "—"}</span>
              <span><b className="text-[#3B5249]">Salary:</b> Rs. {(employee.salary || 0).toLocaleString()}</span>
              <span><b className="text-[#3B5249]">Position:</b> {ROLE_LABEL(employee.role)}</span>
              <span><b className="text-[#3B5249]">Reports to:</b> {employee.managed_by_name || "—"}</span>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={() => openInTab("preview")} disabled={busy} variant="outline" className="rounded-full text-xs border-[#3B5249] text-[#3B5249]" data-testid="emp-doc-preview-btn">
                <Eye className="w-3.5 h-3.5 mr-1" />Preview
              </Button>
              <Button onClick={() => openInTab("download")} disabled={busy} className="rounded-full text-xs bg-[#3B5249] text-white" data-testid="emp-doc-download-btn">
                <FileDown className="w-3.5 h-3.5 mr-1" />Download Letter
              </Button>
              <Button onClick={sendEmail} disabled={busy || !employee.email} variant="outline" className="rounded-full text-xs border-[#A66E4E] text-[#A66E4E]" data-testid="emp-doc-email-btn">
                <Mail className="w-3.5 h-3.5 mr-1" />Email to {employee.email ? "Employee" : "—"}
              </Button>
              <Button onClick={() => onOpenChange(false)} variant="outline" className="rounded-full text-xs">Close</Button>
            </div>
            <p className="text-[10px] text-[#59615D] italic">Downloaded letters open as printable HTML — use your browser's <b>Print → Save as PDF</b> for a signed-ready file. The letter includes a wet-signature block for both employee and HR.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
