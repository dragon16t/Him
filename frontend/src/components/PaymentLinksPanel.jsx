import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Textarea } from "./ui/textarea";
import { toast } from "sonner";
import { CreditCard, RefreshCw, Copy, X, Plus } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STATUS_BADGE = {
  paid:      "bg-emerald-600 text-white",
  created:   "bg-amber-500 text-white",
  partially_paid: "bg-amber-600 text-white",
  expired:   "bg-slate-400 text-white",
  cancelled: "bg-red-600 text-white",
};

/**
 * Payment Links panel — TC-facing (scope="mine" by default).
 * Managers pass `scope="all"` to see every TC's links.
 */
export default function PaymentLinksPanel({ scope = "mine" }) {
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [totalPaid, setTotalPaid] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ amount: "", customer_phone: "", customer_name: "", description: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/razorpay/payment-links?scope=${scope}`);
      setRows(r.data.payment_links || []);
      setCounts(r.data.counts || {});
      setTotalPaid(r.data.total_paid_amount || 0);
    } catch (e) {
      if (e?.response?.status !== 503) toast.error(e?.response?.data?.detail || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [scope]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (saving) return;
    const amt = Number(form.amount);
    if (!amt || amt < 1) return toast.error("Enter a valid amount (min ₹1)");
    const digits = (form.customer_phone || "").replace(/\D/g, "");
    if (digits.length < 10) return toast.error("Enter a valid 10-digit phone number");
    setSaving(true);
    try {
      const r = await axios.post(`${API}/razorpay/payment-links`, {
        amount: amt,
        customer_phone: digits,
        customer_name: form.customer_name || "",
        description: form.description || "",
        notify: true,
      });
      toast.success(`Payment link sent to +91${digits.slice(-10)} — Rs.${amt}`);
      const short = r.data.payment_link?.short_url;
      if (short) {
        try { await navigator.clipboard.writeText(short); } catch (_) { /* ignore */ }
      }
      setShowCreate(false);
      setForm({ amount: "", customer_phone: "", customer_name: "", description: "" });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not create link");
    } finally {
      setSaving(false);
    }
  };

  const refresh = async (pl) => {
    try {
      const r = await axios.post(`${API}/razorpay/payment-links/${pl.id}/refresh`);
      const newStatus = r.data.payment_link?.status;
      toast.success(`Status: ${newStatus}`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Refresh failed");
    }
  };

  const cancel = async (pl) => {
    if (!window.confirm(`Cancel link for Rs.${pl.amount_rupees}? This cannot be undone.`)) return;
    try {
      await axios.post(`${API}/razorpay/payment-links/${pl.id}/cancel`);
      toast.success("Link cancelled");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Cancel failed");
    }
  };

  const copyLink = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch (_) {
      toast.error("Could not copy");
    }
  };

  return (
    <div className="space-y-4" data-testid={`payment-links-panel-${scope}`}>
      {/* Header + KPIs */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="w-4 h-4 text-[#3B5249]" /> Payment Links {scope === "all" && "· All Telecallers"}
              </CardTitle>
              <p className="text-xs text-[#59615D] mt-1">
                Send a Razorpay link · Customer gets SMS instantly · Track status live
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={load} disabled={loading} data-testid="refresh-payment-links">
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
              </Button>
              <Button size="sm" onClick={() => setShowCreate(true)} className="bg-[#3B5249] text-white" data-testid="create-payment-link-btn">
                <Plus className="w-3.5 h-3.5 mr-1" /> Create Link
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <span className="text-xs font-medium text-emerald-800">Paid: <b>{counts.paid || 0}</b> · Rs.{Number(totalPaid).toLocaleString("en-IN")}</span>
            </div>
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <span className="text-xs font-medium text-amber-800">Pending: <b>{counts.created || 0}</b></span>
            </div>
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <span className="text-xs font-medium text-red-800">Cancelled: <b>{counts.cancelled || 0}</b></span>
            </div>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <span className="text-xs font-medium text-slate-700">Expired: <b>{counts.expired || 0}</b></span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="payment-links-table">
              <thead className="bg-[#F5F3EE] text-[#3B5249]">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Date</th>
                  {scope === "all" && <th className="text-left px-3 py-2 font-semibold">TC</th>}
                  <th className="text-left px-3 py-2 font-semibold">Customer</th>
                  <th className="text-right px-3 py-2 font-semibold">Amount</th>
                  <th className="text-center px-3 py-2 font-semibold">Status</th>
                  <th className="text-left px-3 py-2 font-semibold">Link</th>
                  <th className="text-center px-3 py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((pl) => (
                  <tr key={pl.id} className="border-b border-[#E5E3DB]" data-testid={`pl-row-${pl.id}`}>
                    <td className="px-3 py-2 whitespace-nowrap text-[#59615D]">
                      {pl.created_at ? new Date(pl.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}
                    </td>
                    {scope === "all" && <td className="px-3 py-2">{pl.created_by_name}</td>}
                    <td className="px-3 py-2">
                      <div className="font-medium">{pl.customer_name}</div>
                      <div className="text-[10px] text-[#8E9A94]">{pl.customer_phone_e164 || pl.customer_phone}</div>
                    </td>
                    <td className="text-right px-3 py-2 font-semibold">Rs.{Number(pl.amount_rupees).toLocaleString("en-IN")}</td>
                    <td className="text-center px-3 py-2">
                      <Badge className={`${STATUS_BADGE[pl.status] || "bg-slate-300 text-slate-700"} text-[10px]`} data-testid={`pl-status-${pl.id}`}>
                        {(pl.status || "").toUpperCase()}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      {pl.short_url ? (
                        <button onClick={() => copyLink(pl.short_url)} className="text-[#3B5249] underline hover:text-[#A66E4E] text-[10px]" data-testid={`pl-copy-${pl.id}`}>
                          {pl.short_url.replace("https://", "")}
                        </button>
                      ) : "—"}
                    </td>
                    <td className="text-center px-3 py-2">
                      <div className="flex justify-center gap-1">
                        <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => refresh(pl)} title="Refresh status" data-testid={`pl-refresh-${pl.id}`}>
                          <RefreshCw className="w-3 h-3" />
                        </Button>
                        {pl.short_url && (
                          <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => copyLink(pl.short_url)} title="Copy link">
                            <Copy className="w-3 h-3" />
                          </Button>
                        )}
                        {pl.status === "created" && (
                          <Button size="sm" variant="outline" className="h-7 px-2 border-red-300 text-red-600" onClick={() => cancel(pl)} title="Cancel" data-testid={`pl-cancel-${pl.id}`}>
                            <X className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && !loading && (
                  <tr><td colSpan={scope === "all" ? 7 : 6} className="text-center py-6 text-[#8E9A94]">
                    No payment links yet. Create your first one!
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="rounded-2xl" data-testid="create-payment-link-dialog">
          <DialogHeader><DialogTitle className="font-heading">Create Payment Link</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-medium">Amount (₹) *</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={form.amount}
                onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="e.g. 599"
                className="rounded-xl"
                data-testid="pl-amount-input"
              />
            </div>
            <div>
              <Label className="text-xs font-medium">Customer Phone (10-digit) *</Label>
              <Input
                value={form.customer_phone}
                onChange={(e) => setForm(f => ({ ...f, customer_phone: e.target.value }))}
                placeholder="e.g. 9876543210"
                className="rounded-xl"
                data-testid="pl-phone-input"
              />
            </div>
            <div>
              <Label className="text-xs">Customer Name (optional)</Label>
              <Input
                value={form.customer_name}
                onChange={(e) => setForm(f => ({ ...f, customer_name: e.target.value }))}
                placeholder="Skip if unknown"
                className="rounded-xl"
                data-testid="pl-name-input"
              />
            </div>
            <div>
              <Label className="text-xs">Description (optional)</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="e.g. Sunscreen SPF 50 + Face Wash — order #Rakesh"
                className="rounded-xl"
                data-testid="pl-desc-input"
              />
            </div>
            <div className="text-[10px] text-[#59615D] bg-[#F5F3EE] rounded-lg p-2">
              Customer will receive the link via SMS from Razorpay instantly. Link expires in 7 days.
            </div>
            <Button
              onClick={create}
              disabled={saving}
              className="w-full rounded-full bg-[#3B5249] text-white"
              data-testid="pl-submit-btn"
            >
              {saving ? "Sending…" : "Send Payment Link"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
