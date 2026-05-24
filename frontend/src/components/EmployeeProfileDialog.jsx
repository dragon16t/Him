/**
 * EmployeeProfileDialog — comprehensive single-employee profile viewer.
 * Used by Admin + HR Manager dashboards.
 *
 * Props:
 *   open, onOpenChange: dialog state
 *   employeeId: user_id to load (calls GET /api/employees/:id/profile)
 *
 * Features:
 *   - View ALL stored details (personal, bank, identity, employment, payroll, attendance)
 *   - Upload/replace photo (PUT /api/employees/:id/photo)
 *   - Download PDF (GET /api/employees/:id/profile/pdf)
 *   - Read-only fields except photo upload (edits done via the existing Edit dialog)
 */
import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, Download, User, Banknote, CalendarDays, Phone, Mail, BadgeCheck, Hash, Camera, X } from "lucide-react";
import { toast } from "sonner";

const Field = ({ label, value, icon: Icon }) => (
  <div className="flex items-start gap-2 py-1.5 border-b border-[#E5E3DB] dark:border-[#2d3530] last:border-0">
    {Icon && <Icon className="w-3.5 h-3.5 text-[#59615D] mt-0.5 shrink-0" aria-hidden="true" />}
    <div className="flex-1 min-w-0">
      <p className="text-[10px] text-[#A66E4E] uppercase tracking-wide font-medium">{label}</p>
      <p className="text-[12px] text-[#2C3531] dark:text-[#e8e6df] break-words">{value || "—"}</p>
    </div>
  </div>
);

