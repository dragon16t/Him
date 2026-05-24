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
import { LogOut, ShoppingBag, IndianRupee, MapPin, Plus, X, Loader2, TrendingUp, User, Wallet, ClipboardList, RefreshCw, Package } from "lucide-react";
import RoleGuidelines from "../components/RoleGuidelines";
import AttendanceCheckIn from "../components/AttendanceCheckIn";
import NotificationBell from "../components/NotificationBell";
import DarkModeToggle from "../components/DarkModeToggle";
import MobileBottomNav from "../components/MobileBottomNav";
import { PageLoader } from "../components/Skeletons";

const API = "/api";

export default function AgentPortal() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const [stats, setStats] = useState({});
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [commission, setCommission] = useState({ total_earned: 0, total_pending: 0, total_paid: 0 });
  const [commissionList, setCommissionList] = useState([]);
  const [profile, setProfile] = useState({ earnings: {} });
  const [leaderboard, setLeaderboard] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [followUps, setFollowUps] = useState({repeat_due:[],repeat_upcoming:[],relationship_due:[],relationship_upcoming:[]});
  const [loading, setLoading] = useState(true);
  const [showOrder, setShowOrder] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showFundRequest, setShowFundRequest] = useState(false);
  const [orderForm, setOrderForm] = useState({ customer_name: "", customer_phone: "", customer_address: "", customer_city: "", customer_pincode: "", customer_landmark: "", items: [], payment_type: "cod" });
  const [fundForm, setFundForm] = useState({ amount: 0, reason: "", category: "travel" });
  const [pwForm, setPwForm] = useState({ old_password: "", new_password: "" });

  const fetchData = useCallback(async () => {
    try {
      const [s, p, o, c, pr, t] = await Promise.all([
        axios.get(`${API}/dashboard/stats`), axios.get(`${API}/products`), axios.get(`${API}/orders`),
        axios.get(`${API}/commissions/my`), axios.get(`${API}/profile`), axios.get(`${API}/tasks`)
      ]);
      setStats(s.data.stats); setProducts(p.data.products); setOrders(o.data.orders);
      setCommission(c.data.summary); setCommissionList(c.data.commissions||[]); setProfile(pr.data); setTasks(t.data.tasks);
      try { const fu = await axios.get(`${API}/leads/follow-ups`); setFollowUps(fu.data); } catch {}
      try { const lb = await axios.get(`${API}/leaderboard/agent`); setLeaderboard(lb.data.leaderboard||[]); } catch {}
    } catch (err) { console.error(err); }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const addItem = (p) => { const ex = orderForm.items.find(i=>i.product_id===p.id); if(ex) setOrderForm(f=>({...f,items:f.items.map(i=>i.product_id===p.id?{...i,quantity:i.quantity+1}:i)})); else setOrderForm(f=>({...f,items:[...f.items,{product_id:p.id,product_name:p.name,price:p.price,quantity:1}]})); };
  const updateQty = (pid, delta) => setOrderForm(f => ({...f, items: f.items.map(i => i.product_id===pid ? {...i, quantity: Math.max(1, (i.quantity||1)+delta)} : i)}));
  const setQty = (pid, q) => { const p = parseInt(q, 10); const qq = Number.isFinite(p) ? Math.max(1, p) : 1; setOrderForm(f => ({...f, items: f.items.map(i => i.product_id===pid ? {...i, quantity: qq} : i)})); };
  const removeItem = (pid) => setOrderForm(f => ({...f, items: f.items.filter(i => i.product_id !== pid)}));
  const handleCreateOrder = async () => {
    if (!orderForm.customer_name) return toast.error("Customer name is required");
    if (!orderForm.customer_phone) return toast.error("Customer phone is required");
    if (!orderForm.customer_address || orderForm.customer_address.trim().length < 8) return toast.error("Customer address is required (min 8 chars)");
    if (!orderForm.customer_pincode || !/^\d{6}$/.test(orderForm.customer_pincode)) return toast.error("6-digit pincode is required for shipping");
    if (!orderForm.customer_city) return toast.error("City is required");
    if (orderForm.items.length === 0) return toast.error("Add at least one product");
    const total = orderForm.items.reduce((s,i)=>s+i.price*i.quantity,0);
    if (total <= 0) return toast.error("Total must be greater than 0");
    try { await axios.post(`${API}/orders`, {...orderForm, total_amount: total}); toast.success(`Order created · Rs.${total}`); setShowOrder(false); setOrderForm({customer_name:"",customer_phone:"",customer_address:"",customer_city:"",customer_pincode:"",customer_landmark:"",items:[],payment_type:"cod"}); fetchData(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed to create order"); }
  };
  const handleFundRequest = async () => {
    if (!fundForm.amount || !fundForm.reason) return toast.error("Fill details");
    try { await axios.post(`${API}/fund-requests`, fundForm); toast.success("Sent!"); setShowFundRequest(false); setFundForm({amount:0,reason:"",category:"travel"}); } catch(e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const handlePwChange = async () => {
    if (!pwForm.old_password || !pwForm.new_password) return toast.error("Fill both");
    if (pwForm.new_password.length < 6) return toast.error("New password must be at least 6 characters");
    try { await axios.put(`${API}/profile/password`, pwForm); toast.success("Changed!"); setPwForm({old_password:"",new_password:""}); setShowProfile(false); } catch (e) { toast.error(e.response?.data?.detail||"Failed"); }
  };
  const logout = () => { localStorage.clear(); navigate("/login"); };
  if (loading) return <PageLoader label="Loading your portal…" />;

  const pendingTasks = tasks.filter(t => t.status === "pending");

  return (
    <div className="min-h-screen bg-[#F9F8F6]" data-testid="agent-portal">
      <div className="max-w-lg mx-auto sm:max-w-7xl">
        <div className="bg-[#3B5249] text-white px-4 sm:px-6 py-5 sm:rounded-b-3xl">
          <div className="flex items-center justify-between">
            <div><p className="text-[10px] sm:text-xs uppercase tracking-[0.2em] text-white/70">Field Agent</p><h2 className="font-heading text-lg sm:text-2xl font-medium">{user.name}</h2><div className="flex items-center gap-1 mt-1 text-white/80 text-xs sm:text-sm"><MapPin className="w-3 h-3 sm:w-3.5 sm:h-3.5"/>{user.area}, {user.district}</div></div>
            <div className="flex gap-1 sm:gap-2">
              <AttendanceCheckIn />
              <DarkModeToggle compact /><NotificationBell />
              <Button variant="ghost" size="icon" onClick={()=>setShowProfile(true)} className="text-white hover:bg-white/20 rounded-full h-9 w-9" data-testid="profile-btn"><User className="w-4 h-4 sm:w-5 sm:h-5"/></Button>
              <Button variant="ghost" size="icon" onClick={logout} className="text-white hover:bg-white/20 rounded-full h-9 w-9" data-testid="logout-btn"><LogOut className="w-4 h-4 sm:w-5 sm:h-5"/></Button>
            </div>
          </div>
        </div>
        <div className="px-4 sm:px-6 py-4 sm:py-6">
          <RoleGuidelines role="agent" />
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-4 mb-6 sm:mb-8">
            <div className="bg-white rounded-xl sm:rounded-2xl border border-[#E5E3DB] p-3 sm:p-5 hover:shadow-md transition-all" data-testid="stat-total-sales"><IndianRupee className="w-4 h-4 sm:w-5 sm:h-5 text-[#3B5249] mb-1 sm:mb-2"/><p className="font-heading text-base sm:text-2xl font-semibold">Rs.{stats.total_sales||0}</p><p className="text-[9px] sm:text-xs text-[#59615D] uppercase">Sales</p></div>
            <div className="bg-white rounded-xl sm:rounded-2xl border border-[#E5E3DB] p-3 sm:p-5 hover:shadow-md transition-all" data-testid="stat-commission"><TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-[#6B8E6B] mb-1 sm:mb-2"/><p className="font-heading text-base sm:text-2xl font-semibold">Rs.{stats.total_commission||0}</p><p className="text-[9px] sm:text-xs text-[#59615D] uppercase">Comm.</p></div>
            <div className="bg-white rounded-xl sm:rounded-2xl border border-[#E5E3DB] p-3 sm:p-5 hover:shadow-md transition-all"><ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5 text-[#A66E4E] mb-1 sm:mb-2"/><p className="font-heading text-base sm:text-2xl font-semibold">{stats.total_orders||0}</p><p className="text-[9px] sm:text-xs text-[#59615D] uppercase">Orders</p></div>
            <div className="bg-white rounded-xl sm:rounded-2xl border border-[#E5E3DB] p-3 sm:p-5 hover:shadow-md transition-all hidden sm:block"><RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 text-[#D4A373] mb-1 sm:mb-2"/><p className="font-heading text-base sm:text-2xl font-semibold">{stats.repeat_visits||0}</p><p className="text-[9px] sm:text-xs text-[#59615D] uppercase">Repeat</p></div>
            <div className="bg-white rounded-xl sm:rounded-2xl border border-[#E5E3DB] p-3 sm:p-5 hover:shadow-md transition-all hidden sm:block"><ClipboardList className="w-4 h-4 sm:w-5 sm:h-5 text-[#B75D69] mb-1 sm:mb-2"/><p className="font-heading text-base sm:text-2xl font-semibold">{stats.pending_tasks||0}</p><p className="text-[9px] sm:text-xs text-[#59615D] uppercase">Tasks</p></div>
          </div>
          {/* Commission Breakdown */}
          <div className="bg-white rounded-xl sm:rounded-2xl border border-[#E5E3DB] p-4 sm:p-5 mb-4 sm:mb-6">
            <h3 className="font-heading text-base sm:text-lg font-medium mb-3">Commission</h3>
            <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-3">
              <div className="bg-[#F9F8F6] rounded-xl p-2 sm:p-3 text-center"><p className="text-[10px] sm:text-xs text-[#59615D]">Pending</p><p className="font-heading text-sm sm:text-xl font-semibold text-[#D4A373]">Rs.{commission.total_pending||0}</p></div>
              <div className="bg-[#F9F8F6] rounded-xl p-2 sm:p-3 text-center"><p className="text-[10px] sm:text-xs text-[#59615D]">Approved</p><p className="font-heading text-sm sm:text-xl font-semibold text-[#3B5249]">Rs.{commission.total_approved||0}</p></div>
              <div className="bg-[#F9F8F6] rounded-xl p-2 sm:p-3 text-center"><p className="text-[10px] sm:text-xs text-[#59615D]">Paid</p><p className="font-heading text-sm sm:text-xl font-semibold text-[#6B8E6B]">Rs.{commission.total_paid||0}</p></div>
            </div>
            {commissionList && commissionList.length > 0 && (
              <details className="mt-2" data-testid="agent-commission-list">
                <summary className="cursor-pointer text-xs font-medium text-[#3B5249] hover:underline">View all {commissionList.length} commission entries (per order)</summary>
                <div className="overflow-x-auto mt-3"><table className="w-full text-xs">
                  <thead><tr className="border-b bg-[#F9F8F6]">{["Order","Customer","Total","Rate","Comm.","Status","Date"].map(h=><th key={h} className="p-2 text-left text-[9px] uppercase text-[#59615D]">{h}</th>)}</tr></thead>
                  <tbody>{commissionList.map(c=>(
                    <tr key={c.id} className="border-b border-[#E5E3DB]"><td className="p-2 font-mono text-[10px]">{c.order_id}</td><td className="p-2">{c.customer_name||"-"}</td><td className="p-2">Rs.{c.order_total||c.order_amount||0}</td><td className="p-2">{c.commission_percentage||"-"}%</td><td className="p-2 font-bold text-[#3B5249]">Rs.{c.commission_amount}</td><td className="p-2"><Badge className={`text-[9px] capitalize ${c.status==='paid'?'bg-green-100 text-green-800':c.status==='approved'?'bg-blue-100 text-blue-800':'bg-yellow-100 text-yellow-800'}`}>{c.status}</Badge></td><td className="p-2 text-[10px]">{(c.created_at||"").slice(0,10)}</td></tr>
                  ))}</tbody>
                </table></div>
              </details>
            )}
          </div>
          {/* Actions */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
            <Button className="h-12 sm:h-14 rounded-xl sm:rounded-2xl bg-[#3B5249] hover:bg-[#4F6B60] text-white text-xs sm:text-sm" onClick={()=>setShowOrder(true)} data-testid="create-order-btn"><Plus className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2"/>Home Visit Order</Button>
            <Button className="h-12 sm:h-14 rounded-xl sm:rounded-2xl bg-[#A66E4E] hover:bg-[#B88262] text-white text-xs sm:text-sm" onClick={()=>setShowFundRequest(true)} data-testid="fund-request-btn"><Wallet className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2"/>Fund Request</Button>
          </div>
          {/* Pending Tasks */}
          {pendingTasks.length > 0 && <div className="bg-white rounded-xl sm:rounded-2xl border border-[#E5E3DB] p-4 sm:p-5 mb-4 sm:mb-6"><h3 className="font-heading text-base sm:text-lg font-medium mb-3">Tasks ({pendingTasks.length})</h3>
            {pendingTasks.map(t => (<div key={t.id} className="border border-[#E5E3DB] rounded-xl p-3 mb-2" data-testid={`task-${t.id}`}><div className="flex justify-between items-start gap-2"><div className="min-w-0 flex-1"><p className="font-medium text-sm truncate">{t.title}</p><p className="text-xs text-[#59615D] mt-1 line-clamp-2">{t.description}</p>{t.due_date && <p className="text-xs text-[#A66E4E]">Due: {t.due_date}</p>}</div><Button size="sm" className="rounded-full text-xs bg-[#6B8E6B] text-white flex-shrink-0" onClick={async()=>{await axios.put(`${API}/tasks/${t.id}`,{status:"completed"});toast.success("Done!");fetchData();}}>Done</Button></div></div>))}
          </div>}

          {/* LEADERBOARD */}
          {leaderboard.length > 0 && <div className="bg-white rounded-xl sm:rounded-2xl border border-[#E5E3DB] p-4 sm:p-5 mb-4 sm:mb-6" data-testid="agent-leaderboard">
            <h3 className="font-heading text-base sm:text-lg font-medium mb-3">🏆 Agent Leaderboard</h3>
            <div className="space-y-2">{leaderboard.slice(0,10).map((u,i)=>(
              <div key={u.id} className={`flex justify-between items-center rounded-lg p-2 ${u.id===user.id?'bg-[#F9F8F6] border-2 border-[#3B5249]':'border border-[#E5E3DB]'}`}>
                <div className="flex items-center gap-2"><span className="font-bold">{i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}</span><span className="text-xs font-medium">{u.name}{u.id===user.id&&<Badge className="ml-1 text-[8px] bg-[#3B5249] text-white">YOU</Badge>}</span></div>
                <div className="text-right"><p className="text-xs font-bold text-[#3B5249]">Rs.{u.revenue}</p><p className="text-[9px] text-[#59615D]">{u.orders} orders</p></div>
              </div>
            ))}</div>
          </div>}
          {/* Repeat Orders Due */}
          {(followUps.repeat_due.length > 0 || followUps.repeat_upcoming.length > 0) && <div className="bg-white rounded-xl sm:rounded-2xl border border-[#E5E3DB] p-4 sm:p-5 mb-4 sm:mb-6">
            <h3 className="font-heading text-base sm:text-lg font-medium mb-3">Repeat Orders ({followUps.repeat_due.length} due)</h3>
            {followUps.repeat_due.map(l=>(<div key={l.id} className="border border-orange-200 bg-orange-50 rounded-xl p-3 mb-2"><div className="flex justify-between items-start"><div><p className="font-medium text-sm">{l.name}</p><p className="text-xs text-[#59615D]">{l.phone_number}</p></div><div className="text-right"><Badge className="bg-orange-100 text-orange-800 text-[9px]">REPEAT DUE</Badge><p className="text-[10px] text-[#59615D] mt-0.5">Since: {l.next_repeat_order_date}</p></div></div></div>))}
            {followUps.repeat_upcoming.length > 0 && <><p className="text-xs text-[#59615D] mt-2 mb-1 font-medium">Upcoming</p>{followUps.repeat_upcoming.slice(0,5).map(l=>(<div key={l.id} className="border border-[#E5E3DB] rounded-xl p-2 mb-1 flex justify-between text-xs"><span>{l.name} - {l.phone_number}</span><span className="text-[#A66E4E]">{l.next_repeat_order_date}</span></div>))}</>}
          </div>}
          {/* Relationship Calls Due */}
          {(followUps.relationship_due.length > 0 || followUps.relationship_upcoming.length > 0) && <div className="bg-white rounded-xl sm:rounded-2xl border border-[#E5E3DB] p-4 sm:p-5 mb-4 sm:mb-6">
            <h3 className="font-heading text-base sm:text-lg font-medium mb-3">Relationship Calls ({followUps.relationship_due.length} due)</h3>
            {followUps.relationship_due.map(l=>(<div key={l.id} className="border border-pink-200 bg-pink-50 rounded-xl p-3 mb-2"><div className="flex justify-between items-start"><div><p className="font-medium text-sm">{l.name}</p><p className="text-xs text-[#59615D]">{l.phone_number}</p></div><div className="text-right"><Badge className="bg-pink-100 text-pink-800 text-[9px]">RELATIONSHIP DUE</Badge><p className="text-[10px] text-[#59615D] mt-0.5">Since: {l.next_relationship_date}</p></div></div></div>))}
            {followUps.relationship_upcoming.length > 0 && <><p className="text-xs text-[#59615D] mt-2 mb-1 font-medium">Upcoming</p>{followUps.relationship_upcoming.slice(0,5).map(l=>(<div key={l.id} className="border border-[#E5E3DB] rounded-xl p-2 mb-1 flex justify-between text-xs"><span>{l.name} - {l.phone_number}</span><span className="text-[#D4A373]">{l.next_relationship_date}</span></div>))}</>}
          </div>}
          {/* Products */}
          <div className="bg-white rounded-xl sm:rounded-2xl border border-[#E5E3DB] p-4 sm:p-5 mb-4 sm:mb-6"><h3 className="font-heading text-base sm:text-lg font-medium mb-3 sm:mb-4">Product Catalog</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">{products.map(p=>(<div key={p.id} className="border border-[#E5E3DB] rounded-xl p-3 sm:p-4" data-testid={`product-${p.id}`}><div className="flex justify-between"><div><p className="font-medium text-sm">{p.name}</p><Badge variant="outline" className="text-[10px] mt-1">{p.category}</Badge></div><p className="font-heading font-semibold text-[#3B5249] text-sm sm:text-base">Rs.{p.price}</p></div><p className="text-xs mt-2">Stock: <span className={p.stock<20?"text-red-600":"text-[#6B8E6B]"}>{p.stock}</span></p></div>))}</div>
          </div>
          {/* Orders */}
          <div className="bg-white rounded-xl sm:rounded-2xl border border-[#E5E3DB] p-4 sm:p-5 pb-20 sm:pb-5"><h3 className="font-heading text-base sm:text-lg font-medium mb-3 sm:mb-4">My Orders</h3>
            {orders.length===0?<p className="text-center py-8 text-[#59615D] text-sm">No orders yet</p>:
            <div className="space-y-2 sm:space-y-3">{orders.map(o=>{const repeatCount=orders.filter(x=>x.customer_phone===o.customer_phone).length;return(<div key={o.id} className="border border-[#E5E3DB] rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-2" data-testid={`order-${o.id}`}><div className="min-w-0"><div className="flex items-center gap-1.5"><p className="font-heading font-medium text-xs sm:text-sm truncate">{o.id}</p>{repeatCount>1&&<Badge className="bg-orange-100 text-orange-800 text-[8px]">REPEAT x{repeatCount}</Badge>}</div><p className="text-xs text-[#59615D]">{o.customer_name} | {new Date(o.created_at).toLocaleDateString()}</p><p className="text-xs text-[#59615D] truncate">{o.customer_phone}</p></div><div className="flex items-center justify-between sm:text-right gap-2"><p className="font-heading font-semibold text-[#3B5249] text-sm">Rs.{o.total_amount}</p><Badge className={`text-[10px] ${o.status==="confirmed"?"bg-green-100 text-green-800":o.status==="rejected"?"bg-red-100 text-red-800":"bg-yellow-100 text-yellow-800"}`}>{o.status?.toUpperCase()}</Badge></div></div>)})}</div>}
          </div>
        </div>
      </div>
      {/* Order Dialog */}
      <Dialog open={showOrder} onOpenChange={setShowOrder}><DialogContent className="rounded-2xl max-h-[85vh] overflow-y-auto" data-testid="create-order-dialog"><DialogHeader><DialogTitle className="font-heading">Home Visit Order</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Customer</Label><Input value={orderForm.customer_name} onChange={e=>setOrderForm(f=>({...f,customer_name:e.target.value}))} className="rounded-xl" data-testid="order-name-input"/></div>
          <div><Label className="text-xs">Phone</Label><Input value={orderForm.customer_phone} onChange={e=>setOrderForm(f=>({...f,customer_phone:e.target.value}))} className="rounded-xl" data-testid="order-phone-input"/></div>
          <div><Label className="text-xs">Address *</Label><Textarea value={orderForm.customer_address} onChange={e=>setOrderForm(f=>({...f,customer_address:e.target.value}))} className="rounded-xl" data-testid="order-address-input" placeholder="House/Flat, Street, Locality"/></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">City *</Label><Input value={orderForm.customer_city} onChange={e=>setOrderForm(f=>({...f,customer_city:e.target.value}))} className="rounded-xl" placeholder="Calicut" data-testid="order-city-input"/></div>
            <div><Label className="text-xs text-[#B75D69]">Pincode * (6 digits)</Label><Input value={orderForm.customer_pincode} onChange={e=>setOrderForm(f=>({...f,customer_pincode:e.target.value.replace(/\D/g,"").slice(0,6)}))} className="rounded-xl" placeholder="673001" maxLength={6} inputMode="numeric" data-testid="order-pincode-input"/></div>
          </div>
          <div><Label className="text-xs">Landmark (optional)</Label><Input value={orderForm.customer_landmark} onChange={e=>setOrderForm(f=>({...f,customer_landmark:e.target.value}))} className="rounded-xl" placeholder="Near XYZ school" data-testid="order-landmark-input"/></div>
          <Label className="text-xs">Products</Label>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">{products.map(p=>(<div key={p.id} className="flex items-center justify-between bg-[#F9F8F6] rounded-xl p-2"><div><p className="text-xs font-medium">{p.name}</p><p className="text-[10px] text-[#59615D]">Rs.{p.price} | Stock: {p.stock}</p></div><Button size="sm" variant="outline" className="rounded-full h-7 text-xs" onClick={()=>addItem(p)} data-testid={`add-product-${p.id}`}><Plus className="w-3 h-3"/></Button></div>))}</div>
          {orderForm.items.length>0&&<div className="border border-[#E5E3DB] rounded-xl p-3 space-y-2">{orderForm.items.map(i=>(
            <div key={i.product_id} className="flex items-center justify-between text-xs gap-2" data-testid={`order-item-${i.product_id}`}>
              <span className="flex-1 truncate">{i.product_name} <span className="text-[#59615D]">(Rs.{i.price})</span></span>
              <div className="flex items-center gap-1">
                <button type="button" className="w-6 h-6 rounded-full border border-[#E5E3DB] text-xs font-bold" onClick={()=>updateQty(i.product_id,-1)} data-testid={`dec-${i.product_id}`}>−</button>
                <Input type="number" value={i.quantity} onChange={e=>setQty(i.product_id,e.target.value)} className="h-6 w-12 text-center text-[10px] rounded-md p-0" data-testid={`qty-${i.product_id}`}/>
                <button type="button" className="w-6 h-6 rounded-full border border-[#E5E3DB] text-xs font-bold" onClick={()=>updateQty(i.product_id,1)} data-testid={`inc-${i.product_id}`}>+</button>
                <span className="text-[#3B5249] font-semibold ml-1 min-w-[60px] text-right">Rs.{i.price*i.quantity}</span>
                <button type="button" onClick={()=>removeItem(i.product_id)} className="text-red-400 ml-1" data-testid={`rem-${i.product_id}`}><X className="w-3 h-3"/></button>
              </div>
            </div>
          ))}<div className="border-t pt-2 flex justify-between font-semibold text-sm"><span>{orderForm.items.length} item(s), {orderForm.items.reduce((s,i)=>s+i.quantity,0)} qty · Total</span><span data-testid="order-total">Rs.{orderForm.items.reduce((s,i)=>s+i.price*i.quantity,0)}</span></div></div>}
          <div><Label className="text-xs">Payment</Label><Select value={orderForm.payment_type} onValueChange={v=>setOrderForm(f=>({...f,payment_type:v}))}><SelectTrigger className="rounded-xl" data-testid="order-payment-select"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="cod">COD</SelectItem><SelectItem value="online">Online</SelectItem><SelectItem value="upi">UPI</SelectItem></SelectContent></Select></div>
          {(orderForm.payment_type === "online" || orderForm.payment_type === "upi") && (
            <div><Label className="text-xs">Payment Proof Screenshot</Label>
              <input type="file" accept="image/jpeg,image/png,image/webp" className="w-full text-xs border border-[#E5E3DB] rounded-xl p-2 file:mr-2 file:rounded-full file:border-0 file:bg-[#3B5249] file:text-white file:text-xs file:px-3 file:py-1" data-testid="payment-proof-input"
                onChange={async(e)=>{const f=e.target.files[0];if(!f)return;const fd=new FormData();fd.append("file",f);try{const{data}=await axios.post(`${API}/upload/payment-proof`,fd,{headers:{"Content-Type":"multipart/form-data"}});setOrderForm(prev=>({...prev,payment_proof_path:data.path}));toast.success("Proof uploaded!");}catch{toast.error("Upload failed");}}}/>
              {orderForm.payment_proof_path && <p className="text-xs text-[#6B8E6B] mt-1">Uploaded successfully</p>}
            </div>
          )}
          <Button onClick={handleCreateOrder} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-order-btn">Submit Order</Button>
        </div>
      </DialogContent></Dialog>
      {/* Fund Request */}
      <Dialog open={showFundRequest} onOpenChange={setShowFundRequest}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Fund Request</DialogTitle></DialogHeader>
        <div className="space-y-3"><div><Label className="text-xs">Amount (Rs.)</Label><Input type="number" value={fundForm.amount} onChange={e=>setFundForm(f=>({...f,amount:Number(e.target.value)}))} className="rounded-xl" data-testid="fund-amount-input"/></div><div><Label className="text-xs">Category</Label><Select value={fundForm.category} onValueChange={v=>setFundForm(f=>({...f,category:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="travel">Travel</SelectItem><SelectItem value="marketing">Marketing</SelectItem><SelectItem value="supplies">Supplies</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select></div><div><Label className="text-xs">Reason</Label><Textarea value={fundForm.reason} onChange={e=>setFundForm(f=>({...f,reason:e.target.value}))} className="rounded-xl" data-testid="fund-reason-input"/></div><Button onClick={handleFundRequest} className="w-full rounded-full bg-[#A66E4E] text-white" data-testid="submit-fund-btn">Submit</Button></div>
      </DialogContent></Dialog>
      {/* Profile */}
      <Dialog open={showProfile} onOpenChange={setShowProfile}><DialogContent className="rounded-2xl max-h-[85vh] overflow-y-auto" data-testid="profile-dialog"><DialogHeader><DialogTitle className="font-heading">My Profile</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="bg-[#F9F8F6] rounded-xl p-4 text-center"><p className="font-heading text-lg font-semibold">{user.name}</p><p className="text-xs text-[#59615D]">{user.email}</p><p className="text-xs text-[#A66E4E] mt-1"><MapPin className="w-3 h-3 inline mr-1"/>{user.area}, {user.district}</p><Badge className="mt-1 bg-[#3B5249] text-white text-[10px]">Agent</Badge></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-[#E5E3DB] rounded-xl p-3 text-center"><p className="text-xs text-[#59615D]">Today Sales</p><p className="font-heading font-semibold">Rs.{profile.earnings?.daily_sales||0}</p></div>
            <div className="bg-white border border-[#E5E3DB] rounded-xl p-3 text-center"><p className="text-xs text-[#59615D]">Month Sales</p><p className="font-heading font-semibold">Rs.{profile.earnings?.monthly_sales||0}</p></div>
            <div className="bg-white border border-[#E5E3DB] rounded-xl p-3 text-center"><p className="text-xs text-[#59615D]">Today Comm.</p><p className="font-heading font-semibold text-[#3B5249]">Rs.{profile.earnings?.daily_commission||0}</p></div>
            <div className="bg-white border border-[#E5E3DB] rounded-xl p-3 text-center"><p className="text-xs text-[#59615D]">Month Comm.</p><p className="font-heading font-semibold text-[#3B5249]">Rs.{profile.earnings?.monthly_commission||0}</p></div>
          </div>
          <div className="border-t border-[#E5E3DB] pt-4"><p className="font-heading text-sm font-medium mb-3">Change Password</p>
            <div className="space-y-2"><Input type="password" placeholder="Current" value={pwForm.old_password} onChange={e=>setPwForm(f=>({...f,old_password:e.target.value}))} className="rounded-xl"/><Input type="password" placeholder="New" value={pwForm.new_password} onChange={e=>setPwForm(f=>({...f,new_password:e.target.value}))} className="rounded-xl"/><Button onClick={handlePwChange} className="w-full rounded-full bg-[#A66E4E] text-white">Change</Button></div>
          </div>
        </div>
      </DialogContent></Dialog>

      {/* Mobile bottom nav (visible on small screens only) */}
      <MobileBottomNav
        activeKey="home"
        onSelect={(k) => {
          if (k === "order") setShowOrder(true);
          else if (k === "fund") setShowFundRequest(true);
          else if (k === "profile") setShowProfile(true);
        }}
        items={[
          { key: "home", label: "Home", icon: MapPin },
          { key: "order", label: "Order", icon: Plus },
          { key: "fund", label: "Fund", icon: Wallet },
          { key: "profile", label: "Profile", icon: User, badge: pendingTasks.length },
        ]}
      />
      <div className="md:hidden h-16" aria-hidden="true" />
    </div>
  );
}
