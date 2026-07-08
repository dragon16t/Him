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
              {(() => {
                // Show the most-recent TC + SM who is currently owning this customer
                const src = (data.orders?.[0]) || (data.leads?.[0]);
                if (!src) return null;
                const tcName = src.created_by_name || src.assigned_to_name;
                const smName = src.sales_manager_name;
                if (!tcName && !smName) return null;
                return (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]" data-testid="cp-owning-team">
                    {tcName && <span className="px-2 py-1 rounded-full bg-white border border-[#E5E3DB]">👤 <b>Telecaller/Agent:</b> {tcName}</span>}
                    {smName && <span className="px-2 py-1 rounded-full bg-white border border-[#E5E3DB]">🎯 <b>Sales Manager:</b> {smName}</span>}
                    {data.leads && data.leads.length > 0 && <span className="px-2 py-1 rounded-full bg-white border border-[#E5E3DB]">📅 First seen: {(data.leads[data.leads.length - 1].created_at || "").slice(0, 10)}</span>}
                  </div>
                );
              })()}
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
                <p className="text-[11px] uppercase tracking-wider text-[#7B6D5A] mb-1.5"><Package className="w-3 h-3 inline mr-1"/>Purchase Orders ({data.orders.length})</p>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {data.orders.map(o => (
                    <div key={o.id} className="bg-white border border-[#E5E3DB] rounded-xl p-2.5" data-testid={`cp-order-${o.id}`}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="text-[11px] flex-1 min-w-0">
                          <b className="text-[#3B5249]">{o.id}</b>
                          <Badge variant="outline" className={`ml-1 text-[8px] ${o.status === "delivered" ? "border-green-400 text-green-800 bg-green-50" : o.status === "shipped" ? "border-purple-400 text-purple-800 bg-purple-50" : o.status === "returned" ? "border-red-400 text-red-800 bg-red-50" : "border-yellow-400 text-yellow-800 bg-yellow-50"}`}>{o.status}</Badge>
                          {o.is_offline && <Badge className="ml-1 bg-purple-600 text-white text-[8px]">OFFLINE</Badge>}
                          {o.payment_type && <Badge variant="outline" className="ml-1 text-[8px] uppercase">{o.payment_type}</Badge>}
                        </div>
                        <p className="text-sm font-bold text-[#3B5249] flex-shrink-0">₹{Number(o.total_amount||0).toLocaleString("en-IN")}</p>
                      </div>
                      <p className="text-[10px] text-[#7B6D5A]">
                        📅 {(o.created_at || "").slice(0, 10)}
                        {o.delivered_at && ` · Delivered ${o.delivered_at.slice(0,10)}`}
                        {" · Qty: "}<b>{o.total_qty ?? (o.items || []).reduce((s,i)=>s+(i.quantity||0),0)}</b>
                      </p>
                      {(o.items || []).length > 0 && (
                        <div className="mt-1.5 space-y-0.5">
                          {o.items.map((it, idx) => (
                            <div key={idx} className="flex items-center justify-between text-[10px] bg-[#F9F8F6] rounded px-2 py-1">
                              <span className="truncate flex-1">{it.name}</span>
                              <span className="text-[#3B5249]">{it.quantity} × ₹{it.price} = <b>₹{(Number(it.quantity||0) * Number(it.price||0)).toLocaleString("en-IN")}</b></span>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-[9px] text-[#7B6D5A] mt-1">
                        👤 <b>Telecaller/Agent:</b> {o.created_by_name || "—"}
                        {o.sales_manager_name && <> · 🎯 <b>Sales Manager:</b> {o.sales_manager_name}</>}
                      </p>
                      {o.customer_address && !o.is_offline && <p className="text-[9px] text-[#7B6D5A] truncate">📍 {o.customer_address}{o.customer_city ? `, ${o.customer_city}` : ""}{o.customer_pincode ? ` - ${o.customer_pincode}` : ""}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Leads */}
            {(data.leads || []).length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-[#7B6D5A] mb-1.5"><ClipboardList className="w-3 h-3 inline mr-1"/>Leads ({data.leads.length})</p>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {data.leads.map(l => (
                    <div key={l.id} className="bg-white border border-[#E5E3DB] rounded-xl p-2" data-testid={`cp-lead-${l.id}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] min-w-0 flex-1">
                          <Badge variant="outline" className="text-[8px] mr-1">{l.status}</Badge>
                          <span>Assigned to <b>{l.assigned_to_name || "—"}</b></span>
                          {l.sales_manager_name && <span className="text-[9px] text-[#A66E4E]"> · SM: <b>{l.sales_manager_name}</b></span>}
                          {l.remarks && <p className="text-[9px] text-[#7B6D5A] mt-0.5">"{l.remarks}"</p>}
                        </div>
                        <span className="text-[9px] text-[#A66E4E] flex-shrink-0">{(l.created_at || "").slice(0, 10)}</span>
                      </div>
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
