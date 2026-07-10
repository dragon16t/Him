import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { AlertTriangle, TrendingUp, TrendingDown, Target, Users } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Weekly Performance vs Target panel.
 * Shows every telecaller's Mon–Sun order quantities, total against 18-qty weekly target,
 * gap and traffic-light status (red < 12, amber 12–17, green ≥ 18).
 * Admin / SM / Head-of-Sales only (endpoint enforces).
 */
export default function WeeklyPerformancePanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [weekStart, setWeekStart] = useState("");

  const load = async (ws = "") => {
    setLoading(true);
    try {
      const url = ws ? `${API}/admin/weekly-performance?week_start=${ws}` : `${API}/admin/weekly-performance`;
      const r = await axios.get(url);
      setData(r.data);
      setWeekStart(r.data.week_start);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const summary = useMemo(() => {
    if (!data) return { red: 0, amber: 0, green: 0 };
    const s = { red: 0, amber: 0, green: 0 };
    (data.rows || []).forEach(r => { s[r.status] = (s[r.status] || 0) + 1; });
    return s;
  }, [data]);

  const shiftWeek = (delta) => {
    if (!data) return;
    const d = new Date(data.week_start);
    d.setDate(d.getDate() + delta * 7);
    load(d.toISOString().slice(0, 10));
  };

  return (
    <div className="space-y-4" data-testid="weekly-performance-panel">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="w-4 h-4 text-emerald-600" />
                Weekly Performance vs Target (18 qty / week · 3 qty / day)
              </CardTitle>
              {data && (
                <p className="text-xs text-[#59615D] mt-1">
                  {data.week_start} → {data.week_end} · {data.rows?.length || 0} telecallers
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => shiftWeek(-1)} data-testid="prev-week-btn">← Prev</Button>
              <Input
                type="date"
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
                onBlur={() => load(weekStart)}
                className="h-8 w-40 text-xs"
                data-testid="week-picker"
              />
              <Button size="sm" variant="outline" onClick={() => shiftWeek(1)} data-testid="next-week-btn">Next →</Button>
              <Button size="sm" onClick={() => load(weekStart)} disabled={loading} data-testid="refresh-week-btn">
                {loading ? "…" : "Refresh"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-400 text-amber-700 hover:bg-amber-50"
                onClick={async () => {
                  if (!window.confirm("Scan the entire lead database and merge every duplicate phone number? Winners keep all call history from losers. Losers are soft-deleted.")) return;
                  try {
                    const r = await axios.post(`${API}/leads/dedupe`, {});
                    toast.success(`Dedupe done — ${r.data.merged} groups merged, ${r.data.removed} duplicates removed.`);
                  } catch (e) {
                    toast.error(e?.response?.data?.detail || "Dedupe failed");
                  }
                }}
                data-testid="dedupe-leads-btn"
              >
                <Users className="w-3.5 h-3.5 mr-1" /> Dedupe Leads
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Traffic-light summary */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span className="text-xs font-medium text-red-800">Critical (&lt; 12 qty): {summary.red}</span>
            </div>
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <TrendingDown className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-medium text-amber-800">At-risk (12–17): {summary.amber}</span>
            </div>
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-medium text-emerald-800">On-target (≥ 18): {summary.green}</span>
            </div>
            {data?.totals && (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 ml-auto">
                <span className="text-xs text-slate-700">
                  Team totals — Orders: <b>{data.totals.orders}</b> · Qty: <b>{data.totals.qty}</b> · Rev: Rs.{Number(data.totals.revenue || 0).toLocaleString("en-IN")}
                </span>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="weekly-perf-table">
              <thead className="bg-[#F5F3EE] text-[#3B5249]">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Telecaller</th>
                  {DAY_LABELS.map((d, i) => (
                    <th key={d} className="text-center px-2 py-2 font-semibold">
                      {d}
                      {data && <div className="text-[9px] font-normal text-[#8E9A94]">{data.days?.[i]?.slice(5)}</div>}
                    </th>
                  ))}
                  <th className="text-right px-3 py-2 font-semibold">Orders</th>
                  <th className="text-right px-3 py-2 font-semibold">Total Qty</th>
                  <th className="text-right px-3 py-2 font-semibold">Leads Given</th>
                  <th className="text-right px-3 py-2 font-semibold">Conv %</th>
                  <th className="text-center px-3 py-2 font-semibold">Tier</th>
                  <th className="text-right px-3 py-2 font-semibold">Target</th>
                  <th className="text-right px-3 py-2 font-semibold">Gap</th>
                  <th className="text-center px-3 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {(data?.rows || []).map((row) => {
                  const tone =
                    row.status === "red" ? "bg-red-50 border-l-4 border-l-red-500" :
                    row.status === "amber" ? "bg-amber-50 border-l-4 border-l-amber-500" :
                    "bg-emerald-50 border-l-4 border-l-emerald-500";
                  const badgeTone =
                    row.status === "red" ? "bg-red-600 text-white" :
                    row.status === "amber" ? "bg-amber-500 text-white" :
                    "bg-emerald-600 text-white";
                  return (
                    <tr key={row.telecaller_id} className={`${tone} border-b border-[#E5E3DB]`} data-testid={`perf-row-${row.telecaller_id}`}>
                      <td className="px-3 py-2 font-medium">
                        {row.telecaller_name}
                        {row.email && <div className="text-[9px] text-[#8E9A94]">{row.email}</div>}
                      </td>
                      {(data.days || []).map((d) => {
                        const cell = row.per_day[d] || { orders: 0, qty: 0 };
                        return (
                          <td key={d} className="text-center px-2 py-2">
                            {cell.qty > 0 ? (
                              <div>
                                <div className="font-semibold text-[#3B5249]">{cell.qty}</div>
                                <div className="text-[9px] text-[#8E9A94]">{cell.orders} ord</div>
                              </div>
                            ) : (
                              <span className="text-[#C7C3B4]">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="text-right px-3 py-2">{row.total_orders}</td>
                      <td className="text-right px-3 py-2 font-bold">{row.total_qty}</td>
                      <td className="text-right px-3 py-2 text-[#3B5249]">{row.leads_given || 0}</td>
                      <td className="text-right px-3 py-2 font-semibold">
                        {row.leads_given > 0 ? `${row.conversion_pct}%` : "—"}
                      </td>
                      <td className="text-center px-3 py-2">
                        {row.tier === "no_leads" ? (
                          <Badge className="bg-slate-300 text-slate-700 text-[9px]" data-testid={`tier-${row.telecaller_id}`}>NO LEADS</Badge>
                        ) : row.tier === "high" ? (
                          <Badge className="bg-emerald-600 text-white text-[9px]" data-testid={`tier-${row.telecaller_id}`}>HIGH ≥25%</Badge>
                        ) : row.tier === "medium" ? (
                          <Badge className="bg-amber-500 text-white text-[9px]" data-testid={`tier-${row.telecaller_id}`}>MEDIUM 10-24%</Badge>
                        ) : (
                          <Badge className="bg-red-600 text-white text-[9px]" data-testid={`tier-${row.telecaller_id}`}>UNDER &lt;10%</Badge>
                        )}
                      </td>
                      <td className="text-right px-3 py-2 text-[#8E9A94]">{row.target_qty}</td>
                      <td className={`text-right px-3 py-2 font-bold ${row.gap > 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {row.gap > 0 ? `-${row.gap}` : `+${-row.gap}`}
                      </td>
                      <td className="text-center px-3 py-2">
                        <Badge className={`${badgeTone} text-[9px]`}>
                          {row.is_active_7d ? "" : "💤 "}{row.status === "red" ? "UNDER-PERFORMING" : row.status === "amber" ? "AT RISK" : "ON TARGET"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
                {(data?.rows || []).length === 0 && !loading && (
                  <tr><td colSpan={16} className="text-center py-6 text-[#8E9A94]">No telecallers found for this week.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
