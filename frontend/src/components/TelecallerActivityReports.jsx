import React, { useEffect, useState } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Users, PhoneCall } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * Combined admin report panel with two tables:
 *   1) Leads Received per TC (today / 3d / 7d / custom range)
 *   2) Status Summary per TC (no_response / interested / not_interested + reasons)
 * Both share the same date-range picker at the top.
 */
export default function TelecallerActivityReports() {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [received, setReceived] = useState(null);
  const [statusSum, setStatusSum] = useState(null);
  const [rangePerf, setRangePerf] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [r1, r2, r3] = await Promise.all([
        axios.get(`${API}/admin/leads-received-report?from_date=${from}&to_date=${to}`),
        axios.get(`${API}/admin/status-summary-report?from_date=${from}&to_date=${to}`),
        axios.get(`${API}/admin/tc-performance-range?from_date=${from}&to_date=${to}`),
      ]);
      setReceived(r1.data);
      setStatusSum(r2.data);
      setRangePerf(r3.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  return (
    <div className="space-y-6" data-testid="tc-activity-reports">
      {/* Shared date-range controls */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Telecaller Activity Reports</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#59615D]">From</span>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-40 text-xs" data-testid="report-from" />
              <span className="text-xs text-[#59615D]">To</span>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-40 text-xs" data-testid="report-to" />
              <Button size="sm" onClick={load} disabled={loading} data-testid="reload-reports-btn">
                {loading ? "…" : "Apply"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setFrom(today); setTo(today); setTimeout(load, 50); }} data-testid="report-today-btn">Today</Button>
              <Button size="sm" variant="outline" onClick={() => {
                const d = new Date(); d.setDate(d.getDate() - 6);
                setFrom(d.toISOString().slice(0, 10)); setTo(today); setTimeout(load, 50);
              }} data-testid="report-7d-btn">Last 7d</Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* TC Performance in Range (leads / orders / conv %) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="w-4 h-4 text-[#3B5249]" /> TC Performance in Range (Leads · Orders · Conv %)
          </CardTitle>
          {rangePerf && (
            <p className="text-xs text-[#59615D]">
              Range: {rangePerf.range_from} → {rangePerf.range_to} · Team totals — leads: <b>{rangePerf.totals?.leads_given}</b>, orders: <b>{rangePerf.totals?.orders}</b>, qty: <b>{rangePerf.totals?.qty}</b>, revenue: Rs.{Number(rangePerf.totals?.revenue || 0).toLocaleString("en-IN")}
            </p>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="tc-range-perf-table">
              <thead className="bg-[#F5F3EE] text-[#3B5249]">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Telecaller</th>
                  <th className="text-right px-3 py-2 font-semibold">Leads Given</th>
                  <th className="text-right px-3 py-2 font-semibold">Orders</th>
                  <th className="text-right px-3 py-2 font-semibold">Qty</th>
                  <th className="text-right px-3 py-2 font-semibold">Revenue</th>
                  <th className="text-right px-3 py-2 font-semibold">Conv %</th>
                  <th className="text-center px-3 py-2 font-semibold">Tier</th>
                </tr>
              </thead>
              <tbody>
                {(rangePerf?.rows || []).map((row) => {
                  const tierColor = row.tier === "high" ? "bg-emerald-600 text-white" : row.tier === "medium" ? "bg-amber-500 text-white" : row.tier === "under" ? "bg-red-600 text-white" : "bg-slate-300 text-slate-700";
                  const tierLabel = row.tier === "high" ? "HIGH ≥25%" : row.tier === "medium" ? "MEDIUM 10-24%" : row.tier === "under" ? "UNDER <10%" : "NO LEADS";
                  return (
                    <tr key={row.telecaller_id} className="border-b border-[#E5E3DB]" data-testid={`range-perf-row-${row.telecaller_id}`}>
                      <td className="px-3 py-2 font-medium">
                        {row.telecaller_name}
                        {row.email && <div className="text-[9px] text-[#8E9A94]">{row.email}</div>}
                      </td>
                      <td className="text-right px-3 py-2">{row.leads_given}</td>
                      <td className="text-right px-3 py-2 font-semibold">{row.orders}</td>
                      <td className="text-right px-3 py-2">{row.qty}</td>
                      <td className="text-right px-3 py-2">Rs.{Number(row.revenue || 0).toLocaleString("en-IN")}</td>
                      <td className="text-right px-3 py-2 font-bold">{row.leads_given > 0 ? `${row.conversion_pct}%` : "—"}</td>
                      <td className="text-center px-3 py-2">
                        <Badge className={`${tierColor} text-[9px]`} data-testid={`range-tier-${row.telecaller_id}`}>{tierLabel}</Badge>
                      </td>
                    </tr>
                  );
                })}
                {(rangePerf?.rows || []).length === 0 && !loading && (
                  <tr><td colSpan={7} className="text-center py-6 text-[#8E9A94]">No data for this range.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Leads Received Report */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="w-4 h-4 text-[#3B5249]" /> Leads Received per Telecaller
          </CardTitle>
          {received && <p className="text-xs text-[#59615D]">Range: {received.range_from} → {received.range_to} · Team totals — today: <b>{received.totals?.today}</b>, 3d: <b>{received.totals?.["3d"]}</b>, 7d: <b>{received.totals?.["7d"]}</b>, range: <b>{received.totals?.range}</b></p>}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="leads-received-table">
              <thead className="bg-[#F5F3EE] text-[#3B5249]">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Telecaller</th>
                  <th className="text-right px-3 py-2 font-semibold">Today</th>
                  <th className="text-right px-3 py-2 font-semibold">Last 3 Days</th>
                  <th className="text-right px-3 py-2 font-semibold">Last 7 Days</th>
                  <th className="text-right px-3 py-2 font-semibold">In Range</th>
                </tr>
              </thead>
              <tbody>
                {(received?.rows || []).map(r => (
                  <tr key={r.telecaller_id} className="border-b border-[#E5E3DB]" data-testid={`received-row-${r.telecaller_id}`}>
                    <td className="px-3 py-2 font-medium">
                      {r.telecaller_name}
                      {r.email && <div className="text-[9px] text-[#8E9A94]">{r.email}</div>}
                    </td>
                    <td className="text-right px-3 py-2 font-bold">{r.leads_today}</td>
                    <td className="text-right px-3 py-2">{r.leads_3d}</td>
                    <td className="text-right px-3 py-2">{r.leads_7d}</td>
                    <td className="text-right px-3 py-2 font-bold text-emerald-700">{r.leads_range}</td>
                  </tr>
                ))}
                {(received?.rows || []).length === 0 && !loading && (
                  <tr><td colSpan={5} className="text-center py-6 text-[#8E9A94]">No data.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Status Summary Report */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <PhoneCall className="w-4 h-4 text-[#3B5249]" /> Call Status Summary per Telecaller
          </CardTitle>
          {statusSum && (
            <p className="text-xs text-[#59615D]">
              Range: {statusSum.range_from} → {statusSum.range_to}
              {statusSum.totals && ` · Team totals — no_response: ${statusSum.totals.no_response || 0} · interested: ${statusSum.totals.interested || 0} · not_interested: ${statusSum.totals.not_interested || 0}`}
            </p>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="status-summary-table">
              <thead className="bg-[#F5F3EE] text-[#3B5249]">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Telecaller</th>
                  {(statusSum?.status_keys || []).map(k => (
                    <th key={k} className="text-right px-2 py-2 font-semibold whitespace-nowrap">{k.replace(/_/g, " ")}</th>
                  ))}
                  <th className="text-right px-3 py-2 font-semibold">Total Calls</th>
                </tr>
              </thead>
              <tbody>
                {(statusSum?.rows || []).map(r => (
                  <tr key={r.telecaller_id} className="border-b border-[#E5E3DB] align-top" data-testid={`status-row-${r.telecaller_id}`}>
                    <td className="px-3 py-2 font-medium">
                      {r.telecaller_name}
                      {Object.keys(r.not_interested_reasons || {}).length > 0 && (
                        <div className="mt-1 text-[9px] text-red-700">
                          <b>Not-int reasons:</b>{" "}
                          {Object.entries(r.not_interested_reasons).slice(0, 4).map(([reason, c]) => (
                            <span key={reason} className="inline-block mr-1">{reason}({c})</span>
                          ))}
                        </div>
                      )}
                    </td>
                    {(statusSum.status_keys || []).map(k => (
                      <td key={k} className={`text-right px-2 py-2 ${r.counts[k] ? "font-semibold" : "text-[#C7C3B4]"}`}>
                        {r.counts[k] || "—"}
                      </td>
                    ))}
                    <td className="text-right px-3 py-2 font-bold">{r.total_calls}</td>
                  </tr>
                ))}
                {(statusSum?.rows || []).length === 0 && !loading && (
                  <tr><td colSpan={12} className="text-center py-6 text-[#8E9A94]">No calls in this range.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Grand reasons summary */}
          {statusSum?.grand_not_interested_reasons && Object.keys(statusSum.grand_not_interested_reasons).length > 0 && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs font-semibold text-red-800 mb-1">Team-wide Not-Interested Reasons:</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(statusSum.grand_not_interested_reasons)
                  .sort(([, a], [, b]) => b - a)
                  .map(([reason, count]) => (
                    <Badge key={reason} className="bg-red-100 text-red-800 text-[10px]">
                      {reason} · {count}
                    </Badge>
                  ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
