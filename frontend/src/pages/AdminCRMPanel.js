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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, Users, ShoppingBag, IndianRupee, Loader2, TrendingUp, Wallet, Plus, Check, X, Globe, Shield, Edit, Key, Package, ExternalLink, Sparkles } from "lucide-react";
import NotificationBell from "../components/NotificationBell";
import GlobalSearch from "../components/GlobalSearch";
import AdminCallLogs from "../components/AdminCallLogs";
import OrderEditDialog from "../components/OrderEditDialog";
import MonthFilter, { filterByMonth } from "../components/MonthFilter";
import DelhiveryShipActions from "../components/DelhiveryShipActions";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const API = "/api";
const COLORS = ["#3B5249", "#A66E4E", "#6B8E6B", "#D4A373", "#B75D69"];
const ROLE_OPTIONS = [
  {value:"telecaller",label:"Telecaller",endpoint:"/telecallers",fields:["name","email","password","language"]},
  {value:"agent",label:"Agent",endpoint:"/agents",fields:["name","email","password","district","area","region_id"]},
  {value:"district_manager",label:"District Manager",endpoint:"/managers",fields:["name","email","password","region_id"]},
  {value:"assistant_district_manager",label:"Asst District Manager",endpoint:"/assistant-district-managers",fields:["name","email","password"]},
  {value:"sales_manager",label:"Sales Manager",endpoint:"/sales-managers",fields:["name","email","password"]},
  {value:"assistant_sales_manager",label:"Asst Sales Manager",endpoint:"/assistant-sales-managers",fields:["name","email","password"]},
  {value:"finance_manager",label:"Finance Manager",endpoint:"/finance-managers",fields:["name","email","password"]},
  {value:"hr_manager",label:"HR Manager",endpoint:"/hr-managers",fields:["name","email","password"]},
  {value:"social_media_manager",label:"Social Media Manager",endpoint:"/social-media-managers",fields:["name","email","password"]},
  {value:"inhouse_telecaller",label:"In-House Telecaller",endpoint:"/inhouse-telecallers",fields:["name","email","password"]},
  {value:"content_strategist",label:"Content Strategist",endpoint:"/content-strategists",fields:["name","email","password"]},
  {value:"content_developer",label:"Content Developer",endpoint:"/content-developers",fields:["name","email","password"]},
  {value:"inventory_manager",label:"Inventory Manager",endpoint:"/inventory-managers",fields:["name","email","password"]},
  {value:"digital_marketing_manager",label:"Digital Marketing Manager",endpoint:"/digital-marketing-managers",fields:["name","email","password"]},
];

