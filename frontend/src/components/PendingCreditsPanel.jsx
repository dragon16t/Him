/**
 * PendingCreditsPanel.jsx — Inventory Manager approves each delivered order's
 * revenue before it is credited to the account. Nothing hits the bank/cash
 * ledger until the IM clicks "Add to Account".
 */
import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Wallet, IndianRupee, Package, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

export default function PendingCreditsPanel() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ pending: { count: 0, amount: 0 }, approved: { count: 0, amount: 0 }, rejected: { count: 0, amount: 0 } });
  const [filter, setFilter] = useState("pending");
  const [selected, setSelected] = useState(null);
  const [account, setAccount] = useState("Bank Account");
  const [rejectDialog, setRejectDialog] = useState(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      const [a, s] = await Promise.all([
        axios.get(`${API}/finance/pending-credits`, { params: { status: filter } }),
        axios.get(`${API}/finance/pending-credits/summary`),
      ]);
      setRows(a.data.pending_credits || []);
      setSummary(s.data || summary);
    } catch (e) { /* silent */ }
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const approve = async (row) => {
    setSelected(row);
    setAccount(row.default_account || (row.payment_type === "cod" ? "Cash Account" : "Bank Account"));
  };

  const confirmApprove = async () => {
    if (!selected) return;
    try {
      await axios.post(`${API}/finance/pending-credits/${selected.id}/approve`, { account });
      toast.success(`Rs.${selected.amount} credited to ${account}`);
      setSelected(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const confirmReject = async () => {
    if (!rejectDialog || !reason.trim()) return toast.error("Provide a reason");
    try {
      await axios.post(`${API}/finance/pending-credits/${rejectDialog.id}/reject`, { reason });
      toast.success("Rejected"); setRejectDialog(null); setReason(""); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="space-y-4" data-testid="pending-credits-panel">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-heading text-[16px] flex items-center gap-2 text-[#2C3531]"><Wallet className="w-4 h-4 text-[#A66E4E]"/>Pending Credits — Manual Approval</h3>
          <p className="text-[10px] text-[#7B6D5A]">COD / UPI / Online revenue only hits the account when you click <b>Add to Account</b>.</p>
        </div>
        <Button onClick={load} variant="outline" size="sm" className="rounded-full text-[11px] h-8" data-testid="pc-refresh"><RefreshCw className="w-3 h-3 mr-1"/>Refresh</Button>
      </div>

      <div className="grid grid-cols-3 gap-2" data-testid="pc-summary">
        {["pending", "approved", "rejected"].map(k => (
          <div key={k} className={`rounded-2xl p-3 border ${filter === k ? "border-[#3B5249] bg-[#3B5249]/5" : "border-[#E5E3DB] bg-white"}`}>
            <button onClick={() => setFilter(k)} className="w-full text-left" data-testid={`pc-tab-${k}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-wide text-[#7B6D5A]">{k}</span>
                <Badge className={`text-[9px] ${k === "pending" ? "bg-amber-100 text-amber-800" : k === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>{summary[k].count}</Badge>
              </div>
              <p className="text-[18px] font-bold text-[#2C3531]">₹{Number(summary[k].amount || 0).toLocaleString("en-IN")}</p>
            </button>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-10 bg-white border border-[#E5E3DB] rounded-2xl text-[#7B6D5A] text-sm" data-testid="pc-empty">No {filter} credits.</div>
      ) : (
        <div className="space-y-2" data-testid="pc-list">
          {rows.map(r => (
            <div key={r.id} className="bg-white border border-[#E5E3DB] rounded-2xl p-3 flex items-center justify-between gap-3 flex-wrap" data-testid={`pc-row-${r.id}`}>
              <div className="flex-1 min-w-[240px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <Package className="w-3.5 h-3.5 text-[#3B5249]"/>
                  <span className="font-mono text-[11px] font-bold">{r.order_id}</span>
                  <Badge variant="outline" className="text-[9px]">{r.payment_type?.toUpperCase()}</Badge>
                  {r.awb_number && <span className="text-[9px] text-[#7B6D5A]">AWB: {r.awb_number}</span>}
                  {r.shipment_courier && <Badge variant="outline" className="text-[9px]">{r.shipment_courier}</Badge>}
                </div>
                <p className="text-sm font-medium text-[#2C3531] mt-1">{r.customer_name} · <span className="font-mono text-[11px] text-[#7B6D5A]">{r.customer_phone}</span></p>
                <p className="text-[10px] text-[#A66E4E]">Delivered {(r.delivered_at || "").slice(0, 16).replace('T', ' ')} by {r.delivered_by_name || "—"} · by TC {r.created_by_name}</p>
                {r.status === "approved" && <p className="text-[10px] text-emerald-700">✓ Credited to <b>{r.credited_account}</b> by {r.approved_by_name}</p>}
                {r.status === "rejected" && <p className="text-[10px] text-red-700">✕ Rejected: {r.rejection_reason}</p>}
              </div>
              <div className="text-right">
                <p className="text-[16px] font-bold text-[#3B5249]"><IndianRupee className="w-3.5 h-3.5 inline"/>{Number(r.amount).toLocaleString("en-IN")}</p>
              </div>
              {r.status === "pending" && (
                <div className="flex gap-1.5">
                  <Button size="sm" onClick={() => approve(r)} className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-[11px]" data-testid={`pc-approve-${r.id}`}><CheckCircle2 className="w-3 h-3 mr-1"/>Add to Account</Button>
                  <Button size="sm" variant="outline" onClick={() => setRejectDialog(r)} className="rounded-full text-[11px] border-red-300 text-red-700" data-testid={`pc-reject-${r.id}`}><XCircle className="w-3 h-3 mr-1"/>Reject</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Approve dialog */}
      <Dialog open={!!selected} onOpenChange={o => !o && setSelected(null)}>
        <DialogContent className="rounded-2xl max-w-md" data-testid="pc-approve-dialog" aria-describedby="pc-approve-desc">
          <DialogHeader><DialogTitle className="font-heading">Add to Account</DialogTitle></DialogHeader>
          <p id="pc-approve-desc" className="sr-only">Confirm crediting this pending amount.</p>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="bg-[#F9F8F6] rounded-xl p-3">
                <p className="text-[11px]"><b>{selected.order_id}</b> · {selected.customer_name}</p>
                <p className="text-[20px] font-bold text-[#3B5249] mt-1"><IndianRupee className="w-4 h-4 inline"/>{Number(selected.amount).toLocaleString("en-IN")}</p>
              </div>
              <div>
                <label className="text-xs text-[#7B6D5A] block mb-1">Credit to</label>
                <Select value={account} onValueChange={setAccount}>
                  <SelectTrigger className="rounded-xl h-9 text-xs" data-testid="pc-account-select"><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Bank Account">Bank Account</SelectItem>
                    <SelectItem value="Cash Account">Cash Account</SelectItem>
                    <SelectItem value="UPI Account">UPI Account</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={confirmApprove} className="w-full rounded-full bg-emerald-600 text-white" data-testid="pc-approve-confirm">Confirm & Credit</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={o => !o && setRejectDialog(null)}>
        <DialogContent className="rounded-2xl max-w-md" data-testid="pc-reject-dialog" aria-describedby="pc-reject-desc">
          <DialogHeader><DialogTitle className="font-heading">Reject Credit</DialogTitle></DialogHeader>
          <p id="pc-reject-desc" className="sr-only">Provide a reason for rejecting this credit.</p>
          <div className="space-y-2 text-sm">
            <Input placeholder="Reason (e.g. customer refused / RTO / not paid)" value={reason} onChange={e => setReason(e.target.value)} className="rounded-xl text-xs" data-testid="pc-reject-reason"/>
            <Button onClick={confirmReject} className="w-full rounded-full bg-red-600 text-white text-xs" data-testid="pc-reject-confirm">Reject</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
