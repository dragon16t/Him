/**
 * StockAllocationPanel.jsx — Stock allocation with inline OFFLINE order creation.
 *
 * Visible to: Inventory Manager, Admin, Sales Manager, District Manager (and assistants).
 *
 * Features:
 *  - Allocate qty + optional manual unit_price (falls back to product default at order time)
 *  - Shows allocated / sold / remaining per row + values
 *  - "Sell" (Create Offline Order) — deducts stock, creates order tagged is_offline=true,
 *    status "delivered" (skips shipping). Visible to Admin + Inventory Manager immediately.
 */
import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Package, Plus, Trash2, Edit2, User, ShoppingBag } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Textarea } from "./ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

const API = process.env.REACT_APP_BACKEND_URL + "/api";
const INR = (n) => `Rs.${Number(n || 0).toFixed(2)}`;

export default function StockAllocationPanel() {
  const [people, setPeople] = useState([]);
  const [products, setProducts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ employee_id: "", product_id: "", qty: 1, unit_price: "", note: "" });

  // Offline-order (sell) modal state
  const [sellTarget, setSellTarget] = useState(null); // the product row (alloc) being sold from
  const [sellForm, setSellForm] = useState({ sold_qty: 1, unit_price: "", customer_name: "", customer_phone: "", payment_type: "cash", notes: "" });
  const [selling, setSelling] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, prods, emps] = await Promise.all([
        axios.get(`${API}/stock-allocations/by-person`),
        axios.get(`${API}/products`),
        axios.get(`${API}/stock-allocations/allocatable-employees`).catch(() => ({ data: { employees: [] } })),
      ]);
      setPeople(p.data.people || []);
      setProducts(prods.data.products || []);
      setEmployees(emps.data.employees || []);
    } catch (e) { /* silent — panel is best-effort */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm({ employee_id: "", product_id: "", qty: 1, unit_price: "", note: "" }); setShowForm(true); };
  const openEdit = (alloc) => {
    setEditing(alloc);
    setForm({ employee_id: alloc.employee_id || "", product_id: alloc.product_id, qty: alloc.allocated_qty, unit_price: alloc.unit_price || "", note: alloc.note || "" });
    setShowForm(true);
  };
  const openSell = (alloc) => {
    setSellTarget(alloc);
    setSellForm({
      sold_qty: 1,
      unit_price: alloc.unit_price || alloc.default_price || "",
      customer_name: "",
      customer_phone: "",
      payment_type: "cash",
      notes: "",
    });
  };

  const save = async () => {
    const payload = { ...form };
    if (payload.unit_price === "" || payload.unit_price == null) delete payload.unit_price;
    if (!editing) {
      if (!payload.employee_id || !payload.product_id || !payload.qty) return toast.error("Fill employee, product & qty");
      try {
        await axios.post(`${API}/stock-allocations`, payload);
        toast.success("Allocated"); setShowForm(false); load();
      } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    } else {
      try {
        await axios.put(`${API}/stock-allocations/${editing.id}`, { qty: payload.qty, unit_price: payload.unit_price ?? 0, note: payload.note });
        toast.success("Updated"); setShowForm(false); load();
      } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    }
  };

  const submitSell = async () => {
    if (!sellTarget) return;
    const soldQty = Number(sellForm.sold_qty || 0);
    if (soldQty <= 0) return toast.error("Enter quantity > 0");
    if (soldQty > (sellTarget.remaining_qty ?? 0)) return toast.error(`Only ${sellTarget.remaining_qty} unit(s) remain`);
    setSelling(true);
    try {
      const payload = {
        sold_qty: soldQty,
        customer_name: sellForm.customer_name || "",
        customer_phone: sellForm.customer_phone || "",
        payment_type: sellForm.payment_type,
        notes: sellForm.notes || "",
      };
      if (sellForm.unit_price !== "" && sellForm.unit_price != null) payload.unit_price = Number(sellForm.unit_price);
      const { data } = await axios.post(`${API}/stock-allocations/${sellTarget.id}/create-order`, payload);
      toast.success(data.message || "Offline order created");
      setSellTarget(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to create offline order");
    }
    setSelling(false);
  };

  const remove = async (alloc) => {
    if (!window.confirm(`Remove ${alloc.allocated_qty}× ${alloc.product_name} from allocation?`)) return;
    try {
      await axios.delete(`${API}/stock-allocations/${alloc.id}`);
      toast.success("Removed"); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  // Compute effective unit price preview for the sell form
  const sellEffectivePrice = sellTarget ? (
    sellForm.unit_price !== "" ? Number(sellForm.unit_price || 0)
      : (sellTarget.unit_price || sellTarget.default_price || 0)
  ) : 0;
  const sellTotal = sellEffectivePrice * Number(sellForm.sold_qty || 0);

  // Aggregate totals across ALL people (top summary)
  const grand = people.reduce((acc, p) => {
    acc.qty += p.total_qty || 0;
    acc.sold += p.total_sold_qty || 0;
    acc.remaining += p.total_remaining_qty || 0;
    acc.value += p.total_remaining_value || 0;
    acc.soldValue += p.total_sold_value || 0;
    return acc;
  }, { qty: 0, sold: 0, remaining: 0, value: 0, soldValue: 0 });

  return (
    <div className="space-y-4" data-testid="stock-allocation-panel">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-heading text-[16px] flex items-center gap-2 text-[#2C3531]"><Package className="w-4 h-4 text-[#3B5249]"/>Stock Allocation &amp; Offline Sales</h3>
          <p className="text-[10px] text-[#7B6D5A]">Allocate stock to any employee/manager · set an optional manual unit price · sell straight into an OFFLINE order (no shipping, auto-marked delivered).</p>
        </div>
        <Button onClick={openNew} className="rounded-full bg-[#3B5249] hover:bg-[#2C3531] text-white text-xs" data-testid="alloc-add-btn"><Plus className="w-3 h-3 mr-1"/>Allocate Stock</Button>
      </div>

      {/* Top summary */}
      {people.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2" data-testid="alloc-summary">
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-2"><p className="text-[9px] text-[#7B6D5A] uppercase">Allocated Qty</p><p className="text-lg font-heading text-[#3B5249]">{grand.qty}</p></div>
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-2"><p className="text-[9px] text-[#7B6D5A] uppercase">Sold (Offline)</p><p className="text-lg font-heading text-emerald-700">{grand.sold}</p></div>
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-2"><p className="text-[9px] text-[#7B6D5A] uppercase">Remaining</p><p className="text-lg font-heading text-[#A66E4E]">{grand.remaining}</p></div>
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-2"><p className="text-[9px] text-[#7B6D5A] uppercase">Sold Value</p><p className="text-sm font-heading text-emerald-700">{INR(grand.soldValue)}</p></div>
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-2"><p className="text-[9px] text-[#7B6D5A] uppercase">Remaining Value</p><p className="text-sm font-heading text-[#3B5249]">{INR(grand.value)}</p></div>
        </div>
      )}

      {people.length === 0 ? (
        <div className="text-center py-10 bg-white border border-[#E5E3DB] rounded-2xl text-[#7B6D5A] text-sm" data-testid="alloc-empty">
          No stock allocations yet. Click <b>Allocate Stock</b> to assign products to a telecaller, agent or manager.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="alloc-grid">
          {people.map(p => (
            <div key={p.employee_id} className="bg-white border border-[#E5E3DB] rounded-2xl p-3" data-testid={`alloc-person-${p.employee_id}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#F4EAE0] flex items-center justify-center"><User className="w-3.5 h-3.5 text-[#A66E4E]"/></div>
                  <div>
                    <p className="font-medium text-sm text-[#2C3531]">{p.employee_name}</p>
                    <p className="text-[10px] text-[#7B6D5A] capitalize">{(p.employee_role || "").replace(/_/g," ")} · {p.employee_phone || "—"}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <Badge className="bg-[#3B5249] text-white text-[10px]">Rem: {p.total_remaining_qty}/{p.total_qty}</Badge>
                  <span className="text-[9px] text-[#A66E4E]">Value: {INR(p.total_remaining_value)}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                {p.products.map(pr => (
                  <div key={pr.id} className="bg-[#F9F8F6] rounded-lg p-2" data-testid={`alloc-product-${pr.id}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium truncate">{pr.product_name}</p>
                        <p className="text-[9px] text-[#7B6D5A]">
                          Alloc: <b>{pr.allocated_qty}</b> · Sold: <b className="text-emerald-700">{pr.sold_qty}</b> · Rem: <b className="text-[#A66E4E]">{pr.remaining_qty}</b>
                        </p>
                        <p className="text-[9px] text-[#3B5249]">
                          Unit: <b>{INR(pr.effective_unit_price)}</b>
                          {pr.unit_price > 0 ? <span className="text-[8px] text-[#A66E4E] ml-1">(manual)</span> : <span className="text-[8px] text-[#7B6D5A] ml-1">(product default)</span>}
                          {" · "}Remaining value: <b>{INR(pr.remaining_value)}</b>
                        </p>
                        {pr.note && <p className="text-[9px] text-[#7B6D5A] italic truncate">"{pr.note}"</p>}
                      </div>
                    </div>
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" onClick={() => openSell(pr)} disabled={pr.remaining_qty <= 0} className="rounded-full h-6 text-[9px] px-2 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40" data-testid={`alloc-sell-${pr.id}`}>
                        <ShoppingBag className="w-3 h-3 mr-0.5"/>Sell / Offline Order
                      </Button>
                      <button onClick={() => openEdit(pr)} className="text-[#3B5249] hover:text-[#A66E4E] p-1" data-testid={`alloc-edit-${pr.id}`} title="Edit"><Edit2 className="w-3 h-3"/></button>
                      <button onClick={() => remove(pr)} className="text-red-600 hover:text-red-800 p-1" data-testid={`alloc-remove-${pr.id}`} title="Remove"><Trash2 className="w-3 h-3"/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Allocate / Edit dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md rounded-2xl" data-testid="alloc-dialog" aria-describedby="alloc-desc">
          <DialogHeader><DialogTitle className="font-heading">{editing ? "Edit Allocation" : "New Allocation"}</DialogTitle></DialogHeader>
          <p id="alloc-desc" className="sr-only">Assign a product quantity and optional manual unit price to an employee.</p>
          <div className="space-y-2.5">
            {!editing && (
              <>
                <div>
                  <Label className="text-xs">Employee / Manager *</Label>
                  <Select value={form.employee_id} onValueChange={v => setForm(f => ({ ...f, employee_id: v }))}>
                    <SelectTrigger className="rounded-xl h-9 text-xs" data-testid="alloc-employee"><SelectValue placeholder="Pick person"/></SelectTrigger>
                    <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name} ({(e.role||"").replace(/_/g," ")})</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Product *</Label>
                  <Select value={form.product_id} onValueChange={v => setForm(f => ({ ...f, product_id: v }))}>
                    <SelectTrigger className="rounded-xl h-9 text-xs" data-testid="alloc-product"><SelectValue placeholder="Pick product"/></SelectTrigger>
                    <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} — {INR(p.price)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div>
              <Label className="text-xs">Quantity *</Label>
              <Input type="number" min={editing ? (editing.sold_qty || 0) : 1} value={form.qty} onChange={e => setForm(f => ({ ...f, qty: Number(e.target.value) }))} className="rounded-xl h-9 text-xs" data-testid="alloc-qty"/>
              {editing && editing.sold_qty > 0 && <p className="text-[9px] text-[#A66E4E]">Already sold: {editing.sold_qty} — cannot go lower.</p>}
            </div>
            <div>
              <Label className="text-xs">Unit Price (optional) <span className="text-[9px] text-[#7B6D5A]">— leave blank to use product default at order time</span></Label>
              <Input type="number" min={0} step="0.01" value={form.unit_price} onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))} placeholder="e.g. 499.00" className="rounded-xl h-9 text-xs" data-testid="alloc-unit-price"/>
              {form.product_id && (() => { const p = products.find(x => x.id === form.product_id); return p ? <p className="text-[9px] text-[#3B5249]">Product default: {INR(p.price)} · Total value @ Qty {form.qty || 0}: <b>{INR((Number(form.unit_price || p.price || 0)) * Number(form.qty || 0))}</b></p> : null; })()}
            </div>
            <div>
              <Label className="text-xs">Note (optional)</Label>
              <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="e.g. For June event stock" className="rounded-xl h-9 text-xs" data-testid="alloc-note"/>
            </div>
            <Button onClick={save} className="w-full rounded-full bg-[#3B5249] text-white text-xs" data-testid="alloc-save">{editing ? "Save Changes" : "Allocate"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sell / Create Offline Order dialog */}
      <Dialog open={!!sellTarget} onOpenChange={(o) => { if (!o) setSellTarget(null); }}>
        <DialogContent className="max-w-md rounded-2xl" data-testid="alloc-sell-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">Sell — Create Offline Order</DialogTitle>
            <DialogDescription className="text-[11px]">
              Skips shipping. Marks order as <b>delivered</b>. Deducts from allocation + master stock. Visible to Admin &amp; Inventory Manager as an <b>OFFLINE</b> order.
            </DialogDescription>
          </DialogHeader>
          {sellTarget && (
            <div className="space-y-2.5">
              <div className="bg-[#F9F8F6] rounded-xl p-2 border border-[#E5E3DB]">
                <p className="text-xs font-medium">{sellTarget.product_name}</p>
                <p className="text-[10px] text-[#7B6D5A]">Remaining in this allocation: <b className="text-[#A66E4E]">{sellTarget.remaining_qty}</b> · Default price: {INR(sellTarget.default_price)}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Sell Qty *</Label>
                  <Input type="number" min={1} max={sellTarget.remaining_qty} value={sellForm.sold_qty} onChange={e => setSellForm(f => ({ ...f, sold_qty: e.target.value }))} className="rounded-xl h-9 text-xs" data-testid="alloc-sell-qty"/>
                </div>
                <div>
                  <Label className="text-xs">Unit Price</Label>
                  <Input type="number" min={0} step="0.01" value={sellForm.unit_price} onChange={e => setSellForm(f => ({ ...f, unit_price: e.target.value }))} placeholder={INR(sellTarget.unit_price || sellTarget.default_price)} className="rounded-xl h-9 text-xs" data-testid="alloc-sell-price"/>
                </div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2 text-center">
                <p className="text-[9px] text-emerald-700 uppercase">Order Total (auto)</p>
                <p className="text-2xl font-heading text-emerald-800" data-testid="alloc-sell-total">{INR(sellTotal)}</p>
                <p className="text-[9px] text-emerald-600">{sellForm.sold_qty || 0} × {INR(sellEffectivePrice)}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Customer Name (optional)</Label>
                  <Input value={sellForm.customer_name} onChange={e => setSellForm(f => ({ ...f, customer_name: e.target.value }))} placeholder="Walk-in" className="rounded-xl h-9 text-xs" data-testid="alloc-sell-cname"/>
                </div>
                <div>
                  <Label className="text-xs">Phone (optional)</Label>
                  <Input value={sellForm.customer_phone} onChange={e => setSellForm(f => ({ ...f, customer_phone: e.target.value }))} className="rounded-xl h-9 text-xs" data-testid="alloc-sell-cphone"/>
                </div>
              </div>
              <div>
                <Label className="text-xs">Payment Method</Label>
                <Select value={sellForm.payment_type} onValueChange={v => setSellForm(f => ({ ...f, payment_type: v }))}>
                  <SelectTrigger className="rounded-xl h-9 text-xs" data-testid="alloc-sell-payment"><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="offline">Offline (Other)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Notes (optional)</Label>
                <Textarea value={sellForm.notes} onChange={e => setSellForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="rounded-xl text-xs" placeholder="e.g. Sold at office desk" data-testid="alloc-sell-notes"/>
              </div>
              <div className="flex gap-2">
                <Button onClick={submitSell} disabled={selling || sellTotal <= 0} className="flex-1 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs" data-testid="alloc-sell-submit">
                  {selling ? "Creating…" : `Create Offline Order — ${INR(sellTotal)}`}
                </Button>
                <Button variant="outline" onClick={() => setSellTarget(null)} className="rounded-full text-xs">Cancel</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
