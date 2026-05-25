import { useState, useEffect } from "react";
import axios from "axios";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart } from "recharts";
import { toast } from "sonner";
import { TrendingUp, IndianRupee } from "lucide-react";

const API = "/api";

/** Forecasting chart for admin — historical + projected revenue. */
export default function ForecastChart() {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    axios.get(`${API}/admin/forecast?days=${days}`)
      .then(r => setData(r.data))
      .catch(e => toast.error("Forecast failed"))
      .finally(() => setLoading(false));
  }, [days]);

  if (loading || !data) return <p className="text-center py-12 text-[#59615D]">Building forecast…</p>;

  const merged = [
    ...data.historical.map(h => ({ day: h.day, actual: h.revenue, projected: null })),
    ...data.projection.map(p => ({ day: p.day, actual: null, projected: p.projected_revenue })),
  ];
  const totalProjected = data.projection.reduce((s, p) => s + p.projected_revenue, 0);

  return (
    <div className="space-y-3" data-testid="forecast-chart">
      <div className="bg-white rounded-2xl border border-[#E5E3DB] p-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className="font-heading text-lg font-medium flex items-center gap-2"><TrendingUp className="w-5 h-5 text-[#3B5249]" />Revenue Forecast</h3>
            <p className="text-xs text-[#59615D]">Based on last 90d of delivered orders · linear trend projection</p>
          </div>
          <div className="flex gap-1">
            {[30, 60, 90].map(n => (
              <button key={n} onClick={() => setDays(n)}
                className={`px-3 py-1 rounded-full text-xs ${days === n ? "bg-[#3B5249] text-white" : "border border-[#E5E3DB] hover:bg-[#F9F8F6]"}`}
                data-testid={`forecast-${n}d`}>{n}d</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl bg-gradient-to-br from-[#F9F8F6] to-white border border-[#E5E3DB] p-3">
            <p className="text-[10px] uppercase text-[#59615D]">Avg / Day</p>
            <p className="text-xl font-heading font-semibold text-[#3B5249]">Rs.{Math.round(data.avg_per_day).toLocaleString()}</p>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-[#FDF6F0] to-white border border-[#E5E3DB] p-3">
            <p className="text-[10px] uppercase text-[#59615D]">Trend</p>
            <p className="text-xl font-heading font-semibold text-[#A66E4E]">{data.trend_per_day == null || isNaN(data.trend_per_day) ? "—" : `${data.trend_per_day > 0 ? "+" : ""}Rs.${Math.round(data.trend_per_day)}/day`}</p>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-[#EEF2EF] to-white border border-[#E5E3DB] p-3">
            <p className="text-[10px] uppercase text-[#59615D]">Projected next {days}d</p>
            <p className="text-xl font-heading font-semibold text-[#6B8E6B]">Rs.{Math.round(totalProjected).toLocaleString()}</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={merged}>
            <defs>
              <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3B5249" stopOpacity={0.4}/><stop offset="100%" stopColor="#3B5249" stopOpacity={0}/></linearGradient>
              <linearGradient id="gp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#A66E4E" stopOpacity={0.4}/><stop offset="100%" stopColor="#A66E4E" stopOpacity={0}/></linearGradient>
            </defs>
            <CartesianGrid stroke="#E5E3DB" strokeDasharray="3 3"/>
            <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={s => (s || "").slice(5)} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${Math.round(v/1000)}k`} />
            <Tooltip formatter={v => `Rs.${Math.round(v || 0).toLocaleString()}`} />
            <Area type="monotone" dataKey="actual" stroke="#3B5249" strokeWidth={2} fill="url(#ga)" name="Actual" />
            <Area type="monotone" dataKey="projected" stroke="#A66E4E" strokeWidth={2} strokeDasharray="5 5" fill="url(#gp)" name="Projected" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
