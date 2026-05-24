import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sparkles, Download, X, Clock, IndianRupee, TrendingUp, Calendar, Phone, Package } from "lucide-react";

const API = "/api";

const Stat = ({ label, value, sub, color = "#3B5249", icon: Icon }) => (
  <div className="rounded-xl border border-[#E5E3DB] bg-gradient-to-br from-white to-[#F9F8F6] p-3" data-testid={`emp360-stat-${label.toLowerCase().replace(/\s/g,'-')}`}>
    <div className="flex items-center justify-between">
      <p className="text-[10px] uppercase tracking-wider text-[#59615D]">{label}</p>
      {Icon && <Icon className="w-3.5 h-3.5" style={{ color }} />}
    </div>
    <p className="font-heading text-xl font-semibold mt-1" style={{ color }}>{value}</p>
    {sub && <p className="text-[10px] text-[#59615D] mt-0.5">{sub}</p>}
  </div>
);

/** Slide-in drawer showing full 360° view of an employee. Used in Admin Employees tab. */
export default function EmployeeDetailDrawer({ employeeId, onClose }) {
  const [data, setData] = useState(null);
  const [range, setRange] = useState(30);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState("");

  useEffect(() => {
    if (!employeeId) return;
    setLoading(true);
    axios.get(`${API}/admin/employee/${employeeId}/360?range_days=${range}`)
      .then(r => setData(r.data))
      .catch(e => toast.error(e.response?.data?.detail || "Failed to load"))
      .finally(() => setLoading(false));
  }, [employeeId, range]);

  const generateAI = async () => {
    setAiLoading(true);
    try {
      const { data: res } = await axios.post(`${API}/admin/employee/${employeeId}/ai-summary`, { range_days: range });
      setAiSummary(res.summary);
    } catch (e) { toast.error("AI summary failed"); }
    finally { setAiLoading(false); }
  };

  const downloadReport = async () => {
    try {
      const res = await axios.get(`${API}/reports/employee/${employeeId}.pdf?days=${range}`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a"); a.href = url; a.download = `employee-${employeeId}-${range}d.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { toast.error("Download failed"); }
  };

  if (!employeeId) return null;

  return (
    <Dialog open={!!employeeId} onOpenChange={(o) => !o && onClose && onClose()}>
      <DialogContent className="rounded-2xl max-w-4xl max-h-[92vh] overflow-y-auto p-0" data-testid="emp-360-drawer">
        {loading || !data ? (
          <div className="p-12 text-center text-[#59615D]"><div className="w-8 h-8 border-2 border-[#3B5249] border-t-transparent rounded-full animate-spin mx-auto mb-3" />Loading 360°…</div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-gradient-to-br from-[#3B5249] to-[#2C3531] text-white p-5 rounded-t-2xl">
              <div className="flex items-start justify-between">
                <div>
                  <DialogHeader><DialogTitle className="text-white text-2xl font-heading">{data.user.name}</DialogTitle></DialogHeader>
                  <p className="text-xs opacity-80 mt-1">{(data.user.role || "").replace(/_/g, " ").toUpperCase()} · {data.user.email}</p>
                  <p className="text-[11px] opacity-70 mt-0.5">Joined: {data.user.joining_date || (data.user.created_at || "").slice(0, 10) || "—"} · Phone: {data.user.phone || "—"}</p>
                </div>
                <div className="flex gap-2">
                  <select value={range} onChange={e => setRange(Number(e.target.value))} className="bg-white/10 border border-white/30 rounded-full px-3 py-1 text-xs">
                    {[7, 30, 90, 365].map(n => <option key={n} value={n} className="text-black">Last {n}d</option>)}
                  </select>
                  <Button size="sm" variant="ghost" onClick={onClose} className="text-white hover:bg-white/10 rounded-full"><X className="w-4 h-4" /></Button>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* KPI Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="Leads" value={data.kpis.leads} icon={Phone} />
                <Stat label="Calls" value={data.kpis.calls} icon={Phone} />
                <Stat label="Orders" value={data.kpis.orders} sub={`${data.kpis.delivered} delivered`} icon={Package} />
                <Stat label="Conversion" value={`${data.kpis.conversion}%`} color="#A66E4E" icon={TrendingUp} />
                <Stat label="Revenue" value={`Rs.${Math.round(data.kpis.revenue).toLocaleString()}`} icon={IndianRupee} color="#6B8E6B" />
                <Stat label="Commission" value={`Rs.${Math.round(data.kpis.commission_total).toLocaleString()}`} sub={`Rs.${Math.round(data.kpis.commission_paid)} paid`} icon={IndianRupee} />
                <Stat label="Days Present" value={data.attendance.days_present} sub={`${data.attendance.on_time_days} on-time`} icon={Calendar} />
                <Stat label="Late Hours" value={`${data.attendance.late_hours_total}h`} sub={`${data.attendance.half_days} half-days`} color="#B75D69" icon={Clock} />
              </div>

              {/* AI Summary */}
              <div className="rounded-xl border-2 border-dashed border-[#A66E4E] bg-gradient-to-br from-[#FDF6F0] to-white p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-heading text-sm text-[#3B5249] flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-[#A66E4E]" />AI Performance Summary</p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={generateAI} disabled={aiLoading} className="rounded-full text-[10px] h-7 bg-[#A66E4E] text-white" data-testid="ai-summary-btn">{aiLoading ? "Generating…" : aiSummary ? "Regenerate" : "Generate"}</Button>
                    <Button size="sm" variant="outline" onClick={downloadReport} className="rounded-full text-[10px] h-7" data-testid="emp-report-pdf"><Download className="w-3 h-3 mr-1" />PDF</Button>
                  </div>
                </div>
                {aiSummary ? <p className="text-xs leading-relaxed text-[#2C3531] bg-white rounded-lg p-3 border border-[#E5E3DB]">{aiSummary}</p> : <p className="text-[11px] text-[#59615D] italic">Click Generate to get an AI-written performance summary covering KPIs, attendance, leaves and a recommendation.</p>}
              </div>

              {/* Attendance heatmap (last 30 days) */}
              {data.attendance.records?.length > 0 && (
                <div className="rounded-xl border border-[#E5E3DB] bg-white p-4">
                  <p className="font-heading text-sm text-[#3B5249] mb-2">Attendance · Last {range}d</p>
                  <div className="flex flex-wrap gap-1">
                    {data.attendance.records.slice(-60).map((a, i) => (
                      <div key={i} title={`${a.date} · ${a.check_in || '—'} → ${a.check_out || '—'}`}
                        className={`w-6 h-6 rounded text-[8px] flex items-center justify-center font-semibold ${
                          (a.status || "").toLowerCase() === "half_day" ? "bg-orange-200 text-orange-900" :
                          a.check_in ? "bg-green-200 text-green-900" : "bg-gray-100 text-gray-500"
                        }`}>{(a.date || "").slice(-2)}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* Leaves + Advances + Today tasks side-by-side */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-xl border border-[#E5E3DB] bg-white p-3">
                  <p className="font-heading text-xs text-[#3B5249] mb-2">Leaves ({data.leaves.length})</p>
                  {data.leaves.length === 0 ? <p className="text-[11px] text-[#59615D]">None taken</p> : (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {data.leaves.slice(0, 8).map(lv => (
                        <div key={lv.id} className="text-[10px] flex items-center justify-between">
                          <span>{lv.leave_type || "Leave"} · {lv.start_date}{lv.end_date && lv.end_date !== lv.start_date ? ` → ${lv.end_date}` : ""}</span>
                          <Badge variant="outline" className="text-[9px]">{lv.status || "approved"}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-[#E5E3DB] bg-white p-3">
                  <p className="font-heading text-xs text-[#3B5249] mb-2">Advances ({data.advances.length})</p>
                  {data.advances.length === 0 ? <p className="text-[11px] text-[#59615D]">None</p> : (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {data.advances.slice(0, 8).map(a => (
                        <div key={a.id} className="text-[10px] flex items-center justify-between">
                          <span>Rs.{a.amount} · {(a.created_at || "").slice(0, 10)}</span>
                          <Badge className={`text-[9px] ${a.status === "approved" ? "bg-green-100 text-green-800" : a.status === "rejected" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}`}>{a.status || "pending"}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-[#E5E3DB] bg-white p-3">
                  <p className="font-heading text-xs text-[#3B5249] mb-2">Today's Tasks ({data.today_tasks.length})</p>
                  {data.today_tasks.length === 0 ? <p className="text-[11px] text-[#59615D]">No tasks logged today</p> : (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {data.today_tasks.map(t => (
                        <div key={t.id} className="text-[10px]">
                          <span className="font-semibold">{(t.tasks || []).length}</span> tasks · {t.notes ? t.notes.slice(0, 40) : "—"}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Payroll history */}
              {data.payroll_history?.length > 0 && (
                <div className="rounded-xl border border-[#E5E3DB] bg-white p-3">
                  <p className="font-heading text-xs text-[#3B5249] mb-2">Payroll History</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {data.payroll_history.slice(0, 8).map(p => (
                      <div key={p.id} className="rounded-lg bg-[#F9F8F6] p-2">
                        <p className="text-[10px] text-[#59615D]">{p.month}/{p.year}</p>
                        <p className="text-sm font-semibold text-[#3B5249]">Rs.{p.net_payable || p.salary || 0}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
