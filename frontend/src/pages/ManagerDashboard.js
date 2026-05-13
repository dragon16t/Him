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
import { LogOut, ShoppingBag, Users, MapPin, IndianRupee, Package, Check, X, Plus, Loader2, UserCheck, ClipboardList, Wallet, Sparkles, Phone, PhoneCall } from "lucide-react";
import RoleGuidelines from "../components/RoleGuidelines";
import MonthFilter, { filterByMonth } from "../components/MonthFilter";
import AttendanceCheckIn from "../components/AttendanceCheckIn";
import NotificationBell from "../components/NotificationBell";
import GlobalSearch from "../components/GlobalSearch";
import TeamActivityPanel from "../components/TeamActivityPanel";
import TeamGroupsPanel from "../components/TeamGroupsPanel";

const API = "/api";

export default function ManagerDashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const [stats, setStats] = useState({});
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [regions, setRegions] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [agents, setAgents] = useState([]);
  const [fundRequests, setFundRequests] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [followUps, setFollowUps] = useState({repeat_due:[],repeat_upcoming:[],relationship_due:[],relationship_upcoming:[],total_repeat:0,total_relationship:0});
  const [hiringCandidates, setHiringCandidates] = useState([]);
  const [callLogs, setCallLogs] = useState([]);
  const [month, setMonth] = useState((new Date().getMonth()+1).toString());
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [loading, setLoading] = useState(true);
  const [myDistricts, setMyDistricts] = useState([]);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddRegion, setShowAddRegion] = useState(false);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showGenLocalities, setShowGenLocalities] = useState(false);
  const [productForm, setProductForm] = useState({ name: "", category: "sunscreen", price: 0, description: "", stock: 0 });
  const [regionForm, setRegionForm] = useState({ name: "", district: "", pincode: "", areas: "" });
  const [agentForm, setAgentForm] = useState({ name: "", email: "", password: "", district: "", area: "", region_id: "", phone: "", language: "" });
  const [editingAgent, setEditingAgent] = useState(null);
  const [agentEditForm, setAgentEditForm] = useState({ name: "", phone: "", language: "", area: "", district: "" });
  const [taskForm, setTaskForm] = useState({ title: "", description: "", assigned_to: "", assigned_to_name: "", assigned_to_role: "agent", priority: "medium", due_date: "" });
  // Assistant District Managers (ADMs)
  const [adms, setAdms] = useState([]);
  const [showAddAdm, setShowAddAdm] = useState(false);
  const [showEditAdm, setShowEditAdm] = useState(false);
  const [editingAdm, setEditingAdm] = useState(null);
  const [admForm, setAdmForm] = useState({name:"",email:"",phone:"",password:"",salary:0,incentive:0,district:""});
  const [genDistrict, setGenDistrict] = useState("");
  const [genLocalities, setGenLocalities] = useState([]);
  const [genLoading, setGenLoading] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [s, o, p, r, c, a, fr, t] = await Promise.all([
        axios.get(`${API}/dashboard/stats`), axios.get(`${API}/orders`), axios.get(`${API}/products`),
        axios.get(`${API}/regions`), axios.get(`${API}/commissions/all`), axios.get(`${API}/agents`),
        axios.get(`${API}/fund-requests`), axios.get(`${API}/tasks`)
      ]);
      setStats(s.data.stats); setOrders(o.data.orders); setProducts(p.data.products);
      setRegions(r.data.regions); setCommissions(c.data.commissions); setAgents(a.data.agents);
      setFundRequests(fr.data.fund_requests); setTasks(t.data.tasks);
      try { const dm = await axios.get(`${API}/dm/my-districts`); setMyDistricts(dm.data.districts); setRegions(dm.data.regions); } catch {}
      try { const hc = await axios.get(`${API}/hiring/candidates`); setHiringCandidates(hc.data.entries||[]); } catch {}
      try { const cl = await axios.get(`${API}/call-logs/all`); setCallLogs(cl.data.call_logs||[]); } catch {}
      try { const a = await axios.get(`${API}/my-team/adms`); setAdms(a.data.adms||[]); } catch {}
    } catch (err) { console.error(err); }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const approveOrder = async (id) => { try { await axios.put(`${API}/orders/${id}/approve`); toast.success("Approved!"); fetchData(); } catch (e) { toast.error(e.response?.data?.detail || "Failed"); } };
  const rejectOrder = async (id) => { try { await axios.put(`${API}/orders/${id}/reject`, { reason: "Rejected" }); toast.success("Rejected"); fetchData(); } catch { toast.error("Failed"); } };
  const handleAddProduct = async () => { if (!productForm.name) return toast.error("Name required"); try { await axios.post(`${API}/products`, {...productForm,price:Number(productForm.price),stock:Number(productForm.stock)}); toast.success("Added"); setShowAddProduct(false); fetchData(); } catch { toast.error("Failed"); } };
  const handleAddRegion = async () => { if (!regionForm.name) return toast.error("Name required"); try { await axios.post(`${API}/regions`, {...regionForm,state:"Kerala",areas:regionForm.areas.split(",").map(a=>a.trim()).filter(Boolean)}); toast.success("Added"); setShowAddRegion(false); fetchData(); } catch { toast.error("Failed"); } };
  const handleAddAgent = async () => { if (!agentForm.name || !agentForm.email) return toast.error("Fill required fields"); if (!agentForm.phone) return toast.error("Phone number is mandatory"); try { await axios.post(`${API}/agents`, agentForm); toast.success("Agent added"); setShowAddAgent(false); setAgentForm({name:"",email:"",password:"",district:"",area:"",region_id:"",phone:"",language:""}); fetchData(); } catch (e) { toast.error(e.response?.data?.detail || "Failed"); } };
  const openEditAgent = (a) => { setEditingAgent(a); setAgentEditForm({ name: a.name || "", phone: a.phone || "", language: a.language || "", area: a.area || "", district: a.district || "" }); };
  const handleEditAgent = async () => {
    if (!editingAgent) return;
    try {
      await axios.put(`${API}/agents/${editingAgent.id}`, agentEditForm);
      toast.success("Agent updated");
      setEditingAgent(null);
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const handleAddTask = async () => { if (!taskForm.title || !taskForm.assigned_to) return toast.error("Fill required"); try { await axios.post(`${API}/tasks`, taskForm); toast.success("Task created"); setShowAddTask(false); fetchData(); } catch { toast.error("Failed"); } };
  const approveFund = async (id, status) => { try { await axios.put(`${API}/fund-requests/${id}/approve`, {status}); toast.success("Updated"); fetchData(); } catch { toast.error("Failed"); } };
  const markPaid = async (id) => { try { await axios.put(`${API}/commissions/${id}/pay`, {paid_via:"bank_transfer"}); toast.success("Paid"); fetchData(); } catch { toast.error("Failed"); } };
  const generateLocalities = async () => { if (!genDistrict) return; setGenLoading(true); try { const {data} = await axios.post(`${API}/ai/generate-localities`, {district:genDistrict}); setGenLocalities(data.localities || []); } catch { toast.error("AI failed"); } setGenLoading(false); };
  const saveLocalities = async () => { if (!selectedRegion || genLocalities.length === 0) return; try { await axios.put(`${API}/regions/${selectedRegion.id}`, {localities: genLocalities}); toast.success("Localities saved!"); setShowGenLocalities(false); fetchData(); } catch { toast.error("Failed"); } };
  const updateAgent = async (agentId, data) => { try { await axios.put(`${API}/users/${agentId}/update`, data); toast.success("Updated"); fetchData(); } catch { toast.error("Failed"); } };
  const handleAddAdm = async () => {
    if (!admForm.name || !admForm.email || !admForm.phone) return toast.error("Name, email and phone are required");
    try {
      await axios.post(`${API}/my-team/adm`, admForm);
      toast.success("Assistant District Manager added — welcome email sent");
      setShowAddAdm(false);
      setAdmForm({name:"",email:"",phone:"",password:"",salary:0,incentive:0,district:""});
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const openEditAdm = (a) => {
    setEditingAdm(a);
    setAdmForm({name:a.name||"",email:a.email||"",phone:a.phone||"",password:"",salary:a.salary||0,incentive:a.incentive||0,district:a.district||""});
    setShowEditAdm(true);
  };
  const handleEditAdm = async () => {
    if (!editingAdm) return;
    try {
      const payload = {...admForm};
      if (!payload.password) delete payload.password;
      await axios.put(`${API}/my-team/adm/${editingAdm.id}`, payload);
      toast.success("ADM updated");
      setShowEditAdm(false); setEditingAdm(null);
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const [editLocality, setEditLocality] = useState({ regionId: "", index: -1, value: "" });
  const updateLocality = async (regionId, localities) => {
    try { await axios.put(`${API}/regions/${regionId}`, { localities }); toast.success("Localities updated"); fetchData(); } catch { toast.error("Failed"); }
  };
  const removeLocality = async (regionId, index) => {
    const r = regions.find(x => x.id === regionId);
    if (!r) return;
    const newLocs = [...(r.localities || [])];
    newLocs.splice(index, 1);
    await updateLocality(regionId, newLocs);
  };
  const saveLocalityEdit = async () => {
    if (!editLocality.regionId || editLocality.index < 0) return;
    const r = regions.find(x => x.id === editLocality.regionId);
    if (!r) return;
    const newLocs = [...(r.localities || [])];
    newLocs[editLocality.index] = editLocality.value;
    await updateLocality(editLocality.regionId, newLocs);
    setEditLocality({ regionId: "", index: -1, value: "" });
  };

  const logout = () => { localStorage.clear(); navigate("/login"); };
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F9F8F6]"><Loader2 className="w-8 h-8 animate-spin text-[#3B5249]" /></div>;
  const filteredOrders = filterByMonth(orders, month, year);
  const filteredCallLogs = filterByMonth(callLogs, month, year);
  const monthRevenue = filteredOrders.filter(o=>o.status==="delivered").reduce((s,o)=>s+(o.total_amount||0),0);
  const agentCandidates = hiringCandidates.filter(c => c.status !== "hired" && c.status !== "rejected");
  const pendingOrders = filteredOrders.filter(o => o.status === "pending");
  const confirmedOrders = filteredOrders.filter(o => o.status === "confirmed");
  const pendingFunds = fundRequests.filter(f => f.status === "pending");
  const hireCandidate = async (cid) => { try { await axios.post(`${API}/hiring/approve/${cid}`,{action:"select"}); toast.success("Selected — HR will finalize hiring"); fetchData(); } catch(e){ toast.error(e.response?.data?.detail||"Failed"); } };
  const rejectCandidate = async (cid) => { try { await axios.post(`${API}/hiring/approve/${cid}`,{action:"reject"}); toast.success("Rejected"); fetchData(); } catch{ toast.error("Failed"); } };

  return (
    <div className="min-h-screen bg-[#F9F8F6]" data-testid="manager-dashboard">
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#F9F8F6]/80 border-b border-[#E5E3DB]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div><h1 className="font-heading text-2xl font-medium text-[#2C3531]">Celesta <span className="text-[#3B5249] font-semibold">Glow</span></h1><p className="text-xs text-[#59615D] uppercase tracking-[0.15em]">District Manager - {user.name}</p></div>
          <div className="flex items-center gap-2">
            <AttendanceCheckIn />
            <Button variant="outline" onClick={logout} className="rounded-full border-[#E5E3DB]" data-testid="logout-btn"><LogOut className="w-4 h-4 mr-2" />Logout</Button>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <RoleGuidelines role="district_manager" />
        <MonthFilter month={month} year={year} onMonthChange={setMonth} onYearChange={setYear} />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {[{l:"Orders",v:filteredOrders.length,i:ShoppingBag,c:"#3B5249"},{l:"Pending",v:pendingOrders.length,i:ClipboardList,c:"#D4A373"},{l:"Agents",v:agents.length,i:UserCheck,c:"#6B8E6B"},{l:"Hire Queue",v:agentCandidates.length,i:Users,c:"#A66E4E"},{l:"Revenue",v:`Rs.${monthRevenue}`,i:IndianRupee,c:"#3B5249"}].map((s,i)=>(
            <div key={i} className="bg-white rounded-2xl border border-[#E5E3DB] p-5 hover:shadow-md transition-all hover:-translate-y-1"><s.i className="w-5 h-5 mb-3" style={{color:s.c}}/><p className="font-heading text-2xl font-semibold">{s.v}</p><p className="text-xs text-[#59615D] uppercase tracking-wider mt-1">{s.l}</p></div>
          ))}
        </div>

        {/* ASSISTANT DISTRICT MANAGERS PANEL */}
        <div className="bg-white rounded-2xl border border-[#E5E3DB] p-5 mb-6" data-testid="dm-adm-panel">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <div>
              <h3 className="font-heading text-lg font-medium">My Assistant District Managers</h3>
              <p className="text-[11px] text-[#59615D]">Manage your Asst DMs. They will be CC&apos;d on every instruction & email sent to you.</p>
            </div>
            <Button size="sm" className="rounded-full bg-[#3B5249] text-white" onClick={()=>{setAdmForm({name:"",email:"",phone:"",password:"",salary:0,incentive:0,district:""});setShowAddAdm(true);}} data-testid="dm-add-adm-btn"><Plus className="w-4 h-4 mr-1"/>Add Asst DM</Button>
          </div>
          {adms.length === 0 ? (
            <div className="text-center py-6 border-2 border-dashed border-[#E5E3DB] rounded-xl">
              <Users className="w-8 h-8 mx-auto text-[#A0A39E] mb-2"/>
              <p className="text-sm text-[#59615D]">No Assistant District Manager yet</p>
              <p className="text-[11px] text-[#A0A39E]">Click &quot;Add Asst DM&quot; to add one — they will receive welcome credentials.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {adms.map(a => (
                <div key={a.id} className="border border-[#E5E3DB] rounded-xl p-4 hover:shadow-sm transition-shadow" data-testid={`adm-card-${a.id}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-heading font-medium text-[#2C3531]">{a.name}</p>
                      <Badge variant="outline" className="text-[9px] bg-[#F9F8F6] mt-1">Asst District Mgr</Badge>
                      {a.district && <Badge variant="outline" className="text-[9px] bg-[#F9F8F6] mt-1 ml-1">{a.district}</Badge>}
                    </div>
                    <Button size="sm" variant="outline" className="h-7 text-[10px] rounded-full" onClick={()=>openEditAdm(a)} data-testid={`adm-edit-${a.id}`}>Edit</Button>
                  </div>
                  <div className="space-y-1 text-xs text-[#59615D]">
                    <p className="break-all">{a.email}</p>
                    {a.phone && (
                      <p className="flex items-center justify-between gap-1.5">
                        <span>{a.phone}</span>
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
        <Tabs defaultValue="orders" className="space-y-6">
          <TabsList className="bg-white border border-[#E5E3DB] rounded-full p-1 h-auto flex-wrap">
            {[{v:"orders",l:"Orders"},{v:"agents",l:"Agents"},{v:"activity",l:"Activity"},{v:"groups",l:"Groups"},{v:"repeat",l:`Repeat (${followUps.total_repeat})`},{v:"relationship",l:`Relation (${followUps.total_relationship})`},{v:"hiring",l:`Hiring (${agentCandidates.length})`},{v:"calllogs",l:`Call Logs (${filteredCallLogs.length})`},{v:"regions",l:"Regions"},{v:"products",l:"Products"},{v:"tasks",l:"Tasks"},{v:"funds",l:"Fund Req"},{v:"commissions",l:"Commissions"},{v:"mysheet",l:"My Sheet"}].map(t=>(
              <TabsTrigger key={t.v} value={t.v} className="rounded-full text-xs data-[state=active]:bg-[#3B5249] data-[state=active]:text-white px-3" data-testid={`tab-${t.v}`}>{t.l}</TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="activity" className="animate-fade-in"><TeamActivityPanel /></TabsContent>
          <TabsContent value="groups" className="animate-fade-in"><TeamGroupsPanel candidates={agents} candidateLabel="Agents" /></TabsContent>
          <TabsContent value="orders" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
            <h3 className="font-heading text-lg font-medium mb-4">Orders ({pendingOrders.length} pending, {confirmedOrders.length} to ship)</h3>
            {filteredOrders.length===0?<div className="p-10 text-center text-[#59615D]">No orders</div>:
            <div className="space-y-3">{filteredOrders.map(o=>(<div key={o.id} className="border border-[#E5E3DB] rounded-xl p-4" data-testid={`order-${o.id}`}>
              <div className="flex flex-col sm:flex-row justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap"><p className="font-mono text-xs font-medium">{o.id}</p><Badge className={`text-[9px] whitespace-nowrap ${o.status==="delivered"?"bg-green-100 text-green-800":o.status==="shipped"?"bg-blue-100 text-blue-800":o.status==="confirmed"?"bg-emerald-100 text-emerald-800":o.status==="pending"?"bg-yellow-100 text-yellow-800":"bg-red-100 text-red-800"}`}>{o.status?.toUpperCase()}</Badge></div>
                  <p className="font-medium text-sm mt-1">{o.customer_name} | {o.customer_phone}</p>
                  <p className="text-xs text-[#59615D]">{o.customer_address}</p>
                  {o.items?.map((item,idx)=>(<p key={idx} className="text-xs text-[#59615D]">{item.product_name} x{item.quantity} = Rs.{item.price*item.quantity}</p>))}
                  <p className="font-heading font-semibold text-[#3B5249] mt-1">Total: Rs.{o.total_amount} <span className="font-normal text-xs text-[#59615D]">({o.payment_type}) | By: {o.created_by_name}</span></p>
                </div>
                <div className="flex flex-wrap gap-2 items-start">
                  {o.status==="pending"&&<><Button size="sm" className="rounded-full text-xs bg-[#6B8E6B] text-white h-7" onClick={()=>approveOrder(o.id)} data-testid={`approve-${o.id}`}><Check className="w-3 h-3 mr-1"/>Approve</Button><Button size="sm" variant="outline" className="rounded-full text-xs h-7 text-red-500" onClick={()=>rejectOrder(o.id)}><X className="w-3 h-3"/></Button></>}
                  {o.status==="confirmed"&&<Button size="sm" className="rounded-full text-xs bg-blue-600 text-white h-7" onClick={async()=>{const tl=window.prompt("Enter tracking link (e.g. https://shiprocket.in/track/XYZ):"); if(!tl||!tl.trim()) return toast.error("Tracking link is required"); const cn=window.prompt("Courier (Shiprocket/Delhivery/Bluedart/DTDC):","Shiprocket")||""; const tn=window.prompt("Tracking number (optional):","")||"";try{await axios.put(`${API}/orders/${o.id}/ship`,{tracking_link:tl.trim(),courier_name:cn,tracking_number:tn});toast.success("Shipped! Tracking saved.");fetchData();}catch(e){toast.error(e.response?.data?.detail||"Failed");}}} data-testid={`ship-${o.id}`}><Package className="w-3 h-3 mr-1"/>Ship Today</Button>}
                </div>
              </div>
            </div>))}</div>}
          </div></TabsContent>
          <TabsContent value="agents" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5"><div className="flex justify-between items-center mb-4"><h3 className="font-heading text-lg font-medium">Agents ({agents.length})</h3><Button size="sm" className="rounded-full bg-[#3B5249] text-white" onClick={()=>setShowAddAgent(true)} data-testid="add-agent-btn"><Plus className="w-4 h-4 mr-1"/>Add Agent</Button></div>
            <div className="space-y-3">{agents.map(a=>(<div key={a.id} className="border border-[#E5E3DB] rounded-xl p-4" data-testid={`agent-${a.id}`}>
              <div className="flex justify-between items-start">
                <div><p className="font-heading font-medium">{a.name}</p><p className="text-xs text-[#59615D]">{a.email} {a.phone&&<span>| {a.phone}</span>}</p><p className="text-xs text-[#A66E4E] mt-0.5"><MapPin className="w-3 h-3 inline mr-1"/>{a.area}, {a.district}</p></div>
                <div className="flex gap-1 flex-shrink-0">
                  <Button size="sm" variant="outline" className="rounded-full h-8 w-8 p-0 border-[#A66E4E] text-[#A66E4E] hover:bg-[#A66E4E] hover:text-white" onClick={()=>openEditAgent(a)} data-testid={`edit-agent-${a.id}`}>✎</Button>
                  {a.phone&&<a href={`tel:${a.phone}`}><Button size="sm" variant="outline" className="rounded-full h-8 text-xs"><Phone className="w-3 h-3 mr-1"/>Call</Button></a>}
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {a.language && <Badge variant="outline" className="text-[10px] bg-[#F9F8F6]" data-testid={`ag-lang-${a.id}`}>🗣 {a.language}</Badge>}
                {(a.locality || a.location || a.city) && <Badge variant="outline" className="text-[10px] bg-[#F9F8F6]" data-testid={`ag-place-${a.id}`}>📍 {a.locality || a.location || a.city}</Badge>}
              </div>
              <div className="grid grid-cols-4 gap-2 mt-3 text-center">
                <div className="bg-[#F9F8F6] rounded-lg p-2"><p className="text-[9px] text-[#59615D]">Total Sales</p><p className="font-heading text-sm font-semibold">Rs.{a.total_sales_amount||0}</p></div>
                <div className="bg-[#F9F8F6] rounded-lg p-2"><p className="text-[9px] text-[#59615D]">Today</p><p className="font-heading text-sm font-semibold text-[#6B8E6B]">Rs.{a.sales_today||0}</p></div>
                <div className="bg-[#F9F8F6] rounded-lg p-2"><p className="text-[9px] text-[#59615D]">Last 7d</p><p className="font-heading text-sm font-semibold text-[#A66E4E]">Rs.{a.sales_7days||0}</p></div>
                <div className="bg-[#F9F8F6] rounded-lg p-2"><p className="text-[9px] text-[#59615D]">Commission</p><p className="font-heading text-sm font-semibold text-[#3B5249]">Rs.{a.commission_total||0}</p><p className="text-[8px] text-[#D4A373]">Pending: Rs.{a.commission_pending||0}</p></div>
              </div>
              {/* Call Logs */}
              {a.call_logs?.length>0&&<div className="mt-2 border-t border-[#E5E3DB] pt-2"><p className="text-[10px] text-[#59615D] font-medium">Recent Call Logs:</p>{a.call_logs.slice(0,3).map(cl=>(<p key={cl.id} className="text-[10px] text-[#59615D]">{cl.call_date} - {cl.details} ({cl.caller_name})</p>))}</div>}
              <Button size="sm" variant="outline" className="rounded-full text-[10px] mt-2 h-6" onClick={async()=>{const details=prompt(`Log call with ${a.name}:`);if(!details)return;try{await axios.post(`${API}/agents/${a.id}/call-log`,{details});toast.success("Call logged!");fetchData();}catch{toast.error("Failed");}}} data-testid={`log-agent-call-${a.id}`}>Log Call</Button>
              <Button size="sm" variant="outline" className="rounded-full text-[10px] mt-1 h-6 text-[#A66E4E] border-[#A66E4E]" onClick={async()=>{if(!window.confirm(`Promote ${a.name} to Asst District Manager?`))return;try{await axios.post(`${API}/promote/agent-to-adm`,{agent_id:a.id});toast.success("Promoted!");fetchData();}catch(e){toast.error(e.response?.data?.detail||"Failed");}}} data-testid={`promote-${a.id}`}>Promote to Asst DM</Button>
            </div>))}</div>
          </div></TabsContent>
          {/* REPEAT ORDERS */}
          <TabsContent value="repeat" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
            <h3 className="font-heading text-lg font-medium mb-4">Repeat Orders — Agents ({followUps.repeat_due.length} due)</h3>
            {followUps.repeat_due.length===0&&followUps.repeat_upcoming.length===0?<p className="text-center py-6 text-[#59615D] text-sm">No repeat orders pending</p>:<>
            {followUps.repeat_due.length>0&&<div className="mb-4"><p className="text-xs font-medium text-[#B75D69] mb-2 uppercase">Due Now</p><div className="space-y-2">{followUps.repeat_due.map(l=>(
              <div key={l.id} className="border border-orange-200 bg-orange-50 rounded-xl p-3" data-testid={`dm-repeat-due-${l.id}`}>
                <div className="flex justify-between gap-2 flex-wrap items-start">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{l.name} <span className="text-[#59615D] text-xs font-normal">· {l.phone_number}</span></p>
                    <p className="text-[11px] text-[#59615D]">Agent: <b className="text-[#3B5249]">{l.assigned_to_name || l.assigned_to || "—"}</b></p>
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
                <span className="flex-1"><b>{l.name}</b> · {l.phone_number} {l.assigned_to_name && <span className="text-[#59615D]">· Agent: {l.assigned_to_name}</span>} {(l.last_order_products || l.product_interest) && <span className="text-[#59615D]"> · {l.last_order_products || l.product_interest}</span>}</span>
                <span className="text-[#A66E4E] whitespace-nowrap">{l.next_repeat_order_date}{l.last_order_amount > 0 && ` · Rs.${l.last_order_amount}`}</span>
              </div>
            ))}</div></div>}
            </>}
          </div></TabsContent>
          {/* RELATIONSHIP CALLS */}
          <TabsContent value="relationship" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
            <h3 className="font-heading text-lg font-medium mb-4">Relationship Calls — Agents ({followUps.relationship_due.length} due)</h3>
            {followUps.relationship_due.length===0&&followUps.relationship_upcoming.length===0?<p className="text-center py-6 text-[#59615D] text-sm">No relationship calls pending</p>:<>
            {followUps.relationship_due.length>0&&<div className="mb-4"><p className="text-xs font-medium text-[#B75D69] mb-2 uppercase">Due Now</p><div className="space-y-2">{followUps.relationship_due.map(l=>(
              <div key={l.id} className="border border-pink-200 bg-pink-50 rounded-xl p-3" data-testid={`dm-rel-due-${l.id}`}>
                <div className="flex justify-between gap-2 flex-wrap items-start">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{l.name} <span className="text-[#59615D] text-xs font-normal">· {l.phone_number}</span></p>
                    <p className="text-[11px] text-[#59615D]">Agent: <b className="text-[#3B5249]">{l.assigned_to_name || l.assigned_to || "—"}</b></p>
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
                <span className="flex-1"><b>{l.name}</b> · {l.phone_number} {l.assigned_to_name && <span className="text-[#59615D]">· Agent: {l.assigned_to_name}</span>} {(l.last_order_products || l.product_interest) && <span className="text-[#59615D]"> · {l.last_order_products || l.product_interest}</span>}</span>
                <span className="text-[#D4A373] whitespace-nowrap">{l.next_relationship_date}{l.last_order_amount > 0 && ` · Rs.${l.last_order_amount}`}</span>
              </div>
            ))}</div></div>}
            </>}
          </div></TabsContent>
          {/* NEW HIRING */}
          <TabsContent value="hiring" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
            <h3 className="font-heading text-lg font-medium mb-4">New Hiring — Agent Candidates ({agentCandidates.length})</h3>
            <p className="text-xs text-[#59615D] mb-4">Candidates from HR/In-House telecaller. Hire creates user automatically.</p>
            {agentCandidates.length === 0 ? <p className="text-center py-6 text-[#59615D] text-sm">No agent candidates pending</p> :
              <div className="space-y-2" data-testid="dm-hiring-list">{agentCandidates.map(c=>(
                <div key={c.id} className="border border-[#E5E3DB] rounded-xl p-3 flex flex-col sm:flex-row justify-between gap-2" data-testid={`dm-cand-${c.id}`}>
                  <div><p className="font-medium text-sm">{c.name} <Badge variant="outline" className="text-[8px] capitalize">{c.position}</Badge></p>
                    <p className="text-xs text-[#59615D]">{c.phone} | {c.location} {c.experience?`| Exp: ${c.experience}`:""}</p>
                    {c.notes && <p className="text-[10px] text-[#A66E4E]">{c.notes}</p>}
                  </div>
                  <div className="flex gap-1 items-center"><Badge className={`text-[8px] ${c.status==='selected'||c.status==='interviewed'?'bg-blue-100 text-blue-800':'bg-yellow-100 text-yellow-800'}`}>{c.status}</Badge>
                    <Button size="sm" className="rounded-full text-[10px] bg-[#6B8E6B] text-white h-6" onClick={()=>hireCandidate(c.id)} data-testid={`dm-hire-${c.id}`} title="Recommend candidate to HR for final hiring">✓ Select</Button>
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
          <TabsContent value="regions" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
            <h3 className="font-heading text-lg font-medium mb-4">My Districts & Localities</h3>
            {myDistricts.length===0?<p className="text-center py-6 text-[#59615D] text-sm">No districts assigned. Contact admin to assign districts.</p>:
            <div className="space-y-4">{myDistricts.map(district=>{
              const districtRegions = regions.filter(r=>r.district===district);
              return (<div key={district} className="border border-[#E5E3DB] rounded-xl p-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-heading text-lg font-semibold">{district}</h4>
                  <div className="flex gap-2">
                    <Button size="sm" className="rounded-full bg-[#A66E4E] text-white text-xs" onClick={async()=>{setGenLoading(true);try{const{data}=await axios.get(`${API}/ai/generate-localities/${encodeURIComponent(district)}?state_name=Kerala`);if(data.localities?.length>0){
                      const existingReg = districtRegions[0];
                      if(existingReg){await axios.put(`${API}/regions/${existingReg.id}`,{localities:data.localities.map(l=>({name:l,type:"area",agents:[]}))});toast.success(`${data.localities.length} localities generated`);}
                      else{await axios.post(`${API}/regions`,{name:district,district,state:"Kerala",pincode:"",areas:[],localities:data.localities.map(l=>({name:l,type:"area",agents:[]}))});toast.success(`Region created with ${data.localities.length} localities`);}
                      fetchData();}else toast.error("No localities found");}catch{toast.error("Failed");}setGenLoading(false);}} data-testid={`gen-loc-${district}`}>{genLoading?<Loader2 className="w-3 h-3 animate-spin mr-1"/>:<Sparkles className="w-3 h-3 mr-1"/>}AI Generate</Button>
                    <Button size="sm" variant="outline" className="rounded-full text-xs" onClick={async()=>{const name=prompt("Locality name:");const pin=prompt("PIN code (optional):");if(!name)return;const existingReg=districtRegions[0];if(existingReg){await axios.post(`${API}/regions/${existingReg.id}/localities`,{name,type:"area",pincode:pin||""});toast.success("Added");fetchData();}else{await axios.post(`${API}/regions`,{name:district,district,state:"Kerala",pincode:pin||"",areas:[],localities:[{name,type:"area",agents:[]}]});toast.success("Created");fetchData();}}}><Plus className="w-3 h-3 mr-1"/>Add Locality</Button>
                  </div>
                </div>
                {districtRegions.map(r=>(<div key={r.id}>
                  {r.localities?.length>0?<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{r.localities.map((loc,idx)=>{
                    const locName = typeof loc==="string"?loc:loc.name;
                    const locAgents = typeof loc!=="string"?loc.agents||[]:[];
                    return (<div key={idx} className="bg-[#F9F8F6] rounded-lg p-3">
                      <div className="flex justify-between items-start">
                        <p className="font-medium text-sm">{locName}</p>
                        <Select onValueChange={async(agentId)=>{try{await axios.put(`${API}/regions/${r.id}/localities/${idx}/assign-agent`,{agent_id:agentId});toast.success("Agent assigned!");fetchData();}catch{toast.error("Failed");}}}><SelectTrigger className="h-6 w-28 text-[9px] rounded-lg"><SelectValue placeholder="+ Agent"/></SelectTrigger><SelectContent>{agents.map(a=><SelectItem key={a.id} value={a.id} className="text-xs">{a.name}</SelectItem>)}</SelectContent></Select>
                      </div>
                      {locAgents.length>0&&<div className="flex flex-wrap gap-1 mt-1">{locAgents.map(aid=>{const ag=agents.find(a=>a.id===aid);return <Badge key={aid} className="bg-[#3B5249] text-white text-[9px]">{ag?.name||aid} <X className="w-2.5 h-2.5 ml-1 cursor-pointer" onClick={async()=>{try{await axios.put(`${API}/regions/${r.id}/localities/${idx}/remove-agent`,{agent_id:aid});toast.success("Removed");fetchData();}catch{toast.error("Failed");}}}/></Badge>;})}</div>}
                    </div>);
                  })}</div>:<p className="text-xs text-[#59615D] py-2">No localities. Use "AI Generate" or "Add Locality".</p>}
                </div>))}
                {districtRegions.length===0&&<p className="text-xs text-[#59615D] py-2">No regions yet. Use AI Generate to create localities for this district.</p>}
              </div>);
            })}</div>}
          </div></TabsContent>
          <TabsContent value="products" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5"><div className="flex justify-between items-center mb-4"><h3 className="font-heading text-lg font-medium">Product Catalog</h3><p className="text-xs text-[#59615D]">Managed from Admin Panel</p></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{products.map(p=>(<div key={p.id} className="border border-[#E5E3DB] rounded-xl p-4"><div className="flex justify-between"><div><p className="font-medium">{p.name}</p><Badge variant="outline" className="text-[10px] mt-1">{p.category}</Badge></div><p className="font-heading font-semibold text-[#3B5249]">Rs.{p.price}</p></div><p className="text-xs text-[#59615D] mt-2">{p.description}</p><p className="text-xs mt-1">Stock: <span className={p.stock<20?"text-red-600":"text-[#6B8E6B]"}>{p.stock}</span></p></div>))}</div>
          </div></TabsContent>
          <TabsContent value="tasks" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5"><div className="flex justify-between items-center mb-4"><h3 className="font-heading text-lg font-medium">Tasks</h3><Button size="sm" className="rounded-full bg-[#3B5249] text-white" onClick={()=>setShowAddTask(true)} data-testid="add-task-btn"><Plus className="w-4 h-4 mr-1"/>Create Task</Button></div>
            <div className="space-y-3">{tasks.map(t=>(<div key={t.id} className="border border-[#E5E3DB] rounded-xl p-4"><div className="flex justify-between"><p className="font-medium">{t.title}</p><div className="flex gap-2"><Badge variant="outline" className="text-[10px]">{t.priority}</Badge><Badge className={`text-[10px] ${t.status==="completed"?"bg-green-100 text-green-800":"bg-yellow-100 text-yellow-800"}`}>{t.status}</Badge></div></div><p className="text-xs text-[#59615D] mt-1">{t.description}</p><p className="text-xs text-[#A66E4E] mt-1">Assigned to: {t.assigned_to_name} | Due: {t.due_date}</p></div>))}</div>
          </div></TabsContent>
          <TabsContent value="funds" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-5"><h3 className="font-heading text-lg font-medium mb-4">Fund Requests ({pendingFunds.length} pending)</h3>
            <div className="space-y-3">{fundRequests.map(f=>(<div key={f.id} className="border border-[#E5E3DB] rounded-xl p-4 flex justify-between items-center" data-testid={`fund-${f.id}`}><div><p className="font-medium">Rs.{f.amount} - {f.category}</p><p className="text-xs text-[#59615D]">{f.requested_by_name} ({f.requested_by_role}) | {f.reason}</p></div><div className="flex gap-2"><Badge className={`text-[10px] ${f.status==="approved"?"bg-green-100 text-green-800":f.status==="rejected"?"bg-red-100 text-red-800":"bg-yellow-100 text-yellow-800"}`}>{f.status}</Badge>{f.status==="pending"&&<><Button size="sm" className="rounded-full bg-[#6B8E6B] text-white text-xs" onClick={()=>approveFund(f.id,"approved")}>Approve</Button><Button size="sm" variant="outline" className="rounded-full text-xs" onClick={()=>approveFund(f.id,"rejected")}>Reject</Button></>}</div></div>))}</div>
          </div></TabsContent>
          <TabsContent value="commissions" className="animate-fade-in"><div className="bg-white rounded-2xl border border-[#E5E3DB] overflow-x-auto"><div className="p-5 border-b border-[#E5E3DB]"><h3 className="font-heading text-lg font-medium">Commissions</h3></div>
            <table className="w-full"><thead><tr className="border-b border-[#E5E3DB] bg-[#F9F8F6]">{["Date","User","Order","Amount","Commission","Status","Action"].map(h=><th key={h} className="text-left p-4 text-xs uppercase tracking-wider text-[#59615D]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[#E5E3DB]">{commissions.map(c=>(<tr key={c.id}><td className="p-4 text-sm">{c.created_at?.slice(0,10)}</td><td className="p-4 text-sm">{c.user_name} <Badge variant="outline" className="text-[10px]">{c.user_role}</Badge></td><td className="p-4 text-xs font-mono">{c.order_id}</td><td className="p-4 text-sm">Rs.{c.order_amount}</td><td className="p-4 text-sm font-semibold text-[#3B5249]">Rs.{c.commission_amount}</td><td className="p-4"><Badge className={`text-[10px] ${c.status==="paid"?"bg-green-100 text-green-800":"bg-yellow-100 text-yellow-800"}`}>{c.status}</Badge></td><td className="p-4">{c.status==="pending"&&<Button size="sm" className="rounded-full text-xs bg-[#6B8E6B] text-white" onClick={()=>markPaid(c.id)}>Pay</Button>}</td></tr>))}</tbody></table>
          </div></TabsContent>
          <TabsContent value="mysheet" className="animate-fade-in"><DailyTaskSheet titleSuffix="District Manager" /></TabsContent>
        </Tabs>
      </div>
      {/* Dialogs */}
      <Dialog open={showAddProduct} onOpenChange={setShowAddProduct}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Add Product</DialogTitle></DialogHeader><div className="space-y-3"><Input placeholder="Name" value={productForm.name} onChange={e=>setProductForm(f=>({...f,name:e.target.value}))} className="rounded-xl" data-testid="product-name-input"/><Select value={productForm.category} onValueChange={v=>setProductForm(f=>({...f,category:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="sunscreen">Sunscreen</SelectItem><SelectItem value="facewash">Face Wash</SelectItem><SelectItem value="bodylotion">Body Lotion</SelectItem></SelectContent></Select><div className="grid grid-cols-2 gap-3"><Input type="number" placeholder="Price" value={productForm.price} onChange={e=>setProductForm(f=>({...f,price:e.target.value}))} className="rounded-xl" data-testid="product-price-input"/><Input type="number" placeholder="Stock" value={productForm.stock} onChange={e=>setProductForm(f=>({...f,stock:e.target.value}))} className="rounded-xl"/></div><Textarea placeholder="Description" value={productForm.description} onChange={e=>setProductForm(f=>({...f,description:e.target.value}))} className="rounded-xl"/><Button onClick={handleAddProduct} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-product-btn">Add</Button></div></DialogContent></Dialog>
      <Dialog open={showAddRegion} onOpenChange={setShowAddRegion}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Add Region</DialogTitle></DialogHeader><div className="space-y-3"><Input placeholder="Name" value={regionForm.name} onChange={e=>setRegionForm(f=>({...f,name:e.target.value}))} className="rounded-xl" data-testid="region-name-input"/><Input placeholder="District" value={regionForm.district} onChange={e=>setRegionForm(f=>({...f,district:e.target.value}))} className="rounded-xl"/><Input placeholder="Pincode" value={regionForm.pincode} onChange={e=>setRegionForm(f=>({...f,pincode:e.target.value}))} className="rounded-xl"/><Input placeholder="Areas (comma sep)" value={regionForm.areas} onChange={e=>setRegionForm(f=>({...f,areas:e.target.value}))} className="rounded-xl"/><Button onClick={handleAddRegion} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-region-btn">Add</Button></div></DialogContent></Dialog>
      <Dialog open={showAddAgent} onOpenChange={setShowAddAgent}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Add Agent</DialogTitle></DialogHeader><div className="space-y-3"><div><Label className="text-xs font-medium">Name</Label><Input placeholder="Agent name" value={agentForm.name} onChange={e=>setAgentForm(f=>({...f,name:e.target.value}))} className="rounded-xl" data-testid="agent-name-input"/></div><div><Label className="text-xs font-medium">Email</Label><Input placeholder="agent@celestaglow.com" value={agentForm.email} onChange={e=>setAgentForm(f=>({...f,email:e.target.value}))} className="rounded-xl" data-testid="agent-email-input"/></div><div><Label className="text-xs font-medium">Phone (mandatory)</Label><Input placeholder="Phone number" value={agentForm.phone} onChange={e=>setAgentForm(f=>({...f,phone:e.target.value}))} className="rounded-xl" data-testid="agent-phone-input"/></div><div><Label className="text-xs font-medium">Password</Label><Input placeholder="Leave empty for default" value={agentForm.password} onChange={e=>setAgentForm(f=>({...f,password:e.target.value}))} className="rounded-xl"/></div><div><Label className="text-xs font-medium">District</Label><Input placeholder="e.g. Ernakulam" value={agentForm.district} onChange={e=>setAgentForm(f=>({...f,district:e.target.value}))} className="rounded-xl"/></div><div><Label className="text-xs font-medium">Area / Locality</Label><Input placeholder="e.g. Kakkanad" value={agentForm.area} onChange={e=>setAgentForm(f=>({...f,area:e.target.value}))} className="rounded-xl"/></div><div><Label className="text-xs font-medium">Language</Label><Input placeholder="Malayalam / Hindi / English…" value={agentForm.language} onChange={e=>setAgentForm(f=>({...f,language:e.target.value}))} className="rounded-xl" data-testid="agent-language-input"/></div><Select value={agentForm.region_id} onValueChange={v=>setAgentForm(f=>({...f,region_id:v}))}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Select Region"/></SelectTrigger><SelectContent>{regions.map(r=><SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent></Select><Button onClick={handleAddAgent} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-agent-btn">Add Agent</Button></div></DialogContent></Dialog>
      <Dialog open={!!editingAgent} onOpenChange={(o)=>{ if (!o) setEditingAgent(null); }}>
        <DialogContent className="rounded-2xl" data-testid="edit-agent-dialog">
          <DialogHeader><DialogTitle className="font-heading">Edit Agent — {editingAgent?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Name</Label><Input value={agentEditForm.name} onChange={e=>setAgentEditForm(f=>({...f,name:e.target.value}))} className="rounded-xl"/></div>
            <div><Label className="text-xs">Phone</Label><Input value={agentEditForm.phone} onChange={e=>setAgentEditForm(f=>({...f,phone:e.target.value}))} className="rounded-xl"/></div>
            <div><Label className="text-xs">Language</Label><Input value={agentEditForm.language} onChange={e=>setAgentEditForm(f=>({...f,language:e.target.value}))} placeholder="Malayalam / Hindi / English…" className="rounded-xl" data-testid="edit-agent-language"/></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">District</Label><Input value={agentEditForm.district} onChange={e=>setAgentEditForm(f=>({...f,district:e.target.value}))} placeholder="e.g. Ernakulam" className="rounded-xl"/></div>
              <div><Label className="text-xs">Area / Locality</Label><Input value={agentEditForm.area} onChange={e=>setAgentEditForm(f=>({...f,area:e.target.value}))} placeholder="e.g. Kakkanad" className="rounded-xl" data-testid="edit-agent-area"/></div>
            </div>
            <Button onClick={handleEditAgent} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-edit-agent">Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={showAddTask} onOpenChange={setShowAddTask}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Create Task</DialogTitle></DialogHeader><div className="space-y-3"><Input placeholder="Title" value={taskForm.title} onChange={e=>setTaskForm(f=>({...f,title:e.target.value}))} className="rounded-xl" data-testid="task-title-input"/><Textarea placeholder="Description" value={taskForm.description} onChange={e=>setTaskForm(f=>({...f,description:e.target.value}))} className="rounded-xl"/><Select value={taskForm.assigned_to} onValueChange={v=>{const a=agents.find(x=>x.id===v);setTaskForm(f=>({...f,assigned_to:v,assigned_to_name:a?.name||""}));}}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Assign to agent"/></SelectTrigger><SelectContent>{agents.map(a=><SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select><Select value={taskForm.priority} onValueChange={v=>setTaskForm(f=>({...f,priority:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="high">High</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="low">Low</SelectItem></SelectContent></Select><Input type="date" value={taskForm.due_date} onChange={e=>setTaskForm(f=>({...f,due_date:e.target.value}))} className="rounded-xl"/><Button onClick={handleAddTask} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-task-btn">Create</Button></div></DialogContent></Dialog>
      <Dialog open={showGenLocalities} onOpenChange={setShowGenLocalities}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading flex items-center gap-2"><Sparkles className="w-5 h-5 text-[#A66E4E]"/>AI Locality Generator</DialogTitle></DialogHeader><div className="space-y-3"><Select value={selectedRegion?.id||""} onValueChange={v=>{const r=regions.find(x=>x.id===v);setSelectedRegion(r);setGenDistrict(r?.district||"");}}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Select region"/></SelectTrigger><SelectContent>{regions.map(r=><SelectItem key={r.id} value={r.id}>{r.name} - {r.district}</SelectItem>)}</SelectContent></Select><Button onClick={generateLocalities} disabled={genLoading||!genDistrict} className="w-full rounded-full bg-[#A66E4E] text-white">{genLoading?<Loader2 className="w-4 h-4 animate-spin mr-2"/>:<Sparkles className="w-4 h-4 mr-2"/>}Generate Localities</Button>{genLocalities.length>0&&<div className="bg-[#F9F8F6] rounded-xl p-3"><p className="text-xs font-medium mb-2">Generated {genLocalities.length} localities:</p><div className="flex flex-wrap gap-1">{genLocalities.map((l,i)=><Badge key={i} variant="outline" className="text-xs">{l}</Badge>)}</div><Button onClick={saveLocalities} className="w-full rounded-full bg-[#3B5249] text-white mt-3">Save to Region</Button></div>}</div></DialogContent></Dialog>

      {/* ADD ADM DIALOG */}
      <Dialog open={showAddAdm} onOpenChange={setShowAddAdm}>
        <DialogContent className="rounded-2xl max-h-[85vh] overflow-y-auto" data-testid="add-adm-dialog">
          <DialogHeader><DialogTitle className="font-heading">Add Assistant District Manager</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-[11px] text-[#59615D]">A welcome email with login credentials will be sent automatically. Your ADM will be CC&apos;d on every instruction sent to you.</p>
            <div><Label className="text-xs">Full Name *</Label><Input value={admForm.name} onChange={e=>setAdmForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Pradeep Nair" className="rounded-xl" data-testid="adm-name-input"/></div>
            <div><Label className="text-xs">Email *</Label><Input value={admForm.email} onChange={e=>setAdmForm(f=>({...f,email:e.target.value}))} placeholder="pradeep@celestaglow.com" className="rounded-xl" data-testid="adm-email-input"/></div>
            <div><Label className="text-xs">Phone *</Label><Input value={admForm.phone} onChange={e=>setAdmForm(f=>({...f,phone:e.target.value}))} placeholder="9999900012" className="rounded-xl" data-testid="adm-phone-input"/></div>
            <div><Label className="text-xs">District</Label><Input value={admForm.district} onChange={e=>setAdmForm(f=>({...f,district:e.target.value}))} placeholder="e.g. Ernakulam" className="rounded-xl"/></div>
            <div><Label className="text-xs">Password (leave blank for default &apos;adm123&apos;)</Label><Input value={admForm.password} onChange={e=>setAdmForm(f=>({...f,password:e.target.value}))} placeholder="Optional" className="rounded-xl"/></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Salary (Rs./month)</Label><Input type="number" value={admForm.salary} onChange={e=>setAdmForm(f=>({...f,salary:Number(e.target.value)||0}))} className="rounded-xl"/></div>
              <div><Label className="text-xs">Incentive (Rs.)</Label><Input type="number" value={admForm.incentive} onChange={e=>setAdmForm(f=>({...f,incentive:Number(e.target.value)||0}))} className="rounded-xl"/></div>
            </div>
            <Button onClick={handleAddAdm} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-adm-btn">Add Asst District Manager</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* EDIT ADM DIALOG */}
      <Dialog open={showEditAdm} onOpenChange={(o)=>{setShowEditAdm(o); if(!o)setEditingAdm(null);}}>
        <DialogContent className="rounded-2xl max-h-[85vh] overflow-y-auto" data-testid="edit-adm-dialog">
          <DialogHeader><DialogTitle className="font-heading">Edit ADM — {editingAdm?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Full Name</Label><Input value={admForm.name} onChange={e=>setAdmForm(f=>({...f,name:e.target.value}))} className="rounded-xl"/></div>
            <div><Label className="text-xs">Email</Label><Input value={admForm.email} onChange={e=>setAdmForm(f=>({...f,email:e.target.value}))} className="rounded-xl"/></div>
            <div><Label className="text-xs">Phone</Label><Input value={admForm.phone} onChange={e=>setAdmForm(f=>({...f,phone:e.target.value}))} className="rounded-xl"/></div>
            <div><Label className="text-xs">District</Label><Input value={admForm.district} onChange={e=>setAdmForm(f=>({...f,district:e.target.value}))} className="rounded-xl"/></div>
            <div><Label className="text-xs">New Password (leave blank to keep current)</Label><Input value={admForm.password} onChange={e=>setAdmForm(f=>({...f,password:e.target.value}))} placeholder="Optional" className="rounded-xl"/></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Salary</Label><Input type="number" value={admForm.salary} onChange={e=>setAdmForm(f=>({...f,salary:Number(e.target.value)||0}))} className="rounded-xl"/></div>
              <div><Label className="text-xs">Incentive</Label><Input type="number" value={admForm.incentive} onChange={e=>setAdmForm(f=>({...f,incentive:Number(e.target.value)||0}))} className="rounded-xl"/></div>
            </div>
            <Button onClick={handleEditAdm} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-edit-adm-btn">Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
