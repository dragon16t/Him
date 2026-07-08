import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import DelhiveryShipActions from "../components/DelhiveryShipActions";
import LabelPrintButton, { BulkLabelButton } from "../components/LabelPrintButton";
import TodayStatsCards from "../components/TodayStatsCards";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DailyTaskSheet from "@/components/DailyTaskSheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LogOut, Loader2, Package, Truck, Check, AlertTriangle, Search } from "lucide-react";
import AttendanceCheckIn from "../components/AttendanceCheckIn";
import NotificationBell from "../components/NotificationBell";
import PostOfficePanel from "../components/PostOfficePanel";
import TelecallerPerformanceCards from "../components/TelecallerPerformanceCards";
import StockAllocationPanel from "../components/StockAllocationPanel";
import DarkModeToggle from "../components/DarkModeToggle";

const API = "/api";
const MONTHS = [{v:"1",l:"Jan"},{v:"2",l:"Feb"},{v:"3",l:"Mar"},{v:"4",l:"Apr"},{v:"5",l:"May"},{v:"6",l:"Jun"},{v:"7",l:"Jul"},{v:"8",l:"Aug"},{v:"9",l:"Sep"},{v:"10",l:"Oct"},{v:"11",l:"Nov"},{v:"12",l:"Dec"}];

