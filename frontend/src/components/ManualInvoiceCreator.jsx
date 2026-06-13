/**
 * ManualInvoiceCreator
 * ---------------------------------------------------------------------------
 * Lets a Sales Manager (or Admin) build a free-form invoice for a walk-in
 * shop / B2B customer where pricing & GST are entered by hand.
 *
 *  - Customer block:   shop name, contact person, phone, GSTIN, address.
 *  - Line items:       name, HSN, qty, unit price, GST%, line total auto-calc.
 *  - Totals:           subtotal, GST, grand total auto-computed.
 *  - On save:          POST /api/invoices/manual → returns {id} and downloads
 *                      the printable GST invoice PDF (`/api/invoices/{id}/pdf`).
 *
 *  Backend contract:   {customer:{...}, items:[{name,hsn,qty,price,gst_pct}],
 *                       notes, payment_terms, place_of_supply}
 */
import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, FileText, Loader2 } from "lucide-react";

const API = "/api";

const EMPTY_ITEM = { name: "", hsn: "", qty: 1, price: 0, gst_pct: 18 };

export default function ManualInvoiceCreator() {
  const [customer, setCustomer] = useState({
    shop_name: "", contact_person: "", phone: "", gstin: "",
    address: "", city: "", state: "Kerala", pincode: "",
  });
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
  const [notes, setNotes] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("Cash / UPI on delivery");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);

  const setCust = (k, v) => setCustomer((c) => ({ ...c, [k]: v }));
  const setItem = (i, k, v) => setItems((arr) => arr.map((it, idx) => idx === i ? { ...it, [k]: v } : it));
  const addItem = () => setItems((arr) => [...arr, { ...EMPTY_ITEM }]);
  const removeItem = (i) => setItems((arr) => arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr);

  const lineTotal = (it) => Number(it.qty || 0) * Number(it.price || 0);
  const lineGst = (it) => lineTotal(it) * (Number(it.gst_pct || 0) / 100);
  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0);
  const gstTotal = items.reduce((s, it) => s + lineGst(it), 0);
  const grandTotal = subtotal + gstTotal;

  const fetchHistory = async () => {
    try {
      const { data } = await axios.get(`${API}/invoices/manual`);
      setHistory(data.invoices || []);
    } catch { /* silent */ }
  };

  const save = async () => {
    if (!customer.shop_name.trim()) return toast.error("Shop name required");
    if (!items.some((it) => it.name && it.qty > 0)) return toast.error("Add at least one line item");
    setSaving(true);
    try {
      const payload = {
        customer,
        items: items.filter((it) => it.name && Number(it.qty) > 0),
        notes,
        payment_terms: paymentTerms,
        subtotal,
        gst_total: gstTotal,
        grand_total: grandTotal,
      };
      const { data } = await axios.post(`${API}/invoices/manual`, payload);
      toast.success(`Invoice ${data.invoice_id} created`);
      // Open printable PDF
      const pdf = await axios.get(`${API}/invoices/${data.invoice_id}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(pdf.data);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      // Reset
      setCustomer({ shop_name: "", contact_person: "", phone: "", gstin: "", address: "", city: "", state: "Kerala", pincode: "" });
      setItems([{ ...EMPTY_ITEM }]);
      setNotes("");
      fetchHistory();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to create invoice");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E5E3DB] p-5 space-y-5" data-testid="manual-invoice-panel">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading text-lg text-[#2C3531]">Manual GST Invoice</h3>
          <p className="text-[11px] text-[#7B6D5A]">For B2B / walk-in shop sales — enter shop details, line items, and GST manually. PDF is auto-generated.</p>
        </div>
      </div>

      {/* CUSTOMER BLOCK */}
      <div className="bg-[#FBF7F0] rounded-xl border border-[#E5E3DB] p-4 space-y-3">
        <h4 className="text-[12px] font-semibold text-[#3B5249] uppercase tracking-wider">Bill To</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label className="text-[11px]">Shop / Business Name *</Label><Input value={customer.shop_name} onChange={e => setCust("shop_name", e.target.value)} data-testid="mi-shop-name" placeholder="ABC Beauty Store"/></div>
          <div><Label className="text-[11px]">Contact Person</Label><Input value={customer.contact_person} onChange={e => setCust("contact_person", e.target.value)} placeholder="Mr. Suresh"/></div>
          <div><Label className="text-[11px]">Phone</Label><Input value={customer.phone} onChange={e => setCust("phone", e.target.value)} data-testid="mi-phone" placeholder="9876543210"/></div>
          <div><Label className="text-[11px]">GSTIN (optional)</Label><Input value={customer.gstin} onChange={e => setCust("gstin", e.target.value)} placeholder="32ABCDE1234F1Z5"/></div>
          <div className="sm:col-span-2"><Label className="text-[11px]">Address</Label><Textarea rows={2} value={customer.address} onChange={e => setCust("address", e.target.value)} data-testid="mi-address" placeholder="Shop No 5, MG Road"/></div>
          <div><Label className="text-[11px]">City</Label><Input value={customer.city} onChange={e => setCust("city", e.target.value)}/></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-[11px]">State</Label><Input value={customer.state} onChange={e => setCust("state", e.target.value)}/></div>
            <div><Label className="text-[11px]">PIN</Label><Input value={customer.pincode} onChange={e => setCust("pincode", e.target.value)}/></div>
          </div>
        </div>
      </div>

      {/* LINE ITEMS */}
      <div className="bg-[#FBF7F0] rounded-xl border border-[#E5E3DB] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-[12px] font-semibold text-[#3B5249] uppercase tracking-wider">Items</h4>
          <Button size="sm" variant="outline" onClick={addItem} className="rounded-full text-[11px] h-7" data-testid="mi-add-item"><Plus className="w-3 h-3 mr-1"/>Add line</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-[#7B6D5A] border-b border-[#E5E3DB]">
                <th className="pb-1.5">Item</th>
                <th className="pb-1.5 w-20">HSN</th>
                <th className="pb-1.5 w-14">Qty</th>
                <th className="pb-1.5 w-20">Price (₹)</th>
                <th className="pb-1.5 w-16">GST %</th>
                <th className="pb-1.5 w-24 text-right">Total (₹)</th>
                <th className="pb-1.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b border-[#F0EDE5]" data-testid={`mi-row-${i}`}>
                  <td className="py-1.5 pr-1"><Input value={it.name} onChange={e => setItem(i, "name", e.target.value)} placeholder="Product name" className="h-8 text-[12px]" data-testid={`mi-item-name-${i}`}/></td>
                  <td className="py-1.5 pr-1"><Input value={it.hsn} onChange={e => setItem(i, "hsn", e.target.value)} placeholder="3304" className="h-8 text-[12px]"/></td>
                  <td className="py-1.5 pr-1"><Input type="number" min="1" value={it.qty} onChange={e => setItem(i, "qty", Number(e.target.value || 0))} className="h-8 text-[12px]" data-testid={`mi-item-qty-${i}`}/></td>
                  <td className="py-1.5 pr-1"><Input type="number" min="0" value={it.price} onChange={e => setItem(i, "price", Number(e.target.value || 0))} className="h-8 text-[12px]" data-testid={`mi-item-price-${i}`}/></td>
                  <td className="py-1.5 pr-1"><Input type="number" min="0" max="28" value={it.gst_pct} onChange={e => setItem(i, "gst_pct", Number(e.target.value || 0))} className="h-8 text-[12px]"/></td>
                  <td className="py-1.5 text-right font-medium text-[#2C3531]">{(lineTotal(it) + lineGst(it)).toFixed(2)}</td>
                  <td className="py-1.5 text-right">
                    {items.length > 1 && (
                      <button onClick={() => removeItem(i)} className="text-red-500 hover:text-red-700" data-testid={`mi-del-${i}`}><Trash2 className="w-3.5 h-3.5"/></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="text-[12px]">
              <tr><td colSpan={5} className="pt-2 text-right text-[#7B6D5A]">Subtotal</td><td className="pt-2 text-right font-medium">₹{subtotal.toFixed(2)}</td><td/></tr>
              <tr><td colSpan={5} className="pt-1 text-right text-[#7B6D5A]">GST</td><td className="pt-1 text-right font-medium">₹{gstTotal.toFixed(2)}</td><td/></tr>
              <tr><td colSpan={5} className="pt-1 text-right text-[#3B5249] font-bold">Grand Total</td><td className="pt-1 text-right text-[#3B5249] font-bold text-[14px]" data-testid="mi-grand-total">₹{grandTotal.toFixed(2)}</td><td/></tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* NOTES + PAYMENT */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><Label className="text-[11px]">Notes (optional)</Label><Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Delivery details, special pricing notes…"/></div>
        <div><Label className="text-[11px]">Payment Terms</Label><Input value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)}/></div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="rounded-full bg-[#3B5249] text-white px-6" data-testid="mi-save-btn">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : <FileText className="w-4 h-4 mr-2"/>}
          Generate Invoice PDF
        </Button>
      </div>

      {/* HISTORY (last 10) */}
      {history.length > 0 && (
        <div className="border-t border-[#E5E3DB] pt-4">
          <h4 className="text-[12px] font-semibold text-[#3B5249] uppercase tracking-wider mb-2">Recent Invoices</h4>
          <div className="space-y-1">
            {history.slice(0, 10).map((inv) => (
              <a key={inv.id} href={`${process.env.REACT_APP_BACKEND_URL}/api/invoices/${inv.id}/pdf?token=${encodeURIComponent(localStorage.getItem('token') || '')}`} target="_blank" rel="noreferrer"
                 className="flex items-center justify-between text-[11px] py-1.5 px-2 rounded hover:bg-[#FBF7F0]">
                <span><b>{inv.id}</b> · {inv.customer?.shop_name}</span>
                <span className="text-[#3B5249] font-medium">₹{(inv.grand_total || 0).toFixed(2)}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
