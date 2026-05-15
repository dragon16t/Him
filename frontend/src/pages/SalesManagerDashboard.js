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
import TeamActivityPanel from "../components/TeamActivityPanel";
import TeamGroupsPanel from "../components/TeamGroupsPanel";
import DelhiveryShipActions from "../components/DelhiveryShipActions";
import CollaborationContactsPanel from "../components/CollaborationContactsPanel";

const API = "/api";

export default function SalesManagerDashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const [stats, setStats] = useState({});
  const [telecallers, setTelecallers] = useState([]);
  const [tcWindowDays, setTcWindowDays] = useState(0); // 0 = all time; 3/7/15/30 = last N days
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
  const [editingTC, setEditingTC] = useState(null);
  const [tcEditForm, setTcEditForm] = useState({ name: "", phone: "", language: "", location: "" });
  // Per-telecaller call log viewer
  const [callViewerTC, setCallViewerTC] = useState(null);
  const [callViewerDays, setCallViewerDays] = useState(7);
  const [callViewerLoading, setCallViewerLoading] = useState(false);
  const [callViewerLogs, setCallViewerLogs] = useState([]);
  const [callViewerSection, setCallViewerSection] = useState("calls"); // "calls" | "leads"
  const [callViewerLeads, setCallViewerLeads] = useState([]);
  const [callViewerLeadsTodayOnly, setCallViewerLeadsTodayOnly] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddInstruction, setShowAddInstruction] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [tcForm, setTcForm] = useState({ name: "", email: "", password: "", language: "", location: "" });
  const [taskForm, setTaskForm] = useState({ title: "", description: "", assigned_to: "", assigned_to_name: "", assigned_to_role: "telecaller", priority: "medium", due_date: "" });
  const [instForm, setInstForm] = useState({ title: "", content: "", category: "calling", target_role: "telecaller" });
  const [contactForm, setContactForm] = useState({ name: "", phone: "", email: "", type: "influencer", notes: "" });
  // Direct order creation (Sales Manager)
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [orderForm, setOrderForm] = useState({ customer_name:"", customer_phone:"", customer_address:"", customer_city:"", customer_pincode:"", payment_type:"cod", product_name:"", quantity:1, price:0 });
  // Assistant Sales Managers (ASMs)
  const [asms, setAsms] = useState([]);
  const [showAddAsm, setShowAddAsm] = useState(false);
  const [showEditAsm, setShowEditAsm] = useState(false);
  const [editingAsm, setEditingAsm] = useState(null);
  const [asmForm, setAsmForm] = useState({name:"",email:"",phone:"",password:"",salary:0,incentive:0});

  const fetchData = useCallback(async () => {
    try {
      const [s, tc, o, c, t, i, co] = await Promise.all([
        axios.get(`${API}/dashboard/stats`), axios.get(`${API}/telecallers`, { params: tcWindowDays ? { days: tcWindowDays } : {} }), axios.get(`${API}/orders`),
        axios.get(`${API}/commissions/all`), axios.get(`${API}/tasks`), axios.get(`${API}/instructions`), axios.get(`${API}/contacts`)
      ]);
      setStats(s.data.stats); setTelecallers(tc.data.telecallers); setOrders(o.data.orders);
      setCommissions(c.data.commissions); setTasks(t.data.tasks); setInstructions(i.data.instructions); setContacts(co.data.contacts);
      try { const fu = await axios.get(`${API}/leads/follow-ups`); setFollowUps(fu.data); } catch {}
      try { const hc = await axios.get(`${API}/hiring/candidates`); setHiringCandidates(hc.data.entries||[]); } catch {}
      try { const cl = await axios.get(`${API}/call-logs/all`); setCallLogs(cl.data.call_logs||[]); } catch {}
      try { const a = await axios.get(`${API}/my-team/asms`); setAsms(a.data.asms||[]); } catch {}
    } catch (err) { console.error(err); }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tcWindowDays]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAddTC = async () => { if (!tcForm.name||!tcForm.email) return toast.error("Fill fields"); try { await axios.post(`${API}/telecallers`, tcForm); toast.success("Added"); setShowAddTC(false); setTcForm({name:"",email:"",password:"",language:"",location:""}); fetchData(); } catch (e) { toast.error(e.response?.data?.detail||"Failed"); } };
  const openEditTC = (tc) => { setEditingTC(tc); setTcEditForm({ name: tc.name || "", phone: tc.phone || "", language: tc.language || "", location: tc.locality || tc.location || tc.city || "" }); };
  const openCallViewer = (tc) => { setCallViewerTC(tc); setCallViewerDays(7); setCallViewerSection("calls"); setCallViewerLeadsTodayOnly(false); };
  useEffect(() => {
    if (!callViewerTC) { setCallViewerLogs([]); setCallViewerLeads([]); return; }
    setCallViewerLoading(true);
    Promise.all([
      axios.get(`${API}/team-activity`, { params: { user_id: callViewerTC.id, days: callViewerDays, limit: 500 } }).catch(()=>({data:{activities:[]}})),
      axios.get(`${API}/leads`, { params: { assigned_to: callViewerTC.id, limit: 500 } }).catch(()=>({data:{leads:[]}}))
    ]).then(([a, l]) => {
      setCallViewerLogs(a.data.activities || []);
      setCallViewerLeads(l.data.leads || []);
    }).finally(() => setCallViewerLoading(false));
  }, [callViewerTC, callViewerDays]);
  const handleEditTC = async () => {
    if (!editingTC) return;
    try {
      await axios.put(`${API}/telecallers/${editingTC.id}`, tcEditForm);
      toast.success("Telecaller updated");
      setEditingTC(null);
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
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
  const handleAddAsm = async () => {
    if (!asmForm.name || !asmForm.email || !asmForm.phone) return toast.error("Name, email and phone are required");
    try {
      await axios.post(`${API}/my-team/asm`, asmForm);
      toast.success("Assistant Sales Manager added — welcome email sent");
      setShowAddAsm(false);
      setAsmForm({name:"",email:"",phone:"",password:"",salary:0,incentive:0});
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const openEditAsm = (a) => {
    setEditingAsm(a);
    setAsmForm({name:a.name||"",email:a.email||"",phone:a.phone||"",password:"",salary:a.salary||0,incentive:a.incentive||0});
    setShowEditAsm(true);
  };
  const handleEditAsm = async () => {
    if (!editingAsm) return;
    try {
      const payload = {...asmForm};
      if (!payload.password) delete payload.password;
      await axios.put(`${API}/my-team/asm/${editingAsm.id}`, payload);
      toast.success("ASM updated");
      setShowEditAsm(false); setEditingAsm(null);
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const approveOrder = async (id) => { try { await axios.put(`${API}/orders/${id}/approve`); toast.success("Approved!"); fetchData(); } catch (e) { toast.error(e.response?.data?.detail||"Failed"); } };
  const handleCreateOrder = async () => {
    if (!orderForm.customer_name || !orderForm.customer_phone || !orderForm.customer_address || !orderForm.product_name) {
      return toast.error("Customer name, phone, address and product are required");
    }
    const qty = Number(orderForm.quantity) || 1;
    const price = Number(orderForm.price) || 0;
    if (price <= 0) return toast.error("Price must be greater than 0");
    try {
      await axios.post(`${API}/orders`, {
        customer_name: orderForm.customer_name,
        customer_phone: orderForm.customer_phone,
        customer_address: orderForm.customer_address,
        customer_city: orderForm.customer_city,
        customer_pincode: orderForm.customer_pincode,
        payment_type: orderForm.payment_type,
        items: [{ product_name: orderForm.product_name, quantity: qty, price: price }],
        total_amount: qty * price,
      });
      toast.success("Order created");
      setShowCreateOrder(false);
      setOrderForm({ customer_name:"", customer_phone:"", customer_address:"", customer_city:"", customer_pincode:"", payment_type:"cod", product_name:"", quantity:1, price:0 });
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed to create order"); }
  };
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

        {/* ASSISTANT SALES MANAGERS PANEL */}
        <div className="bg-white rounded-2xl border border-[#E5E3DB] p-5 mb-6" data-testid="sm-asm-panel">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <div>
              <h3 className="font-heading text-lg font-medium">My Assistant Sales Managers</h3>
              <p className="text-[11px] text-[#59615D]">Manage your Asst SMs. They&apos;ll be CC&apos;d on every instruction & email sent to you.</p>
            </div>
            <Button size="sm" className="rounded-full bg-[#3B5249] text-white" onClick={()=>{setAsmForm({name:"",email:"",phone:"",password:"",salary:0,incentive:0});setShowAddAsm(true);}} data-testid="sm-add-asm-btn"><Plus className="w-4 h-4 mr-1"/>Add Asst SM</Button>
          </div>
          {asms.length === 0 ? (
            <div className="text-center py-6 border-2 border-dashed border-[#E5E3DB] rounded-xl">
              <Users className="w-8 h-8 mx-auto text-[#A0A39E] mb-2"/>
              <p className="text-sm text-[#59615D]">No Assistant Sales Manager yet</p>
              <p className="text-[11px] text-[#A0A39E]">Click &quot;Add Asst SM&quot; to add one — they will receive welcome credentials.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {asms.map(a => (
                <div key={a.id} className="border border-[#E5E3DB] rounded-xl p-4 hover:shadow-sm transition-shadow" data-testid={`asm-card-${a.id}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-heading font-medium text-[#2C3531]">{a.name}</p>
                      <Badge variant="outline" className="text-[9px] bg-[#F9F8F6] mt-1">Asst Sales Mgr</Badge>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 text-[10px] rounded-full" onClick={()=>openEditAsm(a)} data-testid={`asm-edit-${a.id}`}>Edit</Button>
                  </div>
                  <div className="space-y-1 text-xs text-[#59615D]">
                    <p className="flex items-center gap-1.5"><MessageSquare className="w-3 h-3"/>{a.email}</p>
                    {a.phone && (
                      <p className="flex items-center justify-between gap-1.5">
                        <span className="flex items-center gap-1.5"><PhoneCall className="w-3 h-3"/>{a.phone}</span>
                        <a href={`tel:${a.phone}`}><Button size="sm" variant="outline" className="rounded-full h-6 w-6 p-0 border-[#6B8E6B] text-[#6B8E6B] hover:bg-[#6B8E6B] hover:text-white"><PhoneCall className="w-3 h-3"/></Button></a>
                      </p>
                    )}
                    {(a.salary > 0 || a.incentive > 0) && <p className="text-[10px] text-[#A66E4E]">Rs.{a.salary || 0} salary {a.incentive ? `• Rs.${a.incentive} incentive` : ""}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <Tabs defaultValue="telecallers" className="space-y-6">
          <TabsList className="bg-white border border-[#E5E3DB] rounded-full p-1 h-auto flex-wrap">
            {[{v:"telecallers",l:"Telecallers"},{v:"activity",l:"Activity"},{v:"groups",l:"Groups"},{v:"repeat",l:`Repeat (${followUps.total_repeat})`},{v:"relationship",l:`Relation (${followUps.total_relationship})`},{v:"hiring",l:`Hiring (${tcCandidates.length})`},{v:"calllogs",l:`Call Logs (${filteredCallLogs.length})`},{v:"salescollab",l:"📇 Sales Collab"},{v:"tasks",l:"Tasks"},{v:"instructions",l:"Instructions"},{v:"orders",l:"Orders"},{v:"commissions",l:"Commissions"},{v:"contacts",l:"Contacts"},{v:"mysheet",l:"My Sheet"}].map(t=>(
              <TabsTrigger key={t.v} value={t.v} className="rounded-full text-xs data-[state=active]:bg-[#3B5249] data-[state=active]:text-white px-3" data-testid={`tab-${t.v}`}>{t.l}</TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="activity" className="animate-fade-in"><TeamActivityPanel /></TabsContent>
          <TabsContent value="salescollab" className="animate-fade-in"><CollaborationContactsPanel title="Sales Collaboration Contact Book" allowedTypes={["sales_opportunity"]} /></TabsContent>
          <TabsContent value="groups" className="animate-fade-in"><TeamGroupsPanel candidates={telecallers} candidateLabel="Telecallers" /></TabsContent>
          <TabsContent value="telecallers" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
            <div className="flex justify-between mb-3 flex-wrap gap-2">
              <h3 className="font-heading text-lg font-medium">Telecallers</h3>
              <Button size="sm" className="rounded-full bg-[#3B5249] text-white" onClick={()=>setShowAddTC(true)} data-testid="add-tc-btn"><Plus className="w-4 h-4 mr-1"/>Add</Button>
            </div>
            <div className="flex gap-1.5 flex-wrap mb-4" data-testid="tc-window-chips">
              {[{d:0,l:"All time"},{d:3,l:"Last 3d"},{d:7,l:"Last 7d"},{d:15,l:"Last 15d"},{d:30,l:"Last 30d"}].map(opt=>(
                <Button key={opt.d} size="sm" variant={tcWindowDays===opt.d?"default":"outline"}
                  onClick={()=>setTcWindowDays(opt.d)}
                  className={`rounded-full text-[10px] h-6 px-2 ${tcWindowDays===opt.d?"bg-[#3B5249] text-white":"border-[#E5E3DB]"}`}
                  data-testid={`tc-window-${opt.d}`}
                >{opt.l}</Button>
              ))}
              <span className="text-[10px] text-[#59615D] flex items-center ml-2">{tcWindowDays?`Showing activity from the last ${tcWindowDays} day(s)`:"All-time totals"}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{telecallers.map(tc=>(<div key={tc.id} className="border border-[#E5E3DB] rounded-xl p-4" data-testid={`tc-${tc.id}`}><div className="flex justify-between items-start gap-2"><div className="flex-1 min-w-0"><p className="font-heading font-medium">{tc.name}</p><p className="text-xs text-[#59615D]">{tc.email}</p>{tc.phone&&<p className="text-xs text-[#59615D]">{tc.phone}</p>}</div><div className="flex gap-1 flex-shrink-0"><Button size="sm" variant="outline" className="rounded-full h-8 w-8 p-0 border-[#3B5249] text-[#3B5249] hover:bg-[#3B5249] hover:text-white" onClick={()=>openCallViewer(tc)} data-testid={`view-calls-${tc.id}`} title="View call logs">📞</Button><Button size="sm" variant="outline" className="rounded-full h-8 w-8 p-0 border-[#A66E4E] text-[#A66E4E] hover:bg-[#A66E4E] hover:text-white" onClick={()=>openEditTC(tc)} data-testid={`edit-tc-${tc.id}`}>✎</Button>{tc.phone&&<a href={`tel:${tc.phone}`} data-testid={`call-tc-${tc.id}`}><Button size="sm" variant="outline" className="rounded-full h-8 w-8 p-0 border-[#6B8E6B] text-[#6B8E6B] hover:bg-[#6B8E6B] hover:text-white"><PhoneCall className="w-3.5 h-3.5"/></Button></a>}</div></div>
              <div className="flex flex-wrap gap-1 mt-2">
                {tc.language && <Badge variant="outline" className="text-[10px] bg-[#F9F8F6]" data-testid={`tc-lang-${tc.id}`}>🗣 {tc.language}</Badge>}
                {(tc.locality || tc.location || tc.city) && <Badge variant="outline" className="text-[10px] bg-[#F9F8F6]" data-testid={`tc-place-${tc.id}`}>📍 {tc.locality || tc.location || tc.city}</Badge>}
              </div>
              <div className="grid grid-cols-4 gap-1.5 mt-2 text-center">
                <div className="bg-[#F9F8F6] rounded-lg p-1.5"><p className="text-[10px] text-[#59615D]">Leads</p><p className="font-semibold text-xs" data-testid={`tc-leads-${tc.id}`}>{tcWindowDays ? (tc.window_leads||0) : (tc.total_leads||0)}</p></div>
                <div className="bg-[#F9F8F6] rounded-lg p-1.5"><p className="text-[10px] text-[#59615D]">Calls</p><p className="font-semibold text-xs" data-testid={`tc-calls-${tc.id}`}>{tcWindowDays ? (tc.window_calls||0) : (tc.total_calls||0)}</p></div>
                <div className="bg-[#F9F8F6] rounded-lg p-1.5"><p className="text-[10px] text-[#59615D]">Conv.</p><p className="font-semibold text-xs" data-testid={`tc-conv-${tc.id}`}>{tcWindowDays ? (tc.window_conv||0) : (tc.conversions||0)}</p></div>
                <div className="bg-[#F9F8F6] rounded-lg p-1.5"><p className="text-[10px] text-[#59615D]">Comm.</p><p className="font-semibold text-xs">Rs.{tc.commission_earned||0}</p></div>
              </div>
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
            {followUps.repeat_due.length>0&&<div className="mb-4"><p className="text-xs font-medium text-[#B75D69] mb-2 uppercase">Due Now</p><div className="space-y-2">{followUps.repeat_due.map(l=>(
              <div key={l.id} className="border border-orange-200 bg-orange-50 rounded-xl p-3" data-testid={`repeat-due-${l.id}`}>
                <div className="flex justify-between gap-2 flex-wrap items-start">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{l.name} <span className="text-[#59615D] text-xs font-normal">· {l.phone_number}</span></p>
                    <p className="text-[11px] text-[#59615D]">Telecaller: <b className="text-[#3B5249]">{l.assigned_to_name || l.assigned_to || "—"}</b></p>
                    {(l.last_order_products || l.product_interest) && <p className="text-[11px] text-[#2C3531]"><b>Product:</b> {l.last_order_products || l.product_interest}</p>}
                  </div>
                  <div className="text-right">
                    <Badge className="bg-orange-100 text-orange-800 text-[9px]">REPEAT DUE</Badge>
                    <p className="text-[10px] text-[#59615D] mt-1">Due: {l.next_repeat_order_date}</p>
                    {l.last_order_amount > 0 && <p className="text-[11px] font-heading font-semibold text-[#3B5249]">Last: Rs.{l.last_order_amount}</p>}
                    {l.callback_by && !l.callback_done && <p className="text-[9px] text-red-700 font-medium">⏰ Call due: {String(l.callback_by).slice(11,16)}</p>}
                  </div>
                </div>
              </div>
            ))}</div></div>}
            {followUps.repeat_upcoming.length>0&&<div><p className="text-xs font-medium text-[#D4A373] mb-2 uppercase">Upcoming</p><div className="space-y-1">{followUps.repeat_upcoming.map(l=>(
              <div key={l.id} className="border border-[#E5E3DB] rounded-xl p-2 flex justify-between items-center text-xs gap-2 flex-wrap">
                <span className="flex-1"><b>{l.name}</b> · {l.phone_number} {l.assigned_to_name && <span className="text-[#59615D]">· TC: {l.assigned_to_name}</span>} {(l.last_order_products || l.product_interest) && <span className="text-[#59615D]"> · {l.last_order_products || l.product_interest}</span>}</span>
                <span className="text-[#A66E4E] whitespace-nowrap">{l.next_repeat_order_date}{l.last_order_amount > 0 && ` · Rs.${l.last_order_amount}`}</span>
              </div>
            ))}</div></div>}
            </>}
          </div></TabsContent>
          {/* RELATIONSHIP CALLS */}
          <TabsContent value="relationship" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
            <h3 className="font-heading text-lg font-medium mb-4">Relationship Calls — Telecallers ({followUps.relationship_due.length} due)</h3>
            {followUps.relationship_due.length===0&&followUps.relationship_upcoming.length===0?<p className="text-center py-6 text-[#59615D] text-sm">No relationship calls pending</p>:<>
            {followUps.relationship_due.length>0&&<div className="mb-4"><p className="text-xs font-medium text-[#B75D69] mb-2 uppercase">Due Now</p><div className="space-y-2">{followUps.relationship_due.map(l=>(
              <div key={l.id} className="border border-pink-200 bg-pink-50 rounded-xl p-3" data-testid={`rel-due-${l.id}`}>
                <div className="flex justify-between gap-2 flex-wrap items-start">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{l.name} <span className="text-[#59615D] text-xs font-normal">· {l.phone_number}</span></p>
                    <p className="text-[11px] text-[#59615D]">Telecaller: <b className="text-[#3B5249]">{l.assigned_to_name || l.assigned_to || "—"}</b></p>
                    {(l.last_order_products || l.product_interest) && <p className="text-[11px] text-[#2C3531]"><b>Product:</b> {l.last_order_products || l.product_interest}</p>}
                  </div>
                  <div className="text-right">
                    <Badge className="bg-pink-100 text-pink-800 text-[9px]">RELATIONSHIP DUE</Badge>
                    <p className="text-[10px] text-[#59615D] mt-1">Due: {l.next_relationship_date}</p>
                    {l.last_order_amount > 0 && <p className="text-[11px] font-heading font-semibold text-[#3B5249]">Last: Rs.{l.last_order_amount}</p>}
                    {l.callback_by && !l.callback_done && <p className="text-[9px] text-red-700 font-medium">⏰ Call due: {String(l.callback_by).slice(11,16)}</p>}
                  </div>
                </div>
              </div>
            ))}</div></div>}
            {followUps.relationship_upcoming.length>0&&<div><p className="text-xs font-medium text-[#D4A373] mb-2 uppercase">Upcoming</p><div className="space-y-1">{followUps.relationship_upcoming.map(l=>(
              <div key={l.id} className="border border-[#E5E3DB] rounded-xl p-2 flex justify-between items-center text-xs gap-2 flex-wrap">
                <span className="flex-1"><b>{l.name}</b> · {l.phone_number} {l.assigned_to_name && <span className="text-[#59615D]">· TC: {l.assigned_to_name}</span>} {(l.last_order_products || l.product_interest) && <span className="text-[#59615D]"> · {l.last_order_products || l.product_interest}</span>}</span>
                <span className="text-[#D4A373] whitespace-nowrap">{l.next_relationship_date}{l.last_order_amount > 0 && ` · Rs.${l.last_order_amount}`}</span>
              </div>
            ))}</div></div>}
            </>}
          </div></TabsContent>
          <TabsContent value="tasks" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5"><div className="flex justify-between mb-4"><h3 className="font-heading text-lg font-medium">Task Sheets</h3><Button size="sm" className="rounded-full bg-[#3B5249] text-white" onClick={()=>setShowAddTask(true)} data-testid="add-task-btn"><Plus className="w-4 h-4 mr-1"/>Create</Button></div>
            <div className="space-y-3">{tasks.map(t=>(<div key={t.id} className="border border-[#E5E3DB] rounded-xl p-4"><div className="flex justify-between"><p className="font-medium">{t.title}</p><div className="flex gap-1"><Badge variant="outline" className="text-[10px]">{t.priority}</Badge><Badge className={`text-[10px] ${t.status==="completed"?"bg-green-100 text-green-800":"bg-yellow-100 text-yellow-800"}`}>{t.status}</Badge></div></div><p className="text-xs text-[#59615D] mt-1">{t.description}</p><p className="text-xs text-[#A66E4E] mt-1">To: {t.assigned_to_name} | Due: {t.due_date}</p></div>))}</div>
          </div></TabsContent>
          <TabsContent value="instructions" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5"><div className="flex justify-between mb-4"><h3 className="font-heading text-lg font-medium">Instructions</h3><Button size="sm" className="rounded-full bg-[#3B5249] text-white" onClick={()=>setShowAddInstruction(true)} data-testid="add-instruction-btn"><Plus className="w-4 h-4 mr-1"/>Create</Button></div>
            <div className="space-y-3">{instructions.map(i=>(<div key={i.id} className="border border-[#E5E3DB] rounded-xl p-4"><div className="flex justify-between"><p className="font-heading font-medium">{i.title}</p><Badge variant="outline" className="text-[10px]">{i.category}</Badge></div><p className="text-sm text-[#59615D] mt-2 whitespace-pre-wrap">{i.content}</p><p className="text-xs text-[#A66E4E] mt-1">For: {i.target_role}s | By: {i.created_by_name}</p></div>))}</div>
          </div></TabsContent>
          <TabsContent value="orders" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
              <h3 className="font-heading text-lg font-medium">Orders ({orders.filter(o=>o.status==="pending").length} pending)</h3>
              <Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={()=>setShowCreateOrder(true)} data-testid="sm-create-order-btn"><Plus className="w-3 h-3 mr-1"/>Create Order</Button>
            </div>
            <div className="space-y-3">{orders.map(o=>(<div key={o.id} className="border border-[#E5E3DB] rounded-xl p-4">
              <div className="flex flex-col sm:flex-row justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap"><p className="font-mono text-xs">{o.id}</p><Badge className={`text-[9px] whitespace-nowrap ${o.status==="delivered"?"bg-green-100 text-green-800":o.status==="shipped"?"bg-blue-100 text-blue-800":o.status==="confirmed"?"bg-emerald-100 text-emerald-800":o.status==="pending"?"bg-yellow-100 text-yellow-800":"bg-red-100 text-red-800"}`}>{o.status?.toUpperCase()}</Badge></div>
                  <p className="font-medium text-sm mt-1">{o.customer_name} | {o.customer_phone}</p>
                  <p className="text-xs text-[#59615D]">{o.customer_address}</p>
                  {o.items?.map((item,idx)=>(<p key={idx} className="text-xs text-[#59615D]">{item.product_name} x{item.quantity} = Rs.{item.price*item.quantity}</p>))}
                  <p className="font-heading font-semibold text-[#3B5249] text-sm mt-1">Rs.{o.total_amount} ({o.payment_type}) | By: {o.created_by_name || "—"}</p>
                </div>
                <div className="flex gap-2 items-start flex-wrap">
                  {o.status==="pending"&&<Button size="sm" className="rounded-full text-xs bg-[#6B8E6B] text-white h-7" onClick={()=>approveOrder(o.id)}>Approve</Button>}
                  <DelhiveryShipActions order={o} role="sales_manager" onChange={fetchData} compact />
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
      <Dialog open={showAddTC} onOpenChange={setShowAddTC}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Add Telecaller</DialogTitle></DialogHeader><div className="space-y-3"><Input placeholder="Name" value={tcForm.name} onChange={e=>setTcForm(f=>({...f,name:e.target.value}))} className="rounded-xl" data-testid="tc-name-input"/><Input placeholder="Email" value={tcForm.email} onChange={e=>setTcForm(f=>({...f,email:e.target.value}))} className="rounded-xl" data-testid="tc-email-input"/><Input placeholder="Password" value={tcForm.password} onChange={e=>setTcForm(f=>({...f,password:e.target.value}))} className="rounded-xl"/><Input placeholder="Language (Malayalam, Hindi, English...)" value={tcForm.language} onChange={e=>setTcForm(f=>({...f,language:e.target.value}))} className="rounded-xl" data-testid="tc-language-input"/><Input placeholder="Place / Locality (e.g. Kakkanad)" value={tcForm.location} onChange={e=>setTcForm(f=>({...f,location:e.target.value}))} className="rounded-xl" data-testid="tc-location-input"/><Button onClick={handleAddTC} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-tc-btn">Add</Button></div></DialogContent></Dialog>
      <Dialog open={!!editingTC} onOpenChange={(o)=>{ if (!o) setEditingTC(null); }}>
        <DialogContent className="rounded-2xl" data-testid="edit-tc-dialog">
          <DialogHeader><DialogTitle className="font-heading">Edit Telecaller — {editingTC?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Name</Label><Input value={tcEditForm.name} onChange={e=>setTcEditForm(f=>({...f,name:e.target.value}))} className="rounded-xl"/></div>
            <div><Label className="text-xs">Phone</Label><Input value={tcEditForm.phone} onChange={e=>setTcEditForm(f=>({...f,phone:e.target.value}))} className="rounded-xl"/></div>
            <div><Label className="text-xs">Language</Label><Input value={tcEditForm.language} onChange={e=>setTcEditForm(f=>({...f,language:e.target.value}))} placeholder="Malayalam / Hindi / English…" className="rounded-xl" data-testid="edit-tc-language"/></div>
            <div><Label className="text-xs">Place / Locality</Label><Input value={tcEditForm.location} onChange={e=>setTcEditForm(f=>({...f,location:e.target.value}))} placeholder="e.g. Kakkanad" className="rounded-xl" data-testid="edit-tc-location"/></div>
            <Button onClick={handleEditTC} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-edit-tc">Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* TELECALLER CALL LOG VIEWER */}
      <Dialog open={!!callViewerTC} onOpenChange={(o)=>{ if (!o) setCallViewerTC(null); }}>
        <DialogContent className="rounded-2xl max-w-3xl max-h-[88vh] overflow-y-auto" data-testid="tc-calls-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">📞 {callViewerTC?.name}</DialogTitle>
            <p className="text-xs text-[#59615D]">Calls + leads owned by this telecaller.</p>
          </DialogHeader>
          <div className="space-y-3">
            {/* Section toggle */}
            <div className="flex gap-2 border-b border-[#E5E3DB]" data-testid="tc-viewer-section">
              <button onClick={()=>setCallViewerSection("calls")} className={`text-xs font-semibold px-4 py-2 -mb-px border-b-2 transition-all ${callViewerSection==="calls"?"border-[#3B5249] text-[#3B5249]":"border-transparent text-[#59615D]"}`} data-testid="section-calls">Calls ({callViewerLogs.length})</button>
              <button onClick={()=>setCallViewerSection("leads")} className={`text-xs font-semibold px-4 py-2 -mb-px border-b-2 transition-all ${callViewerSection==="leads"?"border-[#3B5249] text-[#3B5249]":"border-transparent text-[#59615D]"}`} data-testid="section-leads">Leads ({callViewerLeads.length})</button>
            </div>

            {callViewerSection === "calls" && (<>
              <div className="flex gap-2 flex-wrap" data-testid="tc-calls-range">
                {[{d:3,l:"Last 3 days"},{d:7,l:"Last 7 days"},{d:15,l:"Last 15 days"},{d:30,l:"Last 30 days"}].map(opt=>(
                  <Button key={opt.d} size="sm" variant={callViewerDays===opt.d?"default":"outline"}
                    onClick={()=>setCallViewerDays(opt.d)}
                    className={`rounded-full text-xs h-7 ${callViewerDays===opt.d?"bg-[#3B5249] text-white":"border-[#E5E3DB]"}`}
                    data-testid={`tc-calls-range-${opt.d}`}
                  >{opt.l}</Button>
                ))}
                <span className="text-xs text-[#59615D] flex items-center ml-auto" data-testid="tc-calls-count">
                  {callViewerLoading ? "Loading…" : `${callViewerLogs.length} call(s)`}
                </span>
              </div>
              {!callViewerLoading && callViewerLogs.length === 0 && (
                <p className="text-center py-8 text-sm text-[#59615D]">No calls logged in this window.</p>
              )}
              <div className="space-y-2">
                {callViewerLogs.map((c, i) => (
                  <div key={i} className="border border-[#E5E3DB] rounded-xl p-3" data-testid={`tc-call-row-${i}`}>
                    <div className="flex justify-between gap-2 flex-wrap items-start">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm">{c.customer_name || "—"} <span className="text-[#59615D] text-xs font-normal">· {c.customer_phone || "—"}</span></p>
                        {c.product_interest && <p className="text-[10px] text-[#A66E4E]">Interested: {c.product_interest}</p>}
                        {c.notes ? (
                          <p className="text-[11px] text-[#2C3531] mt-1 bg-[#F9F8F6] rounded p-2 whitespace-pre-wrap">{c.notes}</p>
                        ) : (
                          <p className="text-[10px] text-[#59615D] italic mt-1">No notes</p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        {c.outcome && <Badge className="text-[9px] capitalize bg-[#F9F8F6] text-[#3B5249] border border-[#E5E3DB]">{String(c.outcome).replace(/_/g," ")}</Badge>}
                        <p className="text-[10px] text-[#59615D] mt-1">{String(c.timestamp || "").slice(0,16).replace("T"," ")}</p>
                        {c.duration && <p className="text-[10px] text-[#59615D]">{c.duration}s</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>)}

            {callViewerSection === "leads" && (() => {
              const today = new Date().toISOString().slice(0,10);
              const visible = callViewerLeadsTodayOnly
                ? callViewerLeads.filter(l => (l.created_at || "").slice(0,10) === today)
                : callViewerLeads;
              return (<>
                <div className="flex gap-2 flex-wrap items-center" data-testid="tc-leads-toolbar">
                  <Button size="sm" variant={!callViewerLeadsTodayOnly?"default":"outline"} onClick={()=>setCallViewerLeadsTodayOnly(false)} className={`rounded-full text-xs h-7 ${!callViewerLeadsTodayOnly?"bg-[#3B5249] text-white":"border-[#E5E3DB]"}`}>All ({callViewerLeads.length})</Button>
                  <Button size="sm" variant={callViewerLeadsTodayOnly?"default":"outline"} onClick={()=>setCallViewerLeadsTodayOnly(true)} className={`rounded-full text-xs h-7 ${callViewerLeadsTodayOnly?"bg-[#3B5249] text-white":"border-[#E5E3DB]"}`} data-testid="tc-leads-today">Today only</Button>
                  <span className="text-xs text-[#59615D] ml-auto">{visible.length} lead(s)</span>
                </div>
                {!callViewerLoading && visible.length === 0 && (
                  <p className="text-center py-8 text-sm text-[#59615D]">{callViewerLeadsTodayOnly ? "No leads added today." : "No leads yet."}</p>
                )}
                <div className="space-y-1">
                  {visible.map(l => (
                    <div key={l.id} className="border border-[#E5E3DB] rounded-xl p-2 flex justify-between items-center text-xs gap-2 flex-wrap" data-testid={`tc-lead-${l.id}`}>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{l.name || "—"} <span className="text-[#59615D] font-normal">· {l.phone_number}</span></p>
                        {l.product_interest && <p className="text-[10px] text-[#A66E4E]">{l.product_interest}</p>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <Badge variant="outline" className="text-[9px] capitalize">{String(l.status||"").replace(/_/g," ")}</Badge>
                        <p className="text-[10px] text-[#59615D] mt-0.5">{(l.created_at||"").slice(0,10)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>);
            })()}

            <Button variant="outline" onClick={()=>setCallViewerTC(null)} className="w-full rounded-full">Close</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={showAddTask} onOpenChange={setShowAddTask}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Create Task</DialogTitle></DialogHeader><div className="space-y-3"><Input placeholder="Title" value={taskForm.title} onChange={e=>setTaskForm(f=>({...f,title:e.target.value}))} className="rounded-xl" data-testid="task-title-input"/><Textarea placeholder="Description" value={taskForm.description} onChange={e=>setTaskForm(f=>({...f,description:e.target.value}))} className="rounded-xl"/><Select value={taskForm.assigned_to} onValueChange={v=>{const t=telecallers.find(x=>x.id===v);setTaskForm(f=>({...f,assigned_to:v,assigned_to_name:t?.name||""}));}}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Assign to"/></SelectTrigger><SelectContent>{telecallers.map(t=><SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select><Select value={taskForm.priority} onValueChange={v=>setTaskForm(f=>({...f,priority:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="high">High</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="low">Low</SelectItem></SelectContent></Select><Input type="date" value={taskForm.due_date} onChange={e=>setTaskForm(f=>({...f,due_date:e.target.value}))} className="rounded-xl"/><Button onClick={handleAddTask} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-task-btn">Create</Button></div></DialogContent></Dialog>
      <Dialog open={showAddInstruction} onOpenChange={setShowAddInstruction}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Create Instruction</DialogTitle></DialogHeader><div className="space-y-3"><Input placeholder="Title (e.g. How to Call)" value={instForm.title} onChange={e=>setInstForm(f=>({...f,title:e.target.value}))} className="rounded-xl" data-testid="inst-title-input"/><Select value={instForm.category} onValueChange={v=>setInstForm(f=>({...f,category:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="calling">Calling</SelectItem><SelectItem value="home_visit">Home Visit</SelectItem><SelectItem value="sales">Sales</SelectItem><SelectItem value="general">General</SelectItem></SelectContent></Select><Select value={instForm.target_role} onValueChange={v=>setInstForm(f=>({...f,target_role:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="telecaller">Telecallers</SelectItem><SelectItem value="agent">Agents</SelectItem></SelectContent></Select><Textarea placeholder="Instruction content..." value={instForm.content} onChange={e=>setInstForm(f=>({...f,content:e.target.value}))} className="rounded-xl min-h-[120px]" data-testid="inst-content-input"/><Button onClick={handleAddInstruction} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-inst-btn">Create</Button></div></DialogContent></Dialog>
      <Dialog open={showAddContact} onOpenChange={setShowAddContact}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Add Contact</DialogTitle></DialogHeader><div className="space-y-3"><Input placeholder="Name" value={contactForm.name} onChange={e=>setContactForm(f=>({...f,name:e.target.value}))} className="rounded-xl" data-testid="contact-name-input"/><Input placeholder="Phone" value={contactForm.phone} onChange={e=>setContactForm(f=>({...f,phone:e.target.value}))} className="rounded-xl"/><Input placeholder="Email" value={contactForm.email} onChange={e=>setContactForm(f=>({...f,email:e.target.value}))} className="rounded-xl"/><Select value={contactForm.type} onValueChange={v=>setContactForm(f=>({...f,type:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="influencer">Influencer</SelectItem><SelectItem value="collaborator">Collaborator</SelectItem><SelectItem value="vendor">Vendor</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select><Textarea placeholder="Notes / Summary" value={contactForm.notes} onChange={e=>setContactForm(f=>({...f,notes:e.target.value}))} className="rounded-xl"/><Button onClick={handleAddContact} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-contact-btn">Add</Button></div></DialogContent></Dialog>

      {/* ADD ASM DIALOG */}
      <Dialog open={showAddAsm} onOpenChange={setShowAddAsm}>
        <DialogContent className="rounded-2xl max-h-[85vh] overflow-y-auto" data-testid="add-asm-dialog">
          <DialogHeader><DialogTitle className="font-heading">Add Assistant Sales Manager</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-[11px] text-[#59615D]">A welcome email with login credentials will be sent automatically. Your ASM will be CC&apos;d on every instruction sent to you.</p>
            <div><Label className="text-xs">Full Name *</Label><Input value={asmForm.name} onChange={e=>setAsmForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Ravi Kumar" className="rounded-xl" data-testid="asm-name-input"/></div>
            <div><Label className="text-xs">Email *</Label><Input value={asmForm.email} onChange={e=>setAsmForm(f=>({...f,email:e.target.value}))} placeholder="ravi@celestaglow.com" className="rounded-xl" data-testid="asm-email-input"/></div>
            <div><Label className="text-xs">Phone *</Label><Input value={asmForm.phone} onChange={e=>setAsmForm(f=>({...f,phone:e.target.value}))} placeholder="9999900011" className="rounded-xl" data-testid="asm-phone-input"/></div>
            <div><Label className="text-xs">Password (leave blank for default &apos;asm123&apos;)</Label><Input value={asmForm.password} onChange={e=>setAsmForm(f=>({...f,password:e.target.value}))} placeholder="Optional" className="rounded-xl"/></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Salary (Rs./month)</Label><Input type="number" value={asmForm.salary} onChange={e=>setAsmForm(f=>({...f,salary:Number(e.target.value)||0}))} className="rounded-xl"/></div>
              <div><Label className="text-xs">Incentive (Rs.)</Label><Input type="number" value={asmForm.incentive} onChange={e=>setAsmForm(f=>({...f,incentive:Number(e.target.value)||0}))} className="rounded-xl"/></div>
            </div>
            <Button onClick={handleAddAsm} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-asm-btn">Add Asst Sales Manager</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* EDIT ASM DIALOG */}
      <Dialog open={showEditAsm} onOpenChange={(o)=>{setShowEditAsm(o); if(!o)setEditingAsm(null);}}>
        <DialogContent className="rounded-2xl max-h-[85vh] overflow-y-auto" data-testid="edit-asm-dialog">
          <DialogHeader><DialogTitle className="font-heading">Edit ASM — {editingAsm?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Full Name</Label><Input value={asmForm.name} onChange={e=>setAsmForm(f=>({...f,name:e.target.value}))} className="rounded-xl"/></div>
            <div><Label className="text-xs">Email</Label><Input value={asmForm.email} onChange={e=>setAsmForm(f=>({...f,email:e.target.value}))} className="rounded-xl"/></div>
            <div><Label className="text-xs">Phone</Label><Input value={asmForm.phone} onChange={e=>setAsmForm(f=>({...f,phone:e.target.value}))} className="rounded-xl"/></div>
            <div><Label className="text-xs">New Password (leave blank to keep current)</Label><Input value={asmForm.password} onChange={e=>setAsmForm(f=>({...f,password:e.target.value}))} placeholder="Optional" className="rounded-xl"/></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Salary</Label><Input type="number" value={asmForm.salary} onChange={e=>setAsmForm(f=>({...f,salary:Number(e.target.value)||0}))} className="rounded-xl"/></div>
              <div><Label className="text-xs">Incentive</Label><Input type="number" value={asmForm.incentive} onChange={e=>setAsmForm(f=>({...f,incentive:Number(e.target.value)||0}))} className="rounded-xl"/></div>
            </div>
            <Button onClick={handleEditAsm} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-edit-asm-btn">Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* CREATE ORDER DIALOG (SM direct order) */}
      <Dialog open={showCreateOrder} onOpenChange={setShowCreateOrder}>
        <DialogContent className="rounded-2xl max-h-[90vh] overflow-y-auto" data-testid="sm-create-order-dialog">
          <DialogHeader><DialogTitle className="font-heading">Create Order</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-[11px] text-[#59615D]">Use this when you need to log a sale directly (e.g. walk-in or phone order taken yourself). For team orders, your telecallers should create them from their own dashboard.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div><Label className="text-xs">Customer Name *</Label><Input value={orderForm.customer_name} onChange={e=>setOrderForm(f=>({...f,customer_name:e.target.value}))} className="rounded-xl" data-testid="sm-order-name"/></div>
              <div><Label className="text-xs">Phone *</Label><Input value={orderForm.customer_phone} onChange={e=>setOrderForm(f=>({...f,customer_phone:e.target.value}))} className="rounded-xl" data-testid="sm-order-phone"/></div>
            </div>
            <div><Label className="text-xs">Address *</Label><Textarea value={orderForm.customer_address} onChange={e=>setOrderForm(f=>({...f,customer_address:e.target.value}))} className="rounded-xl" data-testid="sm-order-address"/></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div><Label className="text-xs">City</Label><Input value={orderForm.customer_city} onChange={e=>setOrderForm(f=>({...f,customer_city:e.target.value}))} className="rounded-xl"/></div>
              <div><Label className="text-xs">Pincode</Label><Input value={orderForm.customer_pincode} onChange={e=>setOrderForm(f=>({...f,customer_pincode:e.target.value}))} className="rounded-xl"/></div>
            </div>
            <div className="rounded-xl border border-[#E5E3DB] p-3 bg-[#F9F8F6] space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-[#59615D] font-semibold">Product</p>
              <Input placeholder="Product name *" value={orderForm.product_name} onChange={e=>setOrderForm(f=>({...f,product_name:e.target.value}))} className="rounded-xl" data-testid="sm-order-product"/>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-[10px]">Qty</Label><Input type="number" min="1" value={orderForm.quantity} onChange={e=>setOrderForm(f=>({...f,quantity:e.target.value}))} className="rounded-xl"/></div>
                <div><Label className="text-[10px]">Unit Price (Rs.) *</Label><Input type="number" min="0" value={orderForm.price} onChange={e=>setOrderForm(f=>({...f,price:e.target.value}))} className="rounded-xl" data-testid="sm-order-price"/></div>
              </div>
              <p className="text-[11px] text-right font-heading text-[#3B5249]">Total: Rs.{(Number(orderForm.quantity)||1) * (Number(orderForm.price)||0)}</p>
            </div>
            <div><Label className="text-xs">Payment Type</Label>
              <Select value={orderForm.payment_type} onValueChange={v=>setOrderForm(f=>({...f,payment_type:v}))}>
                <SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cod">Cash on Delivery</SelectItem>
                  <SelectItem value="prepaid">Prepaid (Online)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreateOrder} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="sm-submit-order-btn">Create Order</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