export default function AdminCRMPanel() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const [stats, setStats] = useState({});
  const [allUsers, setAllUsers] = useState([]);
  const [leads, setLeads] = useState([]);
  const [orders, setOrders] = useState([]);
  const [fundRequests, setFundRequests] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [hrTeam, setHrTeam] = useState([]);
  const [content, setContent] = useState([]);
  const [states, setStates] = useState([]);
  const [regions, setRegions] = useState([]);
  const [products, setProducts] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [instructions, setInstructions] = useState([]);
  const [showInstruction, setShowInstruction] = useState(false);
  const [instrForm, setInstrForm] = useState({title:"",content:"",target_role:"all",priority:"normal",create_as_task:false,send_email:false,due_date:"",from_time:"",to_time:""});
  const [finBalance, setFinBalance] = useState({cash:0,bank:0,total:0});
  const [finLedger, setFinLedger] = useState([]);
  const [cashHolders, setCashHolders] = useState([]);
  const [commSummary, setCommSummary] = useState({agents:[], total_weekly:0, total_monthly:0, total_today:0, daily_breakdown:[]});
  const [commExpanded, setCommExpanded] = useState(null);
  const [settlementCfg, setSettlementCfg] = useState({type:"percentage",value:0});
  const [showRateEditor, setShowRateEditor] = useState(false);
  const [rateForm, setRateForm] = useState({telecaller:8,agent:10,district_manager:5,sales_manager:5,assistant_district_manager:3,assistant_sales_manager:3,inhouse_telecaller:10,dm_from_adm:1,sm_from_asm:1});
  const [monthlyStats, setMonthlyStats] = useState([]);
  const [pnl, setPnl] = useState(null);
  const [pnlMonth, setPnlMonth] = useState((new Date().getMonth()+1).toString());
  const [pnlYear, setPnlYear] = useState(new Date().getFullYear().toString());
  const [revEntries, setRevEntries] = useState([]);
  const [showRevEntry, setShowRevEntry] = useState(false);
  const [revForm, setRevForm] = useState({platform:"amazon",sale_amount:0,platform_fee:0,shipping_cost:0,settlement_charge:0,order_ref:"",notes:"",date:""});
  const [resetStatus, setResetStatus] = useState(null);
  // Document templates editor
  const [showDocTemplates, setShowDocTemplates] = useState(false);
  const [docTplOverrides, setDocTplOverrides] = useState([]);
  const [activeTplKey, setActiveTplKey] = useState("offer");
  const [tplForm, setTplForm] = useState({subject:"",body_html:""});
  const [tplLoading, setTplLoading] = useState(false);
  const docTplKeys = [
    {k:"welcome", l:"Welcome / Joining"},
    {k:"offer", l:"Offer Letter"},
    {k:"employment", l:"Employment Confirmation"},
    {k:"agreement", l:"Employment Agreement"},
    {k:"increment", l:"Increment Letter"},
    {k:"termination", l:"Termination Letter"},
    {k:"warning", l:"Warning Letter"},
    {k:"relieving", l:"Relieving Letter"},
    {k:"experience", l:"Experience Certificate"},
  ];
  const loadDocTemplates = async () => {
    try {
      const { data } = await axios.get(`${API}/hr/document-templates`);
      setDocTplOverrides(data.templates || []);
      // Load currently active key
      const cur = (data.templates||[]).find(t=>t.key===activeTplKey);
      setTplForm({subject: cur?.subject || "", body_html: cur?.body_html || ""});
    } catch (e) { /* ignore */ }
  };
  const switchTplKey = async (k) => {
    setActiveTplKey(k);
    try {
      const { data } = await axios.get(`${API}/hr/document-templates/${k}`);
      setTplForm({subject: data.template?.subject || "", body_html: data.template?.body_html || ""});
    } catch { setTplForm({subject:"",body_html:""}); }
  };
  const saveDocTemplate = async () => {
    if (!tplForm.body_html.trim()) { toast.error("Body HTML cannot be empty"); return; }
    setTplLoading(true);
    try {
      await axios.put(`${API}/hr/document-templates/${activeTplKey}`, tplForm);
      toast.success("Template saved — will be used for future emails");
      loadDocTemplates();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    setTplLoading(false);
  };
  const resetDocTemplate = async () => {
    if (!window.confirm("Revert to built-in default? Your custom version will be deleted.")) return;
    try {
      await axios.delete(`${API}/hr/document-templates/${activeTplKey}`);
      setTplForm({subject:"",body_html:""});
      loadDocTemplates();
      toast.success("Reverted to built-in default");
    } catch { toast.error("Failed"); }
  };
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // Dialogs
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showEditUser, setShowEditUser] = useState(false);
  const [showExpense, setShowExpense] = useState(false);
  const [showPayroll, setShowPayroll] = useState(false);
  const [showInvestment, setShowInvestment] = useState(false);
  const [showHrMember, setShowHrMember] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [showState, setShowState] = useState(false);
  const [showProduct, setShowProduct] = useState(false);
  const [showFundRequest, setShowFundRequest] = useState(false);
  const [showFinTxn, setShowFinTxn] = useState(false);
  const [showFinTransfer, setShowFinTransfer] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [createRole, setCreateRole] = useState("telecaller");
  // Forms
  const [userForm, setUserForm] = useState({name:"",email:"",phone:"",password:"",language:"",district:"",area:"",region_id:"",salary:0,incentive:0,bank_account_name:"",bank_account_number:"",bank_ifsc:"",bank_name:"",upi_id:"",pan_number:"",aadhaar_number:"",address:"",emergency_contact:"",dob:"",joining_date:""});
  const [editForm, setEditForm] = useState({name:"",email:"",phone:"",password:"",language:"",district:"",area:"",salary:0,incentive:0,bank_account_name:"",bank_account_number:"",bank_ifsc:"",bank_name:"",upi_id:"",pan_number:"",aadhaar_number:"",address:"",emergency_contact:"",dob:"",joining_date:""});
  const [expenseForm, setExpenseForm] = useState({title:"",amount:0,category:"general",description:"",proof_path:"",paid_to_name:"",paid_to_user_id:"",paid_to_phone:""});
  // Expense filters
  const [expMonth, setExpMonth] = useState(String(new Date().getMonth()+1));
  const [expYear, setExpYear] = useState(String(new Date().getFullYear()));
  const [expDay, setExpDay] = useState("all");
  const [expReimburseFilter, setExpReimburseFilter] = useState("all"); // all | to_be_paid | paid
  // Common filters for Orders, Leads, Funds, Payroll
  const [genMonth, setGenMonth] = useState("all");
  const [genYear, setGenYear] = useState(String(new Date().getFullYear()));
  const [genDay, setGenDay] = useState("all");
  const [payrollForm, setPayrollForm] = useState({user_id:"",user_name:"",user_role:"",month:"",year:"",basic_salary:0,bonus:0,deductions:0,commission:0,working_days:0,total_working_days:30});
  const [investForm, setInvestForm] = useState({title:"",amount:0,source:"",date:"",notes:"",partner_type:"main"});
  const [hrForm, setHrForm] = useState({name:"",role_title:"",email:"",phone:"",department:"",salary:0});
  const [contentForm, setContentForm] = useState({title:"",type:"",platform:"",assigned_to:"",budget:0,status:"draft"});
  const [stateForm, setStateForm] = useState({name:"",districts:""});
  const [stateLoading, setStateLoading] = useState(false);
  const [productForm, setProductForm] = useState({name:"",category:"sunscreen",price:0,description:"",stock:0});
  const [fundForm, setFundForm] = useState({amount:0,reason:"",category:"general"});
  const [finTxnForm, setFinTxnForm] = useState({type:"credit",amount:0,category:"manual",description:"",method:"bank"});
  const [finTransferForm, setFinTransferForm] = useState({amount:0,direction:"cash_to_bank"});
  // Admin "Create Order" dialog
  const [showOrderDlg, setShowOrderDlg] = useState(false);
  const [editOrder, setEditOrder] = useState(null);
  const [showHardReset, setShowHardReset] = useState(false);
  const [showInstantWipe, setShowInstantWipe] = useState(false);
  const [hardResetStatus, setHardResetStatus] = useState(null);
  const [hardResetPw, setHardResetPw] = useState("");
  const [cascadeUser, setCascadeUser] = useState(null);
  const [cascadePreview, setCascadePreview] = useState(null);
  const [orderForm, setOrderForm] = useState({customer_name:"",customer_phone:"",customer_address:"",customer_city:"",customer_pincode:"",customer_landmark:"",items:[],total_amount:0,payment_type:"cod",created_by:""});
  const orderTotal = orderForm.items.reduce((s,i)=>s+(i.price||0)*(i.quantity||0), 0);
  const addOrderProduct = (p) => {
    setOrderForm(f => f.items.find(i=>i.product_id===p.id) ? f : ({...f, items:[...f.items, {product_id:p.id, name:p.name, price:p.price, quantity:1}]}));
  };
  const setOrderQty = (pid, q) => {
    const qq = Math.max(0, parseInt(q || 0));
    setOrderForm(f => ({...f, items: f.items.map(i=>i.product_id===pid?{...i, quantity:qq}:i).filter(i=>i.quantity>0)}));
  };
  const submitAdminOrder = async () => {
    if (!orderForm.customer_name) return toast.error("Customer name required");
    if (!orderForm.customer_phone) return toast.error("Customer phone required");
    if (!orderForm.customer_address || orderForm.customer_address.trim().length < 8) return toast.error("Customer address required (min 8 chars)");
    const finalTotal = orderTotal > 0 ? orderTotal : Number(orderForm.total_amount || 0);
    if (finalTotal <= 0) return toast.error("Add products or enter a manual total amount");
    try {
      // optional: assign to a telecaller/agent
      const payload = {...orderForm, total_amount: finalTotal};
      if (orderForm.created_by) {
        const u = allUsers.find(x => x.id === orderForm.created_by);
        if (u) { payload.assigned_to = u.id; }
      }
      await axios.post(`${API}/orders`, payload);
      toast.success(`Order created · Rs.${finalTotal}`);
      setShowOrderDlg(false);
      setOrderForm({customer_name:"",customer_phone:"",customer_address:"",customer_city:"",customer_pincode:"",customer_landmark:"",items:[],total_amount:0,payment_type:"cod",created_by:""});
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const fetchData = useCallback(async () => {
    try {
      const r = await Promise.all([
        axios.get(`${API}/dashboard/stats`),axios.get(`${API}/all-users`),axios.get(`${API}/leads`),axios.get(`${API}/orders`),
        axios.get(`${API}/fund-requests`),axios.get(`${API}/expenses`),axios.get(`${API}/payroll`),
        axios.get(`${API}/investments`),axios.get(`${API}/hr-team`),axios.get(`${API}/content`),
        axios.get(`${API}/states`),axios.get(`${API}/regions`),axios.get(`${API}/audit-logs`),axios.get(`${API}/products`)
      ]);
      setStats(r[0].data.stats);setAllUsers(r[1].data.users);setLeads(r[2].data.leads);setOrders(r[3].data.orders);
      setFundRequests(r[4].data.fund_requests);setExpenses(r[5].data.expenses);setPayroll(r[6].data.payroll);
      setInvestments(r[7].data.investments);setHrTeam(r[8].data.hr_team);setContent(r[9].data.content);
      setStates(r[10].data.states);setRegions(r[11].data.regions);setAuditLogs(r[12].data.audit_logs);setProducts(r[13].data.products);
      try { const instr = await axios.get(`${API}/instructions`); setInstructions(instr.data.instructions); } catch {}
      // Fetch finance data
      try { const [fb, fl, cs, sc, ch, ms] = await Promise.all([axios.get(`${API}/finance/balance`), axios.get(`${API}/finance/ledger`), axios.get(`${API}/commissions/summary`), axios.get(`${API}/config/settlement`), axios.get(`${API}/finance/cash-holders`), axios.get(`${API}/finance/monthly-stats`).catch(()=>({data:{monthly_stats:[]}}))]);
        setFinBalance(fb.data.balance); setFinLedger(fl.data.transactions); setCommSummary(cs.data); setSettlementCfg(sc.data.settlement); setCashHolders(ch.data.holders); setMonthlyStats(ms.data.monthly_stats||[]);
        try { const [p, re, rs] = await Promise.all([axios.get(`${API}/pnl?month=${(new Date().getMonth()+1)}&year=${new Date().getFullYear()}`).catch(()=>({data:null})), axios.get(`${API}/revenue-entries`).catch(()=>({data:{entries:[]}})), axios.get(`${API}/admin/hard-reset/status`).catch(()=>({data:{pending:false}}))]);
          setPnl(p.data); setRevEntries(re.data.entries||[]); setResetStatus(rs.data);
        } catch {}
        try { const cr = await axios.get(`${API}/config/commission-rates`); if(cr.data.config?.rates) setRateForm(prev=>({...prev,...cr.data.config.rates})); } catch{}
      } catch(e) { console.error("Finance fetch:", e); }
    } catch(e){console.error(e);}
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useEffect(()=>{fetchData();},[fetchData]);

  // Handlers
  const handleCreateUser = async () => {
    if(!userForm.name||!userForm.email) return toast.error("Name and email required");
    if(!userForm.phone || userForm.phone.trim().length < 7) return toast.error("Valid phone number is required");
    const roleConfig = ROLE_OPTIONS.find(r=>r.value===createRole);
    try {
      await axios.post(`${API}${roleConfig.endpoint}`, userForm);
      toast.success(`${roleConfig.label} created!`);
      setShowCreateUser(false);setUserForm({name:"",email:"",phone:"",password:"",language:"",district:"",area:"",region_id:"",salary:0,incentive:0,bank_account_name:"",bank_account_number:"",bank_ifsc:"",bank_name:"",upi_id:"",pan_number:"",aadhaar_number:"",address:"",emergency_contact:"",dob:"",joining_date:""});fetchData();
    } catch(e){toast.error(e.response?.data?.detail||"Failed");}
  };
  const handleEditUser = async () => {
    if(!selectedUser) return;
    const data = {};
    const fields = ["name","email","phone","password","language","district","area","bank_account_name","bank_account_number","bank_ifsc","bank_name","upi_id","pan_number","aadhaar_number","address","emergency_contact","dob","joining_date"];
    fields.forEach(k => { if (editForm[k] !== undefined && editForm[k] !== "") data[k] = editForm[k]; });
    if (editForm.salary !== undefined && editForm.salary !== null && editForm.salary !== "") data.salary = Number(editForm.salary);
    if (editForm.incentive !== undefined && editForm.incentive !== null && editForm.incentive !== "") data.incentive = Number(editForm.incentive);
    try { await axios.put(`${API}/users/${selectedUser.id}/update`, data); toast.success("User updated!"); setShowEditUser(false); fetchData(); }
    catch(e){toast.error(e.response?.data?.detail||"Failed");}
  };
  const openEditUser = (u) => {
    setSelectedUser(u);
    setEditForm({
      name: u.name||"", email: u.email||"", phone: u.phone||"", password: "",
      language: u.language||"", district: u.district||"", area: u.area||"",
      salary: u.salary||0, incentive: u.incentive||0,
      bank_account_name: u.bank_account_name||"", bank_account_number: u.bank_account_number||"",
      bank_ifsc: u.bank_ifsc||"", bank_name: u.bank_name||"", upi_id: u.upi_id||"",
      pan_number: u.pan_number||"", aadhaar_number: u.aadhaar_number||"",
      address: u.address||"", emergency_contact: u.emergency_contact||"",
      dob: u.dob||"", joining_date: u.joining_date||""
    });
    setShowEditUser(true);
  };
  const proxyLogin = async (u) => {
    const newTab = window.open('about:blank', '_blank');
    try {
      const { data } = await axios.post(`${API}/admin/proxy-login/${u.id}`);
      const baseUrl = window.location.origin;
      const params = new URLSearchParams({
        proxy_token: data.token,
        proxy_user: JSON.stringify(data.user),
        proxy_route: data.route
      });
      if (newTab) { newTab.location.href = `${baseUrl}/login?${params.toString()}`; }
      else { window.location.href = `${baseUrl}/login?${params.toString()}`; }
      toast.success(`Opening ${u.name}'s dashboard`);
    } catch(e) { if (newTab) newTab.close(); toast.error(e.response?.data?.detail || "Failed"); }
  };
  const approveFund = async(id,status)=>{try{await axios.put(`${API}/fund-requests/${id}/approve`,{status});toast.success("Updated");fetchData();}catch{toast.error("Failed");}};
  const approveExpense = async(id,status)=>{try{await axios.put(`${API}/expenses/${id}/approve`,{status});toast.success("Updated");fetchData();}catch{toast.error("Failed");}};
  const handleExpense = async()=>{if(!expenseForm.title)return toast.error("Title required");try{await axios.post(`${API}/expenses`,{...expenseForm,amount:Number(expenseForm.amount)});toast.success(expenseForm.paid_to_name?`Created — to be paid to ${expenseForm.paid_to_name}`:"Created");setShowExpense(false);setExpenseForm({title:"",amount:0,category:"general",description:"",proof_path:"",paid_to_name:"",paid_to_user_id:"",paid_to_phone:""});fetchData();}catch{toast.error("Failed");}};
  const markExpensePaid = async(id, name)=>{if(!window.confirm(`Mark this expense as paid to ${name||"payee"}?`))return;try{await axios.put(`${API}/expenses/${id}/mark-paid`,{method:"cash"});toast.success("Marked as paid");fetchData();}catch(e){toast.error(e.response?.data?.detail||"Failed");}};
  const handlePayroll = async()=>{if(!payrollForm.user_id)return toast.error("Select employee");try{await axios.post(`${API}/payroll`,{...payrollForm,basic_salary:Number(payrollForm.basic_salary),bonus:Number(payrollForm.bonus),deductions:Number(payrollForm.deductions),commission:Number(payrollForm.commission)});toast.success("Created");setShowPayroll(false);fetchData();}catch{toast.error("Failed");}};
  const handleInvestment = async()=>{try{await axios.post(`${API}/investments`,{...investForm,amount:Number(investForm.amount)});toast.success("Added");setShowInvestment(false);setInvestForm({title:"",amount:0,source:"",date:"",notes:"",partner_type:"main"});fetchData();}catch{toast.error("Failed");}};
  const handleHrMember = async()=>{if(!hrForm.name)return toast.error("Name required");try{await axios.post(`${API}/hr-team`,{...hrForm,salary:Number(hrForm.salary)});toast.success("Added");setShowHrMember(false);fetchData();}catch{toast.error("Failed");}};
  const handleContent = async()=>{try{await axios.post(`${API}/content`,{...contentForm,budget:Number(contentForm.budget)});toast.success("Added");setShowContent(false);fetchData();}catch{toast.error("Failed");}};
  const handleState = async()=>{if(!stateForm.name)return toast.error("State name required");try{await axios.post(`${API}/states`,{name:stateForm.name,districts:stateForm.districts.split(",").map(d=>d.trim()).filter(Boolean)});toast.success("State created");setShowState(false);setStateForm({name:"",districts:""});fetchData();}catch{toast.error("Failed");}};
  const autoGenerateDistricts = async()=>{if(!stateForm.name)return toast.error("Enter state name first");setStateLoading(true);try{const{data}=await axios.get(`${API}/ai/generate-districts/${encodeURIComponent(stateForm.name)}`);if(data.districts?.length>0){setStateForm(f=>({...f,districts:data.districts.join(", ")}));toast.success(`${data.districts.length} districts loaded`);}else{toast.error("No districts found");}}catch{toast.error("Generation failed");}setStateLoading(false);};  const handleProduct = async()=>{
    if(!productForm.name)return toast.error("Product name required");
    const payload = {...productForm,price:Number(productForm.price),stock:Number(productForm.stock)};
    try {
      if(editingProduct) { await axios.put(`${API}/products/${editingProduct.id}`, payload); toast.success("Product updated!"); }
      else { await axios.post(`${API}/products`, payload); toast.success("Product created!"); }
      setShowProduct(false);setEditingProduct(null);setProductForm({name:"",category:"sunscreen",price:0,description:"",stock:0});fetchData();
    } catch{toast.error("Failed");}
  };
  const deleteProduct = async(id)=>{try{await axios.delete(`${API}/products/${id}`);toast.success("Deleted");fetchData();}catch{toast.error("Failed");}};
  const processPayroll = async(id)=>{try{await axios.put(`${API}/payroll/${id}/process`,{});toast.success("Processed");fetchData();}catch{toast.error("Failed");}};
  const handleFundRequest = async()=>{
    if(!fundForm.amount||!fundForm.reason)return toast.error("Fill amount and reason");
    try{await axios.post(`${API}/fund-requests`,fundForm);toast.success("Fund request submitted!");setShowFundRequest(false);setFundForm({amount:0,reason:"",category:"general"});fetchData();}catch{toast.error("Failed");}
  };
  const handleFinTxn = async()=>{
    if(!finTxnForm.amount||finTxnForm.amount<=0)return toast.error("Enter valid amount");
    try{await axios.post(`${API}/finance/transaction`,finTxnForm);toast.success("Transaction recorded!");setShowFinTxn(false);setFinTxnForm({type:"credit",amount:0,category:"manual",description:"",method:"bank"});fetchData();}catch(e){toast.error(e.response?.data?.detail||"Failed");}
  };
  const handleFinTransfer = async()=>{
    if(!finTransferForm.amount||finTransferForm.amount<=0)return toast.error("Enter valid amount");
    try{await axios.post(`${API}/finance/transfer`,finTransferForm);toast.success("Transfer complete!");setShowFinTransfer(false);setFinTransferForm({amount:0,direction:"cash_to_bank"});fetchData();}catch(e){toast.error(e.response?.data?.detail||"Failed");}
  };
  const logout = () => {localStorage.clear();navigate("/login");};
  if(loading) return <div className="min-h-screen flex items-center justify-center bg-[#F9F8F6]"><Loader2 className="w-8 h-8 animate-spin text-[#3B5249]"/></div>;

  const leadStatusData = ["new","interested","not_interested","follow_up","converted"].map(s=>({name:s.replace(/_/g," "),value:leads.filter(l=>l.status===s).length})).filter(d=>d.value>0);
  const orderStatusData = ["pending","confirmed","rejected"].map(s=>({name:s,value:orders.filter(o=>o.status===s).length})).filter(d=>d.value>0);
  const filteredUsers = allUsers.filter(u=>!search||u.name?.toLowerCase().includes(search.toLowerCase())||u.email?.includes(search)||u.role?.includes(search));
  const usersByRole = {};
  filteredUsers.forEach(u=>{if(!usersByRole[u.role])usersByRole[u.role]=[];usersByRole[u.role].push(u);});
  const netSalary = Number(payrollForm.basic_salary)+Number(payrollForm.bonus)+Number(payrollForm.commission)-Number(payrollForm.deductions);

  return (
    <div className="min-h-screen bg-[#F9F8F6]" data-testid="admin-crm-panel">
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#F9F8F6]/80 border-b border-[#E5E3DB]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div><h1 className="font-heading text-xl sm:text-2xl font-medium text-[#2C3531]">Celesta <span className="text-[#3B5249] font-semibold">Glow</span></h1><p className="text-xs text-[#59615D] uppercase tracking-[0.15em]">Admin Control</p></div>
          <div className="flex items-center gap-2"><GlobalSearch /><NotificationBell /><Button variant="outline" onClick={logout} className="rounded-full border-[#E5E3DB] text-sm" data-testid="logout-btn"><LogOut className="w-4 h-4 mr-1"/>Logout</Button></div>
        </div>
      </div>
      {resetStatus?.pending && (
        <div className="bg-orange-50 border-b-2 border-orange-300">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2">
            <HardResetCountdown executeAt={resetStatus.execute_at}/>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Stats */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
          {[{l:"Leads",v:stats.total_leads||0},{l:"Orders",v:stats.total_orders||0},{l:"Revenue",v:`Rs.${stats.total_revenue||0}`},{l:"Expenses",v:`Rs.${stats.total_expenses||0}`},{l:"Investment",v:`Rs.${stats.total_investment||0}`},{l:"Pending",v:stats.pending_fund_requests||0}].map((s,i)=>(
            <div key={i} className="bg-white rounded-xl border border-[#E5E3DB] p-3 sm:p-4"><p className="font-heading text-lg sm:text-xl font-semibold">{s.v}</p><p className="text-[10px] text-[#59615D] uppercase">{s.l}</p></div>
          ))}
        </div>
        {/* Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-4"><h3 className="font-heading text-sm font-medium mb-3">Lead Status</h3>{leadStatusData.length>0?<ResponsiveContainer width="100%" height={180}><PieChart><Pie data={leadStatusData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" label={({name,value})=>`${name}:${value}`}>{leadStatusData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer>:<p className="text-center py-6 text-[#59615D] text-sm">No data</p>}</div>
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-4"><h3 className="font-heading text-sm font-medium mb-3">Orders</h3>{orderStatusData.length>0?<ResponsiveContainer width="100%" height={180}><BarChart data={orderStatusData}><CartesianGrid strokeDasharray="3 3" stroke="#E5E3DB"/><XAxis dataKey="name" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}}/><Tooltip/><Bar dataKey="value" fill="#3B5249" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer>:<p className="text-center py-6 text-[#59615D] text-sm">No data</p>}</div>
        </div>

        <Tabs defaultValue="users" className="space-y-4">
          <TabsList className="bg-white border border-[#E5E3DB] rounded-full p-1 h-auto flex-wrap gap-0.5">
            {[{v:"users",l:"Users"},{v:"products",l:"Products"},{v:"pnl",l:"P&L"},{v:"states",l:"States"},{v:"orders",l:"Orders"},{v:"leads",l:"Leads"},{v:"conversations",l:"Conversations"},{v:"finance",l:"Finance"},{v:"commissions",l:"Commission"},{v:"funds",l:"Funds"},{v:"expenses",l:"Expenses"},{v:"payroll",l:"Payroll"},{v:"instructions",l:"Instructions"},{v:"hr",l:"HR"},{v:"invest",l:"Invest"},{v:"content",l:"Content"},{v:"audit",l:"Audit"}].map(t=>(
              <TabsTrigger key={t.v} value={t.v} className="rounded-full text-[11px] data-[state=active]:bg-[#3B5249] data-[state=active]:text-white px-2.5 py-1.5" data-testid={`admin-tab-${t.v}`}>{t.l}</TabsTrigger>
            ))}
          </TabsList>

          {/* USERS TAB */}
          <TabsContent value="users"><div className="bg-white rounded-xl border border-[#E5E3DB] p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row gap-3 justify-between mb-4">
              <h3 className="font-heading text-lg font-medium">All Users ({allUsers.length})</h3>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" className="rounded-full text-xs text-orange-600 border-orange-300" onClick={async()=>{try{const{data}=await axios.get(`${API}/admin/hard-reset/status`);setHardResetStatus(data);}catch{};setShowHardReset(true);}} data-testid="hard-reset-btn">⏱ Hard Reset (48h)</Button>
                <Button size="sm" variant="outline" className="rounded-full text-xs text-red-600 border-red-300 bg-red-50" onClick={()=>setShowInstantWipe(true)} data-testid="instant-wipe-btn">🔥 Instant Wipe</Button>
                <Input placeholder="Search users..." value={search} onChange={e=>setSearch(e.target.value)} className="rounded-xl w-48" data-testid="admin-search"/>
                <Button className="rounded-full bg-[#3B5249] text-white text-xs" onClick={()=>setShowCreateUser(true)} data-testid="create-user-btn"><Plus className="w-4 h-4 mr-1"/>Create User</Button>
              </div>
            </div>
            {Object.entries(usersByRole).map(([role,users])=>(
              <div key={role} className="mb-6">
                <h4 className="font-heading text-sm font-medium mb-2 uppercase text-[#59615D] tracking-wider">{role.replace(/_/g," ")} ({users.length})</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {users.map(u=>(
                    <div key={u.id} className="border border-[#E5E3DB] rounded-xl p-3 hover:shadow-sm transition-all" data-testid={`user-${u.id}`}>
                      <div className="flex justify-between items-start">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{u.name}</p>
                          <p className="text-xs text-[#59615D] truncate">{u.email}</p>
                          {u.phone ? <a href={`tel:${u.phone}`} className="text-xs text-[#3B5249] underline inline-flex items-center gap-1 mt-0.5" data-testid={`user-phone-${u.id}`}>📞 {u.phone}</a> : <p className="text-[10px] text-red-500 mt-0.5">⚠ No phone</p>}
                          {u.language&&<Badge variant="outline" className="text-[9px] mt-1 max-w-full truncate">{u.language}</Badge>}
                          {u.district&&<p className="text-[10px] text-[#A66E4E] mt-0.5 truncate">{u.area||""}{u.area&&", "}{u.district}</p>}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={()=>openEditUser(u)} data-testid={`edit-user-${u.id}`}><Edit className="w-3 h-3"/></Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={()=>proxyLogin(u)} data-testid={`view-dashboard-${u.id}`} title="Open dashboard in new tab"><Shield className="w-3 h-3"/></Button>
                          {u.role==="sales_manager" && (
                            <Button size="sm" variant="ghost" className={`h-7 w-7 p-0 text-[10px] ${u.is_head_of_sales?"text-[#A66E4E] bg-[#F4ECD2]":"text-[#3B5249]"}`} title={u.is_head_of_sales?"Already Head of Sales":"Promote to Head of Sales"} onClick={async()=>{ if(!window.confirm(`Promote ${u.name} to Head of Sales? Any existing Head of Sales will be unset.`))return; try{ await axios.post(`${API}/admin/set-head-of-sales/${u.id}`); toast.success(`${u.name} is now Head of Sales`); fetchData(); } catch(e){ toast.error(e.response?.data?.detail||"Failed"); } }} data-testid={`set-hos-${u.id}`}>👑</Button>
                          )}
                          {u.role!=="admin"&&<Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" onClick={async()=>{try{const{data}=await axios.get(`${API}/users/${u.id}/cascade-preview`);setCascadeUser(u);setCascadePreview(data);}catch(e){toast.error(e.response?.data?.detail||"Failed");}}} data-testid={`delete-user-${u.id}`} title="Delete user with cascade"><X className="w-3 h-3"/></Button>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div></TabsContent>

          {/* PRODUCTS TAB */}
          <TabsContent value="products"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <div className="flex justify-between mb-4"><h3 className="font-heading text-lg font-medium">Products ({products.length})</h3>
              <Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={()=>{setEditingProduct(null);setProductForm({name:"",category:"sunscreen",price:0,description:"",stock:0});setShowProduct(true);}} data-testid="add-product-btn"><Plus className="w-3 h-3 mr-1"/>Add Product</Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {products.map(p=>(<div key={p.id} className="border border-[#E5E3DB] rounded-xl p-4" data-testid={`product-${p.id}`}>
                <div className="flex justify-between items-start">
                  <div><p className="font-medium text-sm">{p.name}</p><Badge variant="outline" className="text-[9px] mt-1">{p.category}</Badge></div>
                  <p className="font-heading font-semibold text-[#3B5249]">Rs.{p.price}</p>
                </div>
                <p className="text-xs text-[#59615D] mt-2">{p.description}</p>
                <div className="flex justify-between items-center mt-2">
                  <p className="text-xs">Stock: <span className={p.stock<20?"text-red-600 font-semibold":"text-[#6B8E6B]"}>{p.stock}</span></p>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={()=>{setEditingProduct(p);setProductForm({name:p.name,category:p.category,price:p.price,description:p.description||"",stock:p.stock});setShowProduct(true);}} data-testid={`edit-product-${p.id}`}><Edit className="w-3 h-3 mr-1"/>Edit</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-red-500" onClick={()=>deleteProduct(p.id)} data-testid={`delete-product-${p.id}`}><X className="w-3 h-3"/></Button>
                  </div>
                </div>
              </div>))}
              {products.length===0&&<p className="text-[#59615D] text-sm col-span-3 text-center py-6">No products. Add your first product.</p>}
            </div>
          </div></TabsContent>

          {/* P&L TAB */}
          <TabsContent value="pnl"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5" data-testid="pnl-tab">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-heading text-lg font-medium">Profit & Loss Statement</h3>
              <div className="flex gap-2">
                <Select value={pnlMonth} onValueChange={async v=>{setPnlMonth(v);try{const{data}=await axios.get(`${API}/pnl?month=${v}&year=${pnlYear}`);setPnl(data);}catch{}}}><SelectTrigger className="w-20 h-7 text-xs rounded-full"><SelectValue/></SelectTrigger><SelectContent>{[{v:"1",l:"Jan"},{v:"2",l:"Feb"},{v:"3",l:"Mar"},{v:"4",l:"Apr"},{v:"5",l:"May"},{v:"6",l:"Jun"},{v:"7",l:"Jul"},{v:"8",l:"Aug"},{v:"9",l:"Sep"},{v:"10",l:"Oct"},{v:"11",l:"Nov"},{v:"12",l:"Dec"}].map(m=><SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}</SelectContent></Select>
                <Select value={pnlYear} onValueChange={async v=>{setPnlYear(v);try{const{data}=await axios.get(`${API}/pnl?month=${pnlMonth}&year=${v}`);setPnl(data);}catch{}}}><SelectTrigger className="w-20 h-7 text-xs rounded-full"><SelectValue/></SelectTrigger><SelectContent>{["2025","2026","2027"].map(y=><SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent></Select>
                <Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={()=>{setRevForm({platform:"amazon",sale_amount:0,platform_fee:0,shipping_cost:0,settlement_charge:0,order_ref:"",notes:"",date:""});setShowRevEntry(true);}} data-testid="add-revenue-btn"><Plus className="w-3 h-3 mr-1"/>Add Revenue</Button>
              </div>
            </div>
            {pnl ? (<>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-[#F9F8F6] rounded-xl p-4 text-center"><p className="text-[10px] text-[#59615D] uppercase">Total Revenue</p><p className="font-heading text-xl font-bold text-[#3B5249]">Rs.{pnl.revenue?.total||0}</p></div>
                <div className="bg-[#F9F8F6] rounded-xl p-4 text-center"><p className="text-[10px] text-[#59615D] uppercase">Gross Profit</p><p className="font-heading text-xl font-bold text-[#6B8E6B]">Rs.{pnl.gross_profit||0}</p></div>
                <div className={`rounded-xl p-4 text-center ${(pnl.net_profit||0)>=0?"bg-[#6B8E6B]":"bg-[#B75D69]"}`}><p className="text-[10px] text-white/80 uppercase">Net Profit</p><p className="font-heading text-xl font-bold text-white">Rs.{pnl.net_profit||0}</p></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="border border-[#E5E3DB] rounded-xl p-4">
                  <h4 className="font-heading text-sm font-medium mb-2 text-[#6B8E6B]">Revenue</h4>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between"><span>CRM Orders ({pnl.revenue?.crm_count||0})</span><span className="font-semibold">Rs.{pnl.revenue?.crm_orders||0}</span></div>
                    {Object.entries(pnl.revenue?.external||{}).map(([k,v])=>(<div key={k} className="flex justify-between"><span className="capitalize">{k} ({v.count})</span><span className="font-semibold">Rs.{v.net_received||0}</span></div>))}
                    <div className="border-t pt-1 flex justify-between font-semibold"><span>Total</span><span>Rs.{pnl.revenue?.total||0}</span></div>
                  </div>
                </div>
                <div className="border border-[#E5E3DB] rounded-xl p-4">
                  <h4 className="font-heading text-sm font-medium mb-2 text-[#B75D69]">Expenses</h4>
                  <div className="space-y-1 text-xs">
                    {Object.entries(pnl.expenses?.by_category||{}).map(([k,v])=>(<div key={k} className="flex justify-between"><span className="capitalize">{k}</span><span>Rs.{v}</span></div>))}
                    <div className="flex justify-between"><span>Salaries</span><span>Rs.{pnl.expenses?.salary||0}</span></div>
                    <div className="flex justify-between"><span>Commissions</span><span>Rs.{pnl.expenses?.commissions||0}</span></div>
                    <div className="border-t pt-1 flex justify-between font-semibold"><span>Total Outflow</span><span>Rs.{(pnl.expenses?.total||0)+(pnl.expenses?.salary||0)+(pnl.expenses?.commissions||0)}</span></div>
                  </div>
                </div>
              </div>
              <div className="border border-[#E5E3DB] rounded-xl p-3 text-xs"><b>Settlement Charges:</b> Rs.{pnl.deductions?.settlement_charges||0} ({pnl.deductions?.prepaid_count||0} prepaid orders)</div>
            </>) : <p className="text-center py-8 text-[#59615D] text-sm">Loading P&L...</p>}
            {/* External Revenue Entries */}
            {revEntries.length>0&&<div className="mt-4"><h4 className="font-heading text-sm font-medium mb-2">External Revenue Entries</h4>
              <div className="space-y-1">{revEntries.slice(0,10).map(r=>(<div key={r.id} className="border border-[#E5E3DB] rounded-lg p-2 flex justify-between items-center text-xs"><div><Badge variant="outline" className="text-[8px] capitalize mr-1">{r.platform}</Badge><span>{r.order_ref||r.notes||"Entry"}</span><span className="text-[#59615D] ml-2">{r.date}</span></div><div className="flex items-center gap-2"><span className="font-semibold">Rs.{r.sale_amount} → Net Rs.{r.net_received}</span><Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-red-400" onClick={async()=>{try{await axios.delete(`${API}/revenue-entries/${r.id}`);toast.success("Deleted");fetchData();}catch{toast.error("Failed");}}}><X className="w-3 h-3"/></Button></div></div>))}</div>
            </div>}
            {/* Hard Reset Status */}
            {resetStatus?.pending&&<div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4"><p className="text-sm font-medium text-red-800">Hard Reset Scheduled</p><p className="text-xs text-red-600">Executes at: {resetStatus.execute_at?.slice(0,19).replace("T"," ")}</p><div className="flex gap-2 mt-2"><Button size="sm" variant="outline" className="rounded-full text-xs border-red-300 text-red-600" onClick={async()=>{try{await axios.post(`${API}/admin/hard-reset/cancel`);toast.success("Reset cancelled");fetchData();}catch{toast.error("Failed");}}} data-testid="cancel-reset-btn">Cancel Reset</Button><Button size="sm" className="rounded-full text-xs bg-red-600 text-white" onClick={async()=>{const pw=prompt("Re-enter password to execute NOW:");if(!pw)return;try{await axios.post(`${API}/admin/hard-reset/execute`,{password:pw});toast.success("Data cleared!");fetchData();}catch(e){toast.error(e.response?.data?.detail||"Failed");}}} data-testid="execute-reset-btn">Execute Now</Button></div></div>}
          </div></TabsContent>

          {/* STATES TAB - with district auto-load and agent/manager assignment */}
          <TabsContent value="states"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <div className="flex justify-between mb-4"><h3 className="font-heading text-lg font-medium">States & Districts</h3><Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={()=>setShowState(true)} data-testid="create-state-btn"><Globe className="w-4 h-4 mr-1"/>Add State</Button></div>
            <div className="space-y-4">
              {states.map(s=>(<div key={s.id} className="border border-[#E5E3DB] rounded-xl p-4" data-testid={`state-${s.id}`}>
                <p className="font-heading font-semibold text-lg">{s.name}</p>
                <div className="mt-3 space-y-2">
                  {s.districts?.map((d,i)=>{
                    const assigned = s.district_managers?.[d];
                    const districtAgents = allUsers.filter(u=>u.role==='agent'&&u.district===d);
                    return (<div key={i} className="bg-[#F9F8F6] rounded-lg p-3">
                      <div className="flex justify-between items-center flex-wrap gap-2">
                        <p className="font-medium text-sm">{d}</p>
                        <div className="flex gap-2 items-center">
                          {assigned?<Badge className="bg-[#3B5249] text-white text-[9px]">{assigned.manager_name} (DM)</Badge>:
                          <Select onValueChange={async(mid)=>{const m=allUsers.find(u=>u.id===mid);try{await axios.put(`${API}/states/${s.id}/assign-manager`,{district:d,manager_id:mid,manager_name:m?.name||""});toast.success(`${m?.name} assigned`);fetchData();}catch{toast.error("Failed");}}}><SelectTrigger className="h-6 w-32 text-[9px] rounded-full"><SelectValue placeholder="Assign DM"/></SelectTrigger><SelectContent>{allUsers.filter(u=>u.role==="district_manager").map(m=><SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>)}</SelectContent></Select>}
                          <span className="text-[10px] text-[#59615D]">{districtAgents.length} agents</span>
                        </div>
                      </div>
                    </div>);
                  })}
                  {(!s.districts||s.districts.length===0)&&<p className="text-xs text-[#59615D]">No districts</p>}
                </div>
              </div>))}
              {states.length===0&&<p className="text-[#59615D] text-sm text-center py-6">No states created yet</p>}
            </div>
            <div className="mt-6"><h4 className="font-heading text-base font-medium mb-3">Regions & Localities ({regions.length})</h4>
              <div className="space-y-4">{regions.map(r=>(<div key={r.id} className="border border-[#E5E3DB] rounded-xl p-4" data-testid={`region-${r.id}`}>
                <div className="flex justify-between items-start mb-2"><div><p className="font-heading font-medium">{r.name}</p><p className="text-xs text-[#59615D]">{r.district}, {r.state} - {r.pincode}</p></div><div className="flex flex-wrap gap-1">{r.areas?.map((a,i)=><Badge key={i} variant="outline" className="text-[9px]">{a}</Badge>)}</div></div>
                {/* Localities with agent assignment */}
                <div className="space-y-2 mt-3">
                  <div className="flex justify-between items-center"><p className="text-xs font-medium text-[#59615D]">Localities ({r.localities?.length || 0})</p>
                    <Button size="sm" variant="outline" className="rounded-full text-[10px] h-6 px-2" onClick={async()=>{const name=prompt("Locality name:");if(!name)return;const type=prompt("Type (taluk/village/ward):","village");try{await axios.post(`${API}/regions/${r.id}/localities`,{name,type});toast.success("Added");fetchData();}catch{toast.error("Failed");}}} data-testid={`add-locality-${r.id}`}><Plus className="w-3 h-3 mr-0.5"/>Add</Button></div>
                  {r.localities?.map((loc,idx)=>(
                    <div key={idx} className="bg-[#F9F8F6] rounded-lg p-3">
                      <div className="flex justify-between items-start">
                        <div><p className="font-medium text-sm">{typeof loc==="string"?loc:loc.name} {typeof loc!=="string"&&loc.type&&<Badge variant="outline" className="text-[8px] ml-1 capitalize">{loc.type}</Badge>}</p></div>
                        <Select onValueChange={async(agentId)=>{try{await axios.put(`${API}/regions/${r.id}/localities/${idx}/assign-agent`,{agent_id:agentId});toast.success("Agent assigned!");fetchData();}catch{toast.error("Failed");}}}><SelectTrigger className="h-6 w-32 text-[10px] rounded-lg"><SelectValue placeholder="Assign agent"/></SelectTrigger><SelectContent>{allUsers.filter(u=>u.role==="agent").map(a=><SelectItem key={a.id} value={a.id} className="text-xs">{a.name}</SelectItem>)}</SelectContent></Select>
                      </div>
                      {typeof loc!=="string"&&loc.agents?.length>0&&<div className="flex flex-wrap gap-1 mt-1.5">{loc.agents.map(aid=>{const ag=allUsers.find(u=>u.id===aid);return <Badge key={aid} className="bg-[#3B5249] text-white text-[9px]">{ag?.name||aid} <X className="w-2.5 h-2.5 ml-1 cursor-pointer" onClick={async(e)=>{e.stopPropagation();try{await axios.put(`${API}/regions/${r.id}/localities/${idx}/remove-agent`,{agent_id:aid});toast.success("Removed");fetchData();}catch{toast.error("Failed");}}}/></Badge>;})}</div>}
                    </div>
                  ))}
                </div>
              </div>))}</div>
            </div>
          </div></TabsContent>

          {/* ORDERS TAB — full workflow */}
          <TabsContent value="orders"><div className="bg-white rounded-xl border border-[#E5E3DB] p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="font-heading text-lg font-medium">Orders</h3>
              <Button size="sm" className="rounded-full bg-[#3B5249] text-white" onClick={()=>setShowOrderDlg(true)} data-testid="admin-create-order-btn"><Plus className="w-4 h-4 mr-1"/>Create Order</Button>
            </div>
            <MonthFilter month={genMonth} year={genYear} day={genDay} onMonthChange={setGenMonth} onYearChange={setGenYear} onDayChange={setGenDay}/>
            {(() => {
              const list = filterByMonth(orders||[], genMonth, genYear, "created_at", genDay).filter(o=>!search||o.customer_name?.toLowerCase().includes(search.toLowerCase())||o.id?.includes(search));
              const totalRev = list.filter(o=>o.status==="delivered").reduce((s,o)=>s+(Number(o.total_amount)||0),0);
              return (
                <>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-[#F9F8F6] rounded-xl p-3"><p className="text-[9px] uppercase text-[#59615D]">Orders</p><p className="font-heading font-semibold">{list.length}</p></div>
                    <div className="bg-[#F9F8F6] rounded-xl p-3"><p className="text-[9px] uppercase text-[#59615D]">Delivered Revenue</p><p className="font-heading font-semibold text-[#3B5249]">Rs.{totalRev.toLocaleString()}</p></div>
                    <div className="bg-[#F9F8F6] rounded-xl p-3"><p className="text-[9px] uppercase text-[#59615D]">Pending</p><p className="font-heading font-semibold">{list.filter(o=>o.status==="pending").length}</p></div>
                  </div>
                  {list.length===0?<p className="text-center py-8 text-[#59615D] text-sm">No orders match the selected filters</p>:
                  <div className="space-y-3">{list.map(o=>(
              <div key={o.id} className="border border-[#E5E3DB] rounded-xl p-4" data-testid={`order-${o.id}`}>
                <div className="flex flex-col sm:flex-row justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-mono text-xs font-medium">{o.id}</p>
                      <Badge className={`text-[9px] whitespace-nowrap ${o.status==="delivered"?"bg-green-100 text-green-800":o.status==="shipped"?"bg-blue-100 text-blue-800":o.status==="confirmed"?"bg-emerald-100 text-emerald-800":o.status==="pending"?"bg-yellow-100 text-yellow-800":"bg-red-100 text-red-800"}`}>{o.status?.toUpperCase()}</Badge>
                    </div>
                    <p className="font-medium text-sm mt-1">{o.customer_name}</p>
                    <p className="text-xs text-[#59615D]">{o.customer_phone} | {o.customer_address}</p>
                    {o.items?.map((item,idx)=>(<p key={idx} className="text-xs text-[#59615D]">{item.product_name} x{item.quantity} = Rs.{item.price*item.quantity}</p>))}
                    <p className="font-heading font-semibold text-[#3B5249] mt-1">Total: Rs.{o.total_amount} <span className="font-normal text-xs text-[#59615D]">({o.payment_type})</span></p>
                    <p className="text-[10px] text-[#59615D] mt-1">By: {o.created_by_name || o.created_by_role || "—"} | {o.created_at?.slice(0,10)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 items-start">
                    {!["shipped","delivered","rejected","cancelled"].includes(o.status) && <Button size="sm" variant="outline" className="rounded-full text-xs h-7" onClick={()=>setEditOrder(o)} data-testid={`edit-order-${o.id}`}>✏️ Edit</Button>}
                    {o.status==="pending"&&<><Button size="sm" className="rounded-full text-xs bg-[#6B8E6B] text-white h-7" onClick={async()=>{try{await axios.put(`${API}/orders/${o.id}/approve`);toast.success("Approved!");fetchData();}catch(e){toast.error(e.response?.data?.detail||"Failed");}}} data-testid={`approve-order-${o.id}`}><Check className="w-3 h-3 mr-1"/>Approve</Button><Button size="sm" variant="outline" className="rounded-full text-xs h-7 text-red-500" onClick={async()=>{try{await axios.put(`${API}/orders/${o.id}/reject`,{reason:"Rejected"});toast.success("Rejected");fetchData();}catch{toast.error("Failed");}}}><X className="w-3 h-3"/></Button></>}
                    {o.status==="confirmed"&&<Button size="sm" className="rounded-full text-xs bg-[#3B5249] text-white h-7" onClick={async()=>{try{await axios.put(`${API}/orders/${o.id}/ship-and-deliver`);toast.success("Delivered! Commission credited");fetchData();}catch(e){toast.error(e.response?.data?.detail||"Failed");}}} data-testid={`deliver-${o.id}`}><Check className="w-3 h-3 mr-1"/>Delivered</Button>}
                    <DelhiveryShipActions order={o} role="admin" onChange={fetchData} compact />
                    {o.status==="shipped"&&<Button size="sm" className="rounded-full text-xs bg-[#3B5249] text-white h-7" onClick={async()=>{try{await axios.put(`${API}/orders/${o.id}/deliver`);toast.success("Delivered! Commission credited");fetchData();}catch(e){toast.error(e.response?.data?.detail||"Failed");}}} data-testid={`deliver-order-${o.id}`}><Check className="w-3 h-3 mr-1"/>Delivered</Button>}
                    <Button size="sm" variant="ghost" className="rounded-full text-[10px] text-red-400 h-7" onClick={async()=>{const pw=prompt("Enter master password to delete order:");if(!pw)return;try{await axios.delete(`${API}/orders/${o.id}`,{data:{password:pw}});toast.success("Order deleted");fetchData();}catch(e){toast.error(e.response?.data?.detail||"Failed");}}} data-testid={`delete-order-${o.id}`}><X className="w-3 h-3"/></Button>
                  </div>
                </div>
              </div>
            ))}</div>}
                </>
              );
            })()}
          </div></TabsContent>

          {/* LEADS TAB */}
          <TabsContent value="leads"><div className="bg-white rounded-xl border border-[#E5E3DB] overflow-x-auto"><div className="p-4 border-b border-[#E5E3DB] flex justify-between items-center flex-wrap gap-2"><h3 className="font-heading text-lg font-medium">Leads</h3></div>
            <div className="px-4 pt-3"><MonthFilter month={genMonth} year={genYear} day={genDay} onMonthChange={setGenMonth} onYearChange={setGenYear} onDayChange={setGenDay}/></div>
            {(() => {
              const list = filterByMonth(leads||[], genMonth, genYear, "created_at", genDay).filter(l=>!search||l.name?.toLowerCase().includes(search.toLowerCase())||l.phone_number?.includes(search)||l.assigned_to_name?.toLowerCase().includes(search.toLowerCase()));
              return (<>
                <p className="px-4 pb-2 text-xs text-[#59615D]">{list.length} lead(s)</p>
                <table className="w-full text-sm"><thead><tr className="border-b bg-[#F9F8F6]">{["Name","Phone","Telecaller / Agent","Source","Status","Interest","Last Order","Repeat","Relation","Created"].map(h=><th key={h} className="text-left p-3 text-[10px] uppercase text-[#59615D]">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-[#E5E3DB]">{list.map(l=>(<tr key={l.id} data-testid={`lead-row-${l.id}`}><td className="p-3 font-medium">{l.name}</td><td className="p-3">{l.phone_number}</td><td className="p-3 text-xs"><b className="text-[#3B5249]">{l.assigned_to_name||"-"}</b></td><td className="p-3"><Badge variant="outline" className="text-[9px]">{l.source}</Badge></td><td className="p-3"><Badge className={`text-[9px] whitespace-nowrap ${l.status==="converted"||l.status==="delivered"?"bg-green-100 text-green-800":l.status==="interested"?"bg-blue-100 text-blue-800":"bg-gray-100 text-gray-800"}`}>{l.status?.replace(/_/g," ")}</Badge></td><td className="p-3">{l.product_interest}</td><td className="p-3 text-xs">{l.last_order_date||"-"}</td><td className="p-3 text-xs">{l.next_repeat_order_date||"-"}</td><td className="p-3 text-xs">{l.next_relationship_date||"-"}</td><td className="p-3 text-xs">{l.created_at?.slice(0,10)}</td></tr>))}</tbody></table>
              </>);
            })()}
          </div></TabsContent>


          {/* CONVERSATIONS / CALL LOGS TAB */}
          <TabsContent value="conversations"><AdminCallLogs /></TabsContent>


          {/* FINANCE TAB — Cash & Bank Balance */}
          <TabsContent value="finance"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-heading text-lg font-medium">Cash & Bank Balance</h3>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="rounded-full text-xs text-red-500 border-red-200" onClick={async()=>{const pw=prompt("Enter admin delete password to reset ALL finance:");if(!pw)return;try{await axios.post(`${API}/finance/reset`,{password:pw});toast.success("Finance reset to zero");fetchData();}catch(e){toast.error(e.response?.data?.detail||"Failed");}}} data-testid="reset-finance-btn">Reset</Button>
                <Button size="sm" variant="outline" className="rounded-full text-xs" onClick={()=>setShowFinTransfer(true)} data-testid="transfer-btn">Transfer</Button>
                <Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={()=>setShowFinTxn(true)} data-testid="add-txn-btn"><Plus className="w-3 h-3 mr-1"/>Add Entry</Button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-[#F9F8F6] rounded-xl p-4 text-center"><p className="text-xs text-[#59615D] uppercase">Cash in Hand</p><p className="font-heading text-2xl font-bold text-[#A66E4E]" data-testid="cash-balance">Rs.{finBalance.cash}</p></div>
              <div className="bg-[#F9F8F6] rounded-xl p-4 text-center"><p className="text-xs text-[#59615D] uppercase">Bank Account</p><p className="font-heading text-2xl font-bold text-[#3B5249]" data-testid="bank-balance">Rs.{finBalance.bank}</p></div>
              <div className="bg-[#3B5249] rounded-xl p-4 text-center"><p className="text-xs text-white/70 uppercase">Working Capital</p><p className="font-heading text-2xl font-bold text-white" data-testid="total-balance">Rs.{finBalance.total}</p></div>
            </div>
            {/* Monthly Financial Chart */}
            {monthlyStats.length > 0 && (
              <div className="mb-4" data-testid="admin-monthly-finance-chart">
                <h4 className="font-heading text-sm font-medium mb-3">Monthly Overview (Credits / Debits / Expenses)</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={monthlyStats}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E3DB" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => `Rs.${v}`} />
                    <Bar dataKey="credits" name="Credits" fill="#6B8E6B" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="debits" name="Debits" fill="#B75D69" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" name="Expenses" fill="#D4A373" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {/* Cash Holders */}
            <div className="mt-4 mb-4"><div className="flex justify-between items-center mb-2"><h4 className="font-heading text-sm font-medium">Cash Holders (Employees)</h4>
              <Select onValueChange={async(uid)=>{const u=allUsers.find(x=>x.id===uid);if(!u)return;const amt=prompt(`Assign cash to ${u.name} (Rs.):`);if(!amt)return;try{await axios.post(`${API}/finance/assign-cash`,{user_id:uid,user_name:u.name,amount:Number(amt)});toast.success(`Rs.${amt} assigned to ${u.name}`);fetchData();}catch{toast.error("Failed");}}}><SelectTrigger className="h-7 w-36 text-[10px] rounded-full"><SelectValue placeholder="Assign cash to..."/></SelectTrigger><SelectContent>{allUsers.filter(u=>u.role!=="admin").map(u=><SelectItem key={u.id} value={u.id} className="text-xs">{u.name}</SelectItem>)}</SelectContent></Select></div>
              {cashHolders.length===0?<p className="text-xs text-[#59615D]">No cash assigned</p>:
              <div className="flex flex-wrap gap-2">{cashHolders.filter(h=>h.amount>0).map(h=>(<div key={h.user_id} className="bg-[#F9F8F6] rounded-lg px-3 py-2 flex items-center gap-2"><span className="text-xs font-medium">{h.user_name}</span><span className="font-heading text-sm font-semibold text-[#A66E4E]">Rs.{h.amount}</span><Button size="sm" variant="ghost" className="h-5 text-[9px] text-[#3B5249] px-1" onClick={async()=>{const amt=prompt(`Return cash from ${h.user_name} (Rs.):`);if(!amt)return;try{await axios.post(`${API}/finance/return-cash`,{user_id:h.user_id,user_name:h.user_name,amount:Number(amt)});toast.success(`Rs.${amt} returned`);fetchData();}catch{toast.error("Failed");}}}>Return</Button></div>))}</div>}
            </div>
            <h4 className="font-heading text-sm font-medium mb-3">Transaction History</h4>
            {finLedger.length===0?<p className="text-center py-6 text-[#59615D] text-sm">No transactions yet</p>:
            <div className="space-y-2 max-h-96 overflow-y-auto">{finLedger.map(t=>(
              <div key={t.id} className="border border-[#E5E3DB] rounded-lg p-3 flex justify-between items-center" data-testid={`txn-${t.id}`}>
                <div>
                  <div className="flex items-center gap-2">
                    <Badge className={`text-[9px] ${t.type==="credit"?"bg-green-100 text-green-800":t.type==="debit"?"bg-red-100 text-red-800":"bg-blue-100 text-blue-800"}`}>{t.type?.toUpperCase()}</Badge>
                    <Badge variant="outline" className="text-[9px] capitalize">{t.method}</Badge>
                    <Badge variant="outline" className="text-[9px] capitalize">{t.category?.replace(/_/g," ")}</Badge>
                  </div>
                  <p className="text-xs text-[#59615D] mt-1">{t.description}</p>
                  <p className="text-[10px] text-[#59615D]">{t.created_at?.slice(0,16).replace("T"," ")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <p className={`font-heading font-semibold ${t.type==="credit"?"text-[#6B8E6B]":"text-[#B75D69]"}`}>{t.type==="credit"?"+":t.type==="debit"?"-":""}Rs.{t.amount}</p>
                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-red-300 hover:text-red-500" onClick={async()=>{const pw=prompt("Delete password:");if(!pw)return;try{await axios.delete(`${API}/finance/transaction/${t.id}`,{data:{password:pw}});toast.success("Deleted & reversed");fetchData();}catch(e){toast.error(e.response?.data?.detail||"Failed");}}}><X className="w-3 h-3"/></Button>
                </div>
              </div>
            ))}</div>}
          </div></TabsContent>


          {/* COMMISSION SUMMARY TAB */}
          <TabsContent value="commissions"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-heading text-lg font-medium">Commission Summary</h3>
              <Button size="sm" variant="outline" className="rounded-full text-xs" onClick={()=>setShowRateEditor(true)} data-testid="edit-commission-rates">Edit Rates</Button>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-[#F9F8F6] rounded-xl p-4 text-center"><p className="text-[10px] text-[#59615D] uppercase">Today</p><p className="font-heading text-xl font-bold text-[#B75D69]">Rs.{commSummary.total_today||0}</p></div>
              <div className="bg-[#F9F8F6] rounded-xl p-4 text-center"><p className="text-[10px] text-[#59615D] uppercase">This Week</p><p className="font-heading text-xl font-bold text-[#D4A373]">Rs.{commSummary.total_weekly}</p></div>
              <div className="bg-[#F9F8F6] rounded-xl p-4 text-center"><p className="text-[10px] text-[#59615D] uppercase">This Month</p><p className="font-heading text-xl font-bold text-[#3B5249]">Rs.{commSummary.total_monthly}</p></div>
            </div>
            {/* Settlement Config */}
            <div className="bg-[#F9F8F6] rounded-xl p-3 mb-4 flex justify-between items-center"><div className="text-xs"><b>Settlement Charge:</b> {settlementCfg.type==="percentage"?`${settlementCfg.value}%`:`Rs.${settlementCfg.value}`} per order</div>
              <Button size="sm" variant="outline" className="rounded-full text-[10px] h-6" onClick={async()=>{const t=prompt("Type (percentage or amount):",settlementCfg.type);const v=prompt("Value:",settlementCfg.value);if(t&&v){try{await axios.put(`${API}/config/settlement`,{type:t,value:Number(v)});toast.success("Updated!");fetchData();}catch{toast.error("Failed");}}}} data-testid="edit-settlement">Edit</Button>
            </div>
            {/* Daily Breakdown */}
            {commSummary.daily_breakdown?.length>0&&<div className="mb-4"><p className="text-xs font-medium text-[#59615D] mb-2">Per Day</p><div className="flex flex-wrap gap-2">{commSummary.daily_breakdown?.slice(0,7).map(d=>(<div key={d.date} className="bg-[#F9F8F6] rounded-lg px-3 py-1.5 text-center"><p className="text-[9px] text-[#59615D]">{d.date?.slice(5)}</p><p className="font-heading text-sm font-semibold">Rs.{d.amount}</p></div>))}</div></div>}
            <h4 className="font-heading text-sm font-medium mb-3">Per Agent / Telecaller</h4>
            {commSummary.agents?.length===0?<p className="text-center py-6 text-[#59615D] text-sm">No commission data. Commissions credited on order delivery.</p>:
            <div className="space-y-3">{commSummary.agents?.map(a=>(
              <div key={a.user_id} className="border border-[#E5E3DB] rounded-xl overflow-hidden">
                <div className="p-4 cursor-pointer hover:bg-[#F9F8F6] transition-all" onClick={()=>setCommExpanded(commExpanded===a.user_id?null:a.user_id)} data-testid={`comm-agent-${a.user_id}`}>
                  <div className="flex justify-between items-center">
                    <div><p className="font-heading font-medium">{a.user_name}</p><Badge variant="outline" className="text-[9px] capitalize">{a.user_role?.replace(/_/g," ")}</Badge></div>
                    <div className="text-right">
                      <p className="font-heading font-semibold text-[#3B5249]">Rs.{a.total}</p>
                      <div className="flex gap-2 text-[10px] text-[#59615D]"><span>Week: Rs.{a.weekly}</span><span>Month: Rs.{a.monthly}</span></div>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-2 text-xs"><span className="text-[#D4A373]">Pending: Rs.{a.pending}</span><span className="text-[#6B8E6B]">Paid: Rs.{a.paid}</span></div>
                </div>
                {commExpanded===a.user_id&&<div className="border-t border-[#E5E3DB] bg-[#F9F8F6] p-3 max-h-48 overflow-y-auto">
                  {a.daily?.length>0&&<div className="flex flex-wrap gap-1 mb-2">{a.daily.slice(0,7).map(d=>(<Badge key={d.date} variant="outline" className="text-[9px]">{d.date?.slice(5)}: Rs.{d.amount}</Badge>))}</div>}
                  <p className="text-[10px] text-[#59615D] uppercase mb-1">Orders</p>
                  {a.orders?.map((o,i)=>(<div key={i} className="flex justify-between text-xs py-1 border-b border-[#E5E3DB] last:border-0"><span className="font-mono">{o.order_id} ({o.date})</span><span>Rs.{o.order_amount} → <b>Rs.{o.amount}</b> <Badge className={`text-[8px] ${o.status==="paid"?"bg-green-100 text-green-800":"bg-yellow-100 text-yellow-800"}`}>{o.status}</Badge></span></div>))}
                </div>}
              </div>
            ))}</div>}
          </div></TabsContent>

          {/* FUNDS TAB - with admin fund request */}
          <TabsContent value="funds"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <div className="flex justify-between mb-3 flex-wrap gap-2"><h3 className="font-heading text-lg font-medium">Fund Requests</h3>
              <Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={()=>setShowFundRequest(true)} data-testid="admin-fund-request-btn"><Plus className="w-3 h-3 mr-1"/>Request Fund</Button>
            </div>
            <MonthFilter month={genMonth} year={genYear} day={genDay} onMonthChange={setGenMonth} onYearChange={setGenYear} onDayChange={setGenDay}/>
            {(() => {
              const list = filterByMonth(fundRequests||[], genMonth, genYear, "created_at", genDay);
              const totalApproved = list.filter(f=>f.status==="approved").reduce((s,f)=>s+(Number(f.amount)||0),0);
              const totalPending = list.filter(f=>f.status==="pending").reduce((s,f)=>s+(Number(f.amount)||0),0);
              return (
                <>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-[#F9F8F6] rounded-xl p-3"><p className="text-[9px] uppercase text-[#59615D]">Requests</p><p className="font-heading font-semibold">{list.length}</p></div>
                    <div className="bg-[#F9F8F6] rounded-xl p-3"><p className="text-[9px] uppercase text-[#59615D]">Approved Total</p><p className="font-heading font-semibold text-[#3B5249]">Rs.{totalApproved.toLocaleString()}</p></div>
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3"><p className="text-[9px] uppercase text-yellow-700">Pending</p><p className="font-heading font-semibold text-yellow-700">Rs.{totalPending.toLocaleString()}</p></div>
                  </div>
                  {list.length===0?<p className="text-center py-6 text-[#59615D] text-sm">No fund requests match the selected filters</p>:
                  <div className="space-y-2">{list.map(f=>(<div key={f.id} className="border border-[#E5E3DB] rounded-xl p-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2"><div><p className="font-medium text-sm">Rs.{f.amount} - <span className="capitalize">{f.category}</span></p><p className="text-xs text-[#59615D]">{f.requested_by_name} ({f.requested_by_role?.replace(/_/g," ")}) | {f.reason}</p><p className="text-[10px] text-[#59615D] mt-0.5">{f.created_at?.slice(0,10)}</p></div><div className="flex gap-2 items-center flex-wrap"><Badge className={`text-[9px] whitespace-nowrap ${f.status==="approved"?"bg-green-100 text-green-800":f.status==="rejected"?"bg-red-100 text-red-800":"bg-yellow-100 text-yellow-800"}`}>{f.status}</Badge>{f.status==="pending"&&<><Select onValueChange={async(v)=>{try{await axios.put(`${API}/fund-requests/${f.id}/approve`,{status:"approved",debit_from:v});toast.success(`Approved (${v})`);fetchData();}catch{toast.error("Failed");}}}><SelectTrigger className="h-7 w-28 text-[10px] rounded-full"><SelectValue placeholder="Approve from"/></SelectTrigger><SelectContent><SelectItem value="cash">From Cash</SelectItem><SelectItem value="bank">From Bank</SelectItem></SelectContent></Select><Button size="sm" variant="outline" className="rounded-full text-xs h-7" onClick={()=>approveFund(f.id,"rejected")}>Reject</Button></>}</div></div>))}</div>}
                </>
              );
            })()}
          </div></TabsContent>

          {/* EXPENSES TAB */}
          <TabsContent value="expenses"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <div className="flex justify-between mb-3 flex-wrap gap-2"><h3 className="font-heading text-lg font-medium">Expenses</h3><Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={()=>setShowExpense(true)} data-testid="add-expense-btn"><Plus className="w-3 h-3 mr-1"/>Add Expense</Button></div>
            <MonthFilter month={expMonth} year={expYear} day={expDay} onMonthChange={setExpMonth} onYearChange={setExpYear} onDayChange={setExpDay}/>
            <div className="flex gap-1 mb-3 flex-wrap items-center">
              <span className="text-[10px] text-[#59615D] font-medium mr-1 uppercase">Reimbursement:</span>
              {[{v:"all",l:"All"},{v:"to_be_paid",l:"To Be Paid"},{v:"paid",l:"Paid"},{v:"none",l:"Regular"}].map(f=>(
                <button key={f.v} onClick={()=>setExpReimburseFilter(f.v)} data-testid={`exp-rfilter-${f.v}`} className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${expReimburseFilter===f.v?"bg-orange-600 text-white":"bg-white border border-[#E5E3DB] text-[#59615D] hover:bg-[#F9F8F6]"}`}>{f.l}</button>
              ))}
            </div>
            {(() => {
              let list = filterByMonth(expenses||[], expMonth, expYear, "created_at", expDay);
              if (expReimburseFilter === "to_be_paid") list = list.filter(e => e.reimburse_status === "to_be_paid" || ((e.paid_to_name||e.paid_to_user_id) && e.reimburse_status !== "paid"));
              else if (expReimburseFilter === "paid") list = list.filter(e => e.reimburse_status === "paid");
              else if (expReimburseFilter === "none") list = list.filter(e => !(e.paid_to_name||e.paid_to_user_id));
              const totalAmt = list.reduce((s,e)=>s+(Number(e.amount)||0),0);
              const toBePaidAmt = list.filter(e=>(e.paid_to_name||e.paid_to_user_id)&&e.reimburse_status!=="paid").reduce((s,e)=>s+(Number(e.amount)||0),0);
              return (
                <>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-[#F9F8F6] rounded-xl p-3"><p className="text-[9px] uppercase text-[#59615D]">Records</p><p className="font-heading font-semibold text-[#2C3531]">{list.length}</p></div>
                    <div className="bg-[#F9F8F6] rounded-xl p-3"><p className="text-[9px] uppercase text-[#59615D]">Total Amount</p><p className="font-heading font-semibold text-[#2C3531]">Rs.{totalAmt.toLocaleString()}</p></div>
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-3"><p className="text-[9px] uppercase text-orange-700">To Be Paid</p><p className="font-heading font-semibold text-orange-700">Rs.{toBePaidAmt.toLocaleString()}</p></div>
                  </div>
                  {list.length===0 ? <p className="text-center py-6 text-[#59615D] text-sm">No expenses match the selected filters</p> :
                  <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-[#F9F8F6]">{["Date","Title","Category","Amount","Created By","Paid To","Proof","Status","Action"].map(h=><th key={h} className="text-left p-3 text-[10px] uppercase text-[#59615D] whitespace-nowrap">{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-[#E5E3DB]">{list.map(e=>(
                      <tr key={e.id} data-testid={`expense-row-${e.id}`} className={e.reimburse_status==="to_be_paid"||((e.paid_to_name||e.paid_to_user_id)&&e.reimburse_status!=="paid")?"bg-orange-50/40":""}>
                        <td className="p-3 text-xs whitespace-nowrap">{e.created_at?.slice(0,10)}</td>
                        <td className="p-3 text-sm">{e.title}{e.description && <p className="text-[10px] text-[#59615D] mt-0.5 max-w-xs truncate" title={e.description}>{e.description}</p>}</td>
                        <td className="p-3"><Badge variant="outline" className="text-[9px] capitalize">{e.category?.replace(/_/g," ")}</Badge></td>
                        <td className="p-3 font-semibold whitespace-nowrap">Rs.{Number(e.amount||0).toLocaleString()}</td>
                        <td className="p-3 text-xs">{e.created_by_name}</td>
                        <td className="p-3">{e.paid_to_name?<div className="flex flex-col gap-0.5"><Badge className={`text-[10px] w-fit ${e.reimburse_status==="paid"?"bg-green-100 text-green-800":"bg-orange-100 text-orange-800"}`}>{e.reimburse_status==="paid"?"Paid":"To Be Paid"}</Badge><span className="text-xs font-medium text-[#2C3531]">{e.paid_to_name}</span>{e.paid_to_phone && <span className="text-[10px] text-[#59615D]">{e.paid_to_phone}</span>}</div>:<span className="text-xs text-[#59615D]">—</span>}</td>
                        <td className="p-3">{e.proof_path?<a href={`${process.env.REACT_APP_BACKEND_URL}/api/files/${e.proof_path}`} target="_blank" rel="noreferrer" className="text-xs text-[#3B5249] underline inline-flex items-center"><ExternalLink className="w-3 h-3 mr-0.5"/>View</a>:<span className="text-xs text-[#59615D]">-</span>}</td>
                        <td className="p-3"><Badge className={`text-[9px] whitespace-nowrap ${e.status==="approved"?"bg-green-100 text-green-800":e.status==="rejected"?"bg-red-100 text-red-800":"bg-yellow-100 text-yellow-800"}`}>{e.status}</Badge></td>
                        <td className="p-3"><div className="flex gap-1 flex-wrap">
                          {e.status==="pending" && <>
                            <Select onValueChange={async(v)=>{try{await axios.put(`${API}/expenses/${e.id}/approve`,{status:"approved",debit_from:v});toast.success(`Approved (${v})`);fetchData();}catch{toast.error("Failed");}}}><SelectTrigger className="h-6 w-20 text-[9px] rounded-full"><SelectValue placeholder="Approve"/></SelectTrigger><SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="bank">Bank</SelectItem></SelectContent></Select>
                            <Button size="sm" variant="outline" className="rounded-full text-xs h-6" onClick={()=>approveExpense(e.id,"rejected")} title="Reject"><X className="w-3 h-3"/></Button>
                          </>}
                          {(e.paid_to_name||e.paid_to_user_id) && e.reimburse_status!=="paid" && <Button size="sm" className="rounded-full text-[9px] h-6 bg-orange-600 hover:bg-orange-700 text-white" onClick={()=>markExpensePaid(e.id, e.paid_to_name)} data-testid={`mark-paid-${e.id}`}>Mark Paid</Button>}
                          <Button size="sm" variant="ghost" className="h-6 text-[10px] text-red-400" onClick={async()=>{const pw=prompt("Enter delete password:");if(!pw)return;try{await axios.delete(`${API}/expenses/${e.id}`,{data:{password:pw}});toast.success("Deleted");fetchData();}catch(err){toast.error(err.response?.data?.detail||"Failed");}}} data-testid={`del-expense-${e.id}`} title="Delete"><X className="w-3 h-3"/></Button>
                        </div></td>
                      </tr>
                    ))}</tbody></table></div>}
                </>
              );
            })()}
          </div></TabsContent>

          {/* PAYROLL TAB - clear labels */}
          <TabsContent value="payroll"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5"><div className="flex justify-between mb-3 flex-wrap gap-2"><h3 className="font-heading text-lg font-medium">Payroll</h3><Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={()=>setShowPayroll(true)} data-testid="add-payroll-btn"><Plus className="w-3 h-3 mr-1"/>Create Payroll</Button></div>
            <MonthFilter month={genMonth} year={genYear} day={genDay} onMonthChange={setGenMonth} onYearChange={setGenYear} onDayChange={setGenDay} showDay={false}/>
            {(() => {
              const list = filterByMonth(payroll||[], genMonth, genYear, "created_at", "all").filter(p=>{
                if (genMonth==="all") return true;
                return String(p.month)===genMonth && String(p.year)===genYear;
              });
              return list.length===0?<p className="text-center py-6 text-[#59615D] text-sm">No payroll records match the selected filters</p>:
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-[#F9F8F6]">{["Employee","Role","Period","Days","Basic","Bonus","Deductions","Commission","Net Salary","Status","Action"].map(h=><th key={h} className="text-left p-2 text-[10px] uppercase text-[#59615D] whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[#E5E3DB]">{list.map(p=>(<tr key={p.id}><td className="p-2 text-sm">{p.user_name}</td><td className="p-2"><Badge variant="outline" className="text-[9px]">{p.user_role?.replace(/_/g," ")}</Badge></td><td className="p-2 text-xs">{p.month}/{p.year}</td><td className="p-2 text-xs">{p.working_days||"-"}/{p.total_working_days||30}</td><td className="p-2">Rs.{p.basic_salary}</td><td className="p-2 text-[#6B8E6B]">+Rs.{p.bonus}</td><td className="p-2 text-[#B75D69]">-Rs.{p.deductions}</td><td className="p-2">Rs.{p.commission}</td><td className="p-2 font-semibold text-[#3B5249]">Rs.{p.net_salary}</td><td className="p-2"><Badge className={`text-[9px] ${p.status==="processed"?"bg-green-100 text-green-800":"bg-yellow-100 text-yellow-800"}`}>{p.status}</Badge></td><td className="p-2">{p.status==="pending"&&<Button size="sm" className="rounded-full text-xs bg-[#6B8E6B] text-white h-6" onClick={()=>processPayroll(p.id)}>Process</Button>}</td></tr>))}</tbody></table></div>;
            })()}
          </div></TabsContent>


          {/* INSTRUCTIONS TAB */}
          <TabsContent value="instructions"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <div className="flex justify-between mb-4 flex-wrap gap-2"><h3 className="font-heading text-lg font-medium">Instructions & Broadcasts</h3><div className="flex gap-2"><Button size="sm" variant="outline" className="rounded-full text-xs border-[#3B5249] text-[#3B5249]" onClick={()=>{setShowDocTemplates(true);loadDocTemplates();}} data-testid="edit-doc-templates-btn"><Edit className="w-3 h-3 mr-1"/>Edit Document Templates</Button><Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={()=>setShowInstruction(true)} data-testid="add-instruction-btn"><Plus className="w-3 h-3 mr-1"/>New Instruction / Task</Button></div></div>
            {instructions.length===0?<p className="text-center py-6 text-[#59615D] text-sm">No instructions</p>:
            <div className="space-y-2">{instructions.map(i=>(<div key={i.id} className="border border-[#E5E3DB] rounded-xl p-4"><div className="flex justify-between items-start"><div><p className="font-heading font-medium">{i.title}</p><p className="text-sm text-[#59615D] mt-1 whitespace-pre-wrap">{i.content}</p></div><div className="flex gap-1"><Badge variant="outline" className="text-[9px] capitalize">{i.target_role==="all"?"All Staff":i.target_role?.replace(/_/g," ")}</Badge><Badge className={`text-[9px] ${i.priority==="high"?"bg-red-100 text-red-800":i.priority==="urgent"?"bg-red-200 text-red-900":"bg-gray-100 text-gray-700"}`}>{i.priority}</Badge></div></div><p className="text-[10px] text-[#59615D] mt-2">By {i.created_by_name} | {i.created_at?.slice(0,10)}</p></div>))}</div>}
          </div></TabsContent>

          {/* HR TAB */}
          <TabsContent value="hr"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5"><div className="flex justify-between mb-4"><h3 className="font-heading text-lg font-medium">HR Team</h3><Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={()=>setShowHrMember(true)} data-testid="add-hr-btn"><Plus className="w-3 h-3 mr-1"/>Add Member</Button></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{hrTeam.map(h=>(<div key={h.id} className="border border-[#E5E3DB] rounded-xl p-3"><p className="font-heading font-medium text-sm">{h.name}</p><Badge variant="outline" className="text-[9px] mt-1">{h.role_title}</Badge><p className="text-xs text-[#59615D] mt-1">{h.department} | {h.email}</p><p className="text-xs font-medium mt-1">Salary: Rs.{h.salary}</p></div>))}</div>
          </div></TabsContent>

          {/* INVEST TAB */}
          <TabsContent value="invest"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5"><div className="flex justify-between mb-4"><h3 className="font-heading text-lg font-medium">Investments</h3><Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={()=>setShowInvestment(true)} data-testid="add-invest-btn"><Plus className="w-3 h-3 mr-1"/>Add Investment</Button></div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-[#F9F8F6] rounded-xl p-4 text-center"><p className="text-[10px] text-[#59615D] uppercase">Main Partner</p><p className="font-heading text-xl font-bold text-[#3B5249]">Rs.{investments.filter(i=>i.partner_type==="main"||!i.partner_type).reduce((s,i)=>s+i.amount,0)}</p></div>
              <div className="bg-[#F9F8F6] rounded-xl p-4 text-center"><p className="text-[10px] text-[#59615D] uppercase">Sub Partner</p><p className="font-heading text-xl font-bold text-[#A66E4E]">Rs.{investments.filter(i=>i.partner_type==="sub").reduce((s,i)=>s+i.amount,0)}</p></div>
            </div>
            <div className="bg-[#3B5249] rounded-xl p-4 text-center mb-4"><p className="text-xs text-white/70 uppercase">Total Investment</p><p className="font-heading text-2xl font-bold text-white">Rs.{investments.reduce((s,i)=>s+i.amount,0)}</p></div>
            <div className="space-y-2">{investments.map(i=>(<div key={i.id} className="border border-[#E5E3DB] rounded-xl p-3 flex justify-between items-start"><div><p className="font-medium text-sm">{i.title}</p><p className="text-xs text-[#59615D]">{i.source} | {i.date}</p><Badge variant="outline" className="text-[9px] capitalize mt-1">{i.partner_type||"main"} partner</Badge></div><div className="flex items-center gap-2"><p className="font-heading font-semibold text-[#3B5249]">Rs.{i.amount}</p><Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400" onClick={async()=>{const pw=prompt("Enter delete password:");if(!pw)return;try{await axios.delete(`${API}/investments/${i.id}`,{data:{password:pw}});toast.success("Deleted & balance adjusted");fetchData();}catch(err){toast.error(err.response?.data?.detail||"Wrong password");}}} data-testid={`del-invest-${i.id}`}><X className="w-3 h-3"/></Button></div></div>))}</div>
          </div></TabsContent>

          {/* CONTENT TAB */}
          <TabsContent value="content"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5"><div className="flex justify-between mb-4"><h3 className="font-heading text-lg font-medium">Content</h3><Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={()=>setShowContent(true)} data-testid="add-content-btn"><Plus className="w-3 h-3 mr-1"/>Add Content</Button></div>
            {content.length===0?<p className="text-center py-6 text-[#59615D] text-sm">No content</p>:
            <div className="space-y-2">{content.map(c=>(<div key={c.id} className="border border-[#E5E3DB] rounded-xl p-3 flex justify-between"><div><p className="font-medium text-sm">{c.title}</p><p className="text-xs text-[#59615D]">{c.type} | {c.platform}</p></div><Badge className={`text-[9px] whitespace-nowrap ${c.status==="published"?"bg-green-100 text-green-800":"bg-yellow-100 text-yellow-800"}`}>{c.status}</Badge></div>))}</div>}
          </div></TabsContent>

          {/* AUDIT TAB */}
          <TabsContent value="audit"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5"><h3 className="font-heading text-lg font-medium mb-4">Audit Log</h3>
            {auditLogs.length===0?<p className="text-center py-6 text-[#59615D] text-sm">No audit entries</p>:
            <div className="space-y-2">{auditLogs.map(a=>(<div key={a.id} className="border border-[#E5E3DB] rounded-xl p-3 flex flex-col sm:flex-row justify-between"><div><p className="font-medium text-sm">{a.action.replace(/_/g," ").toUpperCase()}</p><p className="text-xs text-[#59615D]">{a.entity_type} | {a.details}</p></div><div className="text-right"><p className="text-xs text-[#A66E4E]">By: {a.changed_by_name}</p><p className="text-[10px] text-[#59615D]">{a.timestamp?.slice(0,19).replace("T"," ")}</p></div></div>))}</div>}
          </div></TabsContent>
        </Tabs>
      </div>

      {/* ===== DIALOGS ===== */}

      {/* CREATE USER */}
      <Dialog open={showCreateUser} onOpenChange={setShowCreateUser}><DialogContent className="rounded-2xl max-h-[85vh] overflow-y-auto" data-testid="create-user-dialog"><DialogHeader><DialogTitle className="font-heading">Create User</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs font-medium">Role</Label><Select value={createRole} onValueChange={v=>{setCreateRole(v);setUserForm({name:"",email:"",password:"",language:"",district:"",area:"",region_id:"",salary:0,incentive:0});}}><SelectTrigger className="rounded-xl" data-testid="create-role-select"><SelectValue/></SelectTrigger><SelectContent>{ROLE_OPTIONS.map(r=><SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs font-medium">Full Name</Label><Input value={userForm.name} onChange={e=>setUserForm(f=>({...f,name:e.target.value}))} placeholder="Enter full name" className="rounded-xl" data-testid="create-name-input"/></div>
          <div><Label className="text-xs font-medium">Email Address *</Label><Input value={userForm.email} onChange={e=>setUserForm(f=>({...f,email:e.target.value}))} placeholder="user@celestaglow.com" className="rounded-xl" data-testid="create-email-input"/></div>
          <div><Label className="text-xs font-medium">Phone Number * <span className="text-red-500">(required for calling)</span></Label><Input value={userForm.phone} onChange={e=>setUserForm(f=>({...f,phone:e.target.value}))} placeholder="10-digit mobile e.g. 9876543210" className="rounded-xl" data-testid="create-phone-input"/></div>
          <div><Label className="text-xs font-medium">Password</Label><Input type="text" value={userForm.password} onChange={e=>setUserForm(f=>({...f,password:e.target.value}))} placeholder="Leave empty for default" className="rounded-xl" data-testid="create-password-input"/></div>
          {createRole==="telecaller"&&<div><Label className="text-xs font-medium">Language(s)</Label><Input value={userForm.language} onChange={e=>setUserForm(f=>({...f,language:e.target.value}))} placeholder="Malayalam, Hindi, English..." className="rounded-xl" data-testid="create-language-input"/></div>}
          {(createRole==="agent"||createRole==="district_manager")&&<><div><Label className="text-xs font-medium">District</Label><Input value={userForm.district} onChange={e=>setUserForm(f=>({...f,district:e.target.value}))} placeholder="e.g. Ernakulam" className="rounded-xl"/></div>{createRole==="agent"&&<div><Label className="text-xs font-medium">Area</Label><Input value={userForm.area} onChange={e=>setUserForm(f=>({...f,area:e.target.value}))} placeholder="e.g. Kakkanad" className="rounded-xl"/></div>}<div><Label className="text-xs font-medium">Region</Label><Select value={userForm.region_id} onValueChange={v=>setUserForm(f=>({...f,region_id:v}))}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Select region"/></SelectTrigger><SelectContent>{regions.map(r=><SelectItem key={r.id} value={r.id}>{r.name} - {r.district}</SelectItem>)}</SelectContent></Select></div></>}
          <div className="grid grid-cols-2 gap-2"><div><Label className="text-xs font-medium">Salary (Rs./month)</Label><Input type="number" value={userForm.salary||""} onChange={e=>setUserForm(f=>({...f,salary:Number(e.target.value)}))} placeholder="Monthly salary" className="rounded-xl" data-testid="create-salary-input"/></div><div><Label className="text-xs font-medium">Incentive (Rs.)</Label><Input type="number" value={userForm.incentive||""} onChange={e=>setUserForm(f=>({...f,incentive:Number(e.target.value)}))} placeholder="Monthly incentive" className="rounded-xl" data-testid="create-incentive-input"/></div></div>
          <div className="grid grid-cols-2 gap-2"><div><Label className="text-xs font-medium">Date of Birth</Label><Input type="date" value={userForm.dob} onChange={e=>setUserForm(f=>({...f,dob:e.target.value}))} className="rounded-xl"/></div><div><Label className="text-xs font-medium">Joining Date</Label><Input type="date" value={userForm.joining_date} onChange={e=>setUserForm(f=>({...f,joining_date:e.target.value}))} className="rounded-xl"/></div></div>
          <div><Label className="text-xs font-medium">Address</Label><Textarea value={userForm.address} onChange={e=>setUserForm(f=>({...f,address:e.target.value}))} placeholder="Residential address" className="rounded-xl min-h-[60px]"/></div>
          <div><Label className="text-xs font-medium">Emergency Contact</Label><Input value={userForm.emergency_contact} onChange={e=>setUserForm(f=>({...f,emergency_contact:e.target.value}))} placeholder="Name & phone" className="rounded-xl"/></div>

          <div className="rounded-xl border border-[#E5E3DB] bg-[#F9F8F6] p-3 space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-[#3B5249]">Bank / Payment Details (optional — for salary)</p>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-[10px]">Account Holder Name</Label><Input value={userForm.bank_account_name} onChange={e=>setUserForm(f=>({...f,bank_account_name:e.target.value}))} placeholder="As per passbook" className="rounded-xl text-xs" data-testid="create-bank-name"/></div>
              <div><Label className="text-[10px]">Bank Name</Label><Input value={userForm.bank_name} onChange={e=>setUserForm(f=>({...f,bank_name:e.target.value}))} placeholder="e.g. SBI / HDFC" className="rounded-xl text-xs"/></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-[10px]">Account Number</Label><Input value={userForm.bank_account_number} onChange={e=>setUserForm(f=>({...f,bank_account_number:e.target.value}))} placeholder="A/C No." className="rounded-xl text-xs" data-testid="create-bank-acno"/></div>
              <div><Label className="text-[10px]">IFSC Code</Label><Input value={userForm.bank_ifsc} onChange={e=>setUserForm(f=>({...f,bank_ifsc:e.target.value.toUpperCase()}))} placeholder="ABCD0123456" className="rounded-xl text-xs uppercase" data-testid="create-bank-ifsc"/></div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label className="text-[10px]">UPI ID</Label><Input value={userForm.upi_id} onChange={e=>setUserForm(f=>({...f,upi_id:e.target.value}))} placeholder="name@bank" className="rounded-xl text-xs" data-testid="create-upi"/></div>
              <div><Label className="text-[10px]">PAN</Label><Input value={userForm.pan_number} onChange={e=>setUserForm(f=>({...f,pan_number:e.target.value.toUpperCase()}))} placeholder="ABCDE1234F" className="rounded-xl text-xs uppercase"/></div>
              <div><Label className="text-[10px]">Aadhaar</Label><Input value={userForm.aadhaar_number} onChange={e=>setUserForm(f=>({...f,aadhaar_number:e.target.value}))} placeholder="12-digit" className="rounded-xl text-xs"/></div>
            </div>
          </div>

          <Button onClick={handleCreateUser} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-create-user-btn">Create User</Button>
        </div>
      </DialogContent></Dialog>

      {/* EDIT USER */}
      <Dialog open={showEditUser} onOpenChange={setShowEditUser}><DialogContent className="rounded-2xl max-h-[88vh] overflow-y-auto" data-testid="edit-user-dialog"><DialogHeader><DialogTitle className="font-heading">Edit User — {selectedUser?.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="bg-[#F9F8F6] rounded-xl p-3 text-xs"><p><b>ID:</b> {selectedUser?.id}</p><p><b>Role:</b> {selectedUser?.role?.replace(/_/g," ")}</p></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs font-medium">Name</Label><Input value={editForm.name} onChange={e=>setEditForm(f=>({...f,name:e.target.value}))} className="rounded-xl" data-testid="edit-name-input"/></div>
            <div><Label className="text-xs font-medium">Phone</Label><Input value={editForm.phone} onChange={e=>setEditForm(f=>({...f,phone:e.target.value}))} className="rounded-xl"/></div>
          </div>
          <div><Label className="text-xs font-medium">Email</Label><Input value={editForm.email} onChange={e=>setEditForm(f=>({...f,email:e.target.value}))} className="rounded-xl"/></div>
          <div><Label className="text-xs font-medium flex items-center gap-1"><Key className="w-3 h-3"/>New Password (leave empty to keep current)</Label><Input type="text" value={editForm.password} onChange={e=>setEditForm(f=>({...f,password:e.target.value}))} placeholder="New password" className="rounded-xl" data-testid="edit-password-input"/></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs font-medium">Salary (Rs./month)</Label><Input type="number" value={editForm.salary||""} onChange={e=>setEditForm(f=>({...f,salary:e.target.value}))} className="rounded-xl"/></div>
            <div><Label className="text-xs font-medium">Incentive (Rs.)</Label><Input type="number" value={editForm.incentive||""} onChange={e=>setEditForm(f=>({...f,incentive:e.target.value}))} className="rounded-xl"/></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label className="text-xs font-medium">Language</Label><Input value={editForm.language} onChange={e=>setEditForm(f=>({...f,language:e.target.value}))} className="rounded-xl"/></div>
            <div><Label className="text-xs font-medium">District</Label><Input value={editForm.district} onChange={e=>setEditForm(f=>({...f,district:e.target.value}))} className="rounded-xl"/></div>
            <div><Label className="text-xs font-medium">Area</Label><Input value={editForm.area} onChange={e=>setEditForm(f=>({...f,area:e.target.value}))} className="rounded-xl"/></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs font-medium">Date of Birth</Label><Input type="date" value={editForm.dob} onChange={e=>setEditForm(f=>({...f,dob:e.target.value}))} className="rounded-xl"/></div>
            <div><Label className="text-xs font-medium">Joining Date</Label><Input type="date" value={editForm.joining_date} onChange={e=>setEditForm(f=>({...f,joining_date:e.target.value}))} className="rounded-xl"/></div>
          </div>
          <div><Label className="text-xs font-medium">Address</Label><Textarea value={editForm.address} onChange={e=>setEditForm(f=>({...f,address:e.target.value}))} className="rounded-xl min-h-[60px]"/></div>
          <div><Label className="text-xs font-medium">Emergency Contact</Label><Input value={editForm.emergency_contact} onChange={e=>setEditForm(f=>({...f,emergency_contact:e.target.value}))} placeholder="Name & phone" className="rounded-xl"/></div>

          <div className="rounded-xl border border-[#E5E3DB] bg-[#F9F8F6] p-3 space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-[#3B5249]">Bank / Payment Details</p>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-[10px]">Account Holder Name</Label><Input value={editForm.bank_account_name} onChange={e=>setEditForm(f=>({...f,bank_account_name:e.target.value}))} className="rounded-xl text-xs" data-testid="edit-bank-name"/></div>
              <div><Label className="text-[10px]">Bank Name</Label><Input value={editForm.bank_name} onChange={e=>setEditForm(f=>({...f,bank_name:e.target.value}))} className="rounded-xl text-xs"/></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-[10px]">Account Number</Label><Input value={editForm.bank_account_number} onChange={e=>setEditForm(f=>({...f,bank_account_number:e.target.value}))} className="rounded-xl text-xs" data-testid="edit-bank-acno"/></div>
              <div><Label className="text-[10px]">IFSC Code</Label><Input value={editForm.bank_ifsc} onChange={e=>setEditForm(f=>({...f,bank_ifsc:e.target.value.toUpperCase()}))} className="rounded-xl text-xs uppercase" data-testid="edit-bank-ifsc"/></div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label className="text-[10px]">UPI ID</Label><Input value={editForm.upi_id} onChange={e=>setEditForm(f=>({...f,upi_id:e.target.value}))} className="rounded-xl text-xs" data-testid="edit-upi"/></div>
              <div><Label className="text-[10px]">PAN</Label><Input value={editForm.pan_number} onChange={e=>setEditForm(f=>({...f,pan_number:e.target.value.toUpperCase()}))} className="rounded-xl text-xs uppercase"/></div>
              <div><Label className="text-[10px]">Aadhaar</Label><Input value={editForm.aadhaar_number} onChange={e=>setEditForm(f=>({...f,aadhaar_number:e.target.value}))} className="rounded-xl text-xs"/></div>
            </div>
          </div>

          <Button onClick={handleEditUser} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-edit-user-btn">Save Changes</Button>
        </div>
      </DialogContent></Dialog>

      {/* ADD EXPENSE */}
      <Dialog open={showExpense} onOpenChange={setShowExpense}><DialogContent className="rounded-2xl max-h-[88vh] overflow-y-auto"><DialogHeader><DialogTitle className="font-heading">Add Expense</DialogTitle></DialogHeader><div className="space-y-3">
        <div><Label className="text-xs font-medium">Expense Title</Label><Input placeholder="e.g. Office Supplies, Travel Reimbursement" value={expenseForm.title} onChange={e=>setExpenseForm(f=>({...f,title:e.target.value}))} className="rounded-xl" data-testid="expense-title-input"/></div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-xs font-medium">Amount (Rs.)</Label><Input type="number" placeholder="Enter amount" value={expenseForm.amount} onChange={e=>setExpenseForm(f=>({...f,amount:e.target.value}))} className="rounded-xl"/></div>
          <div><Label className="text-xs font-medium">Category</Label><Select value={expenseForm.category} onValueChange={v=>setExpenseForm(f=>({...f,category:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent>{["general","marketing","travel","office","salary","inventory","influencer_remuneration","reimbursement"].map(c=><SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g," ")}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <div><Label className="text-xs font-medium">Description</Label><Textarea placeholder="Details about this expense..." value={expenseForm.description} onChange={e=>setExpenseForm(f=>({...f,description:e.target.value}))} className="rounded-xl"/></div>

        <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-orange-700">To Be Paid To (optional)</p>
          <p className="text-[10px] text-[#59615D]">Use this when an employee paid from their own pocket and needs to be reimbursed. Leave empty if it&apos;s a regular company expense.</p>
          <div className="grid grid-cols-2 gap-2">
            <Select value={expenseForm.paid_to_user_id||"__none__"} onValueChange={v=>{
              if (v === "__none__") { setExpenseForm(f=>({...f,paid_to_user_id:"",paid_to_name:"",paid_to_phone:""})); return; }
              const u = allUsers.find(x=>x.id===v);
              setExpenseForm(f=>({...f,paid_to_user_id:v,paid_to_name:u?.name||"",paid_to_phone:u?.phone||""}));
            }}>
              <SelectTrigger className="rounded-xl text-xs" data-testid="exp-payee-select"><SelectValue placeholder="Pick an employee..."/></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="__none__">— None (regular expense) —</SelectItem>
                {allUsers.map(u=>(<SelectItem key={u.id} value={u.id}>{u.name} ({u.role?.replace(/_/g," ")})</SelectItem>))}
              </SelectContent>
            </Select>
            <Input placeholder="Or type name (non-employee)" value={expenseForm.paid_to_name} onChange={e=>setExpenseForm(f=>({...f,paid_to_name:e.target.value,paid_to_user_id:""}))} className="rounded-xl text-xs" data-testid="exp-payee-name"/>
          </div>
          {(expenseForm.paid_to_name||expenseForm.paid_to_user_id) && (
            <Input placeholder="Phone (optional)" value={expenseForm.paid_to_phone} onChange={e=>setExpenseForm(f=>({...f,paid_to_phone:e.target.value}))} className="rounded-xl text-xs"/>
          )}
        </div>

        <div><Label className="text-xs font-medium">Payment Proof (optional)</Label>
          <input type="file" accept="image/jpeg,image/png,image/webp" className="w-full text-xs border border-[#E5E3DB] rounded-xl p-2 file:mr-2 file:rounded-full file:border-0 file:bg-[#3B5249] file:text-white file:text-xs file:px-3 file:py-1" data-testid="expense-proof-input"
            onChange={async(e)=>{const f=e.target.files[0];if(!f)return;const fd=new FormData();fd.append("file",f);try{const{data}=await axios.post(`${API}/upload/payment-proof`,fd,{headers:{"Content-Type":"multipart/form-data"}});setExpenseForm(prev=>({...prev,proof_path:data.path}));toast.success("Proof uploaded!");}catch{toast.error("Upload failed");}}}/>
          {expenseForm.proof_path && <p className="text-xs text-[#6B8E6B] mt-1">Proof uploaded</p>}
        </div>
        <Button onClick={handleExpense} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-expense-btn">Add Expense</Button>
      </div></DialogContent></Dialog>

      {/* CREATE PAYROLL - clear labels */}
      <Dialog open={showPayroll} onOpenChange={setShowPayroll}><DialogContent className="rounded-2xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle className="font-heading">Create Payroll Record</DialogTitle></DialogHeader><div className="space-y-3">
        <div><Label className="text-xs font-medium">Select Employee</Label><Select value={payrollForm.user_id} onValueChange={v=>{const u=allUsers.find(x=>x.id===v);setPayrollForm(f=>({...f,user_id:v,user_name:u?.name||"",user_role:u?.role||""}));}}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Choose employee"/></SelectTrigger><SelectContent>{allUsers.filter(u=>u.role!=="admin").map(u=><SelectItem key={u.id} value={u.id}>{u.name} ({u.role?.replace(/_/g," ")})</SelectItem>)}</SelectContent></Select></div>
        <div className="grid grid-cols-2 gap-2"><div><Label className="text-xs font-medium">Month (1-12)</Label><Input placeholder="e.g. 4" value={payrollForm.month} onChange={e=>setPayrollForm(f=>({...f,month:e.target.value}))} className="rounded-xl"/></div><div><Label className="text-xs font-medium">Year</Label><Input placeholder="e.g. 2026" value={payrollForm.year} onChange={e=>setPayrollForm(f=>({...f,year:e.target.value}))} className="rounded-xl"/></div></div>
        <div><Label className="text-xs font-medium">Basic Salary (Rs.)</Label><Input type="number" placeholder="Enter basic salary" value={payrollForm.basic_salary} onChange={e=>setPayrollForm(f=>({...f,basic_salary:e.target.value}))} className="rounded-xl"/></div>
        <div><Label className="text-xs font-medium">Bonus (Rs.)</Label><Input type="number" placeholder="Bonus amount" value={payrollForm.bonus} onChange={e=>setPayrollForm(f=>({...f,bonus:e.target.value}))} className="rounded-xl"/></div>
        <div><Label className="text-xs font-medium">Deductions (Rs.)</Label><Input type="number" placeholder="Deduction amount" value={payrollForm.deductions} onChange={e=>setPayrollForm(f=>({...f,deductions:e.target.value}))} className="rounded-xl"/></div>
        <div><Label className="text-xs font-medium">Commission (Rs.)</Label><Input type="number" placeholder="Commission amount" value={payrollForm.commission} onChange={e=>setPayrollForm(f=>({...f,commission:e.target.value}))} className="rounded-xl"/></div>
        <div className="grid grid-cols-2 gap-2"><div><Label className="text-xs font-medium">Working Days</Label><Input type="number" placeholder="e.g. 26" value={payrollForm.working_days} onChange={e=>setPayrollForm(f=>({...f,working_days:e.target.value}))} className="rounded-xl"/></div><div><Label className="text-xs font-medium">Total Days in Month</Label><Input type="number" placeholder="e.g. 30" value={payrollForm.total_working_days} onChange={e=>setPayrollForm(f=>({...f,total_working_days:e.target.value}))} className="rounded-xl"/></div></div>
        <div className="bg-[#F9F8F6] rounded-xl p-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <p>Basic: <span className="font-medium">Rs.{Number(payrollForm.basic_salary)||0}</span></p>
            <p>Bonus: <span className="font-medium text-[#6B8E6B]">+Rs.{Number(payrollForm.bonus)||0}</span></p>
            <p>Deductions: <span className="font-medium text-[#B75D69]">-Rs.{Number(payrollForm.deductions)||0}</span></p>
            <p>Commission: <span className="font-medium">Rs.{Number(payrollForm.commission)||0}</span></p>
          </div>
          <div className="border-t border-[#E5E3DB] mt-2 pt-2 text-center">
            <p className="text-xs text-[#59615D] uppercase">Net Salary</p>
            <p className="font-heading text-xl font-bold text-[#3B5249]">Rs.{netSalary}</p>
          </div>
        </div>
        <Button onClick={handlePayroll} className="w-full rounded-full bg-[#3B5249] text-white">Create Payroll</Button>
      </div></DialogContent></Dialog>

      {/* ADD INVESTMENT */}
      <Dialog open={showInvestment} onOpenChange={setShowInvestment}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Add Investment</DialogTitle></DialogHeader><div className="space-y-3">
        <div><Label className="text-xs font-medium">Investment Title</Label><Input placeholder="e.g. Seed Round" value={investForm.title} onChange={e=>setInvestForm(f=>({...f,title:e.target.value}))} className="rounded-xl"/></div>
        <div><Label className="text-xs font-medium">Amount (Rs.)</Label><Input type="number" placeholder="Amount" value={investForm.amount} onChange={e=>setInvestForm(f=>({...f,amount:e.target.value}))} className="rounded-xl"/></div>
        <div><Label className="text-xs font-medium">Partner Type</Label><Select value={investForm.partner_type} onValueChange={v=>setInvestForm(f=>({...f,partner_type:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="main">Main Partner</SelectItem><SelectItem value="sub">Sub Partner</SelectItem></SelectContent></Select></div>
        <div><Label className="text-xs font-medium">Source / Investor</Label><Input placeholder="Name" value={investForm.source} onChange={e=>setInvestForm(f=>({...f,source:e.target.value}))} className="rounded-xl"/></div>
        <div><Label className="text-xs font-medium">Date</Label><Input type="date" value={investForm.date} onChange={e=>setInvestForm(f=>({...f,date:e.target.value}))} className="rounded-xl"/></div>
        <div><Label className="text-xs font-medium">Notes</Label><Textarea placeholder="Details..." value={investForm.notes} onChange={e=>setInvestForm(f=>({...f,notes:e.target.value}))} className="rounded-xl"/></div>
        <Button onClick={handleInvestment} className="w-full rounded-full bg-[#3B5249] text-white">Add Investment</Button>
      </div></DialogContent></Dialog>

      {/* HR MEMBER */}
      <Dialog open={showHrMember} onOpenChange={setShowHrMember}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Add HR Team Member</DialogTitle></DialogHeader><div className="space-y-3">
        <div><Label className="text-xs font-medium">Full Name</Label><Input placeholder="Enter name" value={hrForm.name} onChange={e=>setHrForm(f=>({...f,name:e.target.value}))} className="rounded-xl"/></div>
        <div><Label className="text-xs font-medium">Role Title</Label><Select value={hrForm.role_title} onValueChange={v=>setHrForm(f=>({...f,role_title:v}))}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Select role"/></SelectTrigger><SelectContent>{["Social Media Manager","Videographer","Editor","Content Strategist","In-house Telecaller"].map(r=><SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div>
        <div><Label className="text-xs font-medium">Email</Label><Input placeholder="Email address" value={hrForm.email} onChange={e=>setHrForm(f=>({...f,email:e.target.value}))} className="rounded-xl"/></div>
        <div><Label className="text-xs font-medium">Phone</Label><Input placeholder="Phone number" value={hrForm.phone} onChange={e=>setHrForm(f=>({...f,phone:e.target.value}))} className="rounded-xl"/></div>
        <div><Label className="text-xs font-medium">Department</Label><Input placeholder="e.g. Marketing, Content" value={hrForm.department} onChange={e=>setHrForm(f=>({...f,department:e.target.value}))} className="rounded-xl"/></div>
        <div><Label className="text-xs font-medium">Monthly Salary (Rs.)</Label><Input type="number" placeholder="Salary amount" value={hrForm.salary} onChange={e=>setHrForm(f=>({...f,salary:e.target.value}))} className="rounded-xl"/></div>
        <Button onClick={handleHrMember} className="w-full rounded-full bg-[#3B5249] text-white">Add Member</Button>
      </div></DialogContent></Dialog>

      {/* CONTENT */}
      <Dialog open={showContent} onOpenChange={setShowContent}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Track Content</DialogTitle></DialogHeader><div className="space-y-3">
        <div><Label className="text-xs font-medium">Content Title</Label><Input placeholder="e.g. Product Launch Reel" value={contentForm.title} onChange={e=>setContentForm(f=>({...f,title:e.target.value}))} className="rounded-xl"/></div>
        <div><Label className="text-xs font-medium">Type</Label><Select value={contentForm.type} onValueChange={v=>setContentForm(f=>({...f,type:v}))}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Select type"/></SelectTrigger><SelectContent>{["video","reel","post","story","blog","flyer","carousel"].map(t=><SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent></Select></div>
        <div><Label className="text-xs font-medium">Platform</Label><Select value={contentForm.platform} onValueChange={v=>setContentForm(f=>({...f,platform:v}))}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Select platform"/></SelectTrigger><SelectContent>{["instagram","youtube","facebook","tiktok"].map(p=><SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent></Select></div>
        <div><Label className="text-xs font-medium">Budget (Rs.)</Label><Input type="number" placeholder="Content budget" value={contentForm.budget} onChange={e=>setContentForm(f=>({...f,budget:e.target.value}))} className="rounded-xl"/></div>
        <div><Label className="text-xs font-medium">Status</Label><Select value={contentForm.status} onValueChange={v=>setContentForm(f=>({...f,status:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent>{["draft","in_progress","published"].map(s=><SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g," ")}</SelectItem>)}</SelectContent></Select></div>
        <Button onClick={handleContent} className="w-full rounded-full bg-[#3B5249] text-white">Add Content</Button>
      </div></DialogContent></Dialog>

      {/* STATE */}
      <Dialog open={showState} onOpenChange={setShowState}><DialogContent className="rounded-2xl max-h-[85vh] overflow-y-auto" data-testid="create-state-dialog"><DialogHeader><DialogTitle className="font-heading">Create State</DialogTitle></DialogHeader><div className="space-y-3">
        <div><Label className="text-xs font-medium">State Name</Label><Input value={stateForm.name} onChange={e=>setStateForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Kerala" className="rounded-xl" data-testid="state-name-input"/></div>
        <Button type="button" variant="outline" onClick={autoGenerateDistricts} disabled={stateLoading||!stateForm.name} className="w-full rounded-full text-xs" data-testid="auto-gen-districts-btn">{stateLoading?<Loader2 className="w-3 h-3 animate-spin mr-1"/>:<Sparkles className="w-3 h-3 mr-1"/>}Auto-Generate Districts (AI)</Button>
        <div><Label className="text-xs font-medium">Districts (comma separated)</Label><Textarea value={stateForm.districts} onChange={e=>setStateForm(f=>({...f,districts:e.target.value}))} placeholder="Ernakulam, Thrissur, Kottayam..." className="rounded-xl min-h-[80px]" data-testid="state-districts-input"/></div>
        <Button onClick={handleState} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-state-btn">Create State</Button>
      </div></DialogContent></Dialog>

      {/* PRODUCT */}
      <Dialog open={showProduct} onOpenChange={setShowProduct}><DialogContent className="rounded-2xl" data-testid="product-dialog"><DialogHeader><DialogTitle className="font-heading">{editingProduct?"Edit Product":"Add Product"}</DialogTitle></DialogHeader><div className="space-y-3">
        <div><Label className="text-xs font-medium">Product Name</Label><Input value={productForm.name} onChange={e=>setProductForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Celesta Glow SPF 50 Sunscreen" className="rounded-xl" data-testid="product-name-input"/></div>
        <div><Label className="text-xs font-medium">Category</Label><Select value={productForm.category} onValueChange={v=>setProductForm(f=>({...f,category:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="sunscreen">Sunscreen</SelectItem><SelectItem value="facewash">Face Wash</SelectItem><SelectItem value="bodylotion">Body Lotion</SelectItem><SelectItem value="serum">Serum</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs font-medium">Price (Rs.)</Label><Input type="number" value={productForm.price} onChange={e=>setProductForm(f=>({...f,price:e.target.value}))} placeholder="e.g. 599" className="rounded-xl" data-testid="product-price-input"/></div>
          <div><Label className="text-xs font-medium">Stock Quantity</Label><Input type="number" value={productForm.stock} onChange={e=>setProductForm(f=>({...f,stock:e.target.value}))} placeholder="e.g. 100" className="rounded-xl"/></div>
        </div>
        <div><Label className="text-xs font-medium">Description</Label><Textarea value={productForm.description} onChange={e=>setProductForm(f=>({...f,description:e.target.value}))} placeholder="Product description..." className="rounded-xl"/></div>
        <Button onClick={handleProduct} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-product-btn">{editingProduct?"Update Product":"Add Product"}</Button>
      </div></DialogContent></Dialog>

      {/* ADMIN FUND REQUEST */}
      <Dialog open={showFundRequest} onOpenChange={setShowFundRequest}><DialogContent className="rounded-2xl" data-testid="admin-fund-dialog"><DialogHeader><DialogTitle className="font-heading">Request Funds</DialogTitle></DialogHeader><div className="space-y-3">
        <div><Label className="text-xs font-medium">Amount (Rs.)</Label><Input type="number" value={fundForm.amount} onChange={e=>setFundForm(f=>({...f,amount:Number(e.target.value)}))} placeholder="Enter amount" className="rounded-xl" data-testid="admin-fund-amount"/></div>
        <div><Label className="text-xs font-medium">Category</Label><Select value={fundForm.category} onValueChange={v=>setFundForm(f=>({...f,category:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="general">General</SelectItem><SelectItem value="marketing">Marketing</SelectItem><SelectItem value="inventory">Inventory</SelectItem><SelectItem value="operations">Operations</SelectItem><SelectItem value="travel">Travel</SelectItem></SelectContent></Select></div>
        <div><Label className="text-xs font-medium">Reason / Purpose</Label><Textarea value={fundForm.reason} onChange={e=>setFundForm(f=>({...f,reason:e.target.value}))} placeholder="Explain why funds are needed..." className="rounded-xl" data-testid="admin-fund-reason"/></div>
        <Button onClick={handleFundRequest} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-fund-request-btn">Submit Request</Button>
      </div></DialogContent></Dialog>

      {/* FINANCE TRANSACTION */}
      <Dialog open={showFinTxn} onOpenChange={setShowFinTxn}><DialogContent className="rounded-2xl" data-testid="fin-txn-dialog"><DialogHeader><DialogTitle className="font-heading">Record Transaction</DialogTitle></DialogHeader><div className="space-y-3">
        <div><Label className="text-xs font-medium">Type</Label><Select value={finTxnForm.type} onValueChange={v=>setFinTxnForm(f=>({...f,type:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="credit">Credit (Money In)</SelectItem><SelectItem value="debit">Debit (Money Out)</SelectItem></SelectContent></Select></div>
        <div><Label className="text-xs font-medium">Amount (Rs.)</Label><Input type="number" value={finTxnForm.amount} onChange={e=>setFinTxnForm(f=>({...f,amount:Number(e.target.value)}))} placeholder="Enter amount" className="rounded-xl" data-testid="fin-txn-amount"/></div>
        <div><Label className="text-xs font-medium">Method</Label><Select value={finTxnForm.method} onValueChange={v=>setFinTxnForm(f=>({...f,method:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="bank">Bank</SelectItem></SelectContent></Select></div>
        <div><Label className="text-xs font-medium">Category</Label><Select value={finTxnForm.category} onValueChange={v=>setFinTxnForm(f=>({...f,category:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="manual">Manual Entry</SelectItem><SelectItem value="customer_payment">Customer Payment</SelectItem><SelectItem value="refund">Refund</SelectItem><SelectItem value="miscellaneous">Miscellaneous</SelectItem></SelectContent></Select></div>
        <div><Label className="text-xs font-medium">Description</Label><Input value={finTxnForm.description} onChange={e=>setFinTxnForm(f=>({...f,description:e.target.value}))} placeholder="e.g. Cash received from customer" className="rounded-xl" data-testid="fin-txn-desc"/></div>
        <Button onClick={handleFinTxn} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-fin-txn-btn">Record Transaction</Button>
      </div></DialogContent></Dialog>

      {/* FINANCE TRANSFER */}
      <Dialog open={showFinTransfer} onOpenChange={setShowFinTransfer}><DialogContent className="rounded-2xl" data-testid="fin-transfer-dialog"><DialogHeader><DialogTitle className="font-heading">Transfer Funds</DialogTitle></DialogHeader><div className="space-y-3">
        <div><Label className="text-xs font-medium">Direction</Label><Select value={finTransferForm.direction} onValueChange={v=>setFinTransferForm(f=>({...f,direction:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="cash_to_bank">Cash → Bank (Deposit)</SelectItem><SelectItem value="bank_to_cash">Bank → Cash (Withdraw)</SelectItem></SelectContent></Select></div>
        <div><Label className="text-xs font-medium">Amount (Rs.)</Label><Input type="number" value={finTransferForm.amount} onChange={e=>setFinTransferForm(f=>({...f,amount:Number(e.target.value)}))} placeholder="Transfer amount" className="rounded-xl" data-testid="fin-transfer-amount"/></div>
        <div className="bg-[#F9F8F6] rounded-xl p-3 text-xs">
          <p>Current Cash: <b>Rs.{finBalance.cash}</b> | Bank: <b>Rs.{finBalance.bank}</b></p>
        </div>
        <Button onClick={handleFinTransfer} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-fin-transfer-btn">Transfer</Button>
      </div></DialogContent></Dialog>

      {/* COMMISSION RATE EDITOR */}
      <Dialog open={showRateEditor} onOpenChange={setShowRateEditor}><DialogContent className="rounded-2xl" data-testid="rate-editor-dialog"><DialogHeader><DialogTitle className="font-heading">Edit Commission Rates</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-[#59615D]">Set commission percentage per category. Applied on order delivery.</p>
          <div><Label className="text-xs font-medium">Telecaller Commission (%)</Label><Input type="number" value={rateForm.telecaller} onChange={e=>setRateForm(f=>({...f,telecaller:Number(e.target.value)}))} className="rounded-xl" data-testid="rate-telecaller"/></div>
          <div><Label className="text-xs font-medium">Agent Commission (%)</Label><Input type="number" value={rateForm.agent} onChange={e=>setRateForm(f=>({...f,agent:Number(e.target.value)}))} className="rounded-xl" data-testid="rate-agent"/></div>
          <div><Label className="text-xs font-medium">District Manager Commission (%)</Label><Input type="number" value={rateForm.district_manager} onChange={e=>setRateForm(f=>({...f,district_manager:Number(e.target.value)}))} className="rounded-xl" data-testid="rate-manager"/></div>
          <div><Label className="text-xs font-medium">Sales Manager Commission (%)</Label><Input type="number" value={rateForm.sales_manager} onChange={e=>setRateForm(f=>({...f,sales_manager:Number(e.target.value)}))} className="rounded-xl" data-testid="rate-sales-manager"/></div>
          <div><Label className="text-xs font-medium">Asst District Manager (%)</Label><Input type="number" value={rateForm.assistant_district_manager} onChange={e=>setRateForm(f=>({...f,assistant_district_manager:Number(e.target.value)}))} className="rounded-xl"/></div>
          <div><Label className="text-xs font-medium">Asst Sales Manager (%)</Label><Input type="number" value={rateForm.assistant_sales_manager} onChange={e=>setRateForm(f=>({...f,assistant_sales_manager:Number(e.target.value)}))} className="rounded-xl"/></div>
          <div><Label className="text-xs font-medium">In-House Telecaller (%)</Label><Input type="number" value={rateForm.inhouse_telecaller} onChange={e=>setRateForm(f=>({...f,inhouse_telecaller:Number(e.target.value)}))} className="rounded-xl"/></div>
          <div><Label className="text-xs font-medium">DM gets from Asst DM (%)</Label><Input type="number" value={rateForm.dm_from_adm} onChange={e=>setRateForm(f=>({...f,dm_from_adm:Number(e.target.value)}))} className="rounded-xl"/></div>
          <div><Label className="text-xs font-medium">SM gets from Asst SM (%)</Label><Input type="number" value={rateForm.sm_from_asm} onChange={e=>setRateForm(f=>({...f,sm_from_asm:Number(e.target.value)}))} className="rounded-xl"/></div>
          <div className="bg-[#F9F8F6] rounded-xl p-3 text-xs"><p>TC {rateForm.telecaller}% | Agent {rateForm.agent}% | DM {rateForm.district_manager}%+{rateForm.dm_from_adm}% | SM {rateForm.sales_manager}%+{rateForm.sm_from_asm}% | Asst DM {rateForm.assistant_district_manager}% | Asst SM {rateForm.assistant_sales_manager}%</p></div>
          <Button onClick={async()=>{try{await axios.put(`${API}/config/commission-rates`,{rates:rateForm});toast.success("Commission rates updated!");setShowRateEditor(false);fetchData();}catch{toast.error("Failed");}}} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="save-rates-btn">Save Rates</Button>
        </div>
      </DialogContent></Dialog>

      {/* INSTRUCTION DIALOG */}
      <Dialog open={showInstruction} onOpenChange={setShowInstruction}><DialogContent className="rounded-2xl max-w-lg max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle className="font-heading">Create Instruction / Assign Task</DialogTitle></DialogHeader><div className="space-y-3">
        <div><Label className="text-xs font-medium">Title</Label><Input value={instrForm.title} onChange={e=>setInstrForm(f=>({...f,title:e.target.value}))} placeholder="Instruction title" className="rounded-xl"/></div>
        <div><Label className="text-xs font-medium">Content / Message</Label><Textarea value={instrForm.content} onChange={e=>setInstrForm(f=>({...f,content:e.target.value}))} placeholder="Write instruction details..." className="rounded-xl min-h-[100px]"/></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs font-medium">Target Role</Label><Select value={instrForm.target_role} onValueChange={v=>setInstrForm(f=>({...f,target_role:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All Staff</SelectItem><SelectItem value="telecaller">Telecallers</SelectItem><SelectItem value="agent">Agents</SelectItem><SelectItem value="district_manager">District Managers</SelectItem><SelectItem value="sales_manager">Sales Managers</SelectItem><SelectItem value="finance_manager">Finance Manager</SelectItem><SelectItem value="hr_manager">HR Manager</SelectItem><SelectItem value="inhouse_telecaller">In-House Telecallers</SelectItem><SelectItem value="content_strategist">Content Strategists</SelectItem><SelectItem value="content_developer">Content Developers</SelectItem><SelectItem value="social_media_manager">Social Media Managers</SelectItem><SelectItem value="inventory_manager">Inventory Manager</SelectItem><SelectItem value="digital_marketing_manager">Digital Marketing</SelectItem><SelectItem value="assistant_sales_manager">Asst. Sales Mgr</SelectItem><SelectItem value="assistant_district_manager">Asst. District Mgr</SelectItem></SelectContent></Select></div>
          <div><Label className="text-xs font-medium">Priority</Label><Select value={instrForm.priority} onValueChange={v=>setInstrForm(f=>({...f,priority:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div>
        </div>
        <div className="rounded-xl border border-[#E5E3DB] bg-[#F9F8F6] p-3 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3B5249]">Delivery Options</p>
          <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={instrForm.create_as_task} onChange={e=>setInstrForm(f=>({...f,create_as_task:e.target.checked}))} data-testid="instr-task-checkbox"/>Push to employee dashboard as a Task</label>
          <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={instrForm.send_email} onChange={e=>setInstrForm(f=>({...f,send_email:e.target.checked}))} data-testid="instr-email-checkbox"/>Send email notification to assignees</label>
          {instrForm.create_as_task && (
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div><Label className="text-[10px]">Due Date</Label><Input type="date" value={instrForm.due_date} onChange={e=>setInstrForm(f=>({...f,due_date:e.target.value}))} className="rounded-xl text-xs"/></div>
              <div><Label className="text-[10px]">From</Label><Input type="time" value={instrForm.from_time} onChange={e=>setInstrForm(f=>({...f,from_time:e.target.value}))} className="rounded-xl text-xs"/></div>
              <div><Label className="text-[10px]">To</Label><Input type="time" value={instrForm.to_time} onChange={e=>setInstrForm(f=>({...f,to_time:e.target.value}))} className="rounded-xl text-xs"/></div>
            </div>
          )}
          <p className="text-[10px] text-[#59615D]">Dashboard notification is always sent. Task & email are optional add-ons.</p>
        </div>
        <Button onClick={async()=>{if(!instrForm.title)return toast.error("Title required");try{const{data}=await axios.post(`${API}/instructions`,instrForm);const er=data.email_results||{};const parts=[`${data.target_users_count||0} recipients notified`];if(data.tasks_created)parts.push(`${data.tasks_created} task(s)`);if(er.sent)parts.push(`${er.sent} email(s) sent`);if(er.failed)parts.push(`${er.failed} email failed`);toast.success(parts.join(" • "));setShowInstruction(false);setInstrForm({title:"",content:"",target_role:"all",priority:"normal",create_as_task:false,send_email:false,due_date:"",from_time:"",to_time:""});fetchData();}catch(e){toast.error(e.response?.data?.detail||"Failed");}}} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="instr-send-btn">Send</Button>
      </div></DialogContent></Dialog>

      {/* DOCUMENT TEMPLATES EDITOR */}
      <Dialog open={showDocTemplates} onOpenChange={setShowDocTemplates}>
        <DialogContent className="rounded-2xl max-w-4xl max-h-[92vh] overflow-y-auto" data-testid="doc-templates-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">Document Templates Editor</DialogTitle>
            <p className="text-xs text-[#59615D] mt-1">Customise the HTML body for each HR letter. Use placeholders like {"{emp_name}, {position}, {salary}, {joining_date}, {department}, {effective_date}, {reason}, {today_date}, {company_name}"} — they will be auto-filled when the letter is sent.</p>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-1 space-y-1">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-[#59615D] mb-2">Template</p>
              {docTplKeys.map(t => {
                const isOverride = docTplOverrides.some(o => o.key === t.k);
                return (
                  <button key={t.k} onClick={()=>switchTplKey(t.k)} className={`w-full text-left text-xs px-3 py-2 rounded-xl border transition-all ${activeTplKey===t.k?"bg-[#3B5249] text-white border-[#3B5249]":"bg-white border-[#E5E3DB] hover:bg-[#F9F8F6]"}`} data-testid={`tpl-key-${t.k}`}>
                    <div className="flex justify-between items-center">
                      <span>{t.l}</span>
                      {isOverride && <span className={`text-[8px] px-1.5 py-0.5 rounded ${activeTplKey===t.k?"bg-white/20 text-white":"bg-orange-100 text-orange-700"}`}>CUSTOM</span>}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="md:col-span-3 space-y-3">
              <div>
                <Label className="text-xs font-medium">Subject (optional override)</Label>
                <Input value={tplForm.subject} onChange={e=>setTplForm(f=>({...f,subject:e.target.value}))} placeholder="Leave empty to use built-in subject" className="rounded-xl" data-testid="tpl-subject"/>
              </div>
              <div>
                <Label className="text-xs font-medium">Body HTML</Label>
                <Textarea value={tplForm.body_html} onChange={e=>setTplForm(f=>({...f,body_html:e.target.value}))} placeholder="<p>Dear {emp_name},</p><p>...</p>" className="rounded-xl font-mono text-xs min-h-[320px]" data-testid="tpl-body"/>
                <p className="text-[10px] text-[#59615D] mt-1">The system automatically wraps your HTML inside the company letterhead and footer with employment terms.</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button onClick={saveDocTemplate} disabled={tplLoading} className="rounded-full bg-[#3B5249] text-white" data-testid="tpl-save">{tplLoading?"Saving...":"Save Template"}</Button>
                <Button variant="outline" onClick={resetDocTemplate} className="rounded-full border-orange-300 text-orange-600" data-testid="tpl-reset">Revert to Default</Button>
                <Button variant="outline" onClick={()=>setShowDocTemplates(false)} className="rounded-full">Close</Button>
              </div>
              <div className="rounded-xl bg-[#F9F8F6] border border-[#E5E3DB] p-3">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-[#3B5249] mb-1">Available Placeholders</p>
                <p className="text-[11px] text-[#2C3531] font-mono leading-relaxed">{"{emp_name} {position} {salary} {incentive} {joining_date} {effective_date} {department} {reporting_to} {old_salary} {new_salary} {reason} {details} {today_date} {company_name} {company_email} {company_phone} {company_address} {work_hours} {weekly_off}"}</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* REVENUE ENTRY DIALOG */}
      <Dialog open={showRevEntry} onOpenChange={setShowRevEntry}><DialogContent className="rounded-2xl" data-testid="revenue-entry-dialog"><DialogHeader><DialogTitle className="font-heading">Add Revenue Entry</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Platform</Label><Select value={revForm.platform} onValueChange={v=>setRevForm(f=>({...f,platform:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="amazon">Amazon</SelectItem><SelectItem value="flipkart">Flipkart</SelectItem><SelectItem value="website">Website</SelectItem><SelectItem value="offline">Offline/Counter</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select></div>
          <div><Label className="text-xs">Sale Amount (Rs.)</Label><Input type="number" value={revForm.sale_amount} onChange={e=>setRevForm(f=>({...f,sale_amount:Number(e.target.value)}))} className="rounded-xl"/></div>
          <div><Label className="text-xs">Platform Fee/Commission (Rs.)</Label><Input type="number" value={revForm.platform_fee} onChange={e=>setRevForm(f=>({...f,platform_fee:Number(e.target.value)}))} className="rounded-xl"/></div>
          <div><Label className="text-xs">Shipping Cost (Rs.)</Label><Input type="number" value={revForm.shipping_cost} onChange={e=>setRevForm(f=>({...f,shipping_cost:Number(e.target.value)}))} className="rounded-xl"/></div>
          <div><Label className="text-xs">Settlement Charge (Rs.)</Label><Input type="number" value={revForm.settlement_charge} onChange={e=>setRevForm(f=>({...f,settlement_charge:Number(e.target.value)}))} className="rounded-xl"/></div>
          <div><Label className="text-xs">Order Reference</Label><Input value={revForm.order_ref} onChange={e=>setRevForm(f=>({...f,order_ref:e.target.value}))} placeholder="e.g. AMZ-12345" className="rounded-xl"/></div>
          <div><Label className="text-xs">Date</Label><Input type="date" value={revForm.date} onChange={e=>setRevForm(f=>({...f,date:e.target.value}))} className="rounded-xl"/></div>
          <div className="bg-[#F9F8F6] rounded-xl p-3 text-center"><p className="text-xs text-[#59615D]">Net Received</p><p className="font-heading text-lg font-bold text-[#3B5249]">Rs.{revForm.sale_amount - revForm.platform_fee - revForm.shipping_cost - revForm.settlement_charge}</p></div>
          <Button onClick={async()=>{try{await axios.post(`${API}/revenue-entries`,revForm);toast.success("Revenue entry added!");setShowRevEntry(false);fetchData();}catch(e){toast.error(e.response?.data?.detail||"Failed");}}} className="w-full rounded-full bg-[#3B5249] text-white">Add Entry</Button>
        </div>
      </DialogContent></Dialog>

      {/* CREATE ORDER DIALOG (Admin) */}
      <Dialog open={showOrderDlg} onOpenChange={setShowOrderDlg}><DialogContent className="rounded-2xl max-w-lg max-h-[92vh] overflow-y-auto" data-testid="admin-order-dialog"><DialogHeader><DialogTitle className="font-heading">Create Order (Admin)</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Customer Name *</Label><Input value={orderForm.customer_name} onChange={e=>setOrderForm(f=>({...f,customer_name:e.target.value}))} className="rounded-xl" data-testid="adm-order-name"/></div>
            <div><Label className="text-xs">Phone *</Label><Input value={orderForm.customer_phone} onChange={e=>setOrderForm(f=>({...f,customer_phone:e.target.value}))} className="rounded-xl" data-testid="adm-order-phone"/></div>
          </div>
          <div><Label className="text-xs text-[#B75D69] font-semibold">Full Delivery Address *</Label><Textarea rows={2} value={orderForm.customer_address} onChange={e=>setOrderForm(f=>({...f,customer_address:e.target.value}))} className="rounded-xl" placeholder="House, Street, Locality, City, Pincode" data-testid="adm-order-address"/></div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label className="text-xs">City</Label><Input value={orderForm.customer_city} onChange={e=>setOrderForm(f=>({...f,customer_city:e.target.value}))} className="rounded-xl"/></div>
            <div><Label className="text-xs">Pincode</Label><Input value={orderForm.customer_pincode} onChange={e=>setOrderForm(f=>({...f,customer_pincode:e.target.value}))} className="rounded-xl"/></div>
            <div><Label className="text-xs">Landmark</Label><Input value={orderForm.customer_landmark} onChange={e=>setOrderForm(f=>({...f,customer_landmark:e.target.value}))} className="rounded-xl"/></div>
          </div>
          <div>
            <Label className="text-xs">Products & Quantity</Label>
            <div className="space-y-1.5 max-h-44 overflow-y-auto border border-[#E5E3DB] rounded-xl p-2">
              {products.map(p => {
                const item = orderForm.items.find(i=>i.product_id===p.id);
                return (
                  <div key={p.id} className="flex items-center justify-between text-xs gap-2">
                    <span className="flex-1 truncate">{p.name} <span className="text-[#59615D]">(Rs.{p.price})</span></span>
                    {!item ? (
                      <Button size="sm" type="button" className="h-6 px-2 rounded-full bg-[#3B5249] text-white text-[10px]" onClick={()=>addOrderProduct(p)} data-testid={`adm-add-${p.id}`}><Plus className="w-3 h-3"/></Button>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button type="button" className="w-6 h-6 rounded-full border border-[#E5E3DB]" onClick={()=>setOrderQty(p.id, item.quantity-1)} data-testid={`adm-dec-${p.id}`}>−</button>
                        <Input type="number" value={item.quantity} onChange={e=>setOrderQty(p.id, e.target.value)} className="h-6 w-12 text-center text-[10px] rounded-md p-0" data-testid={`adm-qty-${p.id}`}/>
                        <button type="button" className="w-6 h-6 rounded-full border border-[#E5E3DB]" onClick={()=>setOrderQty(p.id, item.quantity+1)} data-testid={`adm-inc-${p.id}`}>+</button>
                        <span className="text-[#3B5249] font-semibold text-[10px] min-w-[55px] text-right">Rs.{p.price*item.quantity}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {orderForm.items.length>0 && (
              <div className="mt-2 bg-[#F9F8F6] rounded-lg p-2 flex justify-between items-center text-xs">
                <span className="text-[#59615D]">{orderForm.items.length} item(s), {orderForm.items.reduce((s,i)=>s+i.quantity,0)} qty</span>
                <span className="font-semibold text-[#3B5249]">Subtotal: Rs.{orderTotal}</span>
              </div>
            )}
          </div>
          <div><Label className="text-xs">Total Amount {orderTotal>0 && <span className="text-[10px] text-[#59615D]">(auto from products — edit clears items)</span>}</Label>
            <Input type="number" value={orderTotal>0?orderTotal:orderForm.total_amount} onChange={e=>setOrderForm(f=>({...f, total_amount:Number(e.target.value), items: orderTotal>0 ? [] : f.items}))} className="rounded-xl font-bold" data-testid="adm-order-total"/>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Payment</Label>
              <Select value={orderForm.payment_type} onValueChange={v=>setOrderForm(f=>({...f, payment_type:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="cod">COD</SelectItem><SelectItem value="upi">UPI</SelectItem><SelectItem value="online">Online</SelectItem></SelectContent></Select>
            </div>
            <div><Label className="text-xs">Credit Order To (optional)</Label>
              <Select value={orderForm.created_by} onValueChange={v=>setOrderForm(f=>({...f, created_by:v}))}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Self (Admin)"/></SelectTrigger><SelectContent>{allUsers.filter(u=>['telecaller','agent','sales_manager','district_manager'].includes(u.role)).map(u=>(<SelectItem key={u.id} value={u.id}>{u.name} ({u.role})</SelectItem>))}</SelectContent></Select>
            </div>
          </div>
          <Button onClick={submitAdminOrder} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="adm-order-submit">Create Order · Rs.{orderTotal>0?orderTotal:orderForm.total_amount||0}</Button>
        </div>
      </DialogContent></Dialog>

      {/* ORDER EDIT DIALOG */}
      {editOrder && <OrderEditDialog open={!!editOrder} onOpenChange={(o)=>{ if(!o) setEditOrder(null); }} order={editOrder} products={products} onSaved={()=>{ setEditOrder(null); fetchData(); }} />}

      {/* HARD RESET (48h) DIALOG */}
      <Dialog open={showHardReset} onOpenChange={setShowHardReset}><DialogContent className="rounded-2xl" data-testid="hard-reset-dialog"><DialogHeader><DialogTitle className="font-heading text-orange-700">⏱ Hard Reset — 48h Cooldown</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-xs text-[#59615D]">Schedules a full data reset (orders, leads, commissions, finance) <b>after a 48-hour cooldown</b>. Users + products are preserved. You can cancel anytime within those 48 hours.</p>
          {hardResetStatus?.pending && <HardResetCountdown executeAt={hardResetStatus.execute_at}/>}
          <Input type="password" placeholder="Master hard-reset password" value={hardResetPw} onChange={e=>setHardResetPw(e.target.value)} className="rounded-xl" data-testid="hard-reset-pw"/>
          <div className="flex gap-2">
            {!hardResetStatus?.pending && <Button onClick={async()=>{try{const{data}=await axios.post(`${API}/admin/hard-reset`,{password:hardResetPw});toast.success(data.message);setHardResetStatus({pending:true,execute_at:data.execute_at});setHardResetPw("");}catch(e){toast.error(e.response?.data?.detail||"Failed");}}} className="flex-1 rounded-full bg-orange-600 text-white" data-testid="hard-reset-schedule">Schedule 48h Reset</Button>}
            {hardResetStatus?.pending && <>
              <Button onClick={async()=>{try{await axios.post(`${API}/admin/hard-reset/cancel`);toast.success("Reset cancelled");setHardResetStatus({pending:false});}catch{toast.error("Failed");}}} variant="outline" className="flex-1 rounded-full" data-testid="hard-reset-cancel">Cancel</Button>
              <Button onClick={async()=>{try{await axios.post(`${API}/admin/hard-reset/execute`,{password:hardResetPw});toast.success("Data cleared!");setHardResetStatus({pending:false});setHardResetPw("");setShowHardReset(false);fetchData();}catch(e){toast.error(e.response?.data?.detail||"Failed");}}} className="flex-1 rounded-full bg-red-600 text-white" data-testid="hard-reset-execute">Execute Now</Button>
            </>}
          </div>
        </div>
      </DialogContent></Dialog>

      {/* INSTANT WIPE DIALOG (nuclear) */}
      <Dialog open={showInstantWipe} onOpenChange={setShowInstantWipe}><DialogContent className="rounded-2xl" data-testid="instant-wipe-dialog"><DialogHeader><DialogTitle className="font-heading text-red-700">🔥 Instant Wipe — Nuclear</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-900">
            <p className="font-semibold">⚠️ This permanently deletes:</p>
            <ul className="list-disc ml-5 mt-1 space-y-0.5">
              <li>All employees / users (admin is preserved)</li>
              <li>All orders, leads, commissions, payroll, finance ledger</li>
              <li>All products, regions, content, tasks, fund requests</li>
              <li>All notifications, attendance, leaves, complaints</li>
            </ul>
            <p className="font-semibold mt-2">Sample data will NOT be re-seeded after restart.</p>
          </div>
          <Input type="password" placeholder="Master hard-reset password" value={hardResetPw} onChange={e=>setHardResetPw(e.target.value)} className="rounded-xl" data-testid="instant-wipe-pw"/>
          <Button onClick={async()=>{if(!window.confirm("This is irreversible. Wipe everything except admin?"))return;try{const{data}=await axios.post(`${API}/admin/instant-wipe`,{password:hardResetPw});toast.success(data.message);setHardResetPw("");setShowInstantWipe(false);setTimeout(()=>window.location.reload(),1500);}catch(e){toast.error(e.response?.data?.detail||"Failed");}}} className="w-full rounded-full bg-red-600 text-white" data-testid="instant-wipe-confirm">🔥 WIPE EVERYTHING NOW</Button>
        </div>
      </DialogContent></Dialog>

      {/* CASCADE DELETE USER DIALOG */}
      <Dialog open={!!cascadeUser} onOpenChange={(o)=>{ if(!o){ setCascadeUser(null); setCascadePreview(null); } }}>
        <DialogContent className="rounded-2xl" data-testid="cascade-delete-dialog">
          <DialogHeader><DialogTitle className="font-heading text-red-700">Delete {cascadeUser?.name}?</DialogTitle></DialogHeader>
          {cascadePreview && <div className="space-y-3 text-sm">
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs">
              <p className="font-medium text-red-800">The following will be permanently deleted:</p>
              <ul className="list-disc ml-5 mt-2 space-y-0.5 text-red-900">
                <li>The user account itself</li>
                {Object.entries(cascadePreview.counts || {}).length === 0 ? <li className="text-[#59615D]">No related records</li> : Object.entries(cascadePreview.counts || {}).map(([k,v]) => <li key={k}><b>{v}</b> {k.replace(/_/g," ")}</li>)}
              </ul>
              {cascadePreview.counts?.child_agents && <p className="text-red-900 font-semibold mt-2">Plus {cascadePreview.counts.child_agents} agent users + ALL their data will be cascade-deleted.</p>}
              {cascadePreview.counts?.child_telecallers && <p className="text-red-900 font-semibold mt-2">Plus {cascadePreview.counts.child_telecallers} telecaller users + ALL their data will be cascade-deleted.</p>}
            </div>
            <Input type="password" placeholder="Enter master delete password" value={hardResetPw} onChange={e=>setHardResetPw(e.target.value)} className="rounded-xl" data-testid="cascade-delete-pw"/>
            <div className="flex gap-2">
              <Button variant="outline" onClick={()=>{setCascadeUser(null);setCascadePreview(null);setHardResetPw("");}} className="flex-1 rounded-full">Cancel</Button>
              <Button onClick={async()=>{try{const{data}=await axios.delete(`${API}/users/${cascadeUser.id}`,{data:{password:hardResetPw}});toast.success(`Deleted ${cascadeUser.name} + ${Object.values(data.cascade_counts||{}).reduce((a,b)=>a+b,0)} related records`);setCascadeUser(null);setCascadePreview(null);setHardResetPw("");fetchData();}catch(e){toast.error(e.response?.data?.detail||"Failed");}}} className="flex-1 rounded-full bg-red-600 text-white" data-testid="cascade-delete-confirm">Delete + Cascade</Button>
            </div>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Live countdown for the 48h hard reset window
function HardResetCountdown({ executeAt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const target = new Date(executeAt).getTime();
  const diff = Math.max(0, target - now);
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  return (
    <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-center" data-testid="hard-reset-countdown">
      <p className="text-[10px] uppercase text-orange-600">Auto-executes in</p>
      <p className="font-mono text-2xl font-bold text-orange-700">{h.toString().padStart(2,'0')}:{m.toString().padStart(2,'0')}:{s.toString().padStart(2,'0')}</p>
      <p className="text-[10px] text-orange-600 mt-1">at {new Date(executeAt).toLocaleString()}</p>
    </div>
  );
}
