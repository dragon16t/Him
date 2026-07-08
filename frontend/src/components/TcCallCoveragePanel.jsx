/**
 * TcCallCoveragePanel.jsx — per-TC call-coverage rollup for a Sales Manager.
 *
 * "How many leads did each TC actually dial today, out of the total assigned to them?"
 * Sorted so under-performers (low coverage %) surface at the top.
 *
 * Used on:
 *   - SalesManagerDashboard (SM sees their own team, sm_id auto-injected server-side)
 *   - AdminCRMPanel        (admin sees any SM via the picker)
 *
 * Prop `smId` — when provided, the caller pins the SM. Otherwise defaults to server-side (SM).
 */
import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Users, PhoneCall, AlarmClock } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

const coverageTone = (pct) => {
  if (pct >= 70) return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (pct >= 40) return "bg-amber-100 text-amber-800 border-amber-300";
  return "bg-red-100 text-red-800 border-red-300";
};

export default function TcCallCoveragePanel({ smId: pinnedSmId, adminPicker = false }) {
  const [smId, setSmId] = useState(pinnedSmId || "");
  const [sms, setSms] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = smId ? { sm_id: smId } : {};
      const { data } = await axios.get(`${API}/sm/tc-call-coverage`, { params });
      setData(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to load call coverage");
    }
    setLoading(false);
  }, [smId]);
  useEffect(() => { fetchData(); }, [fetchData]);

  // Admin picker — fetch SM list once
  useEffect(() => {
    if (!adminPicker) return;
    axios.get(`${API}/sales-managers`).then(r => {
      const list = r.data.sales_managers || r.data.users || [];
      setSms(list);
      if (!smId && list.length) setSmId(list[0].id);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminPicker]);

  const rows = data?.telecallers || [];
  const t = data?.team_totals || {};

  return (
    <div className="space-y-3" data-testid="tc-coverage-panel">
      <div className="bg-white rounded-2xl border border-[#E5E3DB] p-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-sm font-heading text-[#2C3531]"><PhoneCall className="w-4 h-4 text-[#3B5249]"/>Numbers Assigned vs Called Today</div>
        {adminPicker && (
          <Select value={smId} onValueChange={setSmId}>
            <SelectTrigger className="rounded-full h-8 text-xs w-56" data-testid="tc-cov-sm-picker"><SelectValue placeholder="Pick Sales Manager"/></SelectTrigger>
            <SelectContent>{sms.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <div className="ml-auto flex items-center gap-2 flex-wrap text-[10px] text-[#7B6D5A]">
          <span>📅 {data?.date}</span>
          {data?.sm_name && <span>· 🎯 {data.sm_name}</span>}
          <Button size="sm" variant="outline" className="rounded-full h-7 text-[10px]" onClick={fetchData} disabled={loading} data-testid="tc-cov-refresh">↻ Refresh</Button>
        </div>
      </div>

      {/* Team-level KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2" data-testid="tc-cov-summary">
        <KpiCard icon={<Users className="w-3 h-3"/>} label="Team size" value={t.team_size ?? 0} tone="bg-[#3B5249]/10 text-[#3B5249]"/>
        <KpiCard label="Numbers assigned" value={t.assigned_leads ?? 0} tone="bg-blue-100 text-blue-800"/>
        <KpiCard icon={<PhoneCall className="w-3 h-3"/>} label="Called today" value={t.called_today ?? 0} tone="bg-emerald-100 text-emerald-800"/>
        <KpiCard label="Team coverage" value={`${t.coverage_pct ?? 0}%`} tone={coverageTone(t.coverage_pct ?? 0)}/>
        <KpiCard icon={<AlarmClock className="w-3 h-3"/>} label="Untouched > 72h" value={t.untouched_72h ?? 0} tone={((t.untouched_72h ?? 0) > 0 ? "bg-red-100 text-red-800" : "bg-white")}/>
      </div>

      {loading ? (
        <p className="text-center py-8 text-[#7B6D5A] text-sm">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E5E3DB] p-6 text-center text-[#7B6D5A] text-sm" data-testid="tc-cov-empty">
          No telecallers under this manager yet.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#E5E3DB] overflow-x-auto" data-testid="tc-cov-table">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#F4EAE0] border-b border-[#E5E3DB]">
                {["#","Telecaller","Phone","Assigned","Called Today","Coverage","Untouched > 72h","Last Call"].map(h => (
                  <th key={h} className="p-2.5 text-left text-[9px] uppercase text-[#59615D] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const bar = Math.min(100, r.coverage_pct);
                return (
                  <tr key={r.tc_id} className={`border-b border-[#E5E3DB] hover:bg-[#F9F8F6] ${r.coverage_pct < 40 && r.assigned_leads > 0 ? "bg-red-50/40" : ""}`} data-testid={`tc-cov-row-${r.tc_id}`}>
                    <td className="p-2.5 text-[#7B6D5A]">{i+1}</td>
                    <td className="p-2.5 font-medium">{r.tc_name}</td>
                    <td className="p-2.5 text-[#7B6D5A]">{r.tc_phone || "—"}</td>
                    <td className="p-2.5"><b>{r.assigned_leads}</b></td>
                    <td className="p-2.5 text-emerald-700"><b>{r.called_today}</b></td>
                    <td className="p-2.5 min-w-[130px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-[#F4EAE0] rounded-full h-1.5 overflow-hidden">
                          <div className={`h-full ${r.coverage_pct >= 70 ? "bg-emerald-500" : r.coverage_pct >= 40 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${bar}%` }} />
                        </div>
                        <Badge className={`text-[9px] ${coverageTone(r.coverage_pct)}`}>{r.coverage_pct}%</Badge>
                      </div>
                    </td>
                    <td className="p-2.5">
                      {r.untouched_72h > 0
                        ? <Badge className="text-[9px] bg-red-100 text-red-800 border border-red-300" data-testid={`tc-cov-aging-${r.tc_id}`}>⏰ {r.untouched_72h} aging</Badge>
                        : <span className="text-[9px] text-emerald-700">✓ 0</span>}
                    </td>
                    <td className="p-2.5 text-[10px] text-[#7B6D5A]">{r.last_call_at ? r.last_call_at.slice(0, 16).replace("T", " ") : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, tone }) {
  return (
    <div className={`rounded-xl p-2.5 border border-[#E5E3DB] ${tone || "bg-white"}`}>
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wide opacity-70">{icon}{label}</div>
      <div className="text-lg font-heading font-semibold mt-0.5">{value}</div>
    </div>
  );
}
