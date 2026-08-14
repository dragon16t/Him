import React, { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { FileSpreadsheet } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

// ── Multi-year Balance Sheet viewer — reads /finance/balance-sheet and shows
// Cash / Debtors / Inventory / Furniture / Total Current Assets per month per year.
export default function BalanceSheetPanel() {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get(`${API}/finance/balance-sheet`);
        setData(data.balance_sheet || {});
      } catch (e) {
        toast.error("Failed to load balance sheet");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-4" data-testid="bs-panel">
      <div className="bg-white rounded-xl border border-[#E5E3DB] p-4">
        <h2 className="font-heading text-base font-medium text-[#2C3531] flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-[#3B5249]" />
          Balance Sheet — 3-Year View
        </h2>
        <p className="text-[11px] text-[#59615D] mt-1">
          Cash / Debtors / Inventory / Furniture / Total Current Assets straight from your uploaded projection sheets.
        </p>
      </div>

      {loading ? (
        <p className="text-center py-6 text-[#59615D]">Loading balance sheet…</p>
      ) : Object.keys(data).length === 0 ? (
        <p className="text-center py-6 text-[#59615D]">No projection data seeded.</p>
      ) : (
        [1, 2, 3].map((y) => {
          const rows = data[y] || data[String(y)] || [];
          if (!rows.length) return null;
          return (
            <div key={y} className="bg-white rounded-xl border border-[#E5E3DB] p-4 overflow-x-auto" data-testid={`bs-year-${y}`}>
              <h3 className="font-heading text-sm font-medium text-[#2C3531] mb-3">Year {y}</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[#59615D] uppercase text-[10px] border-b border-[#E5E3DB]">
                    <th className="py-2 pr-2">Metric</th>
                    {rows.map((r) => (
                      <th key={r.month_index} className="py-2 pr-2 text-right">{r.month}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <BsRow label="Cash in Hand" rows={rows} field="cash" />
                  <BsRow label="Debtors" rows={rows} field="debtors" />
                  <BsRow label="Inventory" rows={rows} field="inventory" />
                  <BsRow label="Furniture (Net)" rows={rows} field="furniture_net" />
                  <BsRow label="Total Current Assets" rows={rows} field="total_current_assets" bold />
                </tbody>
              </table>
            </div>
          );
        })
      )}
    </div>
  );
}

const fmt = (n) => (Math.round(n || 0)).toLocaleString("en-IN");

const BsRow = ({ label, rows, field, bold }) => (
  <tr className={`border-b border-[#F3F1EB] ${bold ? "font-semibold text-[#2C3531]" : ""}`}>
    <td className={`py-2 pr-2 ${bold ? "" : "text-[#59615D]"}`}>{label}</td>
    {rows.map((r) => (
      <td key={r.month_index} className="py-2 pr-2 text-right">₹{fmt(r[field])}</td>
    ))}
  </tr>
);