export default function EmployeeProfileDialog({ open, onOpenChange, employeeId }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open || !employeeId) return;
    setLoading(true);
    axios.get(`/api/employees/${employeeId}/profile`)
      .then(r => setProfile(r.data))
      .catch(e => toast.error(e.response?.data?.detail || "Failed to load profile"))
      .finally(() => setLoading(false));
  }, [open, employeeId]);

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 800_000) {
      toast.error("Photo must be under 800KB"); e.target.value = ""; return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file"); e.target.value = ""; return;
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result;
      if (!dataUrl) return;
      setUploadingPhoto(true);
      try {
        await axios.put(`/api/employees/${employeeId}/photo`, { profile_image: dataUrl });
        setProfile(p => ({ ...p, user: { ...p.user, profile_image: dataUrl } }));
        toast.success("Photo updated");
      } catch (err) {
        toast.error(err.response?.data?.detail || "Upload failed");
      } finally { setUploadingPhoto(false); e.target.value = ""; }
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadPDF = async () => {
    setDownloading(true);
    try {
      const res = await axios.get(`/api/employees/${employeeId}/profile/pdf`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `employee_profile_${profile?.user?.name || employeeId}.pdf`.replace(/\s+/g, "_");
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      toast.success("PDF downloaded");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Download failed");
    } finally { setDownloading(false); }
  };

  const u = profile?.user || {};
  const initials = (u.name || "?").split(" ").map(s => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl"
        data-testid="employee-profile-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-heading">Employee Profile</DialogTitle>
          <DialogDescription className="sr-only">
            Complete personal, employment, salary and bank details for the selected employee. Use the upload button to change the photo or the PDF button to download a printable copy.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[#3B5249]" /></div>
        ) : !profile ? (
          <p className="text-center text-sm text-[#59615D] py-6">Profile not loaded.</p>
        ) : (
          <div className="space-y-4">
            {/* Header: photo + name + actions */}
            <div className="flex items-start gap-4 p-4 rounded-xl bg-[#F9F8F6] dark:bg-[#262f2c] border border-[#E5E3DB] dark:border-[#2d3530]">
              {/* Photo */}
              <div className="relative">
                {u.profile_image ? (
                  <img
                    src={u.profile_image}
                    alt={u.name || "employee"}
                    className="w-24 h-24 rounded-2xl object-cover border-2 border-[#E5E3DB] dark:border-[#2d3530] bg-white"
                    data-testid="employee-photo"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-2xl bg-[#3B5249] text-[#F4ECD2] flex items-center justify-center text-2xl font-bold border-2 border-[#E5E3DB] dark:border-[#2d3530]" data-testid="employee-photo-placeholder">
                    {initials}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[#3B5249] text-white flex items-center justify-center hover:opacity-90 disabled:opacity-50"
                  aria-label="Upload new photo"
                  data-testid="employee-photo-upload-btn"
                >
                  {uploadingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                </button>
                <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" data-testid="employee-photo-file-input" />
              </div>
              {/* Identity */}
              <div className="flex-1 min-w-0">
                <p className="font-heading font-semibold text-lg text-[#2C3531] dark:text-[#e8e6df] truncate">{u.name || "—"}</p>
                <p className="text-[11px] text-[#59615D] dark:text-[#a6a89f] uppercase tracking-wide">{(u.role || "").replace(/_/g, " ")}</p>
                <p className="text-[11px] text-[#59615D] dark:text-[#a6a89f] mt-1 flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" /> {u.email || "—"}</span>
                  <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" /> {u.phone || "—"}</span>
                </p>
                <p className="text-[10px] text-[#A66E4E] mt-1">ID: {u.id}</p>
              </div>
              {/* Actions */}
              <Button
                onClick={handleDownloadPDF}
                disabled={downloading}
                size="sm"
                className="rounded-full bg-[#3B5249] text-white hover:opacity-90"
                data-testid="employee-download-pdf-btn"
              >
                {downloading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
                PDF
              </Button>
            </div>

            {/* Personal */}
            <section>
              <h3 className="font-heading text-[12px] font-semibold text-[#3B5249] dark:text-[#A8C7B6] mb-2 flex items-center gap-1"><User className="w-3.5 h-3.5" /> Personal Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 px-3 py-2 rounded-xl border border-[#E5E3DB] dark:border-[#2d3530]">
                <Field label="Date of Birth" value={u.dob} icon={CalendarDays} />
                <Field label="Address" value={u.address} />
                <Field label="Emergency Contact" value={u.emergency_contact} icon={Phone} />
                <Field label="PAN Number" value={u.pan_number} icon={Hash} />
                <Field label="Aadhaar Number" value={u.aadhaar_number} icon={Hash} />
                <Field label="District / Area" value={`${u.district || "—"} / ${u.area || "—"}`} />
              </div>
            </section>

            {/* Employment */}
            <section>
              <h3 className="font-heading text-[12px] font-semibold text-[#3B5249] dark:text-[#A8C7B6] mb-2 flex items-center gap-1"><BadgeCheck className="w-3.5 h-3.5" /> Employment</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 px-3 py-2 rounded-xl border border-[#E5E3DB] dark:border-[#2d3530]">
                <Field label="Joining Date" value={u.joining_date} icon={CalendarDays} />
                <Field label="Role" value={(u.role || "").replace(/_/g, " ")} />
                <Field label="Reporting Manager" value={profile.manager?.name || u.managed_by} />
                <Field label="Account Created" value={(u.created_at || "").slice(0, 10)} />
                <Field label="Attendance (this month)" value={`${profile.attendance_this_month || 0} days`} />
                <Field label="Total Attendance" value={`${profile.attendance_total || 0} days`} />
              </div>
            </section>

            {/* Salary + Bank */}
            <section>
              <h3 className="font-heading text-[12px] font-semibold text-[#3B5249] dark:text-[#A8C7B6] mb-2 flex items-center gap-1"><Banknote className="w-3.5 h-3.5" /> Salary & Bank Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 px-3 py-2 rounded-xl border border-[#E5E3DB] dark:border-[#2d3530]">
                <Field label="Monthly Salary" value={u.salary ? `Rs.${Number(u.salary).toLocaleString("en-IN")}` : "—"} />
                <Field label="Incentive %" value={u.incentive != null ? `${u.incentive}%` : "—"} />
                <Field label="Bank Name" value={u.bank_name} />
                <Field label="Account Holder Name" value={u.bank_account_name} />
                <Field label="Account Number" value={u.bank_account_number} />
                <Field label="IFSC Code" value={u.bank_ifsc} />
                <Field label="UPI ID" value={u.upi_id} />
                <Field label="Cash on Hand" value={profile.cash_holder?.amount != null ? `Rs.${Number(profile.cash_holder.amount).toLocaleString("en-IN")}` : "—"} />
              </div>
            </section>

            {/* Payroll history */}
            {profile.payroll_history && profile.payroll_history.length > 0 && (
              <section>
                <h3 className="font-heading text-[12px] font-semibold text-[#3B5249] dark:text-[#A8C7B6] mb-2">Recent Payroll</h3>
                <div className="rounded-xl border border-[#E5E3DB] dark:border-[#2d3530] divide-y divide-[#E5E3DB] dark:divide-[#2d3530]">
                  {profile.payroll_history.slice(0, 6).map((p, idx) => (
                    <div key={p.id || idx} className="flex items-center justify-between px-3 py-2 text-[12px]" data-testid={`payroll-row-${idx}`}>
                      <span className="text-[#59615D] dark:text-[#a6a89f]">{p.month}/{p.year}</span>
                      <span className="font-medium text-[#2C3531] dark:text-[#e8e6df]">Rs.{Number(p.net_pay || 0).toLocaleString("en-IN")}</span>
                      <span className="text-[10px] uppercase tracking-wide text-[#A66E4E]">{p.status || "—"}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Recent commissions */}
            {profile.commissions_recent && profile.commissions_recent.length > 0 && (
              <section>
                <h3 className="font-heading text-[12px] font-semibold text-[#3B5249] dark:text-[#A8C7B6] mb-2">Recent Commissions</h3>
                <div className="rounded-xl border border-[#E5E3DB] dark:border-[#2d3530] divide-y divide-[#E5E3DB] dark:divide-[#2d3530]">
                  {profile.commissions_recent.slice(0, 5).map((c, idx) => (
                    <div key={c.id || idx} className="flex items-center justify-between px-3 py-2 text-[12px]">
                      <span className="text-[#59615D] dark:text-[#a6a89f]">{(c.created_at || "").slice(0, 10)}</span>
                      <span className="font-medium text-[#2C3531] dark:text-[#e8e6df]">Rs.{Number(c.commission_amount || 0).toLocaleString("en-IN")}</span>
                      <span className="text-[10px] uppercase tracking-wide text-[#A66E4E]">{c.status || "—"}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
