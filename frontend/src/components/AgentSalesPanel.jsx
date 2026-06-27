// AgentSalesPanel — Sales Manager dashboard tab.
// Shows total-agents stat, window filter (today/7d/30d/month/all),
// per-agent cards with revenue + commission + GPay + custom username/password,
// + Agent Orders queue (approve/reject) — orders flow into normal CRM pipeline on approve.

import { useEffect, useState, useCallback, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Copy, ExternalLink, Phone, Mail, IndianRupee, ShoppingBag,
  Users, Sparkles, Loader2, Check, X, RefreshCw, Pencil, Eye, TrendingUp,
  Wallet, Search, ChevronDown
} from "lucide-react";

const API = "/api";

const DESIGNATION_OPTS = [
  { v: "influencer", l: "Influencer", color: "bg-pink-100 text-pink-800" },
  { v: "dealer", l: "Dealer", color: "bg-blue-100 text-blue-800" },
  { v: "agent", l: "Agent", color: "bg-amber-100 text-amber-800" },
];

const WINDOW_OPTS = [
  { v: "today", l: "Today" },
  { v: "last7", l: "Last 7 Days" },
  { v: "last30", l: "Last 30 Days" },
  { v: "month", l: "This Month" },
  { v: "all", l: "All Time" },
];

export default function AgentSalesPanel() {
  const [agents, setAgents] = useState([]);
  const [summary, setSummary] = useState({ total_agents: 0, total_orders: 0, total_revenue: 0, total_commission: 0 });
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(null);
  const [showCreds, setShowCreds] = useState(null);
  const [tab, setTab] = useState("agents");
  const [windowFilter, setWindowFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [agentFilter, setAgentFilter] = useState("all");

  const [addForm, setAddForm] = useState({
    name: "", phone: "", email: "", designation: "agent",
    commission_pct: 10, gpay_number: "", username: "", password: "",
  });

  const tokenAuth = useMemo(() => ({ headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, o] = await Promise.all([
        axios.get(`${API}/sales-manager/agents?window=${windowFilter}`, tokenAuth),
        axios.get(`${API}/sales-manager/agent-orders`, tokenAuth),
      ]);
      setAgents(a.data.agents || []);
      setSummary(a.data.summary || {});
      setOrders(o.data.orders || []);
    } catch (e) { toast.error("Failed to load agents"); }
    finally { setLoading(false); }
  }, [windowFilter, tokenAuth]);

  useEffect(() => { load(); }, [load]);

  const submitAdd = async () => {
    if (!addForm.name || !addForm.phone) { toast.error("Name and phone required"); return; }
    try {
      const r = await axios.post(`${API}/sales-manager/agents`, addForm, tokenAuth);
      setShowAdd(false);
      setShowCreds(r.data.agent);
      setAddForm({ name: "", phone: "", email: "", designation: "agent", commission_pct: 10, gpay_number: "", username: "", password: "" });
      load();
      toast.success(`${r.data.agent.name} added!`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const submitEdit = async () => {
    if (!showEdit) return;
    try {
      const { id, name, phone, email, designation, commission_pct, active, new_password, gpay_number, username } = showEdit;
      await axios.patch(`${API}/sales-manager/agents/${id}`, { name, phone, email, designation, commission_pct, active, new_password, gpay_number, username }, tokenAuth);
      toast.success("Updated"); setShowEdit(null); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Update failed"); }
  };

  const remove = async (a) => {
    if (!window.confirm(`Deactivate ${a.name}?`)) return;
    try { await axios.delete(`${API}/sales-manager/agents/${a.id}`, tokenAuth); toast.success("Deactivated"); load(); }
    catch { toast.error("Failed"); }
  };

  const approve = async (oid) => {
    try { await axios.post(`${API}/sales-manager/agent-orders/${oid}/approve`, {}, tokenAuth); toast.success("Approved → sent to shipping"); load(); }
    catch (e) { toast.error("Approve failed"); }
  };
  const reject = async (oid) => {
    const reason = window.prompt("Reason for rejection?") || "";
    try { await axios.post(`${API}/sales-manager/agent-orders/${oid}/reject`, { reason }, tokenAuth); toast.success("Rejected"); load(); }
    catch { toast.error("Reject failed"); }
  };

  // Public store base — always use the customer-facing domain, never the preview/admin host
  const origin = "https://software.celestaglow.com";
  const copyLink = (a) => { navigator.clipboard.writeText(a.store_url || `${origin}/store/${a.slug}`); toast.success("Store link copied"); };

  const pendingCount = orders.filter(o => o.status === "pending").length;

  // Sort agents: best performer in window first
  const sortedAgents = useMemo(() => {
    const filtered = agents.filter(a => !searchTerm ||
      a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.phone || "").includes(searchTerm)
    );
    return filtered.sort((a, b) => (b.window_commission || 0) - (a.window_commission || 0));
  }, [agents, searchTerm]);

  const filteredOrders = useMemo(() =>
    agentFilter === "all" ? orders : orders.filter(o => o.agent_id === agentFilter)
  , [orders, agentFilter]);

  return (
    <div className="bg-white rounded-2xl border border-[#E5E3DB] p-5" data-testid="agent-sales-panel">
      <div className="flex flex-wrap justify-between items-center mb-5 gap-3">
        <div>
          <h3 className="font-heading text-lg font-medium text-[#2C3531] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#A66E4E]"/> Agent Sales
          </h3>
          <p className="text-xs text-[#7B6D5A] mt-1">Influencers, dealers & agents — each gets their own storefront link and earns commission on every sale.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={windowFilter} onValueChange={setWindowFilter}>
            <SelectTrigger className="w-[140px] h-9 text-[12px]" data-testid="window-filter"><SelectValue/></SelectTrigger>
            <SelectContent>{WINDOW_OPTS.map(o => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" className="rounded-full bg-[#3B5249] text-white" onClick={()=>setShowAdd(true)} data-testid="add-agent-btn">
            <Plus className="w-4 h-4 mr-1"/>Add Agent
          </Button>
        </div>
      </div>

      {/* TOTALS STRIP */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <SummaryTile icon={<Users className="w-4 h-4"/>} label="Total Agents" value={summary.total_agents}/>
        <SummaryTile icon={<ShoppingBag className="w-4 h-4"/>} label={`Orders (${windowFilter})`} value={summary.total_orders}/>
        <SummaryTile icon={<IndianRupee className="w-4 h-4"/>} label={`Revenue (${windowFilter})`} value={`₹${(summary.total_revenue||0).toLocaleString()}`}/>
        <SummaryTile icon={<TrendingUp className="w-4 h-4"/>} label="Commission Earned" value={`₹${(summary.total_commission||0).toLocaleString()}`} accent/>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-6 border-b border-[#E5E3DB] mb-5 text-xs uppercase tracking-wide overflow-x-auto">
        {[["agents",`Agents (${agents.length})`], ["orders",`Agent Orders ${pendingCount?`(${pendingCount} pending)`:""}`], ["withdraws", `Withdraws`]].map(([k, l]) => (
          <button key={k} onClick={()=>setTab(k)} className={`pb-3 -mb-px border-b-2 whitespace-nowrap ${tab===k?"border-[#3B5249] text-[#3B5249]":"border-transparent text-[#7B6D5A]"}`} data-testid={`agent-sales-tab-${k}`}>{l}</button>
        ))}
      </div>

      {loading && <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-[#A66E4E]"/></div>}

      {/* Agents grid */}
      {tab === "agents" && !loading && (
        <>
          {agents.length === 0 ? (
            <div className="border-2 border-dashed border-[#E5E3DB] rounded-xl p-10 text-center">
              <Sparkles className="w-8 h-8 text-[#A66E4E] mx-auto mb-3"/>
              <p className="text-[#7B6D5A] text-sm mb-3">No agents yet. Add your first influencer, dealer or agent.</p>
              <Button size="sm" onClick={()=>setShowAdd(true)} className="rounded-full bg-[#3B5249] text-white" data-testid="empty-add-agent">Add your first agent</Button>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7B6D5A]"/>
                  <Input placeholder="Search agents…" className="pl-9 h-9 text-[12px]" value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} data-testid="agent-search"/>
                </div>
                <div className="text-[11px] text-[#7B6D5A] ml-auto">Sorted by {WINDOW_OPTS.find(o=>o.v===windowFilter)?.l} commission</div>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedAgents.map((a, idx) => {
                  const d = DESIGNATION_OPTS.find(x => x.v === a.designation) || DESIGNATION_OPTS[2];
                  return (
                    <div key={a.id} className="bg-[#FAF8F4] border border-[#E5E3DB] rounded-xl p-4 hover:shadow-md transition relative" data-testid={`agent-card-${a.slug}`}>
                      {idx < 3 && <span className="absolute -top-2 -left-2 bg-[#F59E0B] text-white text-[9px] font-bold w-6 h-6 rounded-full flex items-center justify-center">#{idx+1}</span>}
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-heading text-[#2C3531] font-medium">{a.name}</div>
                          <Badge className={`${d.color} text-[10px] mt-1`}>{d.l}</Badge>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={()=>setShowEdit({...a})} className="p-1 hover:bg-white rounded" title="Edit" data-testid={`agent-edit-${a.slug}`}><Pencil className="w-3.5 h-3.5 text-[#7B6D5A]"/></button>
                          <button onClick={()=>remove(a)} className="p-1 hover:bg-white rounded" title="Deactivate" data-testid={`agent-delete-${a.slug}`}><X className="w-3.5 h-3.5 text-red-500"/></button>
                        </div>
                      </div>
                      <div className="space-y-0.5 text-[11px] text-[#59615D] mb-3">
                        <p className="flex items-center gap-1.5"><Phone className="w-3 h-3"/>{a.phone}</p>
                        {a.email && <p className="flex items-center gap-1.5"><Mail className="w-3 h-3"/>{a.email}</p>}
                        {a.gpay_number && <p className="flex items-center gap-1.5"><Wallet className="w-3 h-3"/>GPay: {a.gpay_number}</p>}
                        <p className="text-[#A66E4E]">Commission: {a.commission_pct}%</p>
                      </div>
                      {/* Window stats */}
                      <div className="bg-white rounded-lg p-2 mb-3">
                        <div className="text-[9px] uppercase tracking-wide text-[#7B6D5A] mb-1">{WINDOW_OPTS.find(o=>o.v===windowFilter)?.l}</div>
                        <div className="grid grid-cols-3 gap-1 text-center">
                          <div><div className="text-[9px] text-[#7B6D5A]">Orders</div><div className="font-bold text-[13px] text-[#2C3531]">{a.window_orders||0}</div></div>
                          <div><div className="text-[9px] text-[#7B6D5A]">Sales</div><div className="font-bold text-[13px] text-[#2C3531]">₹{a.window_revenue||0}</div></div>
                          <div><div className="text-[9px] text-[#A66E4E]">Commission</div><div className="font-bold text-[13px] text-[#A66E4E]">₹{a.window_commission||0}</div></div>
                        </div>
                      </div>
                      <div className="bg-[#3B5249] text-white rounded-lg p-2 mb-3 text-center">
                        <div className="text-[9px] text-[#E7C9A0]">All-Time Total</div>
                        <div className="text-[10px]">{a.total_orders||0} orders • ₹{a.total_revenue||0} • <strong>₹{a.total_commission||0}</strong></div>
                      </div>
                      <div className="bg-white border border-[#E5E3DB] rounded p-2 text-[10px] text-[#59615D] flex items-center gap-2">
                        <span className="text-[#A66E4E] font-mono truncate flex-1">{a.store_url || `${origin}/store/${a.slug}`}</span>
                        <button onClick={()=>copyLink(a)} className="text-[#3B5249] hover:text-[#A66E4E]" data-testid={`copy-link-${a.slug}`}><Copy className="w-3 h-3"/></button>
                        <a href={a.store_url || `/store/${a.slug}`} target="_blank" rel="noreferrer" className="text-[#3B5249] hover:text-[#A66E4E]" data-testid={`open-link-${a.slug}`}><ExternalLink className="w-3 h-3"/></a>
                      </div>
                      <div className="bg-[#F4F1EA] border border-[#E5E3DB] rounded p-2 text-[10px] text-[#59615D] flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] uppercase tracking-wide text-[#7B6D5A] font-semibold whitespace-nowrap">Portal:</span>
                        <span className="text-[#3B5249] font-mono truncate flex-1">{a.agent_portal_url || `${origin}/store/${a.slug}/agent-login`}</span>
                        <button onClick={()=>{navigator.clipboard.writeText(a.agent_portal_url || `${origin}/store/${a.slug}/agent-login`); toast.success("Agent portal link copied");}} className="text-[#3B5249] hover:text-[#A66E4E]" data-testid={`copy-portal-${a.slug}`}><Copy className="w-3 h-3"/></button>
                        <a href={a.agent_portal_url || `/store/${a.slug}/agent-login`} target="_blank" rel="noreferrer" className="text-[#3B5249] hover:text-[#A66E4E]" data-testid={`open-portal-${a.slug}`}><ExternalLink className="w-3 h-3"/></a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* Agent Orders table */}
      {tab === "orders" && !loading && (
        <>
          {agents.length > 0 && (
            <div className="mb-3 flex items-center gap-2">
              <Label className="text-[11px] text-[#7B6D5A]">Filter by agent:</Label>
              <Select value={agentFilter} onValueChange={setAgentFilter}>
                <SelectTrigger className="w-[200px] h-9 text-[12px]" data-testid="agent-order-filter"><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Agents</SelectItem>
                  {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name} ({a.designation})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F2EDE4] text-[#7B6D5A] uppercase text-[10px]">
                <tr>
                  <th className="text-left p-2">Order</th><th className="text-left p-2">Agent</th>
                  <th className="text-left p-2">Customer</th><th className="text-left p-2">Items</th>
                  <th className="text-left p-2">Total</th><th className="text-left p-2">Pay</th>
                  <th className="text-left p-2">Status</th><th className="text-left p-2">Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-[#7B6D5A]">No agent orders.</td></tr>}
                {filteredOrders.map(o => (
                  <tr key={o.id} className="border-t border-[#E5E3DB]" data-testid={`agent-order-${o.id}`}>
                    <td className="p-2 font-mono text-[10px]">{o.id}</td>
                    <td className="p-2">
                      <div className="text-[#2C3531]">{o.agent_name}</div>
                      <div className="text-[9px] text-[#A66E4E]">+₹{o.commission_amount}</div>
                    </td>
                    <td className="p-2">
                      <div>{o.customer_name}</div>
                      <div className="text-[9px] text-[#7B6D5A]">{o.customer_phone}</div>
                      <div className="text-[9px] text-[#7B6D5A]">{o.city} {o.pincode}</div>
                    </td>
                    <td className="p-2 max-w-[200px] truncate" title={(o.items||[]).map(i=>`${i.name}×${i.qty}`).join(", ")}>
                      {(o.items||[]).map(i=>`${i.name}×${i.qty}`).join(", ")}
                    </td>
                    <td className="p-2 font-medium">₹{o.total}</td>
                    <td className="p-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${o.payment_status==="paid"?"bg-emerald-100 text-emerald-800":"bg-gray-100 text-gray-700"}`}>
                        {o.payment_method?.toUpperCase()} {o.payment_status==="paid"?"✓":""}
                      </span>
                    </td>
                    <td className="p-2"><StatusBadge s={o.status}/></td>
                    <td className="p-2 text-[#7B6D5A]">{(o.created_at||"").slice(0,10)}</td>
                    <td className="p-2 whitespace-nowrap">
                      {o.status === "pending" && (
                        <>
                          <Button size="sm" onClick={()=>approve(o.id)} className="h-7 text-[10px] rounded-full bg-emerald-600 hover:bg-emerald-700 text-white mr-1" data-testid={`approve-${o.id}`}><Check className="w-3 h-3 mr-1"/>Approve</Button>
                          <Button size="sm" variant="outline" onClick={()=>reject(o.id)} className="h-7 text-[10px] rounded-full text-red-600 border-red-300" data-testid={`reject-${o.id}`}><X className="w-3 h-3 mr-1"/>Reject</Button>
                        </>
                      )}
                      {o.status !== "pending" && <Button size="sm" variant="ghost" className="h-7 text-[10px]"><Eye className="w-3 h-3"/></Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "withdraws" && !loading && <SmWithdrawView/>}

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add New Agent</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto">
            <div><Label>Name *</Label><Input value={addForm.name} onChange={e=>setAddForm({...addForm, name: e.target.value})} placeholder="Priya Sharma" data-testid="add-agent-name"/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Phone *</Label><Input value={addForm.phone} onChange={e=>setAddForm({...addForm, phone:e.target.value})} placeholder="9876543210" data-testid="add-agent-phone"/></div>
              <div><Label>Email</Label><Input value={addForm.email} onChange={e=>setAddForm({...addForm, email:e.target.value})} placeholder="priya@example.com" data-testid="add-agent-email"/></div>
            </div>
            <div>
              <Label>Google Pay Number (for commission payouts) *</Label>
              <Input value={addForm.gpay_number} onChange={e=>setAddForm({...addForm, gpay_number:e.target.value})} placeholder="9876543210 or upi@bank" data-testid="add-agent-gpay"/>
              <div className="text-[10px] text-[#7B6D5A] mt-1">Visible to HR / Finance for processing payouts</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Designation</Label>
                <Select value={addForm.designation} onValueChange={v=>setAddForm({...addForm, designation:v})}>
                  <SelectTrigger data-testid="add-agent-designation"><SelectValue/></SelectTrigger>
                  <SelectContent>{DESIGNATION_OPTS.map(o=><SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Commission %</Label><Input type="number" value={addForm.commission_pct} onChange={e=>setAddForm({...addForm, commission_pct:Number(e.target.value)})} data-testid="add-agent-commission"/></div>
            </div>
            <div className="bg-[#FAF8F4] border border-[#E5E3DB] rounded p-3 space-y-2">
              <div className="text-[11px] uppercase tracking-wide text-[#7B6D5A]">Login Credentials (set or leave blank to auto-generate)</div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-[11px]">Username</Label><Input value={addForm.username} onChange={e=>setAddForm({...addForm, username:e.target.value})} placeholder="auto" data-testid="add-agent-username"/></div>
                <div><Label className="text-[11px]">Password</Label><Input value={addForm.password} onChange={e=>setAddForm({...addForm, password:e.target.value})} placeholder="auto-generated" data-testid="add-agent-password"/></div>
              </div>
            </div>
            <Button onClick={submitAdd} className="w-full bg-[#3B5249] text-white rounded-full" data-testid="add-agent-submit"><Plus className="w-4 h-4 mr-1"/>Create Agent</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Credentials shown after create */}
      <Dialog open={!!showCreds} onOpenChange={()=>setShowCreds(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Agent Created — Share these credentials</DialogTitle></DialogHeader>
          {showCreds && (
            <div className="space-y-3" data-testid="agent-credentials">
              <div className="bg-[#FBF7F0] border border-[#E5E3DB] p-3 rounded">
                <div className="text-[10px] uppercase tracking-wide text-[#7B6D5A] mb-1">Personal Store Link</div>
                <div className="flex items-center gap-2">
                  <code className="text-[12px] text-[#3B5249] flex-1 truncate">{showCreds.store_url || `${origin}/store/${showCreds.slug}`}</code>
                  <Button size="sm" variant="outline" onClick={()=>{navigator.clipboard.writeText(showCreds.store_url || `${origin}/store/${showCreds.slug}`); toast.success("Copied!");}} data-testid="copy-store-link"><Copy className="w-3 h-3"/></Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#FBF7F0] border border-[#E5E3DB] p-3 rounded">
                  <div className="text-[10px] uppercase tracking-wide text-[#7B6D5A] mb-1">Username</div>
                  <code className="text-[13px] text-[#2C3531]">{showCreds.username}</code>
                </div>
                <div className="bg-[#FBF7F0] border border-[#E5E3DB] p-3 rounded">
                  <div className="text-[10px] uppercase tracking-wide text-[#7B6D5A] mb-1">Password</div>
                  <code className="text-[13px] text-[#A66E4E] font-bold">{showCreds.initial_password}</code>
                </div>
              </div>
              <div className="text-[11px] text-[#7B6D5A]">Agent portal: <code className="text-[#3B5249]">{showCreds.agent_portal_url || `${origin}/store/${showCreds.slug}/agent-login`}</code></div>
              <Button onClick={()=>setShowCreds(null)} className="w-full bg-[#3B5249] text-white rounded-full">Done</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!showEdit} onOpenChange={()=>setShowEdit(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Agent</DialogTitle></DialogHeader>
          {showEdit && (
            <div className="space-y-3 max-h-[70vh] overflow-y-auto">
              <div><Label>Name</Label><Input value={showEdit.name} onChange={e=>setShowEdit({...showEdit, name:e.target.value})}/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Phone</Label><Input value={showEdit.phone} onChange={e=>setShowEdit({...showEdit, phone:e.target.value})}/></div>
                <div><Label>Email</Label><Input value={showEdit.email||""} onChange={e=>setShowEdit({...showEdit, email:e.target.value})}/></div>
              </div>
              <div><Label>Google Pay Number</Label><Input value={showEdit.gpay_number||""} onChange={e=>setShowEdit({...showEdit, gpay_number:e.target.value})} placeholder="9876543210 or upi@bank"/></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Designation</Label>
                  <Select value={showEdit.designation} onValueChange={v=>setShowEdit({...showEdit, designation:v})}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>{DESIGNATION_OPTS.map(o=><SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Commission %</Label><Input type="number" value={showEdit.commission_pct} onChange={e=>setShowEdit({...showEdit, commission_pct:Number(e.target.value)})}/></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Username</Label><Input value={showEdit.username} onChange={e=>setShowEdit({...showEdit, username:e.target.value})}/></div>
                <div><Label>Reset Password (optional)</Label><Input placeholder="Leave blank" value={showEdit.new_password||""} onChange={e=>setShowEdit({...showEdit, new_password:e.target.value})}/></div>
              </div>
              <Button onClick={submitEdit} className="w-full bg-[#3B5249] text-white rounded-full">Save Changes</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryTile({ icon, label, value, accent }) {
  return (
    <div className={`p-3 rounded-xl ${accent ? "bg-gradient-to-br from-[#A66E4E] to-[#8B5B3F] text-white" : "bg-[#FAF8F4] border border-[#E5E3DB]"}`}>
      <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wide mb-1 ${accent ? "text-white/80" : "text-[#7B6D5A]"}`}>{icon}{label}</div>
      <div className={`font-bold text-[18px] ${accent ? "text-white" : "text-[#2C3531]"}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ s }) {
  const cls = ({
    pending: "bg-amber-100 text-amber-800",
    sm_approved: "bg-blue-100 text-blue-800",
    shipped: "bg-emerald-100 text-emerald-800",
    delivered: "bg-emerald-200 text-emerald-900",
    rejected: "bg-red-100 text-red-800",
  }[s] || "bg-gray-100 text-gray-700");
  return <span className={`inline-block px-2 py-0.5 rounded text-[10px] ${cls}`}>{s}</span>;
}

// Sales Manager (read-only) view of their agents' withdraw requests
function SmWithdrawView() {
  const [reqs, setReqs] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    axios.get(`${API}/sales-manager/withdraw-requests`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }})
      .then(r => setReqs(r.data.requests || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-[#A66E4E]"/></div>;
  const wdStatus = (s) => ({pending:"bg-amber-100 text-amber-800",approved:"bg-blue-100 text-blue-800",paid:"bg-emerald-100 text-emerald-800",rejected:"bg-red-100 text-red-800"}[s] || "bg-gray-100 text-gray-700");
  return (
    <div data-testid="sm-withdraws">
      <div className="text-[11px] text-[#7B6D5A] mb-3">Your agents' commission withdraw requests. HR / Finance approves and processes the payouts.</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-[#F2EDE4] text-[#7B6D5A] uppercase text-[10px]">
            <tr>
              <th className="text-left p-2">Request</th><th className="text-left p-2">Agent</th>
              <th className="text-left p-2">Amount</th><th className="text-left p-2">Method</th>
              <th className="text-left p-2">GPay</th><th className="text-left p-2">Status</th>
              <th className="text-left p-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {reqs.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-[#7B6D5A]">No withdraw requests yet.</td></tr>}
            {reqs.map(r => (
              <tr key={r.id} className="border-t border-[#E5E3DB]" data-testid={`sm-withdraw-${r.id}`}>
                <td className="p-2 font-mono text-[10px]">{r.id}</td>
                <td className="p-2"><div>{r.agent_name}</div><div className="text-[9px] text-[#7B6D5A]">{r.agent_phone}</div></td>
                <td className="p-2 font-bold">₹{r.amount}</td>
                <td className="p-2 uppercase">{r.method}</td>
                <td className="p-2 font-mono">{r.gpay_number || "-"}</td>
                <td className="p-2"><span className={`px-2 py-0.5 rounded text-[10px] ${wdStatus(r.status)}`}>{r.status}</span></td>
                <td className="p-2 text-[#7B6D5A]">{(r.created_at||"").slice(0,10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
