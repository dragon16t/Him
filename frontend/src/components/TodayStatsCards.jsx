/**
 * TodayStatsCards — compact 3-card strip showing today's key numbers.
 * Mount it at the top of Admin / SM / Inventory Manager dashboards.
 *
 *   ┌─────────────┬─────────────┬─────────────┐
 *   │ Orders Today│ Revenue Today│ Leads Today │
 *   │     12      │   ₹15,200    │     34      │
 *   └─────────────┴─────────────┴─────────────┘
 *
 * Optional `showLeaderboard` shows a popover with which TC added how many.
 */
import { useEffect, useState } from "react";
import axios from "axios";
import { Package, IndianRupee, Users, ChevronRight, X } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

export default function TodayStatsCards({ showLeaderboard = true, showOrdersDetail = true }) {
  const [stats, setStats] = useState(null);
  const [open, setOpen] = useState(null); // "leads" | "orders" | null

  const load = async () => {
    try {
      const { data } = await axios.get(`${API}/today-stats`);
      setStats(data);
    } catch (e) {
      // silent — non-critical UI
    }
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  const Card = ({ icon: Icon, label, value, color, onClick, testId }) => (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`flex-1 min-w-[140px] bg-white rounded-2xl border border-[#E5E3DB] p-3 sm:p-4 text-left transition ${onClick ? "hover:border-[#3B5249] hover:shadow-sm cursor-pointer" : ""}`}
      data-testid={testId}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${color}`}><Icon className="w-4 h-4" strokeWidth={2}/></div>
        {onClick && <ChevronRight className="w-3.5 h-3.5 text-[#7B6D5A]"/>}
      </div>
      <div className="text-[10px] tracking-[0.14em] uppercase text-[#7B6D5A] font-medium">{label}</div>
      <div className="text-[20px] font-bold text-[#2C3531] mt-0.5 leading-tight">{value}</div>
    </button>
  );

  if (!stats) {
    return (
      <div className="flex gap-2 sm:gap-3 mb-4" data-testid="today-stats-loading">
        {[1,2,3].map(i => <div key={i} className="flex-1 min-w-[140px] bg-white rounded-2xl border border-[#E5E3DB] p-4 animate-pulse h-[88px]"/>)}
      </div>
    );
  }
  return (
    <>
      <div className="flex gap-2 sm:gap-3 mb-4 overflow-x-auto" data-testid="today-stats-cards">
        <Card testId="today-orders-card" icon={Package} label="Today's Orders" value={stats.orders_today_count} color="bg-[#DBE9DD] text-[#15803D]" onClick={showOrdersDetail ? () => setOpen("orders") : null}/>
        <Card testId="today-revenue-card" icon={IndianRupee} label="Today's Revenue" value={`₹${(stats.revenue_today || 0).toLocaleString("en-IN")}`} color="bg-[#FFF3E0] text-[#D4A373]"/>
        <Card testId="today-leads-card" icon={Users} label="Today's Leads" value={stats.leads_today_count} color="bg-[#E5E1F5] text-[#6358B0]" onClick={showLeaderboard ? () => setOpen("leads") : null}/>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={() => setOpen(null)} data-testid="today-stats-modal">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-[#E5E3DB] px-4 py-3 flex items-center justify-between">
              <h3 className="font-heading text-[14px] text-[#2C3531]">
                {open === "leads" ? `Today's Leads · by Telecaller (${stats.leads_today_count})` : `Today's Orders (${stats.orders_today_count})`}
              </h3>
              <button onClick={() => setOpen(null)} className="text-[#7B6D5A]" data-testid="close-today-modal"><X className="w-4 h-4"/></button>
            </div>
            <div className="p-4 space-y-3">
              {open === "leads" && (stats.telecaller_leaderboard || []).length === 0 && <p className="text-center text-[12px] text-[#7B6D5A] py-6">No leads added yet today.</p>}
              {open === "leads" && (stats.telecaller_leaderboard || []).map(tc => (
                <div key={tc.id} className="border border-[#E5E3DB] rounded-xl p-3" data-testid={`leaderboard-tc-${tc.id}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-[13px] text-[#2C3531]">{tc.name}</p>
                    <span className="text-[11px] bg-[#3B5249] text-white rounded-full px-2 py-0.5 font-bold">{tc.count} leads</span>
                  </div>
                  <ul className="space-y-1 max-h-44 overflow-y-auto">
                    {(tc.leads || []).map((l, i) => (
                      <li key={i} className="text-[11px] flex items-center justify-between text-[#3B5249] border-b border-[#F0EDE5] last:border-0 py-1">
                        <span><b>{l.name || "Unnamed"}</b> · <span className="font-mono">{l.phone}</span></span>
                        <a href={`https://wa.me/91${(l.phone || "").replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="text-[#15803D] text-[10px] underline">WhatsApp</a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {open === "orders" && (stats.orders_today || []).length === 0 && <p className="text-center text-[12px] text-[#7B6D5A] py-6">No orders placed yet today.</p>}
              {open === "orders" && (stats.orders_today || []).map(o => (
                <div key={o.id} className="border border-[#E5E3DB] rounded-xl p-3 flex items-start justify-between" data-testid={`today-order-${o.id}`}>
                  <div>
                    <p className="text-[12px] font-medium">{o.customer_name} · <span className="text-[10px] font-mono">{o.customer_phone}</span></p>
                    <p className="text-[10px] text-[#7B6D5A]">{o.id} · {o.payment_type?.toUpperCase()} · by {o.created_by_name || "—"}</p>
                  </div>
                  <p className="text-[13px] font-bold text-[#3B5249]">₹{o.total_amount}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
