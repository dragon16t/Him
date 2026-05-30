import { useState, useEffect } from "react";
import axios from "axios";
import { TrendingUp, ShoppingBag, Phone, Truck, IndianRupee, Award } from "lucide-react";

const API = "/api";

/** Big-screen Live Operations Wall — full-screen TV view, auto-refreshes every 10s. */
export default function LiveOpsWall() {
  const [d, setD] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const fetch = () => axios.get(`${API}/live/ops-wall`).then(r => setD(r.data)).catch(() => {});
    fetch();
    const t = setInterval(fetch, 10000);
    const k = setInterval(() => setTick(x => x + 1), 1000);
    return () => { clearInterval(t); clearInterval(k); };
  }, []);

  if (!d) return <div className="min-h-screen bg-black text-white flex items-center justify-center"><p className="text-2xl">Loading Live Wall…</p></div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F1714] via-[#2C3531] to-[#3B5249] text-white p-8 overflow-hidden relative">
      {/* Grain overlay */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, white 1px, transparent 1px)', backgroundSize: '4px 4px' }} />

      <div className="relative z-10 max-w-[1800px] mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-6xl font-heading font-bold">CELESTA <span className="text-[#D4A373]">GLOW</span></h1>
            <p className="text-sm opacity-70 tracking-[0.3em] uppercase mt-1">Live Operations Wall · {new Date().toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-xs opacity-60 uppercase tracking-widest">Refreshing every 10s</p>
            <div className="flex items-center gap-2 mt-1 justify-end">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"/>
              <p className="text-xs opacity-80">LIVE · {tick}s</p>
            </div>
          </div>
        </div>

        {/* Hero KPI */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-gradient-to-br from-[#3B5249] to-[#2C3531] rounded-3xl border border-[#A66E4E]/30 p-8 md:col-span-2 backdrop-blur">
            <div className="flex items-center gap-2 opacity-60 text-xs uppercase tracking-[0.3em]"><IndianRupee className="w-4 h-4"/>Revenue Today</div>
            <p className="text-7xl md:text-8xl font-heading font-bold mt-3 bg-gradient-to-r from-[#D4A373] to-[#A66E4E] bg-clip-text text-transparent">
              ₹{d.revenue_today.toLocaleString()}
            </p>
            <p className="text-sm opacity-60 mt-2">From {d.delivered_today} delivered orders</p>
          </div>
          <Stat icon={ShoppingBag} label="Orders Today" value={d.orders_today} sub={`+${d.orders_last_hour} in last hour`} color="#6B8E6B" />
          <Stat icon={Truck} label="Deliveries" value={d.deliveries_last_hour} sub="in last hour" color="#A66E4E" />
        </div>

        {/* Secondary KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Stat icon={Phone} label="Leads Today" value={d.leads_today} sub={`${d.leads_last_10m} in last 10m`} small />
          <Stat icon={TrendingUp} label="Conversion" value={d.orders_today > 0 ? `${Math.round(d.delivered_today / d.orders_today * 100)}%` : "—"} sub="delivered/created" small />
          <div className="bg-black/30 rounded-2xl border border-[#A66E4E]/40 p-5 backdrop-blur md:col-span-2">
            <div className="flex items-center gap-2 opacity-60 text-[10px] uppercase tracking-widest"><Award className="w-3.5 h-3.5"/>Top Performer Today</div>
            <p className="text-3xl font-heading font-semibold mt-1">{d.top_performer.name}</p>
            <p className="text-sm text-[#D4A373] mt-1">₹{d.top_performer.revenue.toLocaleString()} revenue 👑</p>
          </div>
        </div>

        {/* Tickers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-black/30 rounded-2xl border border-white/10 p-5">
            <p className="text-xs uppercase tracking-[0.3em] opacity-60 mb-3 flex items-center gap-2"><ShoppingBag className="w-3.5 h-3.5"/>Recent Orders</p>
            <div className="space-y-2 max-h-72 overflow-hidden">
              {d.recent_orders.length === 0 && <p className="text-sm opacity-50">No orders yet today</p>}
              {d.recent_orders.map(o => (
                <div key={o.id} className="flex items-center justify-between text-sm border-b border-white/5 pb-2">
                  <div>
                    <p className="font-semibold">{o.customer}</p>
                    <p className="text-[10px] opacity-60 font-mono">{o.id}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[#D4A373] font-semibold">₹{o.amount.toLocaleString()}</p>
                    <p className="text-[10px] opacity-60 uppercase">{o.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-black/30 rounded-2xl border border-[#6B8E6B]/30 p-5">
            <p className="text-xs uppercase tracking-[0.3em] opacity-60 mb-3 flex items-center gap-2"><Truck className="w-3.5 h-3.5"/>Live Deliveries 🎉</p>
            <div className="space-y-2 max-h-72 overflow-hidden">
              {d.delivered_last_hour.length === 0 && <p className="text-sm opacity-50">No deliveries in last hour</p>}
              {d.delivered_last_hour.map(o => (
                <div key={o.id} className="flex items-center justify-between text-sm border-b border-[#6B8E6B]/20 pb-2 animate-fade-in">
                  <p className="font-semibold">{o.customer}</p>
                  <p className="text-[#6B8E6B] font-semibold">₹{o.amount.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const Stat = ({ icon: Icon, label, value, sub, color = "#D4A373", small = false }) => (
  <div className={`bg-black/30 rounded-2xl border border-white/10 backdrop-blur ${small ? "p-4" : "p-6"}`}>
    <div className="flex items-center gap-2 opacity-60 text-[10px] uppercase tracking-widest"><Icon className="w-3.5 h-3.5" />{label}</div>
    <p className={`${small ? "text-3xl" : "text-5xl"} font-heading font-bold mt-1`} style={{ color }}>{value}</p>
    {sub && <p className="text-[11px] opacity-60 mt-1">{sub}</p>}
  </div>
);
