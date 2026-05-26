import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Download } from "lucide-react";

const API = "/api";

/** Per-day employee efficiency snapshot — used in HR & Admin dashboards. */
export default function HrEfficiencyPanel() {
  const [d, setD] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState({ employees: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [aiBusy, setAiBusy] = useState({});
  const [aiText, setAiText] = useState({});

  useEffect(() => {
    setLoading(true);
    axios.get(`${API}/hr/efficiency`, { params: { d } })
      .then(r => setData(r.data))
      .catch(e => toast.error(e.response?.data?.detail || "Failed"))
      .finally(() => setLoading(false));
  }, [d]);

  const generateAI = async (uid) => {
    setAiBusy(b => ({ ...b, [uid]: true }));
    try {
      const { data: res } = await axios.post(`${API}/admin/employee/${uid}/ai-summary`, { range_days: 7 });
      setAiText(a => ({ ...a, [uid]: res.summary }));
    } catch (e) { toast.error("AI failed"); }
    finally { setAiBusy(b => ({ ...b, [uid]: false })); }
  };

  const download = async (uid) => {
    try {
      const res = await axios.get(`${API}/reports/employee/${uid}.pdf?days=30`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a"); a.href = url; a.download = `employee-${uid}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { toast.error("Download failed"); }
  };

  const filtered = data.employees.filter(e => {
    if (roleFilter !== "all" && e.role !== roleFilter) return false;
    if (search && !`${e.name} ${e.role} ${e.phone}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const roles = [...new Set(data.employees.map(e => e.role))];

  return (
    <div className="space-y-3" data-testid="hr-efficiency-panel">
      <div className="bg-white rounded-2xl border border-[#E5E3DB] p-4 flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-heading text-lg font-medium">Employee Efficiency <span className="text-sm text-[#59615D]">· {filtered.length} of {data.total}</span></h3>
        <div className="flex items-center gap-2 flex-wrap">
          <Input type="date" value={d} onChange={e => setD(e.target.value)} className="rounded-xl h-8 text-xs w-40" data-testid="hr-eff-date" />
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="rounded-xl h-8 text-xs border border-[#E5E3DB] px-2" data-testid="hr-eff-role">
            <option value="all">All Roles</option>
            {roles.map(r => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
          </select>
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name/phone" className="rounded-xl h-8 text-xs w-48" data-testid="hr-eff-search" />
        </div>
      </div>

      {loading ? <p className="text-center py-8 text-[#59615D]">Loading…</p> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map(e => {
            const att = e.attendance_today || {};
            const isPresent = !!att.check_in;
            const lateMin = (() => {
              if (!att.check_in || att.check_in.length < 5) return 0;
              try { const [h, m] = att.check_in.split(":").map(Number); return Math.max(0, (h * 60 + m) - (9 * 60 + 30)); } catch { return 0; }
            })();
            return (
              <div key={e.id} className="rounded-xl border border-[#E5E3DB] bg-white p-4 hover:shadow-md transition" data-testid={`emp-eff-${e.id}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-heading font-semibold text-[#3B5249]">{e.name}</p>
                    <p className="text-[10px] text-[#59615D]">{e.role.replace(/_/g, " ").toUpperCase()} · {e.phone || "—"}</p>
                    <p className="text-[10px] text-[#59615D]">Joined: {e.joining_date || "—"}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {e.on_leave_today ? <Badge className="bg-amber-100 text-amber-800 text-[9px]">ON LEAVE</Badge> :
                      isPresent ? <Badge className="bg-green-100 text-green-800 text-[9px]">PRESENT · {att.check_in}</Badge> :
                        <Badge className="bg-red-100 text-red-800 text-[9px]">ABSENT</Badge>}
                    {lateMin > 0 && <Badge className="bg-orange-100 text-orange-800 text-[9px]">LATE {lateMin}m</Badge>}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div className="rounded-lg bg-[#F9F8F6] p-2 text-center">
                    <p className="text-[9px] text-[#59615D]">SALARY</p><p className="text-sm font-semibold text-[#3B5249]">Rs.{e.salary || 0}</p>
                  </div>
                  <div className="rounded-lg bg-[#F9F8F6] p-2 text-center">
                    <p className="text-[9px] text-[#59615D]">LEAVES TAKEN</p><p className="text-sm font-semibold text-[#3B5249]">{e.leaves_taken_total}</p>
                  </div>
                  <div className="rounded-lg bg-[#F9F8F6] p-2 text-center">
                    <p className="text-[9px] text-[#59615D]">HALF-DAYS</p><p className="text-sm font-semibold text-[#3B5249]">{e.half_days_total}</p>
                  </div>
                </div>
                {e.advances_pending_amount > 0 && (
                  <p className="text-[10px] text-[#B75D69] mt-2">⚠ Pending advances: Rs.{e.advances_pending_amount}</p>
                )}
                {e.tasks_today.length > 0 && (
                  <p className="text-[10px] text-[#59615D] mt-2">📋 {e.tasks_today.length} task entry today</p>
                )}
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={() => generateAI(e.id)} disabled={aiBusy[e.id]} className="rounded-full text-[10px] h-7 flex-1 bg-[#A66E4E] text-white" data-testid={`ai-${e.id}`}>
                    <Sparkles className="w-3 h-3 mr-1" />{aiBusy[e.id] ? "…" : aiText[e.id] ? "Regenerate" : "AI Summary"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => download(e.id)} className="rounded-full text-[10px] h-7" data-testid={`dl-${e.id}`}><Download className="w-3 h-3 mr-1" />PDF</Button>
                </div>
                {aiText[e.id] && <p className="mt-2 text-[10px] bg-[#FDF6F0] rounded-lg p-2 border border-[#E5E3DB] leading-relaxed">{aiText[e.id]}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
