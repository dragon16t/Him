/**
 * ContactActivityPanel.jsx — SM/Admin view of every call + WhatsApp event
 * initiated by their telecallers, with date filter + PDF download.
 */
import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { Phone, MessageSquare, Download, Calendar, Users } from "lucide-react";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

export default function ContactActivityPanel({ smId }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [summary, setSummary] = useState({ telecallers: [], customers: [], total_events: 0 });

  const load = useCallback(async () => {
    try {
      const params = {};
      if (smId) params.sm_id = smId;
      if (from) params.from = from;
      if (to) params.to = to;
      const r = await axios.get(`${API}/contact-events/summary`, { params });
      setSummary(r.data);
    } catch (e) { /* silent */ }
  }, [smId, from, to]);
  useEffect(() => { load(); }, [load]);

  const downloadPdf = async () => {
    try {
      const params = new URLSearchParams();
      if (smId) params.set("sm_id", smId);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const token = localStorage.getItem("token");
      const r = await fetch(`${API}/contact-events/report/pdf?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return;
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `contact_report_${from || "all"}_${to || "now"}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { /* silent */ }
  };

  return (
    <div className="space-y-3" data-testid="contact-activity-panel">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-heading text-[16px] flex items-center gap-2 text-[#2C3531]"><Users className="w-4 h-4 text-[#3B5249]"/>Contact Activity — Calls &amp; WhatsApp</h3>
          <p className="text-[10px] text-[#7B6D5A]">Every call &amp; message initiated by your telecallers is tracked here. {summary.total_events} events in view.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-white rounded-full border border-[#E5E3DB] px-2 py-0.5">
            <Calendar className="w-3 h-3 text-[#7B6D5A]"/>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-6 text-[10px] border-0 p-1 w-32" data-testid="ca-from"/>
            <span className="text-[10px] text-[#7B6D5A]">to</span>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-6 text-[10px] border-0 p-1 w-32" data-testid="ca-to"/>
          </div>
          <button onClick={downloadPdf} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] bg-[#3B5249] text-white hover:bg-[#2C3531]" data-testid="ca-download-pdf"><Download className="w-3 h-3"/>Download PDF</button>
        </div>
      </div>

      {/* Per-TC cards */}
      {summary.telecallers.length === 0 ? (
        <div className="text-center py-6 bg-white border border-[#E5E3DB] rounded-2xl text-[#7B6D5A] text-sm" data-testid="ca-empty">No contact activity in this period.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2" data-testid="ca-tc-grid">
          {summary.telecallers.map(t => (
            <div key={t.tc_id} className="bg-white border border-[#E5E3DB] rounded-2xl p-3" data-testid={`ca-tc-${t.tc_id}`}>
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-sm text-[#2C3531]">{t.tc_name}</p>
                <Badge className="bg-[#3B5249] text-white text-[10px]">{t.total} events</Badge>
              </div>
              <div className="grid grid-cols-3 gap-1 text-center">
                <div className="bg-blue-50 rounded-lg py-1.5"><Phone className="w-3 h-3 mx-auto text-blue-700"/><div className="text-[13px] font-bold text-blue-800">{t.calls}</div><div className="text-[8px] uppercase text-blue-600">Calls</div></div>
                <div className="bg-emerald-50 rounded-lg py-1.5"><MessageSquare className="w-3 h-3 mx-auto text-emerald-700"/><div className="text-[13px] font-bold text-emerald-800">{t.whatsapp}</div><div className="text-[8px] uppercase text-emerald-600">WhatsApp</div></div>
                <div className="bg-[#F4EAE0] rounded-lg py-1.5"><Users className="w-3 h-3 mx-auto text-[#A66E4E]"/><div className="text-[13px] font-bold text-[#A66E4E]">{t.customers_contacted}</div><div className="text-[8px] uppercase text-[#A66E4E]">Customers</div></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Top customers */}
      {summary.customers.length > 0 && (
        <div className="bg-white border border-[#E5E3DB] rounded-2xl p-3">
          <p className="text-[11px] uppercase tracking-wider text-[#7B6D5A] mb-2">Top Customers Contacted</p>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {summary.customers.slice(0, 25).map((c, i) => (
              <div key={i} className="flex items-center justify-between text-[11px] p-1.5 border-b border-[#F0EDE5] last:border-0" data-testid={`ca-cust-${i}`}>
                <div className="flex-1 min-w-0">
                  <b>{c.customer_name || "—"}</b> · <span className="font-mono text-[10px]">{c.phone}</span>
                  <p className="text-[9px] text-[#7B6D5A]">Last: {(c.last_contact_at || "").slice(0, 16).replace('T', ' ')} by {c.last_tc_name || "—"}</p>
                </div>
                <div className="flex gap-1.5 text-[10px]">
                  <span className="text-blue-700"><Phone className="w-2.5 h-2.5 inline"/>{c.calls}</span>
                  <span className="text-emerald-700"><MessageSquare className="w-2.5 h-2.5 inline"/>{c.whatsapp}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
