// AgentWithdrawPanel — HR / Finance / Admin tab to process agent withdraw requests.
import { useEffect, useState, useCallback, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, Check, X, IndianRupee, Phone, Copy, Loader2, FileText } from "lucide-react";

const API = "/api";

export default function AgentWithdrawPanel() {
  const [requests, setRequests] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPay, setShowPay] = useState(null);
  const [payRef, setPayRef] = useState("");
  const auth = useMemo(() => ({ headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/hr/withdraw-requests${statusFilter ? `?status=${statusFilter}` : ""}`, auth);
      setRequests(r.data.requests || []);
    } catch (e) { toast.error("Failed to load"); }
    finally { setLoading(false); }
  }, [statusFilter, auth]);

  useEffect(() => { load(); }, [load]);

  const act = async (wid, action, data = {}) => {
    try {
      await axios.post(`${API}/hr/withdraw-requests/${wid}/${action}`, data, auth);
      toast.success({approve:"Approved", reject:"Rejected", paid:"Marked as paid"}[action]);
      load();
    } catch (e) { toast.error("Failed"); }
  };

  const grouped = useMemo(() => {
    const m = { pending: [], approved: [], paid: [], rejected: [] };
    requests.forEach(r => { (m[r.status] || (m[r.status] = [])).push(r); });
    return m;
  }, [requests]);

  const StatusBadge = ({ s }) => {
    const c = ({ pending:"bg-amber-100 text-amber-800", approved:"bg-blue-100 text-blue-800", paid:"bg-emerald-100 text-emerald-800", rejected:"bg-red-100 text-red-800" }[s] || "bg-gray-100 text-gray-800");
    return <span className={`inline-block px-2 py-0.5 rounded text-[10px] ${c}`}>{s}</span>;
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E5E3DB] p-5" data-testid="agent-withdraw-panel">
      <div className="flex justify-between items-center mb-5">
        <div>
          <h3 className="font-heading text-lg font-medium text-[#2C3531] flex items-center gap-2">
            <Wallet className="w-5 h-5 text-[#A66E4E]"/> Agent Withdraw Requests
          </h3>
          <p className="text-xs text-[#7B6D5A] mt-1">Influencers, dealers and agents request commission payout — approve, mark paid or reject.</p>
        </div>
        <Select value={statusFilter || "all"} onValueChange={v=>setStatusFilter(v==="all"?"":v)}>
          <SelectTrigger className="w-[140px] h-9 text-[12px]" data-testid="withdraw-status-filter"><SelectValue/></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* totals */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <div className="bg-amber-50 border border-amber-200 rounded p-3">
          <div className="text-[10px] uppercase text-amber-800">Pending</div>
          <div className="text-[18px] font-bold text-amber-900">{grouped.pending.length}</div>
          <div className="text-[10px] text-amber-700">₹{grouped.pending.reduce((s,r)=>s+r.amount,0)}</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded p-3">
          <div className="text-[10px] uppercase text-blue-800">Approved (to pay)</div>
          <div className="text-[18px] font-bold text-blue-900">{grouped.approved.length}</div>
          <div className="text-[10px] text-blue-700">₹{grouped.approved.reduce((s,r)=>s+r.amount,0)}</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded p-3">
          <div className="text-[10px] uppercase text-emerald-800">Paid</div>
          <div className="text-[18px] font-bold text-emerald-900">{grouped.paid.length}</div>
          <div className="text-[10px] text-emerald-700">₹{grouped.paid.reduce((s,r)=>s+r.amount,0)}</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded p-3">
          <div className="text-[10px] uppercase text-red-800">Rejected</div>
          <div className="text-[18px] font-bold text-red-900">{grouped.rejected.length}</div>
        </div>
      </div>

      {loading && <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-[#A66E4E]"/></div>}
      {!loading && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#F2EDE4] text-[#7B6D5A] uppercase text-[10px]">
              <tr>
                <th className="text-left p-2">Request</th><th className="text-left p-2">Agent</th>
                <th className="text-left p-2">Amount</th><th className="text-left p-2">Method</th>
                <th className="text-left p-2">GPay / UPI</th><th className="text-left p-2">Note</th>
                <th className="text-left p-2">Status</th><th className="text-left p-2">Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-[#7B6D5A]">No withdraw requests.</td></tr>}
              {requests.map(r => (
                <tr key={r.id} className="border-t border-[#E5E3DB]" data-testid={`withdraw-row-${r.id}`}>
                  <td className="p-2 font-mono text-[10px]">{r.id}</td>
                  <td className="p-2">
                    <div className="text-[#2C3531]">{r.agent_name}</div>
                    <div className="text-[9px] text-[#7B6D5A]">{r.agent_phone}</div>
                  </td>
                  <td className="p-2 font-bold text-[#2C3531]">₹{r.amount}</td>
                  <td className="p-2 uppercase">{r.method}</td>
                  <td className="p-2 font-mono">
                    {r.gpay_number || "-"}
                    {r.gpay_number && <button onClick={()=>{navigator.clipboard.writeText(r.gpay_number); toast.success("Copied");}} className="ml-1"><Copy className="w-3 h-3 inline text-[#7B6D5A]"/></button>}
                  </td>
                  <td className="p-2 max-w-[160px] truncate" title={r.note}>{r.note || "-"}</td>
                  <td className="p-2"><StatusBadge s={r.status}/></td>
                  <td className="p-2 text-[#7B6D5A]">{(r.created_at||"").slice(0,10)}</td>
                  <td className="p-2 whitespace-nowrap">
                    {r.status === "pending" && (
                      <>
                        <Button size="sm" onClick={()=>act(r.id, "approve")} className="h-7 text-[10px] rounded-full bg-blue-600 hover:bg-blue-700 text-white mr-1" data-testid={`wd-approve-${r.id}`}><Check className="w-3 h-3"/></Button>
                        <Button size="sm" variant="outline" onClick={()=>{const reason=window.prompt("Reason?")||""; act(r.id,"reject",{reason});}} className="h-7 text-[10px] rounded-full text-red-600 border-red-300" data-testid={`wd-reject-${r.id}`}><X className="w-3 h-3"/></Button>
                      </>
                    )}
                    {r.status === "approved" && (
                      <Button size="sm" onClick={()=>{setShowPay(r); setPayRef("");}} className="h-7 text-[10px] rounded-full bg-emerald-600 hover:bg-emerald-700 text-white" data-testid={`wd-mark-paid-${r.id}`}><IndianRupee className="w-3 h-3 mr-1"/>Mark Paid</Button>
                    )}
                    {r.transaction_ref && <div className="text-[9px] text-[#16A34A]">Ref: {r.transaction_ref}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!showPay} onOpenChange={()=>setShowPay(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark as Paid</DialogTitle></DialogHeader>
          {showPay && (
            <div className="space-y-3">
              <div className="bg-[#F0F9F4] p-3 rounded text-[12px]">
                <div className="text-[#15803D] font-medium">Paying ₹{showPay.amount} to {showPay.agent_name}</div>
                <div className="text-[#6B7280] mt-1">Via {showPay.method.toUpperCase()} to <strong>{showPay.gpay_number || "?"}</strong></div>
              </div>
              <Input placeholder="Transaction Reference / UTR (optional)" value={payRef} onChange={e=>setPayRef(e.target.value)} data-testid="wd-tx-ref"/>
              <Button onClick={async ()=>{ await act(showPay.id, "paid", { transaction_ref: payRef }); setShowPay(null); }} className="w-full bg-emerald-600 text-white rounded-full" data-testid="wd-confirm-paid">Confirm Payment</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