export default function InventoryManagerDashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({});
  const [products, setProducts] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [returns, setReturns] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [showStock, setShowStock] = useState(false);
  const [showPO, setShowPO] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [showBadges, setShowBadges] = useState(false);
  const [badgeProduct, setBadgeProduct] = useState(null);
  const [badgeInput, setBadgeInput] = useState("");
  const [stockForm, setStockForm] = useState({pid:"",stock:0,low_stock_threshold:10});
  const [poForm, setPoForm] = useState({vendor_id:"",vendor_name:"",total_amount:0,expected_date:"",items:[]});
  const [returnForm, setReturnForm] = useState({order_id:"",reason:"",type:"return",amount:0,notes:""});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [month, setMonth] = useState((new Date().getMonth()+1).toString());
  const [dateFilter, setDateFilter] = useState(""); // YYYY-MM-DD specific day
  const [showShipDialog, setShowShipDialog] = useState(false);
  const [shipOrder, setShipOrder] = useState(null);
  const [shipForm, setShipForm] = useState({tracking_link:"",courier_name:"",tracking_number:""});
  const [showOrderDetail, setShowOrderDetail] = useState(false);
  const [detailOrder, setDetailOrder] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  // Inventory Manager — order edit + tag state
  const [editOrder, setEditOrder] = useState(null);
  const [editForm, setEditForm] = useState({ customer_name: "", customer_phone: "", customer_address: "", customer_city: "", customer_pincode: "", customer_landmark: "", payment_type: "cod" });
  const [orderBadgeInput, setOrderBadgeInput] = useState("");
  const ORDER_BADGE_PRESETS = ["DTDC","Delhivery","India Post","Bluedart","XpressBees","Ekart","Verified","Shipment Delayed","Hold","COD Reject Risk","Repeat Customer","Priority"];
  const [salesManagers, setSalesManagers] = useState([]);
  const [smFilter, setSmFilter] = useState("all");

  const fetchData = useCallback(async () => {
    try {
      const params = {};
      if (smFilter !== "all") params.sales_manager_id = smFilter;
      const r = await axios.get(`${API}/inventory/orders`, { params });
      setOrders(r.data.orders||[]); setStats(r.data.stats||{});
    } catch {}
    try {
      const [pr, ls, po, rt, vn, sm] = await Promise.all([
        axios.get(`${API}/products`).catch(()=>({data:{products:[]}})),
        axios.get(`${API}/products/low-stock`).catch(()=>({data:{products:[]}})),
        axios.get(`${API}/purchase-orders`).catch(()=>({data:{pos:[]}})),
        axios.get(`${API}/returns`).catch(()=>({data:{returns:[]}})),
        axios.get(`${API}/vendors`).catch(()=>({data:{vendors:[]}})),
        axios.get(`${API}/sales-managers`).catch(()=>({data:{sales_managers:[]}})),
      ]);
      setProducts(pr.data.products||[]); setLowStock(ls.data.products||[]);
      setPurchaseOrders(po.data.pos||[]); setReturns(rt.data.returns||[]); setVendors(vn.data.vendors||[]);
      setSalesManagers(sm.data.sales_managers || sm.data || []);
    } catch {}
    setLoading(false);
  }, [smFilter]);

  const updateStock = async () => {
    if(!stockForm.pid) return toast.error("Select product");
    const stockNum = Number(stockForm.stock);
    const threshNum = Number(stockForm.low_stock_threshold);
    if (Number.isNaN(stockNum) || stockNum < 0) return toast.error("Stock must be 0 or higher");
    if (Number.isNaN(threshNum) || threshNum < 0) return toast.error("Threshold must be 0 or higher");
    try { await axios.put(`${API}/products/${stockForm.pid}/stock`, {stock:stockNum, low_stock_threshold:threshNum}); toast.success("Stock updated"); setShowStock(false); fetchData(); } catch(e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const handlePO = async () => { if(!poForm.vendor_name||!poForm.total_amount) return toast.error("Fill fields"); try { await axios.post(`${API}/purchase-orders`, poForm); toast.success("PO created"); setShowPO(false); setPoForm({vendor_id:"",vendor_name:"",total_amount:0,expected_date:"",items:[]}); fetchData(); } catch(e) { toast.error(e.response?.data?.detail || "Failed"); } };
  const handleReturn = async () => { if(!returnForm.order_id||!returnForm.reason) return toast.error("Fill fields"); try { await axios.post(`${API}/returns`, returnForm); toast.success("Return logged"); setShowReturn(false); setReturnForm({order_id:"",reason:"",type:"return",amount:0,notes:""}); fetchData(); } catch(e) { toast.error(e.response?.data?.detail || "Failed"); } };

  const openBadges = (p) => { setBadgeProduct(p); setBadgeInput(""); setShowBadges(true); };
  const addBadge = async () => {
    const b = badgeInput.trim();
    if (!b) return;
    try {
      const r = await axios.put(`${API}/products/${badgeProduct.id}/badges`, { add: b });
      setBadgeProduct(bp => ({ ...bp, badges: r.data.badges }));
      setProducts(ps => ps.map(p => p.id === badgeProduct.id ? { ...p, badges: r.data.badges } : p));
      setBadgeInput("");
      toast.success("Badge added");
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const removeBadge = async (label) => {
    try {
      const r = await axios.put(`${API}/products/${badgeProduct.id}/badges`, { remove: label });
      setBadgeProduct(bp => ({ ...bp, badges: r.data.badges }));
      setProducts(ps => ps.map(p => p.id === badgeProduct.id ? { ...p, badges: r.data.badges } : p));
      toast.success("Badge removed");
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const PRESET_BADGES = ["Bestseller","New","Hot Pick","Limited","Trending","Premium","Eco","Combo Deal"];
  useEffect(() => { fetchData(); }, [fetchData]);

  const markShipped = (o) => { setShipOrder(o); setShipForm({tracking_link:"",courier_name:"",tracking_number:""}); setShowShipDialog(true); };
  const submitShip = async () => {
    const link = (shipForm.tracking_link || "").trim();
    if (!link) return toast.error("Tracking link is required");
    try { new URL(link); } catch { return toast.error("Tracking link must be a valid URL (https://...)"); }
    try {
      await axios.put(`${API}/inventory/orders/${shipOrder.id}/ship`, {...shipForm, tracking_link: link});
      toast.success("Shipped! Tracking saved.");
      setShowShipDialog(false); fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const markDelivered = async (oid) => { try { await axios.put(`${API}/inventory/orders/${oid}/deliver`); toast.success("Delivered! Commission credited."); fetchData(); } catch(e) { toast.error(e.response?.data?.detail || "Failed"); } };
  const markReturned = async (oid) => {
    const reason = window.prompt("Reason for return / RTO?", "Customer rejected delivery");
    if (!reason) return;
    try {
      await axios.put(`${API}/orders/${oid}/status`, { status: "returned", reason });
      await axios.post(`${API}/returns`, { order_id: oid, reason, type: "return", amount: 0 }).catch(() => {});
      toast.success("Marked as returned. Revenue/commission reversed.");
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };
  const openDetail = (o) => { setDetailOrder(o); setShowOrderDetail(true); };

  // ---- Inventory Manager: Order edit ----
  const openOrderEdit = (o) => {
    setEditOrder(o);
    setEditForm({
      customer_name: o.customer_name || "",
      customer_phone: o.customer_phone || "",
      customer_address: o.customer_address || "",
      customer_city: o.customer_city || "",
      customer_pincode: o.customer_pincode || "",
      customer_landmark: o.customer_landmark || "",
      payment_type: o.payment_type || "cod",
    });
  };
  const submitOrderEdit = async () => {
    if (!editOrder) return;
    if (!editForm.customer_address.trim()) return toast.error("Address required");
    try {
      await axios.put(`${API}/orders/${editOrder.id}`, editForm);
      toast.success("Order updated");
      setEditOrder(null);
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  // ---- Inventory Manager: Order soft-delete ----
  const softDeleteOrder = async (o) => {
    const reason = window.prompt(`Move order ${o.id} (Rs.${o.total_amount || 0}) to trash?\n\nReason:`);
    if (!reason) return;
    try {
      await axios.delete(`${API}/orders/${o.id}/soft-delete`, { data: { reason } });
      toast.success("Order moved to trash. Revenue & commission reversed.");
      setShowOrderDetail(false);
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  // ---- Inventory Manager: Order badges ----
  const addOrderBadge = async (label) => {
    const b = (label || orderBadgeInput).trim();
    if (!b || !detailOrder) return;
    try {
      const r = await axios.put(`${API}/orders/${detailOrder.id}/badges`, { add: b });
      const updated = { ...detailOrder, badges: r.data.badges };
      setDetailOrder(updated);
      setOrders(os => os.map(o => o.id === detailOrder.id ? { ...o, badges: r.data.badges } : o));
      setOrderBadgeInput("");
      toast.success("Badge added");
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const removeOrderBadge = async (label) => {
    if (!detailOrder) return;
    try {
      const r = await axios.put(`${API}/orders/${detailOrder.id}/badges`, { remove: label });
      const updated = { ...detailOrder, badges: r.data.badges };
      setDetailOrder(updated);
      setOrders(os => os.map(o => o.id === detailOrder.id ? { ...o, badges: r.data.badges } : o));
      toast.success("Badge removed");
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const logout = () => { localStorage.clear(); navigate("/login"); };
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F9F8F6]"><Loader2 className="w-8 h-8 animate-spin text-[#3B5249]" /></div>;

  const filtered = orders.filter(o => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (dateFilter) { if ((o.created_at||"").slice(0,10) !== dateFilter) return false; }
    else if (month !== "all") { const m = o.created_at?.slice(5,7)?.replace(/^0/,""); if (m !== month) return false; }
    if (search) {
      const s = search.toLowerCase();
      const itemMatch = (o.items||[]).some(it => (it.name||"").toLowerCase().includes(s));
      return (o.customer_name||"").toLowerCase().includes(s) || (o.id||"").toLowerCase().includes(s) || (o.customer_phone||"").includes(s) || (o.customer_address||"").toLowerCase().includes(s) || itemMatch;
    }
    return true;
  });

  // Pagination for list view
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;
  const paginated = filtered.slice(pageStart, pageEnd);
  // Reset to page 1 whenever filters reduce results below current page
  if (page > totalPages && page !== 1) { setTimeout(() => setPage(1), 0); }

  const statuses = ["pending","confirmed","shipped","delivered"];

  const itemsSummary = (o) => {
    const its = o.items || [];
    if (!its.length) return null;
    const total = its.reduce((s, it) => s + (Number(it.quantity)||0), 0);
    const first = its[0];
    return `${first.name||"Product"}${its.length>1?` +${its.length-1} more`:""} (${total} qty)`;
  };

  return (
    <div className="min-h-screen bg-[#F9F8F6]" data-testid="inventory-manager-dashboard">
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#F9F8F6]/80 border-b border-[#E5E3DB]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div><h1 className="font-heading text-xl font-medium text-[#2C3531]">Celesta <span className="text-[#3B5249] font-semibold">Glow</span></h1><p className="text-xs text-[#59615D] uppercase tracking-[0.15em]">Inventory Manager - {user.name}</p></div>
          <div className="flex items-center gap-2"><DarkModeToggle compact /><NotificationBell /><AttendanceCheckIn /><Button variant="outline" onClick={logout} className="rounded-full border-[#E5E3DB] text-sm"><LogOut className="w-4 h-4 mr-1"/>Logout</Button></div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <TodayStatsCards/>
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-4 text-center"><Package className="w-5 h-5 mx-auto mb-1 text-[#3B5249]"/><p className="font-heading text-xl font-bold">{stats.total||0}</p><p className="text-[9px] text-[#59615D] uppercase">Total Orders</p></div>
          <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4 text-center"><p className="font-heading text-xl font-bold text-yellow-700">{stats.pending||0}</p><p className="text-[9px] text-yellow-600 uppercase">Pending</p></div>
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 text-center"><p className="font-heading text-xl font-bold text-blue-700">{stats.confirmed||0}</p><p className="text-[9px] text-blue-600 uppercase">Confirmed</p></div>
          <div className="bg-purple-50 rounded-xl border border-purple-200 p-4 text-center"><Truck className="w-5 h-5 mx-auto mb-1 text-purple-600"/><p className="font-heading text-xl font-bold text-purple-700">{stats.shipped||0}</p><p className="text-[9px] text-purple-600 uppercase">Shipped</p></div>
          <div className="bg-green-50 rounded-xl border border-green-200 p-4 text-center"><Check className="w-5 h-5 mx-auto mb-1 text-green-600"/><p className="font-heading text-xl font-bold text-green-700">{stats.delivered||0}</p><p className="text-[9px] text-green-600 uppercase">Delivered</p></div>
          <div className={`rounded-xl border p-4 text-center ${stats.not_shipped>0?'bg-red-50 border-red-200':'bg-[#F9F8F6] border-[#E5E3DB]'}`}><AlertTriangle className={`w-5 h-5 mx-auto mb-1 ${stats.not_shipped>0?'text-red-600':'text-[#59615D]'}`}/><p className={`font-heading text-xl font-bold ${stats.not_shipped>0?'text-red-700':''}`}>{stats.not_shipped||0}</p><p className="text-[9px] text-[#59615D] uppercase">Not Shipped</p></div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-4 flex-wrap items-center">
          <div className="relative flex-1 max-w-xs"><Search className="w-4 h-4 absolute left-3 top-2 text-[#59615D]"/><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search orders/address..." className="rounded-full pl-9 h-8 text-xs"/></div>
          <div className="flex gap-1">{["all",...statuses,"returned"].map(s=>(<button key={s} onClick={()=>setStatusFilter(s)} className={`px-2.5 py-1 rounded-full text-[9px] font-medium capitalize ${statusFilter===s?"bg-[#3B5249] text-white":"bg-white border border-[#E5E3DB] text-[#59615D]"}`}>{s}</button>))}</div>
          <div className="flex items-center gap-1 bg-white rounded-full px-2 py-0.5 border border-[#E5E3DB]">
            <span className="text-[9px] text-[#59615D] uppercase">Date</span>
            <Input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)} className="h-6 text-[10px] border-0 p-1 w-32" data-testid="inv-date-filter"/>
            {dateFilter && <button onClick={()=>setDateFilter("")} className="text-[9px] text-[#B75D69] underline">clear</button>}
          </div>
          <div className="flex gap-1">{MONTHS.map(m=>(<button key={m.v} onClick={()=>{setMonth(m.v); setDateFilter("");}} className={`px-2 py-0.5 rounded-full text-[9px] ${month===m.v&&!dateFilter?"bg-[#3B5249] text-white":"bg-white border border-[#E5E3DB] text-[#59615D]"}`}>{m.l}</button>))}<button onClick={()=>{setMonth("all"); setDateFilter("");}} className={`px-2 py-0.5 rounded-full text-[9px] ${month==="all"&&!dateFilter?"bg-[#3B5249] text-white":"bg-white border border-[#E5E3DB] text-[#59615D]"}`}>All</button></div>
          {/* Filter by Sales Manager */}
          <div className="flex items-center gap-1 bg-white rounded-full px-2 py-0.5 border border-[#E5E3DB]" data-testid="inv-sm-filter-wrap">
            <span className="text-[9px] text-[#59615D] uppercase">SM</span>
            <select value={smFilter} onChange={e=>setSmFilter(e.target.value)} className="h-6 text-[10px] border-0 outline-none bg-transparent" data-testid="inv-sm-filter">
              <option value="all">All Sales Managers</option>
              {salesManagers.map(sm => <option key={sm.id} value={sm.id}>{sm.name}{sm.is_head_of_sales ? " (Head)" : ""}</option>)}
            </select>
          </div>
          {/* Bulk label download for the currently filtered set */}
          <BulkLabelButton orderIds={filtered.map(o => o.id)} compact />
        </div>

        {/* Order Pipeline */}
        <Tabs defaultValue="pipeline" className="space-y-4">
          <TabsList className="bg-white border border-[#E5E3DB] rounded-full p-1 flex-wrap gap-1">
            <TabsTrigger value="pipeline" className="rounded-full text-xs data-[state=active]:bg-[#3B5249] data-[state=active]:text-white">Pipeline</TabsTrigger>
            <TabsTrigger value="list" className="rounded-full text-xs data-[state=active]:bg-[#3B5249] data-[state=active]:text-white">List</TabsTrigger>
            <TabsTrigger value="stock" className="rounded-full text-xs data-[state=active]:bg-[#3B5249] data-[state=active]:text-white" data-testid="inv-tab-stock">Stock {lowStock.length>0&&<Badge className="ml-1 bg-red-500 text-white text-[8px]">{lowStock.length}</Badge>}</TabsTrigger>
            <TabsTrigger value="po" className="rounded-full text-xs data-[state=active]:bg-[#3B5249] data-[state=active]:text-white" data-testid="inv-tab-po">Purchase Orders</TabsTrigger>
            <TabsTrigger value="returns" className="rounded-full text-xs data-[state=active]:bg-[#3B5249] data-[state=active]:text-white" data-testid="inv-tab-returns">Returns/RTO</TabsTrigger>
            <TabsTrigger value="post" className="rounded-full text-xs data-[state=active]:bg-[#3B5249] data-[state=active]:text-white" data-testid="inv-tab-post">📮 India Post</TabsTrigger>
            <TabsTrigger value="tcperf" className="rounded-full text-xs data-[state=active]:bg-[#3B5249] data-[state=active]:text-white" data-testid="inv-tab-tcperf">📊 TC Performance</TabsTrigger>
            <TabsTrigger value="allocation" className="rounded-full text-xs data-[state=active]:bg-[#3B5249] data-[state=active]:text-white" data-testid="inv-tab-allocation">👥 Stock Allocation</TabsTrigger>
            <TabsTrigger value="mysheet" className="rounded-full text-xs data-[state=active]:bg-[#3B5249] data-[state=active]:text-white" data-testid="inv-tab-mysheet">My Sheet</TabsTrigger>
          </TabsList>

          {/* PIPELINE */}
          <TabsContent value="pipeline">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {statuses.map(status => {
                const items = filtered.filter(o => o.status === status);
                const colors = {pending:"border-yellow-200 bg-yellow-50",confirmed:"border-blue-200 bg-blue-50",shipped:"border-purple-200 bg-purple-50",delivered:"border-green-200 bg-green-50"};
                return (
                  <div key={status} className={`rounded-xl border-2 p-3 ${colors[status]}`}>
                    <div className="flex justify-between items-center mb-3"><p className="text-xs font-bold uppercase">{status}</p><Badge variant="outline" className="text-[9px]">{items.length}</Badge></div>
                    <div className="space-y-2 max-h-96 overflow-y-auto">{items.map(o=>(
                      <div key={o.id} className="bg-white rounded-lg p-3 shadow-sm cursor-pointer hover:ring-2 hover:ring-[#3B5249]" onClick={()=>openDetail(o)} data-testid={`inv-order-${o.id}`}>
                        <p className="font-medium text-xs">{o.customer_name}</p>
                        <p className="text-[10px] text-[#59615D]">{o.customer_phone} | Rs.{o.total_amount}</p>
                        <p className="text-[10px] text-[#3B5249] truncate" title={o.customer_address}>📍 {o.customer_address || "No address"}</p>
                        {itemsSummary(o) && <p className="text-[10px] text-[#2C3531] truncate" title={(o.items||[]).map(it=>`${it.name} x${it.quantity}`).join(", ")}>🛍️ {itemsSummary(o)}</p>}
                        {(o.badges||[]).length>0 && <div className="flex flex-wrap gap-1 mt-1">{(o.badges||[]).slice(0,3).map(b => <span key={b} className="text-[8px] px-1.5 py-0.5 rounded-full bg-[#3B5249]/10 text-[#3B5249] border border-[#3B5249]/30">{b}</span>)}{(o.badges||[]).length>3 && <span className="text-[8px] text-[#A66E4E]">+{(o.badges||[]).length-3}</span>}</div>}
                        <p className="text-[9px] text-[#A66E4E]">{o.created_at?.slice(0,10)} | {o.payment_type?.toUpperCase()}{o.created_by_name?` • by ${o.created_by_name}`:""}</p>
                        {o.tracking_link && <a href={o.tracking_link} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} className="text-[9px] text-purple-700 underline block truncate">📦 {o.courier_name||"Track"}</a>}
                        <div className="flex gap-1 mt-2 flex-wrap" onClick={e=>e.stopPropagation()}>
                          <DelhiveryShipActions order={o} role="inventory_manager" onChange={fetchData} compact />
                          <LabelPrintButton orderId={o.id} compact label="Label" />
                          {status==="confirmed"&&!o.awb_number&&<Button size="sm" variant="outline" className="rounded-full text-[9px] h-6" onClick={()=>markShipped(o)} data-testid={`ship-${o.id}`}><Truck className="w-3 h-3 mr-1"/>Manual</Button>}
                          {status==="shipped"&&<Button size="sm" className="rounded-full text-[9px] bg-green-600 text-white h-6" onClick={()=>markDelivered(o.id)} data-testid={`deliver-${o.id}`}><Check className="w-3 h-3 mr-1"/>Deliver</Button>}
                          {(status==="shipped"||status==="delivered")&&<Button size="sm" variant="outline" className="rounded-full text-[9px] h-6 border-red-300 text-red-700 hover:bg-red-50" onClick={()=>markReturned(o.id)} data-testid={`return-${o.id}`}>Returned</Button>}
                        </div>
                      </div>
                    ))}</div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* LIST */}
          <TabsContent value="list">
            <div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
              {filtered.length===0?<p className="text-center py-8 text-[#59615D] text-sm">No orders</p>:
              <>
              <div className="flex items-center justify-between mb-3 text-[10px] text-[#59615D]">
                <span>Showing {pageStart+1}-{Math.min(pageEnd, filtered.length)} of {filtered.length}</span>
                <span>Page {safePage} / {totalPages}</span>
              </div>
              <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b bg-[#F9F8F6]">{["Order","Customer","Phone","Address","Products","Amount","Type","Date","Created By","Status","Tracking","Actions"].map(h=><th key={h} className="p-2 text-left text-[9px] uppercase text-[#59615D]">{h}</th>)}</tr></thead>
              <tbody>{paginated.map(o=>(
                <tr key={o.id} className="border-b border-[#E5E3DB] hover:bg-[#F9F8F6] cursor-pointer" onClick={()=>openDetail(o)} data-testid={`inv-row-${o.id}`}><td className="p-2">{o.id}</td><td className="p-2 font-medium">{o.customer_name}</td><td className="p-2">{o.customer_phone}</td><td className="p-2 max-w-[200px] truncate" title={o.customer_address}>{o.customer_address||"-"}</td><td className="p-2 max-w-[180px] truncate" title={(o.items||[]).map(it=>`${it.name} x${it.quantity}`).join(", ")}>{itemsSummary(o)||"-"}</td><td className="p-2">Rs.{o.total_amount}</td><td className="p-2"><Badge variant="outline" className="text-[8px]">{o.payment_type}</Badge></td><td className="p-2">{o.created_at?.slice(0,10)}</td><td className="p-2 text-[10px]">{o.created_by_name||"-"}</td><td className="p-2"><Badge className={`text-[8px] ${o.status==="delivered"?"bg-green-100 text-green-800":o.status==="shipped"?"bg-purple-100 text-purple-800":o.status==="confirmed"?"bg-blue-100 text-blue-800":"bg-yellow-100 text-yellow-800"}`}>{o.status}</Badge></td>
                <td className="p-2 text-[10px]">{o.tracking_link?<a href={o.tracking_link} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} className="text-purple-700 underline">{o.courier_name||"Track"}</a>:"-"}</td>
                <td className="p-2" onClick={e=>e.stopPropagation()}><div className="flex gap-1 items-center flex-wrap"><DelhiveryShipActions order={o} role="inventory_manager" onChange={fetchData} compact /><LabelPrintButton orderId={o.id} compact label="Label" />{o.status==="shipped"&&<Button size="sm" className="rounded-full text-[9px] bg-green-600 text-white h-5 px-2" onClick={()=>markDelivered(o.id)}>Deliver</Button>}{(o.status==="shipped"||o.status==="delivered")&&<Button size="sm" variant="outline" className="rounded-full text-[9px] h-5 px-2 border-red-300 text-red-700" onClick={()=>markReturned(o.id)}>Returned</Button>}
                  <Button size="sm" variant="outline" className="rounded-full text-[9px] h-5 px-2" onClick={()=>openOrderEdit(o)} data-testid={`inv-row-edit-${o.id}`}>✏️</Button>
                  <Button size="sm" variant="outline" className="rounded-full text-[9px] h-5 px-2 border-red-300 text-red-700" onClick={()=>softDeleteOrder(o)} data-testid={`inv-row-delete-${o.id}`}>🗑</Button>
                </div>{(o.badges||[]).length>0 && <div className="flex flex-wrap gap-1 mt-1">{(o.badges||[]).slice(0,3).map(b => <span key={b} className="text-[8px] px-1.5 py-0.5 rounded-full bg-[#3B5249]/10 text-[#3B5249] border border-[#3B5249]/30">{b}</span>)}{(o.badges||[]).length>3 && <span className="text-[8px] text-[#A66E4E]">+{(o.badges||[]).length-3}</span>}</div>}</td></tr>
              ))}</tbody></table></div>
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4" data-testid="inv-pagination">
                  <Button size="sm" variant="outline" className="rounded-full text-[10px] h-7" disabled={safePage===1} onClick={()=>setPage(p=>Math.max(1,p-1))} data-testid="inv-pg-prev">‹ Prev</Button>
                  {Array.from({length: totalPages}, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
                    .map((p, idx, arr) => (
                      <span key={p} className="flex items-center gap-1">
                        {idx > 0 && arr[idx-1] !== p - 1 && <span className="text-[10px] text-[#59615D]">…</span>}
                        <button onClick={()=>setPage(p)} className={`px-2.5 py-1 rounded-full text-[10px] font-medium ${safePage===p?"bg-[#3B5249] text-white":"bg-white border border-[#E5E3DB] text-[#59615D]"}`} data-testid={`inv-pg-${p}`}>{p}</button>
                      </span>
                    ))}
                  <Button size="sm" variant="outline" className="rounded-full text-[10px] h-7" disabled={safePage===totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))} data-testid="inv-pg-next">Next ›</Button>
                </div>
              )}
              </>}
            </div>
          </TabsContent>

          {/* STOCK */}
          <TabsContent value="stock">
            <div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
              <div className="flex justify-between mb-3"><h3 className="font-heading font-medium">Stock Management ({products.length} products)</h3><Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={()=>setShowStock(true)} data-testid="update-stock-btn">Update Stock</Button></div>
              {lowStock.length>0 && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3"><p className="text-xs font-medium text-red-700"><AlertTriangle className="w-3 h-3 inline mr-1"/>Low-stock alert: {lowStock.length} products below threshold</p>
                <div className="text-[10px] text-red-600 mt-1">{lowStock.slice(0,5).map(p=>p.name).join(", ")}</div></div>}
              {products.length===0 ? <p className="text-center py-6 text-[#59615D] text-sm">No products. Add via Admin.</p> :
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="inv-product-grid">
                  {products.map(p=>{
                    const isLow=(p.stock||0)<=(p.low_stock_threshold||10);
                    const img = p.image_url || p.image || (p.images||[])[0] || "";
                    const badges = p.badges || [];
                    return (
                      <div key={p.id} className="border border-[#E5E3DB] rounded-xl overflow-hidden bg-white hover:shadow-md transition" data-testid={`prod-card-${p.id}`}>
                        <div className="aspect-video bg-[#F9F8F6] flex items-center justify-center overflow-hidden">
                          {img ? <img src={img} alt={p.name} className="w-full h-full object-cover" /> : <Package className="w-10 h-10 text-[#A66E4E]"/>}
                        </div>
                        <div className="p-3">
                          <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate" title={p.name}>{p.name}</p>
                              <p className="text-[10px] text-[#59615D]">Rs.{p.price||0} • {p.category||"general"}</p>
                            </div>
                            <Badge className={`text-[8px] shrink-0 ${isLow?'bg-red-100 text-red-800':'bg-green-100 text-green-800'}`}>{isLow?'LOW':'OK'}</Badge>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[10px]">
                            <span className="text-[#59615D]">Stock: <b className={isLow?"text-red-700":"text-[#2C3531]"}>{p.stock||0}</b> / threshold {p.low_stock_threshold||10}</span>
                          </div>
                          {/* Badges row */}
                          <div className="mt-2 flex flex-wrap gap-1 min-h-[24px]" data-testid={`prod-badges-${p.id}`}>
                            {badges.length===0 ? <span className="text-[9px] text-[#A66E4E] italic">No badges</span> :
                              badges.map(b => <Badge key={b} variant="outline" className="text-[9px] border-[#3B5249] text-[#3B5249] bg-[#3B5249]/5">{b}</Badge>)}
                          </div>
                          <div className="mt-3 flex gap-2">
                            <Button size="sm" variant="outline" className="flex-1 rounded-full text-[10px] h-7" onClick={()=>{setStockForm({pid:p.id,stock:p.stock||0,low_stock_threshold:p.low_stock_threshold||10}); setShowStock(true);}} data-testid={`prod-update-stock-${p.id}`}>Update Stock</Button>
                            <Button size="sm" className="flex-1 rounded-full text-[10px] h-7 bg-[#3B5249] text-white" onClick={()=>openBadges(p)} data-testid={`prod-manage-badges-${p.id}`}>Manage Badges</Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>}
            </div>
          </TabsContent>

          {/* PURCHASE ORDERS */}
          <TabsContent value="po">
            <div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
              <div className="flex justify-between mb-3"><h3 className="font-heading font-medium">Purchase Orders ({purchaseOrders.length})</h3><Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={()=>setShowPO(true)} data-testid="add-po-btn">+ New PO</Button></div>
              {purchaseOrders.length===0 ? <p className="text-center py-6 text-[#59615D] text-sm">No purchase orders</p> :
                <div className="space-y-2">{purchaseOrders.map(p=>(
                  <div key={p.id} className="border border-[#E5E3DB] rounded-xl p-3 flex justify-between" data-testid={`po-${p.id}`}>
                    <div><p className="font-medium text-sm">{p.vendor_name} <Badge className="text-[8px] ml-1">{p.status}</Badge></p><p className="text-[10px] text-[#59615D]">Expected: {p.expected_date} | Items: {(p.items||[]).length}</p></div>
                    <div className="text-right"><p className="font-heading text-lg font-semibold text-[#3B5249]">Rs.{p.total_amount}</p>
                      {p.status==='pending'&&<Button size="sm" variant="outline" className="rounded-full text-[10px] h-6 mt-1" onClick={async()=>{await axios.put(`${API}/purchase-orders/${p.id}`,{status:'received'}); toast.success("Marked received"); fetchData();}}>Mark Received</Button>}</div>
                  </div>
                ))}</div>}
            </div>
          </TabsContent>

          {/* RETURNS / RTO */}
          <TabsContent value="returns">
            <div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
              <div className="flex justify-between mb-3"><h3 className="font-heading font-medium">Returns & RTO ({returns.length})</h3><Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={()=>setShowReturn(true)} data-testid="add-return-btn">+ Log Return</Button></div>
              {returns.length===0 ? <p className="text-center py-6 text-[#59615D] text-sm">No returns logged</p> :
                <div className="space-y-2">{returns.map(r=>(
                  <div key={r.id} className="border border-[#E5E3DB] rounded-xl p-3 flex justify-between" data-testid={`ret-${r.id}`}>
                    <div><p className="font-medium text-sm">Order: {r.order_id} <Badge className="text-[8px] ml-1 capitalize">{r.type}</Badge></p><p className="text-[10px] text-[#59615D]">Reason: {r.reason}</p></div>
                    <div className="text-right"><p className="font-heading text-lg font-semibold text-red-700">-Rs.{r.amount}</p>
                      <Select value={r.status} onValueChange={async(v)=>{await axios.put(`${API}/returns/${r.id}`,{status:v}); fetchData();}}><SelectTrigger className="h-6 w-24 text-[9px] rounded-full mt-1"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="processed">Processed</SelectItem><SelectItem value="refunded">Refunded</SelectItem></SelectContent></Select></div>
                  </div>
                ))}</div>}
            </div>
          </TabsContent>
          <TabsContent value="mysheet" className="animate-fade-in"><DailyTaskSheet titleSuffix="Inventory Manager" /></TabsContent>
          <TabsContent value="post" className="animate-fade-in"><PostOfficePanel role="inventory_manager" /></TabsContent>
          <TabsContent value="tcperf" className="animate-fade-in">
            <div className="bg-white rounded-2xl border border-[#E5E3DB] p-4 mb-3 flex items-center gap-2">
              <Label className="text-xs">Sales Manager</Label>
              <select value={smFilter === "all" ? (salesManagers[0]?.id || "") : smFilter} onChange={e => setSmFilter(e.target.value)} className="rounded-full border border-[#E5E3DB] bg-white text-xs h-8 px-2" data-testid="inv-tcperf-sm-select">
                {salesManagers.map(sm => <option key={sm.id} value={sm.id}>{sm.name}{sm.is_head_of_sales ? " (Head)" : ""}</option>)}
              </select>
            </div>
            <TelecallerPerformanceCards smId={smFilter === "all" ? (salesManagers[0]?.id || "") : smFilter} title="Team Performance" />
          </TabsContent>
          <TabsContent value="allocation" className="animate-fade-in"><StockAllocationPanel /></TabsContent>
        </Tabs>
      </div>

      {/* Stock Dialog */}
      <Dialog open={showStock} onOpenChange={setShowStock}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Update Product Stock</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Select value={stockForm.pid} onValueChange={v=>{const p=products.find(x=>x.id===v); setStockForm(f=>({...f,pid:v,stock:p?.stock||0,low_stock_threshold:p?.low_stock_threshold||10}));}}><SelectTrigger className="rounded-xl" data-testid="stock-prod-select"><SelectValue placeholder="Select product"/></SelectTrigger><SelectContent>{products.map(p=><SelectItem key={p.id} value={p.id}>{p.name} (current: {p.stock||0})</SelectItem>)}</SelectContent></Select>
          <div><Label className="text-xs">Stock Qty</Label><Input type="number" value={stockForm.stock} onChange={e=>setStockForm(f=>({...f,stock:e.target.value}))} className="rounded-xl"/></div>
          <div><Label className="text-xs">Low Stock Threshold</Label><Input type="number" value={stockForm.low_stock_threshold} onChange={e=>setStockForm(f=>({...f,low_stock_threshold:e.target.value}))} className="rounded-xl"/></div>
          <Button onClick={updateStock} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="stock-submit">Update</Button>
        </div>
      </DialogContent></Dialog>

      {/* PO Dialog */}
      <Dialog open={showPO} onOpenChange={setShowPO}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">New Purchase Order</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Select value={poForm.vendor_id} onValueChange={v=>{const ven=vendors.find(x=>x.id===v); setPoForm(f=>({...f,vendor_id:v,vendor_name:ven?.name||""}));}}><SelectTrigger className="rounded-xl" data-testid="po-vendor-select"><SelectValue placeholder="Select vendor"/></SelectTrigger><SelectContent>{vendors.map(v=><SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent></Select>
          <Input type="number" placeholder="Total Amount" value={poForm.total_amount} onChange={e=>setPoForm(f=>({...f,total_amount:e.target.value}))} className="rounded-xl"/>
          <Input type="date" placeholder="Expected Date" value={poForm.expected_date} onChange={e=>setPoForm(f=>({...f,expected_date:e.target.value}))} className="rounded-xl"/>
          <Button onClick={handlePO} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="po-submit">Create</Button>
        </div>
      </DialogContent></Dialog>

      {/* Return Dialog */}
      <Dialog open={showReturn} onOpenChange={setShowReturn}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Log Return / RTO</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Order ID" value={returnForm.order_id} onChange={e=>setReturnForm(f=>({...f,order_id:e.target.value}))} className="rounded-xl"/>
          <Select value={returnForm.type} onValueChange={v=>setReturnForm(f=>({...f,type:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="return">Return</SelectItem><SelectItem value="rto">RTO (Return To Origin)</SelectItem><SelectItem value="exchange">Exchange</SelectItem></SelectContent></Select>
          <Input placeholder="Reason" value={returnForm.reason} onChange={e=>setReturnForm(f=>({...f,reason:e.target.value}))} className="rounded-xl"/>
          <Input type="number" placeholder="Amount" value={returnForm.amount} onChange={e=>setReturnForm(f=>({...f,amount:e.target.value}))} className="rounded-xl"/>
          <Button onClick={handleReturn} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="return-submit">Log Return</Button>
        </div>
      </DialogContent></Dialog>

      {/* Ship Dialog (Tracking Link) */}
      <Dialog open={showShipDialog} onOpenChange={setShowShipDialog}><DialogContent className="rounded-2xl" data-testid="ship-dialog"><DialogHeader><DialogTitle className="font-heading">Ship Order — Tracking Details</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {shipOrder && <div className="bg-[#F9F8F6] rounded-xl p-3 text-xs"><p className="font-medium">{shipOrder.id} • {shipOrder.customer_name}</p><p className="text-[#3B5249]">📍 {shipOrder.customer_address}</p><p className="text-[#59615D]">📞 {shipOrder.customer_phone} | Rs.{shipOrder.total_amount}</p></div>}
          <div><Label className="text-xs">Courier Name</Label><Select value={shipForm.courier_name} onValueChange={v=>setShipForm(f=>({...f,courier_name:v}))}><SelectTrigger className="rounded-xl" data-testid="ship-courier"><SelectValue placeholder="Select courier"/></SelectTrigger><SelectContent><SelectItem value="Shiprocket">Shiprocket</SelectItem><SelectItem value="Delhivery">Delhivery</SelectItem><SelectItem value="Bluedart">Bluedart</SelectItem><SelectItem value="DTDC">DTDC</SelectItem><SelectItem value="India Post">India Post</SelectItem><SelectItem value="Ekart">Ekart</SelectItem><SelectItem value="XpressBees">XpressBees</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select></div>
          <div><Label className="text-xs">Tracking Number</Label><Input value={shipForm.tracking_number} onChange={e=>setShipForm(f=>({...f,tracking_number:e.target.value}))} className="rounded-xl" placeholder="AWB/Consignment number" data-testid="ship-tracking-num"/></div>
          <div><Label className="text-xs text-[#B75D69] font-semibold">Tracking Link *</Label><Input value={shipForm.tracking_link} onChange={e=>setShipForm(f=>({...f,tracking_link:e.target.value}))} className="rounded-xl" placeholder="https://tracking.example.com/..." data-testid="ship-tracking-link"/></div>
          <Button onClick={submitShip} className="w-full rounded-full bg-purple-600 text-white" data-testid="ship-submit"><Truck className="w-4 h-4 mr-2"/>Mark Shipped</Button>
        </div>
      </DialogContent></Dialog>

      {/* Order Detail Dialog */}
      <Dialog open={showOrderDetail} onOpenChange={setShowOrderDetail}><DialogContent className="rounded-2xl max-w-lg max-h-[90vh] overflow-y-auto" data-testid="order-detail-dialog" aria-describedby="order-detail-desc"><DialogHeader><DialogTitle className="font-heading">Order Details</DialogTitle></DialogHeader>
        <p id="order-detail-desc" className="sr-only">Order details with edit, delete and tagging options.</p>
        {detailOrder && <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2 text-xs"><div><span className="text-[#59615D]">Order:</span> <b>{detailOrder.id}</b></div><div><span className="text-[#59615D]">Status:</span> <Badge className="text-[10px]">{detailOrder.status}</Badge></div></div>
          <div className="bg-[#F9F8F6] rounded-xl p-3">
            <p className="font-semibold text-sm">{detailOrder.customer_name}</p>
            <p className="text-xs">📞 {detailOrder.customer_phone}</p>
            <p className="text-xs text-[#3B5249] mt-1">📍 <b>Full Address:</b><br/>{detailOrder.customer_address}{detailOrder.customer_city?`, ${detailOrder.customer_city}`:""}{detailOrder.customer_pincode?` - ${detailOrder.customer_pincode}`:""}</p>
            {detailOrder.customer_landmark && <p className="text-[10px] text-[#A66E4E]">Landmark: {detailOrder.customer_landmark}</p>}
          </div>
          <div className="text-xs"><b>Items:</b><ul className="list-none ml-0 mt-1 space-y-1">{(detailOrder.items||[]).map((it,i)=>(<li key={`imd-${i}`} className="bg-[#F4F1EA] rounded-lg px-2 py-1 flex justify-between items-center"><span><b className="text-[#2C3531]">{it.name||it.product_name}</b> <span className="text-[#59615D]">× {it.quantity}</span></span>{(it.price>0)&&<span className="text-[#3B5249] font-semibold">Rs.{it.price*it.quantity}</span>}</li>))}</ul></div>
          <div className="grid grid-cols-2 gap-2 text-xs"><div>Total: <b>Rs.{detailOrder.total_amount}</b></div><div>Payment: <b>{detailOrder.payment_type?.toUpperCase()}</b></div></div>
          <div className="text-xs"><b>Created by:</b> {detailOrder.created_by_name||'-'} ({detailOrder.created_by_role}) on {detailOrder.created_at?.slice(0,16).replace('T',' ')}</div>
          {detailOrder.tracking_link && <div className="bg-purple-50 border border-purple-200 rounded-lg p-2 text-xs"><b>📦 Tracking:</b> {detailOrder.courier_name||""} {detailOrder.tracking_number||""}<br/><a href={detailOrder.tracking_link} target="_blank" rel="noreferrer" className="text-purple-700 underline">{detailOrder.tracking_link}</a><br/>{detailOrder.shipped_by_name && <span className="text-[10px] text-[#59615D]">Shipped by: {detailOrder.shipped_by_name} on {detailOrder.shipped_at?.slice(0,16).replace('T',' ')}</span>}</div>}
          {detailOrder.delivered_at && <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-xs"><b>✅ Delivered</b> on {detailOrder.delivered_at?.slice(0,16).replace('T',' ')}{detailOrder.delivered_by_name?` by ${detailOrder.delivered_by_name}`:""}</div>}

          {/* Order tags / badges */}
          <div className="border-t pt-3 mt-2">
            <Label className="text-xs flex items-center justify-between"><span>Order Tags</span><span className="text-[9px] text-[#A66E4E]">click to remove</span></Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5 min-h-[28px] p-2 bg-[#F9F8F6] rounded-lg" data-testid="order-badge-list">
              {(detailOrder.badges || []).length === 0 ? <span className="text-[10px] text-[#A66E4E] italic">No tags yet</span> :
                (detailOrder.badges || []).map(b => (
                  <button key={b} onClick={() => removeOrderBadge(b)} className="px-2 py-0.5 rounded-full text-[10px] bg-[#3B5249] text-white hover:bg-red-600 transition flex items-center gap-1" data-testid={`order-badge-chip-${b}`} title="Click to remove">
                    {b} <span className="text-[12px] leading-none">×</span>
                  </button>
                ))}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {ORDER_BADGE_PRESETS.filter(p => !(detailOrder.badges || []).includes(p)).map(p => (
                <button key={p} onClick={() => addOrderBadge(p)} className="px-2 py-0.5 rounded-full text-[10px] bg-white border border-[#E5E3DB] text-[#59615D] hover:bg-[#3B5249] hover:text-white transition" data-testid={`order-badge-preset-${p}`}>+ {p}</button>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <Input value={orderBadgeInput} onChange={e => setOrderBadgeInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addOrderBadge(); }} placeholder="Custom tag (e.g. RTO Risk)" className="rounded-xl text-xs h-8" data-testid="order-badge-input" />
              <Button onClick={() => addOrderBadge()} className="rounded-full bg-[#3B5249] text-white text-xs h-8" data-testid="order-badge-add">Add</Button>
            </div>
          </div>

          {/* Action row: Edit + Delete */}
          <div className="border-t pt-3 mt-2 flex gap-2">
            <Button variant="outline" onClick={() => openOrderEdit(detailOrder)} className="flex-1 rounded-full text-xs h-9" data-testid="inv-edit-order-btn">✏️ Edit Order</Button>
            <Button variant="outline" onClick={() => softDeleteOrder(detailOrder)} className="flex-1 rounded-full text-xs h-9 border-red-300 text-red-700 hover:bg-red-50" data-testid="inv-delete-order-btn">🗑 Delete</Button>
          </div>
        </div>}
      </DialogContent></Dialog>

      {/* Edit Order Dialog */}
      <Dialog open={!!editOrder} onOpenChange={o => !o && setEditOrder(null)}><DialogContent className="rounded-2xl max-w-md" data-testid="edit-order-dialog" aria-describedby="edit-order-desc"><DialogHeader><DialogTitle className="font-heading">Edit Order {editOrder?.id}</DialogTitle></DialogHeader>
        <p id="edit-order-desc" className="sr-only">Edit shipping address and customer details.</p>
        {editOrder && <div className="space-y-2 text-sm">
          <div><Label className="text-xs">Customer Name</Label><Input className="rounded-xl h-9 text-xs" value={editForm.customer_name} onChange={e => setEditForm(f => ({ ...f, customer_name: e.target.value }))} data-testid="edit-customer-name" /></div>
          <div><Label className="text-xs">Phone</Label><Input className="rounded-xl h-9 text-xs" value={editForm.customer_phone} onChange={e => setEditForm(f => ({ ...f, customer_phone: e.target.value }))} data-testid="edit-customer-phone" /></div>
          <div><Label className="text-xs">Address *</Label><Input className="rounded-xl h-9 text-xs" value={editForm.customer_address} onChange={e => setEditForm(f => ({ ...f, customer_address: e.target.value }))} data-testid="edit-customer-address" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">City</Label><Input className="rounded-xl h-9 text-xs" value={editForm.customer_city} onChange={e => setEditForm(f => ({ ...f, customer_city: e.target.value }))} /></div>
            <div><Label className="text-xs">Pincode</Label><Input className="rounded-xl h-9 text-xs" value={editForm.customer_pincode} onChange={e => setEditForm(f => ({ ...f, customer_pincode: e.target.value }))} /></div>
          </div>
          <div><Label className="text-xs">Landmark</Label><Input className="rounded-xl h-9 text-xs" value={editForm.customer_landmark} onChange={e => setEditForm(f => ({ ...f, customer_landmark: e.target.value }))} /></div>
          <div><Label className="text-xs">Payment Type</Label>
            <Select value={editForm.payment_type} onValueChange={v => setEditForm(f => ({ ...f, payment_type: v }))}><SelectTrigger className="rounded-xl h-9 text-xs"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="cod">COD</SelectItem><SelectItem value="prepaid">Prepaid</SelectItem><SelectItem value="upi">UPI</SelectItem><SelectItem value="free_influencer">Free / Influencer</SelectItem></SelectContent></Select>
          </div>
          <Button onClick={submitOrderEdit} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="edit-order-submit">Save Changes</Button>
        </div>}
      </DialogContent></Dialog>

      {/* Badge Management Dialog */}
      <Dialog open={showBadges} onOpenChange={setShowBadges}><DialogContent className="rounded-2xl max-w-md" data-testid="badge-dialog" aria-describedby="badge-dialog-desc"><DialogHeader><DialogTitle className="font-heading">Manage Badges {badgeProduct ? `— ${badgeProduct.name}` : ""}</DialogTitle></DialogHeader>
        <p id="badge-dialog-desc" className="sr-only">Add or remove promotional badges shown on this product card.</p>
        {badgeProduct && <div className="space-y-3">
          <div>
            <Label className="text-xs">Current Badges</Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5 min-h-[32px] p-2 bg-[#F9F8F6] rounded-lg" data-testid="badge-current-list">
              {(badgeProduct.badges||[]).length===0 ? <span className="text-[10px] text-[#A66E4E] italic">No badges yet</span> :
                (badgeProduct.badges||[]).map(b => (
                  <button key={b} onClick={()=>removeBadge(b)} className="px-2 py-0.5 rounded-full text-[10px] bg-[#3B5249] text-white hover:bg-red-600 transition flex items-center gap-1" data-testid={`badge-chip-${b}`} title="Click to remove">
                    {b} <span className="text-[12px] leading-none">×</span>
                  </button>
                ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">Quick Add</Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {PRESET_BADGES.filter(p=>!(badgeProduct.badges||[]).includes(p)).map(p => (
                <button key={p} onClick={()=>{setBadgeInput(p); setTimeout(addBadge,50);}} className="px-2 py-0.5 rounded-full text-[10px] bg-white border border-[#E5E3DB] text-[#59615D] hover:bg-[#3B5249] hover:text-white transition" data-testid={`badge-preset-${p}`}>+ {p}</button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">Custom Badge</Label>
            <div className="flex gap-2 mt-1.5">
              <Input value={badgeInput} onChange={e=>setBadgeInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter') addBadge();}} placeholder="e.g. Editor's Pick" className="rounded-xl text-xs" data-testid="badge-input"/>
              <Button onClick={addBadge} className="rounded-full bg-[#3B5249] text-white text-xs" data-testid="badge-add-btn">Add</Button>
            </div>
            <p className="text-[9px] text-[#A66E4E] mt-1">Max 8 badges per product. Click a badge to remove.</p>
          </div>
        </div>}
      </DialogContent></Dialog>
    </div>
  );
}
