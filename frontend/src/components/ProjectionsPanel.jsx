import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, Layers, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

// ── Projected vs Actual dashboard (Year 1 / 2 / 3 projections)
// Reads the 3 uploaded projection sheets from MongoDB and compares them
// against ACTUAL orders aggregated by calendar month.
export default function ProjectionsPanel() {
  const [year, setYear] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reseeding, setReseeding] = useState(false);

  const load = async (y) => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/finance/projections/vs-actual?year=${y}`);
      setData(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Load failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(year); }, [year]);

  const reseed = async () => {
    setReseeding(true);
    try {
      const { data } = await axios.post(`${API}/finance/projections/reseed`);
      toast.success(`Reloaded ${data?.loaded || 0} projection rows from uploaded sheets`);
      load(year);
    } catch (e) {
      toast.error("Reseed failed");
    } finally {
      setReseeding(false);
    }
  };

  const totals = data?.totals || {};
  const variancePositive = (totals.variance_net || 0) >= 0;

  return (
    <div className="space-y-4" data-testid="projections-panel">
      <div className="bg-white rounded-xl border border-[#E5E3DB] p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#3B5249]" />
            <h2 className="font-heading text-base font-medium text-[#2C3531]">Projections vs Actual (Year {year})</h2>
          </div>
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((y) => (
              <button key={y} onClick={() => setYear(y)}
                className={`text-xs px-3 py-1 rounded-full border transition ${year === y ? "bg-[#3B5249] text-white border-[#3B5249]" : "bg-white text-[#3B5249] border-[#E5E3DB]"}`}
                data-testid={`proj-year-${y}`}>
                Year {y}
              </button>
            ))}
            <Button size="sm" variant="outline" onClick={reseed} disabled={reseeding} className="rounded-full text-xs">
              <RefreshCw className={`w-3 h-3 mr-1 ${reseeding ? "animate-spin" : ""}`} />
              Reload from sheets
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-[#59615D]">
          Compares the projected monthly Sales, COGS, marketing, salary, tech and depreciation from the uploaded Year-{year} sheet against real orders aggregated from the CRM.
          Variance = Actual − Projected (positive means we beat plan).
        </p>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SumCard label="Projected Revenue" value={totals.projected_revenue} tone="blue" testid="proj-rev" />
        <SumCard label="Actual Revenue" value={totals.actual_revenue} tone="slate" testid="actual-rev" />
        <SumCard label="Projected Net" value={totals.projected_net} tone={(totals.projected_net||0) >= 0 ? "green" : "red"} testid="proj-net" />
        <SumCard
          label="Net Variance"
          value={totals.variance_net}
          subtext={variancePositive ? "Beating plan" : "Below plan"}
          tone={variancePositive ? "green" : "red"}
          icon={variancePositive ? TrendingUp : TrendingDown}
          testid="proj-variance"
        />
      </div>

      {/* Monthly table */}
      <div className="bg-white rounded-xl border border-[#E5E3DB] p-4 overflow-x-auto" data-testid="projections-table">
        {loading ? (
          <p className="text-center py-6 text-[#59615D]">Loading…</p>
        ) : !data?.rows?.length ? (
          <p className="text-center py-6 text-[#59615D]">
            No projection data seeded yet for Year {year}. Click <b>Reload from sheets</b>.
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[#59615D] uppercase text-[10px] border-b border-[#E5E3DB]">
                <th className="py-2 pr-2">Month</th>
                <th className="py-2 pr-2 text-right">Proj Sales</th>
                <th className="py-2 pr-2 text-right">Actual Rev</th>
                <th className="py-2 pr-2 text-right">Δ Revenue</th>
                <th className="py-2 pr-2 text-right">Marketing</th>
                <th className="py-2 pr-2 text-right">Salary</th>
                <th className="py-2 pr-2 text-right">Tech</th>
                <th className="py-2 pr-2 text-right">Deprec.</th>
                <th className="py-2 pr-2 text-right">Proj Net</th>
                <th className="py-2 pr-2 text-right">Actual Net</th>
                <th className="py-2 pr-2 text-right">Δ Net</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.month_index} className="border-b border-[#F3F1EB]">
                  <td className="py-2 pr-2 font-medium">{r.month}</td>
                  <td className="py-2 pr-2 text-right">₹{fmt(r.sales)}</td>
                  <td className="py-2 pr-2 text-right">₹{fmt(r.actual_revenue)}</td>
                  <td className={`py-2 pr-2 text-right font-medium ${r.variance_revenue >= 0 ? "text-green-700" : "text-red-700"}`}>
                    {r.variance_revenue >= 0 ? "+" : ""}₹{fmt(r.variance_revenue)}
                  </td>
                  <td className="py-2 pr-2 text-right text-red-700">₹{fmt(r.marketing)}</td>
                  <td className="py-2 pr-2 text-right text-red-700">₹{fmt(r.employee)}</td>
                  <td className="py-2 pr-2 text-right text-red-700">₹{fmt(r.tech)}</td>
                  <td className="py-2 pr-2 text-right text-red-700">₹{fmt(r.depreciation)}</td>
                  <td className={`py-2 pr-2 text-right ${(r.net_income || 0) >= 0 ? "text-green-700" : "text-red-700"}`}>
                    ₹{fmt(r.net_income)}
                  </td>
                  <td className={`py-2 pr-2 text-right ${(r.actual_net_income || 0) >= 0 ? "text-green-700" : "text-red-700"}`}>
                    ₹{fmt(r.actual_net_income)}
                  </td>
                  <td className={`py-2 pr-2 text-right font-semibold ${(r.variance_net || 0) >= 0 ? "text-green-700" : "text-red-700"}`}>
                    {r.variance_net >= 0 ? "+" : ""}₹{fmt(r.variance_net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-[#F9F8F6] rounded-xl border border-[#E5E3DB] p-3 text-[11px] text-[#59615D]">
        Notes: Actual Net is estimated as (Actual Revenue − 40 % COGS − projected fixed opex). Depreciation
        is straight from the projection sheet; set <span className="font-mono">products.cost_price</span>
        in Inventory to sharpen COGS. Reload from sheets after uploading new projection files to <span className="font-mono">/app/backend/data/projections/</span>.
      </div>
    </div>
  );
}

const fmt = (n) => (Math.round(n || 0)).toLocaleString("en-IN");

const SumCard = ({ label, value, subtext, icon: Icon, tone, testid }) => {
  const cls = {
    slate: "text-slate-700 bg-slate-50 border-slate-200",
    blue: "text-blue-700 bg-blue-50 border-blue-200",
    green: "text-green-700 bg-green-50 border-green-200",
    red: "text-red-700 bg-red-50 border-red-200",
  }[tone] || "text-slate-700 bg-slate-50 border-slate-200";
  return (
    <div className={`bg-white rounded-xl border p-3 ${cls}`} data-testid={testid}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide mb-1 opacity-80">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </div>
      <div className="text-lg font-semibold">₹{fmt(value)}</div>
      {subtext && <div className="text-[10px] mt-0.5 opacity-70">{subtext}</div>}
    </div>
  );
};
