import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DailyTaskSheet from "@/components/DailyTaskSheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, IndianRupee, ClipboardList, Check, X, Loader2, CreditCard, BarChart3, Image, ExternalLink, Plus } from "lucide-react";
import RoleGuidelines from "../components/RoleGuidelines";
import MonthFilter, { filterByMonth } from "../components/MonthFilter";
import AttendanceCheckIn from "../components/AttendanceCheckIn";
import NotificationBell from "../components/NotificationBell";
import GlobalSearch from "../components/GlobalSearch";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const API = "/api";

export default function FinanceManagerDashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const [stats, setStats] = useState({});
  const [expenses, setExpenses] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [finBalance, setFinBalance] = useState({cash:0,bank:0,total:0});
  const [finLedger, setFinLedger] = useState([]);
  const [fundRequests, setFundRequests] = useState([]);
  const [cashHolders, setCashHolders] = useState([]);
  const [commSummary, setCommSummary] = useState({agents:[],total_weekly:0,total_monthly:0,total_today:0});
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showFinTxn, setShowFinTxn] = useState(false);
  const [expForm, setExpForm] = useState({ title: "", amount: 0, category: "general", description: "" });
  const [finTxnForm, setFinTxnForm] = useState({ type: "credit", amount: 0, category: "manual", description: "", method: "bank" });

  const [showProof, setShowProof] = useState(false);
  const [proofPath, setProofPath] = useState("");
  const [monthlyStats, setMonthlyStats] = useState([]);
  const [pnl, setPnl] = useState(null);
  const [revEntries, setRevEntries] = useState([]);
  const [showRevEntry, setShowRevEntry] = useState(false);
  const [revForm, setRevForm] = useState({platform:"amazon",sale_amount:0,platform_fee:0,shipping_cost:0,settlement_charge:0,order_ref:"",notes:"",date:""});
  const [month, setMonth] = useState((new Date().getMonth()+1).toString());
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [gstEntries, setGstEntries] = useState([]);
  const [gstSummary, setGstSummary] = useState({output_gst:0,input_gst:0,net_payable:0});
  const [vendors, setVendors] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [clv, setClv] = useState({top_customers:[],avg_clv:0});
  const [showGST, setShowGST] = useState(false);
  const [showVendor, setShowVendor] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  const [gstForm, setGstForm] = useState({type:"sale",amount:0,rate:18,ref_no:"",notes:"",date:new Date().toISOString().slice(0,10)});
  const [vendorForm, setVendorForm] = useState({name:"",contact:"",phone:"",email:"",address:"",gst_number:"",category:"supplier",balance:0});
  const [recurringForm, setRecurringForm] = useState({name:"",category:"rent",amount:0,frequency:"monthly",next_due_date:""});

  const fetchData = useCallback(async () => {
    try {
      const [s, e, p] = await Promise.all([
        axios.get(`${API}/dashboard/stats`), axios.get(`${API}/expenses`),
        axios.get(`${API}/payroll`)
      ]);
      setStats(s.data.stats); setExpenses(e.data.expenses); setPayroll(p.data.payroll);
      try { const [fb, fl] = await Promise.all([axios.get(`${API}/finance/balance`), axios.get(`${API}/finance/ledger`)]);
        setFinBalance(fb.data.balance); setFinLedger(fl.data.transactions);
        try { const [fr, ch, cs, au, ms] = await Promise.all([axios.get(`${API}/fund-requests`), axios.get(`${API}/finance/cash-holders`), axios.get(`${API}/commissions/summary`).catch(()=>({data:{agents:[],total_weekly:0,total_monthly:0,total_today:0}})), axios.get(`${API}/all-users`).catch(()=>({data:{users:[]}})), axios.get(`${API}/finance/monthly-stats`).catch(()=>({data:{monthly_stats:[]}}))]);
          setFundRequests(fr.data.fund_requests); setCashHolders(ch.data.holders); setCommSummary(cs.data); setAllUsers(au.data.users||[]); setMonthlyStats(ms.data.monthly_stats||[]);
          try { const [p, re] = await Promise.all([axios.get(`${API}/pnl?month=${(new Date().getMonth()+1)}&year=${new Date().getFullYear()}`).catch(()=>({data:null})), axios.get(`${API}/revenue-entries`).catch(()=>({data:{entries:[]}}))]);
            setPnl(p.data); setRevEntries(re.data.entries||[]);
          } catch {}
        } catch {}
      } catch(e2) { console.error(e2); }
    } catch (err) { console.error(err); }
    try {
      const [g, v, rec, c] = await Promise.all([
        axios.get(`${API}/finance/gst`).catch(()=>({data:{entries:[],output_gst:0,input_gst:0,net_payable:0}})),
        axios.get(`${API}/vendors`).catch(()=>({data:{vendors:[]}})),
        axios.get(`${API}/finance/recurring`).catch(()=>({data:{recurring:[]}})),
        axios.get(`${API}/analytics/clv`).catch(()=>({data:{top_customers:[],avg_clv:0}}))
      ]);
      setGstEntries(g.data.entries||[]); setGstSummary({output_gst:g.data.output_gst,input_gst:g.data.input_gst,net_payable:g.data.net_payable});
      setVendors(v.data.vendors||[]); setRecurring(rec.data.recurring||[]); setClv(c.data);
    } catch {}
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAddGst = async () => { if (!gstForm.amount) return toast.error("Amount required"); try { await axios.post(`${API}/finance/gst`, gstForm); toast.success("Added"); setShowGST(false); setGstForm({type:"sale",amount:0,rate:18,ref_no:"",notes:"",date:new Date().toISOString().slice(0,10)}); fetchData(); } catch { toast.error("Failed"); } };
  const handleAddVendor = async () => { if (!vendorForm.name) return toast.error("Name required"); try { await axios.post(`${API}/vendors`, vendorForm); toast.success("Added"); setShowVendor(false); setVendorForm({name:"",contact:"",phone:"",email:"",address:"",gst_number:"",category:"supplier",balance:0}); fetchData(); } catch { toast.error("Failed"); } };
  const handleAddRecurring = async () => { if (!recurringForm.name) return toast.error("Name required"); try { await axios.post(`${API}/finance/recurring`, recurringForm); toast.success("Added"); setShowRecurring(false); setRecurringForm({name:"",category:"rent",amount:0,frequency:"monthly",next_due_date:""}); fetchData(); } catch { toast.error("Failed"); } };

  const approveExpense = async (id, status, debitFrom) => { try { await axios.put(`${API}/expenses/${id}/approve`, {status, debit_from: debitFrom}); toast.success(`Updated (${debitFrom})`); fetchData(); } catch { toast.error("Failed"); } };
  const processPayroll = async (id) => { try { await axios.put(`${API}/payroll/${id}/process`, {}); toast.success("Processed"); fetchData(); } catch { toast.error("Failed"); } };
  const handleAddExpense = async () => { if (!expForm.title) return toast.error("Title required"); try { await axios.post(`${API}/expenses`, {...expForm,amount:Number(expForm.amount)}); toast.success("Expense added"); setShowAddExpense(false); setExpForm({title:"",amount:0,category:"general",description:""}); fetchData(); } catch { toast.error("Failed"); } };
  const handleFinTxn = async () => { if (!finTxnForm.amount) return toast.error("Amount required"); try { await axios.post(`${API}/finance/transaction`, finTxnForm); toast.success("Recorded"); setShowFinTxn(false); setFinTxnForm({type:"credit",amount:0,category:"manual",description:"",method:"bank"}); fetchData(); } catch { toast.error("Failed"); } };
  const logout = () => { localStorage.clear(); navigate("/login"); };
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F9F8F6]"><Loader2 className="w-8 h-8 animate-spin text-[#3B5249]" /></div>;

  return (
    <div className="min-h-screen bg-[#F9F8F6]" data-testid="finance-manager-dashboard">
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#F9F8F6]/80 border-b border-[#E5E3DB]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div><h1 className="font-heading text-2xl font-medium text-[#2C3531]">Celesta <span className="text-[#3B5249] font-semibold">Glow</span></h1><p className="text-xs text-[#59615D] uppercase tracking-[0.15em]">Finance Manager - {user.name}</p></div>
          <div className="flex items-center gap-2"><GlobalSearch /><NotificationBell /><AttendanceCheckIn /><Button variant="outline" onClick={logout} className="rounded-full border-[#E5E3DB]" data-testid="logout-btn"><LogOut className="w-4 h-4 mr-2"/>Logout</Button></div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <RoleGuidelines role="finance_manager" />
        <MonthFilter month={month} year={year} onMonthChange={setMonth} onYearChange={setYear} />
        {/* Balance Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-4 text-center"><p className="text-xs text-[#59615D] uppercase">Cash in Hand</p><p className="font-heading text-2xl font-bold text-[#A66E4E]" data-testid="fin-cash">Rs.{finBalance.cash}</p></div>
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-4 text-center"><p className="text-xs text-[#59615D] uppercase">Bank Account</p><p className="font-heading text-2xl font-bold text-[#3B5249]" data-testid="fin-bank">Rs.{finBalance.bank}</p></div>
          <div className="bg-[#3B5249] rounded-xl p-4 text-center"><p className="text-xs text-white/70 uppercase">Working Capital</p><p className="font-heading text-2xl font-bold text-white" data-testid="fin-total">Rs.{finBalance.total}</p></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {[{l:"Total Expenses",v:`Rs.${stats.total_expenses||0}`,i:IndianRupee,c:"#B75D69"},{l:"Pending",v:stats.pending_expenses||0,i:ClipboardList,c:"#D4A373"},{l:"Approved",v:`Rs.${stats.approved_expenses||0}`,i:Check,c:"#6B8E6B"},{l:"Payroll Pending",v:stats.pending_payroll||0,i:CreditCard,c:"#A66E4E"}].map((s,i)=>(
            <div key={i} className="bg-white rounded-2xl border border-[#E5E3DB] p-5 hover:shadow-md transition-all hover:-translate-y-1"><s.i className="w-5 h-5 mb-3" style={{color:s.c}}/><p className="font-heading text-xl font-semibold">{s.v}</p><p className="text-xs text-[#59615D] uppercase mt-1">{s.l}</p></div>
          ))}
        </div>
        {/* Monthly Financial Chart */}
        {monthlyStats.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#E5E3DB] p-5 mb-6" data-testid="finance-monthly-chart">
            <h3 className="font-heading text-sm font-medium mb-3">Monthly Financial Overview</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E3DB" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => `Rs.${v}`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="credits" name="Credits" fill="#6B8E6B" radius={[4, 4, 0, 0]} />
                <Bar dataKey="debits" name="Debits" fill="#B75D69" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="Expenses" fill="#D4A373" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <Tabs defaultValue="expenses" className="space-y-6">
          <TabsList className="bg-white border border-[#E5E3DB] rounded-full p-1 h-auto flex-wrap gap-0.5">
            {[{v:"expenses",l:"Expenses"},{v:"pnl",l:"P&L"},{v:"funds",l:`Fund Req (${fundRequests.filter(f=>f.status==="pending").length})`},{v:"payroll",l:"Payroll"},{v:"cashholders",l:"Cash Holders"},{v:"commissions",l:"Commissions"},{v:"transactions",l:"Transactions"},{v:"gst",l:"GST"},{v:"vendors",l:"Vendors"},{v:"recurring",l:"Recurring"},{v:"clv",l:"CLV"},{v:"mysheet",l:"My Sheet"}].map(t=>(
              <TabsTrigger key={t.v} value={t.v} className="rounded-full text-xs data-[state=active]:bg-[#3B5249] data-[state=active]:text-white px-4" data-testid={`tab-${t.v}`}>{t.l}</TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="expenses" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] overflow-x-auto"><div className="p-5 border-b border-[#E5E3DB] flex justify-between"><h3 className="font-heading text-lg font-medium">Expenses ({expenses.filter(e=>e.status==="pending").length} pending)</h3><Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={()=>setShowAddExpense(true)}><Plus className="w-3 h-3 mr-1"/>Add Expense</Button></div>
            <table className="w-full"><thead><tr className="border-b bg-[#F9F8F6]">{["Date","Title","Category","Amount","By","Proof","Debited From","Status","Action"].map(h=><th key={h} className="text-left p-3 text-[10px] uppercase text-[#59615D]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[#E5E3DB]">{expenses.map(e=>(<tr key={e.id}><td className="p-3 text-xs">{e.created_at?.slice(0,10)}</td><td className="p-3 text-sm font-medium">{e.title}</td><td className="p-3"><Badge variant="outline" className="text-[9px]">{e.category}</Badge></td><td className="p-3 font-semibold">Rs.{e.amount}</td><td className="p-3 text-xs">{e.created_by_name}</td><td className="p-3">{e.proof_path?<Button size="sm" variant="ghost" className="text-xs text-[#3B5249] h-7" onClick={()=>{setProofPath(e.proof_path);setShowProof(true);}}><Image className="w-3 h-3 mr-1"/>View</Button>:<span className="text-xs text-[#59615D]">-</span>}</td><td className="p-3"><Badge variant="outline" className="text-[9px] capitalize">{e.debit_from||"-"}</Badge></td><td className="p-3"><Badge className={`text-[9px] ${e.status==="approved"?"bg-green-100 text-green-800":"bg-yellow-100 text-yellow-800"}`}>{e.status}</Badge></td><td className="p-3">{e.status==="pending"&&<div className="flex gap-1"><Select onValueChange={(v)=>approveExpense(e.id,"approved",v)}><SelectTrigger className="h-6 w-20 text-[9px] rounded-full"><SelectValue placeholder="Approve"/></SelectTrigger><SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="bank">Bank</SelectItem></SelectContent></Select><Button size="sm" variant="outline" className="rounded-full text-xs h-6" onClick={()=>approveExpense(e.id,"rejected","bank")}><X className="w-3 h-3"/></Button></div>}</td></tr>))}</tbody></table>
          </div></TabsContent>

          {/* P&L TAB */}
          <TabsContent value="pnl" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-heading text-lg font-medium">Profit & Loss</h3>
              <Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={()=>{setRevForm({platform:"amazon",sale_amount:0,platform_fee:0,shipping_cost:0,settlement_charge:0,order_ref:"",notes:"",date:""});setShowRevEntry(true);}}><Plus className="w-3 h-3 mr-1"/>Add Revenue</Button>
            </div>
            {pnl ? (<>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-[#F9F8F6] rounded-xl p-3 text-center"><p className="text-[10px] text-[#59615D] uppercase">Revenue</p><p className="font-heading text-lg font-bold text-[#3B5249]">Rs.{pnl.revenue?.total||0}</p></div>
                <div className="bg-[#F9F8F6] rounded-xl p-3 text-center"><p className="text-[10px] text-[#59615D] uppercase">Gross Profit</p><p className="font-heading text-lg font-bold text-[#6B8E6B]">Rs.{pnl.gross_profit||0}</p></div>
                <div className={`rounded-xl p-3 text-center ${(pnl.net_profit||0)>=0?"bg-[#6B8E6B]":"bg-[#B75D69]"}`}><p className="text-[10px] text-white/80 uppercase">Net Profit</p><p className="font-heading text-lg font-bold text-white">Rs.{pnl.net_profit||0}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="border border-[#E5E3DB] rounded-xl p-3"><h4 className="font-medium text-[#6B8E6B] mb-1">Revenue</h4><p>CRM: Rs.{pnl.revenue?.crm_orders||0} ({pnl.revenue?.crm_count||0} orders)</p>{Object.entries(pnl.revenue?.external||{}).map(([k,v])=>(<p key={k} className="capitalize">{k}: Rs.{v.net_received||0} ({v.count})</p>))}</div>
                <div className="border border-[#E5E3DB] rounded-xl p-3"><h4 className="font-medium text-[#B75D69] mb-1">Expenses</h4><p>Salaries: Rs.{pnl.expenses?.salary||0}</p><p>Commissions: Rs.{pnl.expenses?.commissions||0}</p>{Object.entries(pnl.expenses?.by_category||{}).map(([k,v])=>(<p key={k} className="capitalize">{k}: Rs.{v}</p>))}</div>
              </div>
            </>) : <p className="text-center py-6 text-[#59615D] text-sm">No data</p>}
          </div></TabsContent>

          {/* FUND REQUESTS */}
          <TabsContent value="funds" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
            <h3 className="font-heading text-lg font-medium mb-4">Fund Requests</h3>
            {fundRequests.length===0?<p className="text-center py-6 text-[#59615D] text-sm">No fund requests</p>:
            <div className="space-y-2">{fundRequests.map(f=>(<div key={f.id} className="border border-[#E5E3DB] rounded-xl p-3 flex flex-col sm:flex-row justify-between gap-2"><div><p className="font-medium text-sm">Rs.{f.amount} - {f.category}</p><p className="text-xs text-[#59615D]">{f.requested_by_name} ({f.requested_by_role?.replace(/_/g," ")}) | {f.reason}</p></div><div className="flex gap-2 items-center"><Badge className={`text-[9px] ${f.status==="approved"?"bg-green-100 text-green-800":f.status==="rejected"?"bg-red-100 text-red-800":"bg-yellow-100 text-yellow-800"}`}>{f.status}</Badge>{f.status==="pending"&&<Select onValueChange={async(v)=>{try{await axios.put(`${API}/fund-requests/${f.id}/approve`,{status:"approved",debit_from:v});toast.success(`Approved from ${v}`);fetchData();}catch{toast.error("Failed");}}}><SelectTrigger className="h-7 w-28 text-[10px] rounded-full"><SelectValue placeholder="Approve from"/></SelectTrigger><SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="bank">Bank</SelectItem></SelectContent></Select>}</div></div>))}</div>}
          </div></TabsContent>

          {/* CASH HOLDERS */}
          <TabsContent value="cashholders" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-heading text-lg font-medium">Cash Held by Employees</h3>
              <Select onValueChange={async(uid)=>{const u=allUsers.find(x=>x.id===uid);if(!u)return;const amt=prompt(`Assign cash to ${u.name} (Rs.):`);if(!amt)return;try{await axios.post(`${API}/finance/assign-cash`,{user_id:uid,user_name:u.name,amount:Number(amt)});toast.success(`Rs.${amt} assigned`);fetchData();}catch{toast.error("Failed");}}}><SelectTrigger className="h-8 w-40 text-xs rounded-full"><SelectValue placeholder="Assign cash to..."/></SelectTrigger><SelectContent>{allUsers.filter(u=>u.role!=="admin").map(u=><SelectItem key={u.id} value={u.id} className="text-xs">{u.name} ({u.role?.replace(/_/g," ")})</SelectItem>)}</SelectContent></Select>
            </div>
            {cashHolders.filter(h=>h.amount>0).length===0?<p className="text-center py-6 text-[#59615D] text-sm">No cash held by employees</p>:
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{cashHolders.filter(h=>h.amount>0).map(h=>(<div key={h.user_id} className="border border-[#E5E3DB] rounded-xl p-4 flex justify-between items-center"><div><p className="font-heading font-medium">{h.user_name}</p><p className="font-heading text-xl font-bold text-[#A66E4E]">Rs.{h.amount}</p><p className="text-[10px] text-[#59615D]">{h.updated_at?.slice(0,10)}</p></div><Button size="sm" variant="outline" className="rounded-full text-xs" onClick={async()=>{const amt=prompt(`Cash returned by ${h.user_name} (Rs.):`);if(!amt)return;try{await axios.post(`${API}/finance/return-cash`,{user_id:h.user_id,user_name:h.user_name,amount:Number(amt)});toast.success("Returned");fetchData();}catch{toast.error("Failed");}}}>Return</Button></div>))}</div>}
            <div className="mt-4 bg-[#F9F8F6] rounded-xl p-3 text-center"><p className="text-xs text-[#59615D]">Total Cash with Employees</p><p className="font-heading text-lg font-bold text-[#A66E4E]">Rs.{cashHolders.reduce((s,h)=>s+(h.amount>0?h.amount:0),0)}</p></div>
          </div></TabsContent>

          <TabsContent value="payroll" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] overflow-x-auto"><div className="p-5 border-b border-[#E5E3DB]"><h3 className="font-heading text-lg font-medium">Payroll</h3></div>
            {payroll.length===0?<div className="p-10 text-center text-[#59615D]">No payroll records</div>:
            <table className="w-full"><thead><tr className="border-b bg-[#F9F8F6]">{["Employee","Role","Month","Basic","Bonus","Deductions","Commission","Net","Status","Action"].map(h=><th key={h} className="text-left p-3 text-xs uppercase text-[#59615D]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[#E5E3DB]">{payroll.map(p=>(<tr key={p.id}><td className="p-3 text-sm">{p.user_name}</td><td className="p-3"><Badge variant="outline" className="text-[10px]">{p.user_role}</Badge></td><td className="p-3 text-sm">{p.month}/{p.year}</td><td className="p-3 text-sm">Rs.{p.basic_salary}</td><td className="p-3 text-sm text-[#6B8E6B]">+Rs.{p.bonus}</td><td className="p-3 text-sm text-[#B75D69]">-Rs.{p.deductions}</td><td className="p-3 text-sm">Rs.{p.commission}</td><td className="p-3 text-sm font-semibold text-[#3B5249]">Rs.{p.net_salary}</td><td className="p-3"><Badge className={`text-[10px] ${p.status==="processed"?"bg-green-100 text-green-800":"bg-yellow-100 text-yellow-800"}`}>{p.status}</Badge></td><td className="p-3">{p.status==="pending"&&<Button size="sm" className="rounded-full text-xs bg-[#6B8E6B] text-white" onClick={()=>processPayroll(p.id)}>Process</Button>}</td></tr>))}</tbody></table>}
          </div></TabsContent>

          {/* COMMISSIONS */}
          <TabsContent value="commissions" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
            <h3 className="font-heading text-lg font-medium mb-4">Commission Overview</h3>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-[#F9F8F6] rounded-xl p-3 text-center"><p className="text-[10px] text-[#59615D] uppercase">Today</p><p className="font-heading text-lg font-bold text-[#B75D69]">Rs.{commSummary.total_today||0}</p></div>
              <div className="bg-[#F9F8F6] rounded-xl p-3 text-center"><p className="text-[10px] text-[#59615D] uppercase">This Week</p><p className="font-heading text-lg font-bold text-[#D4A373]">Rs.{commSummary.total_weekly||0}</p></div>
              <div className="bg-[#F9F8F6] rounded-xl p-3 text-center"><p className="text-[10px] text-[#59615D] uppercase">This Month</p><p className="font-heading text-lg font-bold text-[#3B5249]">Rs.{commSummary.total_monthly||0}</p></div>
            </div>
            {commSummary.agents?.length===0?<p className="text-center py-6 text-[#59615D] text-sm">No commission data</p>:
            <div className="space-y-2">{commSummary.agents?.map(a=>(
              <div key={a.user_id} className="border border-[#E5E3DB] rounded-xl p-3 flex justify-between items-center">
                <div><p className="font-heading font-medium text-sm">{a.user_name}</p><Badge variant="outline" className="text-[9px] capitalize">{a.user_role?.replace(/_/g," ")}</Badge></div>
                <div className="text-right"><p className="font-heading font-semibold text-[#3B5249]">Rs.{a.total}</p><div className="text-[10px]"><span className="text-[#D4A373]">Pending: Rs.{a.pending}</span> | <span className="text-[#6B8E6B]">Paid: Rs.{a.paid}</span></div></div>
              </div>
            ))}</div>}
          </div></TabsContent>

          {/* TRANSACTIONS */}
          <TabsContent value="transactions" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
            <div className="flex justify-between mb-4"><h3 className="font-heading text-lg font-medium">Transaction History ({finLedger.length})</h3><Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={()=>setShowFinTxn(true)}><Plus className="w-3 h-3 mr-1"/>Add Entry</Button></div>
            {finLedger.length===0?<p className="text-center py-6 text-[#59615D] text-sm">No transactions</p>:
            <div className="space-y-2 max-h-[500px] overflow-y-auto">{finLedger.map(t=>(
              <div key={t.id} className="border border-[#E5E3DB] rounded-lg p-3 flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2"><Badge className={`text-[9px] ${t.type==="credit"?"bg-green-100 text-green-800":t.type==="debit"?"bg-red-100 text-red-800":"bg-blue-100 text-blue-800"}`}>{t.type?.toUpperCase()}</Badge><Badge variant="outline" className="text-[9px] capitalize">{t.method}</Badge><Badge variant="outline" className="text-[9px] capitalize">{t.category?.replace(/_/g," ")}</Badge></div>
                  <p className="text-xs text-[#59615D] mt-1">{t.description}</p>
                  <p className="text-[10px] text-[#59615D]">{t.created_at?.slice(0,16).replace("T"," ")}</p>
                </div>
                <p className={`font-heading font-semibold ${t.type==="credit"?"text-[#6B8E6B]":"text-[#B75D69]"}`}>{t.type==="credit"?"+":"-"}Rs.{t.amount}</p>
              </div>
            ))}</div>}
          </div></TabsContent>

          {/* GST */}
          <TabsContent value="gst" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
            <div className="flex justify-between mb-4"><h3 className="font-heading text-lg font-medium">GST/Tax Tracking</h3><Button size="sm" className="rounded-full bg-[#3B5249] text-white" onClick={()=>setShowGST(true)} data-testid="add-gst-btn"><Plus className="w-3 h-3 mr-1"/>Add</Button></div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-green-50 rounded-xl p-3"><p className="text-[10px] text-green-700 uppercase">Output GST (Sales)</p><p className="font-heading text-xl font-bold text-green-800">Rs.{gstSummary.output_gst||0}</p></div>
              <div className="bg-blue-50 rounded-xl p-3"><p className="text-[10px] text-blue-700 uppercase">Input GST (Purchases)</p><p className="font-heading text-xl font-bold text-blue-800">Rs.{gstSummary.input_gst||0}</p></div>
              <div className="bg-yellow-50 rounded-xl p-3"><p className="text-[10px] text-yellow-700 uppercase">Net Payable</p><p className="font-heading text-xl font-bold text-yellow-800">Rs.{gstSummary.net_payable||0}</p></div>
            </div>
            {gstEntries.length === 0 ? <p className="text-center py-4 text-[#59615D] text-sm">No GST entries</p> :
              <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="bg-[#F9F8F6]">{["Date","Type","Amount","Rate%","GST","Ref"].map(h=><th key={h} className="p-2 text-left text-[9px] uppercase">{h}</th>)}</tr></thead>
                <tbody>{gstEntries.map(g=>(<tr key={g.id} className="border-b"><td className="p-2">{g.date}</td><td className="p-2"><Badge className="text-[8px] capitalize">{g.type}</Badge></td><td className="p-2">Rs.{g.amount}</td><td className="p-2">{g.rate}%</td><td className="p-2 font-medium">Rs.{g.gst_amount}</td><td className="p-2 text-[10px]">{g.ref_no}</td></tr>))}</tbody></table></div>}
          </div></TabsContent>

          {/* VENDORS */}
          <TabsContent value="vendors" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
            <div className="flex justify-between mb-4"><h3 className="font-heading text-lg font-medium">Vendor Ledger</h3><Button size="sm" className="rounded-full bg-[#3B5249] text-white" onClick={()=>setShowVendor(true)} data-testid="add-vendor-btn"><Plus className="w-3 h-3 mr-1"/>Add Vendor</Button></div>
            {vendors.length === 0 ? <p className="text-center py-4 text-[#59615D] text-sm">No vendors</p> :
              <div className="space-y-2">{vendors.map(v=>(
                <div key={v.id} className="border border-[#E5E3DB] rounded-xl p-3 flex justify-between" data-testid={`vendor-${v.id}`}>
                  <div><p className="font-medium text-sm">{v.name} <Badge variant="outline" className="text-[8px] ml-1">{v.category}</Badge></p>
                    <p className="text-[10px] text-[#59615D]">{v.phone || v.contact} | GST: {v.gst_number || '—'}</p></div>
                  <div className="text-right"><p className="text-[9px] text-[#59615D]">BALANCE</p><p className={`font-heading text-lg font-semibold ${v.balance>=0?'text-green-700':'text-red-700'}`}>Rs.{v.balance||0}</p></div>
                </div>
              ))}</div>}
          </div></TabsContent>

          {/* RECURRING */}
          <TabsContent value="recurring" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
            <div className="flex justify-between mb-4"><h3 className="font-heading text-lg font-medium">Recurring Expenses</h3><Button size="sm" className="rounded-full bg-[#3B5249] text-white" onClick={()=>setShowRecurring(true)} data-testid="add-recurring-btn"><Plus className="w-3 h-3 mr-1"/>Add</Button></div>
            {recurring.length === 0 ? <p className="text-center py-4 text-[#59615D] text-sm">No recurring expenses</p> :
              <div className="space-y-2">{recurring.map(r=>(
                <div key={r.id} className="border border-[#E5E3DB] rounded-xl p-3 flex justify-between">
                  <div><p className="font-medium text-sm">{r.name} <Badge variant="outline" className="text-[8px] ml-1 capitalize">{r.category}</Badge></p>
                    <p className="text-[10px] text-[#59615D]">{r.frequency} | Next due: {r.next_due_date || '—'}</p></div>
                  <div className="flex items-center gap-2"><p className="font-heading text-lg font-semibold text-[#3B5249]">Rs.{r.amount}</p>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400" onClick={async()=>{if(window.confirm("Delete?")){await axios.delete(`${API}/finance/recurring/${r.id}`); fetchData();}}}>×</Button></div>
                </div>
              ))}</div>}
          </div></TabsContent>

          {/* CLV */}
          <TabsContent value="clv" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
            <h3 className="font-heading text-lg font-medium mb-4">Customer Lifetime Value (Top 50)</h3>
            <div className="bg-[#F9F8F6] rounded-xl p-3 mb-4 text-center"><p className="text-xs text-[#59615D] uppercase">Average CLV</p><p className="font-heading text-2xl font-bold text-[#3B5249]">Rs.{clv.avg_clv||0}</p></div>
            {(clv.top_customers||[]).length === 0 ? <p className="text-center py-4 text-[#59615D] text-sm">No customer data</p> :
              <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="bg-[#F9F8F6]">{["#","Customer","Phone","Orders","Total Spent"].map(h=><th key={h} className="p-2 text-left text-[9px] uppercase">{h}</th>)}</tr></thead>
                <tbody>{(clv.top_customers||[]).slice(0,50).map((c,i)=>(<tr key={i} className="border-b"><td className="p-2 font-bold">{i+1}</td><td className="p-2 font-medium">{c.name||'—'}</td><td className="p-2">{c.phone}</td><td className="p-2">{c.orders}</td><td className="p-2 font-semibold text-[#3B5249]">Rs.{c.total_spent}</td></tr>))}</tbody></table></div>}
          </div></TabsContent>
          <TabsContent value="mysheet" className="animate-fade-in"><DailyTaskSheet titleSuffix="Finance Manager" /></TabsContent>
        </Tabs>
      </div>

      {/* GST Dialog */}
      <Dialog open={showGST} onOpenChange={setShowGST}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Add GST Entry</DialogTitle></DialogHeader><div className="space-y-3">
        <Select value={gstForm.type} onValueChange={v=>setGstForm(f=>({...f,type:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="sale">Sale (Output GST)</SelectItem><SelectItem value="purchase">Purchase (Input GST)</SelectItem></SelectContent></Select>
        <Input type="number" placeholder="Amount" value={gstForm.amount} onChange={e=>setGstForm(f=>({...f,amount:e.target.value}))} className="rounded-xl" data-testid="gst-amount-input"/>
        <Input type="number" placeholder="Rate %" value={gstForm.rate} onChange={e=>setGstForm(f=>({...f,rate:e.target.value}))} className="rounded-xl"/>
        <Input placeholder="Reference No." value={gstForm.ref_no} onChange={e=>setGstForm(f=>({...f,ref_no:e.target.value}))} className="rounded-xl"/>
        <Input type="date" value={gstForm.date} onChange={e=>setGstForm(f=>({...f,date:e.target.value}))} className="rounded-xl"/>
        <Button onClick={handleAddGst} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="gst-submit-btn">Add</Button>
      </div></DialogContent></Dialog>

      {/* Vendor Dialog */}
      <Dialog open={showVendor} onOpenChange={setShowVendor}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Add Vendor</DialogTitle></DialogHeader><div className="space-y-3">
        <Input placeholder="Name" value={vendorForm.name} onChange={e=>setVendorForm(f=>({...f,name:e.target.value}))} className="rounded-xl" data-testid="vendor-name-input"/>
        <Input placeholder="Contact Person" value={vendorForm.contact} onChange={e=>setVendorForm(f=>({...f,contact:e.target.value}))} className="rounded-xl"/>
        <Input placeholder="Phone" value={vendorForm.phone} onChange={e=>setVendorForm(f=>({...f,phone:e.target.value}))} className="rounded-xl"/>
        <Input placeholder="GST Number" value={vendorForm.gst_number} onChange={e=>setVendorForm(f=>({...f,gst_number:e.target.value}))} className="rounded-xl"/>
        <Select value={vendorForm.category} onValueChange={v=>setVendorForm(f=>({...f,category:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent>{["supplier","logistics","service","raw_material","other"].map(c=><SelectItem key={c} value={c} className="capitalize">{c.replace("_"," ")}</SelectItem>)}</SelectContent></Select>
        <Input type="number" placeholder="Opening Balance" value={vendorForm.balance} onChange={e=>setVendorForm(f=>({...f,balance:e.target.value}))} className="rounded-xl"/>
        <Button onClick={handleAddVendor} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="vendor-submit-btn">Add</Button>
      </div></DialogContent></Dialog>

      {/* Recurring Dialog */}
      <Dialog open={showRecurring} onOpenChange={setShowRecurring}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Add Recurring Expense</DialogTitle></DialogHeader><div className="space-y-3">
        <Input placeholder="Name (e.g., Office Rent)" value={recurringForm.name} onChange={e=>setRecurringForm(f=>({...f,name:e.target.value}))} className="rounded-xl" data-testid="recurring-name-input"/>
        <Select value={recurringForm.category} onValueChange={v=>setRecurringForm(f=>({...f,category:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent>{["rent","utilities","subscription","insurance","loan","internet","other"].map(c=><SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent></Select>
        <Input type="number" placeholder="Amount" value={recurringForm.amount} onChange={e=>setRecurringForm(f=>({...f,amount:e.target.value}))} className="rounded-xl"/>
        <Select value={recurringForm.frequency} onValueChange={v=>setRecurringForm(f=>({...f,frequency:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent>{["daily","weekly","monthly","quarterly","yearly"].map(f=><SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>)}</SelectContent></Select>
        <Input type="date" placeholder="Next Due Date" value={recurringForm.next_due_date} onChange={e=>setRecurringForm(f=>({...f,next_due_date:e.target.value}))} className="rounded-xl"/>
        <Button onClick={handleAddRecurring} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="recurring-submit-btn">Add</Button>
      </div></DialogContent></Dialog>
      {/* Payment Proof Viewer */}
      <Dialog open={showProof} onOpenChange={setShowProof}><DialogContent className="rounded-2xl max-w-lg" data-testid="proof-viewer-dialog"><DialogHeader><DialogTitle className="font-heading">Payment Proof</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {proofPath ? (
            <div className="space-y-3">
              <div className="bg-[#F9F8F6] rounded-xl overflow-hidden">
                <img src={`${process.env.REACT_APP_BACKEND_URL}/api/files/${proofPath}`} alt="Payment proof" className="w-full max-h-96 object-contain" onError={(e)=>{e.target.style.display='none';e.target.nextSibling.style.display='block';}} data-testid="proof-image"/>
                <p className="text-center py-8 text-[#59615D] text-sm hidden">Unable to load image</p>
              </div>
              <div className="flex gap-2">
                <a href={`${process.env.REACT_APP_BACKEND_URL}/api/files/${proofPath}`} target="_blank" rel="noreferrer" className="flex-1">
                  <Button variant="outline" className="w-full rounded-full text-xs"><ExternalLink className="w-3 h-3 mr-1"/>Open in New Tab</Button>
                </a>
              </div>
              <p className="text-xs text-[#59615D] break-all">Path: {proofPath}</p>
            </div>
          ) : <p className="text-center py-8 text-[#59615D]">No proof available</p>}
        </div>
      </DialogContent></Dialog>

      {/* Add Expense Dialog */}
      <Dialog open={showAddExpense} onOpenChange={setShowAddExpense}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Add Expense</DialogTitle></DialogHeader><div className="space-y-3">
        <div><Label className="text-xs font-medium">Title</Label><Input value={expForm.title} onChange={e=>setExpForm(f=>({...f,title:e.target.value}))} placeholder="Expense title" className="rounded-xl"/></div>
        <div><Label className="text-xs font-medium">Amount (Rs.)</Label><Input type="number" value={expForm.amount} onChange={e=>setExpForm(f=>({...f,amount:e.target.value}))} className="rounded-xl"/></div>
        <div><Label className="text-xs font-medium">Category</Label><Select value={expForm.category} onValueChange={v=>setExpForm(f=>({...f,category:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent>{["general","marketing","travel","office","salary","inventory"].map(c=><SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent></Select></div>
        <div><Label className="text-xs font-medium">Description</Label><Textarea value={expForm.description} onChange={e=>setExpForm(f=>({...f,description:e.target.value}))} className="rounded-xl"/></div>
        <Button onClick={handleAddExpense} className="w-full rounded-full bg-[#3B5249] text-white">Add Expense</Button>
      </div></DialogContent></Dialog>

      {/* Finance Transaction Dialog */}
      <Dialog open={showFinTxn} onOpenChange={setShowFinTxn}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Record Transaction</DialogTitle></DialogHeader><div className="space-y-3">
        <div><Label className="text-xs font-medium">Type</Label><Select value={finTxnForm.type} onValueChange={v=>setFinTxnForm(f=>({...f,type:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="credit">Credit (Money In)</SelectItem><SelectItem value="debit">Debit (Money Out)</SelectItem></SelectContent></Select></div>
        <div><Label className="text-xs font-medium">Amount (Rs.)</Label><Input type="number" value={finTxnForm.amount} onChange={e=>setFinTxnForm(f=>({...f,amount:Number(e.target.value)}))} className="rounded-xl"/></div>
        <div><Label className="text-xs font-medium">Method</Label><Select value={finTxnForm.method} onValueChange={v=>setFinTxnForm(f=>({...f,method:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="bank">Bank</SelectItem></SelectContent></Select></div>
        <div><Label className="text-xs font-medium">Description</Label><Input value={finTxnForm.description} onChange={e=>setFinTxnForm(f=>({...f,description:e.target.value}))} placeholder="Transaction details" className="rounded-xl"/></div>
        <Button onClick={handleFinTxn} className="w-full rounded-full bg-[#3B5249] text-white">Record</Button>
      </div></DialogContent></Dialog>

      {/* REVENUE ENTRY DIALOG */}
      <Dialog open={showRevEntry} onOpenChange={setShowRevEntry}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Add Revenue Entry</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Platform</Label><Select value={revForm.platform} onValueChange={v=>setRevForm(f=>({...f,platform:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="amazon">Amazon</SelectItem><SelectItem value="flipkart">Flipkart</SelectItem><SelectItem value="website">Website</SelectItem><SelectItem value="offline">Offline</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select></div>
          <div><Label className="text-xs">Sale Amount</Label><Input type="number" value={revForm.sale_amount} onChange={e=>setRevForm(f=>({...f,sale_amount:Number(e.target.value)}))} className="rounded-xl"/></div>
          <div><Label className="text-xs">Platform Fee</Label><Input type="number" value={revForm.platform_fee} onChange={e=>setRevForm(f=>({...f,platform_fee:Number(e.target.value)}))} className="rounded-xl"/></div>
          <div><Label className="text-xs">Shipping Cost</Label><Input type="number" value={revForm.shipping_cost} onChange={e=>setRevForm(f=>({...f,shipping_cost:Number(e.target.value)}))} className="rounded-xl"/></div>
          <div><Label className="text-xs">Order Ref</Label><Input value={revForm.order_ref} onChange={e=>setRevForm(f=>({...f,order_ref:e.target.value}))} className="rounded-xl"/></div>
          <div><Label className="text-xs">Date</Label><Input type="date" value={revForm.date} onChange={e=>setRevForm(f=>({...f,date:e.target.value}))} className="rounded-xl"/></div>
          <div className="bg-[#F9F8F6] rounded-xl p-2 text-center"><p className="text-xs text-[#59615D]">Net</p><p className="font-heading text-lg font-bold text-[#3B5249]">Rs.{revForm.sale_amount-revForm.platform_fee-revForm.shipping_cost-(revForm.settlement_charge||0)}</p></div>
          <Button onClick={async()=>{try{await axios.post(`${API}/revenue-entries`,revForm);toast.success("Added!");setShowRevEntry(false);fetchData();}catch(e){toast.error(e.response?.data?.detail||"Failed");}}} className="w-full rounded-full bg-[#3B5249] text-white">Add Entry</Button>
        </div>
      </DialogContent></Dialog>
    </div>
  );
}
