import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const API = "/api";

const TYPE_LABEL = {
  business_collaboration: { label: "Business Collab", color: "bg-purple-100 text-purple-800" },
  influencer: { label: "Influencer", color: "bg-pink-100 text-pink-800" },
  sales_opportunity: { label: "Sales Opportunity", color: "bg-emerald-100 text-emerald-800" },
};

/**
 * CollaborationContactsPanel
 *   - For SMM: shows business_collaboration + influencer entries.
 *   - For SM: shows sales_opportunity entries.
 *   Filter chips: "All / Today / Last 7d" + per-type filter.
 *   Inline edit of notes + status.
 */
export default function CollaborationContactsPanel({ title = "Collaboration Contacts", allowedTypes = null }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [filterRange, setFilterRange] = useState("all"); // all | today | 7d
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ notes: "", status: "new" });
  // Convert-to-Order flow — creates a real order tied to this collab contact.
  const [converting, setConverting] = useState(null);
  const [products, setProducts] = useState([]);
  const [orderForm, setOrderForm] = useState({ customer_name: "", customer_phone: "", customer_address: "", customer_city: "", customer_pincode: "", customer_landmark: "", items: [], total_amount: 0, payment_type: "cod" });
  const [orderSaving, setOrderSaving] = useState(false);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/collaboration-contacts`);
      setContacts(data.contacts || []);
    } catch (e) { toast.error(e.response?.data?.detail || "Failed to load contacts"); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const types = allowedTypes && allowedTypes.length ? allowedTypes : Object.keys(TYPE_LABEL);
  const filtered = contacts.filter(c => {
    if (allowedTypes && !allowedTypes.includes(c.enquiry_type)) return false;
    if (filterType !== "all" && c.enquiry_type !== filterType) return false;
    const d = (c.created_at || "").slice(0, 10);
    if (filterRange === "today" && d !== today) return false;
    if (filterRange === "7d" && d < weekAgo) return false;
    return true;
  });

  const startEdit = (c) => { setEditing(c); setEditForm({ notes: c.notes || "", status: c.status || "new" }); };

  const startConvert = async (c) => {
    setConverting(c);
    setOrderForm({
      customer_name: c.name || "",
      customer_phone: c.phone || "",
      customer_address: "",
      customer_city: "",
      customer_pincode: "",
      customer_landmark: "",
      items: [],
      total_amount: 0,
      payment_type: "cod",
    });
    if (products.length === 0) {
      try { const { data } = await axios.get(`${API}/products`); setProducts(data.products || []); } catch {}
    }
  };
  const setItemPrice = (pid, price) => {
    const p = parseFloat(price);
    setOrderForm(f => ({ ...f, items: f.items.map(i => i.product_id === pid ? { ...i, price: (Number.isFinite(p) && p >= 0) ? p : 0 } : i) }));
  };
  const setItemQty = (pid, qty) => {
    const q = parseInt(qty, 10);
    setOrderForm(f => ({ ...f, items: f.items.map(i => i.product_id === pid ? { ...i, quantity: (Number.isFinite(q) && q > 0) ? q : 1 } : i) }));
  };
  const addProduct = (p) => {
    setOrderForm(f => f.items.find(i => i.product_id === p.id) ? f : { ...f, items: [...f.items, { product_id: p.id, name: p.name, price: 0, quantity: 1 }] });
  };
  const removeProduct = (pid) => setOrderForm(f => ({ ...f, items: f.items.filter(i => i.product_id !== pid) }));
  const saveConvert = async () => {
    if (!converting) return;
    const computedTotal = orderForm.items.reduce((s,i)=>s+(i.price||0)*i.quantity, 0);
    const finalTotal = computedTotal > 0 ? computedTotal : Number(orderForm.total_amount || 0);
    if (!orderForm.customer_name.trim()) return toast.error("Customer name required");
    if (finalTotal <= 0) return toast.error("Add at least one product or enter a manual amount");
    if (!orderForm.customer_address || orderForm.customer_address.trim().length < 8) return toast.error("Full delivery address is required");
    if (!/^\d{6}$/.test(orderForm.customer_pincode || "")) return toast.error("6-digit pincode is required");
    if (!orderForm.customer_city) return toast.error("City is required");
    setOrderSaving(true);
    try {
      await axios.post(`${API}/orders`, { ...orderForm, total_amount: finalTotal });
      // Also mark this collab contact as onboarded (order was placed).
      try { await axios.put(`${API}/collaboration-contacts/${converting.id}`, { status: "onboarded", notes: (converting.notes || "") + `\n[Order created ${new Date().toISOString().slice(0,10)} for Rs.${finalTotal}]` }); } catch {}
      toast.success(`Order created — Rs.${finalTotal}`);
      setConverting(null);
      fetchContacts();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed to create order"); }
    setOrderSaving(false);
  };
  const save = async () => {
    if (!editing) return;
    try {
      await axios.put(`${API}/collaboration-contacts/${editing.id}`, editForm);
      toast.success("Updated");
      setEditing(null);
      fetchContacts();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E5E3DB] p-5" data-testid="collab-contacts-panel">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <h3 className="font-heading text-lg font-medium">{title} ({filtered.length})</h3>
        <div className="flex gap-1 flex-wrap items-center">
          {[{v:"all",l:"All"},{v:"today",l:"Today"},{v:"7d",l:"Last 7d"}].map(o => (
            <Button key={o.v} size="sm" variant={filterRange===o.v?"default":"outline"} className={`rounded-full h-7 text-[10px] ${filterRange===o.v?"bg-[#3B5249] text-white":"border-[#E5E3DB]"}`} onClick={()=>setFilterRange(o.v)} data-testid={`collab-range-${o.v}`}>{o.l}</Button>
          ))}
          {types.length > 1 && (
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="rounded-full h-7 text-[10px] w-32" data-testid="collab-type-filter"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {types.map(t => <SelectItem key={t} value={t} className="text-xs">{TYPE_LABEL[t]?.label || t}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {loading ? <p className="text-xs text-[#59615D]">Loading…</p> :
       filtered.length === 0 ? <p className="text-center py-6 text-sm text-[#59615D]">No contacts in this view yet. Telecallers will route new ones here.</p> :
       <div className="space-y-2" data-testid="collab-list">
         {filtered.map(c => {
           const info = TYPE_LABEL[c.enquiry_type] || { label: c.enquiry_type, color: "bg-gray-100 text-gray-800" };
           return (
             <div key={c.id} className="border border-[#E5E3DB] rounded-xl p-3" data-testid={`collab-${c.id}`}>
               <div className="flex justify-between items-start gap-2 flex-wrap">
                 <div className="min-w-0 flex-1">
                   <p className="font-medium text-sm">{c.name || "—"} <span className="text-[#59615D] text-xs font-normal">· {c.phone || "—"}</span></p>
                   <div className="flex gap-1 flex-wrap mt-1 text-[10px]">
                     <Badge className={`text-[9px] ${info.color}`}>{info.label}</Badge>
                     {c.status && c.status !== "new" && <Badge variant="outline" className="text-[9px] capitalize">{String(c.status).replace(/_/g," ")}</Badge>}
                     {c.source_tc_name && <span className="text-[#59615D]">via <b className="text-[#3B5249]">{c.source_tc_name}</b></span>}
                   </div>
                   {c.notes && <p className="text-[11px] text-[#2C3531] mt-1 bg-[#F9F8F6] rounded p-2 whitespace-pre-wrap">{c.notes}</p>}
                 </div>
                 <div className="flex flex-col gap-1 items-end text-[10px] text-[#59615D]">
                   <span>{String(c.created_at || "").slice(0, 10)}</span>
                   <div className="flex gap-1 flex-wrap justify-end">
                     {c.phone && <a href={`tel:${c.phone}`}><Button size="sm" variant="outline" className="rounded-full h-7 text-[9px] px-2">📞 Call</Button></a>}
                     <Button size="sm" className="rounded-full h-7 text-[9px] px-2 bg-[#6B8E6B] hover:bg-[#5A7D5A] text-white" onClick={()=>startConvert(c)} data-testid={`collab-convert-${c.id}`}>💼 Convert to Order</Button>
                     <Button size="sm" variant="outline" className="rounded-full h-7 text-[9px] px-2" onClick={()=>startEdit(c)} data-testid={`collab-edit-${c.id}`}>✎ Edit</Button>
                   </div>
                 </div>
               </div>
             </div>
           );
         })}
       </div>}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={()=>setEditing(null)} data-testid="collab-edit-overlay">
          <div className="bg-white rounded-2xl p-5 max-w-md w-full" onClick={e=>e.stopPropagation()}>
            <h4 className="font-heading text-base mb-3">Update — {editing.name || editing.phone}</h4>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium">Status</label>
                <Select value={editForm.status} onValueChange={v=>setEditForm(f=>({...f, status:v}))}>
                  <SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="negotiating">Negotiating</SelectItem>
                    <SelectItem value="onboarded">Onboarded / Signed</SelectItem>
                    <SelectItem value="not_interested">Not Interested</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium">Notes</label>
                <Textarea value={editForm.notes} onChange={e=>setEditForm(f=>({...f, notes:e.target.value}))} className="rounded-xl" rows={4} data-testid="collab-edit-notes"/>
              </div>
              <div className="flex gap-2">
                <Button onClick={save} className="flex-1 rounded-full bg-[#3B5249] text-white" data-testid="collab-edit-save">Save</Button>
                <Button variant="outline" onClick={()=>setEditing(null)} className="flex-1 rounded-full">Cancel</Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {converting && (
        <Dialog open={!!converting} onOpenChange={(o)=>{ if(!o) setConverting(null); }}>
          <DialogContent className="rounded-2xl max-h-[90vh] overflow-y-auto max-w-2xl" data-testid="collab-convert-dialog">
            <DialogHeader>
              <DialogTitle className="font-heading">Convert to Order — {converting.name || converting.phone}</DialogTitle>
              <DialogDescription className="text-[11px] text-[#59615D]">Capture the shipping address and product line-up. This creates a real order (status: pending) tied to this contact.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Customer Name *</Label><Input value={orderForm.customer_name} onChange={e=>setOrderForm(f=>({...f,customer_name:e.target.value}))} className="rounded-xl" data-testid="collab-order-name"/></div>
                <div><Label className="text-xs">Phone *</Label><Input value={orderForm.customer_phone} onChange={e=>setOrderForm(f=>({...f,customer_phone:e.target.value}))} className="rounded-xl" data-testid="collab-order-phone"/></div>
              </div>
              <div><Label className="text-xs text-[#B75D69] font-semibold">Full Delivery Address *</Label><Textarea value={orderForm.customer_address} onChange={e=>setOrderForm(f=>({...f,customer_address:e.target.value}))} rows={3} className="rounded-xl" placeholder="House/Flat no, Street, Locality" data-testid="collab-order-address"/></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">City *</Label><Input value={orderForm.customer_city} onChange={e=>setOrderForm(f=>({...f,customer_city:e.target.value}))} className="rounded-xl" data-testid="collab-order-city"/></div>
                <div><Label className="text-xs">Pincode *</Label><Input value={orderForm.customer_pincode} onChange={e=>setOrderForm(f=>({...f,customer_pincode:e.target.value}))} className="rounded-xl" placeholder="6-digit" data-testid="collab-order-pincode"/></div>
              </div>
              <div><Label className="text-xs">Landmark</Label><Input value={orderForm.customer_landmark} onChange={e=>setOrderForm(f=>({...f,customer_landmark:e.target.value}))} className="rounded-xl" data-testid="collab-order-landmark"/></div>
              <div>
                <Label className="text-xs">Products & Prices <span className="text-[9px] text-[#A66E4E]">(price per unit)</span></Label>
                <div className="max-h-40 overflow-y-auto border border-[#E5E3DB] rounded-xl p-2 space-y-1">
                  {products.length === 0 ? <p className="text-[10px] text-[#59615D]">Loading products…</p> :
                  products.map(p => {
                    const item = orderForm.items.find(i => i.product_id === p.id);
                    return (
                      <div key={p.id} className="flex items-center justify-between text-xs gap-2 flex-wrap">
                        <span className="flex-1 truncate min-w-[100px]" title={p.name}>{p.name}</span>
                        {!item ? (
                          <Button size="sm" type="button" className="h-6 px-2 rounded-full bg-[#3B5249] text-white text-[10px]" onClick={()=>addProduct(p)} data-testid={`collab-add-prod-${p.id}`}>+ Add</Button>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Input type="number" min="0" value={item.price} onChange={e=>setItemPrice(p.id, e.target.value)} placeholder="Price" className="h-6 w-16 text-[10px] text-center rounded-md p-0" data-testid={`collab-price-${p.id}`}/>
                            <span className="text-[9px] text-[#59615D]">×</span>
                            <Input type="number" min="1" value={item.quantity} onChange={e=>setItemQty(p.id, e.target.value)} className="h-6 w-12 text-[10px] text-center rounded-md p-0" data-testid={`collab-qty-${p.id}`}/>
                            <span className="text-[#3B5249] font-semibold ml-1 text-[10px] min-w-[55px] text-right">Rs.{(item.price||0)*item.quantity}</span>
                            <button type="button" onClick={()=>removeProduct(p.id)} className="text-red-500 text-[10px] ml-1">✕</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Total (auto)</Label><Input readOnly value={orderForm.items.reduce((s,i)=>s+(i.price||0)*i.quantity,0)} className="rounded-xl font-bold bg-[#F9F8F6]" data-testid="collab-order-total"/></div>
                <div><Label className="text-xs">Payment</Label>
                  <Select value={orderForm.payment_type} onValueChange={v=>setOrderForm(f=>({...f,payment_type:v}))}>
                    <SelectTrigger className="rounded-xl" data-testid="collab-order-payment"><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cod">COD</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="online">Online</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={saveConvert} disabled={orderSaving} className="flex-1 rounded-full bg-[#6B8E6B] hover:bg-[#5A7D5A] text-white" data-testid="collab-convert-save">{orderSaving ? "Creating…" : "Create Order"}</Button>
                <Button variant="outline" onClick={()=>setConverting(null)} className="rounded-full">Cancel</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
