import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import DailyTaskSheet from "@/components/DailyTaskSheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LogOut, Loader2, Plus, TrendingUp, Target, Eye, MessageSquare, IndianRupee } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, BarChart, Bar, Legend, CartesianGrid } from "recharts";
import RoleGuidelines from "../components/RoleGuidelines";
import MonthFilter from "../components/MonthFilter";
import AttendanceCheckIn from "../components/AttendanceCheckIn";
import NotificationBell from "../components/NotificationBell";

const API = "/api";

// Sub-platforms grouped under Meta vs Google
const META_SUBS = [
  { v: "facebook", l: "Facebook Ads" },
  { v: "instagram", l: "Instagram Ads" },
  { v: "whatsapp", l: "WhatsApp Ads" },
];
const GOOGLE_SUBS = [
  { v: "google_search", l: "Google Search" },
  { v: "google_display", l: "Google Display" },
  { v: "youtube", l: "YouTube Ads" },
];

const platformLabel = (p) => p === "meta" ? "📘 Meta" : p === "google" ? "🔴 Google" : p?.toUpperCase() || "OTHER";

export default function DigitalMarketingDashboard() {
  const navigate = useNavigate();
  const [user] = useState(() => JSON.parse(localStorage.getItem("user") || "{}"));
  const [loading, setLoading] = useState(true);

  const [campaigns, setCampaigns] = useState([]);
  const [leads, setLeads] = useState([]);
  const [overview, setOverview] = useState({ today: {}, week: {}, chart: [] });
  const [platformGroups, setPlatformGroups] = useState([]);
  const [todayUpdate, setTodayUpdate] = useState({}); // { campaignId: {leads, impressions, messages, clicks, spend, conversions} }

  const [showCampaign, setShowCampaign] = useState(false);
  const [editingCamp, setEditingCamp] = useState(null);
  const [campForm, setCampForm] = useState({
    name: "", platform: "meta", sub_platform: "facebook", ad_type: "image",
    objective: "leads", audience: "", budget: 0, daily_budget: 0, weekly_budget: 0,
    start_date: "", end_date: "", status: "running",
    manager_id: "", manager_role: "", manager_name: ""
  });
  const [allManagers, setAllManagers] = useState([]);
  const [resultsCampaign, setResultsCampaign] = useState("");
  const [resultsForm, setResultsForm] = useState({date:new Date().toISOString().slice(0,10),leads:0,impressions:0,messages:0,clicks:0,spend:0,conversions:0,notes:""});

  const [activeTab, setActiveTab] = useState("today");

  const fetchData = useCallback(async () => {
    try {
      const [c, l, ov, pg, mgrs] = await Promise.all([
        axios.get(`${API}/campaigns`).catch(() => ({ data: { campaigns: [] } })),
        axios.get(`${API}/campaign-leads`).catch(() => ({ data: { leads: [] } })),
        axios.get(`${API}/campaigns/overview`).catch(() => ({ data: { today: {}, week: {}, chart: [] } })),
        axios.get(`${API}/campaigns/by-platform`).catch(() => ({ data: { groups: [] } })),
        axios.get(`${API}/all-managers`).catch(() => ({ data: { managers: [] } })),
      ]);
      setCampaigns(c.data.campaigns || []);
      setLeads(l.data.leads || []);
      setOverview(ov.data);
      setPlatformGroups(pg.data.groups || []);
      setAllManagers(mgrs.data.managers || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const submitCampaign = async () => {
    if (!campForm.name) return toast.error("Name required");
    try {
      if (editingCamp) {
        await axios.put(`${API}/campaigns/${editingCamp.id}`, campForm);
        toast.success("Updated");
      } else {
        await axios.post(`${API}/campaigns`, campForm);
        toast.success("Created");
      }
      setShowCampaign(false); setEditingCamp(null);
      setCampForm({ name: "", platform: "meta", sub_platform: "facebook", ad_type: "image", objective: "leads", audience: "", budget: 0, daily_budget: 0, weekly_budget: 0, start_date: "", end_date: "", status: "running", manager_id: "", manager_role: "", manager_name: "" });
      fetchData();
    } catch { toast.error("Failed"); }
  };

  const deleteCampaign = async (cid) => {
    if (!window.confirm("Delete campaign?")) return;
    try { await axios.delete(`${API}/campaigns/${cid}`); toast.success("Deleted"); fetchData(); }
    catch { toast.error("Failed"); }
  };

  const submitTodayUpdate = async () => {
    const updates = Object.entries(todayUpdate)
      .filter(([_, v]) => v && (Number(v.leads) || Number(v.impressions) || Number(v.spend) || Number(v.messages)))
      .map(([campaign_id, v]) => ({ campaign_id, ...v }));
    if (updates.length === 0) return toast.error("Enter at least one metric");
    try {
      const r = await axios.post(`${API}/campaigns/quick-update`, { updates });
      toast.success(`Saved ${r.data.saved} campaigns for ${r.data.date}`);
      setTodayUpdate({});
      fetchData();
    } catch { toast.error("Failed"); }
  };

  const updateLeadStatus = async (lid, status) => {
    try { await axios.put(`${API}/campaign-leads/${lid}`, { status }); toast.success("Updated"); fetchData(); }
    catch { toast.error("Failed"); }
  };

  const logout = () => { localStorage.clear(); navigate("/login"); };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F9F8F6]"><Loader2 className="w-8 h-8 animate-spin text-[#3B5249]" /></div>;

  const runningCampaigns = campaigns.filter(c => c.status === "running");
  const metaCampaigns = campaigns.filter(c => c.platform === "meta" || META_SUBS.some(s => s.v === c.platform));
  const googleCampaigns = campaigns.filter(c => c.platform === "google" || GOOGLE_SUBS.some(s => s.v === c.platform));

  const KPI = ({ label, value, accent }) => (
    <div className="bg-white rounded-xl p-4 border border-[#E5E3DB]">
      <p className="text-[10px] uppercase text-[#59615D] tracking-wide">{label}</p>
      <p className={`font-heading text-2xl font-bold ${accent || "text-[#2C3531]"}`}>{value}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F9F8F6]">
      <div className="bg-white border-b border-[#E5E3DB] sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="font-heading text-xl font-medium text-[#2C3531]">Celesta <span className="text-[#3B5249] font-semibold">Glow</span></h1>
            <p className="text-xs text-[#59615D] uppercase tracking-[0.15em]">Digital Marketing - {user.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <AttendanceCheckIn />
            <Button variant="outline" onClick={logout} className="rounded-full border-[#E5E3DB] text-sm" data-testid="logout-btn">
              <LogOut className="w-4 h-4 mr-1" />Logout
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <RoleGuidelines role="digital_marketing_manager" />

        {/* HERO KPI ROW */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
          <KPI label="Today's Leads" value={overview.today?.leads || 0} accent="text-[#6B8E6B]" />
          <KPI label="Today's Impressions" value={overview.today?.impressions || 0} />
          <KPI label="Today's Messages" value={overview.today?.messages || 0} accent="text-[#3B5249]" />
          <KPI label="Today's Spend" value={`Rs.${overview.today?.spend || 0}`} accent="text-[#A66E4E]" />
          <KPI label="Running Campaigns" value={runningCampaigns.length} accent="text-[#D4A373]" />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-white border border-[#E5E3DB] rounded-full p-1 flex-wrap gap-1">
            <TabsTrigger value="today" className="rounded-full text-[11px] data-[state=active]:bg-[#3B5249] data-[state=active]:text-white px-3" data-testid="dm-tab-today">📝 Today's Update</TabsTrigger>
            <TabsTrigger value="meta" className="rounded-full text-[11px] data-[state=active]:bg-blue-600 data-[state=active]:text-white px-3" data-testid="dm-tab-meta">📘 Meta ({metaCampaigns.length})</TabsTrigger>
            <TabsTrigger value="google" className="rounded-full text-[11px] data-[state=active]:bg-red-600 data-[state=active]:text-white px-3" data-testid="dm-tab-google">🔴 Google ({googleCampaigns.length})</TabsTrigger>
            <TabsTrigger value="leads" className="rounded-full text-[11px] data-[state=active]:bg-[#3B5249] data-[state=active]:text-white px-3" data-testid="dm-tab-leads">Results ({leads.length})</TabsTrigger>
            <TabsTrigger value="performance" className="rounded-full text-[11px] data-[state=active]:bg-[#3B5249] data-[state=active]:text-white px-3" data-testid="dm-tab-performance">📊 Performance</TabsTrigger>
            <TabsTrigger value="mysheet" className="rounded-full text-[11px] data-[state=active]:bg-[#3B5249] data-[state=active]:text-white px-3" data-testid="dm-tab-mysheet">📋 My Sheet</TabsTrigger>
          </TabsList>

          {/* ===== TODAY'S UPDATE — Quick batch entry across running campaigns ===== */}
          <TabsContent value="today">
            <div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
              <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                <div>
                  <h3 className="font-heading text-lg font-medium">Today's Numbers — {new Date().toISOString().slice(0, 10)}</h3>
                  <p className="text-[11px] text-[#59615D]">Enter today's metrics across all running campaigns. Auto-saves to daily history.</p>
                </div>
                <Button onClick={submitTodayUpdate} className="rounded-full bg-[#3B5249] text-white" data-testid="save-today-btn">
                  💾 Save Today's Update ({Object.keys(todayUpdate).filter(k => todayUpdate[k]).length})
                </Button>
              </div>

              {/* Trend chart */}
              {(overview.chart || []).length > 0 && (
                <div className="bg-[#F9F8F6] rounded-xl p-3 mb-4">
                  <h4 className="text-xs font-medium mb-2 text-[#59615D]">7-Day Trend (Leads & Spend)</h4>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={overview.chart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E3DB" />
                      <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={10} />
                      <YAxis fontSize={10} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="leads" stroke="#6B8E6B" strokeWidth={2} name="Leads" />
                      <Line type="monotone" dataKey="messages" stroke="#3B5249" strokeWidth={2} name="Messages" />
                      <Line type="monotone" dataKey="spend" stroke="#A66E4E" strokeWidth={2} name="Spend (Rs.)" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {runningCampaigns.length === 0 ? (
                <div className="text-center py-8 text-[#59615D]">
                  <p className="text-sm">No running campaigns. Create one in Meta or Google tab.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-[#F9F8F6]">
                        {["Campaign", "Platform", "Leads", "Impressions", "Messages", "Clicks", "Spend (Rs.)", "Conversions"].map(h => (
                          <th key={h} className="p-2 text-left text-[9px] uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {runningCampaigns.map(c => {
                        const v = todayUpdate[c.id] || {};
                        const setVal = (k, val) => setTodayUpdate(s => ({ ...s, [c.id]: { ...s[c.id], [k]: val } }));
                        return (
                          <tr key={c.id} className="border-b border-[#E5E3DB]" data-testid={`today-row-${c.id}`}>
                            <td className="p-2 font-medium">{c.name}</td>
                            <td className="p-2"><Badge className={`text-[8px] capitalize ${c.platform === "meta" ? "bg-blue-100 text-blue-800" : c.platform === "google" ? "bg-red-100 text-red-800" : ""}`}>{c.platform}{c.sub_platform ? `/${c.sub_platform.replace("_", " ")}` : ""}</Badge></td>
                            <td className="p-2"><Input type="number" value={v.leads || ""} onChange={e => setVal("leads", e.target.value)} placeholder="0" className="h-7 w-16 text-xs rounded-md" data-testid={`today-leads-${c.id}`} /></td>
                            <td className="p-2"><Input type="number" value={v.impressions || ""} onChange={e => setVal("impressions", e.target.value)} placeholder="0" className="h-7 w-20 text-xs rounded-md" data-testid={`today-impr-${c.id}`} /></td>
                            <td className="p-2"><Input type="number" value={v.messages || ""} onChange={e => setVal("messages", e.target.value)} placeholder="0" className="h-7 w-16 text-xs rounded-md" data-testid={`today-msg-${c.id}`} /></td>
                            <td className="p-2"><Input type="number" value={v.clicks || ""} onChange={e => setVal("clicks", e.target.value)} placeholder="0" className="h-7 w-16 text-xs rounded-md" /></td>
                            <td className="p-2"><Input type="number" value={v.spend || ""} onChange={e => setVal("spend", e.target.value)} placeholder="0" className="h-7 w-20 text-xs rounded-md" data-testid={`today-spend-${c.id}`} /></td>
                            <td className="p-2"><Input type="number" value={v.conversions || ""} onChange={e => setVal("conversions", e.target.value)} placeholder="0" className="h-7 w-16 text-xs rounded-md" /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ===== META CAMPAIGNS ===== */}
          <TabsContent value="meta">
            <div className="bg-white rounded-xl border-2 border-blue-200 p-5">
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <div>
                  <h3 className="font-heading text-lg font-medium text-blue-900">📘 Meta Campaigns (Facebook + Instagram + WhatsApp)</h3>
                  <p className="text-[11px] text-[#59615D]">Manage campaigns running on Meta family of platforms</p>
                </div>
                <Button onClick={() => { setEditingCamp(null); setCampForm({ ...campForm, platform: "meta", sub_platform: "facebook" }); setShowCampaign(true); }} className="rounded-full bg-blue-600 text-white" data-testid="new-meta-btn">
                  <Plus className="w-3 h-3 mr-1" />New Meta Campaign
                </Button>
              </div>
              <PlatformBreakdown groups={platformGroups.filter(g => g.platform === "meta")} accent="blue" />
              <CampaignList campaigns={metaCampaigns} accent="blue" onEdit={(c) => { setEditingCamp(c); setCampForm({ name: c.name || "", platform: c.platform || "meta", sub_platform: c.sub_platform || "facebook", ad_type: c.ad_type || "image", objective: c.objective || "leads", audience: c.audience || "", budget: c.budget || 0, start_date: c.start_date || "", end_date: c.end_date || "", status: c.status || "running" }); setShowCampaign(true); }} onDelete={deleteCampaign} />
            </div>
          </TabsContent>

          {/* ===== GOOGLE CAMPAIGNS ===== */}
          <TabsContent value="google">
            <div className="bg-white rounded-xl border-2 border-red-200 p-5">
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <div>
                  <h3 className="font-heading text-lg font-medium text-red-900">🔴 Google Campaigns (Search + Display + YouTube)</h3>
                  <p className="text-[11px] text-[#59615D]">Manage campaigns running on Google Ads ecosystem</p>
                </div>
                <Button onClick={() => { setEditingCamp(null); setCampForm({ ...campForm, platform: "google", sub_platform: "google_search" }); setShowCampaign(true); }} className="rounded-full bg-red-600 text-white" data-testid="new-google-btn">
                  <Plus className="w-3 h-3 mr-1" />New Google Campaign
                </Button>
              </div>
              <PlatformBreakdown groups={platformGroups.filter(g => g.platform === "google")} accent="red" />
              <CampaignList campaigns={googleCampaigns} accent="red" onEdit={(c) => { setEditingCamp(c); setCampForm({ name: c.name || "", platform: c.platform || "google", sub_platform: c.sub_platform || "google_search", ad_type: c.ad_type || "search", objective: c.objective || "leads", audience: c.audience || "", budget: c.budget || 0, start_date: c.start_date || "", end_date: c.end_date || "", status: c.status || "running" }); setShowCampaign(true); }} onDelete={deleteCampaign} />
            </div>
          </TabsContent>

          {/* ===== RESULTS — campaign-centric daily numbers (no customer fields) ===== */}
          <TabsContent value="leads">
            <div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
              <h3 className="font-heading text-lg font-medium mb-3">📊 Daily Results — Log Numbers per Campaign</h3>
              <p className="text-[11px] text-[#59615D] mb-4">Select a campaign → enter today's numbers (spent, leads/objective achieved, messages, etc.). Manager assigned to campaign will be notified automatically.</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <div>
                  <Label className="text-xs">Campaign *</Label>
                  <Select value={resultsCampaign} onValueChange={setResultsCampaign}>
                    <SelectTrigger className="rounded-xl" data-testid="results-camp-select"><SelectValue placeholder="Select campaign" /></SelectTrigger>
                    <SelectContent>
                      {campaigns.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name} ({c.platform}{c.sub_platform ? `/${c.sub_platform.replace("_", " ")}` : ""}) — Obj: {c.objective}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Date</Label><Input type="date" value={resultsForm.date} onChange={e=>setResultsForm(f=>({...f,date:e.target.value}))} className="rounded-xl" /></div>
                <div><Label className="text-xs">Spend Today (Rs.)</Label><Input type="number" value={resultsForm.spend} onChange={e=>setResultsForm(f=>({...f,spend:e.target.value}))} className="rounded-xl" data-testid="results-spend"/></div>
              </div>

              {resultsCampaign && (() => {
                const c = campaigns.find(x => x.id === resultsCampaign);
                if (!c) return null;
                return (
                  <div className="bg-[#F9F8F6] rounded-xl p-3 mb-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div><p className="text-[9px] uppercase text-[#59615D]">Objective</p><p className="font-bold capitalize">{c.objective}</p></div>
                    <div><p className="text-[9px] uppercase text-[#59615D]">Total Budget</p><p className="font-bold">Rs.{c.budget||0}</p></div>
                    <div><p className="text-[9px] uppercase text-[#59615D]">Daily Budget</p><p className="font-bold">Rs.{c.daily_budget||0}</p></div>
                    <div><p className="text-[9px] uppercase text-[#59615D]">Weekly Budget</p><p className="font-bold">Rs.{c.weekly_budget||0}</p></div>
                    <div className="col-span-2 md:col-span-4"><p className="text-[9px] uppercase text-[#59615D]">Manager</p><p className="font-bold">{c.manager_name || "—"} {c.manager_role && <Badge variant="outline" className="text-[8px] ml-1 capitalize">{c.manager_role.replace(/_/g," ")}</Badge>}</p></div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <div><Label className="text-xs">Leads / Objective Achieved</Label><Input type="number" value={resultsForm.leads} onChange={e=>setResultsForm(f=>({...f,leads:e.target.value}))} className="rounded-xl" data-testid="results-leads"/></div>
                <div><Label className="text-xs">Impressions</Label><Input type="number" value={resultsForm.impressions} onChange={e=>setResultsForm(f=>({...f,impressions:e.target.value}))} className="rounded-xl"/></div>
                <div><Label className="text-xs">Messages</Label><Input type="number" value={resultsForm.messages} onChange={e=>setResultsForm(f=>({...f,messages:e.target.value}))} className="rounded-xl"/></div>
                <div><Label className="text-xs">Clicks</Label><Input type="number" value={resultsForm.clicks} onChange={e=>setResultsForm(f=>({...f,clicks:e.target.value}))} className="rounded-xl"/></div>
                <div><Label className="text-xs">Conversions</Label><Input type="number" value={resultsForm.conversions} onChange={e=>setResultsForm(f=>({...f,conversions:e.target.value}))} className="rounded-xl"/></div>
                <div className="md:col-span-3"><Label className="text-xs">Notes</Label><Input value={resultsForm.notes} onChange={e=>setResultsForm(f=>({...f,notes:e.target.value}))} className="rounded-xl"/></div>
              </div>
              <Button onClick={async()=>{
                if (!resultsCampaign) return toast.error("Select a campaign");
                try {
                  await axios.post(`${API}/campaigns/${resultsCampaign}/daily-metrics`, resultsForm);
                  toast.success("Results logged & manager notified");
                  setResultsForm({date:new Date().toISOString().slice(0,10),leads:0,impressions:0,messages:0,clicks:0,spend:0,conversions:0,notes:""});
                  fetchData();
                } catch (e) { toast.error(e.response?.data?.detail || e.message || "Failed to save results"); }
              }} className="rounded-full bg-[#3B5249] text-white" data-testid="results-submit">Save Today's Results</Button>
            </div>
          </TabsContent>

          {/* ===== PERFORMANCE / COST ANALYSIS ===== */}
          <TabsContent value="performance">
            <div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
              <h3 className="font-heading text-lg font-medium mb-4">📊 Cost Performance Analysis (7 Days)</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <KPI label="Week Spend" value={`Rs.${overview.week?.spend || 0}`} accent="text-[#A66E4E]" />
                <KPI label="Week Leads" value={overview.week?.leads || 0} accent="text-[#6B8E6B]" />
                <KPI label="CPL (Cost / Lead)" value={`Rs.${overview.week?.cpl || 0}`} accent="text-[#3B5249]" />
                <KPI label="Conversions" value={overview.week?.conversions || 0} accent="text-[#D4A373]" />
              </div>
              {(overview.chart || []).length > 0 && (
                <div className="bg-[#F9F8F6] rounded-xl p-3 mb-4">
                  <h4 className="text-xs font-medium mb-2 text-[#59615D]">Daily Spend vs Leads</h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={overview.chart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E3DB" />
                      <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={10} />
                      <YAxis fontSize={10} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="leads" fill="#6B8E6B" name="Leads" />
                      <Bar dataKey="spend" fill="#A66E4E" name="Spend (Rs.)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {/* Per-platform breakdown */}
              <h4 className="font-heading text-sm font-medium mb-2">By Platform Family</h4>
              {platformGroups.length === 0 ? (
                <p className="text-center py-4 text-[#59615D] text-sm">No platform data</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-[#F9F8F6]">
                        {["Platform", "Campaigns", "Spend", "Leads", "Impressions", "Messages", "Conversions", "CPL"].map(h => (
                          <th key={h} className="p-2 text-left text-[9px] uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {platformGroups.map(g => (
                        <tr key={g.platform} className="border-b" data-testid={`perf-${g.platform}`}>
                          <td className="p-2 font-medium">{platformLabel(g.platform)}</td>
                          <td className="p-2">{g.campaigns.length}</td>
                          <td className="p-2 text-[#A66E4E]">Rs.{g.total_spend}</td>
                          <td className="p-2 text-[#6B8E6B] font-bold">{g.total_leads}</td>
                          <td className="p-2">{g.total_impressions}</td>
                          <td className="p-2">{g.total_messages}</td>
                          <td className="p-2">{g.total_conversions}</td>
                          <td className="p-2 font-bold">Rs.{g.total_leads ? Math.round(g.total_spend / g.total_leads) : 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent value="mysheet" className="animate-fade-in"><DailyTaskSheet titleSuffix="Digital Marketing Manager" /></TabsContent>
        </Tabs>
      </div>

      {/* CAMPAIGN DIALOG */}
      <Dialog open={showCampaign} onOpenChange={setShowCampaign}>
        <DialogContent className="rounded-2xl max-h-[85vh] overflow-y-auto" data-testid="campaign-dialog">
          <DialogHeader><DialogTitle className="font-heading">{editingCamp ? "Edit" : "New"} Campaign</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Input placeholder="Campaign Name *" value={campForm.name} onChange={e => setCampForm(f => ({ ...f, name: e.target.value }))} className="rounded-xl" data-testid="camp-name-input" />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Platform Family *</Label>
                <Select value={campForm.platform} onValueChange={v => setCampForm(f => ({ ...f, platform: v, sub_platform: v === "meta" ? "facebook" : v === "google" ? "google_search" : "" }))}>
                  <SelectTrigger className="rounded-xl" data-testid="camp-platform-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meta">📘 Meta (FB/IG/WA)</SelectItem>
                    <SelectItem value="google">🔴 Google (Search/Display/YT)</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Sub-Platform</Label>
                <Select value={campForm.sub_platform} onValueChange={v => setCampForm(f => ({ ...f, sub_platform: v }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {(campForm.platform === "meta" ? META_SUBS : campForm.platform === "google" ? GOOGLE_SUBS : []).map(s => (
                      <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Ad Type</Label>
                <Select value={campForm.ad_type} onValueChange={v => setCampForm(f => ({ ...f, ad_type: v }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>{["image", "video", "carousel", "reel", "story", "search", "display", "shopping"].map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Objective</Label>
                <Select value={campForm.objective} onValueChange={v => setCampForm(f => ({ ...f, objective: v }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>{["leads", "conversions", "traffic", "engagement", "awareness", "messages", "sales"].map(o => <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <Input placeholder="Audience description (e.g., Women 25-45 Tier 1)" value={campForm.audience} onChange={e => setCampForm(f => ({ ...f, audience: e.target.value }))} className="rounded-xl" />
            <div className="grid grid-cols-3 gap-2">
              <div><Label className="text-xs">Budget (Rs.)</Label><Input type="number" value={campForm.budget} onChange={e => setCampForm(f => ({ ...f, budget: Number(e.target.value) }))} className="rounded-xl" /></div>
              <div><Label className="text-xs">Start Date</Label><Input type="date" value={campForm.start_date} onChange={e => setCampForm(f => ({ ...f, start_date: e.target.value }))} className="rounded-xl" /></div>
              <div><Label className="text-xs">End Date</Label><Input type="date" value={campForm.end_date} onChange={e => setCampForm(f => ({ ...f, end_date: e.target.value }))} className="rounded-xl" /></div>
            </div>
            <Select value={campForm.status} onValueChange={v => setCampForm(f => ({ ...f, status: v }))}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>{["running", "paused", "completed", "draft"].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={submitCampaign} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="camp-submit">{editingCamp ? "Update" : "Create"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ----- helper sub-components -----
function PlatformBreakdown({ groups, accent }) {
  if (!groups || groups.length === 0) return null;
  const g = groups[0];
  return (
    <div className={`grid grid-cols-2 md:grid-cols-5 gap-2 mb-4 p-3 rounded-xl ${accent === "blue" ? "bg-blue-50" : "bg-red-50"}`}>
      <div className="bg-white rounded-lg p-2 text-center"><p className="text-[9px] uppercase">Spend</p><p className="font-heading text-base font-bold">Rs.{g.total_spend}</p></div>
      <div className="bg-white rounded-lg p-2 text-center"><p className="text-[9px] uppercase">Leads</p><p className="font-heading text-base font-bold text-[#6B8E6B]">{g.total_leads}</p></div>
      <div className="bg-white rounded-lg p-2 text-center"><p className="text-[9px] uppercase">Impressions</p><p className="font-heading text-base font-bold">{g.total_impressions}</p></div>
      <div className="bg-white rounded-lg p-2 text-center"><p className="text-[9px] uppercase">Messages</p><p className="font-heading text-base font-bold">{g.total_messages}</p></div>
      <div className="bg-white rounded-lg p-2 text-center"><p className="text-[9px] uppercase">CPL</p><p className="font-heading text-base font-bold">Rs.{g.total_leads ? Math.round(g.total_spend / g.total_leads) : 0}</p></div>
    </div>
  );
}

function CampaignList({ campaigns, accent, onEdit, onDelete }) {
  if (campaigns.length === 0) {
    return <p className="text-center py-6 text-[#59615D] text-sm">No campaigns yet. Click "New {accent === "blue" ? "Meta" : "Google"} Campaign" to start.</p>;
  }
  const accentClass = accent === "blue" ? "border-blue-300" : "border-red-300";
  return (
    <div className="space-y-2">
      {campaigns.map(c => {
        const cpl = c.leads_count ? Math.round((c.spend || 0) / c.leads_count) : 0;
        const ctr = c.impressions ? ((c.clicks || 0) / c.impressions * 100).toFixed(2) : 0;
        return (
          <div key={c.id} className={`border-2 ${accentClass} rounded-xl p-3 bg-white`} data-testid={`camp-${c.id}`}>
            <div className="flex justify-between items-start gap-2 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-sm">{c.name}</p>
                  {c.sub_platform && <Badge variant="outline" className="text-[8px] capitalize">{c.sub_platform.replace(/_/g, " ")}</Badge>}
                  {c.ad_type && <Badge variant="outline" className="text-[8px] capitalize">{c.ad_type}</Badge>}
                  <Badge className={`text-[8px] ${c.status === "running" ? "bg-green-100 text-green-800" : c.status === "paused" ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-800"}`}>{c.status}</Badge>
                </div>
                {c.audience && <p className="text-[10px] text-[#59615D]">🎯 {c.audience}</p>}
                <p className="text-[10px] text-[#59615D]">Budget: Rs.{c.budget || 0} | Spent: Rs.{c.spend || 0} | Objective: {c.objective}</p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="rounded-full text-[10px] h-6" onClick={() => onEdit(c)} data-testid={`edit-camp-${c.id}`}>Edit</Button>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400" onClick={() => onDelete(c.id)} data-testid={`del-camp-${c.id}`}>×</Button>
              </div>
            </div>
            {/* KPI strip */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mt-3 text-center">
              <div className="bg-[#F9F8F6] rounded p-1.5"><p className="text-[8px] uppercase text-[#59615D]">Leads</p><p className="font-bold text-sm text-[#6B8E6B]">{c.leads_count || 0}</p></div>
              <div className="bg-[#F9F8F6] rounded p-1.5"><p className="text-[8px] uppercase text-[#59615D]">Impr</p><p className="font-bold text-sm">{c.impressions || 0}</p></div>
              <div className="bg-[#F9F8F6] rounded p-1.5"><p className="text-[8px] uppercase text-[#59615D]">Msgs</p><p className="font-bold text-sm">{c.messages || 0}</p></div>
              <div className="bg-[#F9F8F6] rounded p-1.5"><p className="text-[8px] uppercase text-[#59615D]">CTR</p><p className="font-bold text-sm">{ctr}%</p></div>
              <div className="bg-[#F9F8F6] rounded p-1.5"><p className="text-[8px] uppercase text-[#59615D]">CPL</p><p className="font-bold text-sm text-[#A66E4E]">Rs.{cpl}</p></div>
              <div className="bg-[#F9F8F6] rounded p-1.5"><p className="text-[8px] uppercase text-[#59615D]">Conv</p><p className="font-bold text-sm">{c.conversions || 0}</p></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
