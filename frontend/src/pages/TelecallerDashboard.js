import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, Plus, LogOut, PhoneCall, Users, TrendingUp, Calendar, IndianRupee, Loader2, X, ClipboardList, RefreshCw, Wallet, AlertTriangle, Trophy, Zap, Clock } from "lucide-react";
import RoleGuidelines from "../components/RoleGuidelines";
import AttendanceCheckIn from "../components/AttendanceCheckIn";
import NotificationBell from "../components/NotificationBell";
import GlobalSearch from "../components/GlobalSearch";

const API = "/api";
const MONTHS = [{v:"1",l:"Jan"},{v:"2",l:"Feb"},{v:"3",l:"Mar"},{v:"4",l:"Apr"},{v:"5",l:"May"},{v:"6",l:"Jun"},{v:"7",l:"Jul"},{v:"8",l:"Aug"},{v:"9",l:"Sep"},{v:"10",l:"Oct"},{v:"11",l:"Nov"},{v:"12",l:"Dec"}];
const STATUS_COLORS = { new: "bg-blue-100 text-blue-800", interested: "bg-green-100 text-green-800", follow_up: "bg-yellow-100 text-yellow-800", not_interested: "bg-red-100 text-red-800", ordered: "bg-emerald-100 text-emerald-800" };

