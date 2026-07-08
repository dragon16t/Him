/**
 * StockAllocationPanel.jsx — Inventory Manager: track per-person stock allocations.
 * Shows a menu of employees (agents/telecallers/etc.) with allocated products + qty.
 */
import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Package, Plus, Trash2, Edit2, User } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

export default function StockAllocationPanel() {
  const [people, setPeople] = useState([]);
  const [products, setProducts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ employee_id: "", product_id: "", qty: 1, note: "" });

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
    } catch (e) { /* silent */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm({ employee_id: "", product_id: "", qty: 1, note: "" }); setShowForm(true); };
  const openEdit = (alloc) => {
    setEditing(alloc);
    setForm({ employee_id: alloc.employee_id, product_id: alloc.product_id, qty: alloc.allocated_qty, note: alloc.note || "" });
    setShowForm(true);
  };

  const save = async () => {
    if (!editing) {
      if (!form.employee_id || !form.product_id || !form.qty) return toast.error("Fill all fields");
      try {
        await axios.post(`${API}/stock-allocations`, form);
        toast.success("Allocated"); setShowForm(false); load();
      } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    } else {
      try {
        await axios.put(`${API}/stock-allocations/${editing.id}`, { qty: form.qty, note: form.note });
        toast.success("Updated"); setShowForm(false); load();
      } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    }
  };

  const remove = async (alloc) => {
    if (!window.confirm(`Remove ${alloc.allocated_qty}× ${alloc.product_name} from allocation?`)) return;
    try {
      await axios.delete(`${API}/stock-allocations/${alloc.id}`);
      toast.success("Removed"); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="space-y-4" data-testid="stock-allocation-panel">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-heading text-[16px] flex items-center gap-2 text-[#2C3531]"><Package className="w-4 h-4 text-[#3B5249]"/>Stock Allocation by Person</h3>
          <p className="text-[10px] text-[#7B6D5A]">Track which employee holds how much of each product — visible only to Inventory Manager &amp; Admin.</p>
        </div>
        <Button onClick={openNew} className="rounded-full bg-[#3B5249] hover:bg-[#2C3531] text-white text-xs" data-testid="alloc-add-btn"><Plus className="w-3 h-3 mr-1"/>Allocate Stock</Button>
      </div>

      {people.length === 0 ? (
        <div className="text-center py-10 bg-white border border-[#E5E3DB] rounded-2xl text-[#7B6D5A] text-sm" data-testid="alloc-empty">
          No stock allocations yet. Click <b>Allocate Stock</b> to assign products to a telecaller or agent.
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
                    <p className="text-[10px] text-[#7B6D5A]">{p.employee_role} · {p.employee_phone || "—"}</p>
                  </div>
                </div>
                <Badge className="bg-[#3B5249] text-white text-[10px]">Total: {p.total_qty}</Badge>
              </div>
              <div className="space-y-1.5">
                {p.products.map(pr => (
                  <div key={pr.id} className="bg-[#F9F8F6] rounded-lg p-2 flex items-center justify-between" data-testid={`alloc-product-${pr.id}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium truncate">{pr.product_name}</p>
                      {pr.note && <p className="text-[9px] text-[#7B6D5A] truncate">{pr.note}</p>}
                    </div>
                    <Badge variant="outline" className="text-[10px] mx-1">× {pr.allocated_qty}</Badge>
                    <button onClick={() => openEdit(pr)} className="text-[#3B5249] hover:text-[#A66E4E] p-1" data-testid={`alloc-edit-${pr.id}`}><Edit2 className="w-3 h-3"/></button>
                    <button onClick={() => remove(pr)} className="text-red-600 hover:text-red-800 p-1" data-testid={`alloc-remove-${pr.id}`}><Trash2 className="w-3 h-3"/></button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md rounded-2xl" data-testid="alloc-dialog" aria-describedby="alloc-desc">
          <DialogHeader><DialogTitle className="font-heading">{editing ? "Edit Allocation" : "New Allocation"}</DialogTitle></DialogHeader>
          <p id="alloc-desc" className="sr-only">Assign a product quantity to an employee.</p>
          <div className="space-y-2.5">
            {!editing && (
              <>
                <div>
                  <Label className="text-xs">Employee *</Label>
                  <Select value={form.employee_id} onValueChange={v => setForm(f => ({ ...f, employee_id: v }))}>
                    <SelectTrigger className="rounded-xl h-9 text-xs" data-testid="alloc-employee"><SelectValue placeholder="Pick employee"/></SelectTrigger>
                    <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name} ({e.role})</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Product *</Label>
                  <Select value={form.product_id} onValueChange={v => setForm(f => ({ ...f, product_id: v }))}>
                    <SelectTrigger className="rounded-xl h-9 text-xs" data-testid="alloc-product"><SelectValue placeholder="Pick product"/></SelectTrigger>
                    <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div>
              <Label className="text-xs">Quantity *</Label>
              <Input type="number" min={1} value={form.qty} onChange={e => setForm(f => ({ ...f, qty: Number(e.target.value) }))} className="rounded-xl h-9 text-xs" data-testid="alloc-qty"/>
            </div>
            <div>
              <Label className="text-xs">Note (optional)</Label>
              <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="e.g. For June event stock" className="rounded-xl h-9 text-xs" data-testid="alloc-note"/>
            </div>
            <Button onClick={save} className="w-full rounded-full bg-[#3B5249] text-white text-xs" data-testid="alloc-save">{editing ? "Save Changes" : "Allocate"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
