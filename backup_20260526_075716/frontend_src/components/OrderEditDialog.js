import { useState, useEffect } from "react";
import axios from "axios";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { X, Plus } from "lucide-react";

const API = "/api";

/**
 * Reusable order edit dialog.
 * Backend permission rules:
 *   - status in [shipped, delivered, rejected, cancelled] → LOCKED for everyone
 *   - admin / inventory_manager → edit always (until shipped)
 *   - sales_manager / asst_sm → edit telecaller/SM-team orders (until shipped)
 *   - district_manager / asst_dm → edit agent/DM-team orders (until shipped)
 *   - telecaller / agent / inhouse_telecaller → edit own orders ONLY while pending
 */
export default function OrderEditDialog({ open, onOpenChange, order, products = [], onSaved }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (order) {
      setForm({
        customer_name: order.customer_name || "",
        customer_phone: order.customer_phone || "",
        customer_address: order.customer_address || "",
        customer_city: order.customer_city || "",
        customer_pincode: order.customer_pincode || "",
        customer_landmark: order.customer_landmark || "",
        items: (order.items || []).map(i => ({
          product_id: i.product_id, name: i.name || i.product_name,
          price: i.price, quantity: i.quantity
        })),
        total_amount: order.total_amount || 0,
        payment_type: order.payment_type || "cod",
      });
    }
  }, [order]);

  if (!form) return null;
  const itemsTotal = form.items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0);

  const addProduct = (p) => setForm(f => f.items.find(i => i.product_id === p.id) ? f : ({ ...f, items: [...f.items, { product_id: p.id, name: p.name, price: p.price, quantity: 1 }] }));
  const updateQty = (pid, q) => { const qq = Math.max(0, parseInt(q || 0)); setForm(f => ({ ...f, items: f.items.map(i => i.product_id === pid ? { ...i, quantity: qq } : i).filter(i => i.quantity > 0) })); };
  const removeItem = (pid) => setForm(f => ({ ...f, items: f.items.filter(i => i.product_id !== pid) }));

  const submit = async () => {
    if (!form.customer_name) return toast.error("Customer name required");
    if (!form.customer_address || form.customer_address.trim().length < 8) return toast.error("Address required (min 8 chars)");
    const finalTotal = itemsTotal > 0 ? itemsTotal : Number(form.total_amount || 0);
    if (finalTotal <= 0) return toast.error("Total must be greater than 0");
    setSaving(true);
    try {
      const { data } = await axios.put(`${API}/orders/${order.id}`, { ...form, total_amount: finalTotal });
      toast.success("Order updated");
      onSaved && onSaved(data.order);
      onOpenChange(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Update failed");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-lg max-h-[92vh] overflow-y-auto" data-testid="order-edit-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">Edit Order · <span className="text-xs font-mono text-[#59615D]">{order.id}</span></DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="bg-[#F9F8F6] border border-[#E5E3DB] rounded-xl p-2 text-[10px] text-[#59615D]">
            Status: <b className="uppercase text-[#3B5249]">{order.status}</b> · By: {order.created_by_name} ({order.created_by_role})
            {order.last_edited_by_name && <span> · Last edit by: <b>{order.last_edited_by_name}</b> ({order.last_edited_by_role})</span>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Customer Name *</Label><Input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} className="rounded-xl" data-testid="edit-customer-name"/></div>
            <div><Label className="text-xs">Phone</Label><Input value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))} className="rounded-xl" data-testid="edit-customer-phone"/></div>
          </div>
          <div><Label className="text-xs text-[#B75D69] font-semibold">Full Delivery Address *</Label><Textarea rows={2} value={form.customer_address} onChange={e => setForm(f => ({ ...f, customer_address: e.target.value }))} className="rounded-xl" data-testid="edit-customer-address"/></div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label className="text-xs">City</Label><Input value={form.customer_city} onChange={e => setForm(f => ({ ...f, customer_city: e.target.value }))} className="rounded-xl"/></div>
            <div><Label className="text-xs">Pincode</Label><Input value={form.customer_pincode} onChange={e => setForm(f => ({ ...f, customer_pincode: e.target.value }))} className="rounded-xl"/></div>
            <div><Label className="text-xs">Landmark</Label><Input value={form.customer_landmark} onChange={e => setForm(f => ({ ...f, customer_landmark: e.target.value }))} className="rounded-xl"/></div>
          </div>
          {/* Selected items with qty controls */}
          {form.items.length > 0 && (
            <div className="border border-[#E5E3DB] rounded-xl p-2 space-y-1.5">
              <Label className="text-xs">Selected Items</Label>
              {form.items.map(i => (
                <div key={i.product_id} className="flex items-center gap-2 text-xs" data-testid={`edit-item-${i.product_id}`}>
                  <span className="flex-1 truncate">{i.name} <span className="text-[#59615D]">(Rs.{i.price})</span></span>
                  <button type="button" className="w-6 h-6 rounded-full border border-[#E5E3DB] font-bold" onClick={() => updateQty(i.product_id, i.quantity - 1)}>−</button>
                  <Input type="number" value={i.quantity} onChange={e => updateQty(i.product_id, e.target.value)} className="h-6 w-12 text-center text-[10px] rounded-md p-0" data-testid={`edit-qty-${i.product_id}`}/>
                  <button type="button" className="w-6 h-6 rounded-full border border-[#E5E3DB] font-bold" onClick={() => updateQty(i.product_id, i.quantity + 1)}>+</button>
                  <span className="text-[#3B5249] font-semibold min-w-[55px] text-right">Rs.{i.price * i.quantity}</span>
                  <button type="button" onClick={() => removeItem(i.product_id)} className="text-red-400"><X className="w-3 h-3"/></button>
                </div>
              ))}
            </div>
          )}
          {/* Add more products */}
          {products.length > 0 && (
            <div>
              <Label className="text-xs">Add / Replace Products</Label>
              <div className="space-y-1 max-h-32 overflow-y-auto border border-[#E5E3DB] rounded-xl p-2">
                {products.map(p => {
                  const has = form.items.find(i => i.product_id === p.id);
                  return (
                    <div key={p.id} className="flex items-center justify-between text-xs">
                      <span className="truncate flex-1">{p.name} <span className="text-[#59615D]">(Rs.{p.price})</span></span>
                      <Button type="button" size="sm" variant={has ? "outline" : "default"} className="h-6 px-2 text-[10px] rounded-full" onClick={() => addProduct(p)} data-testid={`edit-add-${p.id}`}>{has ? "✓" : <Plus className="w-3 h-3"/>}</Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div><Label className="text-xs">Total Amount {itemsTotal > 0 && <span className="text-[10px] text-[#59615D]">(auto · edit clears items)</span>}</Label>
            <Input type="number" value={itemsTotal > 0 ? itemsTotal : form.total_amount} onChange={e => setForm(f => ({ ...f, total_amount: Number(e.target.value), items: itemsTotal > 0 ? [] : f.items }))} className="rounded-xl font-bold" data-testid="edit-total"/>
          </div>
          <div><Label className="text-xs">Payment</Label>
            <Select value={form.payment_type} onValueChange={v => setForm(f => ({ ...f, payment_type: v }))}>
              <SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="cod">COD</SelectItem><SelectItem value="upi">UPI</SelectItem><SelectItem value="online">Online</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={submit} disabled={saving} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="edit-submit">
            {saving ? "Saving…" : `Save Changes · Rs.${itemsTotal > 0 ? itemsTotal : form.total_amount || 0}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
