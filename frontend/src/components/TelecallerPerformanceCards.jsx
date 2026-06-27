/**
 * TelecallerPerformanceCards — per-telecaller stats with time-range filters.
 *
 * Used on:
 *   - SalesManagerDashboard (auto-scoped to logged-in SM)
 *   - AdminCRMPanel (when admin picks an SM from the orders SM-filter)
 *   - InventoryManagerDashboard (when IM picks an SM in their SM-filter)
 *
 * Time ranges: Today / 7d / 30d / Custom.
 * Cards show: total orders, total quantity, revenue, delivered, returned, in-transit.
 */
import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { Phone, MessageSquare, TrendingUp, Package, IndianRupee, CheckCircle2, RotateCcw, Truck, Calendar, Users } from "lucide-react";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

const RANGES = [
  { v: "today", l: "Today" },
  { v: "7d", l: "Last 7 Days" },
  { v: "30d", l: "Last 30 Days" },
  { v: "custom", l: "Custom" },
];

export default function TelecallerPerformanceCards({ smId, title = "Telecaller Performance" }) {
  const [range, setRange] = useState("7d");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { range };
      if (smId) params.sm_id = smId;
      if (range === "custom") {
        if (!fromDate || !toDate) { setLoading(false); return; }
        params.from = fromDate; params.to = toDate;
      }
      const { data } = await axios.get(`${API}/sm/telecaller-performance`, { params });
      setData(data);
    } catch (e) {
      // silent
    } finally { setLoading(false); }
  }, [range, fromDate, toDate, smId]);
  useEffect(() => { load(); }, [load]);

  const tcs = data?.telecallers || [];
  const totals = data?.totals || {};

  return (
    <div className="space-y-3" data-testid="tc-performance-cards">
      {/* Header + range chips */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-heading text-[16px] flex items-center gap-2 text-[#2C3531]"><Users className="w-4 h-4 text-[#3B5249]"/>{title}</h3>
          <p className="text-[10px] text-[#7B6D5A]">Date / 7-day / Month filtering for each telecaller&apos;s quantity, revenue, deliveries, returns and in-transit.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-white rounded-full border border-[#E5E3DB] p-0.5" data-testid="tc-perf-range-chips">
            {RANGES.map(r => (
              <button key={r.v} onClick={() => setRange(r.v)} className={`px-3 py-1 rounded-full text-[10px] font-medium ${range === r.v ? "bg-[#3B5249] text-white" : "text-[#59615D]"}`} data-testid={`tc-perf-range-${r.v}`}>{r.l}</button>
            ))}
          </div>
          {range === "custom" && (
            <div className="flex items-center gap-1 bg-white rounded-full border border-[#E5E3DB] px-2 py-0.5">
              <Calendar className="w-3 h-3 text-[#7B6D5A]"/>
              <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-6 text-[10px] border-0 p-1 w-32" data-testid="tc-perf-from"/>
              <span className="text-[10px] text-[#7B6D5A]">to</span>
              <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-6 text-[10px] border-0 p-1 w-32" data-testid="tc-perf-to"/>
            </div>
          )}
        </div>
      </div>

      {/* Totals strip */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2" data-testid="tc-perf-totals">
        {[
          { k: "orders", l: "Orders", icon: Package, color: "bg-[#F4F1EA] text-[#3B5249]" },
          { k: "qty", l: "Total Qty", icon: TrendingUp, color: "bg-[#E5E1F5] text-[#6358B0]" },
          { k: "revenue", l: "Revenue", icon: IndianRupee, color: "bg-[#FFF3E0] text-[#A66E4E]", isMoney: true },
          { k: "in_transit", l: "In Transit", icon: Truck, color: "bg-purple-50 text-purple-800" },
          { k: "delivered", l: "Delivered", icon: CheckCircle2, color: "bg-[#DBE9DD] text-[#15803D]" },
          { k: "returned", l: "Returned", icon: RotateCcw, color: "bg-orange-50 text-orange-800" },
        ].map(({ k, l, icon: Icon, color, isMoney }) => (
          <div key={k} className={`rounded-2xl p-3 ${color}`} data-testid={`tc-perf-total-${k}`}>
            <Icon className="w-3.5 h-3.5"/>
            <div className="text-[18px] font-bold leading-tight mt-1">
              {isMoney ? `₹${Number(totals[k] || 0).toLocaleString("en-IN")}` : (totals[k] || 0)}
            </div>
            <div className="text-[9px] uppercase tracking-wide opacity-80">{l}</div>
          </div>
        ))}
      </div>

      {/* Per-TC cards */}
      {loading && <p className="text-center text-xs text-[#7B6D5A] py-6">Loading…</p>}
      {!loading && tcs.length === 0 && (
        <div className="text-center py-8 bg-white border border-[#E5E3DB] rounded-2xl text-[#7B6D5A] text-sm" data-testid="tc-perf-empty">No telecallers in your team for this period.</div>
      )}
      {!loading && tcs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="tc-perf-grid">
          {tcs.map(t => (
            <div key={t.telecaller_id} className="bg-white border border-[#E5E3DB] rounded-2xl p-3 hover:border-[#3B5249] transition" data-testid={`tc-perf-${t.telecaller_id}`}>
              {/* Header: name + role + phone */}
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-medium text-sm text-[#2C3531]">{t.telecaller_name}</p>
                  <p className="text-[10px] text-[#7B6D5A] font-mono">{t.telecaller_phone || "—"}</p>
                </div>
                <Badge className="bg-[#3B5249] text-white text-[10px]">{t.orders} orders</Badge>
              </div>

              {/* Top revenue/qty band */}
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                <div className="bg-[#FFF3E0] rounded-xl p-2 text-center">
                  <p className="text-[9px] uppercase tracking-wide text-[#A66E4E]">Revenue</p>
                  <p className="text-[14px] font-bold text-[#A66E4E]">₹{Number(t.revenue || 0).toLocaleString("en-IN")}</p>
                </div>
                <div className="bg-[#E5E1F5] rounded-xl p-2 text-center">
                  <p className="text-[9px] uppercase tracking-wide text-[#6358B0]">Total Qty</p>
                  <p className="text-[14px] font-bold text-[#6358B0]">{t.total_qty}</p>
                </div>
              </div>

              {/* Status pill grid */}
              <div className="grid grid-cols-4 gap-1 text-center">
                <div className="bg-purple-50 rounded-lg py-1.5"><div className="text-[13px] font-bold text-purple-800">{t.in_transit}</div><div className="text-[8px] uppercase text-purple-600">Transit</div></div>
                <div className="bg-emerald-50 rounded-lg py-1.5"><div className="text-[13px] font-bold text-emerald-800">{t.delivered}</div><div className="text-[8px] uppercase text-emerald-600">Delivered</div></div>
                <div className="bg-orange-50 rounded-lg py-1.5"><div className="text-[13px] font-bold text-orange-800">{t.returned}</div><div className="text-[8px] uppercase text-orange-600">Returned</div></div>
                <div className="bg-yellow-50 rounded-lg py-1.5"><div className="text-[13px] font-bold text-yellow-800">{t.pending + t.confirmed}</div><div className="text-[8px] uppercase text-yellow-600">Pending</div></div>
              </div>

              {/* Delivery/RTO % bars */}
              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-emerald-700 w-14">Delivery</span>
                  <div className="h-1.5 flex-1 bg-[#F0EDE5] rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${t.delivery_pct || 0}%` }}/>
                  </div>
                  <span className="text-[9px] font-medium text-emerald-700 w-10 text-right">{t.delivery_pct || 0}%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-orange-700 w-14">RTO/Returned</span>
                  <div className="h-1.5 flex-1 bg-[#F0EDE5] rounded-full overflow-hidden">
                    <div className="h-full bg-orange-500" style={{ width: `${t.rto_pct || 0}%` }}/>
                  </div>
                  <span className="text-[9px] font-medium text-orange-700 w-10 text-right">{t.rto_pct || 0}%</span>
                </div>
              </div>

              {/* Footer: delivered revenue + contact buttons */}
              <div className="mt-2 flex items-center justify-between border-t border-[#F0EDE5] pt-2">
                <span className="text-[10px] text-[#7B6D5A]">Delivered Rev: <b className="text-[#15803D]">₹{Number(t.delivered_revenue || 0).toLocaleString("en-IN")}</b></span>
                {t.telecaller_phone && (
                  <div className="flex gap-1">
                    <a href={`tel:${t.telecaller_phone}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] bg-blue-50 border border-blue-300 text-blue-800" data-testid={`tc-perf-call-${t.telecaller_id}`}><Phone className="w-2.5 h-2.5"/>Call</a>
                    <a href={`https://wa.me/91${(t.telecaller_phone || "").replace(/\D/g, "").replace(/^91/, "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] bg-emerald-50 border border-emerald-300 text-emerald-800" data-testid={`tc-perf-wa-${t.telecaller_id}`}><MessageSquare className="w-2.5 h-2.5"/>WhatsApp</a>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
