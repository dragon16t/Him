/**
 * CustomerProfileDialog.jsx — Full customer view (leads + orders + contact events).
 * Opens by phone number. Used from search results on Admin + SM.
 */
import { useEffect, useState } from "react";
import axios from "axios";
import { Phone, MessageSquare, Package, ClipboardList, IndianRupee, ChevronRight, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Badge } from "./ui/badge";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

export default function CustomerProfileDialog({ phone, open, onOpenChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open || !phone) return;
    setLoading(true);
    axios.get(`${API}/customers/profile`, { params: { phone } })
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [open, phone]);
  const s = data?.stats || {};
  const wa = (msg) => {
    if (!phone) return "#";
    const n = phone.replace(/\D/g, "").replace(/^91/, "");
    return `https://wa.me/91${n}${msg ? `?text=${encodeURIComponent(msg)}` : ""}`;
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="customer-profile-dialog" aria-describedby="cp-desc">
        <DialogHeader><DialogTitle className="font-heading">Customer Profile</DialogTitle></DialogHeader>
        <p id="cp-desc" className="sr-only">Full customer profile with leads, orders, and contact events.</p>
        {loading ? <p className="text-center py-8 text-[11px] text-[#7B6D5A]">Loading…</p> : !data ? <p className="text-center py-8 text-[11px] text-[#A66E4E]">Not found</p> : (
          <div className="space-y-3">
            <div className="bg-[#F9F8F6] rounded-2xl p-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="font-medium text-lg text-[#2C3531]">{data.profile?.name || "—"}</p>
                  <p className="text-[11px] font-mono text-[#3B5249]">{phone}</p>
                  {data.profile?.address && <p className="text-[10px] text-[#7B6D5A]">📍 {data.profile.address}{data.profile.city ? `, ${data.profile.city}` : ""}{data.profile.pincode ? ` - ${data.profile.pincode}` : ""}</p>}
                </div>
                <div className="flex gap-1.5">
                  <a href={`tel:${phone}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] bg-blue-50 border border-blue-300 text-blue-800" data-testid="cp-call"><Phone className="w-3 h-3"/>Call</a>
                  <a href={wa()} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] bg-emerald-50 border border-emerald-300 text-emerald-800" data-testid="cp-wa"><MessageSquare className="w-3 h-3"/>WhatsApp</a>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-[#F4EAE0] rounded-xl p-2"><Package className="w-3 h-3 mx-auto text-[#A66E4E]"/><p className="text-[16px] font-bold text-[#3B5249]">{s.total_orders || 0}</p><p className="text-[9px] uppercase text-[#7B6D5A]">Orders</p></div>
              <div className="bg-[#DBE9DD] rounded-xl p-2"><ChevronRight className="w-3 h-3 mx-auto text-[#15803D]"/><p className="text-[16px] font-bold text-[#15803D]">{s.delivered_orders || 0}</p><p className="text-[9px] uppercase text-emerald-800">Delivered</p></div>
              <div className="bg-[#E5E1F5] rounded-xl p-2"><IndianRupee className="w-3 h-3 mx-auto text-[#6358B0]"/><p className="text-[14px] font-bold text-[#6358B0]">₹{Number(s.total_spend || 0).toLocaleString("en-IN")}</p><p className="text-[9px] uppercase text-[#6358B0]">Total spend</p></div>
              <div className="bg-[#F9F8F6] rounded-xl p-2"><MessageSquare className="w-3 h-3 mx-auto text-[#3B5249]"/><p className="text-[16px] font-bold text-[#3B5249]">{(s.total_calls || 0) + (s.total_whatsapp || 0)}</p><p className="text-[9px] uppercase text-[#7B6D5A]">Contacts</p></div>
            </div>

            {/* Orders */}
            {(data.orders || []).length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-[#7B6D5A] mb-1.5"><Package className="w-3 h-3 inline mr-1"/>Orders</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {data.orders.map(o => (
                    <div key={o.id} className="bg-white border border-[#E5E3DB] rounded-xl p-2 flex items-center justify-between" data-testid={`cp-order-${o.id}`}>
                      <div className="text-[11px]">
                        <b>{o.id}</b> · {o.status} · by {o.created_by_name || "—"}
                        <p className="text-[9px] text-[#7B6D5A]">{(o.created_at || "").slice(0, 10)} · {(o.items || []).map(i => i.name).slice(0, 2).join(", ")}</p>
                      </div>
                      <p className="text-[11px] font-bold text-[#3B5249]">₹{o.total_amount}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Leads */}
            {(data.leads || []).length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-[#7B6D5A] mb-1.5"><ClipboardList className="w-3 h-3 inline mr-1"/>Leads</p>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {data.leads.map(l => (
                    <div key={l.id} className="bg-white border border-[#E5E3DB] rounded-xl p-2 flex items-center justify-between" data-testid={`cp-lead-${l.id}`}>
                      <div className="text-[11px]">
                        {l.status} · assigned <b>{l.assigned_to_name || "—"}</b>
                        {l.remarks && <p className="text-[9px] text-[#7B6D5A]">{l.remarks}</p>}
                      </div>
                      <span className="text-[9px] text-[#A66E4E]">{(l.created_at || "").slice(0, 10)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Contact Events timeline */}
            {(data.events || []).length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-[#7B6D5A] mb-1.5">Contact History ({data.events.length})</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {data.events.map(e => (
                    <div key={e.id} className="border-l-2 border-[#3B5249] pl-2 py-0.5" data-testid={`cp-event-${e.id}`}>
                      <p className="text-[11px]">
                        {e.type === "call" ? <Phone className="w-3 h-3 inline text-blue-700"/> : <MessageSquare className="w-3 h-3 inline text-emerald-700"/>}
                        <b className="ml-1">{e.type}</b> by <b>{e.tc_name || "—"}</b>
                        <span className="text-[9px] text-[#7B6D5A]"> · {(e.created_at || "").slice(0, 16).replace('T', ' ')}</span>
                      </p>
                      {e.remarks && <p className="text-[10px] text-[#59615D]">{e.remarks}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
