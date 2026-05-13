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
import DailyTaskSheet from "@/components/DailyTaskSheet";
import EmployeeEfficiency from "@/components/EmployeeEfficiency";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, Loader2, Users, IndianRupee, Check, X, Calendar, Phone, Target, Plus, Mail, Send, FileText, AlertTriangle, CreditCard } from "lucide-react";
import RoleGuidelines from "../components/RoleGuidelines";
import AttendanceCheckIn from "../components/AttendanceCheckIn";
import NotificationBell from "../components/NotificationBell";
import GlobalSearch from "../components/GlobalSearch";
import DocumentTemplatesEditor from "../components/DocumentTemplatesEditor";

const API = "/api";
const MONTHS = [{v:"1",l:"Jan"},{v:"2",l:"Feb"},{v:"3",l:"Mar"},{v:"4",l:"Apr"},{v:"5",l:"May"},{v:"6",l:"Jun"},{v:"7",l:"Jul"},{v:"8",l:"Aug"},{v:"9",l:"Sep"},{v:"10",l:"Oct"},{v:"11",l:"Nov"},{v:"12",l:"Dec"}];

export default function HRManagerDashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const [employees, setEmployees] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [callLogs, setCallLogs] = useState([]);
  const [dailyGoals, setDailyGoals] = useState([]);
  const [commSummary, setCommSummary] = useState({agents:[]});
  const [allUsers, setAllUsers] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [communications, setCommunications] = useState([]);
  const [attendance, setAttendance] = useState([]);
  // Daily attendance view (one row per employee)
  const [attDate, setAttDate] = useState("");
  const [dailyAtt, setDailyAtt] = useState({rows:[],summary:{},can_set_logout:false,ist_now:"",logout_unlock_at:"17:30 IST"});
  const [monthlyAtt, setMonthlyAtt] = useState({summary:[],totals:{}});
  const [editingLogout, setEditingLogout] = useState(null); // user_id whose logout time is being edited
  const [logoutTimeInput, setLogoutTimeInput] = useState("");
  const [hiringCandidates, setHiringCandidates] = useState([]);
  const [employeeTasks, setEmployeeTasks] = useState([]);
  const [birthdays, setBirthdays] = useState({today:[],upcoming:[]});
  const [resignations, setResignations] = useState([]);
  const [hrCalls, setHrCalls] = useState([]);
  const [hrCallToday, setHrCallToday] = useState(0);
  const [forwardManagers, setForwardManagers] = useState({sales_managers:[],district_managers:[]});
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [showHRCall, setShowHRCall] = useState(false);
  const [showForward, setShowForward] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState(null);
  const [forwardingCandidate, setForwardingCandidate] = useState(null);
  const [candidateForm, setCandidateForm] = useState({name:"",phone:"",email:"",position:"telecaller",location:"",experience:"",qualification:"",skills:"",expected_salary:0,interview_date:"",interview_notes:"",source:"direct",status:"contacted",notes:""});
  const [hrCallForm, setHrCallForm] = useState({contact_name:"",phone:"",purpose:"candidate_followup",linked_candidate_id:"",duration_min:0,outcome:"contacted",next_action:"",next_action_date:"",notes:""});
  const [forwardForm, setForwardForm] = useState({target_user_id:"",target_role:"sales_manager",status:"interviewed"});
  const [loading, setLoading] = useState(true);
  const [payrollMonth, setPayrollMonth] = useState((new Date().getMonth()+1).toString());
  const [payrollYear, setPayrollYear] = useState(new Date().getFullYear().toString());
  const [showCreatePayroll, setShowCreatePayroll] = useState(false);
  const [showAdvance, setShowAdvance] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [showBulkEmail, setShowBulkEmail] = useState(false);
  const [showEditSalary, setShowEditSalary] = useState(false);
  const [showAttendance, setShowAttendance] = useState(false);
  const [showDocument, setShowDocument] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [salaryForm, setSalaryForm] = useState({salary:0,incentive:0});
  const [attForm, setAttForm] = useState({user_id:"",user_name:"",date:"",login_time:"09:30",logout_time:"18:00",status:"present"});
  const [docTemplate, setDocTemplate] = useState("");
  const [payrollForm, setPayrollForm] = useState({user_id:"",user_name:"",user_role:"",month:"",year:"",basic_salary:0,incentive:0,bonus:0,deductions:0,advance_deductions:0,commission:0,working_days:0,total_working_days:30});
  const [advForm, setAdvForm] = useState({user_id:"",user_name:"",user_role:"",amount:0,type:"advance",reason:"",method:"cash"});
  const [emailForm, setEmailForm] = useState({template:"custom",to_email:"",emp_name:"",subject:"",message:"",position:"",department:"",reporting_to:"",salary:0,incentive:0,joining_date:"",old_salary:0,new_salary:0,effective_date:"",reason:"",details:"",gender:""});
  const [bulkForm, setBulkForm] = useState({subject:"",message:"",selected:[]});
  // Employee Library (Add/Edit/Delete)
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [showEditEmp, setShowEditEmp] = useState(false);
  const [showDocTemplates, setShowDocTemplates] = useState(false);
  const [hiringFilter, setHiringFilter] = useState("all");
  // Final Hire flow — pick manager
  const [showFinalHire, setShowFinalHire] = useState(false);
  const [hireCandidate, setHireCandidate] = useState(null);
  const [hireMgrId, setHireMgrId] = useState("");
  const [salesManagers, setSalesManagers] = useState([]);
  const [districtManagers, setDistrictManagers] = useState([]);
  const [editingEmp, setEditingEmp] = useState(null);
  const [empForm, setEmpForm] = useState({name:"",email:"",password:"",role:"telecaller",salary:0,incentive:0,phone:"",district:"",area:"",bank_account_name:"",bank_account_number:"",bank_ifsc:"",bank_name:"",upi_id:"",pan_number:"",aadhaar_number:"",address:"",emergency_contact:"",dob:"",joining_date:"",managed_by:"",managed_by_name:"",managed_by_role:""});
  const [empSearch, setEmpSearch] = useState("");
  const [empRoleFilter, setEmpRoleFilter] = useState("all");

  const fetchData = useCallback(async () => {
    try {
      const [emp, pr, lv, cp, cl, dg] = await Promise.all([
        axios.get(`${API}/hr/employees`), axios.get(`${API}/payroll`),
        axios.get(`${API}/leaves`), axios.get(`${API}/complaints`),
        axios.get(`${API}/inhouse/call-logs`), axios.get(`${API}/inhouse/daily-goals`)
      ]);
      setEmployees(emp.data.employees); setPayroll(pr.data.payroll);
      setLeaves(lv.data.leaves); setComplaints(cp.data.complaints);
      setCallLogs(cl.data.call_logs); setDailyGoals(dg.data.goals);
      try { const [cs, au, adv, cm, att, hire, et, allcl, sms, dms] = await Promise.all([
        axios.get(`${API}/commissions/summary`).catch(()=>({data:{agents:[]}})),
        axios.get(`${API}/all-users`).catch(()=>({data:{users:[]}})),
        axios.get(`${API}/advances`).catch(()=>({data:{advances:[]}})),
        axios.get(`${API}/hr/communications`).catch(()=>({data:{communications:[]}})),
        axios.get(`${API}/attendance`).catch(()=>({data:{records:[]}})),
        axios.get(`${API}/hiring/candidates`).catch(()=>({data:{entries:[]}})),
        axios.get(`${API}/employee-tasks`).catch(()=>({data:{tasks:[]}})),
        axios.get(`${API}/call-logs/all`).catch(()=>({data:{call_logs:[]}})),
        axios.get(`${API}/sales-managers`).catch(()=>({data:{sales_managers:[]}})),
        axios.get(`${API}/managers`).catch(()=>({data:{managers:[]}}))
      ]);
        setCommSummary(cs.data); setAllUsers(au.data.users||[]);
        setAdvances(adv.data.advances||[]); setCommunications(cm.data.communications||[]);
        setAttendance(att.data.records||[]); setHiringCandidates(hire.data.entries||[]);
        setEmployeeTasks(et.data.tasks||[]);
        if (allcl.data.call_logs?.length) setCallLogs(allcl.data.call_logs);
        setSalesManagers(sms.data.sales_managers||[]);
        setDistrictManagers(dms.data.managers||[]);
      } catch {}
      try {
        const [bd, rg] = await Promise.all([
          axios.get(`${API}/employees/birthdays`).catch(()=>({data:{today:[],upcoming:[]}})),
          axios.get(`${API}/resignations`).catch(()=>({data:{resignations:[]}}))
        ]);
        setBirthdays(bd.data); setResignations(rg.data.resignations||[]);
      } catch {}
      try {
        const [hc, mgrs] = await Promise.all([
          axios.get(`${API}/hr/call-logs`).catch(()=>({data:{call_logs:[],today_count:0}})),
          axios.get(`${API}/hr/managers-for-forwarding`).catch(()=>({data:{sales_managers:[],district_managers:[]}}))
        ]);
        setHrCalls(hc.data.call_logs||[]); setHrCallToday(hc.data.today_count||0);
        setForwardManagers(mgrs.data);
      } catch {}
    } catch (err) { console.error(err); }
    setLoading(false);
  }, []);
  // Attendance helpers (declared before the useEffects that depend on them)
  const fetchDailyAtt = useCallback(async (d) => {
    try {
      const url = d ? `${API}/attendance/daily?date_filter=${d}` : `${API}/attendance/daily`;
      const { data } = await axios.get(url);
      setDailyAtt(data);
      if (!attDate && data.date) setAttDate(data.date);
    } catch { setDailyAtt({rows:[],summary:{},can_set_logout:false,ist_now:""}); }
  }, [attDate]);

  const fetchMonthlyAtt = useCallback(async () => {
    try {
      const m = payrollMonth==="all" ? (new Date().getMonth()+1).toString() : payrollMonth;
      const { data } = await axios.get(`${API}/attendance/monthly-summary?month=${m}&year=${payrollYear}`);
      setMonthlyAtt(data);
    } catch { setMonthlyAtt({summary:[],totals:{}}); }
  }, [payrollMonth, payrollYear]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchDailyAtt(attDate); }, [attDate, fetchDailyAtt]);
  useEffect(() => { fetchMonthlyAtt(); }, [fetchMonthlyAtt]);

  const approveLeave = async (id, status) => { try { await axios.put(`${API}/leaves/${id}/approve`, { status }); toast.success("Updated"); fetchData(); } catch { toast.error("Failed"); } };
  const resolveComplaint = async (id) => { try { await axios.put(`${API}/complaints/${id}`, { status: "resolved" }); toast.success("Resolved"); fetchData(); } catch { toast.error("Failed"); } };
  const processPayroll = async (id) => { try { await axios.put(`${API}/payroll/${id}/process`, {}); toast.success("Processed"); fetchData(); } catch { toast.error("Failed"); } };

  const handleCreatePayroll = async () => {
    if (!payrollForm.user_id) return toast.error("Select employee");
    try {
      await axios.post(`${API}/payroll`, {...payrollForm, basic_salary: Number(payrollForm.basic_salary), incentive: Number(payrollForm.incentive), bonus: Number(payrollForm.bonus), deductions: Number(payrollForm.deductions), advance_deductions: Number(payrollForm.advance_deductions), commission: Number(payrollForm.commission), working_days: Number(payrollForm.working_days), total_working_days: Number(payrollForm.total_working_days), total_hours: Number(payrollForm.total_hours || 0), hourly_rate: Number(payrollForm.hourly_rate || 0)});
      toast.success("Payroll created!"); setShowCreatePayroll(false); fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const handleAdvance = async () => {
    if (!advForm.user_id || !advForm.amount) return toast.error("Fill fields");
    try {
      await axios.post(`${API}/advances`, {...advForm, amount: Number(advForm.amount)});
      toast.success("Advance recorded"); setShowAdvance(false); setAdvForm({user_id:"",user_name:"",user_role:"",amount:0,type:"advance",reason:"",method:"cash"}); fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const handleSendEmail = async () => {
    if (!emailForm.to_email) return toast.error("Email required");
    try {
      await axios.post(`${API}/hr/send-email`, emailForm);
      toast.success("Email sent!"); setShowEmail(false); fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const handleBulkEmail = async () => {
    if (!bulkForm.selected.length) return toast.error("Select employees");
    try {
      const emails = bulkForm.selected.map(id => { const u = (allUsers.length>0?allUsers:employees).find(x=>x.id===id); return {name:u?.name||"",email:u?.email||""}; });
      await axios.post(`${API}/hr/bulk-email`, {emails, subject: bulkForm.subject, message: bulkForm.message});
      toast.success("Bulk email sent!"); setShowBulkEmail(false); setBulkForm({subject:"",message:"",selected:[]}); fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const handleEditSalary = async () => {
    if (!selectedEmp) return;
    try {
      await axios.put(`${API}/users/${selectedEmp.id}/update`, {salary: Number(salaryForm.salary), incentive: Number(salaryForm.incentive)});
      toast.success("Salary updated!"); setShowEditSalary(false); fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  // Map role -> create endpoint
  const ROLE_CREATE_PATH = {
    telecaller:"/telecallers", agent:"/agents", district_manager:"/managers",
    sales_manager:"/sales-managers", finance_manager:"/finance-managers",
    hr_manager:"/hr-managers", social_media_manager:"/social-media-managers",
    inhouse_telecaller:"/inhouse-telecallers", content_strategist:"/content-strategists",
    content_developer:"/content-developers", assistant_sales_manager:"/assistant-sales-managers",
    assistant_district_manager:"/assistant-district-managers", inventory_manager:"/inventory-managers",
    digital_marketing_manager:"/digital-marketing-managers"
  };

  const handleAddEmp = async () => {
    if (!empForm.name || !empForm.email) return toast.error("Name & email required");
    if (!empForm.phone || empForm.phone.trim().length < 7) return toast.error("Valid phone number required");
    const path = ROLE_CREATE_PATH[empForm.role];
    if (!path) return toast.error("Invalid role");
    try {
      const payload = {
        name: empForm.name, email: empForm.email,
        password: empForm.password || undefined,
        salary: Number(empForm.salary)||0, incentive: Number(empForm.incentive)||0,
        phone: empForm.phone, district: empForm.district, area: empForm.area,
        bank_account_name: empForm.bank_account_name, bank_account_number: empForm.bank_account_number,
        bank_ifsc: empForm.bank_ifsc, bank_name: empForm.bank_name, upi_id: empForm.upi_id,
        pan_number: empForm.pan_number, aadhaar_number: empForm.aadhaar_number,
        address: empForm.address, emergency_contact: empForm.emergency_contact,
        dob: empForm.dob, joining_date: empForm.joining_date,
      };
      await axios.post(`${API}${path}`, payload);
      toast.success("Employee created. Welcome email sent.");
      setShowAddEmp(false);
      setEmpForm({name:"",email:"",password:"",role:"telecaller",salary:0,incentive:0,phone:"",district:"",area:"",bank_account_name:"",bank_account_number:"",bank_ifsc:"",bank_name:"",upi_id:"",pan_number:"",aadhaar_number:"",address:"",emergency_contact:"",dob:"",joining_date:""});
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const handleEditEmp = async () => {
    if (!editingEmp) return;
    try {
      const payload = {
        name: empForm.name, email: empForm.email,
        salary: Number(empForm.salary)||0, incentive: Number(empForm.incentive)||0,
        phone: empForm.phone, district: empForm.district, area: empForm.area,
        bank_account_name: empForm.bank_account_name, bank_account_number: empForm.bank_account_number,
        bank_ifsc: empForm.bank_ifsc, bank_name: empForm.bank_name, upi_id: empForm.upi_id,
        pan_number: empForm.pan_number, aadhaar_number: empForm.aadhaar_number,
        address: empForm.address, emergency_contact: empForm.emergency_contact,
        dob: empForm.dob, joining_date: empForm.joining_date,
        managed_by: empForm.managed_by, managed_by_name: empForm.managed_by_name, managed_by_role: empForm.managed_by_role,
      };
      if (empForm.password) payload.password = empForm.password;
      await axios.put(`${API}/users/${editingEmp.id}/update`, payload);
      toast.success("Employee updated");
      setShowEditEmp(false); setEditingEmp(null);
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const handleDeleteEmp = async (emp) => {
    const confirmText = window.prompt(`Type DELETE to confirm removing ${emp.name}, then enter master password on next prompt:`);
    if (confirmText !== "DELETE") { if (confirmText !== null) toast.error("Cancelled"); return; }
    const pw = window.prompt(`Enter master password to delete ${emp.name}:`);
    if (!pw) return;
    try {
      await axios.delete(`${API}/users/${emp.id}`, { data: { password: pw } });
      toast.success(`${emp.name} deleted`);
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Delete failed"); }
  };

  // Attendance helpers (moved above)

  const markAtt = async (row, status, extra={}) => {
    const payload = {
      user_id: row.user_id, user_name: row.user_name, user_role: row.user_role,
      date: attDate, status,
      login_time: extra.login_time !== undefined ? extra.login_time : (row.login_time || (status==='present' || status==='half_day' ? '09:30' : '')),
      logout_time: extra.logout_time !== undefined ? extra.logout_time : (row.logout_time || '')
    };
    try {
      await axios.post(`${API}/attendance`, payload);
      toast.success("Marked");
      fetchDailyAtt(attDate); fetchMonthlyAtt();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const updateLogout = async (row) => {
    if (!logoutTimeInput) return toast.error("Pick a logout time");
    await markAtt(row, row.status === 'unmarked' ? 'present' : row.status, { logout_time: logoutTimeInput });
    setEditingLogout(null); setLogoutTimeInput("");
  };

  // Inline login-time editing state
  const [editingLogin, setEditingLogin] = useState(null);
  const [loginTimeInput, setLoginTimeInput] = useState("");
  const updateLoginTime = async (row) => {
    if (!loginTimeInput) return toast.error("Pick a login time");
    await markAtt(row, row.status === 'unmarked' || row.status === 'absent' || row.status === 'leave' ? 'present' : row.status, { login_time: loginTimeInput });
    setEditingLogin(null); setLoginTimeInput("");
  };

  const selectEmpForPayroll = async (v) => {
    const u = (allUsers.length>0?allUsers:employees).find(x=>x.id===v);
    if (!u) return;
    // Auto-fill base values immediately
    const pendingAdv = advances.filter(a=>a.user_id===v && a.status==="active" && !a.deducted_in_payroll);
    const advTotal = pendingAdv.reduce((s,a)=>s+a.amount,0);
    setPayrollForm(f=>({...f, user_id:v, user_name:u.name||"", user_role:u.role||"",
      basic_salary: u.salary||0, incentive: u.incentive||0, advance_deductions: advTotal}));
    // Fetch attendance-based suggestion for current payroll month/year
    try {
      const m = payrollForm.month || (new Date().getMonth()+1).toString();
      const y = payrollForm.year || new Date().getFullYear().toString();
      const { data } = await axios.get(`${API}/payroll/suggest/${v}`, { params: { month: m, year: y } });
      setPayrollForm(f => ({
        ...f,
        user_id: v, user_name: data.user_name || u.name || "", user_role: data.user_role || u.role || "",
        month: data.month, year: data.year,
        basic_salary: data.suggested_basic || u.salary || 0,
        incentive: data.incentive || u.incentive || 0,
        commission: data.commission || 0,
        advance_deductions: data.advance_deductions || advTotal,
        working_days: data.attendance?.working_days || 0,
        total_working_days: data.attendance?.total_working_days || 26,
        total_hours: data.attendance?.total_hours || 0,
        hourly_rate: data.hourly_rate || 0,
      }));
      toast.success(`Auto-filled from ${data.attendance?.total_hours || 0}h worked`);
    } catch (e) {
      // silent — keep base values
    }
  };

  const logout = () => { localStorage.clear(); navigate("/login"); };
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F9F8F6]"><Loader2 className="w-8 h-8 animate-spin text-[#3B5249]" /></div>;

  const filteredPayroll = payroll.filter(p => {
    if (payrollMonth && payrollMonth !== "all" && p.month !== payrollMonth) return false;
    if (payrollYear && payrollYear !== "all" && p.year !== payrollYear) return false;
    return true;
  });
  const filteredAdvances = advances.filter(a => {
    const m = a.created_at?.slice(5,7)?.replace(/^0/,"");
    const y = a.created_at?.slice(0,4);
    if (payrollMonth && payrollMonth !== "all" && m !== payrollMonth) return false;
    if (payrollYear && payrollYear !== "all" && y !== payrollYear) return false;
    return true;
  });

  const today = new Date().toISOString().slice(0, 10);
  const todayCallLogs = callLogs.filter(c => c.created_at?.slice(0, 10) === today);

  return (
    <div className="min-h-screen bg-[#F9F8F6]" data-testid="hr-manager-dashboard">
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#F9F8F6]/80 border-b border-[#E5E3DB]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div><h1 className="font-heading text-xl sm:text-2xl font-medium text-[#2C3531]">Celesta <span className="text-[#3B5249] font-semibold">Glow</span></h1><p className="text-xs text-[#59615D] uppercase tracking-[0.15em]">HR Manager - {user.name}</p></div>
          <div className="flex items-center gap-2">
            <GlobalSearch />
            <NotificationBell />
            <AttendanceCheckIn />
            <Button variant="outline" onClick={logout} className="rounded-full border-[#E5E3DB] text-sm" data-testid="logout-btn"><LogOut className="w-4 h-4 mr-1"/>Logout</Button>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <RoleGuidelines role="hr_manager" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-4"><Users className="w-4 h-4 text-[#3B5249] mb-1"/><p className="font-heading text-xl font-semibold">{employees.length}</p><p className="text-[10px] text-[#59615D] uppercase">Employees</p></div>
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-4"><IndianRupee className="w-4 h-4 text-[#A66E4E] mb-1"/><p className="font-heading text-xl font-semibold">{payroll.filter(p => p.status === "pending").length}</p><p className="text-[10px] text-[#59615D] uppercase">Pending Payroll</p></div>
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-4"><Calendar className="w-4 h-4 text-[#D4A373] mb-1"/><p className="font-heading text-xl font-semibold">{leaves.filter(l => l.status === "pending").length}</p><p className="text-[10px] text-[#59615D] uppercase">Leave Requests</p></div>
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-4"><CreditCard className="w-4 h-4 text-[#6B8E6B] mb-1"/><p className="font-heading text-xl font-semibold">Rs.{advances.filter(a=>a.status==="active"&&!a.deducted_in_payroll).reduce((s,a)=>s+a.amount,0)}</p><p className="text-[10px] text-[#59615D] uppercase">Pending Advances</p></div>
          <div className="bg-white rounded-xl border border-[#E5E3DB] p-4"><Phone className="w-4 h-4 text-[#6B8E6B] mb-1"/><p className="font-heading text-xl font-semibold">{todayCallLogs.length}</p><p className="text-[10px] text-[#59615D] uppercase">Calls Today</p></div>
        </div>

        {/* Month/Year Filter */}
        <div className="flex gap-2 mb-4 flex-wrap items-center">
          <span className="text-xs text-[#59615D] font-medium">Filter:</span>
          <div className="flex gap-1 flex-wrap">{MONTHS.map(m=>(
            <button key={m.v} onClick={()=>setPayrollMonth(m.v)} className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${payrollMonth===m.v?"bg-[#3B5249] text-white":"bg-white border border-[#E5E3DB] text-[#59615D] hover:bg-[#F9F8F6]"}`}>{m.l}</button>
          ))}
            <button onClick={()=>setPayrollMonth("all")} className={`px-2.5 py-1 rounded-full text-[10px] font-medium ${payrollMonth==="all"?"bg-[#3B5249] text-white":"bg-white border border-[#E5E3DB] text-[#59615D]"}`}>All</button>
          </div>
          <Select value={payrollYear} onValueChange={setPayrollYear}><SelectTrigger className="w-20 rounded-full text-xs h-7"><SelectValue/></SelectTrigger><SelectContent>{["2025","2026","2027"].map(y=><SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent></Select>
        </div>

        <Tabs defaultValue="employees" className="space-y-4">
          <TabsList className="bg-white border border-[#E5E3DB] rounded-full p-1 h-auto flex-wrap gap-0.5">
            {[{v:"employees",l:"Employees"},{v:"efficiency",l:"Efficiency"},{v:"mysheet",l:"My Sheet"},{v:"payroll",l:"Payroll"},{v:"attendance",l:"Attendance"},{v:"advances",l:"Advances"},{v:"commissions",l:"Commissions"},{v:"leaves",l:"Leaves"},{v:"birthdays",l:"Birthdays"},{v:"resignations",l:"Resignations"},{v:"complaints",l:`Complaints (${complaints.filter(c=>c.status!=='resolved').length})`},{v:"hiring",l:`Hiring (${hiringCandidates.filter(c=>c.status!=='hired'&&c.status!=='rejected').length})`},{v:"hrcalls",l:`My Calls (${hrCallToday})`},{v:"calllogs",l:"All Call Logs"},{v:"documents",l:"Documents"},{v:"tasksheets",l:"Task Sheets"},{v:"communication",l:"Comm."},{v:"monitoring",l:"Activity"}].map(t => (
              <TabsTrigger key={t.v} value={t.v} className="rounded-full text-[11px] data-[state=active]:bg-[#3B5249] data-[state=active]:text-white px-3" data-testid={`hr-tab-${t.v}`}>{t.l}</TabsTrigger>
            ))}
          </TabsList>

          {/* EMPLOYEES */}
          <TabsContent value="employees"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
              <h3 className="font-heading text-lg font-medium">Employee Library ({employees.length})</h3>
              <div className="flex gap-2 items-center flex-wrap">
                <Input placeholder="Search name/email" value={empSearch} onChange={e=>setEmpSearch(e.target.value)} className="rounded-full h-8 text-xs w-44" data-testid="emp-search-input"/>
                <Select value={empRoleFilter} onValueChange={setEmpRoleFilter}><SelectTrigger className="rounded-full h-8 text-xs w-36"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All Roles</SelectItem>{Object.keys({telecaller:1,agent:1,district_manager:1,sales_manager:1,finance_manager:1,hr_manager:1,social_media_manager:1,inhouse_telecaller:1,content_strategist:1,content_developer:1,assistant_sales_manager:1,assistant_district_manager:1,inventory_manager:1,digital_marketing_manager:1}).map(r=><SelectItem key={r} value={r} className="capitalize text-xs">{r.replace(/_/g," ")}</SelectItem>)}</SelectContent></Select>
                <Button size="sm" variant="outline" className="rounded-full text-xs border-[#3B5249] text-[#3B5249]" onClick={()=>setShowDocTemplates(true)} data-testid="hr-edit-templates-btn"><Plus className="w-3 h-3 mr-1"/>Edit Document Templates</Button>
                <Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={()=>{setEmpForm({name:"",email:"",password:"",role:"telecaller",salary:0,incentive:0,phone:"",district:"",area:"",bank_account_name:"",bank_account_number:"",bank_ifsc:"",bank_name:"",upi_id:"",pan_number:"",aadhaar_number:"",address:"",emergency_contact:"",dob:"",joining_date:""}); setShowAddEmp(true);}} data-testid="hr-add-emp-btn"><Plus className="w-3 h-3 mr-1"/>Add Employee</Button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {employees.filter(e=>{
                if (empRoleFilter!=="all" && e.role!==empRoleFilter) return false;
                if (empSearch && !((e.name||"").toLowerCase().includes(empSearch.toLowerCase())||(e.email||"").toLowerCase().includes(empSearch.toLowerCase()))) return false;
                return true;
              }).map(e => (
                <div key={e.id} className="border border-[#E5E3DB] rounded-xl p-3" data-testid={`emp-${e.id}`}>
                  <div className="flex justify-between items-start">
                    <div className="min-w-0 flex-1"><p className="font-heading font-medium text-sm truncate">{e.name}</p><p className="text-xs text-[#59615D] truncate">{e.email}</p>
                      {e.phone ? <a href={`tel:${e.phone}`} className="text-xs text-[#3B5249] underline inline-flex items-center gap-1 mt-0.5" data-testid={`emp-phone-${e.id}`}><Phone className="w-3 h-3"/>{e.phone}</a> : <p className="text-[10px] text-red-500 mt-0.5">⚠ No phone</p>}
                    </div>
                    <div className="flex gap-1 items-center shrink-0">
                      <Badge variant="outline" className="text-[9px] capitalize">{e.role?.replace(/_/g, " ")}</Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2 text-center">
                    <div className="bg-[#F9F8F6] rounded-lg p-1.5"><p className="text-[9px] text-[#59615D]">Salary</p><p className="font-semibold text-xs">Rs.{e.salary||0}</p></div>
                    <div className="bg-[#F9F8F6] rounded-lg p-1.5"><p className="text-[9px] text-[#59615D]">Incentive</p><p className="font-semibold text-xs">Rs.{e.incentive||0}</p></div>
                  </div>
                  {e.district && <p className="text-[10px] text-[#A66E4E] mt-1">{e.area ? `${e.area}, ` : ""}{e.district}</p>}
                  <div className="flex gap-1 mt-2 flex-wrap">
                    <Button size="sm" variant="outline" className="rounded-full text-[10px] h-6 px-2" onClick={()=>{setSelectedEmp(e);setSalaryForm({salary:e.salary||0,incentive:e.incentive||0});setShowEditSalary(true);}} data-testid={`edit-salary-${e.id}`}><IndianRupee className="w-3 h-3 mr-0.5"/>Salary</Button>
                    <Button size="sm" variant="outline" className="rounded-full text-[10px] h-6 px-2" onClick={()=>{setEditingEmp(e); setEmpForm({name:e.name||"",email:e.email||"",password:"",role:e.role||"telecaller",salary:e.salary||0,incentive:e.incentive||0,phone:e.phone||"",district:e.district||"",area:e.area||"",bank_account_name:e.bank_account_name||"",bank_account_number:e.bank_account_number||"",bank_ifsc:e.bank_ifsc||"",bank_name:e.bank_name||"",upi_id:e.upi_id||"",pan_number:e.pan_number||"",aadhaar_number:e.aadhaar_number||"",address:e.address||"",emergency_contact:e.emergency_contact||"",dob:e.dob||"",joining_date:e.joining_date||"",managed_by:e.managed_by||"",managed_by_name:e.managed_by_name||"",managed_by_role:e.managed_by_role||""}); setShowEditEmp(true);}} data-testid={`edit-emp-${e.id}`}>Edit</Button>
                    <Button size="sm" variant="outline" className="rounded-full text-[10px] h-6 px-2 text-red-600 border-red-200 hover:bg-red-50" onClick={()=>handleDeleteEmp(e)} data-testid={`delete-emp-${e.id}`}>Delete</Button>
                  </div>
                </div>
              ))}
            </div>
          </div></TabsContent>

          {/* PAYROLL */}
          <TabsContent value="payroll"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-heading text-lg font-medium">Payroll ({filteredPayroll.length} records)</h3>
              <Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={()=>{setPayrollForm({user_id:"",user_name:"",user_role:"",month:payrollMonth!=="all"?payrollMonth:"",year:payrollYear,basic_salary:0,incentive:0,bonus:0,deductions:0,advance_deductions:0,commission:0,working_days:0,total_working_days:30});setShowCreatePayroll(true);}} data-testid="create-payroll-btn"><Plus className="w-3 h-3 mr-1"/>Create Payroll</Button>
            </div>
            {filteredPayroll.length === 0 ? <p className="text-center py-6 text-[#59615D] text-sm">No payroll records</p> :
            <><div className="bg-[#F9F8F6] rounded-xl p-3 mb-3 text-center"><p className="text-xs text-[#59615D]">Total Salary</p><p className="font-heading text-xl font-bold text-[#3B5249]">Rs.{filteredPayroll.reduce((s,p)=>s+(p.net_salary||0),0)}</p></div>
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-[#F9F8F6]">{["Employee","Role","Period","Days","Hours","Rate/h","Basic","Incentive","Bonus","Ded.","Adv.Ded","Comm.","Net","Status",""].map(h => <th key={h} className="text-left p-2 text-[9px] uppercase text-[#59615D] whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[#E5E3DB]">{filteredPayroll.map(p => (<tr key={p.id}><td className="p-2 text-xs">{p.user_name}</td><td className="p-2"><Badge variant="outline" className="text-[8px] capitalize">{p.user_role?.replace(/_/g," ")}</Badge></td><td className="p-2 text-xs">{p.month}/{p.year}</td><td className="p-2 text-xs">{p.working_days||"-"}/{p.total_working_days||30}</td><td className="p-2 text-xs text-[#3B5249] font-medium">{p.total_hours||0}h</td><td className="p-2 text-xs text-[#A66E4E]">Rs.{p.hourly_rate||0}</td><td className="p-2 text-xs">Rs.{p.basic_salary}</td><td className="p-2 text-xs text-[#3B5249]">Rs.{p.incentive||0}</td><td className="p-2 text-xs text-[#6B8E6B]">+Rs.{p.bonus}</td><td className="p-2 text-xs text-[#B75D69]">-Rs.{p.deductions}</td><td className="p-2 text-xs text-[#B75D69]">-Rs.{p.advance_deductions||0}</td><td className="p-2 text-xs">Rs.{p.commission}</td><td className="p-2 text-xs font-semibold text-[#3B5249]">Rs.{p.net_salary}</td><td className="p-2"><Badge className={`text-[8px] ${p.status === "processed" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>{p.status}</Badge></td><td className="p-2">{p.status === "pending" && <Button size="sm" className="rounded-full text-[10px] bg-[#6B8E6B] text-white h-6" onClick={() => processPayroll(p.id)}>Process</Button>}</td></tr>))}</tbody></table></div></>}
          </div></TabsContent>

          {/* ADVANCES */}
          <TabsContent value="advances"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-heading text-lg font-medium">Advance Payments ({filteredAdvances.length})</h3>
              <Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={()=>setShowAdvance(true)} data-testid="add-advance-btn"><Plus className="w-3 h-3 mr-1"/>Record Advance</Button>
            </div>
            <div className="bg-[#F9F8F6] rounded-xl p-3 mb-3 grid grid-cols-2 gap-3 text-center">
              <div><p className="text-[10px] text-[#59615D] uppercase">Total Advanced</p><p className="font-heading text-lg font-bold text-[#B75D69]">Rs.{filteredAdvances.reduce((s,a)=>s+a.amount,0)}</p></div>
              <div><p className="text-[10px] text-[#59615D] uppercase">Pending Deduction</p><p className="font-heading text-lg font-bold text-[#D4A373]">Rs.{filteredAdvances.filter(a=>!a.deducted_in_payroll).reduce((s,a)=>s+a.amount,0)}</p></div>
            </div>
            {filteredAdvances.length === 0 ? <p className="text-center py-6 text-[#59615D] text-sm">No advances</p> :
            <div className="space-y-2">{filteredAdvances.map(a=>(
              <div key={a.id} className="border border-[#E5E3DB] rounded-xl p-3 flex justify-between items-center">
                <div><p className="font-medium text-sm">{a.user_name} <Badge variant="outline" className="text-[8px] capitalize">{a.type}</Badge></p><p className="text-xs text-[#59615D]">{a.reason} | {a.created_at?.slice(0,10)}</p></div>
                <div className="flex items-center gap-2">
                  <p className="font-heading font-semibold text-[#B75D69]">Rs.{a.amount}</p>
                  <Badge className={`text-[8px] ${a.deducted_in_payroll?"bg-green-100 text-green-800":"bg-yellow-100 text-yellow-800"}`}>{a.deducted_in_payroll?"Deducted":"Pending"}</Badge>
                  {!a.deducted_in_payroll && <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400" onClick={async()=>{try{await axios.delete(`${API}/advances/${a.id}`);toast.success("Removed");fetchData();}catch(e){toast.error(e.response?.data?.detail||"Failed");}}}><X className="w-3 h-3"/></Button>}
                </div>
              </div>
            ))}</div>}
          </div></TabsContent>

          {/* COMMISSIONS */}
          <TabsContent value="commissions"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <h3 className="font-heading text-lg font-medium mb-4">Commission Summary</h3>
            {commSummary.agents?.length===0?<p className="text-center py-6 text-[#59615D] text-sm">No commission data</p>:
            <div className="space-y-2">{commSummary.agents?.map(a=>(
              <div key={a.user_id} className="border border-[#E5E3DB] rounded-xl p-3 flex justify-between items-center">
                <div><p className="font-heading font-medium text-sm">{a.user_name}</p><Badge variant="outline" className="text-[9px] capitalize">{a.user_role?.replace(/_/g," ")}</Badge></div>
                <div className="text-right"><p className="font-heading font-semibold text-[#3B5249]">Total: Rs.{a.total}</p><p className="text-[10px]">Week: Rs.{a.weekly} | Month: Rs.{a.monthly}</p></div>
              </div>
            ))}</div>}
          </div></TabsContent>

          {/* ATTENDANCE — HR-only, daily card grid + month totals (IST) */}
          <TabsContent value="attendance"><div className="space-y-4">
            <div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <div>
                  <h3 className="font-heading text-lg font-medium">Daily Attendance</h3>
                  <p className="text-[10px] text-[#59615D]">All marking is HR-only • IST {dailyAtt.ist_now || "—"} • Logout time unlocks at {dailyAtt.logout_unlock_at || "17:30 IST"} {!dailyAtt.can_set_logout && attDate === new Date().toISOString().slice(0,10) && <span className="text-[#A66E4E] font-medium">🔒 Locked</span>}{dailyAtt.can_set_logout && <span className="text-[#6B8E6B] font-medium">🔓 Unlocked</span>}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-[#59615D]">Date:</Label>
                  <Input type="date" value={attDate} onChange={e=>setAttDate(e.target.value)} className="rounded-full h-8 text-xs w-36" data-testid="att-date-picker"/>
                  <Button size="sm" variant="outline" className="rounded-full text-[10px] h-8" onClick={()=>setAttDate(new Date().toISOString().slice(0,10))}>Today</Button>
                </div>
              </div>
              {/* Today summary */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4" data-testid="today-attendance-summary">
                <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-center"><p className="text-[9px] text-green-700 uppercase">Present</p><p className="font-heading text-lg font-bold text-green-800">{dailyAtt.summary?.present||0}</p></div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 text-center"><p className="text-[9px] text-yellow-700 uppercase">Half Day</p><p className="font-heading text-lg font-bold text-yellow-800">{dailyAtt.summary?.half_day||0}</p></div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-center"><p className="text-[9px] text-blue-700 uppercase">On Leave</p><p className="font-heading text-lg font-bold text-blue-800">{dailyAtt.summary?.leave||0}</p></div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-center"><p className="text-[9px] text-red-700 uppercase">Absent</p><p className="font-heading text-lg font-bold text-red-800">{dailyAtt.summary?.absent||0}</p></div>
                <div className="bg-[#F9F8F6] border border-[#E5E3DB] rounded-lg p-2 text-center"><p className="text-[9px] text-[#59615D] uppercase">Unmarked</p><p className="font-heading text-lg font-bold text-[#A66E4E]">{dailyAtt.summary?.unmarked||0}</p></div>
              </div>
              {/* Daily card grid */}
              {dailyAtt.rows?.length === 0 ? <p className="text-center py-8 text-[#59615D] text-sm">Loading employees…</p> :
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="att-card-grid">
                {dailyAtt.rows?.map(r => {
                  const statusColors = {
                    present: "bg-green-50 border-green-300 text-green-800",
                    half_day: "bg-yellow-50 border-yellow-300 text-yellow-800",
                    leave: "bg-blue-50 border-blue-300 text-blue-800",
                    absent: "bg-red-50 border-red-300 text-red-800",
                    unmarked: "bg-[#F9F8F6] border-[#E5E3DB] text-[#59615D]",
                  };
                  const cls = statusColors[r.status] || statusColors.unmarked;
                  return (
                    <div key={r.user_id} className={`rounded-xl border-2 p-3 transition-all ${cls}`} data-testid={`att-card-${r.user_id}`}>
                      <div className="flex justify-between items-start mb-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-heading font-medium text-sm truncate">{r.user_name}</p>
                          <p className="text-[10px] capitalize opacity-75">{(r.user_role||"").replace(/_/g," ")}</p>
                        </div>
                        <Badge className="text-[9px] capitalize font-semibold border bg-white/60">{r.status.replace("_"," ")}</Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-center mb-2">
                        <button
                          type="button"
                          onClick={() => { setEditingLogin(r.user_id); setLoginTimeInput(r.login_time || '09:30'); setEditingLogout(null); }}
                          className="bg-white/60 rounded p-1 hover:bg-white transition cursor-pointer text-left"
                          data-testid={`set-login-${r.user_id}`}
                          title="Click to set login time"
                        >
                          <p className="text-[8px] uppercase flex items-center justify-center gap-0.5">In {!r.login_time && <span className="text-[#A66E4E]">✏</span>}</p>
                          <p className="text-xs font-semibold">{r.login_time || "—"}</p>
                        </button>
                        <div className="bg-white/60 rounded p-1"><p className="text-[8px] uppercase">Out</p><p className="text-xs font-semibold">{r.logout_time || "—"}</p></div>
                        <div className="bg-white/60 rounded p-1"><p className="text-[8px] uppercase">Hours</p><p className="text-xs font-semibold">{r.hours_worked || 0}h</p></div>
                      </div>
                      {editingLogin === r.user_id && (
                        <div className="mb-2 flex items-center gap-1 bg-white/90 rounded-lg p-1.5 border border-[#3B5249]/30">
                          <Input type="time" value={loginTimeInput} onChange={e => setLoginTimeInput(e.target.value)} className="rounded h-6 text-[10px] w-24" data-testid={`login-input-${r.user_id}`} />
                          <Button size="sm" className="rounded-full text-[9px] h-6 px-2 bg-[#3B5249] text-white" onClick={() => updateLoginTime(r)} data-testid={`login-save-${r.user_id}`}>Save</Button>
                          <Button size="sm" variant="ghost" className="text-[9px] h-6 px-2" onClick={() => { setEditingLogin(null); setLoginTimeInput(""); }}>×</Button>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" className="rounded-full text-[9px] h-6 px-2 bg-green-600 hover:bg-green-700 text-white" onClick={()=>markAtt(r,'present',{login_time:'09:30'})} data-testid={`mark-present-${r.user_id}`}>Present</Button>
                        <Button size="sm" variant="outline" className="rounded-full text-[9px] h-6 px-2" onClick={()=>markAtt(r,'half_day',{login_time:'09:30'})} data-testid={`mark-half-${r.user_id}`}>Half</Button>
                        <Button size="sm" variant="outline" className="rounded-full text-[9px] h-6 px-2" onClick={()=>markAtt(r,'leave',{login_time:''})} data-testid={`mark-leave-${r.user_id}`}>Leave</Button>
                        <Button size="sm" variant="outline" className="rounded-full text-[9px] h-6 px-2 text-red-600 border-red-200 hover:bg-red-50" onClick={()=>markAtt(r,'absent',{login_time:''})} data-testid={`mark-absent-${r.user_id}`}>Absent</Button>
                      </div>
                      {(r.status==='present'||r.status==='half_day') && (
                        editingLogout === r.user_id ? (
                          <div className="mt-2 flex items-center gap-1 bg-white/80 rounded-lg p-1.5">
                            <Input type="time" value={logoutTimeInput} onChange={e=>setLogoutTimeInput(e.target.value)} className="rounded h-6 text-[10px] w-24" data-testid={`logout-input-${r.user_id}`}/>
                            <Button size="sm" className="rounded-full text-[9px] h-6 px-2 bg-[#3B5249] text-white" onClick={()=>updateLogout(r)} data-testid={`logout-save-${r.user_id}`}>Save</Button>
                            <Button size="sm" variant="ghost" className="text-[9px] h-6 px-2" onClick={()=>{setEditingLogout(null);setLogoutTimeInput("");}}>×</Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" className="rounded-full text-[9px] h-6 px-2 mt-2 w-full" disabled={!dailyAtt.can_set_logout} onClick={()=>{setEditingLogout(r.user_id);setLogoutTimeInput(r.logout_time||'18:00');}} data-testid={`update-logout-${r.user_id}`} title={!dailyAtt.can_set_logout ? `Unlocks at ${dailyAtt.logout_unlock_at}` : "Set / update logout time"}>
                            {dailyAtt.can_set_logout ? "🔓 " : "🔒 "}{r.logout_time ? "Update Logout" : "Set Logout"}
                          </Button>
                        )
                      )}
                      {r.marked_by_name && <p className="text-[8px] opacity-60 mt-1">Marked by: {r.marked_by_name}</p>}
                    </div>
                  );
                })}
              </div>}
            </div>

            {/* MONTH SUMMARY */}
            <div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
              <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                <div>
                  <h3 className="font-heading text-lg font-medium">Monthly Total Hours</h3>
                  <p className="text-[10px] text-[#59615D]">Filter by Month / Year above (top of page) • Total: <b>{monthlyAtt.totals?.total_hours||0}h</b> across all employees · {monthlyAtt.totals?.total_present||0} present-days</p>
                </div>
              </div>
              {monthlyAtt.summary?.length === 0 ? <p className="text-center py-6 text-[#59615D] text-sm">No attendance records this month</p> :
              <div className="overflow-x-auto"><table className="w-full text-xs" data-testid="monthly-att-table">
                <thead><tr className="border-b bg-[#F9F8F6]">{["Employee","Role","Present","Half","Leave","Absent","Marked","Total Hours"].map(h=><th key={h} className="p-2 text-left text-[9px] uppercase">{h}</th>)}</tr></thead>
                <tbody>{monthlyAtt.summary?.map(s=>(
                  <tr key={s.user_id} className="border-b border-[#E5E3DB] hover:bg-[#F9F8F6]" data-testid={`month-att-${s.user_id}`}>
                    <td className="p-2 font-medium">{s.user_name}</td>
                    <td className="p-2 capitalize text-[10px]">{(s.user_role||"").replace(/_/g," ")}</td>
                    <td className="p-2"><Badge className="bg-green-100 text-green-800 text-[8px]">{s.present_days}</Badge></td>
                    <td className="p-2"><Badge className="bg-yellow-100 text-yellow-800 text-[8px]">{s.half_days}</Badge></td>
                    <td className="p-2"><Badge className="bg-blue-100 text-blue-800 text-[8px]">{s.leave_days}</Badge></td>
                    <td className="p-2"><Badge className="bg-red-100 text-red-800 text-[8px]">{s.absent_days}</Badge></td>
                    <td className="p-2 text-[10px]">{s.marked_days}</td>
                    <td className="p-2 font-heading font-semibold text-[#3B5249]">{s.total_hours}h</td>
                  </tr>
                ))}</tbody>
              </table></div>}
            </div>
          </div></TabsContent>

          {/* HIRING — Full feature: add, edit, forward, hire/reject */}
          <TabsContent value="hiring"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <div className="flex justify-between mb-3 flex-wrap gap-2"><h3 className="font-heading text-lg font-medium">Hiring Pipeline ({hiringCandidates.length})</h3>
              <Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={()=>{setEditingCandidate(null);setCandidateForm({name:"",phone:"",email:"",position:"telecaller",location:"",experience:"",qualification:"",skills:"",expected_salary:0,interview_date:"",interview_notes:"",source:"direct",status:"contacted",notes:""});setShowAddCandidate(true);}} data-testid="hr-add-candidate-btn">+ Add Candidate</Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2 mb-4">
              {[{l:"Total",v:hiringCandidates.length,k:"all"},{l:"Contacted",v:hiringCandidates.filter(c=>c.status==='contacted').length,k:"contacted"},{l:"Not Answering",v:hiringCandidates.filter(c=>c.status==='not_answering').length,k:"not_answering"},{l:"Interested",v:hiringCandidates.filter(c=>c.status==='interested').length,k:"interested"},{l:"Interviewed",v:hiringCandidates.filter(c=>c.status==='interviewed').length,k:"interviewed"},{l:"Selected",v:hiringCandidates.filter(c=>c.status==='selected').length,k:"selected"},{l:"Forwarded",v:hiringCandidates.filter(c=>c.forwarded_to).length,k:"forwarded"}].map(s=>(
                <button key={s.l} onClick={()=>setHiringFilter(s.k)} data-testid={`hf-${s.k}`} className={`rounded-lg p-2 text-center transition-all ${hiringFilter===s.k?"bg-[#3B5249] text-white shadow-sm":"bg-[#F9F8F6] hover:bg-[#E5E3DB]"}`}><p className={`text-[9px] uppercase ${hiringFilter===s.k?"text-white/80":"text-[#59615D]"}`}>{s.l}</p><p className="font-heading text-lg font-bold">{s.v}</p></button>
              ))}
            </div>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-[10px] text-[#59615D] font-medium uppercase">Filter by Status:</span>
              <Select value={hiringFilter} onValueChange={setHiringFilter}>
                <SelectTrigger className="w-44 h-8 text-xs rounded-full" data-testid="hiring-status-filter"><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Candidates</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="not_answering">Not Answering</SelectItem>
                  <SelectItem value="no_response">No Response</SelectItem>
                  <SelectItem value="interested">Interested</SelectItem>
                  <SelectItem value="not_interested">Not Interested</SelectItem>
                  <SelectItem value="callback">Callback Required</SelectItem>
                  <SelectItem value="interviewed">Interviewed</SelectItem>
                  <SelectItem value="selected">Selected</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="forwarded">Forwarded to Manager</SelectItem>
                  <SelectItem value="hired">Hired</SelectItem>
                </SelectContent>
              </Select>
              {hiringFilter !== "all" && <Button size="sm" variant="outline" className="rounded-full text-[10px] h-7" onClick={()=>setHiringFilter("all")}>Clear</Button>}
            </div>
            {(() => {
              const list = hiringFilter === "all" ? hiringCandidates :
                hiringFilter === "forwarded" ? hiringCandidates.filter(c=>c.forwarded_to) :
                hiringCandidates.filter(c=>c.status === hiringFilter);
              return list.length===0?<p className="text-center py-6 text-[#59615D] text-sm">{hiringFilter==="all"?"No candidates yet":`No candidates with status "${hiringFilter.replace(/_/g," ")}"`}</p>:
              <div className="space-y-2" data-testid="hr-hiring-list">{list.map(c=>(
              <div key={c.id} className="border border-[#E5E3DB] rounded-xl p-3" data-testid={`hr-cand-${c.id}`}>
                <div className="flex justify-between items-start gap-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap"><p className="font-medium text-sm">{c.name}</p>
                      <Badge variant="outline" className="text-[8px] capitalize">{c.position}</Badge>
                      <Badge className={`text-[8px] capitalize ${c.status==='hired'?'bg-green-100 text-green-800':c.status==='rejected'||c.status==='not_interested'?'bg-red-100 text-red-800':c.status==='selected'?'bg-blue-100 text-blue-800':c.status==='interviewed'?'bg-purple-100 text-purple-800':c.status==='not_answering'||c.status==='no_response'?'bg-orange-100 text-orange-800':c.status==='callback'?'bg-cyan-100 text-cyan-800':'bg-yellow-100 text-yellow-800'}`}>{(c.status||"").replace(/_/g," ")}</Badge>
                      {c.forwarded_to && <Badge className="text-[8px] bg-pink-100 text-pink-800">→ {c.forwarded_to_name}</Badge>}
                      {c.manager_selected_by_name && <Badge className="text-[9px] bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold" data-testid={`mgr-selected-${c.id}`}>✓ Selected by {c.manager_selected_by_name}</Badge>}
                    </div>
                    <p className="text-[10px] text-[#59615D] mt-1">📞 <a href={`tel:${c.phone}`} className="text-[#3B5249] underline">{c.phone}</a> {c.email&&`✉ ${c.email}`} {c.location&&`📍 ${c.location}`}</p>
                    {(c.experience||c.qualification||c.skills) && <p className="text-[10px] text-[#59615D]">{c.experience&&`Exp: ${c.experience}`}{c.qualification&&` | ${c.qualification}`}{c.skills&&` | Skills: ${c.skills}`}</p>}
                    {c.expected_salary>0 && <p className="text-[10px] text-[#A66E4E]">Expected: Rs.{c.expected_salary}/mo</p>}
                    {c.interview_date && <p className="text-[10px] text-blue-700">📅 Interview: {c.interview_date}</p>}
                    {c.forwarded_to && <p className="text-[10px] text-pink-700 font-medium bg-pink-50 inline-block px-2 py-0.5 rounded mt-0.5" data-testid={`forwarded-info-${c.id}`}>→ Forwarded to <b>{c.forwarded_to_name}</b>{c.forwarded_role && <span className="font-normal"> ({(c.forwarded_role||'').replace(/_/g,' ')})</span>}{c.forwarded_at && <span className="text-pink-500 font-normal"> · {String(c.forwarded_at).slice(0,10)}</span>}</p>}
                    {c.manager_selected_by_name && <p className="text-[10px] text-emerald-700 font-medium mt-0.5">✓ Recommended by {c.manager_selected_by_name} ({(c.manager_selected_by_role||'').replace(/_/g,' ')}) — awaiting your final hire approval</p>}
                    {c.notes && <p className="text-[10px] text-[#59615D] italic mt-0.5">&quot;{c.notes}&quot;</p>}
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    <Select value={c.status} onValueChange={async(v)=>{try{await axios.put(`${API}/hiring/candidates/${c.id}`,{status:v});toast.success("Updated");fetchData();}catch{toast.error("Failed");}}}>
                      <SelectTrigger className="h-6 w-32 text-[9px] rounded-full" data-testid={`status-${c.id}`}><SelectValue/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="contacted" className="text-xs">Contacted</SelectItem>
                        <SelectItem value="not_answering" className="text-xs">Not Answering</SelectItem>
                        <SelectItem value="no_response" className="text-xs">No Response</SelectItem>
                        <SelectItem value="interested" className="text-xs">Interested</SelectItem>
                        <SelectItem value="not_interested" className="text-xs">Not Interested</SelectItem>
                        <SelectItem value="callback" className="text-xs">Callback Required</SelectItem>
                        <SelectItem value="interviewed" className="text-xs">Interviewed</SelectItem>
                        <SelectItem value="selected" className="text-xs">Selected</SelectItem>
                        <SelectItem value="rejected" className="text-xs">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="rounded-full text-[9px] h-6" onClick={()=>{setHrCallForm(f=>({...f,contact_name:c.name,phone:c.phone,linked_candidate_id:c.id,purpose:"candidate_followup"}));setShowHRCall(true);}} data-testid={`call-${c.id}`}><Phone className="w-2.5 h-2.5 mr-1"/>Log Call</Button>
                      <Button size="sm" variant="outline" className="rounded-full text-[9px] h-6" onClick={()=>{setEditingCandidate(c);setCandidateForm({name:c.name,phone:c.phone,email:c.email||"",position:c.position,location:c.location||"",experience:c.experience||"",qualification:c.qualification||"",skills:c.skills||"",expected_salary:c.expected_salary||0,interview_date:c.interview_date||"",interview_notes:c.interview_notes||"",source:c.source||"direct",status:c.status,notes:c.notes||""});setShowAddCandidate(true);}} data-testid={`edit-${c.id}`}>Edit</Button>
                      <Button size="sm" className="rounded-full text-[9px] h-6 bg-pink-600 text-white" onClick={()=>{setForwardingCandidate(c);setForwardForm({target_user_id:"",target_role:c.position==='agent'?'district_manager':'sales_manager',status:c.status==='contacted'?'interviewed':c.status});setShowForward(true);}} data-testid={`forward-${c.id}`}>Forward</Button>
                      {c.status !== 'hired' && <Button size="sm" variant="outline" className="rounded-full text-[9px] h-6 text-red-600 border-red-200 hover:bg-red-50" onClick={async()=>{if(!window.confirm(`Delete candidate "${c.name}"? This cannot be undone.`))return;try{await axios.delete(`${API}/hiring/candidates/${c.id}`);toast.success("Candidate deleted");fetchData();}catch(e){toast.error(e.response?.data?.detail||"Failed");}}} data-testid={`delete-${c.id}`}>🗑</Button>}
                    </div>
                    {c.status==='selected' && <Button size="sm" className="rounded-full text-[10px] h-7 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm" onClick={()=>{setHireCandidate(c); setHireMgrId(c.manager_selected_by||""); setShowFinalHire(true);}} data-testid={`hire-${c.id}`}>✓ Final Hire</Button>}
                    {c.status!=='selected' && c.status!=='hired' && c.status!=='rejected' && <p className="text-[9px] text-[#A66E4E] italic">Awaiting manager selection</p>}
                  </div>
                </div>
              </div>
            ))}</div>;
            })()}
          </div></TabsContent>

          {/* HR CALL LOGS — HR's own calls */}
          <TabsContent value="hrcalls"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <div className="flex justify-between mb-3"><h3 className="font-heading text-lg font-medium">My HR Calls ({hrCalls.length} total | Today: {hrCallToday})</h3>
              <Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={()=>{setHrCallForm({contact_name:"",phone:"",purpose:"candidate_followup",linked_candidate_id:"",duration_min:0,outcome:"contacted",next_action:"",next_action_date:"",notes:""});setShowHRCall(true);}} data-testid="hr-log-call-btn"><Phone className="w-3 h-3 mr-1"/>Log Call</Button>
            </div>
            {hrCalls.length===0?<p className="text-center py-6 text-[#59615D] text-sm">No calls logged. Use "Log Call" or click 📞 next to a candidate.</p>:
              <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b bg-[#F9F8F6]">{["Date","Contact","Phone","Purpose","Outcome","Duration","Next Action","Notes"].map(h=><th key={h} className="p-2 text-left text-[9px] uppercase">{h}</th>)}</tr></thead>
                <tbody>{hrCalls.map(l=>(
                  <tr key={l.id} className="border-b border-[#E5E3DB]" data-testid={`hrcall-${l.id}`}>
                    <td className="p-2">{l.call_date}</td>
                    <td className="p-2 font-medium">{l.contact_name}</td>
                    <td className="p-2"><a href={`tel:${l.phone}`} className="text-[#3B5249] underline">{l.phone}</a></td>
                    <td className="p-2"><Badge variant="outline" className="text-[8px] capitalize">{(l.purpose||"").replace(/_/g," ")}</Badge></td>
                    <td className="p-2"><Badge className={`text-[8px] capitalize ${l.outcome==='accepted_offer'||l.outcome==='scheduled_interview'?'bg-green-100 text-green-800':l.outcome==='rejected_offer'?'bg-red-100 text-red-800':'bg-yellow-100 text-yellow-800'}`}>{(l.outcome||"").replace(/_/g," ")}</Badge></td>
                    <td className="p-2">{l.duration_min}min</td>
                    <td className="p-2 text-[10px]">{l.next_action} {l.next_action_date&&`(${l.next_action_date})`}</td>
                    <td className="p-2 text-[10px]">{(l.notes||"").slice(0,50)}</td>
                  </tr>
                ))}</tbody></table></div>}
          </div></TabsContent>

          {/* CALL LOGS UNIFIED */}
          <TabsContent value="calllogs"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <div className="flex justify-between mb-4"><h3 className="font-heading text-lg font-medium">All Call Logs (Telecaller + Agent + In-House + HR)</h3>
              <Button size="sm" variant="outline" className="rounded-full text-xs" onClick={async()=>{try{const r=await axios.get(`${API}/call-logs/all`); setCallLogs(r.data.call_logs||[]); toast.success(`Loaded ${r.data.call_logs?.length||0} logs`);}catch{toast.error("Failed");}}}>Refresh</Button>
            </div>
            {callLogs.length === 0 ? <p className="text-center py-6 text-[#59615D] text-sm">No call logs. Click Refresh to fetch all.</p> :
              <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b bg-[#F9F8F6]">{["Date","Type","Caller","Contact","Phone","Status","Notes"].map(h=><th key={h} className="p-2 text-left text-[9px] uppercase">{h}</th>)}</tr></thead>
                <tbody>{callLogs.slice(0,200).map((c,i)=>(
                  <tr key={c.id||i} className="border-b border-[#E5E3DB]"><td className="p-2">{(c.created_at||c.call_date||'').slice(0,10)}</td><td className="p-2"><Badge variant="outline" className="text-[8px]">{c.type||c.call_type||'-'}</Badge></td><td className="p-2">{c.caller_name||c.user_name||'-'}</td><td className="p-2 font-medium">{c.contact_name||c.influencer_name||'-'}</td><td className="p-2">{c.phone||'-'}</td><td className="p-2">{c.status||'-'}</td><td className="p-2 text-[10px]">{(c.details||c.notes||'').slice(0,60)}</td></tr>
                ))}</tbody></table></div>}
          </div></TabsContent>

          {/* DOCUMENTS */}
          <TabsContent value="documents"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
              <div>
                <h3 className="font-heading text-lg font-medium">HR Document Templates</h3>
                <p className="text-[11px] text-[#59615D]">Click any letter to send it. Use <b>Edit Templates</b> to customise the wording — once edited, your version will be sent to the candidate (not the default).</p>
              </div>
              <Button size="sm" className="rounded-full bg-[#3B5249] hover:bg-[#4F6B60] text-white shadow-sm" onClick={()=>setShowDocTemplates(true)} data-testid="hr-edit-templates-btn-top">
                <FileText className="w-4 h-4 mr-1"/>Edit Templates
              </Button>
            </div>
            <div className="bg-[#F4ECD2]/30 border-l-4 border-[#A66E4E] rounded-xl p-3 mb-4 flex items-start gap-3">
              <FileText className="w-5 h-5 text-[#A66E4E] mt-0.5 shrink-0"/>
              <div className="flex-1 text-xs text-[#2C3531]">
                <p className="font-semibold text-[#A66E4E] mb-0.5">Customise letter content</p>
                <p>Click <b>&quot;Edit Templates&quot;</b> above to open the template editor. You can edit the subject and body of each letter (Offer, Employment, Increment, Termination etc.) using placeholders like {"{emp_name}, {position}, {salary}"}. The customised version is automatically used when you send that letter to a candidate or employee.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              {[
                {t:"welcome",l:"Welcome / Appointment Letter",desc:"New employee welcome with company introduction, salary, joining date"},
                {t:"offer",l:"Offer Letter",desc:"Formal job offer with position, salary, benefits, terms"},
                {t:"employment",l:"Employment Confirmation",desc:"Official confirmation post probation completion"},
                {t:"agreement",l:"Employment Agreement",desc:"Work agreement with confidentiality, IP, non-compete clauses"},
                {t:"increment",l:"Increment / Salary Revision",desc:"Salary revision letter with old/new compensation details"},
                {t:"warning",l:"Warning Letter",desc:"Official warning with incident details, improvement required"},
                {t:"termination",l:"Termination Letter",desc:"Notice of termination with reason, effective date, settlement"},
                {t:"relieving",l:"Relieving Letter",desc:"Confirmation of relieving from duties, last working day"},
                {t:"experience",l:"Experience Certificate",desc:"Work experience certification with role, duration, performance"},
                {t:"custom",l:"Custom Communication",desc:"Free-form letter on official letterhead"}
              ].map(d=>(
                <div key={d.t} className="bg-[#F9F8F6] rounded-xl p-3 hover:shadow-md transition-all border border-transparent hover:border-[#E5E3DB]" data-testid={`doc-${d.t}`}>
                  <FileText className="w-4 h-4 text-[#3B5249] mb-1"/>
                  <p className="text-[10px] font-medium">{d.l}</p>
                  <p className="text-[8px] text-[#59615D] mt-0.5">{d.desc}</p>
                  <div className="flex gap-1 mt-2">
                    <Button size="sm" variant="outline" className="rounded-full text-[9px] h-6 px-2 flex-1 border-[#3B5249] text-[#3B5249]" onClick={()=>{setShowDocTemplates(true);}} data-testid={`edit-doc-${d.t}`}>Edit</Button>
                    <Button size="sm" className="rounded-full text-[9px] h-6 px-2 flex-1 bg-[#3B5249] text-white" onClick={()=>{setEmailForm(f=>({...f,template:d.t,to_email:"",emp_name:""}));setShowEmail(true);}} data-testid={`send-doc-${d.t}`}>Send</Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-[#F9F8F6] rounded-xl p-3 text-xs text-[#59615D] space-y-0.5">
              <p className="font-medium mb-1 text-[#3B5249]">All letters print on official Veegal Enterprises LLP letterhead with auto-included terms:</p>
              <p>• <b>Work Hours:</b> 9:30 AM – 5:30 PM (Mon–Sat)</p>
              <p>• <b>Break Time:</b> 1 hour total — Lunch 40 min + Tea 20 min (morning &amp; evening)</p>
              <p>• <b>Friday:</b> Extra 30 minutes break</p>
              <p>• <b>Weekly Off:</b> Sunday</p>
              <p>• <b>Probation:</b> 3 months · <b>Notice Period:</b> 30 days</p>
              <p>• <b>Leave:</b> 12 CL + 12 SL + 12 EL per annum (pro-rata)</p>
              <p>• <b>Company:</b> Veegal Enterprises LLP, Cherutti Road, Calicut, Kerala 673032</p>
              <p>• <b>Contact:</b> +91 94461 25745 · manager@celestaglow.com</p>
            </div>
          </div></TabsContent>

          {/* TASK SHEETS */}
          <TabsContent value="efficiency"><EmployeeEfficiency /></TabsContent>

          <TabsContent value="mysheet"><DailyTaskSheet titleSuffix="HR Manager" /></TabsContent>

          <TabsContent value="tasksheets"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <h3 className="font-heading text-lg font-medium mb-4">Employee Task Sheets</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(allUsers.length>0?allUsers:employees).filter(u=>u.role!=='admin').map(u=>{
                const userTasks = employeeTasks.filter(t=>t.user_id===u.id);
                const completed = userTasks.filter(t=>t.status==='completed').length;
                return(
                  <div key={u.id} className="border border-[#E5E3DB] rounded-xl p-3">
                    <div className="flex justify-between items-start mb-2"><div><p className="font-medium text-xs">{u.name}</p><Badge variant="outline" className="text-[8px] capitalize">{u.role?.replace(/_/g," ")}</Badge></div><p className="text-[10px] text-[#6B8E6B]">{completed}/{userTasks.length} done</p></div>
                    {userTasks.length>0&&<div className="w-full bg-[#E5E3DB] rounded-full h-1 mb-2"><div className="bg-[#3B5249] h-1 rounded-full" style={{width:`${userTasks.length?Math.round(completed/userTasks.length*100):0}%`}}/></div>}
                    <div className="space-y-1 max-h-24 overflow-y-auto">{userTasks.slice(0,5).map(t=>(<div key={t.id} className="flex justify-between text-[10px]"><span>{t.title}</span><Badge className={`text-[7px] ${t.status==='completed'?'bg-green-100 text-green-800':'bg-yellow-100 text-yellow-800'}`}>{t.status}</Badge></div>))}</div>
                  </div>
                );
              })}
            </div>
          </div></TabsContent>

          {/* LEAVES */}
          <TabsContent value="leaves"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <h3 className="font-heading text-lg font-medium mb-4">Leave Requests</h3>
            {leaves.length === 0 ? <p className="text-center py-6 text-[#59615D] text-sm">No leave requests</p> :
            <div className="space-y-2">{leaves.map(l => (
              <div key={l.id} className="border border-[#E5E3DB] rounded-xl p-3 flex flex-col sm:flex-row justify-between gap-2">
                <div><p className="font-medium text-sm">{l.user_name} <Badge variant="outline" className="text-[9px] capitalize">{l.type || l.leave_type}</Badge></p><p className="text-xs text-[#59615D]">{l.start_date || l.from_date} to {l.end_date || l.to_date} | {l.reason}</p></div>
                <div className="flex gap-2 items-center"><Badge className={`text-[9px] ${l.status === "approved" ? "bg-green-100 text-green-800" : l.status === "rejected" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}`}>{l.status}</Badge>
                  {l.status === "pending" && <><Button size="sm" className="rounded-full text-xs bg-[#6B8E6B] text-white h-7" onClick={() => approveLeave(l.id, "approved")}><Check className="w-3 h-3"/></Button><Button size="sm" variant="outline" className="rounded-full text-xs h-7" onClick={() => approveLeave(l.id, "rejected")}><X className="w-3 h-3"/></Button></>}
                </div>
              </div>
            ))}</div>}
          </div></TabsContent>

          {/* BIRTHDAYS */}
          <TabsContent value="birthdays"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <h3 className="font-heading text-lg font-medium mb-4">Birthdays & Anniversaries</h3>
            {birthdays.today.length === 0 ? <p className="text-center py-6 text-[#59615D] text-sm">No birthdays/anniversaries today</p> :
              <div className="space-y-2" data-testid="birthday-list">{birthdays.today.map((b,i)=>(
                <div key={i} className={`border rounded-xl p-3 ${b.type==='birthday'?'border-pink-300 bg-pink-50':'border-blue-300 bg-blue-50'}`}>
                  <div className="flex justify-between items-center"><p className="font-medium text-sm">{b.name} <Badge className={`text-[8px] ml-2 ${b.type==='birthday'?'bg-pink-200':'bg-blue-200'}`}>{b.type==='birthday'?'🎂 Birthday':`🎉 ${b.years}yr Anniversary`}</Badge></p><p className="text-xs text-[#59615D]">{b.email}</p></div>
                </div>
              ))}</div>}
          </div></TabsContent>

          {/* RESIGNATIONS */}
          <TabsContent value="resignations"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <h3 className="font-heading text-lg font-medium mb-4">Resignations ({resignations.length})</h3>
            {resignations.length === 0 ? <p className="text-center py-6 text-[#59615D] text-sm">No resignations</p> :
              <div className="space-y-2" data-testid="resignation-list">{resignations.map(r => (
                <div key={r.id} className="border border-[#E5E3DB] rounded-xl p-3 flex flex-col sm:flex-row justify-between gap-2">
                  <div><p className="font-medium text-sm">{r.user_name}</p><p className="text-xs text-[#59615D]">Reason: {r.reason} | Last day: {r.last_working_day || `+${r.notice_days}d`}</p></div>
                  <div className="flex gap-2 items-center"><Badge className={`text-[9px] ${r.status==='accepted'?'bg-green-100 text-green-800':r.status==='rejected'?'bg-red-100 text-red-800':'bg-yellow-100 text-yellow-800'}`}>{r.status}</Badge>
                    {r.status==='pending' && <><Button size="sm" className="rounded-full text-xs bg-[#6B8E6B] text-white h-7" onClick={async()=>{await axios.put(`${API}/resignations/${r.id}`,{status:'accepted'}); fetchData();}}><Check className="w-3 h-3"/></Button>
                      <Button size="sm" variant="outline" className="rounded-full text-xs h-7" onClick={async()=>{await axios.put(`${API}/resignations/${r.id}`,{status:'rejected'}); fetchData();}}><X className="w-3 h-3"/></Button></>}
                  </div>
                </div>
              ))}</div>}
          </div></TabsContent>

          {/* COMPLAINTS */}
          <TabsContent value="complaints"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <h3 className="font-heading text-lg font-medium mb-4">Complaints</h3>
            {complaints.length === 0 ? <p className="text-center py-6 text-[#59615D] text-sm">No complaints</p> :
            <div className="space-y-2">{complaints.map(c => (
              <div key={c.id} className="border border-[#E5E3DB] rounded-xl p-3 flex flex-col sm:flex-row justify-between gap-2">
                <div><p className="font-medium text-sm">{c.subject || c.title}</p><p className="text-xs text-[#59615D]">{c.description} | By: {c.user_name}</p></div>
                <div className="flex gap-2 items-center"><Badge className={`text-[9px] ${c.status === "resolved" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{c.status}</Badge>
                  {c.status !== "resolved" && <Button size="sm" className="rounded-full text-xs bg-[#6B8E6B] text-white h-7" onClick={() => resolveComplaint(c.id)}>Resolve</Button>}
                </div>
              </div>
            ))}</div>}
          </div></TabsContent>

          {/* COMMUNICATION */}
          <TabsContent value="communication"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-heading text-lg font-medium">Communication</h3>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="rounded-full text-xs" onClick={()=>setShowBulkEmail(true)} data-testid="bulk-email-btn"><Send className="w-3 h-3 mr-1"/>Bulk Email</Button>
                <Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={()=>{setEmailForm({template:"custom",to_email:"",emp_name:"",subject:"",message:"",position:"",salary:0,joining_date:"",old_salary:0,new_salary:0,effective_date:"",reason:"",details:""});setShowEmail(true);}} data-testid="send-email-btn"><Mail className="w-3 h-3 mr-1"/>Send Email</Button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              {[{t:"welcome",l:"Welcome Letter",i:FileText,c:"#3B5249"},{t:"increment",l:"Increment Letter",i:IndianRupee,c:"#6B8E6B"},{t:"warning",l:"Warning",i:AlertTriangle,c:"#D4A373"},{t:"termination",l:"Termination",i:X,c:"#B75D69"}].map(tp=>(
                <button key={tp.t} onClick={()=>{setEmailForm(f=>({...f,template:tp.t}));setShowEmail(true);}} className="bg-[#F9F8F6] rounded-xl p-3 text-center hover:shadow-md transition-all border border-transparent hover:border-[#E5E3DB]" data-testid={`template-${tp.t}`}>
                  <tp.i className="w-5 h-5 mx-auto mb-1" style={{color:tp.c}}/><p className="text-[10px] font-medium">{tp.l}</p>
                </button>
              ))}
            </div>
            {communications.length === 0 ? <p className="text-center py-6 text-[#59615D] text-sm">No communications sent</p> :
            <div className="space-y-2">{communications.slice(0,20).map(c=>(
              <div key={c.id} className="border border-[#E5E3DB] rounded-lg p-3 flex justify-between items-center">
                <div><Badge variant="outline" className="text-[8px] capitalize mr-1">{c.template}</Badge><span className="text-xs font-medium">{c.emp_name}</span><p className="text-[10px] text-[#59615D]">{c.to_email} | {c.created_at?.slice(0,10)}</p></div>
                <Badge className={`text-[8px] ${c.status==="sent"?"bg-green-100 text-green-800":"bg-red-100 text-red-800"}`}>{c.status}</Badge>
              </div>
            ))}</div>}
          </div></TabsContent>

          {/* ACTIVITY MONITOR */}
          <TabsContent value="monitoring"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <h3 className="font-heading text-lg font-medium mb-4">In-House Telecaller Activity (Today)</h3>
            <div className="space-y-4">
              {(() => {
                const byUser = {};
                todayCallLogs.forEach(c => { if (!byUser[c.user_id]) byUser[c.user_id] = { name: c.user_name, calls: [], goal: null }; byUser[c.user_id].calls.push(c); });
                dailyGoals.filter(g => g.date === today).forEach(g => { if (byUser[g.user_id]) byUser[g.user_id].goal = g; });
                const entries = Object.entries(byUser);
                if (entries.length === 0) return <p className="text-center py-6 text-[#59615D] text-sm">No activity today</p>;
                return entries.map(([uid, data]) => (
                  <div key={uid} className="border border-[#E5E3DB] rounded-xl p-4">
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-heading font-medium">{data.name}</p>
                      <div className="flex gap-2 text-xs">
                        <span className="flex items-center gap-1"><Phone className="w-3 h-3"/>{data.calls.length}{data.goal ? `/${data.goal.target_calls}` : ""}</span>
                        <span className="flex items-center gap-1"><Target className="w-3 h-3"/>{data.calls.filter(c => c.call_type === "follow_up").length}{data.goal ? `/${data.goal.target_followups}` : ""}</span>
                      </div>
                    </div>
                    {data.goal && <div className="mb-2"><div className="w-full bg-[#E5E3DB] rounded-full h-1.5"><div className="bg-[#3B5249] h-1.5 rounded-full" style={{ width: `${Math.min(100, (data.calls.length / data.goal.target_calls) * 100)}%` }}/></div></div>}
                  </div>
                ));
              })()}
            </div>
          </div></TabsContent>
        </Tabs>
      </div>

      {/* CREATE PAYROLL DIALOG */}
      <Dialog open={showCreatePayroll} onOpenChange={setShowCreatePayroll}><DialogContent className="rounded-2xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle className="font-heading">Create Payroll</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs font-medium">Employee</Label><Select value={payrollForm.user_id} onValueChange={selectEmpForPayroll}><SelectTrigger className="rounded-xl" data-testid="payroll-emp-select"><SelectValue placeholder="Choose employee"/></SelectTrigger><SelectContent>{(allUsers.length>0?allUsers:employees).filter(u=>u.role!=="admin").map(u=><SelectItem key={u.id} value={u.id}>{u.name} ({u.role?.replace(/_/g," ")}) - Rs.{u.salary||0}/mo</SelectItem>)}</SelectContent></Select><p className="text-[10px] text-[#A66E4E] mt-1">Selecting employee auto-fills hours, hourly rate & salary from attendance.</p></div>
          <div className="grid grid-cols-2 gap-2"><div><Label className="text-xs">Month</Label><Input value={payrollForm.month} onChange={e=>setPayrollForm(f=>({...f,month:e.target.value}))} placeholder="e.g. 4" className="rounded-xl"/></div><div><Label className="text-xs">Year</Label><Input value={payrollForm.year} onChange={e=>setPayrollForm(f=>({...f,year:e.target.value}))} className="rounded-xl"/></div></div>
          {/* Attendance-based stats */}
          {payrollForm.user_id && (
            <div className="bg-[#FAF8F3] border border-[#EAE7DE] rounded-xl p-3 grid grid-cols-3 gap-2 text-center" data-testid="payroll-att-summary">
              <div><p className="text-[9px] text-[#59615D] uppercase">Total Hours</p><p className="font-heading text-sm font-semibold text-[#3B5249]">{payrollForm.total_hours || 0}h</p></div>
              <div><p className="text-[9px] text-[#59615D] uppercase">Hourly Rate</p><p className="font-heading text-sm font-semibold text-[#A66E4E]">Rs.{payrollForm.hourly_rate || 0}</p></div>
              <div><p className="text-[9px] text-[#59615D] uppercase">Working Days</p><p className="font-heading text-sm font-semibold text-[#6B8E6B]">{payrollForm.working_days || 0}/{payrollForm.total_working_days || 26}</p></div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2"><div><Label className="text-xs">Working Days</Label><Input type="number" value={payrollForm.working_days} onChange={e=>setPayrollForm(f=>({...f,working_days:e.target.value}))} className="rounded-xl"/></div><div><Label className="text-xs">Total Days</Label><Input type="number" value={payrollForm.total_working_days} onChange={e=>setPayrollForm(f=>({...f,total_working_days:e.target.value}))} className="rounded-xl"/></div></div>
          <div><Label className="text-xs">Basic Salary <span className="text-[#A66E4E]">(from {payrollForm.total_hours || 0}h × Rs.{payrollForm.hourly_rate || 0}/h)</span></Label><Input type="number" value={payrollForm.basic_salary} onChange={e=>setPayrollForm(f=>({...f,basic_salary:e.target.value}))} className="rounded-xl"/></div>
          <div><Label className="text-xs">Incentive</Label><Input type="number" value={payrollForm.incentive} onChange={e=>setPayrollForm(f=>({...f,incentive:e.target.value}))} className="rounded-xl"/></div>
          <div><Label className="text-xs">Bonus</Label><Input type="number" value={payrollForm.bonus} onChange={e=>setPayrollForm(f=>({...f,bonus:e.target.value}))} className="rounded-xl"/></div>
          <div><Label className="text-xs">Deductions</Label><Input type="number" value={payrollForm.deductions} onChange={e=>setPayrollForm(f=>({...f,deductions:e.target.value}))} className="rounded-xl"/></div>
          <div><Label className="text-xs">Advance Deductions</Label><Input type="number" value={payrollForm.advance_deductions} onChange={e=>setPayrollForm(f=>({...f,advance_deductions:e.target.value}))} className="rounded-xl" /><p className="text-[10px] text-[#A66E4E] mt-0.5">Auto-filled from pending advances</p></div>
          <div><Label className="text-xs">Commission</Label><Input type="number" value={payrollForm.commission} onChange={e=>setPayrollForm(f=>({...f,commission:e.target.value}))} className="rounded-xl"/></div>
          <div className="bg-[#F9F8F6] rounded-xl p-3 text-center"><p className="text-xs text-[#59615D]">Net Salary</p><p className="font-heading text-xl font-bold text-[#3B5249]">Rs.{Number(payrollForm.basic_salary)+Number(payrollForm.incentive)+Number(payrollForm.bonus)+Number(payrollForm.commission)-Number(payrollForm.deductions)-Number(payrollForm.advance_deductions)}</p></div>
          <Button onClick={handleCreatePayroll} className="w-full rounded-full bg-[#3B5249] text-white">Create Payroll</Button>
        </div>
      </DialogContent></Dialog>

      {/* ADVANCE DIALOG */}
      <Dialog open={showAdvance} onOpenChange={setShowAdvance}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Record Advance</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Employee</Label><Select value={advForm.user_id} onValueChange={v=>{const u=(allUsers.length>0?allUsers:employees).find(x=>x.id===v);setAdvForm(f=>({...f,user_id:v,user_name:u?.name||"",user_role:u?.role||""}));}}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Select"/></SelectTrigger><SelectContent>{(allUsers.length>0?allUsers:employees).filter(u=>u.role!=="admin").map(u=><SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs">Type</Label><Select value={advForm.type} onValueChange={v=>setAdvForm(f=>({...f,type:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="advance">Advance</SelectItem><SelectItem value="emergency">Emergency Fund</SelectItem><SelectItem value="custom">Custom</SelectItem></SelectContent></Select></div>
          <div><Label className="text-xs">Amount</Label><Input type="number" value={advForm.amount} onChange={e=>setAdvForm(f=>({...f,amount:e.target.value}))} className="rounded-xl"/></div>
          <div><Label className="text-xs">Method</Label><Select value={advForm.method} onValueChange={v=>setAdvForm(f=>({...f,method:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="bank">Bank</SelectItem></SelectContent></Select></div>
          <div><Label className="text-xs">Reason</Label><Input value={advForm.reason} onChange={e=>setAdvForm(f=>({...f,reason:e.target.value}))} className="rounded-xl"/></div>
          <Button onClick={handleAdvance} className="w-full rounded-full bg-[#3B5249] text-white">Record Advance</Button>
        </div>
      </DialogContent></Dialog>

      {/* SEND EMAIL DIALOG */}
      <Dialog open={showEmail} onOpenChange={setShowEmail}><DialogContent className="rounded-2xl max-h-[85vh] overflow-y-auto" data-testid="send-email-dialog"><DialogHeader><DialogTitle className="font-heading">Send HR Letter / Email</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Template</Label>
            <Select value={emailForm.template} onValueChange={v=>setEmailForm(f=>({...f,template:v}))}>
              <SelectTrigger className="rounded-xl" data-testid="email-template-select"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="welcome">Welcome / Appointment Letter</SelectItem>
                <SelectItem value="offer">Offer Letter</SelectItem>
                <SelectItem value="employment">Employment Confirmation Letter</SelectItem>
                <SelectItem value="agreement">Employment Agreement</SelectItem>
                <SelectItem value="increment">Increment / Salary Revision Letter</SelectItem>
                <SelectItem value="warning">Warning Letter</SelectItem>
                <SelectItem value="termination">Termination Letter</SelectItem>
                <SelectItem value="relieving">Relieving Letter</SelectItem>
                <SelectItem value="experience">Experience Certificate</SelectItem>
                <SelectItem value="custom">Custom Communication</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Employee</Label><Select onValueChange={v=>{const u=(allUsers.length>0?allUsers:employees).find(x=>x.id===v);if(u)setEmailForm(f=>({...f,to_email:u.email||"",emp_name:u.name||"",salary:u.salary||0,old_salary:u.salary||0,incentive:u.incentive||0,position:(u.role||"").replace(/_/g," ")}));}}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Select employee"/></SelectTrigger><SelectContent>{(allUsers.length>0?allUsers:employees).map(u=><SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs">To Email</Label><Input value={emailForm.to_email} onChange={e=>setEmailForm(f=>({...f,to_email:e.target.value}))} className="rounded-xl"/></div>
          <div><Label className="text-xs">Employee Name</Label><Input value={emailForm.emp_name} onChange={e=>setEmailForm(f=>({...f,emp_name:e.target.value}))} className="rounded-xl"/></div>

          {/* WELCOME / APPOINTMENT LETTER */}
          {emailForm.template==="welcome" && <>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Designation / Position</Label><Input value={emailForm.position} onChange={e=>setEmailForm(f=>({...f,position:e.target.value}))} className="rounded-xl"/></div>
              <div><Label className="text-xs">Department</Label><Input placeholder="Sales / HR / Operations" value={emailForm.department} onChange={e=>setEmailForm(f=>({...f,department:e.target.value}))} className="rounded-xl"/></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Reporting To</Label><Input placeholder="Manager name / role" value={emailForm.reporting_to} onChange={e=>setEmailForm(f=>({...f,reporting_to:e.target.value}))} className="rounded-xl"/></div>
              <div><Label className="text-xs">Joining Date</Label><Input type="date" value={emailForm.joining_date} onChange={e=>setEmailForm(f=>({...f,joining_date:e.target.value}))} className="rounded-xl"/></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Monthly Salary (₹)</Label><Input type="number" value={emailForm.salary} onChange={e=>setEmailForm(f=>({...f,salary:e.target.value}))} className="rounded-xl"/></div>
              <div><Label className="text-xs">Monthly Incentive (₹)</Label><Input type="number" value={emailForm.incentive} onChange={e=>setEmailForm(f=>({...f,incentive:e.target.value}))} className="rounded-xl"/></div>
            </div>
          </>}

          {/* OFFER LETTER */}
          {emailForm.template==="offer" && <>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Position Offered</Label><Input value={emailForm.position} onChange={e=>setEmailForm(f=>({...f,position:e.target.value}))} className="rounded-xl"/></div>
              <div><Label className="text-xs">Department</Label><Input value={emailForm.department} onChange={e=>setEmailForm(f=>({...f,department:e.target.value}))} className="rounded-xl"/></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Reporting To</Label><Input value={emailForm.reporting_to} onChange={e=>setEmailForm(f=>({...f,reporting_to:e.target.value}))} className="rounded-xl"/></div>
              <div><Label className="text-xs">Joining Date</Label><Input type="date" value={emailForm.joining_date} onChange={e=>setEmailForm(f=>({...f,joining_date:e.target.value}))} className="rounded-xl"/></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Monthly Salary (₹)</Label><Input type="number" value={emailForm.salary} onChange={e=>setEmailForm(f=>({...f,salary:e.target.value}))} className="rounded-xl"/></div>
              <div><Label className="text-xs">Monthly Incentive (₹)</Label><Input type="number" value={emailForm.incentive} onChange={e=>setEmailForm(f=>({...f,incentive:e.target.value}))} className="rounded-xl"/></div>
            </div>
            <div><Label className="text-xs">Letter Date</Label><Input type="date" value={emailForm.effective_date} onChange={e=>setEmailForm(f=>({...f,effective_date:e.target.value}))} className="rounded-xl"/></div>
          </>}

          {/* EMPLOYMENT CONFIRMATION */}
          {emailForm.template==="employment" && <>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Designation</Label><Input value={emailForm.position} onChange={e=>setEmailForm(f=>({...f,position:e.target.value}))} className="rounded-xl"/></div>
              <div><Label className="text-xs">Department</Label><Input value={emailForm.department} onChange={e=>setEmailForm(f=>({...f,department:e.target.value}))} className="rounded-xl"/></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Date of Joining</Label><Input type="date" value={emailForm.joining_date} onChange={e=>setEmailForm(f=>({...f,joining_date:e.target.value}))} className="rounded-xl"/></div>
              <div><Label className="text-xs">Confirmation Date</Label><Input type="date" value={emailForm.effective_date} onChange={e=>setEmailForm(f=>({...f,effective_date:e.target.value}))} className="rounded-xl"/></div>
            </div>
            <div><Label className="text-xs">Monthly Salary (₹)</Label><Input type="number" value={emailForm.salary} onChange={e=>setEmailForm(f=>({...f,salary:e.target.value}))} className="rounded-xl"/></div>
          </>}

          {/* EMPLOYMENT AGREEMENT */}
          {emailForm.template==="agreement" && <>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Position</Label><Input value={emailForm.position} onChange={e=>setEmailForm(f=>({...f,position:e.target.value}))} className="rounded-xl"/></div>
              <div><Label className="text-xs">Joining Date</Label><Input type="date" value={emailForm.joining_date} onChange={e=>setEmailForm(f=>({...f,joining_date:e.target.value}))} className="rounded-xl"/></div>
            </div>
            <div><Label className="text-xs">Monthly Salary (₹)</Label><Input type="number" value={emailForm.salary} onChange={e=>setEmailForm(f=>({...f,salary:e.target.value}))} className="rounded-xl"/></div>
            <p className="text-[10px] text-[#A66E4E]">Agreement includes confidentiality, non-compete, IP, code of conduct, governing law (Calicut, Kerala) — all auto-populated.</p>
          </>}

          {/* INCREMENT / SALARY REVISION */}
          {emailForm.template==="increment" && <>
            <div><Label className="text-xs">Designation</Label><Input value={emailForm.position} onChange={e=>setEmailForm(f=>({...f,position:e.target.value}))} className="rounded-xl"/></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Old Salary (₹)</Label><Input type="number" value={emailForm.old_salary} onChange={e=>setEmailForm(f=>({...f,old_salary:e.target.value}))} className="rounded-xl"/></div>
              <div><Label className="text-xs">New Salary (₹)</Label><Input type="number" value={emailForm.new_salary} onChange={e=>setEmailForm(f=>({...f,new_salary:e.target.value}))} className="rounded-xl"/></div>
            </div>
            <div><Label className="text-xs">Effective Date</Label><Input type="date" value={emailForm.effective_date} onChange={e=>setEmailForm(f=>({...f,effective_date:e.target.value}))} className="rounded-xl"/></div>
          </>}

          {/* WARNING */}
          {emailForm.template==="warning" && <>
            <div><Label className="text-xs">Designation</Label><Input value={emailForm.position} onChange={e=>setEmailForm(f=>({...f,position:e.target.value}))} className="rounded-xl"/></div>
            <div><Label className="text-xs">Subject of Warning (Reason)</Label><Input value={emailForm.reason} onChange={e=>setEmailForm(f=>({...f,reason:e.target.value}))} className="rounded-xl"/></div>
            <div><Label className="text-xs">Incident Details</Label><Textarea value={emailForm.details} onChange={e=>setEmailForm(f=>({...f,details:e.target.value}))} className="rounded-xl min-h-[80px]"/></div>
          </>}

          {/* TERMINATION */}
          {emailForm.template==="termination" && <>
            <div><Label className="text-xs">Designation</Label><Input value={emailForm.position} onChange={e=>setEmailForm(f=>({...f,position:e.target.value}))} className="rounded-xl"/></div>
            <div><Label className="text-xs">Reason</Label><Input value={emailForm.reason} onChange={e=>setEmailForm(f=>({...f,reason:e.target.value}))} className="rounded-xl"/></div>
            <div><Label className="text-xs">Effective Date</Label><Input type="date" value={emailForm.effective_date} onChange={e=>setEmailForm(f=>({...f,effective_date:e.target.value}))} className="rounded-xl"/></div>
          </>}

          {/* RELIEVING */}
          {emailForm.template==="relieving" && <>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Designation</Label><Input value={emailForm.position} onChange={e=>setEmailForm(f=>({...f,position:e.target.value}))} className="rounded-xl"/></div>
              <div><Label className="text-xs">Date of Joining</Label><Input type="date" value={emailForm.joining_date} onChange={e=>setEmailForm(f=>({...f,joining_date:e.target.value}))} className="rounded-xl"/></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Last Working Day</Label><Input type="date" value={emailForm.effective_date} onChange={e=>setEmailForm(f=>({...f,effective_date:e.target.value}))} className="rounded-xl"/></div>
              <div><Label className="text-xs">Reason for Separation</Label><Input placeholder="Resignation accepted" value={emailForm.reason} onChange={e=>setEmailForm(f=>({...f,reason:e.target.value}))} className="rounded-xl"/></div>
            </div>
          </>}

          {/* EXPERIENCE CERTIFICATE */}
          {emailForm.template==="experience" && <>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Designation</Label><Input value={emailForm.position} onChange={e=>setEmailForm(f=>({...f,position:e.target.value}))} className="rounded-xl"/></div>
              <div><Label className="text-xs">Department</Label><Input value={emailForm.department} onChange={e=>setEmailForm(f=>({...f,department:e.target.value}))} className="rounded-xl"/></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Date of Joining</Label><Input type="date" value={emailForm.joining_date} onChange={e=>setEmailForm(f=>({...f,joining_date:e.target.value}))} className="rounded-xl"/></div>
              <div><Label className="text-xs">Last Working Day</Label><Input type="date" value={emailForm.effective_date} onChange={e=>setEmailForm(f=>({...f,effective_date:e.target.value}))} className="rounded-xl"/></div>
            </div>
            <div><Label className="text-xs">Gender (for pronouns)</Label><Select value={emailForm.gender} onValueChange={v=>setEmailForm(f=>({...f,gender:v}))}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Select"/></SelectTrigger><SelectContent><SelectItem value="male">Male (he/him)</SelectItem><SelectItem value="female">Female (she/her)</SelectItem><SelectItem value="other">Prefer not to say (they/them)</SelectItem></SelectContent></Select></div>
          </>}

          {/* CUSTOM */}
          {emailForm.template==="custom" && <>
            <div><Label className="text-xs">Subject</Label><Input value={emailForm.subject} onChange={e=>setEmailForm(f=>({...f,subject:e.target.value}))} className="rounded-xl"/></div>
            <div><Label className="text-xs">Message</Label><Textarea value={emailForm.message} onChange={e=>setEmailForm(f=>({...f,message:e.target.value}))} className="rounded-xl min-h-[120px]" placeholder="Type your message here..."/></div>
          </>}

          <p className="text-[10px] text-[#3B5249] bg-[#F9F8F6] p-2 rounded-lg">📄 Letter is generated on official Celesta Glow letterhead — Veegal Enterprises LLP, Cherutti Road, Calicut, Kerala 673032 · 📞 +91 94461 25745 · ✉ manager@celestaglow.com</p>
          <Button onClick={handleSendEmail} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="send-email-btn"><Mail className="w-4 h-4 mr-1"/>Send {emailForm.template==="custom"?"Email":"Letter"}</Button>
        </div>
      </DialogContent></Dialog>

      {/* BULK EMAIL DIALOG */}
      <Dialog open={showBulkEmail} onOpenChange={setShowBulkEmail}><DialogContent className="rounded-2xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle className="font-heading">Bulk Email</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Subject</Label><Input value={bulkForm.subject} onChange={e=>setBulkForm(f=>({...f,subject:e.target.value}))} className="rounded-xl"/></div>
          <div><Label className="text-xs">Message</Label><Textarea value={bulkForm.message} onChange={e=>setBulkForm(f=>({...f,message:e.target.value}))} className="rounded-xl min-h-[80px]"/></div>
          <div><Label className="text-xs">Select Employees ({bulkForm.selected.length})</Label>
            <div className="max-h-40 overflow-y-auto space-y-1 border border-[#E5E3DB] rounded-xl p-2">{(allUsers.length>0?allUsers:employees).filter(u=>u.role!=="admin").map(u=>(
              <label key={u.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-[#F9F8F6] p-1 rounded"><input type="checkbox" checked={bulkForm.selected.includes(u.id)} onChange={e=>{if(e.target.checked)setBulkForm(f=>({...f,selected:[...f.selected,u.id]}));else setBulkForm(f=>({...f,selected:f.selected.filter(x=>x!==u.id)}));}}/>{u.name} <span className="text-[#59615D]">({u.email})</span></label>
            ))}</div>
          </div>
          <Button onClick={handleBulkEmail} className="w-full rounded-full bg-[#3B5249] text-white"><Send className="w-4 h-4 mr-1"/>Send to {bulkForm.selected.length} employees</Button>
        </div>
      </DialogContent></Dialog>

      {/* EDIT SALARY DIALOG */}
      <Dialog open={showEditSalary} onOpenChange={setShowEditSalary}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Edit Salary - {selectedEmp?.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Monthly Salary (Rs.)</Label><Input type="number" value={salaryForm.salary} onChange={e=>setSalaryForm(f=>({...f,salary:e.target.value}))} className="rounded-xl"/></div>
          <div><Label className="text-xs">Monthly Incentive (Rs.)</Label><Input type="number" value={salaryForm.incentive} onChange={e=>setSalaryForm(f=>({...f,incentive:e.target.value}))} className="rounded-xl"/></div>
          <Button onClick={handleEditSalary} className="w-full rounded-full bg-[#3B5249] text-white">Update Salary</Button>
        </div>
      </DialogContent></Dialog>

      {/* MARK ATTENDANCE */}
      <Dialog open={showAttendance} onOpenChange={setShowAttendance}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Mark Attendance</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Employee</Label><Select value={attForm.user_id} onValueChange={v=>{const u=(allUsers.length>0?allUsers:employees).find(x=>x.id===v);setAttForm(f=>({...f,user_id:v,user_name:u?.name||""}));}}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Select"/></SelectTrigger><SelectContent>{(allUsers.length>0?allUsers:employees).filter(u=>u.role!=="admin").map(u=><SelectItem key={u.id} value={u.id}>{u.name} ({u.role?.replace(/_/g," ")})</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs">Date</Label><Input type="date" value={attForm.date} onChange={e=>setAttForm(f=>({...f,date:e.target.value}))} className="rounded-xl"/></div>
          <div className="grid grid-cols-2 gap-2"><div><Label className="text-xs">Login Time</Label><Input type="time" value={attForm.login_time} onChange={e=>setAttForm(f=>({...f,login_time:e.target.value}))} className="rounded-xl"/></div><div><Label className="text-xs">Logout Time</Label><Input type="time" value={attForm.logout_time} onChange={e=>setAttForm(f=>({...f,logout_time:e.target.value}))} className="rounded-xl"/></div></div>
          <div><Label className="text-xs">Status</Label><Select value={attForm.status} onValueChange={v=>setAttForm(f=>({...f,status:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="present">Present</SelectItem><SelectItem value="half_day">Half Day</SelectItem><SelectItem value="absent">Absent</SelectItem><SelectItem value="leave">On Leave</SelectItem></SelectContent></Select></div>
          <Button onClick={async()=>{if(!attForm.user_id)return toast.error("Select employee");try{await axios.post(`${API}/attendance`,attForm);toast.success("Attendance marked!");setShowAttendance(false);fetchData();}catch{toast.error("Failed");}}} className="w-full rounded-full bg-[#3B5249] text-white">Mark Attendance</Button>
        </div>
      </DialogContent></Dialog>

      {/* HIRING: Add/Edit Candidate Dialog */}
      <Dialog open={showAddCandidate} onOpenChange={setShowAddCandidate}><DialogContent className="rounded-2xl max-h-[85vh] overflow-y-auto" data-testid="hr-candidate-dialog"><DialogHeader><DialogTitle className="font-heading">{editingCandidate ? "Edit Candidate" : "Add Candidate"}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Full Name *" value={candidateForm.name} onChange={e=>setCandidateForm(f=>({...f,name:e.target.value}))} className="rounded-xl" data-testid="cand-name-input"/>
            <Input placeholder="Phone *" value={candidateForm.phone} onChange={e=>setCandidateForm(f=>({...f,phone:e.target.value}))} className="rounded-xl" data-testid="cand-phone-input"/>
          </div>
          <Input placeholder="Email" value={candidateForm.email} onChange={e=>setCandidateForm(f=>({...f,email:e.target.value}))} className="rounded-xl"/>
          <div className="grid grid-cols-2 gap-2">
            <Select value={candidateForm.position} onValueChange={v=>setCandidateForm(f=>({...f,position:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent>{["telecaller","telesales","agent","content_developer","sales_manager","district_manager","social_media_manager","inhouse_telecaller","inventory_manager"].map(p=><SelectItem key={p} value={p} className="capitalize">{p.replace(/_/g," ")}</SelectItem>)}</SelectContent></Select>
            <Input placeholder="Location" value={candidateForm.location} onChange={e=>setCandidateForm(f=>({...f,location:e.target.value}))} className="rounded-xl"/>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Experience (e.g., 2 yrs)" value={candidateForm.experience} onChange={e=>setCandidateForm(f=>({...f,experience:e.target.value}))} className="rounded-xl"/>
            <Input placeholder="Qualification" value={candidateForm.qualification} onChange={e=>setCandidateForm(f=>({...f,qualification:e.target.value}))} className="rounded-xl"/>
          </div>
          <Input placeholder="Skills (comma separated)" value={candidateForm.skills} onChange={e=>setCandidateForm(f=>({...f,skills:e.target.value}))} className="rounded-xl"/>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-[10px]">Expected Salary</Label><Input type="number" value={candidateForm.expected_salary} onChange={e=>setCandidateForm(f=>({...f,expected_salary:Number(e.target.value)}))} className="rounded-xl"/></div>
            <div><Label className="text-[10px]">Interview Date</Label><Input type="date" value={candidateForm.interview_date} onChange={e=>setCandidateForm(f=>({...f,interview_date:e.target.value}))} className="rounded-xl"/></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={candidateForm.source} onValueChange={v=>setCandidateForm(f=>({...f,source:v}))}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Source"/></SelectTrigger><SelectContent>{["direct","referral","naukri","linkedin","indeed","social_media","walk_in","other"].map(s=><SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g," ")}</SelectItem>)}</SelectContent></Select>
            <Select value={candidateForm.status} onValueChange={v=>setCandidateForm(f=>({...f,status:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="contacted">Contacted</SelectItem><SelectItem value="not_answering">Not Answering</SelectItem><SelectItem value="no_response">No Response</SelectItem><SelectItem value="interested">Interested</SelectItem><SelectItem value="not_interested">Not Interested</SelectItem><SelectItem value="callback">Callback Required</SelectItem><SelectItem value="interviewed">Interviewed</SelectItem><SelectItem value="selected">Selected</SelectItem><SelectItem value="rejected">Rejected</SelectItem></SelectContent></Select>
          </div>
          <Textarea placeholder="Interview notes" value={candidateForm.interview_notes} onChange={e=>setCandidateForm(f=>({...f,interview_notes:e.target.value}))} className="rounded-xl" rows={2}/>
          <Textarea placeholder="General notes" value={candidateForm.notes} onChange={e=>setCandidateForm(f=>({...f,notes:e.target.value}))} className="rounded-xl" rows={2}/>
          <Button onClick={async()=>{if(!candidateForm.name||!candidateForm.phone)return toast.error("Name & phone required");try{if(editingCandidate){await axios.put(`${API}/hiring/candidates/${editingCandidate.id}`,candidateForm); toast.success("Updated");}else{await axios.post(`${API}/hiring/candidates`,candidateForm); toast.success("Added");} setShowAddCandidate(false); setEditingCandidate(null); fetchData();}catch(e){toast.error(e.response?.data?.detail||"Failed");}}} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="cand-submit">{editingCandidate ? "Update" : "Add"} Candidate</Button>
        </div>
      </DialogContent></Dialog>

      {/* HR Call Log Dialog */}
      <Dialog open={showHRCall} onOpenChange={setShowHRCall}><DialogContent className="rounded-2xl max-h-[85vh] overflow-y-auto" data-testid="hr-call-dialog"><DialogHeader><DialogTitle className="font-heading">Log HR Call</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Contact Name *" value={hrCallForm.contact_name} onChange={e=>setHrCallForm(f=>({...f,contact_name:e.target.value}))} className="rounded-xl" data-testid="hrcall-name-input"/>
            <Input placeholder="Phone *" value={hrCallForm.phone} onChange={e=>setHrCallForm(f=>({...f,phone:e.target.value}))} className="rounded-xl"/>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={hrCallForm.purpose} onValueChange={v=>setHrCallForm(f=>({...f,purpose:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent>{["candidate_followup","interview","employee_comm","offer","onboarding","exit","other"].map(p=><SelectItem key={p} value={p} className="capitalize">{p.replace(/_/g," ")}</SelectItem>)}</SelectContent></Select>
            <Select value={hrCallForm.outcome} onValueChange={v=>setHrCallForm(f=>({...f,outcome:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent>{["contacted","not_reachable","scheduled_interview","accepted_offer","rejected_offer","follow_up","completed"].map(o=><SelectItem key={o} value={o} className="capitalize">{o.replace(/_/g," ")}</SelectItem>)}</SelectContent></Select>
          </div>
          {hrCallForm.linked_candidate_id && <p className="text-[10px] text-[#A66E4E]">📌 Linked to candidate (status will auto-update based on outcome)</p>}
          {!hrCallForm.linked_candidate_id && <Select value={hrCallForm.linked_candidate_id} onValueChange={v=>setHrCallForm(f=>({...f,linked_candidate_id:v}))}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Link to candidate (optional)"/></SelectTrigger><SelectContent>{hiringCandidates.map(c=><SelectItem key={c.id} value={c.id}>{c.name} - {c.position}</SelectItem>)}</SelectContent></Select>}
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-[10px]">Duration (min)</Label><Input type="number" value={hrCallForm.duration_min} onChange={e=>setHrCallForm(f=>({...f,duration_min:Number(e.target.value)}))} className="rounded-xl"/></div>
            <div><Label className="text-[10px]">Next Action Date</Label><Input type="date" value={hrCallForm.next_action_date} onChange={e=>setHrCallForm(f=>({...f,next_action_date:e.target.value}))} className="rounded-xl"/></div>
          </div>
          <Input placeholder="Next action (e.g., schedule interview)" value={hrCallForm.next_action} onChange={e=>setHrCallForm(f=>({...f,next_action:e.target.value}))} className="rounded-xl"/>
          <Textarea placeholder="Call notes" value={hrCallForm.notes} onChange={e=>setHrCallForm(f=>({...f,notes:e.target.value}))} className="rounded-xl" rows={3}/>
          <Button onClick={async()=>{if(!hrCallForm.contact_name||!hrCallForm.phone)return toast.error("Name & phone required");try{await axios.post(`${API}/hr/call-logs`,hrCallForm); toast.success("Call logged"); setShowHRCall(false); setHrCallForm({contact_name:"",phone:"",purpose:"candidate_followup",linked_candidate_id:"",duration_min:0,outcome:"contacted",next_action:"",next_action_date:"",notes:""}); fetchData();}catch{toast.error("Failed");}}} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="hrcall-submit">Log Call</Button>
        </div>
      </DialogContent></Dialog>

      {/* Forward Candidate Dialog */}
      <Dialog open={showForward} onOpenChange={setShowForward}><DialogContent className="rounded-2xl" data-testid="forward-dialog"><DialogHeader><DialogTitle className="font-heading">Forward Candidate to Manager</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {forwardingCandidate && <div className="bg-[#F9F8F6] rounded-xl p-3"><p className="font-medium text-sm">{forwardingCandidate.name}</p><p className="text-xs text-[#59615D]">{forwardingCandidate.position} | {forwardingCandidate.phone}</p></div>}
          <Select value={forwardForm.target_role} onValueChange={v=>setForwardForm(f=>({...f,target_role:v,target_user_id:""}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="sales_manager">Sales Manager</SelectItem><SelectItem value="district_manager">District Manager</SelectItem></SelectContent></Select>
          <Select value={forwardForm.target_user_id} onValueChange={v=>setForwardForm(f=>({...f,target_user_id:v}))}><SelectTrigger className="rounded-xl" data-testid="forward-target-select"><SelectValue placeholder="Select manager"/></SelectTrigger>
            <SelectContent>{(forwardForm.target_role==='sales_manager'?forwardManagers.sales_managers:forwardManagers.district_managers).map(m=><SelectItem key={m.id} value={m.id}>{m.name} {m.district?`(${m.district})`:''}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={forwardForm.status} onValueChange={v=>setForwardForm(f=>({...f,status:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="interviewed">Interviewed - Ready for review</SelectItem><SelectItem value="selected">Selected - Ready to hire</SelectItem></SelectContent></Select>
          <p className="text-[10px] text-[#A66E4E]">📩 Manager will receive a notification with the candidate</p>
          <Button onClick={async()=>{if(!forwardForm.target_user_id)return toast.error("Select a manager");try{await axios.post(`${API}/hiring/forward/${forwardingCandidate.id}`,forwardForm); toast.success("Forwarded"); setShowForward(false); fetchData();}catch(e){toast.error(e.response?.data?.detail||"Failed");}}} className="w-full rounded-full bg-pink-600 text-white" data-testid="forward-submit">Forward to Manager</Button>
        </div>
      </DialogContent></Dialog>
      {/* ADD EMPLOYEE DIALOG */}
      <Dialog open={showAddEmp} onOpenChange={setShowAddEmp}><DialogContent className="rounded-2xl max-h-[85vh] overflow-y-auto" data-testid="add-emp-dialog"><DialogHeader><DialogTitle className="font-heading">Add Employee</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Full Name *" value={empForm.name} onChange={e=>setEmpForm(f=>({...f,name:e.target.value}))} className="rounded-xl" data-testid="emp-name-input"/>
            <Input placeholder="Email *" value={empForm.email} onChange={e=>setEmpForm(f=>({...f,email:e.target.value}))} className="rounded-xl" data-testid="emp-email-input"/>
          </div>
          <div><Label className="text-xs">Role</Label><Select value={empForm.role} onValueChange={v=>setEmpForm(f=>({...f,role:v}))}><SelectTrigger className="rounded-xl" data-testid="emp-role-select"><SelectValue/></SelectTrigger><SelectContent>{Object.keys({telecaller:1,agent:1,district_manager:1,sales_manager:1,finance_manager:1,hr_manager:1,social_media_manager:1,inhouse_telecaller:1,content_strategist:1,content_developer:1,assistant_sales_manager:1,assistant_district_manager:1,inventory_manager:1,digital_marketing_manager:1}).map(r=><SelectItem key={r} value={r} className="capitalize">{r.replace(/_/g," ")}</SelectItem>)}</SelectContent></Select></div>
          <Input placeholder="Password (leave blank for default)" value={empForm.password} onChange={e=>setEmpForm(f=>({...f,password:e.target.value}))} className="rounded-xl"/>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Salary (Rs.)</Label><Input type="number" value={empForm.salary} onChange={e=>setEmpForm(f=>({...f,salary:e.target.value}))} className="rounded-xl"/></div>
            <div><Label className="text-xs">Incentive (Rs.)</Label><Input type="number" value={empForm.incentive} onChange={e=>setEmpForm(f=>({...f,incentive:e.target.value}))} className="rounded-xl"/></div>
          </div>
          <Input placeholder="Phone * (required for calling)" value={empForm.phone} onChange={e=>setEmpForm(f=>({...f,phone:e.target.value}))} className="rounded-xl" data-testid="emp-phone-input" required/>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="District" value={empForm.district} onChange={e=>setEmpForm(f=>({...f,district:e.target.value}))} className="rounded-xl"/>
            <Input placeholder="Area" value={empForm.area} onChange={e=>setEmpForm(f=>({...f,area:e.target.value}))} className="rounded-xl"/>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-[10px]">Date of Birth</Label><Input type="date" value={empForm.dob} onChange={e=>setEmpForm(f=>({...f,dob:e.target.value}))} className="rounded-xl text-xs"/></div>
            <div><Label className="text-[10px]">Joining Date</Label><Input type="date" value={empForm.joining_date} onChange={e=>setEmpForm(f=>({...f,joining_date:e.target.value}))} className="rounded-xl text-xs"/></div>
          </div>
          <Textarea placeholder="Address" value={empForm.address} onChange={e=>setEmpForm(f=>({...f,address:e.target.value}))} className="rounded-xl text-xs min-h-[50px]"/>
          <Input placeholder="Emergency contact (name & phone)" value={empForm.emergency_contact} onChange={e=>setEmpForm(f=>({...f,emergency_contact:e.target.value}))} className="rounded-xl"/>
          <div className="rounded-xl border border-[#E5E3DB] bg-[#F9F8F6] p-3 space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-[#3B5249]">Bank / Salary Account Details</p>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Account Holder Name" value={empForm.bank_account_name} onChange={e=>setEmpForm(f=>({...f,bank_account_name:e.target.value}))} className="rounded-xl text-xs" data-testid="hr-bank-name"/>
              <Input placeholder="Bank Name (e.g. SBI)" value={empForm.bank_name} onChange={e=>setEmpForm(f=>({...f,bank_name:e.target.value}))} className="rounded-xl text-xs"/>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Account Number" value={empForm.bank_account_number} onChange={e=>setEmpForm(f=>({...f,bank_account_number:e.target.value}))} className="rounded-xl text-xs" data-testid="hr-bank-acno"/>
              <Input placeholder="IFSC Code" value={empForm.bank_ifsc} onChange={e=>setEmpForm(f=>({...f,bank_ifsc:e.target.value.toUpperCase()}))} className="rounded-xl text-xs uppercase"/>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="UPI ID" value={empForm.upi_id} onChange={e=>setEmpForm(f=>({...f,upi_id:e.target.value}))} className="rounded-xl text-xs"/>
              <Input placeholder="PAN" value={empForm.pan_number} onChange={e=>setEmpForm(f=>({...f,pan_number:e.target.value.toUpperCase()}))} className="rounded-xl text-xs uppercase"/>
              <Input placeholder="Aadhaar" value={empForm.aadhaar_number} onChange={e=>setEmpForm(f=>({...f,aadhaar_number:e.target.value}))} className="rounded-xl text-xs"/>
            </div>
          </div>
          <p className="text-[10px] text-[#A66E4E]">A welcome email with login credentials will be sent automatically</p>
          <Button onClick={handleAddEmp} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="emp-submit-btn">Create Employee</Button>
        </div>
      </DialogContent></Dialog>

      {/* EDIT EMPLOYEE DIALOG */}
      <Dialog open={showEditEmp} onOpenChange={(o)=>{setShowEditEmp(o); if(!o)setEditingEmp(null);}}><DialogContent className="rounded-2xl max-h-[88vh] overflow-y-auto" data-testid="edit-emp-dialog"><DialogHeader><DialogTitle className="font-heading">Edit Employee - {editingEmp?.name}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Full Name" value={empForm.name} onChange={e=>setEmpForm(f=>({...f,name:e.target.value}))} className="rounded-xl"/>
            <Input placeholder="Email" value={empForm.email} onChange={e=>setEmpForm(f=>({...f,email:e.target.value}))} className="rounded-xl"/>
          </div>
          <Input placeholder="New password (leave blank to keep)" value={empForm.password} onChange={e=>setEmpForm(f=>({...f,password:e.target.value}))} className="rounded-xl"/>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Salary (Rs.)</Label><Input type="number" value={empForm.salary} onChange={e=>setEmpForm(f=>({...f,salary:e.target.value}))} className="rounded-xl"/></div>
            <div><Label className="text-xs">Incentive (Rs.)</Label><Input type="number" value={empForm.incentive} onChange={e=>setEmpForm(f=>({...f,incentive:e.target.value}))} className="rounded-xl"/></div>
          </div>
          <Input placeholder="Phone * (required for calling)" value={empForm.phone} onChange={e=>setEmpForm(f=>({...f,phone:e.target.value}))} className="rounded-xl" required/>
          {(editingEmp?.role === 'telecaller' || editingEmp?.role === 'agent') && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3 space-y-2">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-blue-700">Reports To — {editingEmp?.role === 'agent' ? 'District Manager' : 'Sales Manager'}</p>
              <p className="text-[10px] text-[#59615D]">This {editingEmp?.role}&apos;s data will only be visible to the selected manager.</p>
              <Select value={empForm.managed_by || "__none__"} onValueChange={v=>{
                if (v === "__none__") { setEmpForm(f=>({...f, managed_by:"", managed_by_name:"", managed_by_role:""})); return; }
                const list = editingEmp?.role === 'agent' ? districtManagers : salesManagers;
                const m = list.find(x => x.id === v);
                setEmpForm(f=>({...f, managed_by: v, managed_by_name: m?.name||"", managed_by_role: editingEmp?.role === 'agent' ? "district_manager" : "sales_manager"}));
              }}>
                <SelectTrigger className="rounded-xl text-xs" data-testid="edit-mgr-select"><SelectValue placeholder="Pick manager…"/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Unassigned —</SelectItem>
                  {(editingEmp?.role === 'agent' ? districtManagers : salesManagers).map(m => <SelectItem key={m.id} value={m.id}>{m.name}{m.email?` • ${m.email}`:""}</SelectItem>)}
                </SelectContent>
              </Select>
              {empForm.managed_by_name && <p className="text-[10px] text-blue-700">Currently reports to: <b>{empForm.managed_by_name}</b></p>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="District" value={empForm.district} onChange={e=>setEmpForm(f=>({...f,district:e.target.value}))} className="rounded-xl"/>
            <Input placeholder="Area" value={empForm.area} onChange={e=>setEmpForm(f=>({...f,area:e.target.value}))} className="rounded-xl"/>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-[10px]">Date of Birth</Label><Input type="date" value={empForm.dob} onChange={e=>setEmpForm(f=>({...f,dob:e.target.value}))} className="rounded-xl text-xs"/></div>
            <div><Label className="text-[10px]">Joining Date</Label><Input type="date" value={empForm.joining_date} onChange={e=>setEmpForm(f=>({...f,joining_date:e.target.value}))} className="rounded-xl text-xs"/></div>
          </div>
          <Textarea placeholder="Address" value={empForm.address} onChange={e=>setEmpForm(f=>({...f,address:e.target.value}))} className="rounded-xl text-xs min-h-[50px]"/>
          <Input placeholder="Emergency contact (name & phone)" value={empForm.emergency_contact} onChange={e=>setEmpForm(f=>({...f,emergency_contact:e.target.value}))} className="rounded-xl"/>
          <div className="rounded-xl border border-[#E5E3DB] bg-[#F9F8F6] p-3 space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-[#3B5249]">Bank / Salary Account Details</p>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Account Holder Name" value={empForm.bank_account_name} onChange={e=>setEmpForm(f=>({...f,bank_account_name:e.target.value}))} className="rounded-xl text-xs" data-testid="hr-edit-bank-name"/>
              <Input placeholder="Bank Name (e.g. SBI)" value={empForm.bank_name} onChange={e=>setEmpForm(f=>({...f,bank_name:e.target.value}))} className="rounded-xl text-xs"/>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Account Number" value={empForm.bank_account_number} onChange={e=>setEmpForm(f=>({...f,bank_account_number:e.target.value}))} className="rounded-xl text-xs" data-testid="hr-edit-bank-acno"/>
              <Input placeholder="IFSC Code" value={empForm.bank_ifsc} onChange={e=>setEmpForm(f=>({...f,bank_ifsc:e.target.value.toUpperCase()}))} className="rounded-xl text-xs uppercase"/>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="UPI ID" value={empForm.upi_id} onChange={e=>setEmpForm(f=>({...f,upi_id:e.target.value}))} className="rounded-xl text-xs"/>
              <Input placeholder="PAN" value={empForm.pan_number} onChange={e=>setEmpForm(f=>({...f,pan_number:e.target.value.toUpperCase()}))} className="rounded-xl text-xs uppercase"/>
              <Input placeholder="Aadhaar" value={empForm.aadhaar_number} onChange={e=>setEmpForm(f=>({...f,aadhaar_number:e.target.value}))} className="rounded-xl text-xs"/>
            </div>
          </div>
          <Button onClick={handleEditEmp} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="emp-update-btn">Update Employee</Button>
        </div>
      </DialogContent></Dialog>

      <DocumentTemplatesEditor open={showDocTemplates} onOpenChange={setShowDocTemplates} />

      {/* FINAL HIRE DIALOG - assign manager */}
      <Dialog open={showFinalHire} onOpenChange={(o)=>{setShowFinalHire(o); if(!o){setHireCandidate(null); setHireMgrId("");}}}>
        <DialogContent className="rounded-2xl max-w-md" data-testid="final-hire-dialog">
          <DialogHeader><DialogTitle className="font-heading">Complete Final Hire — {hireCandidate?.name}</DialogTitle></DialogHeader>
          {hireCandidate && (() => {
            const isAgent = hireCandidate.position === 'agent';
            const mgrList = isAgent ? districtManagers : salesManagers;
            const mgrLabel = isAgent ? "District Manager" : "Sales Manager";
            return (
              <div className="space-y-3">
                <div className="bg-[#F9F8F6] rounded-xl p-3 text-xs">
                  <p><b>Candidate:</b> {hireCandidate.name}</p>
                  <p><b>Position:</b> <span className="capitalize">{hireCandidate.position}</span></p>
                  <p><b>Phone:</b> {hireCandidate.phone}</p>
                  {hireCandidate.expected_salary > 0 && <p><b>Expected Salary:</b> Rs.{hireCandidate.expected_salary}/mo</p>}
                </div>
                <div>
                  <Label className="text-xs font-medium">Assign to {mgrLabel} *</Label>
                  <p className="text-[10px] text-[#59615D] mb-1">{isAgent ? "Agents only see data of their own DM. Pick which DM this agent reports to." : "Telecallers only see data of their own SM. Pick which SM this telecaller reports to."}</p>
                  <Select value={hireMgrId || "__none__"} onValueChange={v=>setHireMgrId(v==="__none__"?"":v)}>
                    <SelectTrigger className="rounded-xl" data-testid="hire-mgr-select"><SelectValue placeholder={`Pick a ${mgrLabel}…`}/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— No manager (admin only) —</SelectItem>
                      {mgrList.map(m => <SelectItem key={m.id} value={m.id}>{m.name}{m.email?` • ${m.email}`:""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {mgrList.length === 0 && <p className="text-[10px] text-[#A66E4E] mt-1">⚠ No {mgrLabel}s exist yet. You can hire without assignment and link later from Edit Employee.</p>}
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800">
                  <p className="font-medium mb-1">What happens next:</p>
                  <ul className="space-y-0.5 text-[11px] list-disc list-inside">
                    <li>A user account will be created with login credentials</li>
                    <li>The {mgrLabel.toLowerCase()} will see this {hireCandidate.position}'s data only</li>
                    <li>Welcome email with credentials will be sent</li>
                    <li>Salary / incentive can be edited from Employees tab</li>
                  </ul>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="rounded-full flex-1" onClick={()=>{setShowFinalHire(false); setHireCandidate(null); setHireMgrId("");}}>Cancel</Button>
                  <Button className="rounded-full flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={async()=>{
                    try {
                      const mgr = mgrList.find(m => m.id === hireMgrId);
                      const payload = { action: "hire" };
                      if (hireMgrId && mgr) {
                        payload.managed_by = hireMgrId;
                        payload.managed_by_name = mgr.name;
                        payload.managed_by_role = isAgent ? "district_manager" : "sales_manager";
                      }
                      const r = await axios.post(`${API}/hiring/approve/${hireCandidate.id}`, payload);
                      toast.success(r.data.message || "Hired & employee created");
                      setShowFinalHire(false); setHireCandidate(null); setHireMgrId("");
                      fetchData();
                    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
                  }} data-testid="confirm-final-hire">✓ Confirm Hire</Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
