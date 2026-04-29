import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DailyTaskSheet from "@/components/DailyTaskSheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LogOut, Loader2, ShoppingBag, IndianRupee, Users, Phone, Plus, TrendingUp, ClipboardList } from "lucide-react";
import RoleGuidelines from "../components/RoleGuidelines";
import AttendanceCheckIn from "../components/AttendanceCheckIn";
import NotificationBell from "../components/NotificationBell";

const API = "/api";
const MONTHS = [{v:"1",l:"Jan"},{v:"2",l:"Feb"},{v:"3",l:"Mar"},{v:"4",l:"Apr"},{v:"5",l:"May"},{v:"6",l:"Jun"},{v:"7",l:"Jul"},{v:"8",l:"Aug"},{v:"9",l:"Sep"},{v:"10",l:"Oct"},{v:"11",l:"Nov"},{v:"12",l:"Dec"}];

export default function AssistantManagerDashboard({ type = "district" }) {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const isField = type === "district";
  const roleLabel = isField ? "Assistant District Manager" : "Assistant Sales Manager";
  const teamLabel = isField ? "Agents" : "Telecallers";
  const guideRole = isField ? "district_manager" : "sales_manager";

  const [members, setMembers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [followUps, setFollowUps] = useState({repeat_due:[],repeat_upcoming:[],relationship_due:[],relationship_upcoming:[],total_repeat:0,total_relationship:0});
  const [relCalls, setRelCalls] = useState({calls:[],stats:{}});
  const [tasks, setTasks] = useState([]);
  const [instructions, setInstructions] = useState([]);
  const [fundRequests, setFundRequests] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState((new Date().getMonth()+1).toString());
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [showOrder, setShowOrder] = useState(false);
  const [showTask, setShowTask] = useState(false);
  const [showFund, setShowFund] = useState(false);
  const [orderForm, setOrderForm] = useState({customer_name:"",customer_phone:"",products:[],total_amount:0,payment_type:"cod"});
  const [taskForm, setTaskForm] = useState({title:"",description:"",assigned_to:"",priority:"medium"});
  const [fundForm, setFundForm] = useState({amount:0,purpose:"",method:"cash"});

  const fetchData = useCallback(async () => {
    try {
      const fallbackFollowUps = {repeat_due:[],repeat_upcoming:[],relationship_due:[],relationship_upcoming:[],total_repeat:0,total_relationship:0};
      const [tm, o, c, fu, rc, t, i, fr, p] = await Promise.all([
        axios.get(`${API}/team-members`).catch(()=>({data:{members:[]}})),
        axios.get(`${API}/orders`).catch(()=>({data:{orders:[]}})),
        axios.get(`${API}/commissions/all`).catch(()=>({data:{commissions:[]}})),
        axios.get(`${API}/leads/follow-ups`).catch(()=>({data:fallbackFollowUps})),
        axios.get(`${API}/relationship-calls`).catch(()=>({data:{calls:[],stats:{}}})),
        axios.get(`${API}/tasks`).catch(()=>({data:{tasks:[]}})),
        axios.get(`${API}/instructions`).catch(()=>({data:{instructions:[]}})),
        axios.get(`${API}/fund-requests`).catch(()=>({data:{fund_requests:[]}})),
        axios.get(`${API}/products`).catch(()=>({data:{products:[]}}))
      ]);
      setMembers(tm.data.members||[]); setOrders(o.data.orders||[]);
      setCommissions(c.data.commissions||[]);
      setFollowUps({...fallbackFollowUps, ...(fu.data||{})});
      setRelCalls(rc.data||{calls:[],stats:{}}); setTasks(t.data.tasks||[]);
      setInstructions(i.data.instructions||[]); setFundRequests(fr.data.fund_requests||[]);
      setProducts(p.data.products||[]);
    } catch {}
    setLoading(false);
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const createOrder = async () => {
    if (!orderForm.customer_name||!orderForm.customer_phone) return toast.error("Fill customer details");
    try { await axios.post(`${API}/orders`, orderForm); toast.success("Order created!"); setShowOrder(false); fetchData(); } catch (e) { toast.error(e.response?.data?.detail||"Failed"); }
  };
  const createTask = async () => {
    if (!taskForm.title) return toast.error("Title required");
    try { await axios.post(`${API}/tasks`, taskForm); toast.success("Task created!"); setShowTask(false); fetchData(); } catch { toast.error("Failed"); }
  };
  const requestFund = async () => {
    if (!fundForm.amount) return toast.error("Amount required");
    try { await axios.post(`${API}/fund-requests`, fundForm); toast.success("Fund requested!"); setShowFund(false); fetchData(); } catch { toast.error("Failed"); }
  };
  const markCalled = async (lid) => {
    try { await axios.put(`${API}/relationship-calls/${lid}/mark-called`, {remarks:"Called"}); toast.success("Marked"); fetchData(); } catch { toast.error("Failed"); }
  };

  const logout = () => { localStorage.clear(); navigate("/login"); };
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F9F8F6]"><Loader2 className="w-8 h-8 animate-spin text-[#3B5249]" /></div>;

  const monthOrders = orders.filter(o => { const m = o.created_at?.slice(5,7)?.replace(/^0/,""); const y = o.created_at?.slice(0,4); return m === month && y === year; });
  const monthComm = commissions.filter(c => { const m = c.created_at?.slice(5,7)?.replace(/^0/,""); const y = c.created_at?.slice(0,4); return m === month && y === year; });
  const totalRevenue = monthOrders.filter(o=>o.status==="delivered").reduce((s,o)=>s+(o.total_amount||0),0);

  return (
    <div className="min-h-screen bg-[#F9F8F6]" data-testid="assistant-manager-dashboard">
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#F9F8F6]/80 border-b border-[#E5E3DB]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div><h1 className="font-heading text-xl font-medium text-[#2C3531]">Celesta <span className="text-[#3B5249] font-semibold">Glow</span></h1><p className="text-xs text-[#59615D] uppercase tracking-[0.15em]">{roleLabel} - {user.name}</p></div>
          <div className="flex items-center gap-2"><NotificationBell /><AttendanceCheckIn /><Button variant="outline" onClick={logout} className="rounded-full border-[#E5E3DB] text-sm"><LogOut className="w-4 h-4 mr-1"/>Logout</Button></div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <RoleGuidelines role={guideRole} titleOverride={roleLabel} missionOverride={isField ? "Deputy to the District Manager — coordinate field agents, monitor coverage, fill in when DM is away" : "Deputy to the Sales Manager — support telecallers, monitor pipeline, step in for SM when needed"} />
        {/* Month Filter */}
        <div className="flex gap-1 mb-4 flex-wrap items-center">
          <span className="text-xs text-[#59615D] font-medium mr-1">{MONTHS.find(m=>m.v===month)?.l} {year}</span>
          {MONTHS.map(m=>(<button key={m.v} onClick={()=>setMonth(m.v)} className={`px-2 py-0.5 rounded-full text-[9px] font-medium ${month===m.v?"bg-[#3B5249] text-white":"bg-white border border-[#E5E3DB] text-[#59615D]"}`}>{m.l}</button>))}
          <Select value={year} onValueChange={setYear}><SelectTrigger className="w-16 h-6 text-[10px] rounded-full ml-1"><SelectValue/></SelectTrigger><SelectContent>{["2025","2026","2027"].map(y=><SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent></Select>
        </div>
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-4"><Users className="w-4 h-4 text-[#3B5249] mb-1"/><p className="font-heading text-xl font-bold">{members.length}</p><p className="text-[10px] text-[#59615D] uppercase">{teamLabel}</p></div>
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-4"><ShoppingBag className="w-4 h-4 text-[#D4A373] mb-1"/><p className="font-heading text-xl font-bold">{monthOrders.length}</p><p className="text-[10px] text-[#59615D] uppercase">Orders</p></div>
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-4"><IndianRupee className="w-4 h-4 text-[#6B8E6B] mb-1"/><p className="font-heading text-xl font-bold">Rs.{totalRevenue}</p><p className="text-[10px] text-[#59615D] uppercase">Revenue</p></div>
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-4 border-l-2 border-l-orange-300"><p className="font-heading text-xl font-bold text-orange-600">{relCalls.stats?.pending||0}</p><p className="text-[10px] text-[#59615D] uppercase">Pending Calls</p></div>
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-4"><TrendingUp className="w-4 h-4 text-[#A66E4E] mb-1"/><p className="font-heading text-xl font-bold">Rs.{monthComm.reduce((s,c)=>s+(c.commission_amount||0),0)}</p><p className="text-[10px] text-[#59615D] uppercase">Commission</p></div>
        </div>

        <Tabs defaultValue="team" className="space-y-4">
          <TabsList className="bg-white border border-[#E5E3DB] rounded-full p-1 h-auto flex-wrap gap-0.5">
            {[{v:"team",l:teamLabel},{v:"orders",l:"Orders"},{v:"calls",l:`Today's Calls (${relCalls?.stats?.pending ?? 0})`},{v:"repeat",l:`Repeat (${followUps?.total_repeat ?? 0})`},{v:"commissions",l:"Commissions"},{v:"tasks",l:"Tasks"},{v:"funds",l:"Fund Req"},{v:"mysheet",l:"My Sheet"}].map(t=>(
              <TabsTrigger key={t.v} value={t.v} className="rounded-full text-[10px] data-[state=active]:bg-[#3B5249] data-[state=active]:text-white px-2.5">{t.l}</TabsTrigger>
            ))}
          </TabsList>

          {/* TEAM */}
          <TabsContent value="team"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <h3 className="font-heading text-lg font-medium mb-4">{teamLabel} ({members.length})</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{members.map(m=>(
              <div key={m.id} className="border border-[#E5E3DB] rounded-xl p-3">
                <div className="flex justify-between items-start"><div><p className="font-heading font-medium text-sm">{m.name}</p><p className="text-xs text-[#59615D]">{m.email}</p>{m.phone&&<p className="text-xs text-[#59615D]">{m.phone}</p>}</div>
                  {m.phone&&<a href={`tel:${m.phone}`}><Button size="sm" variant="outline" className="rounded-full h-7 w-7 p-0 border-[#6B8E6B] text-[#6B8E6B]"><Phone className="w-3 h-3"/></Button></a>}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2 text-center">
                  <div className="bg-[#F9F8F6] rounded-lg p-1"><p className="text-[9px] text-[#59615D]">Salary</p><p className="font-semibold text-xs">Rs.{m.salary||0}</p></div>
                  <div className="bg-[#F9F8F6] rounded-lg p-1"><p className="text-[9px] text-[#59615D]">Commission</p><p className="font-semibold text-xs">Rs.{m.commission_earned||0}</p></div>
                </div>
                <Badge variant="outline" className="text-[8px] capitalize mt-1">{m.role?.replace(/_/g," ")}</Badge>
              </div>
            ))}</div>
          </div></TabsContent>

          {/* ORDERS */}
          <TabsContent value="orders"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <div className="flex justify-between mb-4"><h3 className="font-heading text-lg font-medium">Orders ({monthOrders.length})</h3>
              {isField && <Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={()=>setShowOrder(true)}><Plus className="w-3 h-3 mr-1"/>Create Order</Button>}
            </div>
            {monthOrders.length===0?<p className="text-center py-6 text-[#59615D] text-sm">No orders this month</p>:
            <div className="space-y-2">{monthOrders.map(o=>(
              <div key={o.id} className="border border-[#E5E3DB] rounded-lg p-3 flex justify-between items-center">
                <div><p className="font-medium text-xs">{o.customer_name} - {o.customer_phone}</p><p className="text-[10px] text-[#59615D]">{o.created_at?.slice(0,10)}</p></div>
                <div className="flex items-center gap-2"><p className="font-heading font-semibold text-sm">Rs.{o.total_amount}</p><Badge className={`text-[8px] ${o.status==="delivered"?"bg-green-100 text-green-800":o.status==="shipped"?"bg-blue-100 text-blue-800":"bg-yellow-100 text-yellow-800"}`}>{o.status}</Badge></div>
              </div>
            ))}</div>}
          </div></TabsContent>

          {/* TODAY'S CALLS */}
          <TabsContent value="calls"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <h3 className="font-heading text-lg font-medium mb-4">Today's Calls</h3>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center"><p className="font-heading text-xl font-bold text-yellow-700">{relCalls.stats?.pending||0}</p><p className="text-[9px] text-yellow-600 uppercase">Pending</p></div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center"><p className="font-heading text-xl font-bold text-green-700">{relCalls.stats?.called||0}</p><p className="text-[9px] text-green-600 uppercase">Called</p></div>
              <div className="bg-[#F9F8F6] border border-[#E5E3DB] rounded-xl p-3 text-center"><p className="font-heading text-xl font-bold">{relCalls.stats?.total||0}</p><p className="text-[9px] text-[#59615D] uppercase">Total</p></div>
            </div>
            {(relCalls.calls||[]).length===0?<p className="text-center py-6 text-[#59615D] text-sm">No calls due</p>:
            <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b bg-[#F9F8F6]"><th className="p-2 text-left text-[9px]">Customer</th><th className="p-2 text-[9px]">Mobile</th><th className="p-2 text-[9px]">Type</th><th className="p-2 text-[9px]">Due</th><th className="p-2 text-[9px]">Status</th><th className="p-2 text-[9px]">Action</th></tr></thead>
            <tbody>{(relCalls.calls||[]).map(c=>(
              <tr key={c.id} className="border-b border-[#E5E3DB]"><td className="p-2 font-medium">{c.name}</td><td className="p-2"><a href={`tel:${c.phone}`} className="text-[#3B5249] underline">{c.phone}</a></td><td className="p-2"><Badge variant="outline" className="text-[8px] capitalize">{c.type}</Badge></td><td className="p-2">{c.due_date}</td><td className="p-2"><Badge className={`text-[7px] ${c.status==='called'?'bg-green-100 text-green-800':'bg-yellow-100 text-yellow-800'}`}>{c.status}</Badge></td><td className="p-2">{c.status==='pending'&&<Button size="sm" className="rounded-full text-[9px] bg-[#6B8E6B] text-white h-6" onClick={()=>markCalled(c.id)}>Mark Called</Button>}</td></tr>
            ))}</tbody></table></div>}
          </div></TabsContent>

          {/* REPEAT */}
          <TabsContent value="repeat"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <h3 className="font-heading text-lg font-medium mb-4">Repeat Orders & Relationship</h3>
            {followUps.repeat_due?.length>0&&<div className="mb-4"><p className="text-xs font-medium text-[#B75D69] mb-2 uppercase">Repeat Due ({followUps.repeat_due.length})</p><div className="space-y-2">{followUps.repeat_due.map(l=>(<div key={l.id} className="border border-orange-200 bg-orange-50 rounded-xl p-3 flex justify-between items-center"><div><p className="font-medium text-sm">{l.name}</p><p className="text-xs text-[#59615D]">{l.phone_number}</p></div><div className="text-right"><Badge className="bg-orange-100 text-orange-800 text-[9px]">REPEAT DUE</Badge><p className="text-[10px]">{l.next_repeat_order_date}</p></div></div>))}</div></div>}
            {followUps.relationship_due?.length>0&&<div><p className="text-xs font-medium text-pink-600 mb-2 uppercase">Relationship Due ({followUps.relationship_due.length})</p><div className="space-y-2">{followUps.relationship_due.map(l=>(<div key={l.id} className="border border-pink-200 bg-pink-50 rounded-xl p-3 flex justify-between items-center"><div><p className="font-medium text-sm">{l.name}</p><p className="text-xs text-[#59615D]">{l.phone_number}</p></div><Badge className="bg-pink-100 text-pink-800 text-[9px]">RELATIONSHIP</Badge></div>))}</div></div>}
            {!followUps.repeat_due?.length&&!followUps.relationship_due?.length&&<p className="text-center py-6 text-[#59615D] text-sm">No pending follow-ups</p>}
          </div></TabsContent>

          {/* COMMISSIONS */}
          <TabsContent value="commissions"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <h3 className="font-heading text-lg font-medium mb-4">Commissions</h3>
            <div className="bg-[#F9F8F6] rounded-xl p-3 mb-4 text-center"><p className="text-xs text-[#59615D]">This Month Total</p><p className="font-heading text-2xl font-bold text-[#3B5249]">Rs.{monthComm.reduce((s,c)=>s+(c.commission_amount||0),0)}</p></div>
            {monthComm.length===0?<p className="text-center py-4 text-[#59615D] text-sm">No commissions</p>:
            <div className="space-y-1">{monthComm.map(c=>(<div key={c.id} className="border border-[#E5E3DB] rounded-lg p-2 flex justify-between text-xs"><span>{c.user_name} <Badge variant="outline" className="text-[7px]">{c.order_id}</Badge></span><span className="font-semibold text-[#3B5249]">Rs.{c.commission_amount}</span></div>))}</div>}
          </div></TabsContent>

          {/* TASKS */}
          <TabsContent value="tasks"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <div className="flex justify-between mb-4"><h3 className="font-heading text-lg font-medium">Tasks</h3><Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={()=>setShowTask(true)}><Plus className="w-3 h-3 mr-1"/>Create</Button></div>
            {tasks.length===0?<p className="text-center py-6 text-[#59615D] text-sm">No tasks</p>:
            <div className="space-y-2">{tasks.map(t=>(<div key={t.id} className="border border-[#E5E3DB] rounded-lg p-3"><div className="flex justify-between"><p className="font-medium text-xs">{t.title}</p><Badge className={`text-[8px] ${t.status==='completed'?'bg-green-100 text-green-800':'bg-yellow-100 text-yellow-800'}`}>{t.status}</Badge></div><p className="text-[10px] text-[#59615D]">{t.description}</p></div>))}</div>}
            {instructions.length>0&&<><h4 className="font-heading text-sm font-medium mt-4 mb-2">Instructions</h4>{instructions.map(i=>(<div key={i.id} className="border border-[#E5E3DB] rounded-lg p-3 mb-1"><p className="font-medium text-xs">{i.title}</p><p className="text-[10px] text-[#59615D]">{i.content}</p></div>))}</>}
          </div></TabsContent>

          {/* FUND REQUEST */}
          <TabsContent value="funds"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <div className="flex justify-between mb-4"><h3 className="font-heading text-lg font-medium">Fund Requests</h3><Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={()=>setShowFund(true)}><Plus className="w-3 h-3 mr-1"/>Request Fund</Button></div>
            {fundRequests.length===0?<p className="text-center py-6 text-[#59615D] text-sm">No fund requests</p>:
            <div className="space-y-2">{fundRequests.map(f=>(<div key={f.id} className="border border-[#E5E3DB] rounded-lg p-3 flex justify-between"><div><p className="font-medium text-xs">Rs.{f.amount}</p><p className="text-[10px] text-[#59615D]">{f.purpose} | {f.created_at?.slice(0,10)}</p></div><Badge className={`text-[8px] ${f.status==='approved'?'bg-green-100 text-green-800':f.status==='rejected'?'bg-red-100 text-red-800':'bg-yellow-100 text-yellow-800'}`}>{f.status}</Badge></div>))}</div>}
          </div></TabsContent>
          <TabsContent value="mysheet" className="animate-fade-in"><DailyTaskSheet titleSuffix="Assistant Manager" /></TabsContent>
        </Tabs>
      </div>

      {/* CREATE ORDER */}
      <Dialog open={showOrder} onOpenChange={setShowOrder}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Create Order</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Customer Name</Label><Input value={orderForm.customer_name} onChange={e=>setOrderForm(f=>({...f,customer_name:e.target.value}))} className="rounded-xl"/></div>
          <div><Label className="text-xs">Customer Phone</Label><Input value={orderForm.customer_phone} onChange={e=>setOrderForm(f=>({...f,customer_phone:e.target.value}))} className="rounded-xl"/></div>
          <div><Label className="text-xs">Total Amount</Label><Input type="number" value={orderForm.total_amount} onChange={e=>setOrderForm(f=>({...f,total_amount:Number(e.target.value)}))} className="rounded-xl"/></div>
          <div><Label className="text-xs">Payment Type</Label><Select value={orderForm.payment_type} onValueChange={v=>setOrderForm(f=>({...f,payment_type:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="cod">COD</SelectItem><SelectItem value="upi">UPI</SelectItem><SelectItem value="online">Online</SelectItem></SelectContent></Select></div>
          <Button onClick={createOrder} className="w-full rounded-full bg-[#3B5249] text-white">Create Order</Button>
        </div>
      </DialogContent></Dialog>

      {/* CREATE TASK */}
      <Dialog open={showTask} onOpenChange={setShowTask}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Create Task</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Title</Label><Input value={taskForm.title} onChange={e=>setTaskForm(f=>({...f,title:e.target.value}))} className="rounded-xl"/></div>
          <div><Label className="text-xs">Description</Label><Textarea value={taskForm.description} onChange={e=>setTaskForm(f=>({...f,description:e.target.value}))} className="rounded-xl"/></div>
          <div><Label className="text-xs">Assign To</Label><Select value={taskForm.assigned_to} onValueChange={v=>setTaskForm(f=>({...f,assigned_to:v}))}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Select"/></SelectTrigger><SelectContent>{members.map(m=><SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent></Select></div>
          <Button onClick={createTask} className="w-full rounded-full bg-[#3B5249] text-white">Create</Button>
        </div>
      </DialogContent></Dialog>

      {/* REQUEST FUND */}
      <Dialog open={showFund} onOpenChange={setShowFund}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Request Fund</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Amount</Label><Input type="number" value={fundForm.amount} onChange={e=>setFundForm(f=>({...f,amount:Number(e.target.value)}))} className="rounded-xl"/></div>
          <div><Label className="text-xs">Purpose</Label><Input value={fundForm.purpose} onChange={e=>setFundForm(f=>({...f,purpose:e.target.value}))} className="rounded-xl"/></div>
          <Button onClick={requestFund} className="w-full rounded-full bg-[#3B5249] text-white">Request</Button>
        </div>
      </DialogContent></Dialog>
    </div>
  );
}
