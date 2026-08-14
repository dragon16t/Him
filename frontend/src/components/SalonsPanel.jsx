import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Store, Plus, Phone, MessageCircle, MapPin, Search, TrendingUp, Trash2, Loader2, ShoppingCart, FileText, X } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

const STATUSES = [
  { v: "visited", l: "Visited", cls: "bg-slate-50 text-slate-700 border-slate-200" },
  { v: "interested", l: "Interested", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  { v: "onboarded", l: "Onboarded", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  { v: "converted", l: "Converted", cls: "bg-green-50 text-green-700 border-green-200" },
  { v: "not_interested", l: "Not Interested", cls: "bg-red-50 text-red-700 border-red-200" },
];

const EMPTY_SALON = {
  name: "", owner_name: "", phone: "", whatsapp: "", email: "",
  address: "", landmark: "", area: "", city: "", district: "",
  state: "Kerala", pincode: "", notes: "",
};

// ─── Sales Manager > Visited Salons pipeline
// Tracks B2B salon partners through visited → interested → onboarded → converted.
// Each row exposes call/WhatsApp shortcuts + a monthly-orders drawer.
export default function SalonsPanel() {
  const [salons, setSalons] = useState([]);
  const [stats, setStats] = useState({});
  const [statusFilter, setStatusFilter] = useState("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_SALON });
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState(null); // { salon, orders, monthCount, monthRevenue }
  const [monthCursor, setMonthCursor] = useState(new Date().toISOString().slice(0, 7));
  const [districtFilter, setDistrictFilter] = useState("all");

  // Quick-order dialog state (opened via "Create Order" button on a salon card).
  const [orderSalon, setOrderSalon] = useState(null);
  const [orderItems, setOrderItems] = useState([{ product_name: "", quantity: 1, price: 0 }]);
  const [orderPayment, setOrderPayment] = useState("cod");
  const [orderSaving, setOrderSaving] = useState(false);

  const openOrderDialog = (s) => {
    setOrderSalon(s);
    setOrderItems([{ product_name: "", quantity: 1, price: 0 }]);
    setOrderPayment("cod");
  };
  const orderTotal = orderItems.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.price) || 0), 0);

  const submitOrder = async () => {
    if (!orderSalon) return;
    const cleanItems = orderItems.filter((it) => (it.product_name || "").trim() && Number(it.price) > 0);
    if (!cleanItems.length) { toast.error("Add at least one line item with name and price"); return; }
    setOrderSaving(true);
    try {
      const payload = {
        salon_id: orderSalon.id,
        customer_name: orderSalon.name,
        customer_phone: orderSalon.phone,
        customer_address: orderSalon.address || `${orderSalon.area || ""} ${orderSalon.city || ""}`.trim(),
        customer_city: orderSalon.city,
        customer_pincode: orderSalon.pincode,
        customer_state: orderSalon.state,
        items: cleanItems.map((it) => ({
          product_name: it.product_name,
          quantity: Number(it.quantity) || 1,
          price: Number(it.price) || 0,
        })),
        total_amount: orderTotal,
        payment_type: orderPayment,
      };
      await axios.post(`${API}/orders`, payload);
      toast.success(`Order created for ${orderSalon.name} (₹${orderTotal})`);
      setOrderSalon(null);
      fetchSalons();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Order create failed");
    } finally {
      setOrderSaving(false);
    }
  };

  // Distinct districts from loaded salons
  const districts = useMemo(() => {
    const s = new Set();
    salons.forEach((x) => { if (x.district) s.add(x.district); });
    return ["all", ...Array.from(s).sort()];
  }, [salons]);

  const fetchSalons = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (q.trim()) params.set("q", q.trim());
      const { data } = await axios.get(`${API}/salons?${params.toString()}`);
      setSalons(data.salons || []);
      setStats(data.stats || {});
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to load salons");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSalons(); }, [statusFilter]);
  useEffect(() => { const t = setTimeout(fetchSalons, 400); return () => clearTimeout(t); }, [q]);

  const filtered = useMemo(() => {
    if (districtFilter === "all") return salons;
    return salons.filter((s) => (s.district || "").toLowerCase() === districtFilter.toLowerCase());
  }, [salons, districtFilter]);

  const submitAdd = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error("Name and phone are required");
      return;
    }
    setSaving(true);
    try {
      await axios.post(`${API}/salons`, form);
      toast.success(`Salon "${form.name}" added`);
      setForm({ ...EMPTY_SALON });
      setShowAdd(false);
      fetchSalons();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to add salon");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (salon, newStatus) => {
    try {
      const { data } = await axios.patch(`${API}/salons/${salon.id}`, { status: newStatus });
      setSalons((arr) => arr.map((s) => (s.id === salon.id ? data.salon : s)));
      toast.success(`Status → ${STATUSES.find(x => x.v === newStatus)?.l || newStatus}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Update failed");
    }
  };

  const openDetail = async (salon) => {
    setDetail({ salon, orders: [], loading: true });
    try {
      const { data } = await axios.get(`${API}/salons/${salon.id}/orders?month=${monthCursor}`);
      setDetail({ salon, orders: data.orders || [], count: data.count, revenue: data.revenue, loading: false });
    } catch (e) {
      setDetail({ salon, orders: [], count: 0, revenue: 0, loading: false });
    }
  };

  const remove = async (salon) => {
    if (!window.confirm(`Delete "${salon.name}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`${API}/salons/${salon.id}`);
      setSalons((arr) => arr.filter((s) => s.id !== salon.id));
      toast.success("Salon removed");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Delete failed");
    }
  };

  return (
    <div className="space-y-4" data-testid="salons-panel">
      {/* Header + Add button */}
      <div className="bg-white rounded-xl border border-[#E5E3DB] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-[#3B5249]" />
            <h2 className="font-heading text-base font-medium text-[#2C3531]">Visited Salons &amp; Stores</h2>
          </div>
          <Button
            onClick={() => setShowAdd(true)}
            className="rounded-full bg-[#3B5249] hover:bg-[#2C3531] text-white"
            data-testid="salon-add-btn"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />Add visited shop
          </Button>
        </div>
        <p className="text-xs text-[#59615D]">
          Track every salon you visit, mark status as they progress (Visited → Interested → Onboarded → Converted),
          and see monthly orders per shop. Tap a row to open the orders drawer.
        </p>
      </div>

      {/* Status pipeline chips */}
      <div className="bg-white rounded-xl border border-[#E5E3DB] p-3">
        <div className="flex gap-2 flex-wrap">
          <StatusChip label="All" count={Object.values(stats).reduce((a, b) => a + b, 0)}
            active={statusFilter === "all"} onClick={() => setStatusFilter("all")} testid="salon-filter-all" />
          {STATUSES.map((s) => (
            <StatusChip
              key={s.v}
              label={s.l}
              count={stats[s.v] || 0}
              cls={s.cls}
              active={statusFilter === s.v}
              onClick={() => setStatusFilter(s.v)}
              testid={`salon-filter-${s.v}`}
            />
          ))}
        </div>
      </div>

      {/* Search + District filter */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#59615D]" />
          <Input
            placeholder="Search name, owner, phone, area, city…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-10"
            data-testid="salon-search"
          />
        </div>
        <select
          value={districtFilter}
          onChange={(e) => setDistrictFilter(e.target.value)}
          className="h-10 rounded-md border border-[#E5E3DB] px-3 text-sm bg-white min-w-[180px]"
          data-testid="salon-district-filter"
        >
          {districts.map((d) => (
            <option key={d} value={d}>{d === "all" ? "All Districts" : d}</option>
          ))}
        </select>
      </div>

      {/* Salon cards */}
      {loading ? (
        <div className="text-center py-8 text-[#59615D]"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-[#E5E3DB] p-8 text-center text-sm text-[#59615D]">
          No salons yet. Click <b>Add visited shop</b> to record your first visit.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((s) => {
            const sc = STATUSES.find((x) => x.v === s.status) || STATUSES[0];
            return (
              <div key={s.id} className="bg-white rounded-xl border border-[#E5E3DB] p-4 hover:shadow-md transition"
                   data-testid={`salon-card-${s.id}`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-[#2C3531] truncate">{s.name}</h3>
                    {s.owner_name && <p className="text-[11px] text-[#59615D]">Owner: {s.owner_name}</p>}
                  </div>
                  <span className={`text-[9px] uppercase px-2 py-0.5 rounded-full border ${sc.cls}`}>
                    {sc.l}
                  </span>
                </div>

                <div className="text-[11px] text-[#59615D] space-y-1 mb-3">
                  <div className="flex items-start gap-1"><MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span className="line-clamp-2">{s.area}{s.area && s.city ? ", " : ""}{s.city}{s.district ? ` · ${s.district}` : ""}{s.pincode ? ` — ${s.pincode}` : ""}</span>
                  </div>
                  {s.address && <p className="pl-4 line-clamp-2 text-[10px]">{s.address}</p>}
                </div>

                {/* Monthly stats */}
                {(s.month_orders > 0 || s.status === "converted" || s.status === "onboarded") && (
                  <div className="bg-[#F9F8F6] rounded-lg px-2 py-1.5 mb-3 flex items-center justify-between text-[11px]">
                    <span className="text-[#59615D]">This month:</span>
                    <span className="font-medium text-[#2C3531]">
                      {s.month_orders} order{s.month_orders === 1 ? "" : "s"} · ₹{Math.round(s.month_revenue || 0)}
                    </span>
                  </div>
                )}

                {/* Actions row */}
                <div className="flex gap-1.5 flex-wrap">
                  <a href={`tel:+91${s.phone}`}
                     className="flex-1 min-w-[70px] flex items-center justify-center gap-1 text-[11px] py-1.5 rounded-md bg-[#3B5249] text-white hover:bg-[#2C3531]"
                     data-testid={`salon-call-${s.id}`}>
                    <Phone className="w-3 h-3" />Call
                  </a>
                  <a href={`https://wa.me/91${s.whatsapp || s.phone}`} target="_blank" rel="noreferrer"
                     className="flex-1 min-w-[70px] flex items-center justify-center gap-1 text-[11px] py-1.5 rounded-md bg-green-600 text-white hover:bg-green-700"
                     data-testid={`salon-wa-${s.id}`}>
                    <MessageCircle className="w-3 h-3" />WhatsApp
                  </a>
                  <button onClick={() => openDetail(s)}
                          className="flex-1 min-w-[70px] flex items-center justify-center gap-1 text-[11px] py-1.5 rounded-md bg-white border border-[#3B5249] text-[#3B5249] hover:bg-[#F9F8F6]"
                          data-testid={`salon-orders-${s.id}`}>
                    <TrendingUp className="w-3 h-3" />Orders
                  </button>
                </div>

                {/* Order & Invoice quick-actions (only for onboarded/converted salons) */}
                {(s.status === "onboarded" || s.status === "converted") && (
                  <div className="flex gap-1.5 mt-1.5">
                    <button
                      onClick={() => openOrderDialog(s)}
                      className="flex-1 flex items-center justify-center gap-1 text-[11px] py-1.5 rounded-md bg-amber-500 text-white hover:bg-amber-600"
                      data-testid={`salon-create-order-${s.id}`}>
                      <ShoppingCart className="w-3 h-3" />Create Order
                    </button>
                    <button
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent("crm:invoice-for-salon", { detail: s }));
                        toast.success(`Ready to invoice ${s.name}`);
                      }}
                      className="flex-1 flex items-center justify-center gap-1 text-[11px] py-1.5 rounded-md bg-slate-700 text-white hover:bg-slate-800"
                      data-testid={`salon-invoice-${s.id}`}>
                      <FileText className="w-3 h-3" />Invoice
                    </button>
                  </div>
                )}

                {/* Status update dropdown */}
                <div className="mt-2 flex items-center gap-2">
                  <select
                    value={s.status}
                    onChange={(e) => updateStatus(s, e.target.value)}
                    className="flex-1 h-7 rounded-md border border-[#E5E3DB] px-2 text-[11px] bg-white"
                    data-testid={`salon-status-${s.id}`}
                  >
                    {STATUSES.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}
                  </select>
                  <button onClick={() => remove(s)} className="text-red-500 hover:text-red-700 p-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="salon-add-dialog">
          <DialogHeader><DialogTitle>Add visited shop</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            <Field label="Salon / Store Name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} testid="salon-form-name" />
            <Field label="Owner Name" value={form.owner_name} onChange={(v) => setForm({ ...form, owner_name: v })} />
            <Field label="Phone * (10 digit)" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} testid="salon-form-phone" />
            <Field label="WhatsApp (if different)" value={form.whatsapp} onChange={(v) => setForm({ ...form, whatsapp: v })} />
            <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
            <Field label="Area" value={form.area} onChange={(v) => setForm({ ...form, area: v })} />
            <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
            <Field label="District" value={form.district} onChange={(v) => setForm({ ...form, district: v })} />
            <Field label="State" value={form.state} onChange={(v) => setForm({ ...form, state: v })} />
            <Field label="Pincode" value={form.pincode} onChange={(v) => setForm({ ...form, pincode: v })} />
            <div className="md:col-span-2">
              <Label className="text-[11px]">Full Address</Label>
              <Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} data-testid="salon-form-address" />
            </div>
            <Field label="Landmark" value={form.landmark} onChange={(v) => setForm({ ...form, landmark: v })} />
            <div className="md:col-span-2">
              <Label className="text-[11px]">Notes (visit summary, next follow-up etc)</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" onClick={() => setShowAdd(false)} className="rounded-full">Cancel</Button>
            <Button onClick={submitAdd} disabled={saving}
                    className="rounded-full bg-[#3B5249] hover:bg-[#2C3531] text-white"
                    data-testid="salon-form-submit">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
              Save salon
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail / Orders dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="salon-detail-dialog">
          <DialogHeader>
            <DialogTitle>{detail?.salon?.name}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="text-[11px] text-[#59615D] grid grid-cols-2 md:grid-cols-3 gap-2">
                <div><b>Owner:</b> {detail.salon.owner_name || "—"}</div>
                <div><b>Phone:</b> {detail.salon.phone}</div>
                <div><b>Area:</b> {detail.salon.area || "—"}</div>
                <div><b>City:</b> {detail.salon.city || "—"} · {detail.salon.district || ""}</div>
                <div><b>State:</b> {detail.salon.state}</div>
                <div><b>Pincode:</b> {detail.salon.pincode || "—"}</div>
                <div className="md:col-span-3"><b>Address:</b> {detail.salon.address || "—"}</div>
                {detail.salon.notes && <div className="md:col-span-3 bg-[#F9F8F6] rounded p-2"><b>Notes:</b> {detail.salon.notes}</div>}
              </div>

              <div className="bg-[#F9F8F6] rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label className="text-[11px]">Month</Label>
                  <Input type="month" value={monthCursor}
                         onChange={(e) => { setMonthCursor(e.target.value); openDetail(detail.salon); }}
                         className="h-8 w-40" />
                </div>
                <div className="text-sm">
                  <span className="text-[#59615D]">Orders:</span> <b>{detail.count || 0}</b>{" · "}
                  <span className="text-[#59615D]">Revenue:</span> <b>₹{Math.round(detail.revenue || 0)}</b>
                </div>
              </div>

              {detail.loading ? (
                <div className="text-center py-6 text-sm text-[#59615D]"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading orders…</div>
              ) : detail.orders?.length === 0 ? (
                <div className="text-center py-6 text-sm text-[#59615D]">No orders for this salon in the selected month.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[#59615D] uppercase text-[10px] border-b border-[#E5E3DB]">
                      <th className="py-2 pr-2">Order ID</th>
                      <th className="py-2 pr-2">Date</th>
                      <th className="py-2 pr-2">Items</th>
                      <th className="py-2 pr-2 text-right">Amount</th>
                      <th className="py-2 pr-2">Payment</th>
                      <th className="py-2 pr-2">Credit Status</th>
                      <th className="py-2 pr-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.orders.map((o) => (
                      <tr key={o.id} className="border-b border-[#F3F1EB]">
                        <td className="py-1.5 pr-2 font-mono text-[10px]">{o.id}</td>
                        <td className="py-1.5 pr-2">{o.created_at ? new Date(o.created_at).toLocaleDateString() : "—"}</td>
                        <td className="py-1.5 pr-2">{(o.items || []).map(i => i.product_name || i.name || "").filter(Boolean).join(", ") || "—"}</td>
                        <td className="py-1.5 pr-2 text-right font-medium">₹{o.total_amount}</td>
                        <td className="py-1.5 pr-2 uppercase text-[9px]">{o.payment_type}</td>
                        <td className="py-1.5 pr-2">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                            o.payment_status === "paid" || o.payment_status === "captured"
                              ? "bg-green-50 text-green-700 border border-green-200"
                              : (o.payment_type || "").toLowerCase() === "cod"
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-slate-50 text-slate-700 border border-slate-200"
                          }`}>
                            {o.payment_status || ((o.payment_type || "").toLowerCase() === "cod" ? "COD due" : "unpaid")}
                          </span>
                        </td>
                        <td className="py-1.5 pr-2">{o.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Quick Order dialog — creates an order pre-linked to this salon */}
      <Dialog open={!!orderSalon} onOpenChange={(o) => !o && setOrderSalon(null)}>
        <DialogContent className="max-w-2xl" data-testid="salon-order-dialog">
          <DialogHeader>
            <DialogTitle>Create order for {orderSalon?.name}</DialogTitle>
          </DialogHeader>
          {orderSalon && (
            <div className="space-y-3 pt-2">
              <div className="text-[11px] text-[#59615D] bg-[#F9F8F6] rounded-md px-3 py-2">
                Ships to: <b>{orderSalon.name}</b> · {orderSalon.city || "—"} · {orderSalon.pincode || "—"} · {orderSalon.phone}
              </div>

              <div>
                <div className="grid grid-cols-12 gap-2 text-[10px] uppercase text-[#59615D] mb-1 px-1">
                  <div className="col-span-6">Product</div>
                  <div className="col-span-2 text-center">Qty</div>
                  <div className="col-span-3 text-right">Price (₹)</div>
                  <div className="col-span-1"></div>
                </div>
                {orderItems.map((it, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 mb-1">
                    <Input className="col-span-6" placeholder="Product name" value={it.product_name}
                      onChange={(e) => setOrderItems((arr) => arr.map((x, idx) => idx === i ? { ...x, product_name: e.target.value } : x))}
                      data-testid={`salon-order-item-name-${i}`} />
                    <Input type="number" className="col-span-2 text-center" value={it.quantity}
                      onChange={(e) => setOrderItems((arr) => arr.map((x, idx) => idx === i ? { ...x, quantity: e.target.value } : x))} />
                    <Input type="number" className="col-span-3 text-right" value={it.price}
                      onChange={(e) => setOrderItems((arr) => arr.map((x, idx) => idx === i ? { ...x, price: e.target.value } : x))} />
                    <button className="col-span-1 text-red-500 hover:text-red-700"
                            onClick={() => setOrderItems((arr) => arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr)}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <button onClick={() => setOrderItems((arr) => [...arr, { product_name: "", quantity: 1, price: 0 }])}
                        className="text-[11px] text-[#3B5249] hover:underline mt-1"
                        data-testid="salon-order-add-item">
                  + Add another item
                </button>
              </div>

              <div className="flex items-center justify-between bg-[#F9F8F6] rounded-md px-3 py-2">
                <div className="flex items-center gap-3">
                  <Label className="text-[11px]">Payment</Label>
                  <select value={orderPayment} onChange={(e) => setOrderPayment(e.target.value)}
                          className="h-8 rounded-md border border-[#E5E3DB] px-2 text-xs bg-white"
                          data-testid="salon-order-payment">
                    <option value="cod">COD</option>
                    <option value="upi">UPI</option>
                    <option value="razorpay">Razorpay link</option>
                    <option value="bank_transfer">Bank transfer</option>
                  </select>
                </div>
                <div className="text-sm">
                  Total: <b>₹{orderTotal.toLocaleString("en-IN")}</b>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setOrderSalon(null)} className="rounded-full">Cancel</Button>
                <Button onClick={submitOrder} disabled={orderSaving}
                        className="rounded-full bg-amber-500 hover:bg-amber-600 text-white"
                        data-testid="salon-order-submit">
                  {orderSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <ShoppingCart className="w-3.5 h-3.5 mr-1.5" />}
                  Create order
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const StatusChip = ({ label, count, cls, active, onClick, testid }) => (
  <button
    onClick={onClick}
    data-testid={testid}
    className={`text-[11px] px-3 py-1 rounded-full border transition ${active ? "bg-[#3B5249] text-white border-[#3B5249]" : cls || "bg-white text-[#3B5249] border-[#E5E3DB] hover:bg-[#F9F8F6]"}`}
  >
    {label} <span className="opacity-70 ml-1">({count})</span>
  </button>
);

const Field = ({ label, value, onChange, testid }) => (
  <div>
    <Label className="text-[11px]">{label}</Label>
    <Input value={value} onChange={(e) => onChange(e.target.value)} data-testid={testid} />
  </div>
);
