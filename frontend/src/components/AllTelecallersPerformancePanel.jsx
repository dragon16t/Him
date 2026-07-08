/**
 * AllTelecallersPerformancePanel.jsx — Admin/IM only.
 *
 * Shows every telecaller across every Sales Manager (+ an unassigned bucket)
 * with the same date-window filtering as the SM-scoped TC Performance view.
 *
 * GET /api/admin/all-tcs-performance?range=today|7d|30d|custom&from=&to=
 */
import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Crown, Users, TrendingUp, Package, IndianRupee } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const API = process.env.REACT_APP_BACKEND_URL + "/api";
const INR = (n) => `Rs.${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const RANGES = [
  { v: "today", l: "Today" },
  { v: "7d", l: "Last 7 days" },
  { v: "30d", l: "Last 30 days" },
  { v: "custom", l: "Custom" },
];

export default function AllTelecallersPerformancePanel() {
  const [range, setRange] = useState("7d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [expanded, setExpanded] = useState({}); // sm_id -> boolean

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { range };
      if (range === "custom") {
        if (!from || !to) { setLoading(false); return; }
        params.from = from; params.to = to;
      }
      const { data } = await axios.get(`${API}/admin/all-tcs-performance`, { params });
      setData(data);
      // Auto-expand the top SM by default
      if (data.managers && data.managers.length && Object.keys(expanded).length === 0) {
        setExpanded({ [data.managers[0].sm_id]: true });
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to load performance data");
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleSM = (smId) => setExpanded(e => ({ ...e, [smId]: !e[smId] }));
  const expandAll = () => {
    if (!data) return;
    const all = {};
    (data.managers || []).forEach(m => { all[m.sm_id] = true; });
    if (data.unassigned && data.unassigned.team_size > 0) all["__unassigned__"] = true;
    setExpanded(all);
  };
  const collapseAll = () => setExpanded({});

  const grand = data?.grand_totals || {};

  return (
    <div className="space-y-4" data-testid="all-tcs-perf-panel">
      {/* Filter bar */}
      <div className="bg-white rounded-2xl border border-[#E5E3DB] p-3 flex items-center gap-3 flex-wrap" data-testid="all-tcs-filter-bar">
        <div className="flex items-center gap-1">
          <Label className="text-xs text-[#59615D] mr-1">Date range:</Label>
          {RANGES.map(r => (
            <button key={r.v}
              onClick={() => setRange(r.v)}
              className={`px-3 py-1 rounded-full text-[10px] font-medium ${range === r.v ? "bg-[#3B5249] text-white" : "bg-[#F9F8F6] border border-[#E5E3DB] text-[#59615D]"}`}
              data-testid={`all-tcs-range-${r.v}`}>{r.l}</button>
          ))}
        </div>
        {range === "custom" && (
          <div className="flex items-center gap-1">
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="rounded-full h-8 text-xs w-40" data-testid="all-tcs-from"/>
            <span className="text-xs text-[#59615D]">→</span>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="rounded-full h-8 text-xs w-40" data-testid="all-tcs-to"/>
            <Button size="sm" className="rounded-full h-7 text-xs bg-[#3B5249] text-white" onClick={fetchData} data-testid="all-tcs-apply">Apply</Button>
          </div>
        )}
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="outline" className="rounded-full h-7 text-[10px]" onClick={expandAll} data-testid="all-tcs-expand-all">Expand all</Button>
          <Button size="sm" variant="outline" className="rounded-full h-7 text-[10px]" onClick={collapseAll} data-testid="all-tcs-collapse-all">Collapse all</Button>
        </div>
      </div>

      {/* Grand totals */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2" data-testid="all-tcs-grand-totals">
          <StatCard icon={<Users className="w-3 h-3"/>} label="Total TCs" value={grand.total_telecallers ?? 0} tone="bg-[#3B5249]/10 text-[#3B5249]"/>
          <StatCard icon={<Package className="w-3 h-3"/>} label="Orders" value={grand.orders ?? 0} tone="bg-blue-100 text-blue-800"/>
          <StatCard icon={<IndianRupee className="w-3 h-3"/>} label="Revenue" value={INR(grand.revenue)} tone="bg-emerald-100 text-emerald-800"/>
          <StatCard label="Delivered" value={`${grand.delivered ?? 0} (${grand.delivery_pct ?? 0}%)`} tone="bg-green-100 text-green-800"/>
          <StatCard label="In Transit" value={grand.in_transit ?? 0} tone="bg-purple-100 text-purple-800"/>
          <StatCard label="Returned" value={`${grand.returned ?? 0} (${grand.rto_pct ?? 0}%)`} tone="bg-red-100 text-red-800"/>
        </div>
      )}

      {loading && <p className="text-center py-8 text-[#7B6D5A] text-sm">Loading…</p>}

      {!loading && data && (
        <div className="space-y-3">
          {data.managers.map(m => (
            <ManagerSection key={m.sm_id} manager={m} expanded={!!expanded[m.sm_id]} onToggle={() => toggleSM(m.sm_id)} />
          ))}
          {data.unassigned && data.unassigned.team_size > 0 && (
            <ManagerSection
              manager={{
                sm_id: "__unassigned__",
                sm_name: "Unassigned Telecallers",
                sm_phone: "",
                is_head_of_sales: false,
                team_size: data.unassigned.team_size,
                telecallers: data.unassigned.telecallers,
                totals: data.unassigned.totals,
              }}
              expanded={!!expanded["__unassigned__"]}
              onToggle={() => toggleSM("__unassigned__")}
              isUnassigned
            />
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, tone }) {
  return (
    <div className={`rounded-xl p-2.5 border border-[#E5E3DB] ${tone || "bg-white"}`}>
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wide opacity-70">{icon}{label}</div>
      <div className="text-lg font-heading font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function ManagerSection({ manager, expanded, onToggle, isUnassigned }) {
  const t = manager.totals || {};
  return (
    <div className="bg-white rounded-2xl border border-[#E5E3DB] overflow-hidden" data-testid={`all-tcs-sm-${manager.sm_id}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 p-3 hover:bg-[#F9F8F6] transition text-left"
        data-testid={`all-tcs-sm-toggle-${manager.sm_id}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {expanded ? <ChevronDown className="w-4 h-4 text-[#3B5249] flex-shrink-0"/> : <ChevronRight className="w-4 h-4 text-[#3B5249] flex-shrink-0"/>}
          {manager.is_head_of_sales && <Crown className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" title="Head of Sales"/>}
          <div className="min-w-0">
            <p className="font-heading text-sm text-[#2C3531] truncate">{manager.sm_name}{isUnassigned && <span className="text-[10px] text-red-600 ml-1">(no SM link)</span>}</p>
            <p className="text-[10px] text-[#7B6D5A]">Team: {manager.team_size} · Orders: {t.orders ?? 0} · Revenue: <b className="text-[#3B5249]">{INR(t.revenue)}</b></p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-1.5 flex-shrink-0">
          <Badge variant="outline" className="text-[9px]">Del {t.delivered ?? 0} ({t.delivery_pct ?? 0}%)</Badge>
          <Badge variant="outline" className="text-[9px] border-purple-300 text-purple-700">Transit {t.in_transit ?? 0}</Badge>
          <Badge variant="outline" className="text-[9px] border-yellow-300 text-yellow-700">Pending {t.pending ?? 0}</Badge>
          <Badge variant="outline" className="text-[9px] border-red-300 text-red-700">RTO {t.returned ?? 0} ({t.rto_pct ?? 0}%)</Badge>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[#E5E3DB] bg-[#FBFAF7] p-2">
          {manager.telecallers.length === 0 ? (
            <p className="text-center py-6 text-[#7B6D5A] text-sm">No telecallers under this manager.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid={`all-tcs-table-${manager.sm_id}`}>
                <thead>
                  <tr className="bg-[#F4EAE0] border-b border-[#E5E3DB]">
                    {["#","Telecaller","Phone","Orders","Qty","Revenue","Delivered","In Transit","Pending","Returned","Delivery %","RTO %"].map(h => (
                      <th key={h} className="p-2 text-left text-[9px] uppercase text-[#59615D] whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {manager.telecallers.map((tc, i) => (
                    <tr key={tc.telecaller_id} className="border-b border-[#E5E3DB] hover:bg-white" data-testid={`all-tcs-tc-row-${tc.telecaller_id}`}>
                      <td className="p-2 text-[#7B6D5A]">{i+1}</td>
                      <td className="p-2 font-medium">{tc.telecaller_name}{tc.role === "assistant_sales_manager" && <Badge variant="outline" className="ml-1 text-[8px]">Asst SM</Badge>}</td>
                      <td className="p-2 text-[#7B6D5A]">{tc.telecaller_phone || "—"}</td>
                      <td className="p-2"><b>{tc.orders}</b></td>
                      <td className="p-2">{tc.total_qty}</td>
                      <td className="p-2 font-medium text-[#3B5249]">{INR(tc.revenue)}</td>
                      <td className="p-2 text-green-700">{tc.delivered}</td>
                      <td className="p-2 text-purple-700">{tc.in_transit}</td>
                      <td className="p-2 text-yellow-700">{tc.pending + (tc.confirmed || 0)}</td>
                      <td className="p-2 text-red-700">{tc.returned}</td>
                      <td className="p-2">{tc.delivery_pct}%</td>
                      <td className="p-2">{tc.rto_pct}%</td>
                    </tr>
                  ))}
                  {/* SM totals row */}
                  <tr className="bg-[#F4EAE0] font-semibold">
                    <td className="p-2"></td>
                    <td className="p-2">TEAM TOTAL</td>
                    <td className="p-2"></td>
                    <td className="p-2">{t.orders ?? 0}</td>
                    <td className="p-2">{t.qty ?? 0}</td>
                    <td className="p-2 text-[#3B5249]">{INR(t.revenue)}</td>
                    <td className="p-2 text-green-700">{t.delivered ?? 0}</td>
                    <td className="p-2 text-purple-700">{t.in_transit ?? 0}</td>
                    <td className="p-2 text-yellow-700">{(t.pending ?? 0) + (t.confirmed ?? 0)}</td>
                    <td className="p-2 text-red-700">{t.returned ?? 0}</td>
                    <td className="p-2">{t.delivery_pct ?? 0}%</td>
                    <td className="p-2">{t.rto_pct ?? 0}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
