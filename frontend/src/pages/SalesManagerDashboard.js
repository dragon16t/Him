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
import { LogOut, Users, ShoppingBag, IndianRupee, ClipboardList, BookOpen, Plus, Loader2, PhoneCall, MessageSquare, Package } from "lucide-react";
import RoleGuidelines from "../components/RoleGuidelines";
import MonthFilter, { filterByMonth } from "../components/MonthFilter";
import AttendanceCheckIn from "../components/AttendanceCheckIn";
import NotificationBell from "../components/NotificationBell";
import GlobalSearch from "../components/GlobalSearch";

const API = "/api";

export default function SalesManagerDashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const [stats, setStats] = useState({});
  const [telecallers, setTelecallers] = useState([]);
  const [agents, setAgents] = useState([]);
  const [orders, setOrders] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [instructions, setInstructions] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [followUps, setFollowUps] = useState({repeat_due:[],repeat_upcoming:[],relationship_due:[],relationship_upcoming:[],total_repeat:0,total_relationship:0});
  const [hiringCandidates, setHiringCandidates] = useState([]);
  const [callLogs, setCallLogs] = useState([]);
  const [month, setMonth] = useState((new Date().getMonth()+1).toString());
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [loading, setLoading] = useState(true);
  const [showAddTC, setShowAddTC] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddInstruction, setShowAddInstruction] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [tcForm, setTcForm] = useState({ name: "", email: "", password: "", language: "" });
  const [taskForm, setTaskForm] = useState({ title: "", description: "", assigned_to: "", assigned_to_name: "", assigned_to_role: "telecaller", priority: "medium", due_date: "" });
  const [instForm, setInstForm] = useState({ title: "", content: "", category: "calling", target_role: "telecaller" });
  const [contactForm, setContactForm] = useState({ name: "", phone: "", email: "", type: "influencer", notes: "" });

  const fetchData = useCallback(async () => {
    try {
      const [s, tc, o, c, t, i, co] = await Promise.all([
        axios.get(`${API}/dashboard/stats`), axios.get(`${API}/telecallers`), axios.get(`${API}/orders`),
        axios.get(`${API}/commissions/all`), axios.get(`${API}/tasks`), axios.get(`${API}/instructions`), axios.get(`${API}/contacts`)
      ]);
      setStats(s.data.stats); setTelecallers(tc.data.telecallers); setOrders(o.data.orders);
      setCommissions(c.data.commissions); setTasks(t.data.tasks); setInstructions(i.data.instructions); setContacts(co.data.contacts);
      try { const fu = await axios.get(`${API}/leads/follow-ups`); setFollowUps(fu.data); } catch {}
      try { const hc = await axios.get(`${API}/hiring/candidates`); setHiringCandidates(hc.data.entries||[]); } catch {}
      try { const cl = await axios.get(`${API}/call-logs/all`); setCallLogs(cl.data.call_logs||[]); } catch {}
    } catch (err) { console.error(err); }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAddTC = async () => { if (!tcForm.name||!tcForm.email) return toast.error("Fill fields"); try { await axios.post(`${API}/telecallers`, tcForm); toast.success("Added"); setShowAddTC(false); setTcForm({name:"",email:"",password:"",language:""}); fetchData(); } catch (e) { toast.error(e.response?.data?.detail||"Failed"); } };
  const handleAddTask = async () => { if (!taskForm.title||!taskForm.assigned_to) return toast.error("Fill fields"); try { await axios.post(`${API}/tasks`, taskForm); toast.success("Created"); setShowAddTask(false); fetchData(); } catch { toast.error("Failed"); } };
  const handleAddInstruction = async () => { if (!instForm.title||!instForm.content) return toast.error("Fill fields"); try { await axios.post(`${API}/instructions`, instForm); toast.success("Created"); setShowAddInstruction(false); setInstForm({title:"",content:"",category:"calling",target_role:"telecaller"}); fetchData(); } catch { toast.error("Failed"); } };

  const filteredOrders = filterByMonth(orders, month, year);
  const filteredCommissions = filterByMonth(commissions, month, year);
  const filteredCallLogs = filterByMonth(callLogs, month, year);
  const monthRevenue = filteredOrders.filter(o=>o.status==="delivered").reduce((s,o)=>s+(o.total_amount||0),0);
  const tcCandidates = hiringCandidates.filter(c => c.status !== "hired" && c.status !== "rejected");

  const hireCandidate = async (cid) => { try { await axios.post(`${API}/hiring/approve/${cid}`,{action:"select"}); toast.success("Selected — HR will finalize hiring"); fetchData(); } catch(e){ toast.error(e.response?.data?.detail||"Failed"); } };
  const rejectCandidate = async (cid) => { try { await axios.post(`${API}/hiring/approve/${cid}`,{action:"reject"}); toast.success("Rejected"); fetchData(); } catch{ toast.error("Failed"); } };
  const handleAddContact = async () => { if (!contactForm.name) return toast.error("Name required"); try { await axios.post(`${API}/contacts`, contactForm); toast.success("Added"); setShowAddContact(false); setContactForm({name:"",phone:"",email:"",type:"influencer",notes:""}); fetchData(); } catch { toast.error("Failed"); } };
  const approveOrder = async (id) => { try { await axios.put(`${API}/orders/${id}/approve`); toast.success("Approved!"); fetchData(); } catch (e) { toast.error(e.response?.data?.detail||"Failed"); } };
  const markPaid = async (id) => { try { await axios.put(`${API}/commissions/${id}/pay`, {paid_via:"bank_transfer"}); toast.success("Paid"); fetchData(); } catch { toast.error("Failed"); } };
  const logout = () => { localStorage.clear(); navigate("/login"); };
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F9F8F6]"><Loader2 className="w-8 h-8 animate-spin text-[#3B5249]" /></div>;

  return (
    <div className="min-h-screen bg-[#F9F8F6]" data-testid="sales-manager-dashboard">
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#F9F8F6]/80 border-b border-[#E5E3DB]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div><h1 className="font-heading text-2xl font-medium text-[#2C3531]">Celesta <span className="text-[#3B5249] font-semibold">Glow</span></h1><p className="text-xs text-[#59615D] uppercase tracking-[0.15em]">Sales Manager - {user.name}</p></div>
          <div className="flex items-center gap-2">
            <GlobalSearch />
            <NotificationBell />
            <AttendanceCheckIn />
            <Button variant="outline" onClick={logout} className="rounded-full border-[#E5E3DB]" data-testid="logout-btn"><LogOut className="w-4 h-4 mr-2"/>Logout</Button>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <RoleGuidelines role="sales_manager" />
        <MonthFilter month={month} year={year} onMonthChange={setMonth} onYearChange={setYear} />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {[{l:"Orders",v:filteredOrders.length,i:ShoppingBag},{l:"Pending",v:filteredOrders.filter(o=>o.status==='pending').length,i:ClipboardList},{l:"Telecallers",v:telecallers.length,i:Users},{l:"Hire Queue",v:tcCandidates.length,i:PhoneCall},{l:"Revenue",v:`Rs.${monthRevenue}`,i:IndianRupee}].map((s,i)=>(
            <div key={i} className="bg-white rounded-2xl border border-[#E5E3DB] p-5 hover:shadow-md transition-all hover:-translate-y-1"><s.i className="w-5 h-5 mb-3 text-[#3B5249]"/><p className="font-heading text-2xl font-semibold">{s.v}</p><p className="text-xs text-[#59615D] uppercase">{s.l}</p></div>
          ))}
        </div>
        <Tabs defaultValue="telecallers" className="space-y-6">
          <TabsList className="bg-white border border-[#E5E3DB] rounded-full p-1 h-auto flex-wrap">
            {[{v:"telecallers",l:"Telecallers"},{v:"repeat",l:`Repeat (${followUps.total_repeat})`},{v:"relationship",l:`Relation (${followUps.total_relationship})`},{v:"hiring",l:`Hiring (${tcCandidates.length})`},{v:"calllogs",l:`Call Logs (${filteredCallLogs.length})`},{v:"tasks",l:"Tasks"},{v:"instructions",l:"Instructions"},{v:"orders",l:"Orders"},{v:"commissions",l:"Commissions"},{v:"contacts",l:"Contacts"},{v:"mysheet",l:"My Sheet"}].map(t=>(
              <TabsTrigger key={t.v} value={t.v} className="rounded-full text-xs data-[state=active]:bg-[#3B5249] data-[state=active]:text-white px-3" data-testid={`tab-${t.v}`}>{t.l}</TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="telecallers" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5"><div className="flex justify-between mb-4"><h3 className="font-heading text-lg font-medium">Telecallers</h3><Button size="sm" className="rounded-full bg-[#3B5249] text-white" onClick={()=>setShowAddTC(true)} data-testid="add-tc-btn"><Plus className="w-4 h-4 mr-1"/>Add</Button></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{telecallers.map(tc=>(<div key={tc.id} className="border border-[#E5E3DB] rounded-xl p-4" data-testid={`tc-${tc.id}`}><div className="flex justify-between items-start"><div><p className="font-heading font-medium">{tc.name}</p><p className="text-xs text-[#59615D]">{tc.email}</p>{tc.phone&&<p className="text-xs text-[#59615D]">{tc.phone}</p>}</div>{tc.phone&&<a href={`tel:${tc.phone}`} data-testid={`call-tc-${tc.id}`}><Button size="sm" variant="outline" className="rounded-full h-8 w-8 p-0 border-[#6B8E6B] text-[#6B8E6B] hover:bg-[#6B8E6B] hover:text-white"><PhoneCall className="w-3.5 h-3.5"/></Button></a>}</div><div className="flex flex-wrap gap-1 mt-1">{tc.language&&<Badge variant="outline" className="text-[10px] bg-[#F9F8F6]">{tc.language}</Badge>}</div><div className="grid grid-cols-3 gap-2 mt-2 text-center">{[{l:"Calls",v:tc.total_calls||0},{l:"Conv.",v:tc.conversions||0},{l:"Comm.",v:`Rs.${tc.commission_earned||0}`}].map((s,i)=>(<div key={i} className="bg-[#F9F8F6] rounded-lg p-1.5"><p className="text-[10px] text-[#59615D]">{s.l}</p><p className="font-semibold text-xs">{s.v}</p></div>))}</div>
              <Button size="sm" variant="outline" className="rounded-full text-[10px] mt-2 h-6 text-[#A66E4E] border-[#A66E4E]" onClick={async()=>{if(!window.confirm(`Promote ${tc.name} to Asst Sales Manager?`))return;try{await axios.post(`${API}/promote/tc-to-asm`,{telecaller_id:tc.id});toast.success("Promoted!");fetchData();}catch(e){toast.error(e.response?.data?.detail||"Failed");}}} data-testid={`promote-tc-${tc.id}`}>Promote to Asst SM</Button>
            </div>))}</div>
            {/* End of Telecaller Cards */}
          </div></TabsContent>
          {/* TODAY HIRE */}
          <TabsContent value="hiring" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
            <h3 className="font-heading text-lg font-medium mb-4">Today Hire — Telecaller Candidates ({tcCandidates.length})</h3>
            <p className="text-xs text-[#59615D] mb-4">Candidates from HR/In-House telecaller. Hire creates user, sends welcome letter.</p>
            {tcCandidates.length === 0 ? <p className="text-center py-6 text-[#59615D] text-sm">No candidates pending</p> :
              <div className="space-y-2" data-testid="sm-hiring-list">{tcCandidates.map(c=>(
                <div key={c.id} className="border border-[#E5E3DB] rounded-xl p-3 flex flex-col sm:flex-row justify-between gap-2" data-testid={`sm-cand-${c.id}`}>
                  <div><p className="font-medium text-sm">{c.name} <Badge variant="outline" className="text-[8px] capitalize">{c.position}</Badge></p>
                    <p className="text-xs text-[#59615D]">{c.phone} | {c.location} {c.experience?`| Exp: ${c.experience}`:""}</p>
                    {c.notes && <p className="text-[10px] text-[#A66E4E]">{c.notes}</p>}
                  </div>
                  <div className="flex gap-1 items-center"><Badge className={`text-[8px] ${c.status==='selected'||c.status==='interviewed'?'bg-blue-100 text-blue-800':'bg-yellow-100 text-yellow-800'}`}>{c.status}</Badge>
                    <Button size="sm" className="rounded-full text-[10px] bg-[#6B8E6B] text-white h-6" onClick={()=>hireCandidate(c.id)} data-testid={`sm-hire-${c.id}`} title="Recommend candidate to HR for final hiring">✓ Select</Button>
                    <Button size="sm" variant="outline" className="rounded-full text-[10px] h-6 text-red-500" onClick={()=>rejectCandidate(c.id)}>Reject</Button>
                  </div>
                </div>
              ))}</div>}
          </div></TabsContent>
          {/* CALL LOGS */}
          <TabsContent value="calllogs" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
            <h3 className="font-heading text-lg font-medium mb-4">Call Logs ({filteredCallLogs.length})</h3>
            {filteredCallLogs.length === 0 ? <p className="text-center py-6 text-[#59615D] text-sm">No call logs for selected period</p> :
              <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b bg-[#F9F8F6]">{["Date","Type","Caller","Contact","Phone","Status","Notes"].map(h=><th key={h} className="p-2 text-left text-[9px] uppercase">{h}</th>)}</tr></thead>
                <tbody>{filteredCallLogs.slice(0,200).map((c,i)=>(
                  <tr key={c.id||i} className="border-b border-[#E5E3DB]"><td className="p-2">{(c.created_at||c.call_date||'').slice(0,10)}</td><td className="p-2"><Badge variant="outline" className="text-[8px]">{c.type}</Badge></td><td className="p-2">{c.caller_name||c.user_name||'-'}</td><td className="p-2 font-medium">{c.contact_name||c.influencer_name||'-'}</td><td className="p-2">{c.phone||'-'}</td><td className="p-2">{c.status||'-'}</td><td className="p-2 text-[10px]">{(c.details||c.notes||'').slice(0,60)}</td></tr>
                ))}</tbody></table></div>}
          </div></TabsContent>
          {/* REPEAT ORDERS */}
          <TabsContent value="repeat" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
            <h3 className="font-heading text-lg font-medium mb-4">Repeat Orders — Telecallers ({followUps.repeat_due.length} due)</h3>
            {followUps.repeat_due.length===0&&followUps.repeat_upcoming.length===0?<p className="text-center py-6 text-[#59615D] text-sm">No repeat orders pending</p>:<>
            {followUps.repeat_due.length>0&&<div className="mb-4"><p className="text-xs font-medium text-[#B75D69] mb-2 uppercase">Due Now</p><div className="space-y-2">{followUps.repeat_due.map(l=>(<div key={l.id} className="border border-orange-200 bg-orange-50 rounded-xl p-3 flex justify-between items-center"><div><p className="font-medium text-sm">{l.name}</p><p className="text-xs text-[#59615D]">{l.phone_number} | Assigned: {l.assigned_to}</p></div><div className="text-right"><Badge className="bg-orange-100 text-orange-800 text-[9px]">REPEAT DUE</Badge><p className="text-[10px] text-[#59615D]">{l.next_repeat_order_date}</p></div></div>))}</div></div>}
            {followUps.repeat_upcoming.length>0&&<div><p className="text-xs font-medium text-[#D4A373] mb-2 uppercase">Upcoming</p><div className="space-y-1">{followUps.repeat_upcoming.map(l=>(<div key={l.id} className="border border-[#E5E3DB] rounded-xl p-2 flex justify-between text-xs"><span>{l.name} - {l.phone_number}</span><span className="text-[#A66E4E]">{l.next_repeat_order_date}</span></div>))}</div></div>}
            </>}
          </div></TabsContent>
          {/* RELATIONSHIP CALLS */}
          <TabsContent value="relationship" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
            <h3 className="font-heading text-lg font-medium mb-4">Relationship Calls — Telecallers ({followUps.relationship_due.length} due)</h3>
            {followUps.relationship_due.length===0&&followUps.relationship_upcoming.length===0?<p className="text-center py-6 text-[#59615D] text-sm">No relationship calls pending</p>:<>
            {followUps.relationship_due.length>0&&<div className="mb-4"><p className="text-xs font-medium text-[#B75D69] mb-2 uppercase">Due Now</p><div className="space-y-2">{followUps.relationship_due.map(l=>(<div key={l.id} className="border border-pink-200 bg-pink-50 rounded-xl p-3 flex justify-between items-center"><div><p className="font-medium text-sm">{l.name}</p><p className="text-xs text-[#59615D]">{l.phone_number} | Assigned: {l.assigned_to}</p></div><div className="text-right"><Badge className="bg-pink-100 text-pink-800 text-[9px]">RELATIONSHIP DUE</Badge><p className="text-[10px] text-[#59615D]">{l.next_relationship_date}</p></div></div>))}</div></div>}
            {followUps.relationship_upcoming.length>0&&<div><p className="text-xs font-medium text-[#D4A373] mb-2 uppercase">Upcoming</p><div className="space-y-1">{followUps.relationship_upcoming.map(l=>(<div key={l.id} className="border border-[#E5E3DB] rounded-xl p-2 flex justify-between text-xs"><span>{l.name} - {l.phone_number}</span><span className="text-[#D4A373]">{l.next_relationship_date}</span></div>))}</div></div>}
            </>}
          </div></TabsContent>
          <TabsContent value="tasks" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5"><div className="flex justify-between mb-4"><h3 className="font-heading text-lg font-medium">Task Sheets</h3><Button size="sm" className="rounded-full bg-[#3B5249] text-white" onClick={()=>setShowAddTask(true)} data-testid="add-task-btn"><Plus className="w-4 h-4 mr-1"/>Create</Button></div>
            <div className="space-y-3">{tasks.map(t=>(<div key={t.id} className="border border-[#E5E3DB] rounded-xl p-4"><div className="flex justify-between"><p className="font-medium">{t.title}</p><div className="flex gap-1"><Badge variant="outline" className="text-[10px]">{t.priority}</Badge><Badge className={`text-[10px] ${t.status==="completed"?"bg-green-100 text-green-800":"bg-yellow-100 text-yellow-800"}`}>{t.status}</Badge></div></div><p className="text-xs text-[#59615D] mt-1">{t.description}</p><p className="text-xs text-[#A66E4E] mt-1">To: {t.assigned_to_name} | Due: {t.due_date}</p></div>))}</div>
          </div></TabsContent>
          <TabsContent value="instructions" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5"><div className="flex justify-between mb-4"><h3 className="font-heading text-lg font-medium">Instructions</h3><Button size="sm" className="rounded-full bg-[#3B5249] text-white" onClick={()=>setShowAddInstruction(true)} data-testid="add-instruction-btn"><Plus className="w-4 h-4 mr-1"/>Create</Button></div>
            <div className="space-y-3">{instructions.map(i=>(<div key={i.id} className="border border-[#E5E3DB] rounded-xl p-4"><div className="flex justify-between"><p className="font-heading font-medium">{i.title}</p><Badge variant="outline" className="text-[10px]">{i.category}</Badge></div><p className="text-sm text-[#59615D] mt-2 whitespace-pre-wrap">{i.content}</p><p className="text-xs text-[#A66E4E] mt-1">For: {i.target_role}s | By: {i.created_by_name}</p></div>))}</div>
          </div></TabsContent>
          <TabsContent value="orders" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
            <h3 className="font-heading text-lg font-medium mb-4">Orders ({orders.filter(o=>o.status==="pending").length} pending)</h3>
            <div className="space-y-3">{orders.map(o=>(<div key={o.id} className="border border-[#E5E3DB] rounded-xl p-4">
              <div className="flex flex-col sm:flex-row justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap"><p className="font-mono text-xs">{o.id}</p><Badge className={`text-[9px] whitespace-nowrap ${o.status==="delivered"?"bg-green-100 text-green-800":o.status==="shipped"?"bg-blue-100 text-blue-800":o.status==="confirmed"?"bg-emerald-100 text-emerald-800":o.status==="pending"?"bg-yellow-100 text-yellow-800":"bg-red-100 text-red-800"}`}>{o.status?.toUpperCase()}</Badge></div>
                  <p className="font-medium text-sm mt-1">{o.customer_name} | {o.customer_phone}</p>
                  <p className="text-xs text-[#59615D]">{o.customer_address}</p>
                  {o.items?.map((item,idx)=>(<p key={idx} className="text-xs text-[#59615D]">{item.product_name} x{item.quantity} = Rs.{item.price*item.quantity}</p>))}
                  <p className="font-heading font-semibold text-[#3B5249] text-sm mt-1">Rs.{o.total_amount} ({o.payment_type}) | By: {o.created_by_name}</p>
                </div>
                <div className="flex gap-2 items-start">
                  {o.status==="pending"&&<Button size="sm" className="rounded-full text-xs bg-[#6B8E6B] text-white h-7" onClick={()=>approveOrder(o.id)}>Approve</Button>}
                  {o.status==="confirmed"&&<Button size="sm" className="rounded-full text-xs bg-blue-600 text-white h-7" onClick={async()=>{try{await axios.put(`${API}/orders/${o.id}/ship`);toast.success("Shipped!");fetchData();}catch{toast.error("Failed");}}}>Ship</Button>}
                </div>
              </div>
            </div>))}</div>
          </div></TabsContent>
          <TabsContent value="commissions" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] overflow-x-auto"><div className="p-5 border-b border-[#E5E3DB]"><h3 className="font-heading text-lg font-medium">Commissions</h3></div>
            <table className="w-full"><thead><tr className="border-b bg-[#F9F8F6]">{["Date","User","Order","Commission","Status","Action"].map(h=><th key={h} className="text-left p-4 text-xs uppercase text-[#59615D]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[#E5E3DB]">{commissions.map(c=>(<tr key={c.id}><td className="p-4 text-sm">{c.created_at?.slice(0,10)}</td><td className="p-4 text-sm">{c.user_name} <Badge variant="outline" className="text-[10px]">{c.user_role}</Badge></td><td className="p-4 text-xs font-mono">{c.order_id}</td><td className="p-4 text-sm font-semibold text-[#3B5249]">Rs.{c.commission_amount}</td><td className="p-4"><Badge className={`text-[10px] ${c.status==="paid"?"bg-green-100 text-green-800":"bg-yellow-100 text-yellow-800"}`}>{c.status}</Badge></td><td className="p-4">{c.status==="pending"&&<Button size="sm" className="rounded-full text-xs bg-[#6B8E6B] text-white" onClick={()=>markPaid(c.id)}>Pay</Button>}</td></tr>))}</tbody></table>
          </div></TabsContent>
          <TabsContent value="contacts" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5"><div className="flex justify-between mb-4"><h3 className="font-heading text-lg font-medium">Contact Book</h3><Button size="sm" className="rounded-full bg-[#3B5249] text-white" onClick={()=>setShowAddContact(true)} data-testid="add-contact-btn"><Plus className="w-4 h-4 mr-1"/>Add</Button></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{contacts.map(c=>(<div key={c.id} className="border border-[#E5E3DB] rounded-xl p-4"><div className="flex justify-between"><p className="font-heading font-medium">{c.name}</p><Badge variant="outline" className="text-[10px]">{c.type}</Badge></div><p className="text-xs text-[#59615D]">{c.phone} | {c.email}</p>{c.notes&&<p className="text-xs text-[#59615D] mt-1 bg-[#F9F8F6] rounded-lg p-2">{c.notes}</p>}</div>))}</div>
          </div></TabsContent>
          <TabsContent value="mysheet" className="animate-fade-in"><DailyTaskSheet titleSuffix="Sales Manager" /></TabsContent>
        </Tabs>
      </div>
      {/* Dialogs */}
      <Dialog open={showAddTC} onOpenChange={setShowAddTC}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Add Telecaller</DialogTitle></DialogHeader><div className="space-y-3"><Input placeholder="Name" value={tcForm.name} onChange={e=>setTcForm(f=>({...f,name:e.target.value}))} className="rounded-xl" data-testid="tc-name-input"/><Input placeholder="Email" value={tcForm.email} onChange={e=>setTcForm(f=>({...f,email:e.target.value}))} className="rounded-xl" data-testid="tc-email-input"/><Input placeholder="Password" value={tcForm.password} onChange={e=>setTcForm(f=>({...f,password:e.target.value}))} className="rounded-xl"/><Input placeholder="Language (Malayalam, Hindi, English...)" value={tcForm.language} onChange={e=>setTcForm(f=>({...f,language:e.target.value}))} className="rounded-xl" data-testid="tc-language-input"/><Button onClick={handleAddTC} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-tc-btn">Add</Button></div></DialogContent></Dialog>
      <Dialog open={showAddTask} onOpenChange={setShowAddTask}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Create Task</DialogTitle></DialogHeader><div className="space-y-3"><Input placeholder="Title" value={taskForm.title} onChange={e=>setTaskForm(f=>({...f,title:e.target.value}))} className="rounded-xl" data-testid="task-title-input"/><Textarea placeholder="Description" value={taskForm.description} onChange={e=>setTaskForm(f=>({...f,description:e.target.value}))} className="rounded-xl"/><Select value={taskForm.assigned_to} onValueChange={v=>{const t=telecallers.find(x=>x.id===v);setTaskForm(f=>({...f,assigned_to:v,assigned_to_name:t?.name||""}));}}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Assign to"/></SelectTrigger><SelectContent>{telecallers.map(t=><SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select><Select value={taskForm.priority} onValueChange={v=>setTaskForm(f=>({...f,priority:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="high">High</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="low">Low</SelectItem></SelectContent></Select><Input type="date" value={taskForm.due_date} onChange={e=>setTaskForm(f=>({...f,due_date:e.target.value}))} className="rounded-xl"/><Button onClick={handleAddTask} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-task-btn">Create</Button></div></DialogContent></Dialog>
      <Dialog open={showAddInstruction} onOpenChange={setShowAddInstruction}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Create Instruction</DialogTitle></DialogHeader><div className="space-y-3"><Input placeholder="Title (e.g. How to Call)" value={instForm.title} onChange={e=>setInstForm(f=>({...f,title:e.target.value}))} className="rounded-xl" data-testid="inst-title-input"/><Select value={instForm.category} onValueChange={v=>setInstForm(f=>({...f,category:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="calling">Calling</SelectItem><SelectItem value="home_visit">Home Visit</SelectItem><SelectItem value="sales">Sales</SelectItem><SelectItem value="general">General</SelectItem></SelectContent></Select><Select value={instForm.target_role} onValueChange={v=>setInstForm(f=>({...f,target_role:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="telecaller">Telecallers</SelectItem><SelectItem value="agent">Agents</SelectItem></SelectContent></Select><Textarea placeholder="Instruction content..." value={instForm.content} onChange={e=>setInstForm(f=>({...f,content:e.target.value}))} className="rounded-xl min-h-[120px]" data-testid="inst-content-input"/><Button onClick={handleAddInstruction} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-inst-btn">Create</Button></div></DialogContent></Dialog>
      <Dialog open={showAddContact} onOpenChange={setShowAddContact}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Add Contact</DialogTitle></DialogHeader><div className="space-y-3"><Input placeholder="Name" value={contactForm.name} onChange={e=>setContactForm(f=>({...f,name:e.target.value}))} className="rounded-xl" data-testid="contact-name-input"/><Input placeholder="Phone" value={contactForm.phone} onChange={e=>setContactForm(f=>({...f,phone:e.target.value}))} className="rounded-xl"/><Input placeholder="Email" value={contactForm.email} onChange={e=>setContactForm(f=>({...f,email:e.target.value}))} className="rounded-xl"/><Select value={contactForm.type} onValueChange={v=>setContactForm(f=>({...f,type:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="influencer">Influencer</SelectItem><SelectItem value="collaborator">Collaborator</SelectItem><SelectItem value="vendor">Vendor</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select><Textarea placeholder="Notes / Summary" value={contactForm.notes} onChange={e=>setContactForm(f=>({...f,notes:e.target.value}))} className="rounded-xl"/><Button onClick={handleAddContact} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-contact-btn">Add</Button></div></DialogContent></Dialog>
    </div>
  );
}
