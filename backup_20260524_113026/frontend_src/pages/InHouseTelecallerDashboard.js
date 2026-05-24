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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, Loader2, Phone, Plus, Target, Calendar, ClipboardList, UserPlus, Users, TrendingUp } from "lucide-react";
import RoleGuidelines from "../components/RoleGuidelines";
import AttendanceCheckIn from "../components/AttendanceCheckIn";
import NotificationBell from "../components/NotificationBell";

const API = "/api";

export default function InHouseTelecallerDashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const [callLogs, setCallLogs] = useState([]);
  const [dailyGoals, setDailyGoals] = useState([]);
  const [influencerEntries, setInfluencerEntries] = useState([]);
  const [influencerStats, setInfluencerStats] = useState({});
  const [hiringEntries, setHiringEntries] = useState([]);
  const [hiringStats, setHiringStats] = useState({});
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLogCall, setShowLogCall] = useState(false);
  const [showInfluencer, setShowInfluencer] = useState(false);
  const [showHiring, setShowHiring] = useState(false);
  const [showGoal, setShowGoal] = useState(false);
  const [callForm, setCallForm] = useState({ contact_name: "", phone: "", call_type: "outreach", notes: "" });
  const [infForm, setInfForm] = useState({ influencer_name: "", platform: "instagram", followers: 0, category: "nano", contact: "", status: "contacted", barter_type: "", response: "", notes: "" });
  const [hireForm, setHireForm] = useState({ name: "", phone: "", position: "telecaller", status: "contacted", location: "", experience: "", notes: "" });
  const [hireFilter, setHireFilter] = useState("all");
  const [goalForm, setGoalForm] = useState({ target_calls: 30, target_followups: 10 });

  const fetchData = useCallback(async () => {
    try {
      const [cl, dg, inf, hire, t] = await Promise.all([
        axios.get(`${API}/inhouse/call-logs`), axios.get(`${API}/inhouse/daily-goals`),
        axios.get(`${API}/influencer/outreach`).catch(() => ({ data: { entries: [], stats: {} } })),
        axios.get(`${API}/hiring/candidates`).catch(() => ({ data: { entries: [], stats: {} } })),
        axios.get(`${API}/tasks`).catch(() => ({ data: { tasks: [] } }))
      ]);
      setCallLogs(cl.data.call_logs || []); setDailyGoals(dg.data.goals || []);
      setInfluencerEntries(inf.data.entries || []); setInfluencerStats(inf.data.stats || {});
      setHiringEntries(hire.data.entries || []); setHiringStats(hire.data.stats || {});
      setTasks(t.data.tasks || []);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const logCall = async () => {
    if (!callForm.contact_name) return toast.error("Name required");
    try { await axios.post(`${API}/inhouse/call-logs`, callForm); toast.success("Call logged!"); setShowLogCall(false); setCallForm({ contact_name: "", phone: "", call_type: "outreach", notes: "" }); fetchData(); } catch (e) { toast.error("Failed"); }
  };

  const logInfluencer = async () => {
    if (!infForm.influencer_name) return toast.error("Name required");
    try { await axios.post(`${API}/influencer/outreach`, infForm); toast.success("Influencer logged!"); setShowInfluencer(false); setInfForm({ influencer_name: "", platform: "instagram", followers: 0, category: "nano", contact: "", status: "contacted", barter_type: "", response: "", notes: "" }); fetchData(); } catch (e) { toast.error("Failed"); }
  };

  const logHiring = async () => {
    if (!hireForm.name) return toast.error("Name required");
    try { await axios.post(`${API}/hiring/candidates`, hireForm); toast.success("Candidate logged!"); setShowHiring(false); setHireForm({ name: "", phone: "", position: "telecaller", status: "contacted", location: "", experience: "", notes: "" }); fetchData(); } catch (e) { toast.error("Failed"); }
  };

  const setGoal = async () => {
    try { await axios.post(`${API}/inhouse/daily-goals`, goalForm); toast.success("Goal set!"); setShowGoal(false); fetchData(); } catch { toast.error("Failed"); }
  };

  const updateInfluencerStatus = async (id, status) => {
    try { await axios.put(`${API}/influencer/outreach/${id}`, { status }); toast.success("Updated"); fetchData(); } catch { toast.error("Failed"); }
  };

  const updateHiringStatus = async (id, status) => {
    try { await axios.put(`${API}/hiring/candidates/${id}`, { status }); toast.success("Updated"); fetchData(); } catch { toast.error("Failed"); }
  };

  const logout = () => { localStorage.clear(); navigate("/login"); };
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F9F8F6]"><Loader2 className="w-8 h-8 animate-spin text-[#3B5249]" /></div>;

  const today = new Date().toISOString().slice(0, 10);
  const todayCalls = callLogs.filter(c => c.created_at?.slice(0, 10) === today);
  const todayGoal = dailyGoals.find(g => g.date === today);

  return (
    <div className="min-h-screen bg-[#F9F8F6]" data-testid="inhouse-telecaller-dashboard">
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#F9F8F6]/80 border-b border-[#E5E3DB]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div><h1 className="font-heading text-xl font-medium text-[#2C3531]">Celesta <span className="text-[#3B5249] font-semibold">Glow</span></h1><p className="text-xs text-[#59615D] uppercase tracking-[0.15em]">In-House Telecaller - {user.name}</p></div>
          <div className="flex items-center gap-2"><NotificationBell /><AttendanceCheckIn /><Button variant="outline" onClick={logout} className="rounded-full border-[#E5E3DB] text-sm"><LogOut className="w-4 h-4 mr-1" />Logout</Button></div>
        </div>
      </div>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
        <RoleGuidelines role="inhouse_telecaller" />

        {/* Today's Progress */}
        <div className="bg-white rounded-xl border border-[#E5E3DB] p-4 mb-4">
          <div className="flex justify-between items-center mb-2"><p className="text-xs font-medium uppercase text-[#59615D]">Today's Progress</p><Button size="sm" variant="outline" className="rounded-full text-[10px] h-6" onClick={() => setShowGoal(true)}>Set Goal</Button></div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#F9F8F6] rounded-lg p-3 text-center"><Phone className="w-4 h-4 mx-auto mb-1 text-[#3B5249]" /><p className="font-heading text-xl font-bold">{todayCalls.length}{todayGoal ? `/${todayGoal.target_calls}` : ""}</p><p className="text-[9px] text-[#59615D]">Calls</p></div>
            <div className="bg-[#F9F8F6] rounded-lg p-3 text-center"><Users className="w-4 h-4 mx-auto mb-1 text-[#6B8E6B]" /><p className="font-heading text-xl font-bold">{influencerStats.total || 0}</p><p className="text-[9px] text-[#59615D]">Influencers</p></div>
            <div className="bg-[#F9F8F6] rounded-lg p-3 text-center"><TrendingUp className="w-4 h-4 mx-auto mb-1 text-[#D4A373]" /><p className="font-heading text-xl font-bold">{influencerStats.converted || 0}</p><p className="text-[9px] text-[#59615D]">Converted</p></div>
            <div className="bg-[#F9F8F6] rounded-lg p-3 text-center"><UserPlus className="w-4 h-4 mx-auto mb-1 text-[#A66E4E]" /><p className="font-heading text-xl font-bold">{hiringStats.hired || 0}</p><p className="text-[9px] text-[#59615D]">Hired</p></div>
          </div>
          {todayGoal && <div className="mt-2"><div className="w-full bg-[#E5E3DB] rounded-full h-2"><div className="bg-[#3B5249] h-2 rounded-full transition-all" style={{ width: `${Math.min(100, (todayCalls.length / todayGoal.target_calls) * 100)}%` }} /></div></div>}
        </div>

        <Tabs defaultValue="influencer" className="space-y-4">
          <TabsList className="bg-white border border-[#E5E3DB] rounded-full p-1 h-auto flex-wrap gap-0.5">
            {[{ v: "influencer", l: "Influencer Outreach" }, { v: "hiring", l: "HR Hiring" }, { v: "calls", l: "Call Log" }, { v: "tasks", l: "Tasks" }, { v: "mysheet", l: "My Sheet" }].map(t => (
              <TabsTrigger key={t.v} value={t.v} className="rounded-full text-[11px] data-[state=active]:bg-[#3B5249] data-[state=active]:text-white px-3">{t.l}</TabsTrigger>
            ))}
          </TabsList>

          {/* INFLUENCER OUTREACH */}
          <TabsContent value="influencer"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <div className="flex justify-between mb-4">
              <h3 className="font-heading text-lg font-medium">Influencer Outreach</h3>
              <Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={() => setShowInfluencer(true)} data-testid="add-influencer-btn"><Plus className="w-3 h-3 mr-1" />Log Outreach</Button>
            </div>
            <div className="grid grid-cols-5 gap-2 mb-4">
              {[{ l: "Called", v: influencerStats.total || 0, c: "#59615D" }, { l: "Responded", v: influencerStats.responded || 0, c: "#3B5249" }, { l: "Converted", v: influencerStats.converted || 0, c: "#6B8E6B" }, { l: "Product Sent", v: influencerStats.product_sent || 0, c: "#A66E4E" }, { l: "Rate", v: influencerStats.total ? Math.round((influencerStats.converted || 0) / influencerStats.total * 100) + "%" : "0%", c: "#D4A373" }].map((s, i) => (
                <div key={i} className="bg-[#F9F8F6] rounded-lg p-2 text-center"><p className="text-[9px] text-[#59615D] uppercase">{s.l}</p><p className="font-heading text-sm font-bold" style={{ color: s.c }}>{s.v}</p></div>
              ))}
            </div>
            {influencerEntries.length === 0 ? <p className="text-center py-6 text-[#59615D] text-sm">No outreach yet. Start finding influencers!</p> :
              <div className="space-y-2">{influencerEntries.map(e => (
                <div key={e.id} className="border border-[#E5E3DB] rounded-lg p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2"><p className="font-medium text-xs">{e.influencer_name}</p><Badge variant="outline" className="text-[8px] capitalize">{e.category}</Badge><Badge variant="outline" className="text-[8px]">{e.platform}</Badge></div>
                      <p className="text-[10px] text-[#59615D]">{e.followers} followers | {e.contact}</p>
                      {e.barter_type && <p className="text-[9px] text-[#A66E4E]">Barter: {e.barter_type}</p>}
                      {e.notes && <p className="text-[9px] text-[#59615D]">{e.notes}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Select value={e.status} onValueChange={v => updateInfluencerStatus(e.id, v)}><SelectTrigger className="h-6 w-24 text-[9px] rounded-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="contacted">Contacted</SelectItem><SelectItem value="responded">Responded</SelectItem><SelectItem value="converted">Converted</SelectItem><SelectItem value="product_sent">Product Sent</SelectItem><SelectItem value="rejected">Rejected</SelectItem></SelectContent></Select>
                    </div>
                  </div>
                </div>
              ))}</div>}
          </div></TabsContent>

          {/* HIRING */}
          <TabsContent value="hiring"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <div className="flex justify-between mb-4">
              <h3 className="font-heading text-lg font-medium">HR Hiring Support</h3>
              <Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={() => setShowHiring(true)} data-testid="add-candidate-btn"><Plus className="w-3 h-3 mr-1" />Log Candidate</Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2 mb-4">
              {[{ l: "Total", v: hiringEntries.length, k:"all" }, { l: "Contacted", v: hiringEntries.filter(e=>e.status==='contacted').length, k:"contacted" }, { l: "Not Answering", v: hiringEntries.filter(e=>e.status==='not_answering').length, k:"not_answering" }, { l: "Interested", v: hiringEntries.filter(e=>e.status==='interested').length, k:"interested" }, { l: "Interviewed", v: hiringEntries.filter(e=>e.status==='interviewed').length, k:"interviewed" }, { l: "Hired", v: hiringEntries.filter(e=>e.status==='hired').length, k:"hired" }, { l: "Rejected", v: hiringEntries.filter(e=>e.status==='rejected').length, k:"rejected" }].map((s, i) => (
                <button key={i} onClick={()=>setHireFilter(s.k)} data-testid={`ih-hf-${s.k}`} className={`rounded-lg p-2 text-center transition-all ${hireFilter===s.k?"bg-[#3B5249] text-white shadow-sm":"bg-[#F9F8F6] hover:bg-[#E5E3DB]"}`}><p className={`text-[9px] uppercase ${hireFilter===s.k?"text-white/80":"text-[#59615D]"}`}>{s.l}</p><p className="font-heading text-sm font-bold">{s.v}</p></button>
              ))}
            </div>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-[10px] text-[#59615D] font-medium uppercase">Filter:</span>
              <Select value={hireFilter} onValueChange={setHireFilter}>
                <SelectTrigger className="w-44 h-8 text-xs rounded-full" data-testid="ih-hire-filter"><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Candidates</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="not_answering">Not Answering</SelectItem>
                  <SelectItem value="no_response">No Response</SelectItem>
                  <SelectItem value="interested">Interested</SelectItem>
                  <SelectItem value="not_interested">Not Interested</SelectItem>
                  <SelectItem value="callback">Callback Required</SelectItem>
                  <SelectItem value="interviewed">Interviewed</SelectItem>
                  <SelectItem value="hired">Hired</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              {hireFilter !== "all" && <Button size="sm" variant="outline" className="rounded-full text-[10px] h-7" onClick={()=>setHireFilter("all")}>Clear</Button>}
            </div>
            {(() => {
              const filteredHire = hireFilter === "all" ? hiringEntries : hiringEntries.filter(e => e.status === hireFilter);
              return filteredHire.length === 0 ? <p className="text-center py-6 text-[#59615D] text-sm">{hireFilter==="all"?"No candidates yet":`No candidates with status "${hireFilter.replace(/_/g," ")}"`}</p> :
              <div className="space-y-2">{filteredHire.map(e => (
                <div key={e.id} className="border border-[#E5E3DB] rounded-lg p-3 flex justify-between items-start">
                  <div><div className="flex items-center gap-2 flex-wrap"><p className="font-medium text-xs">{e.name}</p><Badge variant="outline" className="text-[8px] capitalize">{e.position}</Badge><Badge className={`text-[8px] capitalize ${e.status==='hired'?'bg-green-100 text-green-800':e.status==='rejected'||e.status==='not_interested'?'bg-red-100 text-red-800':e.status==='not_answering'||e.status==='no_response'?'bg-orange-100 text-orange-800':e.status==='callback'?'bg-cyan-100 text-cyan-800':e.status==='interviewed'?'bg-purple-100 text-purple-800':'bg-yellow-100 text-yellow-800'}`}>{(e.status||"").replace(/_/g," ")}</Badge></div><p className="text-[10px] text-[#59615D]">{e.phone} | {e.location}</p>{e.experience && <p className="text-[9px] text-[#A66E4E]">Exp: {e.experience}</p>}{e.notes && <p className="text-[9px] text-[#59615D]">{e.notes}</p>}</div>
                  <Select value={e.status} onValueChange={v => updateHiringStatus(e.id, v)}><SelectTrigger className="h-6 w-32 text-[9px] rounded-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="contacted">Contacted</SelectItem><SelectItem value="not_answering">Not Answering</SelectItem><SelectItem value="no_response">No Response</SelectItem><SelectItem value="interested">Interested</SelectItem><SelectItem value="not_interested">Not Interested</SelectItem><SelectItem value="callback">Callback Required</SelectItem><SelectItem value="interviewed">Interviewed</SelectItem><SelectItem value="hired">Hired</SelectItem><SelectItem value="rejected">Rejected</SelectItem></SelectContent></Select>
                </div>
              ))}</div>;
            })()}
          </div></TabsContent>

          {/* CALL LOG */}
          <TabsContent value="calls"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <div className="flex justify-between mb-4">
              <h3 className="font-heading text-lg font-medium">Call Log ({todayCalls.length} today)</h3>
              <Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={() => setShowLogCall(true)}><Plus className="w-3 h-3 mr-1" />Log Call</Button>
            </div>
            {callLogs.length === 0 ? <p className="text-center py-6 text-[#59615D] text-sm">No calls logged</p> :
              <div className="space-y-1">{callLogs.slice(0, 30).map(c => (
                <div key={c.id} className="border border-[#E5E3DB] rounded-lg p-2 flex justify-between text-xs"><div><span className="font-medium">{c.contact_name}</span> <Badge variant="outline" className="text-[8px] capitalize">{c.call_type}</Badge> <span className="text-[#59615D]">{c.phone}</span></div><span className="text-[10px] text-[#59615D]">{c.created_at?.slice(11, 16)}</span></div>
              ))}</div>}
          </div></TabsContent>

          {/* TASKS */}
          <TabsContent value="tasks"><div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
            <h3 className="font-heading text-lg font-medium mb-4">My Tasks</h3>
            {tasks.length === 0 ? <p className="text-center py-6 text-[#59615D] text-sm">No tasks assigned</p> :
              <div className="space-y-2">{tasks.map(t => (
                <div key={t.id} className="border border-[#E5E3DB] rounded-lg p-3"><p className="font-medium text-xs">{t.title}</p><p className="text-[10px] text-[#59615D]">{t.description || t.content}</p><Badge className={`text-[8px] mt-1 ${t.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{t.status}</Badge></div>
              ))}</div>}
          </div></TabsContent>
          <TabsContent value="mysheet" className="animate-fade-in"><DailyTaskSheet titleSuffix="In-House Telecaller" /></TabsContent>
        </Tabs>
      </div>

      {/* LOG CALL */}
      <Dialog open={showLogCall} onOpenChange={setShowLogCall}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Log Call</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Contact Name</Label><Input value={callForm.contact_name} onChange={e => setCallForm(f => ({ ...f, contact_name: e.target.value }))} className="rounded-xl" /></div>
          <div><Label className="text-xs">Phone</Label><Input value={callForm.phone} onChange={e => setCallForm(f => ({ ...f, phone: e.target.value }))} className="rounded-xl" /></div>
          <div><Label className="text-xs">Type</Label><Select value={callForm.call_type} onValueChange={v => setCallForm(f => ({ ...f, call_type: v }))}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="outreach">Influencer Outreach</SelectItem><SelectItem value="follow_up">Follow Up</SelectItem><SelectItem value="hiring">HR Hiring</SelectItem></SelectContent></Select></div>
          <div><Label className="text-xs">Notes</Label><Textarea value={callForm.notes} onChange={e => setCallForm(f => ({ ...f, notes: e.target.value }))} className="rounded-xl" /></div>
          <Button onClick={logCall} className="w-full rounded-full bg-[#3B5249] text-white">Log Call</Button>
        </div>
      </DialogContent></Dialog>

      {/* LOG INFLUENCER */}
      <Dialog open={showInfluencer} onOpenChange={setShowInfluencer}><DialogContent className="rounded-2xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle className="font-heading">Log Influencer Outreach</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Influencer Name</Label><Input value={infForm.influencer_name} onChange={e => setInfForm(f => ({ ...f, influencer_name: e.target.value }))} className="rounded-xl" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Platform</Label><Select value={infForm.platform} onValueChange={v => setInfForm(f => ({ ...f, platform: v }))}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="instagram">Instagram</SelectItem><SelectItem value="youtube">YouTube</SelectItem><SelectItem value="facebook">Facebook</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select></div>
            <div><Label className="text-xs">Category</Label><Select value={infForm.category} onValueChange={v => setInfForm(f => ({ ...f, category: v }))}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nano">Nano (1K-10K)</SelectItem><SelectItem value="micro">Micro (10K-50K)</SelectItem><SelectItem value="medium">Medium (50K-200K)</SelectItem><SelectItem value="macro">Macro (200K+)</SelectItem></SelectContent></Select></div>
          </div>
          <div><Label className="text-xs">Followers</Label><Input type="number" value={infForm.followers} onChange={e => setInfForm(f => ({ ...f, followers: Number(e.target.value) }))} className="rounded-xl" /></div>
          <div><Label className="text-xs">Contact (Phone/Email)</Label><Input value={infForm.contact} onChange={e => setInfForm(f => ({ ...f, contact: e.target.value }))} className="rounded-xl" /></div>
          <div><Label className="text-xs">Barter Type</Label><Input value={infForm.barter_type} onChange={e => setInfForm(f => ({ ...f, barter_type: e.target.value }))} placeholder="e.g. Free product for review" className="rounded-xl" /></div>
          <div><Label className="text-xs">Notes</Label><Textarea value={infForm.notes} onChange={e => setInfForm(f => ({ ...f, notes: e.target.value }))} className="rounded-xl" /></div>
          <Button onClick={logInfluencer} className="w-full rounded-full bg-[#3B5249] text-white">Log Outreach</Button>
        </div>
      </DialogContent></Dialog>

      {/* LOG HIRING CANDIDATE */}
      <Dialog open={showHiring} onOpenChange={setShowHiring}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Log Hiring Candidate</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Candidate Name</Label><Input value={hireForm.name} onChange={e => setHireForm(f => ({ ...f, name: e.target.value }))} className="rounded-xl" /></div>
          <div><Label className="text-xs">Phone</Label><Input value={hireForm.phone} onChange={e => setHireForm(f => ({ ...f, phone: e.target.value }))} className="rounded-xl" /></div>
          <div><Label className="text-xs">Position</Label><Select value={hireForm.position} onValueChange={v => setHireForm(f => ({ ...f, position: v }))}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="telecaller">Telecaller</SelectItem><SelectItem value="agent">Agent</SelectItem><SelectItem value="telesales">Telesales</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select></div>
          <div><Label className="text-xs">Location</Label><Input value={hireForm.location} onChange={e => setHireForm(f => ({ ...f, location: e.target.value }))} className="rounded-xl" /></div>
          <div><Label className="text-xs">Experience</Label><Input value={hireForm.experience} onChange={e => setHireForm(f => ({ ...f, experience: e.target.value }))} placeholder="e.g. 2 years sales" className="rounded-xl" /></div>
          <div><Label className="text-xs">Notes</Label><Textarea value={hireForm.notes} onChange={e => setHireForm(f => ({ ...f, notes: e.target.value }))} className="rounded-xl" /></div>
          <Button onClick={logHiring} className="w-full rounded-full bg-[#3B5249] text-white">Log Candidate</Button>
        </div>
      </DialogContent></Dialog>

      {/* SET GOAL */}
      <Dialog open={showGoal} onOpenChange={setShowGoal}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Set Daily Goal</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Target Calls</Label><Input type="number" value={goalForm.target_calls} onChange={e => setGoalForm(f => ({ ...f, target_calls: Number(e.target.value) }))} className="rounded-xl" /></div>
          <div><Label className="text-xs">Target Follow-ups</Label><Input type="number" value={goalForm.target_followups} onChange={e => setGoalForm(f => ({ ...f, target_followups: Number(e.target.value) }))} className="rounded-xl" /></div>
          <Button onClick={setGoal} className="w-full rounded-full bg-[#3B5249] text-white">Set Goal</Button>
        </div>
      </DialogContent></Dialog>
    </div>
  );
}
