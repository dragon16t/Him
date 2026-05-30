import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit2, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import OrderEditDialog from "./OrderEditDialog";
import DelhiveryShipActions from "./DelhiveryShipActions";
import LabelPrintButton, { BulkLabelButton } from "./LabelPrintButton";
import GstInvoiceButton from "./GstInvoiceButton";
import CsvExportButton from "./CsvExportButton";
import CustomerHistoryModal from "./CustomerHistoryModal";

const API = "/api";

const STATUS_OPTIONS = [
  { v: "all", l: "All" }, { v: "pending", l: "Pending" }, { v: "confirmed", l: "Confirmed" },
  { v: "shipped", l: "Shipped" }, { v: "delivered", l: "Delivered" },
  { v: "not_delivered", l: "Not Delivered" }, { v: "cancelled", l: "Cancelled" }, { v: "rejected", l: "Rejected" },
];

const STATUS_COLORS = {
  delivered: "bg-green-100 text-green-800",
  shipped: "bg-blue-100 text-blue-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  pending: "bg-yellow-100 text-yellow-800",
  not_delivered: "bg-orange-100 text-orange-800",
  cancelled: "bg-red-100 text-red-800",
  rejected: "bg-red-100 text-red-800",
};

/** Reusable orders panel — pagination, date-range, status filter, edit + label + Delhivery actions. */
export default function OrdersPanel({ role, showCreateButton, onCreateOrder }) {
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [status, setStatus] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [products, setProducts] = useState([]);
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [customerPhone, setCustomerPhone] = useState(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = { skip: (page - 1) * limit, limit };
      if (status !== "all") params.status = status;
      if (paymentFilter !== "all") params.payment_type = paymentFilter;
      if (fromDate) params.from = fromDate;
      if (toDate) params.to = toDate;
      const { data } = await axios.get(`${API}/v2/orders`, { params });
      setOrders(data.orders || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to load orders");
    } finally { setLoading(false); }
  }, [page, limit, status, paymentFilter, fromDate, toDate]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  useEffect(() => {
    axios.get(`${API}/products`).then(r => setProducts(r.data.products || [])).catch(() => {});
  }, []);

  const applyQuickRange = (kind) => {
    const today = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    if (kind === "today") { setFromDate(iso(today)); setToDate(iso(today)); }
    else if (kind === "yesterday") { const y = new Date(today); y.setDate(y.getDate() - 1); setFromDate(iso(y)); setToDate(iso(y)); }
    else if (kind === "7d") { const f = new Date(today); f.setDate(f.getDate() - 6); setFromDate(iso(f)); setToDate(iso(today)); }
    else if (kind === "30d") { const f = new Date(today); f.setDate(f.getDate() - 29); setFromDate(iso(f)); setToDate(iso(today)); }
    else if (kind === "month") { const f = new Date(today.getFullYear(), today.getMonth(), 1); setFromDate(iso(f)); setToDate(iso(today)); }
    else if (kind === "clear") { setFromDate(""); setToDate(""); }
    setPage(1);
  };

  const approveOrder = async (id) => {
    try { await axios.put(`${API}/orders/${id}/approve`); toast.success("Approved"); fetchOrders(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const deleteOrder = async (o) => {
    const reason = window.prompt(`Soft-delete order ${o.id} (Rs.${o.total_amount || 0})?\n\nEnter reason:`);
    if (reason === null) return;
    try {
      await axios.delete(`${API}/orders/${o.id}/soft-delete`, { data: { reason } });
      toast.success("Order moved to trash");
      fetchOrders();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Delete failed");
    }
  };

  const canDelete = (o) => (role === "admin" || role === "sales_manager") && !o.deleted;

  const toggleSel = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const toggleSelAll = () => setSelected(s => s.length === orders.length ? [] : orders.map(o => o.id));

  const canEdit = (o) => !["delivered", "cancelled", "rejected"].includes(o.status);

  return (
    <div className="space-y-3" data-testid="orders-panel">
      {/* Filter bar */}
      <div className="bg-white rounded-2xl border border-[#E5E3DB] p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-heading text-lg font-medium">Orders <span className="text-sm text-[#59615D]">· {total} total</span></h3>
          <div className="flex items-center gap-2 flex-wrap">
            {selected.length > 0 && <BulkLabelButton orderIds={selected} compact />}
            <CsvExportButton type="orders" compact filters={{ from: fromDate, to: toDate, status: status !== "all" ? status : undefined, payment_type: paymentFilter !== "all" ? paymentFilter : undefined }} />
            {showCreateButton && onCreateOrder && <Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs h-8" onClick={onCreateOrder} data-testid="orders-create-btn">+ Create Order</Button>}
          </div>
        </div>
        {/* Quick chips + dates */}
        <div className="flex items-center gap-2 flex-wrap">
          {[{ k: "today", l: "Today" }, { k: "yesterday", l: "Yesterday" }, { k: "7d", l: "Last 7d" }, { k: "30d", l: "Last 30d" }, { k: "month", l: "This Month" }, { k: "clear", l: "All" }].map(c => (
            <button key={c.k} onClick={() => applyQuickRange(c.k)}
              className="px-3 py-1 rounded-full text-[11px] font-medium border border-[#E5E3DB] hover:border-[#3B5249] hover:bg-[#F9F8F6] transition"
              data-testid={`range-${c.k}`}>{c.l}</button>
          ))}
          <div className="flex items-center gap-1 ml-2">
            <Input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1); }} className="rounded-xl h-8 text-xs w-36" data-testid="orders-from" />
            <span className="text-xs text-[#59615D]">→</span>
            <Input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(1); }} className="rounded-xl h-8 text-xs w-36" data-testid="orders-to" />
          </div>
          <Select value={status} onValueChange={v => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="rounded-xl h-8 text-xs w-32" data-testid="orders-status"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={paymentFilter} onValueChange={v => { setPaymentFilter(v); setPage(1); }}>
            <SelectTrigger className="rounded-xl h-8 text-xs w-32" data-testid="orders-payment-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payments</SelectItem>
              <SelectItem value="cod">COD Only</SelectItem>
              <SelectItem value="prepaid">Prepaid Only</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(limit)} onValueChange={v => { setLimit(Number(v)); setPage(1); }}>
            <SelectTrigger className="rounded-xl h-8 text-xs w-24" data-testid="orders-limit"><SelectValue /></SelectTrigger>
            <SelectContent>{[25, 50, 100, 200].map(n => <SelectItem key={n} value={String(n)}>{n}/page</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* Orders list */}
      <div className="bg-white rounded-2xl border border-[#E5E3DB] p-3">
        {loading && <p className="text-center py-6 text-[#59615D] text-sm">Loading…</p>}
        {!loading && orders.length === 0 && <p className="text-center py-8 text-[#59615D] text-sm">No orders match these filters</p>}
        {!loading && orders.length > 0 && (
          <>
            <div className="flex items-center gap-2 px-2 pb-2 text-[10px] text-[#59615D] border-b border-[#E5E3DB] mb-2">
              <input type="checkbox" checked={selected.length === orders.length && orders.length > 0} onChange={toggleSelAll} data-testid="orders-select-all" />
              <span>Select All on this page · {selected.length} selected</span>
            </div>
            <div className="space-y-2">
              {orders.map(o => (
                <div key={o.id} className="border border-[#E5E3DB] rounded-xl p-3 hover:shadow-sm transition" data-testid={`order-row-${o.id}`}>
                  <div className="flex flex-col sm:flex-row justify-between gap-2">
                    <div className="flex gap-2 flex-1 min-w-0">
                      <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggleSel(o.id)} className="mt-1" data-testid={`order-sel-${o.id}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-mono text-[11px]">{o.id}</p>
                          <Badge className={`text-[9px] whitespace-nowrap ${STATUS_COLORS[o.status] || "bg-gray-100 text-gray-800"}`}>{(o.status || "").toUpperCase()}</Badge>
                          <Badge variant="outline" className="text-[9px]">{(o.payment_type || o.payment_method || "cod").toUpperCase()}</Badge>
                          {o.source === "agent_store" ? (
                            <Badge className="text-[9px] bg-amber-100 text-amber-900 border border-amber-300">🌟 AGENT · {o.agent_name || ""}</Badge>
                          ) : (
                            <Badge className="text-[9px] bg-blue-100 text-blue-800">📞 TELECALLER</Badge>
                          )}
                          {o.awb_number && <Badge className="text-[9px] bg-purple-100 text-purple-800">AWB {o.awb_number}</Badge>}
                          <span className="text-[10px] text-[#59615D]">{(o.created_at || "").slice(0, 16).replace("T", " ")}</span>
                        </div>
                        <p className="font-medium text-sm mt-1 truncate"><button onClick={() => setCustomerPhone(o.customer_phone)} className="hover:underline hover:text-[#A66E4E]" data-testid={`cust-${o.id}`}>{o.customer_name} | {o.customer_phone}</button></p>
                        <p className="text-xs text-[#59615D] truncate">{o.customer_address}{o.customer_city ? `, ${o.customer_city}` : ""}{o.customer_pincode ? ` - ${o.customer_pincode}` : ""}</p>
                        {(o.items || []).map((it, i) => (
                          <p key={i} className="text-xs text-[#59615D]">• {it.product_name || it.name} ×{it.quantity || it.qty || 1} = Rs.{(it.price || 0) * (it.quantity || it.qty || 1)}</p>
                        ))}
                        <p className="font-heading font-semibold text-[#3B5249] text-sm mt-1">Rs.{o.total_amount || o.total || o.amount} · By: {o.created_by_name || o.agent_name || "—"} <span className="text-[10px] text-[#59615D]">({(o.created_by_role || (o.source === "agent_store" ? "agent" : "")).replace("_", " ")})</span></p>
                      </div>
                    </div>
                    <div className="flex gap-1.5 items-start flex-wrap">
                      {canEdit(o) && <Button size="sm" variant="outline" className="rounded-full text-[10px] h-7 px-2" onClick={() => setEditing(o)} data-testid={`edit-order-${o.id}`}><Edit2 className="w-3 h-3 mr-1" />Edit</Button>}
                      <LabelPrintButton orderId={o.id} compact />
                      <GstInvoiceButton orderId={o.id} compact />
                      {o.status === "pending" && (role === "admin" || role === "sales_manager" || role === "district_manager") && <Button size="sm" className="rounded-full text-[10px] h-7 px-2 bg-[#6B8E6B] text-white" onClick={() => approveOrder(o.id)} data-testid={`approve-${o.id}`}>Approve</Button>}
                      <DelhiveryShipActions order={o} role={role} onChange={fetchOrders} compact />
                      {canDelete(o) && <Button size="sm" variant="outline" className="rounded-full text-[10px] h-7 px-2 border-red-300 text-red-600 hover:bg-red-50" onClick={() => deleteOrder(o)} data-testid={`delete-order-${o.id}`}><Trash2 className="w-3 h-3 mr-1" />Delete</Button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Pagination footer */}
        {pages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#E5E3DB]">
            <p className="text-xs text-[#59615D]">Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of <b>{total}</b></p>
            <div className="flex items-center gap-1" data-testid="orders-pagination">
              <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="rounded-full h-7 w-7 p-0"><ChevronLeft className="w-3.5 h-3.5" /></Button>
              {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
                let n = i + 1;
                if (pages > 7) {
                  if (page <= 4) n = i + 1;
                  else if (page >= pages - 3) n = pages - 6 + i;
                  else n = page - 3 + i;
                }
                return (
                  <Button key={n} size="sm" variant={page === n ? "default" : "outline"}
                    onClick={() => setPage(n)} data-testid={`page-${n}`}
                    className={`rounded-full h-7 w-7 p-0 text-[11px] ${page === n ? "bg-[#3B5249] text-white" : ""}`}>
                    {n}
                  </Button>
                );
              })}
              <Button size="sm" variant="outline" disabled={page === pages} onClick={() => setPage(p => Math.min(pages, p + 1))} className="rounded-full h-7 w-7 p-0"><ChevronRight className="w-3.5 h-3.5" /></Button>
            </div>
          </div>
        )}
      </div>

      {editing && (
        <OrderEditDialog
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          order={editing}
          products={products}
          onSaved={() => { setEditing(null); fetchOrders(); }}
        />
      )}
      {customerPhone && <CustomerHistoryModal phone={customerPhone} onClose={() => setCustomerPhone(null)} />}
    </div>
  );
}
