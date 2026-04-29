import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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

  const fetchData = useCallback(async () => {
    try { const r = await axios.get(`${API}/inventory/orders`); setOrders(r.data.orders||[]); setStats(r.data.stats||{}); } catch {}
    try {
      const [pr, ls, po, rt, vn] = await Promise.all([
        axios.get(`${API}/products`).catch(()=>({data:{products:[]}})),
        axios.get(`${API}/products/low-stock`).catch(()=>({data:{products:[]}})),
        axios.get(`${API}/purchase-orders`).catch(()=>({data:{pos:[]}})),
        axios.get(`${API}/returns`).catch(()=>({data:{returns:[]}})),
        axios.get(`${API}/vendors`).catch(()=>({data:{vendors:[]}}))
      ]);
      setProducts(pr.data.products||[]); setLowStock(ls.data.products||[]);
      setPurchaseOrders(po.data.pos||[]); setReturns(rt.data.returns||[]); setVendors(vn.data.vendors||[]);
    } catch {}
    setLoading(false);
  }, []);

  const updateStock = async () => { if(!stockForm.pid) return toast.error("Select product"); try { await axios.put(`${API}/products/${stockForm.pid}/stock`, {stock:stockForm.stock,low_stock_threshold:stockForm.low_stock_threshold}); toast.success("Stock updated"); setShowStock(false); fetchData(); } catch { toast.error("Failed"); } };
  const handlePO = async () => { if(!poForm.vendor_name||!poForm.total_amount) return toast.error("Fill fields"); try { await axios.post(`${API}/purchase-orders`, poForm); toast.success("PO created"); setShowPO(false); setPoForm({vendor_id:"",vendor_name:"",total_amount:0,expected_date:"",items:[]}); fetchData(); } catch { toast.error("Failed"); } };
  const handleReturn = async () => { if(!returnForm.order_id||!returnForm.reason) return toast.error("Fill fields"); try { await axios.post(`${API}/returns`, returnForm); toast.success("Return logged"); setShowReturn(false); setReturnForm({order_id:"",reason:"",type:"return",amount:0,notes:""}); fetchData(); } catch { toast.error("Failed"); } };
  useEffect(() => { fetchData(); }, [fetchData]);

  const markShipped = (o) => { setShipOrder(o); setShipForm({tracking_link:"",courier_name:"",tracking_number:""}); setShowShipDialog(true); };
  const submitShip = async () => {
    if (!shipForm.tracking_link.trim()) return toast.error("Tracking link is required");
    try {
      await axios.put(`${API}/inventory/orders/${shipOrder.id}/ship`, shipForm);
      toast.success("Shipped! Tracking saved.");
      setShowShipDialog(false); fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const markDelivered = async (oid) => { try { await axios.put(`${API}/inventory/orders/${oid}/deliver`); toast.success("Delivered! Commission credited."); fetchData(); } catch { toast.error("Failed"); } };
  const openDetail = (o) => { setDetailOrder(o); setShowOrderDetail(true); };

  const logout = () => { localStorage.clear(); navigate("/login"); };
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F9F8F6]"><Loader2 className="w-8 h-8 animate-spin text-[#3B5249]" /></div>;

  const filtered = orders.filter(o => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (dateFilter) { if ((o.created_at||"").slice(0,10) !== dateFilter) return false; }
    else if (month !== "all") { const m = o.created_at?.slice(5,7)?.replace(/^0/,""); if (m !== month) return false; }
    if (search) { const s = search.toLowerCase(); return (o.customer_name||"").toLowerCase().includes(s) || (o.id||"").toLowerCase().includes(s) || (o.customer_phone||"").includes(s) || (o.customer_address||"").toLowerCase().includes(s); }
    return true;
  });

  const statuses = ["pending","confirmed","shipped","delivered"];

  return (
    <div className="min-h-screen bg-[#F9F8F6]" data-testid="inventory-manager-dashboard">
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#F9F8F6]/80 border-b border-[#E5E3DB]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div><h1 className="font-heading text-xl font-medium text-[#2C3531]">Celesta <span className="text-[#3B5249] font-semibold">Glow</span></h1><p className="text-xs text-[#59615D] uppercase tracking-[0.15em]">Inventory Manager - {user.name}</p></div>
          <div className="flex items-center gap-2"><NotificationBell /><AttendanceCheckIn /><Button variant="outline" onClick={logout} className="rounded-full border-[#E5E3DB] text-sm"><LogOut className="w-4 h-4 mr-1"/>Logout</Button></div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
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
          <div className="flex gap-1">{["all",...statuses].map(s=>(<button key={s} onClick={()=>setStatusFilter(s)} className={`px-2.5 py-1 rounded-full text-[9px] font-medium capitalize ${statusFilter===s?"bg-[#3B5249] text-white":"bg-white border border-[#E5E3DB] text-[#59615D]"}`}>{s}</button>))}</div>
          <div className="flex items-center gap-1 bg-white rounded-full px-2 py-0.5 border border-[#E5E3DB]">
            <span className="text-[9px] text-[#59615D] uppercase">Date</span>
            <Input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)} className="h-6 text-[10px] border-0 p-1 w-32" data-testid="inv-date-filter"/>
            {dateFilter && <button onClick={()=>setDateFilter("")} className="text-[9px] text-[#B75D69] underline">clear</button>}
          </div>
          <div className="flex gap-1">{MONTHS.map(m=>(<button key={m.v} onClick={()=>{setMonth(m.v); setDateFilter("");}} className={`px-2 py-0.5 rounded-full text-[9px] ${month===m.v&&!dateFilter?"bg-[#3B5249] text-white":"bg-white border border-[#E5E3DB] text-[#59615D]"}`}>{m.l}</button>))}<button onClick={()=>{setMonth("all"); setDateFilter("");}} className={`px-2 py-0.5 rounded-full text-[9px] ${month==="all"&&!dateFilter?"bg-[#3B5249] text-white":"bg-white border border-[#E5E3DB] text-[#59615D]"}`}>All</button></div>
        </div>

        {/* Order Pipeline */}
        <Tabs defaultValue="pipeline" className="space-y-4">
          <TabsList className="bg-white border border-[#E5E3DB] rounded-full p-1 flex-wrap gap-1">
            <TabsTrigger value="pipeline" className="rounded-full text-xs data-[state=active]:bg-[#3B5249] data-[state=active]:text-white">Pipeline</TabsTrigger>
            <TabsTrigger value="list" className="rounded-full text-xs data-[state=active]:bg-[#3B5249] data-[state=active]:text-white">List</TabsTrigger>
            <TabsTrigger value="stock" className="rounded-full text-xs data-[state=active]:bg-[#3B5249] data-[state=active]:text-white" data-testid="inv-tab-stock">Stock {lowStock.length>0&&<Badge className="ml-1 bg-red-500 text-white text-[8px]">{lowStock.length}</Badge>}</TabsTrigger>
            <TabsTrigger value="po" className="rounded-full text-xs data-[state=active]:bg-[#3B5249] data-[state=active]:text-white" data-testid="inv-tab-po">Purchase Orders</TabsTrigger>
            <TabsTrigger value="returns" className="rounded-full text-xs data-[state=active]:bg-[#3B5249] data-[state=active]:text-white" data-testid="inv-tab-returns">Returns/RTO</TabsTrigger>
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
                        <p className="text-[9px] text-[#A66E4E]">{o.created_at?.slice(0,10)} | {o.payment_type?.toUpperCase()}{o.created_by_name?` • by ${o.created_by_name}`:""}</p>
                        {o.tracking_link && <a href={o.tracking_link} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} className="text-[9px] text-purple-700 underline block truncate">📦 {o.courier_name||"Track"}</a>}
                        <div className="flex gap-1 mt-2" onClick={e=>e.stopPropagation()}>
                          {status==="confirmed"&&<Button size="sm" className="rounded-full text-[9px] bg-purple-600 text-white h-6" onClick={()=>markShipped(o)} data-testid={`ship-${o.id}`}><Truck className="w-3 h-3 mr-1"/>Ship</Button>}
                          {status==="shipped"&&<Button size="sm" className="rounded-full text-[9px] bg-green-600 text-white h-6" onClick={()=>markDelivered(o.id)} data-testid={`deliver-${o.id}`}><Check className="w-3 h-3 mr-1"/>Deliver</Button>}
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
              <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b bg-[#F9F8F6]">{["Order","Customer","Phone","Address","Amount","Type","Date","Created By","Status","Tracking","Actions"].map(h=><th key={h} className="p-2 text-left text-[9px] uppercase text-[#59615D]">{h}</th>)}</tr></thead>
              <tbody>{filtered.map(o=>(
                <tr key={o.id} className="border-b border-[#E5E3DB] hover:bg-[#F9F8F6] cursor-pointer" onClick={()=>openDetail(o)} data-testid={`inv-row-${o.id}`}><td className="p-2">{o.id}</td><td className="p-2 font-medium">{o.customer_name}</td><td className="p-2">{o.customer_phone}</td><td className="p-2 max-w-[200px] truncate" title={o.customer_address}>{o.customer_address||"-"}</td><td className="p-2">Rs.{o.total_amount}</td><td className="p-2"><Badge variant="outline" className="text-[8px]">{o.payment_type}</Badge></td><td className="p-2">{o.created_at?.slice(0,10)}</td><td className="p-2 text-[10px]">{o.created_by_name||"-"}</td><td className="p-2"><Badge className={`text-[8px] ${o.status==="delivered"?"bg-green-100 text-green-800":o.status==="shipped"?"bg-purple-100 text-purple-800":o.status==="confirmed"?"bg-blue-100 text-blue-800":"bg-yellow-100 text-yellow-800"}`}>{o.status}</Badge></td>
                <td className="p-2 text-[10px]">{o.tracking_link?<a href={o.tracking_link} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} className="text-purple-700 underline">{o.courier_name||"Track"}</a>:"-"}</td>
                <td className="p-2" onClick={e=>e.stopPropagation()}><div className="flex gap-1">{o.status==="confirmed"&&<Button size="sm" className="rounded-full text-[9px] bg-purple-600 text-white h-5 px-2" onClick={()=>markShipped(o)}>Ship</Button>}{o.status==="shipped"&&<Button size="sm" className="rounded-full text-[9px] bg-green-600 text-white h-5 px-2" onClick={()=>markDelivered(o.id)}>Deliver</Button>}</div></td></tr>
              ))}</tbody></table></div>}
            </div>
          </TabsContent>

          {/* STOCK */}
          <TabsContent value="stock">
            <div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
              <div className="flex justify-between mb-3"><h3 className="font-heading font-medium">Stock Management ({products.length} products)</h3><Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={()=>setShowStock(true)} data-testid="update-stock-btn">Update Stock</Button></div>
              {lowStock.length>0 && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3"><p className="text-xs font-medium text-red-700"><AlertTriangle className="w-3 h-3 inline mr-1"/>Low-stock alert: {lowStock.length} products below threshold</p>
                <div className="text-[10px] text-red-600 mt-1">{lowStock.slice(0,5).map(p=>p.name).join(", ")}</div></div>}
              {products.length===0 ? <p className="text-center py-6 text-[#59615D] text-sm">No products. Add via Admin.</p> :
                <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="bg-[#F9F8F6]">{["Product","Stock","Threshold","Status"].map(h=><th key={h} className="p-2 text-left text-[9px] uppercase">{h}</th>)}</tr></thead>
                  <tbody>{products.map(p=>{const isLow=(p.stock||0)<=(p.low_stock_threshold||10);return(
                    <tr key={p.id} className="border-b" data-testid={`prod-${p.id}`}><td className="p-2 font-medium">{p.name}</td><td className="p-2"><span className={isLow?"text-red-700 font-bold":""}>{p.stock||0}</span></td><td className="p-2">{p.low_stock_threshold||10}</td><td className="p-2"><Badge className={`text-[8px] ${isLow?'bg-red-100 text-red-800':'bg-green-100 text-green-800'}`}>{isLow?'LOW':'OK'}</Badge></td></tr>
                  );})}</tbody></table></div>}
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
      <Dialog open={showOrderDetail} onOpenChange={setShowOrderDetail}><DialogContent className="rounded-2xl max-w-lg" data-testid="order-detail-dialog"><DialogHeader><DialogTitle className="font-heading">Order Details</DialogTitle></DialogHeader>
        {detailOrder && <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2 text-xs"><div><span className="text-[#59615D]">Order:</span> <b>{detailOrder.id}</b></div><div><span className="text-[#59615D]">Status:</span> <Badge className="text-[10px]">{detailOrder.status}</Badge></div></div>
          <div className="bg-[#F9F8F6] rounded-xl p-3">
            <p className="font-semibold text-sm">{detailOrder.customer_name}</p>
            <p className="text-xs">📞 {detailOrder.customer_phone}</p>
            <p className="text-xs text-[#3B5249] mt-1">📍 <b>Full Address:</b><br/>{detailOrder.customer_address}{detailOrder.customer_city?`, ${detailOrder.customer_city}`:""}{detailOrder.customer_pincode?` - ${detailOrder.customer_pincode}`:""}</p>
            {detailOrder.customer_landmark && <p className="text-[10px] text-[#A66E4E]">Landmark: {detailOrder.customer_landmark}</p>}
          </div>
          <div className="text-xs"><b>Items:</b><ul className="list-disc ml-4 mt-1">{(detailOrder.items||[]).map((it,i)=>(<li key={i}>{it.name} × {it.quantity} = Rs.{it.price*it.quantity}</li>))}</ul></div>
          <div className="grid grid-cols-2 gap-2 text-xs"><div>Total: <b>Rs.{detailOrder.total_amount}</b></div><div>Payment: <b>{detailOrder.payment_type?.toUpperCase()}</b></div></div>
          <div className="text-xs"><b>Created by:</b> {detailOrder.created_by_name||'-'} ({detailOrder.created_by_role}) on {detailOrder.created_at?.slice(0,16).replace('T',' ')}</div>
          {detailOrder.tracking_link && <div className="bg-purple-50 border border-purple-200 rounded-lg p-2 text-xs"><b>📦 Tracking:</b> {detailOrder.courier_name||""} {detailOrder.tracking_number||""}<br/><a href={detailOrder.tracking_link} target="_blank" rel="noreferrer" className="text-purple-700 underline">{detailOrder.tracking_link}</a><br/>{detailOrder.shipped_by_name && <span className="text-[10px] text-[#59615D]">Shipped by: {detailOrder.shipped_by_name} on {detailOrder.shipped_at?.slice(0,16).replace('T',' ')}</span>}</div>}
          {detailOrder.delivered_at && <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-xs"><b>✅ Delivered</b> on {detailOrder.delivered_at?.slice(0,16).replace('T',' ')}{detailOrder.delivered_by_name?` by ${detailOrder.delivered_by_name}`:""}</div>}
        </div>}
      </DialogContent></Dialog>
    </div>
  );
}
