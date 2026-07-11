import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { RotateCcw, TrendingDown } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * TC Returns Analytics for Inventory Manager.
 * Groups every returned/RTO order by the telecaller who placed it, with custom
 * date range and per-TC reason breakdown.
 */
export default function TelecallerReturnsPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [expandedTc, setExpandedTc] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/inventory/telecaller-returns?from_date=${from}&to_date=${to}`);
      setData(r.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  const shortcut = (days) => {
    const d = new Date(); d.setDate(d.getDate() - days + 1);
    setFrom(d.toISOString().slice(0, 10));
    setTo(new Date().toISOString().slice(0, 10));
    setTimeout(load, 50);
  };

  return (
    <div className="space-y-4" data-testid="tc-returns-panel">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <RotateCcw className="w-4 h-4 text-red-600" /> Telecaller Returns Analytics
              </CardTitle>
              <p className="text-xs text-[#59615D] mt-1">
                Identify which TCs have the most returned / RTO orders — coach or reassign accordingly.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#59615D]">From</span>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-40 text-xs" data-testid="tc-ret-from" />
              <span className="text-xs text-[#59615D]">To</span>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-40 text-xs" data-testid="tc-ret-to" />
              <Button size="sm" onClick={load} disabled={loading} data-testid="tc-ret-apply">
                {loading ? "…" : "Apply"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => shortcut(7)} data-testid="tc-ret-7d">Last 7d</Button>
              <Button size="sm" variant="outline" onClick={() => shortcut(30)} data-testid="tc-ret-30d">Last 30d</Button>
              <Button size="sm" variant="outline" onClick={() => shortcut(90)} data-testid="tc-ret-90d">Last 90d</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <TrendingDown className="w-4 h-4 text-red-600" />
              <span className="text-xs font-medium text-red-800">
                Total Returns: <b>{data?.totals?.returns_count || 0}</b> · Value: Rs.{Number(data?.totals?.returns_value || 0).toLocaleString("en-IN")}
              </span>
            </div>
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <span className="text-xs font-medium text-amber-800">
                Telecallers affected: <b>{data?.totals?.telecallers_with_returns || 0}</b>
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="tc-returns-table">
              <thead className="bg-[#F5F3EE] text-[#3B5249]">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Telecaller</th>
                  <th className="text-right px-3 py-2 font-semibold">Returns</th>
                  <th className="text-right px-3 py-2 font-semibold">Total Value</th>
                  <th className="text-left px-3 py-2 font-semibold">Top Reasons</th>
                  <th className="text-center px-3 py-2 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody>
                {(data?.rows || []).map((row) => (
                  <React.Fragment key={row.telecaller_id}>
                    <tr className="border-b border-[#E5E3DB]" data-testid={`tc-ret-row-${row.telecaller_id}`}>
                      <td className="px-3 py-2 font-medium">{row.telecaller_name}</td>
                      <td className="text-right px-3 py-2 font-bold text-red-700">{row.returns_count}</td>
                      <td className="text-right px-3 py-2">Rs.{Number(row.returns_value).toLocaleString("en-IN")}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(row.reasons || {})
                            .sort(([, a], [, b]) => b - a)
                            .slice(0, 3)
                            .map(([reason, count]) => (
                              <Badge key={reason} className="bg-red-100 text-red-800 text-[9px]">
                                {reason} · {count}
                              </Badge>
                            ))}
                        </div>
                      </td>
                      <td className="text-center px-3 py-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[10px]"
                          onClick={() => setExpandedTc(expandedTc === row.telecaller_id ? null : row.telecaller_id)}
                          data-testid={`tc-ret-expand-${row.telecaller_id}`}
                        >
                          {expandedTc === row.telecaller_id ? "Hide" : "Show"}
                        </Button>
                      </td>
                    </tr>
                    {expandedTc === row.telecaller_id && (
                      <tr>
                        <td colSpan={5} className="bg-[#FAF9F4] px-3 py-2">
                          <div className="text-[10px] font-semibold text-[#3B5249] mb-1">Individual returned orders:</div>
                          <table className="w-full text-[10px]">
                            <thead className="text-[#59615D]">
                              <tr>
                                <th className="text-left py-1">Order ID</th>
                                <th className="text-left py-1">Customer</th>
                                <th className="text-left py-1">Phone</th>
                                <th className="text-right py-1">Amount</th>
                                <th className="text-left py-1">Returned</th>
                                <th className="text-left py-1">Reason</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(data.detail_rows || [])
                                .filter((d) => d.telecaller_id === row.telecaller_id)
                                .map((d) => (
                                  <tr key={d.order_id} className="border-t border-[#E5E3DB]">
                                    <td className="py-1 font-mono">{d.order_id}</td>
                                    <td className="py-1">{d.customer_name}</td>
                                    <td className="py-1">{d.customer_phone}</td>
                                    <td className="text-right py-1">Rs.{Number(d.amount).toLocaleString("en-IN")}</td>
                                    <td className="py-1">{d.returned_at}</td>
                                    <td className="py-1 text-red-700">{d.reason || "—"}</td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {(data?.rows || []).length === 0 && !loading && (
                  <tr><td colSpan={5} className="text-center py-6 text-[#8E9A94]">No returns in this window.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
