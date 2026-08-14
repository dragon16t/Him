import React, { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrendingUp, TrendingDown, Users, Package, IndianRupee, ArrowUpRight, ArrowDownRight } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

const ROLE_LABELS = {
  sales_manager: "Sales Managers",
  telecaller: "Telecallers",
  admin: "Admin",
  district_manager: "District Managers",
  inventory_manager: "Inventory Managers",
  unknown: "Other",
};

// ── Finance Manager > Daily Sales & P&L
// Aggregates every order created today (or a chosen date) by the role that
// created it, and shows revenue / COGS / shipping / gateway fees / net profit
// with a strict, transparent formula.
export default function DailySalesPnlPanel() {
  const today = new Date().toISOString().slice(0, 10);
  const [day, setDay] = useState(today);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetch = async (d) => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/finance/daily-sales?day=${d}`);
      setData(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to load daily sales");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(day); }, [day]);

  const totals = data?.totals || {};
  const isProfit = (totals.net_profit || 0) >= 0;

  return (
    <div className="space-y-4" data-testid="daily-pnl-panel">
      {/* Header */}
      <div className="bg-white rounded-xl border border-[#E5E3DB] p-4 flex items-center justify-between">
        <div>
          <h2 className="font-heading text-base font-medium text-[#2C3531] flex items-center gap-2">
            <IndianRupee className="w-4 h-4 text-[#3B5249]" />
            Daily Sales &amp; Profit / Loss
          </h2>
          <p className="text-xs text-[#59615D] mt-1">Every order that landed today, broken down by team. Costs use per-product cost when set, else a 40 % default COGS assumption.</p>
        </div>
        <div>
          <Label className="text-[11px]">Date</Label>
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} data-testid="pnl-date" className="w-40" />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-[#59615D]">Loading…</div>
      ) : !data ? null : (
        <>
          {/* Top-level P&L cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card label="Orders" value={totals.orders} icon={Package} tone="slate" testid="pnl-orders" />
            <Card label="Revenue" value={`₹${totals.revenue?.toLocaleString("en-IN")}`} icon={TrendingUp} tone="blue" testid="pnl-revenue" />
            <Card label="Gross Profit" value={`₹${totals.gross_profit?.toLocaleString("en-IN")}`}
              icon={TrendingUp} tone={totals.gross_profit >= 0 ? "green" : "red"} testid="pnl-gross" />
            <Card
              label={isProfit ? "Net Profit" : "Net Loss"}
              value={`${isProfit ? "" : "-"}₹${Math.abs(totals.net_profit || 0).toLocaleString("en-IN")}`}
              subtext={`${totals.net_margin_pct || 0}% margin`}
              icon={isProfit ? ArrowUpRight : ArrowDownRight}
              tone={isProfit ? "green" : "red"}
              testid="pnl-net"
            />
          </div>

          {/* P&L breakdown */}
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-4">
            <h3 className="font-heading text-sm font-medium text-[#2C3531] mb-3">P&amp;L Breakdown</h3>
            <table className="w-full text-xs" data-testid="pnl-breakdown">
              <tbody>
                <PnlRow label="Revenue (gross sales)" value={totals.revenue} tone="pos" />
                <PnlRow label="Less: COGS (product cost)" value={-totals.cogs} tone="neg" />
                <PnlRow label="= Gross Profit" value={totals.gross_profit} bold />
                <PnlRow label="Less: Shipping cost (Delhivery/India Post est. ₹65/order)" value={-totals.shipping} tone="neg" />
                <PnlRow label="Less: Payment gateway fees (UPI/Razorpay 2.36 %)" value={-totals.gateway_fees} tone="neg" />
                <PnlRow label={isProfit ? "= Net Profit" : "= Net Loss"} value={totals.net_profit} bold big tone={isProfit ? "pos" : "neg"} />
              </tbody>
            </table>
            <div className="mt-3 flex items-center justify-between text-[11px] text-[#59615D]">
              <span>COD Revenue: ₹{totals.cod_revenue?.toLocaleString("en-IN")}</span>
              <span>Online Revenue: ₹{totals.online_revenue?.toLocaleString("en-IN")}</span>
              <span>Net margin: <b>{totals.net_margin_pct}%</b></span>
            </div>
          </div>

          {/* By-role breakdown */}
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-4">
            <h3 className="font-heading text-sm font-medium text-[#2C3531] mb-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-[#3B5249]" />
              Sales by Team
            </h3>
            {data.by_role?.length === 0 ? (
              <p className="text-sm text-[#59615D] py-4 text-center">No orders today.</p>
            ) : (
              <table className="w-full text-xs" data-testid="pnl-by-role-table">
                <thead>
                  <tr className="text-left text-[#59615D] uppercase text-[10px] border-b border-[#E5E3DB]">
                    <th className="py-2 pr-2">Team</th>
                    <th className="py-2 pr-2 text-right">Orders</th>
                    <th className="py-2 pr-2 text-right">Revenue</th>
                    <th className="py-2 pr-2 text-right">COGS</th>
                    <th className="py-2 pr-2 text-right">Gross Profit</th>
                    <th className="py-2 pr-2 text-right">Net P&amp;L</th>
                    <th className="py-2 pr-2 text-right">COD / Online</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_role.map((r) => (
                    <tr key={r.role} className="border-b border-[#F3F1EB]" data-testid={`pnl-row-${r.role}`}>
                      <td className="py-2 pr-2 font-medium">{ROLE_LABELS[r.role] || r.role}</td>
                      <td className="py-2 pr-2 text-right">{r.orders}</td>
                      <td className="py-2 pr-2 text-right">₹{r.revenue.toLocaleString("en-IN")}</td>
                      <td className="py-2 pr-2 text-right text-red-700">₹{r.cogs.toLocaleString("en-IN")}</td>
                      <td className="py-2 pr-2 text-right text-green-700">₹{r.gross_profit.toLocaleString("en-IN")}</td>
                      <td className={`py-2 pr-2 text-right font-semibold ${r.net_profit >= 0 ? "text-green-700" : "text-red-700"}`}>
                        ₹{r.net_profit.toLocaleString("en-IN")}
                      </td>
                      <td className="py-2 pr-2 text-right text-[10px] text-[#59615D]">{r.cod_orders} / {r.online_orders}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Assumptions footer */}
          <div className="bg-[#F9F8F6] rounded-xl border border-[#E5E3DB] p-3 text-[11px] text-[#59615D]">
            <b>Cost assumptions:</b> COGS uses <span className="font-mono">product.cost_price</span> when set, else <span className="font-mono">{Math.round((data.assumptions?.default_cost_ratio || 0.4) * 100)}%</span> of sale price.
            Shipping: ₹{data.assumptions?.shipping_per_order}/order. Gateway fee: {data.assumptions?.gateway_fee_pct}% on online payments.
            To sharpen this, set <span className="font-mono">cost_price</span> on each product in Inventory.
          </div>
        </>
      )}
    </div>
  );
}

const Card = ({ label, value, subtext, icon: Icon, tone, testid }) => {
  const toneMap = {
    slate: "text-slate-700 bg-slate-50 border-slate-200",
    blue: "text-blue-700 bg-blue-50 border-blue-200",
    green: "text-green-700 bg-green-50 border-green-200",
    red: "text-red-700 bg-red-50 border-red-200",
  };
  return (
    <div className={`bg-white rounded-xl border p-3 ${toneMap[tone] || toneMap.slate}`} data-testid={testid}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide mb-1 opacity-80">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <div className="text-xl font-semibold">{value ?? "—"}</div>
      {subtext && <div className="text-[10px] mt-0.5 opacity-70">{subtext}</div>}
    </div>
  );
};

const PnlRow = ({ label, value, bold, big, tone }) => {
  const toneCls = tone === "pos" ? "text-green-700" : tone === "neg" ? "text-red-700" : "text-[#2C3531]";
  return (
    <tr className={`border-b border-[#F3F1EB] ${bold ? "font-semibold" : ""}`}>
      <td className={`py-2 pr-2 ${bold ? "text-[#2C3531]" : "text-[#59615D]"}`}>{label}</td>
      <td className={`py-2 pr-2 text-right ${toneCls} ${big ? "text-lg" : ""}`}>
        ₹{(value ?? 0).toLocaleString("en-IN")}
      </td>
    </tr>
  );
};