export default function TelecallerDashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const [stats, setStats] = useState({});
  const [leads, setLeads] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [commission, setCommission] = useState({});
  const [commissionList, setCommissionList] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [instructions, setInstructions] = useState([]);
  const [relCalls, setRelCalls] = useState({calls:[],stats:{}});
  const [tab, setTab] = useState("today");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");  // YYYY-MM-DD; empty = all dates
  const [searchQuery, setSearchQuery] = useState("");
  const [month, setMonth] = useState((new Date().getMonth()+1).toString());
  const [showAddLead, setShowAddLead] = useState(false);
  const [showCallLog, setShowCallLog] = useState(false);
  const [showOrder, setShowOrder] = useState(false);
  const [showFundRequest, setShowFundRequest] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [leadForm, setLeadForm] = useState({ phone_number: "", name: "", source: "manual", interested_products: [], remarks: "", status: "new" });
  const [callForm, setCallForm] = useState({ status: "", customer_remarks: "", customer_name: "", enquiry_type: "orders", next_follow_up_date: "", next_follow_up_time: "" });
  const [orderForm, setOrderForm] = useState({ customer_name: "", customer_phone: "", customer_address: "", customer_city: "", customer_pincode: "", customer_landmark: "", items: [], total_amount: 0, payment_type: "cod" });
  const [fundForm, setFundForm] = useState({ amount: 0, reason: "", category: "travel" });

  const fetchData = useCallback(async () => {
    try {
      const [sR, lR, pR, cR, tR, iR, rc, oR] = await Promise.all([
        axios.get(`${API}/dashboard/stats`), axios.get(`${API}/leads`), axios.get(`${API}/products`),
        axios.get(`${API}/commissions/my`).catch(()=>({data:{summary:{}}})),
        axios.get(`${API}/tasks`).catch(()=>({data:{tasks:[]}})),
        axios.get(`${API}/instructions`).catch(()=>({data:{instructions:[]}})),
        axios.get(`${API}/relationship-calls`).catch(()=>({data:{calls:[],stats:{}}})),
        axios.get(`${API}/orders?limit=200`).catch(()=>({data:{orders:[]}}))
      ]);
      setStats(sR.data.stats); setLeads(lR.data.leads); setProducts(pR.data.products);
      setCommission(cR.data.summary||{}); setCommissionList(cR.data.commissions||[]); setTasks(tR.data.tasks||[]);
      setOrders(oR.data.orders||[]);
      try { const lb = await axios.get(`${API}/leaderboard/telecaller`); setLeaderboard(lb.data.leaderboard||[]); } catch {}
      setInstructions(iR.data.instructions||[]); setRelCalls(rc.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const today = new Date().toISOString().split("T")[0];
  const nowIso = new Date().toISOString();
  // Leads that still need conversion (interested or marked ordered but no order in the system yet)
  const orderedLeadIds = new Set((orders || []).map(o => o.lead_id).filter(Boolean));
  const isPendingConversion = (l) => (l.status === "interested" || l.status === "ordered") && !orderedLeadIds.has(l.id);

  // Smart priority — lower number = higher in the list
  //  0  Newly added (status="new" and not yet contacted)
  //  1  Pending order conversion (interested / ordered without an order created)
  //  2  Follow-up due NOW (date+time has arrived)
  //  3  Repeat order due
  //  4  Relationship call due
  //  5  Interested (still needs follow-up)
  //  6  Future follow-up (not yet due)
  //  7  No response / busy / callback
  //  8  Not interested
  //  9  Order created within 30 days  →  hidden (returns to top automatically once 30d window passes)
  const isFollowUpDueNow = (l) => {
    if (!l.next_follow_up_date) return false;
    if (l.next_follow_up_date < today) return true;
    if (l.next_follow_up_date > today) return false;
    if (!l.next_follow_up_time) return true;  // date matches today, no time → due
    // date matches today and time provided → due once that time has arrived
    return `${l.next_follow_up_date}T${l.next_follow_up_time}` <= nowIso.slice(0,16);
  };

  const isRecentlyOrdered = (l) => {
    // Hide leads whose order was created within the last 30 days
    if (l.status !== "order_created" && l.status !== "converted") return false;
    const ref = l.last_order_date || (l.updated_at || "").slice(0,10);
    if (!ref) return false;
    const ageMs = new Date(today) - new Date(ref);
    return ageMs >= 0 && ageMs < 30 * 24 * 60 * 60 * 1000;
  };

  const leadPriority = (l) => {
    if (l.status === "new" && (!l.call_logs || l.call_logs.length === 0)) return 0;
    if (isPendingConversion(l)) return 1;
    if (isFollowUpDueNow(l)) return 2;
    if (l.next_repeat_order_date && l.next_repeat_order_date <= today) return 3;
    if (l.next_relationship_date && l.next_relationship_date <= today) return 4;
    if (l.status === "interested") return 5;
    if (l.next_follow_up_date && l.next_follow_up_date > today) return 6;
    if (l.status === "no_response" || l.status === "busy" || l.status === "follow_up") return 7;
    if (l.status === "not_interested") return 8;
    return 5;
  };

  const filteredLeads = leads.filter(l => {
    // Hide leads routed to collab and recently-ordered leads from active views
    if (l.status === "routed_to_collab") return false;
    if (isRecentlyOrdered(l)) return false;
    // Apply status + date + search filters on top of the tab
    if (statusFilter !== "all" && l.status !== statusFilter) return false;
    if (dateFilter && (l.created_at || "").slice(0,10) !== dateFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      const hay = `${l.name || ""} ${l.phone_number || ""} ${l.product_interest || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (tab === "today") return l.status === "new" || isFollowUpDueNow(l) || isPendingConversion(l) || (l.next_repeat_order_date && l.next_repeat_order_date <= today) || (l.next_relationship_date && l.next_relationship_date <= today);
    if (tab === "repeat") return l.next_repeat_order_date && l.next_repeat_order_date <= today;
    if (tab === "relationship") return l.next_relationship_date && l.next_relationship_date <= today;
    if (tab === "interested") return l.status === "interested" || isPendingConversion(l);
    if (tab === "all") return true;
    return true;
  }).sort((a, b) => {
    const pa = leadPriority(a), pb = leadPriority(b);
    if (pa !== pb) return pa - pb;
    // Within the same priority, newer leads first (created_at desc)
    return (b.created_at || "").localeCompare(a.created_at || "");
  });

  const handleAddLead = async () => {
    if (!leadForm.phone_number) return toast.error("Phone number required");
    // Leave name blank when not provided — it gets captured on the first call log.
    const payload = { ...leadForm, name: (leadForm.name || "").trim(), product_interest: leadForm.interested_products.join(", ") };
    try {
      await axios.post(`${API}/leads`, payload);
      toast.success("Lead added!");
      setShowAddLead(false);
      setLeadForm({ phone_number: "", name: "", source: "manual", interested_products: [], remarks: "", status: "new" });
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };

  const handleCallLog = async () => {
    if (!callForm.status) return toast.error("Select status");
    const isOrder = callForm.enquiry_type === "orders";
    const payload = {
      status: callForm.status,
      customer_remarks: callForm.customer_remarks,
      ...(isOrder ? {
        next_follow_up_date: callForm.next_follow_up_date,
        next_follow_up_time: callForm.next_follow_up_time,
      } : {}),
      call_log: {
        status: callForm.status,
        remarks: callForm.customer_remarks,
        customer_name: callForm.customer_name,
        enquiry_type: callForm.enquiry_type,
      },
    };
    try {
      await axios.put(`${API}/leads/${selectedLead.id}`, payload);
      if (!isOrder) {
        const dest = callForm.enquiry_type === "sales_opportunity" ? "Sales Manager's Sales Collab book" : "Social Media Manager's Collaborations book";
        toast.success(`Routed to ${dest}`);
      } else {
        toast.success("Call logged!");
      }
      setShowCallLog(false);
      // Open Create Order dialog automatically when the call resulted in interest or an order
      if (isOrder && (callForm.status === "interested" || callForm.status === "ordered")) {
        const finalName = callForm.customer_name || (selectedLead.name && selectedLead.name !== "Unknown" ? selectedLead.name : "");
        setSelectedLead({...selectedLead, status: callForm.status, name: finalName});
        setOrderForm({ customer_name: finalName, customer_phone: selectedLead.phone_number, customer_address: "", customer_city: "", customer_pincode: "", customer_landmark: "", items: [], total_amount: 0, payment_type: "cod" });
        setShowOrder(true);
      }
      fetchData();
    } catch { toast.error("Failed"); }
  };

  const handleCreateOrder = async () => {
    const computedTotal = orderForm.items.reduce((s,i)=>s+i.price*i.quantity, 0);
    const finalTotal = computedTotal > 0 ? computedTotal : Number(orderForm.total_amount || 0);
    if (!orderForm.customer_name) return toast.error("Customer name is required");
    if (orderForm.items.length === 0 && finalTotal <= 0) return toast.error("Add at least one product or enter manual amount");
    if (finalTotal <= 0) return toast.error("Total amount must be greater than 0");
    if (!orderForm.customer_address || orderForm.customer_address.trim().length < 8) return toast.error("Customer address is required (min 8 chars)");
    try {
      await axios.post(`${API}/orders`, { ...orderForm, total_amount: finalTotal, lead_id: selectedLead?.id || "" });
      toast.success(`Order created! Total: Rs.${finalTotal}`);
      setShowOrder(false);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  };

  const updateItemQty = (pid, delta) => {
    setOrderForm(f => ({
      ...f,
      items: f.items
        .map(i => i.product_id === pid ? { ...i, quantity: Math.max(0, (i.quantity || 1) + delta) } : i)
        .filter(i => i.quantity > 0)
    }));
  };
  const setItemQty = (pid, qty) => {
    const q = Math.max(0, parseInt(qty || 0));
    setOrderForm(f => ({
      ...f,
      items: f.items.map(i => i.product_id === pid ? { ...i, quantity: q } : i).filter(i => i.quantity > 0)
    }));
  };
  const addProduct = (p) => {
    setOrderForm(f => {
      const ex = f.items.find(i => i.product_id === p.id);
      if (ex) return f;
      return { ...f, items: [...f.items, { product_id: p.id, name: p.name, price: p.price, quantity: 1 }] };
    });
  };

  const markCalled = async (lid) => {
    try { await axios.put(`${API}/relationship-calls/${lid}/mark-called`, {remarks:"Called"}); toast.success("Marked"); fetchData(); } catch { toast.error("Failed"); }
  };

  const toggleProduct = (pName) => {
    setLeadForm(f => ({...f, interested_products: f.interested_products.includes(pName) ? f.interested_products.filter(p=>p!==pName) : [...f.interested_products, pName]}));
  };

  const logout = () => { localStorage.clear(); navigate("/login"); };
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F9F8F6]"><Loader2 className="w-8 h-8 animate-spin text-[#3B5249]" /></div>;

  return (
    <div className="min-h-screen bg-[#F9F8F6]" data-testid="telecaller-dashboard">
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#F9F8F6]/80 border-b border-[#E5E3DB]">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div><h1 className="font-heading text-lg font-medium text-[#2C3531]">Celesta <span className="text-[#3B5249] font-semibold">Glow</span></h1><p className="text-[10px] text-[#59615D] uppercase tracking-[0.15em]">Telecaller - {user.name}</p></div>
          <div className="flex items-center gap-2"><GlobalSearch /><NotificationBell /><AttendanceCheckIn /><Button variant="outline" onClick={logout} className="rounded-full border-[#E5E3DB] text-xs h-8"><LogOut className="w-3 h-3 mr-1"/>Logout</Button></div>
        </div>
      </div>
      <div className="max-w-5xl mx-auto px-4 py-4">
        <RoleGuidelines role="telecaller" />

        {/* SMART COACH ALERTS — proactive reminders & motivation */}
        {(() => {
          const todayIso = new Date().toISOString().slice(0,10);
          const sevenDaysAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString().slice(0,10);
          // a) Never-called new leads (the user's main complaint — 30 fresh leads must NOT show as "all clear")
          const newUncalled = leads.filter(l => l.status === "new" && (!l.call_logs || l.call_logs.length === 0) && l.status !== "routed_to_collab");
          // b) Interested leads with NO order created
          const interestedNotConverted = leads.filter(l => (l.status === "interested" || l.status === "ordered") && !orderedLeadIds.has(l.id));
          // c) Follow-ups due NOW
          const dueNow = leads.filter(l => isFollowUpDueNow(l));
          // d) Repeat orders + relationship calls due
          const repeatDue = leads.filter(l => l.next_repeat_order_date && l.next_repeat_order_date <= todayIso);
          const relationshipDue = leads.filter(l => l.next_relationship_date && l.next_relationship_date <= todayIso);
          // e) Stale interested leads (no call log in last 7 days)
          const staleInterested = leads.filter(l => {
            if (l.status !== "interested") return false;
            const logs = l.call_logs || [];
            if (!logs.length) return true;
            const last = logs[logs.length - 1];
            const lastTs = (last.logged_at || last.timestamp || "").slice(0,10);
            return lastTs && lastTs < sevenDaysAgo;
          });
          // f) Today's orders by this telecaller — for motivation
          const todayOrders = (orders || []).filter(o => (o.created_at || "").slice(0,10) === todayIso && o.status !== "cancelled");
          const todayRevenue = todayOrders.reduce((s,o) => s + (Number(o.total_amount) || 0), 0);
          // g) Top performer of the day from leaderboard
          const topPerformer = (leaderboard && leaderboard[0]) || null;
          const myRank = leaderboard ? leaderboard.findIndex(u => u.id === user.id) + 1 : 0;

          const alerts = [];
          const jump = (t) => () => { setTab(t); setStatusFilter("all"); setDateFilter(""); setSearchQuery(""); };
          if (newUncalled.length > 0) alerts.push({ key: "fresh", tone: "red", icon: Phone, msg: `🔥 ${newUncalled.length} fresh lead(s) waiting for their FIRST call. Don't let them go cold!`, action: jump("today") });
          if (dueNow.length > 0) alerts.push({ key: "due", tone: "red", icon: AlertTriangle, msg: `${dueNow.length} follow-up call(s) are DUE NOW — call them before they cool off.`, action: jump("today") });
          if (interestedNotConverted.length > 0) alerts.push({ key: "interested", tone: "amber", icon: Zap, msg: `${interestedNotConverted.length} interested customer(s) haven't been converted to an order yet. Tap to push them to checkout.`, action: jump("interested") });
          if (repeatDue.length > 0) alerts.push({ key: "repeat", tone: "orange", icon: RefreshCw, msg: `${repeatDue.length} customer(s) are due for a repeat order today.`, action: jump("repeat") });
          if (relationshipDue.length > 0) alerts.push({ key: "rel", tone: "pink", icon: Phone, msg: `${relationshipDue.length} relationship call(s) due — keep your loyal customers warm.`, action: jump("relationship") });
          if (staleInterested.length > 0) alerts.push({ key: "stale", tone: "amber", icon: Clock, msg: `${staleInterested.length} interested lead(s) haven't been called in 7+ days. Re-engage them now!`, action: jump("interested") });
          if (todayOrders.length > 0) alerts.push({ key: "win", tone: "green", icon: Trophy, msg: `🎉 You created ${todayOrders.length} order(s) today worth Rs.${todayRevenue.toLocaleString()}. Keep going!`, action: jump("orders") });
          if (topPerformer && topPerformer.id !== user.id && (topPerformer.revenue || 0) > 0) {
            alerts.push({ key: "top", tone: "violet", icon: Trophy, msg: `🏆 ${topPerformer.name} is leading with Rs.${(topPerformer.revenue||0).toLocaleString()} today. You're at #${myRank || "—"}. Catch up!`, action: jump("leaderboard") });
          }
          // Only show "all clear" when EVERY actionable bucket is empty
          if (alerts.length === 0) {
            alerts.push({ key: "all-clear", tone: "green", icon: Trophy, msg: "✨ All clear! No pending calls, no overdue follow-ups. Great work — go grab fresh leads!", action: () => setShowAddLead(true) });
          }

          const toneMap = {
            red: "bg-red-50 border-red-300 text-red-800",
            amber: "bg-amber-50 border-amber-300 text-amber-800",
            orange: "bg-orange-50 border-orange-300 text-orange-800",
            pink: "bg-pink-50 border-pink-300 text-pink-800",
            green: "bg-emerald-50 border-emerald-300 text-emerald-800",
            violet: "bg-violet-50 border-violet-300 text-violet-800",
          };

          return (
            <div className="space-y-1.5 mb-4" data-testid="tc-coach-alerts">
              {alerts.slice(0, 4).map(a => {
                const Icon = a.icon;
                return (
                  <button key={a.key} onClick={a.action} className={`w-full text-left flex items-start gap-2 rounded-xl border px-3 py-2 ${toneMap[a.tone]} hover:shadow-sm transition`} data-testid={`tc-alert-${a.key}`}>
                    <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <p className="text-xs font-medium leading-snug flex-1">{a.msg}</p>
                    <span className="text-[10px] opacity-70 mt-0.5">Tap →</span>
                  </button>
                );
              })}
            </div>
          );
        })()}

        {/* Warning Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          <div className={`rounded-xl p-3 text-center border ${(relCalls.stats?.pending||0)>0?'border-yellow-300 bg-yellow-50':'border-[#E5E3DB] bg-white'}`}><p className="font-heading text-lg font-bold text-yellow-700">{relCalls.stats?.pending||0}</p><p className="text-[9px] uppercase">Pending Calls</p></div>
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-3 text-center"><p className="font-heading text-lg font-bold text-green-700">{relCalls.stats?.called||0}</p><p className="text-[9px] uppercase">Called Today</p></div>
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-3 text-center"><p className="font-heading text-lg font-bold">{leads.filter(l=>l.next_repeat_order_date&&l.next_repeat_order_date<=today).length}</p><p className="text-[9px] uppercase">Repeat Due</p></div>
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-3 text-center cursor-pointer hover:bg-[#F9F8F6]" onClick={()=>setTab("commissions")} data-testid="tc-commission-card"><IndianRupee className="w-4 h-4 mx-auto mb-0.5 text-[#3B5249]"/><p className="font-heading text-lg font-bold">Rs.{commission.total_earned||0}</p><p className="text-[9px] uppercase">Commission ({commission.count||0})</p></div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-3 bg-white rounded-full border border-[#E5E3DB] p-1 overflow-x-auto">
          {[{v:"today",l:`Today (${leads.filter(l=>l.status==="new"||l.next_follow_up_date===today).length})`},{v:"repeat",l:"Repeat"},{v:"relationship",l:"Relation"},{v:"interested",l:"Interested"},{v:"calls",l:"Today's Calls"},{v:"all",l:`All Leads (${leads.length})`},{v:"orders",l:`📦 Orders (${orders.length})`},{v:"commissions",l:`💰 Commissions (${commission.count||0})`},{v:"tasks",l:"Tasks"},{v:"leaderboard",l:"🏆 Leaderboard"},{v:"instructions",l:"Guide"}].map(t=>(
            <button key={t.v} onClick={()=>setTab(t.v)} className={`px-3 py-1.5 rounded-full text-[10px] font-medium whitespace-nowrap ${tab===t.v?"bg-[#3B5249] text-white":"text-[#59615D] hover:bg-[#F9F8F6]"}`} data-testid={`tc-tab-${t.v}`}>{t.l}</button>
          ))}
        </div>

        {/* ACTION BAR */}
        <div className="flex gap-2 mb-4">
          <Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={()=>setShowAddLead(true)} data-testid="add-lead-btn"><Plus className="w-3 h-3 mr-1"/>Add Lead</Button>
          <Button size="sm" variant="outline" className="rounded-full text-xs" onClick={()=>setShowFundRequest(true)}><Wallet className="w-3 h-3 mr-1"/>Fund Req</Button>
        </div>

        {/* TODAY'S CALLS TABLE */}
        {tab === "calls" && (
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-4 mb-4">
            <h3 className="font-heading text-base font-medium mb-3">Today's Calls</h3>
            {(relCalls.calls||[]).length===0?<p className="text-center py-6 text-[#59615D] text-sm">No calls due today</p>:
            <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b bg-[#F9F8F6]"><th className="p-2 text-left text-[9px]">Customer</th><th className="p-2 text-[9px]">Mobile</th><th className="p-2 text-[9px]">Type</th><th className="p-2 text-[9px]">Due</th><th className="p-2 text-[9px]">Status</th><th className="p-2 text-[9px]">Action</th></tr></thead>
            <tbody>{(relCalls.calls||[]).map(c=>(
              <tr key={c.id} className="border-b border-[#E5E3DB]"><td className="p-2 font-medium">{c.name}</td><td className="p-2"><a href={`tel:${c.phone}`} className="text-[#3B5249] underline">{c.phone}</a></td><td className="p-2"><Badge variant="outline" className="text-[8px] capitalize">{c.type}</Badge></td><td className="p-2">{c.due_date}</td><td className="p-2"><Badge className={`text-[7px] ${c.status==='called'?'bg-green-100 text-green-800':'bg-yellow-100 text-yellow-800'}`}>{c.status}</Badge></td><td className="p-2">{c.status==='pending'&&<Button size="sm" className="rounded-full text-[9px] bg-[#6B8E6B] text-white h-6" onClick={()=>markCalled(c.id)}>Called</Button>}</td></tr>
            ))}</tbody></table></div>}
          </div>
        )}

        {/* COMMISSIONS - per order list */}
        {tab === "commissions" && (
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-4 mb-4" data-testid="tc-commissions-panel">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-heading text-base font-medium">My Commissions</h3>
              <div className="text-xs text-[#59615D]">Pending: <b className="text-yellow-700">Rs.{commission.total_pending||0}</b> · Approved: <b className="text-blue-700">Rs.{commission.total_approved||0}</b> · Paid: <b className="text-green-700">Rs.{commission.total_paid||0}</b> · <b className="text-[#3B5249]">Total: Rs.{commission.total_earned||0}</b></div>
            </div>
            {commissionList.length===0 ? <p className="text-center py-6 text-[#59615D] text-sm">No commissions yet. Once your delivered orders earn commission, they will appear here.</p> :
            <div className="overflow-x-auto"><table className="w-full text-xs">
              <thead><tr className="border-b bg-[#F9F8F6]">{["Order","Customer","Phone","Order Total","Rate","Commission","Status","Date"].map(h=><th key={h} className="p-2 text-left text-[9px] uppercase text-[#59615D]">{h}</th>)}</tr></thead>
              <tbody>{commissionList.map(c=>(
                <tr key={c.id} className="border-b border-[#E5E3DB] hover:bg-[#F9F8F6]" data-testid={`tc-comm-row-${c.id}`}>
                  <td className="p-2 font-mono text-[10px]">{c.order_id}</td>
                  <td className="p-2 font-medium">{c.customer_name||"-"}</td>
                  <td className="p-2">{c.customer_phone||"-"}</td>
                  <td className="p-2">Rs.{c.order_total||c.order_amount||0}</td>
                  <td className="p-2">{c.commission_percentage||"-"}%</td>
                  <td className="p-2 font-bold text-[#3B5249]">Rs.{c.commission_amount||0}</td>
                  <td className="p-2"><Badge className={`text-[9px] capitalize ${c.status==='paid'?'bg-green-100 text-green-800':c.status==='approved'?'bg-blue-100 text-blue-800':'bg-yellow-100 text-yellow-800'}`}>{c.status}</Badge></td>
                  <td className="p-2 text-[10px]">{(c.created_at||"").slice(0,10)}</td>
                </tr>
              ))}</tbody>
            </table></div>}
          </div>
        )}

        {/* TASKS */}
        {tab === "tasks" && (
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-4 mb-4">
            <h3 className="font-heading text-base font-medium mb-3">My Tasks</h3>
            {tasks.length===0?<p className="text-center py-6 text-[#59615D] text-sm">No tasks</p>:
            <div className="space-y-2">{tasks.map(t=>(<div key={t.id} className="border border-[#E5E3DB] rounded-lg p-3"><p className="font-medium text-xs">{t.title}</p><p className="text-[10px] text-[#59615D]">{t.description||t.content}</p><Badge className={`text-[8px] ${t.status==='completed'?'bg-green-100 text-green-800':'bg-yellow-100 text-yellow-800'}`}>{t.status}</Badge></div>))}</div>}
          </div>
        )}

        {/* LEADERBOARD */}
        {tab === "leaderboard" && (
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-4 mb-4" data-testid="tc-leaderboard">
            <h3 className="font-heading text-base font-medium mb-3">🏆 Telecaller Leaderboard</h3>
            {leaderboard.length === 0 ? <p className="text-center py-6 text-[#59615D] text-sm">Loading...</p> :
              <div className="space-y-2">{leaderboard.map((u,i)=>(
                <div key={u.id} className={`flex justify-between items-center rounded-lg p-3 ${u.id===user.id?'bg-[#F9F8F6] border-2 border-[#3B5249]':'border border-[#E5E3DB]'}`} data-testid={`leader-${i+1}`}>
                  <div className="flex items-center gap-2"><span className="font-bold text-lg">{i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}</span><div><p className="font-medium text-sm">{u.name}{u.id===user.id&&<Badge className="ml-1 text-[8px] bg-[#3B5249] text-white">YOU</Badge>}</p><p className="text-[10px] text-[#59615D]">{u.orders} orders | Rs.{u.commission} commission</p></div></div>
                  <p className="font-heading text-lg font-bold text-[#3B5249]">Rs.{u.revenue}</p>
                </div>
              ))}</div>}
          </div>
        )}

        {/* INSTRUCTIONS */}
        {tab === "instructions" && (
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-4 mb-4">
            <h3 className="font-heading text-base font-medium mb-3">Training & Instructions</h3>
            <div className="space-y-3">
              {[{t:"How to Handle First Call",c:"1. Greet warmly with your name and company\n2. Ask if they have 2 minutes\n3. Explain product benefits briefly\n4. Listen to their needs\n5. Offer relevant product\n6. Set follow-up if needed"},
                {t:"Lead Conversion Script",c:"'Hi [Name], this is [You] from Celesta Glow. I'm calling about our [Product]. Many customers like you have seen amazing results. Can I share how it can help you?'"},
                {t:"Objection Handling",c:"Price: 'I understand. Let me explain the value you get...'\nNot interested: 'May I ask what concerns you? Perhaps I can address that.'\nBusy: 'When would be a better time to call?'"},
                {t:"Follow-up Best Practices",c:"- Call within 15 minutes of lead creation\n- Always note preferred call time\n- Change approach for repeat calls\n- Share customer success stories"}
              ].map((ins,i)=>(<div key={i} className="border border-[#E5E3DB] rounded-lg p-3"><p className="font-heading font-medium text-xs mb-1">{ins.t}</p><pre className="text-[10px] text-[#59615D] whitespace-pre-wrap font-sans">{ins.c}</pre></div>))}
              {instructions.map(i=>(<div key={i.id} className="border border-[#E5E3DB] rounded-lg p-3"><p className="font-heading font-medium text-xs">{i.title}</p><p className="text-[10px] text-[#59615D]">{i.content}</p></div>))}
            </div>
          </div>
        )}

        {/* ORDERS LIST */}
        {tab === "orders" && (
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-4 mb-4" data-testid="tc-orders-panel">
            <h3 className="font-heading text-base font-medium mb-3">📦 My Order History ({orders.length})</h3>
            {orders.length === 0 ? <p className="text-center py-6 text-[#59615D] text-sm">No orders yet. Orders you create from converted leads will appear here.</p> :
            <div className="overflow-x-auto"><table className="w-full text-xs">
              <thead><tr className="border-b bg-[#F9F8F6]">{["Order #","Customer","Phone","Address","Items","Amount","Payment","Status","Date"].map(h=><th key={h} className="p-2 text-left text-[9px] uppercase text-[#59615D]">{h}</th>)}</tr></thead>
              <tbody>{orders.map(o=>(
                <tr key={o.id} className="border-b border-[#E5E3DB] hover:bg-[#F9F8F6]" data-testid={`tc-order-row-${o.id}`}>
                  <td className="p-2 font-mono text-[10px]">{o.order_number || o.id}</td>
                  <td className="p-2 font-medium">{o.customer_name}</td>
                  <td className="p-2">{o.customer_phone}</td>
                  <td className="p-2 text-[10px] max-w-[220px]"><span title={[o.customer_address,o.customer_city,o.customer_pincode].filter(Boolean).join(", ")}>{[o.customer_address,o.customer_city,o.customer_pincode].filter(Boolean).join(", ").slice(0,60)||"-"}</span></td>
                  <td className="p-2 text-[10px] max-w-[180px] truncate">{(o.items||[]).map(it=>`${it.product_name} ×${it.quantity}`).join(", ") || "-"}</td>
                  <td className="p-2 font-bold text-[#3B5249]">Rs.{o.total_amount || 0}</td>
                  <td className="p-2"><Badge variant="outline" className="text-[8px] uppercase">{o.payment_type || "cod"}</Badge></td>
                  <td className="p-2"><Badge className={`text-[9px] capitalize ${o.status==='delivered'?'bg-emerald-100 text-emerald-800':o.status==='confirmed'?'bg-blue-100 text-blue-800':o.status==='cancelled'?'bg-red-100 text-red-800':'bg-yellow-100 text-yellow-800'}`}>{(o.status||'').replace(/_/g,' ')}</Badge></td>
                  <td className="p-2 text-[10px]">{(o.created_at||"").slice(0,10)}</td>
                </tr>
              ))}</tbody>
            </table></div>}
          </div>
        )}

        {/* LEADS LIST */}
        {!["calls","tasks","instructions","commissions","leaderboard","orders"].includes(tab) && (
          <>
            {/* Filter bar — status chips + date + search */}
            <div className="bg-white rounded-xl border border-[#E5E3DB] p-3 mb-3 space-y-2" data-testid="leads-filter-bar">
              <div className="flex gap-1 flex-wrap">
                {[
                  {v:"all",l:`All (${leads.filter(x=>x.status!=="routed_to_collab"&&!isRecentlyOrdered(x)).length})`},
                  {v:"new",l:"New"},
                  {v:"interested",l:"Interested"},
                  {v:"follow_up",l:"Follow-up"},
                  {v:"no_response",l:"No Response"},
                  {v:"busy",l:"Busy"},
                  {v:"ordered",l:"Order Created"},
                  {v:"not_interested",l:"Not Interested"},
                ].map(s=>(
                  <button key={s.v} onClick={()=>setStatusFilter(s.v)} className={`px-2.5 py-1 rounded-full text-[10px] font-medium whitespace-nowrap border transition ${statusFilter===s.v?"bg-[#3B5249] text-white border-[#3B5249]":"bg-white text-[#59615D] border-[#E5E3DB] hover:border-[#3B5249]"}`} data-testid={`status-filter-${s.v}`}>{s.l}</button>
                ))}
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                <Input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)} className="rounded-xl h-8 text-xs w-40" data-testid="leads-date-filter"/>
                {dateFilter && <Button size="sm" variant="outline" className="rounded-full text-[10px] h-7 px-2" onClick={()=>setDateFilter("")}>Clear date</Button>}
                <Input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search name / phone / product" className="rounded-xl h-8 text-xs flex-1 min-w-[180px]" data-testid="leads-search"/>
                <span className="text-[10px] text-[#59615D] ml-auto">Showing: <b className="text-[#3B5249]">{filteredLeads.length}</b></span>
              </div>
            </div>
            <div className="space-y-2">
            {filteredLeads.length===0?<p className="text-center py-8 text-[#59615D] text-sm">No leads in this category</p>:
            filteredLeads.map(lead => (
              <div key={lead.id} className="bg-white rounded-xl border border-[#E5E3DB] p-3" data-testid={`lead-${lead.id}`}>
                <div className="flex justify-between items-start mb-1">
                  <div><p className="font-heading font-medium text-sm">{(lead.name && lead.name !== "Unknown") ? lead.name : lead.phone_number}</p><p className="text-xs text-[#59615D]">{lead.phone_number}{lead.source ? ` | ${lead.source}` : ""}</p>
                    {lead.product_interest && lead.product_interest !== "general" && <p className="text-[10px] text-[#A66E4E]">Products: {lead.product_interest}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge className={`${STATUS_COLORS[lead.status] || "bg-gray-100"} text-[10px]`}>{lead.status?.replace("_", " ")}</Badge>
                    {isPendingConversion(lead) && <Badge className="bg-[#6B8E6B] text-white text-[9px]">ORDER PENDING</Badge>}
                    {lead.last_order_date && <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">REPEAT CUSTOMER</Badge>}
                    {lead.next_repeat_order_date && lead.next_repeat_order_date <= today && <Badge className="bg-orange-100 text-orange-800 text-[10px]">REPEAT DUE</Badge>}
                    {lead.next_relationship_date && lead.next_relationship_date <= today && <Badge className="bg-pink-100 text-pink-800 text-[10px]">RELATION CALL</Badge>}
                    {lead.callback_by && !lead.callback_done && new Date(lead.callback_by) <= new Date() && <div className="bg-red-100 border border-red-300 rounded px-1.5 py-0.5 animate-pulse"><span className="text-[9px] font-bold text-red-800">CALLBACK OVERDUE</span></div>}
                  </div>
                </div>
                {lead.remarks && <p className="text-xs text-[#59615D] mb-2">{lead.remarks}</p>}
                <div className="flex gap-2 flex-wrap">
                  <a href={`tel:${lead.phone_number}`}><Button size="sm" variant="outline" className="rounded-full text-xs border-[#E5E3DB] h-7" onClick={()=>{setSelectedLead(lead);setCallForm({status:lead.status,customer_remarks:"",customer_name:lead.name && lead.name!=="Unknown"?lead.name:"",enquiry_type:"orders",next_follow_up_date:"",next_follow_up_time:""});setShowCallLog(true);}} data-testid={`log-call-${lead.id}`}><PhoneCall className="w-3 h-3 mr-1"/>Log Call</Button></a>
                  {(lead.status === "interested" || lead.status === "ordered") && <Button size="sm" className="rounded-full text-xs bg-[#6B8E6B] text-white h-7" onClick={()=>{setSelectedLead(lead);setOrderForm({customer_name:lead.name && lead.name!=="Unknown"?lead.name:"",customer_phone:lead.phone_number,customer_address:"",customer_city:"",customer_pincode:"",customer_landmark:"",items:[],total_amount:0,payment_type:"cod"});setShowOrder(true);}} data-testid={`create-order-${lead.id}`}><Plus className="w-3 h-3 mr-1"/>Create Order</Button>}
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </div>

      {/* ADD LEAD DIALOG */}
      <Dialog open={showAddLead} onOpenChange={setShowAddLead}><DialogContent className="rounded-2xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle className="font-heading">Add New Lead</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-[10px] text-[#59615D]">Just save the phone number — the customer's name will be captured when you log the first call.</p>
          <div><Label className="text-xs font-medium">Mobile Number *</Label><Input value={leadForm.phone_number} onChange={e=>setLeadForm(f=>({...f,phone_number:e.target.value}))} placeholder="Phone number" className="rounded-xl" data-testid="lead-phone-input"/></div>
          <div><Label className="text-xs font-medium">Source</Label><Select value={leadForm.source} onValueChange={v=>setLeadForm(f=>({...f,source:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="manual">Manual</SelectItem><SelectItem value="website">Website</SelectItem><SelectItem value="social_media">Social Media</SelectItem><SelectItem value="referral">Referral</SelectItem><SelectItem value="campaign">Campaign</SelectItem></SelectContent></Select></div>
          <div><Label className="text-xs font-medium">Interested Products</Label>
            <div className="grid grid-cols-2 gap-1 border border-[#E5E3DB] rounded-xl p-2 max-h-32 overflow-y-auto">{products.map(p=>(
              <label key={p.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-[#F9F8F6] p-1 rounded"><input type="checkbox" checked={leadForm.interested_products.includes(p.name)} onChange={()=>toggleProduct(p.name)} className="rounded"/>{p.name} <span className="text-[#59615D]">Rs.{p.price}</span></label>
            ))}{products.length===0&&<p className="text-[10px] text-[#59615D] col-span-2">No products. Admin needs to add products.</p>}</div>
          </div>
          <div><Label className="text-xs font-medium">Initial Status</Label><Select value={leadForm.status} onValueChange={v=>setLeadForm(f=>({...f,status:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="new">New</SelectItem><SelectItem value="interested">Interested</SelectItem><SelectItem value="not_interested">Not Interested</SelectItem><SelectItem value="follow_up">Follow-up Later</SelectItem><SelectItem value="no_response">No Response</SelectItem><SelectItem value="busy">Busy</SelectItem></SelectContent></Select></div>
          <div><Label className="text-xs">Notes / Remarks</Label><Textarea value={leadForm.remarks} onChange={e=>setLeadForm(f=>({...f,remarks:e.target.value}))} className="rounded-xl" placeholder="Call notes..."/></div>
          <Button onClick={handleAddLead} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-lead-btn">Add Lead (First Call Done)</Button>
        </div>
      </DialogContent></Dialog>

      {/* CALL LOG DIALOG */}
      <Dialog open={showCallLog} onOpenChange={setShowCallLog}><DialogContent className="rounded-2xl max-h-[88vh] overflow-y-auto"><DialogHeader><DialogTitle className="font-heading">Log Call — {selectedLead?.name && selectedLead.name!=="Unknown" ? `${selectedLead.name} · ` : ""}{selectedLead?.phone_number}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {(!selectedLead?.name || selectedLead.name === "Unknown") ? (
            <div><Label className="text-xs font-medium">Customer Name *</Label><Input value={callForm.customer_name} onChange={e=>setCallForm(f=>({...f,customer_name:e.target.value}))} placeholder="Capture the customer's name now" className="rounded-xl" data-testid="call-customer-name"/></div>
          ) : (
            <div className="bg-[#F9F8F6] border border-[#E5E3DB] rounded-lg px-3 py-2 text-xs"><span className="text-[#59615D]">Customer:</span> <b className="text-[#3B5249]">{selectedLead.name}</b></div>
          )}
          <div>
            <Label className="text-xs font-medium">Enquiry Type *</Label>
            <Select value={callForm.enquiry_type} onValueChange={v=>setCallForm(f=>({...f,enquiry_type:v}))}>
              <SelectTrigger className="rounded-xl" data-testid="call-enquiry-type"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="orders">Enquiry for Orders</SelectItem>
                <SelectItem value="business_collaboration">Business Collaboration</SelectItem>
                <SelectItem value="influencer">Influencer</SelectItem>
                <SelectItem value="sales_opportunity">Sales Opportunity</SelectItem>
              </SelectContent>
            </Select>
            {callForm.enquiry_type !== "orders" && (
              <p className="text-[10px] text-[#A66E4E] mt-1">⤳ This contact will be moved to the {callForm.enquiry_type === "sales_opportunity" ? "Sales Manager's Sales Collab book" : "Social Media Manager's Collaborations book"} after you save. No follow-up will be scheduled on your side.</p>
            )}
          </div>
          <div><Label className="text-xs font-medium">Status After Call *</Label><Select value={callForm.status} onValueChange={v=>setCallForm(f=>({...f,status:v}))}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Select status"/></SelectTrigger><SelectContent>{callForm.enquiry_type === "orders" ? <><SelectItem value="interested">Interested</SelectItem><SelectItem value="not_interested">Not Interested</SelectItem><SelectItem value="follow_up">Follow-up Later</SelectItem><SelectItem value="no_response">No Response</SelectItem><SelectItem value="busy">Busy</SelectItem><SelectItem value="ordered">Order Created</SelectItem></> : <><SelectItem value="contacted">Contacted</SelectItem><SelectItem value="not_interested">Not Interested</SelectItem><SelectItem value="no_response">No Response</SelectItem></>}</SelectContent></Select></div>
          <div><Label className="text-xs">Notes / Remarks</Label><Textarea value={callForm.customer_remarks} onChange={e=>setCallForm(f=>({...f,customer_remarks:e.target.value}))} className="rounded-xl" placeholder="What did they say? Any context for the manager…"/></div>
          {callForm.enquiry_type === "orders" && (
            <div className="grid grid-cols-2 gap-2"><div><Label className="text-xs">Follow-up Date</Label><Input type="date" value={callForm.next_follow_up_date} onChange={e=>setCallForm(f=>({...f,next_follow_up_date:e.target.value}))} className="rounded-xl"/></div><div><Label className="text-xs">Time</Label><Input type="time" value={callForm.next_follow_up_time} onChange={e=>setCallForm(f=>({...f,next_follow_up_time:e.target.value}))} className="rounded-xl"/></div></div>
          )}
          <Button onClick={handleCallLog} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-call-log">{callForm.enquiry_type === "orders" ? "Log Call" : "Route Contact"}</Button>
          {callForm.enquiry_type === "orders" && (callForm.status === "interested" || callForm.status === "ordered") && <p className="text-[10px] text-[#6B8E6B] text-center">Create Order dialog will open after logging — please add delivery address</p>}
        </div>
      </DialogContent></Dialog>

      {/* CREATE ORDER DIALOG */}
      <Dialog open={showOrder} onOpenChange={setShowOrder}><DialogContent className="rounded-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle className="font-heading">Create Order</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Customer Name *</Label><Input value={orderForm.customer_name} onChange={e=>setOrderForm(f=>({...f,customer_name:e.target.value}))} className="rounded-xl" data-testid="order-customer-name"/></div>
          <div><Label className="text-xs">Phone *</Label><Input value={orderForm.customer_phone} onChange={e=>setOrderForm(f=>({...f,customer_phone:e.target.value}))} className="rounded-xl" data-testid="order-customer-phone"/></div>
          <div><Label className="text-xs text-[#B75D69] font-semibold">Full Delivery Address *</Label><Textarea value={orderForm.customer_address} onChange={e=>setOrderForm(f=>({...f,customer_address:e.target.value}))} className="rounded-xl" rows={3} placeholder="House/Flat no, Street, Locality, City, State, Pincode" data-testid="order-customer-address"/></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">City</Label><Input value={orderForm.customer_city} onChange={e=>setOrderForm(f=>({...f,customer_city:e.target.value}))} className="rounded-xl" placeholder="Calicut" data-testid="order-customer-city"/></div>
            <div><Label className="text-xs">Pincode</Label><Input value={orderForm.customer_pincode} onChange={e=>setOrderForm(f=>({...f,customer_pincode:e.target.value}))} className="rounded-xl" placeholder="673001" data-testid="order-customer-pincode"/></div>
          </div>
          <div><Label className="text-xs">Landmark (optional)</Label><Input value={orderForm.customer_landmark} onChange={e=>setOrderForm(f=>({...f,customer_landmark:e.target.value}))} className="rounded-xl" placeholder="Near XYZ school" data-testid="order-customer-landmark"/></div>
          <div><Label className="text-xs">Products & Quantity</Label>
            <div className="space-y-1.5 max-h-40 overflow-y-auto border border-[#E5E3DB] rounded-xl p-2">{products.map(p=>{const item=orderForm.items.find(i=>i.product_id===p.id); return(
              <div key={p.id} className="flex items-center justify-between text-xs gap-2">
                <span className="flex-1 truncate">{p.name} <span className="text-[#59615D]">(Rs.{p.price})</span></span>
                {!item ? (
                  <Button size="sm" type="button" className="h-6 px-2 rounded-full bg-[#3B5249] text-white text-[10px]" onClick={()=>addProduct(p)} data-testid={`add-product-${p.id}`}><Plus className="w-3 h-3"/></Button>
                ) : (
                  <div className="flex items-center gap-1">
                    <button type="button" className="w-6 h-6 rounded-full border border-[#E5E3DB] text-xs" onClick={()=>updateItemQty(p.id,-1)} data-testid={`dec-${p.id}`}>−</button>
                    <Input type="number" value={item.quantity} onChange={e=>setItemQty(p.id,e.target.value)} className="h-6 w-12 text-center text-[10px] rounded-md p-0" data-testid={`qty-${p.id}`}/>
                    <button type="button" className="w-6 h-6 rounded-full border border-[#E5E3DB] text-xs" onClick={()=>updateItemQty(p.id,1)} data-testid={`inc-${p.id}`}>+</button>
                    <span className="text-[#3B5249] font-semibold ml-1 text-[10px] min-w-[55px] text-right">Rs.{p.price*item.quantity}</span>
                  </div>
                )}
              </div>
            );})}</div>
            {orderForm.items.length>0 && (
              <div className="mt-2 bg-[#F9F8F6] rounded-lg p-2 flex justify-between items-center text-xs">
                <span className="text-[#59615D]">{orderForm.items.length} item{orderForm.items.length!==1?'s':''}, {orderForm.items.reduce((s,i)=>s+i.quantity,0)} qty</span>
                <span className="font-semibold text-[#3B5249]">Subtotal: Rs.{orderForm.items.reduce((s,i)=>s+i.price*i.quantity,0)}</span>
              </div>
            )}
          </div>
          <div><Label className="text-xs">Total Amount {orderForm.items.length>0 && <span className="text-[10px] text-[#59615D]">(auto from products)</span>}</Label><Input type="number" value={orderForm.items.reduce((s,i)=>s+i.price*i.quantity,0) || orderForm.total_amount} onChange={e=>setOrderForm(f=>({...f,total_amount:Number(e.target.value),items:[]}))} className="rounded-xl font-bold" data-testid="order-total"/></div>
          <div><Label className="text-xs">Payment</Label><Select value={orderForm.payment_type} onValueChange={v=>setOrderForm(f=>({...f,payment_type:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="cod">COD</SelectItem><SelectItem value="upi">UPI</SelectItem><SelectItem value="online">Online</SelectItem></SelectContent></Select></div>
          <Button onClick={handleCreateOrder} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-order-btn">Create Order</Button>
        </div>
      </DialogContent></Dialog>

      {/* FUND REQUEST */}
      <Dialog open={showFundRequest} onOpenChange={setShowFundRequest}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Request Fund</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Amount</Label><Input type="number" value={fundForm.amount} onChange={e=>setFundForm(f=>({...f,amount:Number(e.target.value)}))} className="rounded-xl"/></div>
          <div><Label className="text-xs">Reason</Label><Input value={fundForm.reason} onChange={e=>setFundForm(f=>({...f,reason:e.target.value}))} className="rounded-xl"/></div>
          <Button onClick={async()=>{if(!fundForm.amount)return toast.error("Amount required");try{await axios.post(`${API}/fund-requests`,fundForm);toast.success("Sent!");setShowFundRequest(false);}catch{toast.error("Failed");}}} className="w-full rounded-full bg-[#3B5249] text-white">Submit</Button>
        </div>
      </DialogContent></Dialog>
    </div>
  );
}
