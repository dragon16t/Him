import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Clock, PhoneCall, RefreshCw } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STATUS_COLOR = {
  interested: "bg-emerald-100 text-emerald-800",
  not_interested: "bg-red-100 text-red-800",
  no_response: "bg-slate-200 text-slate-700",
  busy: "bg-amber-100 text-amber-800",
  follow_up: "bg-yellow-100 text-yellow-800",
  ordered: "bg-blue-100 text-blue-800",
  order_created: "bg-blue-100 text-blue-800",
  want_to_order: "bg-purple-100 text-purple-800",
  ok: "bg-teal-100 text-teal-800",
};

/**
 * Today's Activity page for Telecallers.
 * Shows every call logged today with status + remarks + follow-up + orders summary.
 */
export default function TodayActivityPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/telecaller/today-activity`);
      setData(r.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4" data-testid="today-activity-panel">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="w-4 h-4 text-[#3B5249]" /> Today's Activity — {data?.date}
              </CardTitle>
              <p className="text-xs text-[#59615D] mt-1">
                Every call you logged today · Live counters · Order summary at the bottom
              </p>
            </div>
            <Button size="sm" onClick={load} disabled={loading} data-testid="ta-refresh">
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* KPIs */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <PhoneCall className="w-4 h-4 text-emerald-700" />
              <span className="text-xs font-medium text-emerald-800">
                Calls Today: <b>{data?.total_calls_today || 0}</b>
              </span>
            </div>
            {Object.entries(data?.by_status || {}).map(([st, c]) => (
              <div key={st} className={`px-3 py-2 rounded-lg text-xs ${STATUS_COLOR[st] || "bg-slate-100 text-slate-700"}`}>
                {st.replace(/_/g, " ")}: <b>{c}</b>
              </div>
            ))}
            {(data?.orders_today?.count || 0) > 0 && (
              <div className="ml-auto flex items-center gap-2 bg-[#3B5249] text-white rounded-lg px-3 py-2">
                <span className="text-xs">
                  Orders: <b>{data.orders_today.count}</b> · Qty: <b>{data.orders_today.qty}</b> · Rs.{Number(data.orders_today.revenue || 0).toLocaleString("en-IN")}
                </span>
              </div>
            )}
          </div>

          {/* Calls table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="today-calls-table">
              <thead className="bg-[#F5F3EE] text-[#3B5249]">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Time</th>
                  <th className="text-left px-3 py-2 font-semibold">Number</th>
                  <th className="text-left px-3 py-2 font-semibold">Customer</th>
                  <th className="text-center px-3 py-2 font-semibold">Status</th>
                  <th className="text-left px-3 py-2 font-semibold">Remarks</th>
                  <th className="text-left px-3 py-2 font-semibold">Follow-Up</th>
                </tr>
              </thead>
              <tbody>
                {(data?.calls || []).map((c, idx) => (
                  <tr key={`${c.lead_id}-${idx}`} className="border-b border-[#E5E3DB]" data-testid={`ta-row-${idx}`}>
                    <td className="px-3 py-2 whitespace-nowrap text-[#59615D]">
                      {c.logged_at ? new Date(c.logged_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono">{c.phone_number}</td>
                    <td className="px-3 py-2">{c.customer_name}</td>
                    <td className="text-center px-3 py-2">
                      <Badge className={`${STATUS_COLOR[c.status] || "bg-slate-100 text-slate-700"} text-[9px]`}>
                        {c.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 max-w-xs">
                      <div className="truncate" title={c.remarks}>{c.remarks || "—"}</div>
                      {c.not_interested_reason && <div className="text-[9px] text-red-700 mt-0.5">Reason: {c.not_interested_reason}</div>}
                    </td>
                    <td className="px-3 py-2 text-[#59615D] whitespace-nowrap">
                      {c.next_follow_up_date ? `${c.next_follow_up_date}${c.next_follow_up_time ? " · " + c.next_follow_up_time : ""}` : "—"}
                    </td>
                  </tr>
                ))}
                {(data?.calls || []).length === 0 && !loading && (
                  <tr><td colSpan={6} className="text-center py-6 text-[#8E9A94]">
                    No calls logged today yet — start dialing!
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
