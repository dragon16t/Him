/**
 * TelecallerLeaderboardPanel.jsx — Ranked leaderboard for any role, with range switcher.
 * Used on TC / SM / Admin dashboards.
 *
 * Props:
 *   role         — "telecaller" | "agent" | "sales_manager" | ... (default "telecaller")
 *   currentUserId — highlight the current user's row when this matches
 *   compact      — smaller card for embedding
 */
import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Trophy } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

const RANGES = [
  { v: "today", l: "Today" },
  { v: "7d", l: "This Week" },
  { v: "30d", l: "Last 30 days" },
  { v: "all", l: "All Time" },
  { v: "custom", l: "Custom" },
];
const METRICS = [
  { v: "orders", l: "Orders" },
  { v: "delivered", l: "Delivered" },
  { v: "revenue", l: "Revenue" },
];

const INR = (n) => `Rs.${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export default function TelecallerLeaderboardPanel({ role = "telecaller", currentUserId, compact }) {
  const [range, setRange] = useState("7d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [metric, setMetric] = useState("orders");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { range, metric };
      // Backend re-uses month/year params for custom (from/to) — passed as ISO YYYY-MM-DD
      if (range === "custom") {
        if (!customFrom || !customTo) { setLoading(false); return; }
        params.month = customFrom;
        params.year = customTo;
      }
      const { data } = await axios.get(`${API}/leaderboard/${role}`, { params });
      setRows(data.leaderboard || []);
      setMeta({ from: data.from, to: data.to, range: data.range });
    } catch {}
    setLoading(false);
  }, [role, range, metric, customFrom, customTo]);
  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className={`bg-white rounded-xl border border-[#E5E3DB] p-4 ${compact ? "" : "mb-4"}`} data-testid="tc-leaderboard">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h3 className="font-heading text-base font-medium flex items-center gap-1.5"><Trophy className="w-4 h-4 text-amber-500"/>{role === "telecaller" ? "Telecaller" : role === "agent" ? "Agent" : role.replace(/_/g, " ")} Leaderboard</h3>
        <div className="flex flex-wrap gap-1" data-testid="lb-controls">
          <div className="flex gap-1" data-testid="lb-range">
            {RANGES.map(r => (
              <button key={r.v} onClick={() => setRange(r.v)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-medium ${range === r.v ? "bg-[#3B5249] text-white" : "bg-[#F9F8F6] border border-[#E5E3DB] text-[#59615D]"}`}
                data-testid={`lb-range-${r.v}`}>{r.l}</button>
            ))}
          </div>
          {range === "custom" && (
            <div className="flex items-center gap-1 ml-1" data-testid="lb-custom-range">
              <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="h-7 rounded-full w-36 text-[10px]" data-testid="lb-from"/>
              <span className="text-[10px] text-[#7B6D5A]">→</span>
              <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="h-7 rounded-full w-36 text-[10px]" data-testid="lb-to"/>
              <Button size="sm" className="h-7 px-3 rounded-full text-[10px] bg-[#3B5249] text-white" onClick={fetchData} data-testid="lb-apply">Apply</Button>
            </div>
          )}
          <div className="flex gap-1 ml-1" data-testid="lb-metric">
            {METRICS.map(m => (
              <button key={m.v} onClick={() => setMetric(m.v)}
                className={`px-2 py-1 rounded-full text-[9px] font-medium ${metric === m.v ? "bg-[#A66E4E] text-white" : "bg-[#F9F8F6] border border-[#E5E3DB] text-[#59615D]"}`}
                data-testid={`lb-metric-${m.v}`}>{m.l}</button>
            ))}
          </div>
        </div>
      </div>
      {meta.from && meta.to && (
        <p className="text-[9px] text-[#7B6D5A] mb-2" data-testid="lb-window">Window: <b>{meta.from}</b> → <b>{meta.to}</b> · Sorting by <b>{metric}</b></p>
      )}
      {loading ? (
        <p className="text-center py-6 text-[#59615D] text-sm">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-center py-6 text-[#59615D] text-sm">No data in this window.</p>
      ) : (
        <div className="space-y-1.5" data-testid="lb-rows">
          {rows.map((u, i) => (
            <div key={u.id}
              className={`flex justify-between items-center rounded-lg p-2.5 ${u.id === currentUserId ? "bg-[#F9F8F6] border-2 border-[#3B5249]" : "border border-[#E5E3DB]"}`}
              data-testid={`leader-${i+1}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-bold text-lg w-8 text-center flex-shrink-0">{i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}</span>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{u.name}{u.id === currentUserId && <Badge className="ml-1 text-[8px] bg-[#3B5249] text-white">YOU</Badge>}</p>
                  <p className="text-[9px] text-[#59615D]">
                    <b>{u.orders}</b> orders · <b>{u.delivered}</b> delivered · commission {INR(u.commission)}
                  </p>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-heading text-lg font-bold text-[#3B5249]">{INR(u.revenue)}</p>
                <p className="text-[9px] text-emerald-700">del: {INR(u.delivered_revenue)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
