import { useState, useEffect, useCallback, useMemo } from "react";
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
import {
  LogOut, Users, Layers, Plus, Loader2, Send, Film,
  Sparkles, Instagram, Youtube, Facebook, CalendarDays,
  Megaphone, Link2, Trash2, Rocket, CheckCircle2, ListChecks, Target as TargetIcon,
  TrendingUp, Clock3, Package, AlertTriangle, FileText, Globe, Filter,
  Search as SearchIcon, ArrowUpRight, Pencil, ChevronRight, Phone, MessageSquare,
  IndianRupee, Truck, Wallet,
} from "lucide-react";
import RoleGuidelines from "../components/RoleGuidelines";
import AttendanceCheckIn from "../components/AttendanceCheckIn";
import NotificationBell from "../components/NotificationBell";

const API = "/api";

const PRIORITY_META = {
  P1: { cls: "bg-rose-50 text-rose-700 border-rose-200", label: "P1 · Urgent" },
  P2: { cls: "bg-amber-50 text-amber-700 border-amber-200", label: "P2 · Normal" },
  P3: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "P3 · Low" },
};
const STATUS_STYLE = (s) => {
  if (s === "completed" || s === "approved" || s === "posted" || s === "converted") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (s === "submitted" || s === "responded" || s === "ready_to_post") return "bg-blue-100 text-blue-800 border-blue-200";
  if (s === "revision" || s === "rejected") return "bg-orange-100 text-orange-800 border-orange-200";
  if (s === "in_progress" || s === "contacted" || s === "product_sent") return "bg-violet-100 text-violet-800 border-violet-200";
  return "bg-amber-100 text-amber-800 border-amber-200";
};
const CT_META = {
  reel:     { icon: "🎬", label: "Reel",      steps: "Shoot → Edit → Post" },
  video:    { icon: "📹", label: "Video",     steps: "Shoot → Edit → Post" },
  ai_video: { icon: "✨", label: "AI Video",  steps: "AI Generate → Edit → Post" },
  story:    { icon: "📸", label: "Story",     steps: "Shoot → Design → Post" },
  post:     { icon: "🖼", label: "Static",    steps: "Design → Post" },
  carousel: { icon: "🎠", label: "Carousel",  steps: "Design → Post" },
  flyer:    { icon: "📰", label: "Flyer",     steps: "Design → Post" },
  ad:       { icon: "💰", label: "Paid Ad",   steps: "Shoot → Edit → Design → Post" },
  blog:     { icon: "✍",  label: "Blog",     steps: "Write → Post" },
};
const PLATFORM_ICON = { instagram: Instagram, facebook: Facebook, youtube: Youtube, tiktok: Film, linkedin: Link2 };
function PlatformPill({ platform }) {
  const Icon = PLATFORM_ICON[platform] || Layers;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#F4F1EA] border border-[#E5E3DB] text-[10px] capitalize"><Icon className="w-3 h-3" />{platform}</span>;
}

// Determines a script's display state for the master list / pillar drilldown
const scriptState = (s) => {
  if (s.post_status === "posted") return { key: "posted", label: "Posted", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" };
  if (s.post_approval_status === "approved") return { key: "ready_to_post", label: "Ready to Post", cls: "bg-blue-100 text-blue-800 border-blue-200" };
  if (s.post_approval_status === "pending") return { key: "awaiting_approval", label: "Awaiting Approval", cls: "bg-violet-100 text-violet-800 border-violet-200" };
  if (s.post_approval_status === "rejected") return { key: "revision", label: "Revision Needed", cls: "bg-orange-100 text-orange-800 border-orange-200" };
  if (s.assigned_to) return { key: "in_progress", label: "In Production", cls: "bg-amber-100 text-amber-800 border-amber-200" };
  return { key: "draft", label: "Draft", cls: "bg-stone-100 text-stone-700 border-stone-200" };
};

export default function SocialMediaDashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const [pillars, setPillars] = useState([]);
  const [influencerStats, setInfluencerStats] = useState({});
  const [influencerEntries, setInfluencerEntries] = useState([]);
  const [contentDevs, setContentDevs] = useState([]);
  const [calendar, setCalendar] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showPillar, setShowPillar] = useState(false);
  const [editingPillar, setEditingPillar] = useState(null);
  const [drilldown, setDrilldown] = useState(null); // pillar object opened in dialog
  const [drilldownFilter, setDrilldownFilter] = useState("all");

  const [showScript, setShowScript] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showCal, setShowCal] = useState(false);
  const [showInf, setShowInf] = useState(false);
  const [selectedScript, setSelectedScript] = useState(null);

  // Mark-posted dialog (live URL capture)
  const [markPostedTarget, setMarkPostedTarget] = useState(null);
  const [livePostLink, setLivePostLink] = useState("");
  const [livePostCaption, setLivePostCaption] = useState("");

  // Master Scripts tab filters
  const [scriptFilter, setScriptFilter] = useState({ pillar: "all", status: "all", type: "all", platform: "all", q: "" });

  const [pillarForm, setPillarForm] = useState({ title: "", description: "", color: "#3B5249" });
  const [scriptForm, setScriptForm] = useState({ pillar_id: "", title: "", content_type: "reel", platform: "instagram", script_text: "", priority: "P2", deadline: "" });
  const [assignForm, setAssignForm] = useState({ content_developer_id: "" });
  const [calForm, setCalForm] = useState({ title: "", platform: "instagram", content_type: "post", scheduled_date: "", notes: "" });
  const [infForm, setInfForm] = useState({ influencer_name: "", contact: "", phone: "", platform: "instagram", followers: "", category: "beauty", barter_type: "", status: "pending", notes: "" });
  const [convertTarget, setConvertTarget] = useState(null);
  const [convertPostLink, setConvertPostLink] = useState("");

  // ---- Influencer call log ----
  const [logCallTarget, setLogCallTarget] = useState(null);
  const [logCallForm, setLogCallForm] = useState({ outcome: "contacted", remarks: "", next_action: "", new_status: "contacted" });

  // ---- Influencer product / paid collab ----
  const [collabTarget, setCollabTarget] = useState(null);
  const [collabForm, setCollabForm] = useState({ barter_type: "free_product", product_tracking_link: "", products_sent: [], paid_amount: "", notes: "" });
  const [products, setProducts] = useState([]);

  const fetchData = useCallback(async () => {
    try {
      const [pl, inf, cal, cds, pr] = await Promise.all([
        axios.get(`${API}/content/pillars`).catch(() => ({ data: { pillars: [] } })),
        axios.get(`${API}/influencer/outreach`).catch(() => ({ data: { entries: [], stats: {} } })),
        axios.get(`${API}/content-calendar`).catch(() => ({ data: { entries: [] } })),
        axios.get(`${API}/content-developers`).catch(() => ({ data: { content_developers: [] } })),
        axios.get(`${API}/products`).catch(() => ({ data: { products: [] } })),
      ]);
      setPillars(pl.data.pillars || []);
      setInfluencerEntries(inf.data.entries || []);
      setInfluencerStats(inf.data.stats || {});
      setCalendar(cal.data.entries || []);
      setContentDevs(cds.data.content_developers || []);
      setProducts(pr.data.products || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  // Refresh the drilldown reference after fetchData updates pillars (avoid stale data when adding scripts)
  useEffect(() => {
    setDrilldown(prev => {
      if (!prev) return prev;
      const fresh = pillars.find(p => p.id === prev.id);
      // Only update if content actually changed (avoid render loop)
      if (!fresh) return null;
      if (JSON.stringify(fresh.scripts) === JSON.stringify(prev.scripts) && JSON.stringify(fresh.counts) === JSON.stringify(prev.counts)) return prev;
      return fresh;
    });
  }, [pillars]);

  const allScripts = useMemo(
    () => pillars.flatMap(p => (p.scripts || []).map(s => ({ ...s, pillar_title: p.title, pillar_color: p.color || "#3B5249" }))),
    [pillars]
  );
  const pendingApprovals = useMemo(() => allScripts.filter(s => s.post_approval_status === "pending"), [allScripts]);
  const readyToPost = useMemo(() => allScripts.filter(s => s.post_approval_status === "approved" && s.post_status !== "posted"), [allScripts]);
  const livePosts = useMemo(() => allScripts.filter(s => s.post_status === "posted"), [allScripts]);

  // Roll-up totals across ALL pillars
  const totals = useMemo(() => {
    const acc = { total: 0, draft: 0, in_progress: 0, awaiting_approval: 0, ready_to_post: 0, posted: 0, revision: 0, pending: 0 };
    pillars.forEach(p => {
      const c = p.counts || {};
      Object.keys(acc).forEach(k => { acc[k] += c[k] || 0; });
    });
    return acc;
  }, [pillars]);

  const stats = [
    { l: "Pillars",          v: pillars.length,           i: Layers,        c: "#3B5249", sub: `${totals.total} scripts` },
    { l: "Awaiting Approval",v: pendingApprovals.length,  i: Clock3,        c: "#7D6E83", sub: `${totals.revision} revision` },
    { l: "Ready to Post",    v: readyToPost.length,       i: ArrowUpRight,  c: "#4E6FA0", sub: "approved · live URL pending" },
    { l: "Live",             v: livePosts.length,         i: CheckCircle2,  c: "#6B8E6B", sub: `${calendar.length} on calendar` },
  ];

  const filteredScripts = useMemo(() => {
    return allScripts.filter(s => {
      if (scriptFilter.pillar !== "all" && s.pillar_id !== scriptFilter.pillar) return false;
      if (scriptFilter.type !== "all" && s.content_type !== scriptFilter.type) return false;
      if (scriptFilter.platform !== "all" && s.platform !== scriptFilter.platform) return false;
      if (scriptFilter.status !== "all" && scriptState(s).key !== scriptFilter.status) return false;
      if (scriptFilter.q && !`${s.title} ${s.script_text || ""}`.toLowerCase().includes(scriptFilter.q.toLowerCase())) return false;
      return true;
    });
  }, [allScripts, scriptFilter]);

  // ===== actions =====
  const savePillar = async () => {
    if (!pillarForm.title) return toast.error("Title required");
    try {
      if (editingPillar) {
        await axios.put(`${API}/content/pillars/${editingPillar.id}`, pillarForm);
        toast.success("Pillar updated");
      } else {
        await axios.post(`${API}/content/pillars`, pillarForm);
        toast.success("Pillar created");
      }
      setShowPillar(false); setEditingPillar(null);
      setPillarForm({ title: "", description: "", color: "#3B5249" });
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const deletePillar = async (p) => {
    if (!window.confirm(`Delete pillar "${p.title}"?`)) return;
    try { await axios.delete(`${API}/content/pillars/${p.id}`); toast.success("Pillar deleted"); fetchData(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const openCreatePillar = () => { setEditingPillar(null); setPillarForm({ title: "", description: "", color: "#3B5249" }); setShowPillar(true); };
  const openEditPillar = (p) => { setEditingPillar(p); setPillarForm({ title: p.title, description: p.description || "", color: p.color || "#3B5249" }); setShowPillar(true); };

  const openCreateScript = (pillarId = "") => {
    setScriptForm({ pillar_id: pillarId, title: "", content_type: "reel", platform: "instagram", script_text: "", priority: "P2", deadline: "" });
    setShowScript(true);
  };
  const createScript = async () => {
    if (!scriptForm.pillar_id || !scriptForm.title) return toast.error("Pillar + title required");
    try { await axios.post(`${API}/content/scripts`, scriptForm); toast.success("Script created — assign it to a Content Developer"); setShowScript(false); fetchData(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const deleteScript = async (s) => {
    if (!window.confirm(`Delete script "${s.title}"?`)) return;
    try {
      await axios.delete(`${API}/content/scripts/${s.id}`).catch(async () => {
        // Backend may not have a delete; fall back to status=cancelled
        await axios.put(`${API}/content/scripts/${s.id}`, { status: "cancelled" });
      });
      toast.success("Removed"); fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const assignScript = async () => {
    if (!selectedScript || !assignForm.content_developer_id) return toast.error("Pick a Content Developer");
    try { await axios.post(`${API}/content/scripts/${selectedScript.id}/assign`, assignForm); toast.success("Forwarded to Content Developer"); setShowAssign(false); setAssignForm({ content_developer_id: "" }); fetchData(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const submitCal = async () => {
    if (!calForm.title) return toast.error("Title required");
    try { await axios.post(`${API}/content-calendar`, calForm); toast.success("Scheduled"); setShowCal(false); setCalForm({ title: "", platform: "instagram", content_type: "post", scheduled_date: "", notes: "" }); fetchData(); }
    catch { toast.error("Failed"); }
  };
  const submitInf = async () => {
    if (!infForm.influencer_name) return toast.error("Name required");
    try { await axios.post(`${API}/influencer/outreach`, infForm); toast.success("Influencer added"); setShowInf(false); setInfForm({ influencer_name: "", contact: "", platform: "instagram", followers: "", category: "beauty", barter_type: "", status: "pending", notes: "" }); fetchData(); }
    catch { toast.error("Failed"); }
  };
  const confirmConvert = async () => {
    if (!convertPostLink.trim()) return toast.error("Post link required for converted status");
    try { await axios.put(`${API}/influencer/outreach/${convertTarget.id}`, { status: "converted", post_link: convertPostLink.trim() }); toast.success("Marked converted — post link saved"); setConvertTarget(null); setConvertPostLink(""); fetchData(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  // Influencer status row handler — opens correct dialog per target status
  const handleInfStatusChange = (e, v) => {
    if (v === "converted") { setConvertTarget(e); setConvertPostLink(e.post_link || ""); return; }
    if (v === "contacted" || v === "responded" || v === "no_answer" || v === "not_interested") {
      // open call-log dialog
      setLogCallTarget(e);
      setLogCallForm({ outcome: v, remarks: "", next_action: "", new_status: v === "no_answer" ? "pending" : v });
      return;
    }
    if (v === "product_sent") {
      setCollabTarget(e);
      setCollabForm({
        barter_type: e.barter_type || "free_product",
        product_tracking_link: e.product_tracking_link || "",
        products_sent: e.products_sent || [],
        paid_amount: e.paid_amount ? String(e.paid_amount) : "",
        notes: "",
      });
      return;
    }
    // Other simple status updates (rejected, pending) — direct update
    axios.put(`${API}/influencer/outreach/${e.id}`, { status: v })
      .then(() => { toast.success("Updated"); fetchData(); })
      .catch(err => toast.error(err.response?.data?.detail || "Failed"));
  };

  const submitLogCall = async () => {
    if (!logCallForm.remarks.trim()) return toast.error("Remarks are required");
    try {
      await axios.post(`${API}/influencer/outreach/${logCallTarget.id}/log-call`, {
        outcome: logCallForm.outcome,
        remarks: logCallForm.remarks.trim(),
        next_action: logCallForm.next_action,
        status: logCallForm.new_status,
      });
      toast.success("Call logged");
      setLogCallTarget(null);
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const submitCollab = async () => {
    if (!collabTarget) return;
    const payload = { barter_type: collabForm.barter_type, notes: collabForm.notes };
    if (collabForm.barter_type === "free_product") {
      if (!collabForm.product_tracking_link.trim()) return toast.error("Tracking link required for barter");
      payload.product_tracking_link = collabForm.product_tracking_link.trim();
      payload.products_sent = collabForm.products_sent;
    } else {
      const amt = parseFloat(collabForm.paid_amount);
      if (!amt || amt <= 0) return toast.error("Enter a valid paid amount");
      payload.paid_amount = amt;
    }
    try {
      const r = await axios.post(`${API}/influencer/outreach/${collabTarget.id}/send-product`, payload);
      if (r.data.fund_request) {
        toast.success(`Recorded · Fund request #${r.data.fund_request.id} sent to Finance`);
      } else {
        toast.success("Product send recorded");
      }
      setCollabTarget(null);
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const toggleProductSent = (productId, productName) => {
    setCollabForm(f => {
      const existing = f.products_sent.find(p => p.id === productId);
      if (existing) return { ...f, products_sent: f.products_sent.filter(p => p.id !== productId) };
      return { ...f, products_sent: [...f.products_sent, { id: productId, name: productName }] };
    });
  };
  // SMM reviews CD's deliverable. NO live URL needed here.
  const reviewDeliverable = async (s, action, extra = {}) => {
    try { await axios.post(`${API}/content/scripts/${s.id}/approve-post`, { action, ...extra }); toast.success(action === "approve" ? "Approved — now publish & save the live URL" : "Sent for revision"); fetchData(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  // Open the "Mark Posted" dialog (asks for live URL)
  const openMarkPosted = (s) => { setMarkPostedTarget(s); setLivePostLink(s.post_link || ""); setLivePostCaption(""); };
  const submitMarkPosted = async () => {
    if (!livePostLink.trim()) return toast.error("Live post URL is required");
    try {
      await axios.post(`${API}/content/scripts/${markPostedTarget.id}/mark-posted`, { post_link: livePostLink.trim(), caption: livePostCaption });
      toast.success("Marked LIVE 🎉");
      setMarkPostedTarget(null); setLivePostLink(""); setLivePostCaption("");
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  // SMM publishes directly without CD (skip the CD pipeline) — needs live URL
  const directPost = async (s) => {
    const link = window.prompt("Live post URL (you're posting directly, bypassing CD):");
    if (!link) return;
    try { await axios.post(`${API}/content/scripts/${s.id}/approve-post`, { action: "direct_post", post_link: link }); toast.success("Posted directly · link saved"); fetchData(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const logout = () => { localStorage.clear(); navigate("/login"); };
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F9F8F6]"><Loader2 className="w-8 h-8 animate-spin text-[#3B5249]" /></div>;

  // ----- reusable -----
  const ScriptRow = ({ s, dense = false }) => {
    const ct = CT_META[s.content_type] || CT_META.reel;
    const devName = contentDevs.find(d => d.id === s.assigned_to)?.name;
    const pr = PRIORITY_META[s.priority] || PRIORITY_META.P2;
    const st = scriptState(s);
    return (
      <div className="bg-white rounded-xl p-3 border border-[#EAE7DE] hover:border-[#3B5249]/30 hover:shadow-sm transition" data-testid={`script-row-${s.id}`}>
        <div className="flex justify-between items-start gap-2 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <p className="font-medium text-sm text-[#2C3531]">{s.title}</p>
              <Badge className={`text-[9px] border ${pr.cls}`}>{pr.label}</Badge>
              <Badge variant="outline" className="text-[9px] capitalize bg-[#3B5249]/5">{ct.icon} {ct.label}</Badge>
              {s.platform && <PlatformPill platform={s.platform} />}
              <Badge className={`text-[9px] border ${st.cls}`}>{st.label}</Badge>
              {!dense && s.pillar_title && <Badge variant="outline" className="text-[9px]" style={{ borderColor: s.pillar_color, color: s.pillar_color }}>{s.pillar_title}</Badge>}
            </div>
            {s.script_text && <p className="text-[10px] text-[#59615D] line-clamp-2 leading-relaxed">{s.script_text}</p>}
            <p className="text-[10px] mt-1">
              {devName ? <span className="text-[#A66E4E]">→ {devName}</span> : <span className="text-rose-600">Not yet assigned</span>}
              {s.deadline && <span className="text-[#59615D] ml-2"><Clock3 className="w-2.5 h-2.5 inline" /> {s.deadline}</span>}
            </p>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {s.video_link && <a href={s.video_link} target="_blank" rel="noreferrer" className="text-[9px] text-[#3B5249] hover:underline inline-flex items-center gap-0.5"><Link2 className="w-2.5 h-2.5" />Raw</a>}
              {s.edited_link && <a href={s.edited_link} target="_blank" rel="noreferrer" className="text-[9px] text-[#6B8E6B] hover:underline inline-flex items-center gap-0.5"><Link2 className="w-2.5 h-2.5" />Edit</a>}
              {s.design_link && <a href={s.design_link} target="_blank" rel="noreferrer" className="text-[9px] text-[#A66E4E] hover:underline inline-flex items-center gap-0.5"><Link2 className="w-2.5 h-2.5" />Design</a>}
              {s.post_link && <a href={s.post_link} target="_blank" rel="noreferrer" className="text-[9px] text-emerald-700 hover:underline inline-flex items-center gap-0.5"><Link2 className="w-2.5 h-2.5" />Live</a>}
            </div>
          </div>
          <div className="flex flex-col gap-1 items-end">
            {!s.assigned_to && st.key !== "posted" && (
              <Button size="sm" className="rounded-full text-[10px] bg-[#3B5249] hover:bg-[#2F4338] text-white h-7" onClick={() => { setSelectedScript(s); setAssignForm({ content_developer_id: "" }); setShowAssign(true); }} data-testid={`assign-script-${s.id}`}>
                <Rocket className="w-3 h-3 mr-1" />Assign CD
              </Button>
            )}
            {st.key === "ready_to_post" && (
              <Button size="sm" className="rounded-full text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white h-7" onClick={() => openMarkPosted(s)} data-testid={`mark-posted-${s.id}`}>
                <Send className="w-3 h-3 mr-1" />Mark Posted
              </Button>
            )}
            {st.key === "awaiting_approval" && (
              <>
                <Button size="sm" className="rounded-full text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white h-7" onClick={() => reviewDeliverable(s, "approve")} data-testid={`approve-${s.id}`}>
                  <CheckCircle2 className="w-3 h-3 mr-1" />Approve
                </Button>
                <Button size="sm" variant="outline" className="rounded-full text-[10px] h-7 text-orange-600 border-orange-300" onClick={() => { const fb = window.prompt("Feedback for CD:"); if (fb) reviewDeliverable(s, "reject", { feedback: fb }); }}>
                  Revise
                </Button>
              </>
            )}
            {st.key !== "posted" && st.key !== "awaiting_approval" && st.key !== "ready_to_post" && (
              <Button size="sm" variant="outline" className="rounded-full text-[9px] h-6 text-[#3B5249] border-[#3B5249]" onClick={() => directPost(s)} data-testid={`direct-post-${s.id}`}>
                <Send className="w-3 h-3 mr-1" />Direct Post
              </Button>
            )}
            {st.key !== "posted" && (
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-rose-500 hover:bg-rose-50" onClick={() => deleteScript(s)} title="Remove script">
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F9F8F6]" data-testid="social-media-dashboard">
      {/* Header */}
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#F9F8F6]/85 border-b border-[#E5E3DB]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-heading text-xl sm:text-2xl font-medium text-[#2C3531]">Celesta <span className="text-[#3B5249] font-semibold">Glow</span></h1>
            <p className="text-xs text-[#59615D] uppercase tracking-[0.15em]">Social Media Manager · {user.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <AttendanceCheckIn />
            <Button variant="outline" onClick={logout} className="rounded-full border-[#E5E3DB] text-sm" data-testid="logout-btn"><LogOut className="w-4 h-4 mr-1" />Logout</Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Hero */}
        <div className="mb-6 rounded-3xl overflow-hidden border border-[#E5E3DB] bg-gradient-to-r from-[#3B5249] via-[#4A6559] to-[#2F4338] text-white px-6 sm:px-8 py-5 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center flex-shrink-0"><Sparkles className="w-6 h-6" /></div>
          <div className="flex-1 min-w-0">
            <p className="font-heading text-lg leading-tight">Pillars → Scripts → Assign CD → Approve → Post</p>
            <p className="text-xs text-white/75">Plan content under each pillar, brief your Content Developer, approve their work, then publish and save the live URL.</p>
          </div>
          {pendingApprovals.length > 0 && <Badge className="bg-amber-400 text-amber-900 border-none text-[10px] animate-pulse">{pendingApprovals.length} to review</Badge>}
          {readyToPost.length > 0 && <Badge className="bg-blue-300 text-blue-900 border-none text-[10px]">{readyToPost.length} ready to post</Badge>}
        </div>

        <RoleGuidelines role="social_media_manager" />

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {stats.map((s, i) => (
            <div key={i} className="bg-white rounded-2xl border border-[#E5E3DB] p-4 hover:shadow-md transition" data-testid={`stat-${s.l.replace(/\s+/g, '-').toLowerCase()}`}>
              <div className="flex items-start justify-between">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${s.c}18` }}>
                  <s.i className="w-4.5 h-4.5" style={{ color: s.c }} />
                </div>
                <TrendingUp className="w-3.5 h-3.5 text-[#B08968]" />
              </div>
              <p className="mt-3 font-heading text-2xl font-semibold text-[#2C3531]">{s.v}</p>
              <p className="text-[10px] text-[#59615D] uppercase tracking-wider mt-0.5">{s.l}</p>
              <p className="text-[10px] text-[#A66E4E] mt-1">{s.sub}</p>
            </div>
          ))}
        </div>

        <Tabs defaultValue="pillars" className="space-y-5">
          <TabsList className="bg-white border border-[#E5E3DB] rounded-full p-1 h-auto flex-wrap gap-0.5">
            {[
              { v: "pillars",    l: `Pillars (${pillars.length})`,                       i: Layers },
              { v: "scripts",    l: `Scripts (${allScripts.length})`,                    i: FileText },
              { v: "approvals",  l: `Review (${pendingApprovals.length})`,               i: CheckCircle2 },
              { v: "publish",    l: `Publish (${readyToPost.length})`,                   i: ArrowUpRight },
              { v: "calendar",   l: "Calendar",                                          i: CalendarDays },
              { v: "influencer", l: "Influencer",                                        i: Megaphone },
              { v: "mysheet",    l: "My Tasks",                                          i: ListChecks },
            ].map(t => (
              <TabsTrigger key={t.v} value={t.v} className="rounded-full text-[11px] data-[state=active]:bg-[#3B5249] data-[state=active]:text-white px-3 py-1.5 flex items-center gap-1.5" data-testid={`smm-tab-${t.v}`}>
                <t.i className="w-3.5 h-3.5" /> {t.l}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ============ PILLARS TAB (rich card UI) ============ */}
          <TabsContent value="pillars">
            <div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <div>
                  <h3 className="font-heading text-lg font-medium text-[#2C3531]">Content Pillars</h3>
                  <p className="text-[11px] text-[#59615D]">High-level themes that group your scripts. Each card shows pending / ready / posted in one glance.</p>
                </div>
                <Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={openCreatePillar} data-testid="add-pillar-btn"><Plus className="w-3.5 h-3.5 mr-1" />New Pillar</Button>
              </div>

              {pillars.length === 0 ? (
                <div className="text-center py-14 text-[#59615D]">
                  <Layers className="w-14 h-14 mx-auto text-[#D4A373] mb-3" />
                  <p className="text-sm">No pillars yet — create your first one to start planning content.</p>
                  <Button onClick={openCreatePillar} className="mt-3 rounded-full bg-[#3B5249] hover:bg-[#2F4338] text-white text-xs" data-testid="empty-add-pillar"><Plus className="w-3 h-3 mr-1" />Create Pillar</Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {pillars.map(p => {
                    const c = p.counts || { total: 0, posted: 0, awaiting_approval: 0, ready_to_post: 0, revision: 0, in_progress: 0, draft: 0, pending: 0 };
                    const color = p.color || "#3B5249";
                    const completionPct = c.total ? Math.round((c.posted / c.total) * 100) : 0;
                    return (
                      <div key={p.id} className="rounded-2xl border border-[#E5E3DB] bg-gradient-to-br from-white to-[#FAF8F3] overflow-hidden hover:shadow-lg transition group" data-testid={`pillar-card-${p.id}`}>
                        {/* Color strip */}
                        <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${color} 0%, ${color}80 100%)` }} />
                        <div className="p-5">
                          <div className="flex justify-between items-start gap-2 mb-3">
                            <div className="flex items-start gap-3 min-w-0">
                              <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}18`, color }}>
                                <Layers className="w-5 h-5" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-heading font-semibold text-[#2C3531] truncate">{p.title}</p>
                                {p.description && <p className="text-[10px] text-[#59615D] line-clamp-2 mt-0.5">{p.description}</p>}
                              </div>
                            </div>
                            <div className="flex gap-0.5">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-[#59615D]" onClick={() => openEditPillar(p)} data-testid={`edit-pillar-${p.id}`} title="Edit"><Pencil className="w-3.5 h-3.5" /></Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-rose-500 hover:bg-rose-50" onClick={() => deletePillar(p)} data-testid={`delete-pillar-${p.id}`} title="Delete"><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div className="mb-3">
                            <div className="flex justify-between text-[10px] text-[#59615D] mb-1">
                              <span>{c.posted} / {c.total} posted</span>
                              <span className="font-semibold" style={{ color }}>{completionPct}%</span>
                            </div>
                            <div className="h-1.5 bg-[#EAE7DE] rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${completionPct}%`, background: `linear-gradient(90deg, ${color} 0%, ${color}AA 100%)` }} />
                            </div>
                          </div>

                          {/* Status grid */}
                          <div className="grid grid-cols-3 gap-2 text-center mb-3">
                            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2">
                              <p className="font-heading text-lg font-semibold text-amber-700">{c.pending}</p>
                              <p className="text-[9px] text-amber-700 uppercase tracking-wider">Pending</p>
                            </div>
                            <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-2">
                              <p className="font-heading text-lg font-semibold text-violet-700">{c.awaiting_approval}</p>
                              <p className="text-[9px] text-violet-700 uppercase tracking-wider">In Review</p>
                            </div>
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-2">
                              <p className="font-heading text-lg font-semibold text-emerald-700">{c.posted}</p>
                              <p className="text-[9px] text-emerald-700 uppercase tracking-wider">Posted</p>
                            </div>
                          </div>

                          {/* Sub-counts */}
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {c.draft > 0 && <Badge variant="outline" className="text-[9px]">Draft · {c.draft}</Badge>}
                            {c.in_progress > 0 && <Badge variant="outline" className="text-[9px] bg-amber-50 border-amber-200 text-amber-700">In Production · {c.in_progress}</Badge>}
                            {c.ready_to_post > 0 && <Badge variant="outline" className="text-[9px] bg-blue-50 border-blue-200 text-blue-700">Ready · {c.ready_to_post}</Badge>}
                            {c.revision > 0 && <Badge variant="outline" className="text-[9px] bg-rose-50 border-rose-200 text-rose-700">Revision · {c.revision}</Badge>}
                          </div>

                          {/* Type breakdown */}
                          {p.type_breakdown && Object.keys(p.type_breakdown).length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-3 pb-3 border-b border-[#EAE7DE]">
                              {Object.entries(p.type_breakdown).map(([k, v]) => (
                                <span key={k} className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#3B5249]/5 border border-[#E5E3DB] text-[#3B5249]">
                                  {(CT_META[k]?.icon) || "•"} {v}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="flex-1 rounded-full text-[10px] h-8 border-[#3B5249] text-[#3B5249] hover:bg-[#3B5249]/5" onClick={() => { setDrilldown(p); setDrilldownFilter("all"); }} data-testid={`open-pillar-${p.id}`}>
                              <ChevronRight className="w-3 h-3 mr-1" />View {c.total} Scripts
                            </Button>
                            <Button size="sm" className="flex-1 rounded-full text-[10px] h-8 text-white" style={{ backgroundColor: color }} onClick={() => openCreateScript(p.id)} data-testid={`add-script-pillar-${p.id}`}>
                              <Plus className="w-3 h-3 mr-1" />Script
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ============ SCRIPTS TAB (master list with filters) ============ */}
          <TabsContent value="scripts">
            <div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <div>
                  <h3 className="font-heading text-lg font-medium text-[#2C3531]">All Scripts</h3>
                  <p className="text-[11px] text-[#59615D]">Master list across all pillars. Assign to a Content Developer, track progress, approve their work, then publish.</p>
                </div>
                <Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs" onClick={() => openCreateScript("")} data-testid="add-script-btn"><Plus className="w-3.5 h-3.5 mr-1" />New Script</Button>
              </div>

              {/* Filters */}
              <div className="bg-[#FAF8F3] border border-[#EAE7DE] rounded-xl p-3 mb-4 grid grid-cols-2 md:grid-cols-5 gap-2">
                <div className="md:col-span-1 relative">
                  <SearchIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#59615D]" />
                  <Input placeholder="Search…" value={scriptFilter.q} onChange={e => setScriptFilter(f => ({ ...f, q: e.target.value }))} className="h-8 rounded-full pl-8 text-xs bg-white" data-testid="script-search" />
                </div>
                <Select value={scriptFilter.pillar} onValueChange={v => setScriptFilter(f => ({ ...f, pillar: v }))}>
                  <SelectTrigger className="h-8 rounded-full text-xs bg-white" data-testid="script-filter-pillar"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Pillars</SelectItem>
                    {pillars.map(p => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={scriptFilter.status} onValueChange={v => setScriptFilter(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="h-8 rounded-full text-xs bg-white" data-testid="script-filter-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="in_progress">In Production</SelectItem>
                    <SelectItem value="awaiting_approval">Awaiting Approval</SelectItem>
                    <SelectItem value="revision">Revision</SelectItem>
                    <SelectItem value="ready_to_post">Ready to Post</SelectItem>
                    <SelectItem value="posted">Posted</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={scriptFilter.type} onValueChange={v => setScriptFilter(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="h-8 rounded-full text-xs bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {Object.entries(CT_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.icon} {v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={scriptFilter.platform} onValueChange={v => setScriptFilter(f => ({ ...f, platform: v }))}>
                  <SelectTrigger className="h-8 rounded-full text-xs bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Platforms</SelectItem>
                    {["instagram", "facebook", "youtube", "tiktok", "linkedin", "blog"].map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {filteredScripts.length === 0 ? (
                <div className="text-center py-10 text-[#59615D]">
                  <Filter className="w-10 h-10 mx-auto text-[#D4A373] mb-2" />
                  <p className="text-sm">No scripts match your filters.</p>
                </div>
              ) : (
                <div className="space-y-2">{filteredScripts.map(s => <ScriptRow key={s.id} s={s} />)}</div>
              )}
            </div>
          </TabsContent>

          {/* ============ REVIEW (Approvals) ============ */}
          <TabsContent value="approvals">
            <div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
              <div className="mb-4">
                <h3 className="font-heading text-lg font-medium text-[#2C3531]">Review CD Deliverables</h3>
                <p className="text-[11px] text-[#59615D]">Review the edit / design / video link uploaded by your Content Developer. Approve to move it to <b>Publish</b>, or send back for revision. <b>The live post URL is captured separately at the publish step.</b></p>
              </div>
              {pendingApprovals.length === 0 ? (
                <div className="text-center py-10 text-[#59615D]">
                  <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-400 mb-2" />
                  <p className="text-sm">All caught up — no pending submissions.</p>
                </div>
              ) : (
                <div className="space-y-2">{pendingApprovals.map(s => {
                  const ct = CT_META[s.content_type] || CT_META.reel;
                  return (
                    <div key={s.id} className="border border-blue-200 bg-blue-50/40 rounded-xl p-3" data-testid={`approval-${s.id}`}>
                      <div className="flex justify-between items-start gap-2 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-medium text-sm text-[#2C3531]">{s.title}</p>
                            <Badge variant="outline" className="text-[9px] capitalize bg-white">{ct.icon} {ct.label}</Badge>
                            {s.platform && <PlatformPill platform={s.platform} />}
                            <Badge className="text-[9px] bg-blue-100 text-blue-800 border-blue-200">✋ Awaiting Review</Badge>
                          </div>
                          <p className="text-[10px] text-[#59615D] mt-0.5">From <span className="text-[#A66E4E] font-medium">{s.post_submitted_by_name || "CD"}</span>{s.post_submitted_at && ` · ${s.post_submitted_at.slice(0, 10)}`}</p>
                          {s.post_notes && <p className="text-[10px] text-[#A66E4E] italic mt-0.5">CD note: "{s.post_notes}"</p>}
                          <div className="flex gap-2 flex-wrap mt-1">
                            {s.video_link && <a href={s.video_link} target="_blank" rel="noreferrer" className="text-[10px] text-[#3B5249] hover:underline inline-flex items-center gap-0.5"><Link2 className="w-2.5 h-2.5" />Raw Footage</a>}
                            {s.edited_link && <a href={s.edited_link} target="_blank" rel="noreferrer" className="text-[10px] text-[#6B8E6B] hover:underline inline-flex items-center gap-0.5"><Link2 className="w-2.5 h-2.5" />Edited Video</a>}
                            {s.design_link && <a href={s.design_link} target="_blank" rel="noreferrer" className="text-[10px] text-[#A66E4E] hover:underline inline-flex items-center gap-0.5"><Link2 className="w-2.5 h-2.5" />Design</a>}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 items-end">
                          <Button size="sm" className="rounded-full text-[10px] h-7 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => reviewDeliverable(s, "approve")} data-testid={`approve-post-${s.id}`}><CheckCircle2 className="w-3 h-3 mr-1" />Approve</Button>
                          <Button size="sm" variant="outline" className="rounded-full text-[10px] h-7 text-orange-600 border-orange-300 hover:bg-orange-50" onClick={() => { const fb = window.prompt("Feedback for CD:"); if (fb) reviewDeliverable(s, "reject", { feedback: fb }); }}>Request Revision</Button>
                        </div>
                      </div>
                    </div>
                  );
                })}</div>
              )}
            </div>
          </TabsContent>

          {/* ============ PUBLISH (approved → mark posted with live URL) ============ */}
          <TabsContent value="publish">
            <div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
              <div className="mb-4">
                <h3 className="font-heading text-lg font-medium text-[#2C3531]">Publish Approved Content</h3>
                <p className="text-[11px] text-[#59615D]">These deliverables are <b>approved by you</b>. Post them on the platform, then click <b>Mark Posted</b> and paste the live URL.</p>
              </div>
              {readyToPost.length === 0 ? (
                <div className="text-center py-10 text-[#59615D]">
                  <ArrowUpRight className="w-10 h-10 mx-auto text-[#D4A373] mb-2" />
                  <p className="text-sm">Nothing in the publish queue.</p>
                </div>
              ) : (
                <div className="space-y-2">{readyToPost.map(s => {
                  const ct = CT_META[s.content_type] || CT_META.reel;
                  return (
                    <div key={s.id} className="border border-blue-200 bg-blue-50/30 rounded-xl p-3" data-testid={`publish-${s.id}`}>
                      <div className="flex justify-between items-start gap-2 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-medium text-sm text-[#2C3531]">{s.title}</p>
                            <Badge variant="outline" className="text-[9px] capitalize bg-white">{ct.icon} {ct.label}</Badge>
                            {s.platform && <PlatformPill platform={s.platform} />}
                            <Badge className="text-[9px] bg-blue-100 text-blue-800 border-blue-200">Ready to Post</Badge>
                          </div>
                          <p className="text-[10px] text-[#A66E4E] mt-0.5">{s.pillar_title}</p>
                          <div className="flex gap-2 flex-wrap mt-1">
                            {s.edited_link && <a href={s.edited_link} target="_blank" rel="noreferrer" className="text-[10px] text-[#6B8E6B] hover:underline inline-flex items-center gap-0.5"><Link2 className="w-2.5 h-2.5" />Edited</a>}
                            {s.design_link && <a href={s.design_link} target="_blank" rel="noreferrer" className="text-[10px] text-[#A66E4E] hover:underline inline-flex items-center gap-0.5"><Link2 className="w-2.5 h-2.5" />Design</a>}
                          </div>
                        </div>
                        <Button size="sm" className="rounded-full text-[10px] h-7 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => openMarkPosted(s)} data-testid={`mark-posted-publish-${s.id}`}>
                          <Send className="w-3 h-3 mr-1" />Mark Posted
                        </Button>
                      </div>
                    </div>
                  );
                })}</div>
              )}
            </div>
          </TabsContent>

          {/* CALENDAR */}
          <TabsContent value="calendar">
            <div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <div>
                  <h3 className="font-heading text-lg font-medium text-[#2C3531]">Content Calendar <span className="text-sm text-[#59615D]">({calendar.length})</span></h3>
                  <p className="text-[11px] text-[#59615D]">Schedule what goes live, when, and on which platform.</p>
                </div>
                <Button size="sm" className="rounded-full bg-[#3B5249] hover:bg-[#2F4338] text-white text-xs" onClick={() => setShowCal(true)} data-testid="add-calendar-btn"><Plus className="w-3.5 h-3.5 mr-1" />Schedule Post</Button>
              </div>
              {calendar.length === 0 ? (
                <div className="text-center py-10 text-[#59615D]">
                  <CalendarDays className="w-10 h-10 mx-auto text-[#D4A373] mb-2" />
                  <p className="text-sm">No scheduled posts yet</p>
                </div>
              ) : (
                <div className="space-y-2">{calendar.map(c => (
                  <div key={c.id} className="border border-[#E5E3DB] rounded-xl p-3 flex justify-between items-center hover:bg-[#FAF8F3] transition" data-testid={`cal-${c.id}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#3B5249]/10 flex items-center justify-center flex-shrink-0"><CalendarDays className="w-4 h-4 text-[#3B5249]" /></div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-medium text-sm text-[#2C3531] truncate">{c.title}</p>
                          <PlatformPill platform={c.platform} />
                          <Badge variant="outline" className="text-[9px] capitalize">{c.content_type}</Badge>
                        </div>
                        <p className="text-[10px] text-[#59615D] truncate">📅 {c.scheduled_date} · {c.notes || "No notes"}</p>
                      </div>
                    </div>
                    <div className="flex gap-1 items-center flex-shrink-0">
                      <Select value={c.status} onValueChange={async (v) => { await axios.put(`${API}/content-calendar/${c.id}`, { status: v }); fetchData(); }}>
                        <SelectTrigger className={`h-7 w-24 text-[9px] rounded-full border ${STATUS_STYLE(c.status)}`}><SelectValue /></SelectTrigger>
                        <SelectContent>{["scheduled", "published", "cancelled"].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                      </Select>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={async () => { if (window.confirm("Delete?")) { await axios.delete(`${API}/content-calendar/${c.id}`); fetchData(); } }}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                ))}</div>
              )}
            </div>
          </TabsContent>

          {/* INFLUENCER */}
          <TabsContent value="influencer">
            <div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <div>
                  <h3 className="font-heading text-lg font-medium text-[#2C3531]">Influencer Outreach</h3>
                  <p className="text-[11px] text-[#59615D]">Track collaborations. When marking <b>converted</b>, you must paste the live post link.</p>
                </div>
                <Button size="sm" className="rounded-full bg-[#3B5249] hover:bg-[#2F4338] text-white text-xs" onClick={() => setShowInf(true)} data-testid="add-influencer-btn"><Plus className="w-3.5 h-3.5 mr-1" />Add Influencer</Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                {[
                  { l: "Total", v: influencerStats.total || 0, c: "#3B5249", i: Users },
                  { l: "Contacted", v: influencerStats.contacted || 0, c: "#A66E4E", i: Send },
                  { l: "Responded", v: influencerStats.responded || 0, c: "#7D6E83", i: TargetIcon },
                  { l: "Product Sent", v: influencerStats.product_sent || 0, c: "#B08968", i: Package },
                  { l: "Converted", v: influencerStats.converted || 0, c: "#6B8E6B", i: CheckCircle2 },
                ].map((s, i) => (
                  <div key={i} className="bg-[#FAF8F3] rounded-xl p-3 border border-[#EAE7DE]">
                    <s.i className="w-3.5 h-3.5 mb-1" style={{ color: s.c }} />
                    <p className="font-heading text-xl font-semibold" style={{ color: s.c }}>{s.v}</p>
                    <p className="text-[10px] text-[#59615D] uppercase tracking-wider">{s.l}</p>
                  </div>
                ))}
              </div>
              {influencerEntries.length === 0 ? (
                <div className="text-center py-8 text-[#59615D]">
                  <Megaphone className="w-10 h-10 mx-auto text-[#D4A373] mb-2" />
                  <p className="text-sm">No outreach data yet</p>
                </div>
              ) : (
                <div className="space-y-2">{influencerEntries.slice(0, 60).map(e => {
                  const phone = e.phone || e.contact || "";
                  const callable = /^[+\d][\d\s\-+()]{6,}$/.test(phone);
                  return (
                    <div key={e.id} className="border border-[#E5E3DB] rounded-xl p-3 hover:bg-[#FAF8F3] transition" data-testid={`inf-row-${e.id}`}>
                      <div className="flex justify-between items-start gap-3 flex-wrap">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#A66E4E] to-[#D4A373] flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">{(e.influencer_name || "?").slice(0, 2).toUpperCase()}</div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-medium text-xs text-[#2C3531] truncate">{e.influencer_name}</p>
                              <PlatformPill platform={e.platform} />
                              <Badge variant="outline" className="text-[9px] capitalize">{e.category}</Badge>
                              {e.barter_type === "free_product" && <Badge className="text-[9px] bg-amber-100 text-amber-800 border-amber-200"><Truck className="w-2.5 h-2.5 mr-0.5" />Barter</Badge>}
                              {e.barter_type === "paid" && <Badge className="text-[9px] bg-violet-100 text-violet-800 border-violet-200"><IndianRupee className="w-2.5 h-2.5 mr-0.5" />₹{e.paid_amount?.toLocaleString?.() || e.paid_amount}</Badge>}
                              {e.fund_request_id && (
                                <Badge className={`text-[9px] ${e.fund_request_status === "approved" ? "bg-emerald-100 text-emerald-800 border-emerald-200" : e.fund_request_status === "rejected" ? "bg-rose-100 text-rose-800 border-rose-200" : "bg-blue-100 text-blue-800 border-blue-200"}`}>
                                  <Wallet className="w-2.5 h-2.5 mr-0.5" />Finance: {e.fund_request_status || "pending"}
                                </Badge>
                              )}
                              {e.status === "converted" && e.post_link && <a href={e.post_link} target="_blank" rel="noreferrer" className="text-[10px] text-emerald-700 hover:underline inline-flex items-center gap-0.5"><Link2 className="w-2.5 h-2.5" />Live Post</a>}
                            </div>
                            <p className="text-[10px] text-[#59615D] flex items-center gap-2 flex-wrap mt-0.5">
                              <span>{e.followers} followers</span>
                              {phone && (
                                callable
                                  ? <a href={`tel:${phone}`} className="text-[#3B5249] hover:underline inline-flex items-center gap-1" data-testid={`inf-call-${e.id}`}><Phone className="w-2.5 h-2.5" />{phone}</a>
                                  : <span className="inline-flex items-center gap-1"><Phone className="w-2.5 h-2.5" />{phone}</span>
                              )}
                              {e.product_tracking_link && <a href={e.product_tracking_link} target="_blank" rel="noreferrer" className="text-amber-700 hover:underline inline-flex items-center gap-1"><Truck className="w-2.5 h-2.5" />Track product</a>}
                            </p>
                            {(e.call_logs || []).length > 0 && (
                              <details className="mt-1.5">
                                <summary className="text-[10px] text-[#3B5249] cursor-pointer underline">{(e.call_logs || []).length} call log{(e.call_logs || []).length > 1 ? "s" : ""}</summary>
                                <div className="mt-1 space-y-1 ml-1 border-l-2 border-[#3B5249]/20 pl-2">
                                  {(e.call_logs || []).slice(-3).reverse().map(cl => (
                                    <div key={cl.id} className="text-[10px] text-[#59615D]">
                                      <span className="font-semibold text-[#2C3531] capitalize">{cl.outcome?.replace("_", " ")}</span>
                                      <span className="text-[#A66E4E] ml-1">· {cl.call_at?.slice(0, 16).replace("T", " ")}</span>
                                      <p className="italic">"{cl.remarks}"</p>
                                      {cl.next_action && <p className="text-[#3B5249]">→ {cl.next_action}</p>}
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 items-center flex-shrink-0">
                          {callable && <Button size="sm" variant="outline" className="h-7 rounded-full text-[10px] border-[#3B5249] text-[#3B5249] hover:bg-[#3B5249]/5" asChild><a href={`tel:${phone}`} data-testid={`inf-call-btn-${e.id}`}><Phone className="w-3 h-3 mr-1" />Call</a></Button>}
                          <Button size="sm" variant="outline" className="h-7 rounded-full text-[10px]" onClick={() => { setLogCallTarget(e); setLogCallForm({ outcome: "contacted", remarks: "", next_action: "", new_status: "contacted" }); }} data-testid={`inf-log-call-${e.id}`}><MessageSquare className="w-3 h-3 mr-1" />Log Call</Button>
                          <Select value={e.status} onValueChange={(v) => handleInfStatusChange(e, v)}>
                            <SelectTrigger className={`h-7 w-32 text-[9px] rounded-full border ${STATUS_STYLE(e.status)}`} data-testid={`inf-status-${e.id}`}><SelectValue /></SelectTrigger>
                            <SelectContent>{["pending", "contacted", "responded", "product_sent", "converted", "rejected"].map(s => <SelectItem key={s} value={s} className="text-xs capitalize">{s.replace("_", " ")}</SelectItem>)}</SelectContent>
                          </Select>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={async () => { if (window.confirm("Delete?")) { try { await axios.delete(`${API}/influencer/outreach/${e.id}`); toast.success("Deleted"); fetchData(); } catch (err) { toast.error(err.response?.data?.detail || "Delete failed"); } } }}><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      </div>
                    </div>
                  );
                })}</div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="mysheet"><DailyTaskSheet titleSuffix="Social Media Manager" /></TabsContent>
        </Tabs>
      </div>

      {/* ===== PILLAR DRILLDOWN DIALOG ===== */}
      <Dialog open={!!drilldown} onOpenChange={(o) => !o && setDrilldown(null)}>
        <DialogContent className="rounded-2xl max-w-3xl max-h-[88vh] overflow-y-auto" data-testid="pillar-drilldown">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${drilldown?.color || "#3B5249"}18`, color: drilldown?.color || "#3B5249" }}><Layers className="w-4 h-4" /></span>
              {drilldown?.title}
            </DialogTitle>
          </DialogHeader>
          {drilldown && (() => {
            const c = drilldown.counts || {};
            const filterMap = {
              all: () => true,
              draft: s => scriptState(s).key === "draft",
              in_progress: s => scriptState(s).key === "in_progress",
              awaiting_approval: s => scriptState(s).key === "awaiting_approval",
              ready_to_post: s => scriptState(s).key === "ready_to_post",
              revision: s => scriptState(s).key === "revision",
              posted: s => scriptState(s).key === "posted",
            };
            const filtered = (drilldown.scripts || []).filter(filterMap[drilldownFilter] || (() => true));
            const chips = [
              { k: "all", l: "All", v: c.total || 0, color: "#3B5249" },
              { k: "draft", l: "Draft", v: c.draft, color: "#7D6E83" },
              { k: "in_progress", l: "In Production", v: c.in_progress, color: "#B08968" },
              { k: "awaiting_approval", l: "Awaiting Approval", v: c.awaiting_approval, color: "#7D6E83" },
              { k: "ready_to_post", l: "Ready to Post", v: c.ready_to_post, color: "#4E6FA0" },
              { k: "revision", l: "Revision", v: c.revision, color: "#B75D69" },
              { k: "posted", l: "Posted", v: c.posted, color: "#6B8E6B" },
            ];
            return (
              <div className="space-y-4">
                {drilldown.description && <p className="text-xs text-[#59615D] bg-[#FAF8F3] rounded-xl p-3 border border-[#EAE7DE]">{drilldown.description}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {chips.map(ch => (
                    <button key={ch.k} onClick={() => setDrilldownFilter(ch.k)} className={`text-[10px] px-2.5 py-1 rounded-full border transition ${drilldownFilter === ch.k ? "text-white" : "bg-white"}`} style={drilldownFilter === ch.k ? { backgroundColor: ch.color, borderColor: ch.color } : { borderColor: `${ch.color}40`, color: ch.color }} data-testid={`drilldown-chip-${ch.k}`}>
                      {ch.l} · {ch.v || 0}
                    </button>
                  ))}
                </div>
                <Button size="sm" className="rounded-full bg-[#3B5249] hover:bg-[#2F4338] text-white text-xs w-full" onClick={() => { setDrilldown(null); openCreateScript(drilldown.id); }} data-testid="drilldown-add-script">
                  <Plus className="w-3 h-3 mr-1" />New Script in this Pillar
                </Button>
                {filtered.length === 0 ? (
                  <p className="text-center text-xs text-[#59615D] py-6">No scripts match this filter.</p>
                ) : (
                  <div className="space-y-2">
                    {filtered.map(s => <ScriptRow key={s.id} s={{ ...s, pillar_title: drilldown.title, pillar_color: drilldown.color }} dense />)}
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* PILLAR CREATE / EDIT */}
      <Dialog open={showPillar} onOpenChange={(o) => { if (!o) { setShowPillar(false); setEditingPillar(null); } }}>
        <DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">{editingPillar ? "Edit Pillar" : "New Content Pillar"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Pillar Title *</Label><Input value={pillarForm.title} onChange={e => setPillarForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Product Education, Behind the Scenes" className="rounded-xl" data-testid="pillar-title-input" /></div>
            <div><Label className="text-xs">Description</Label><Textarea value={pillarForm.description} onChange={e => setPillarForm(f => ({ ...f, description: e.target.value }))} placeholder="What content falls under this pillar?" className="rounded-xl" /></div>
            <div>
              <Label className="text-xs">Color theme</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {["#3B5249", "#A66E4E", "#7D6E83", "#4E6FA0", "#6B8E6B", "#B75D69", "#B08968", "#2C3531"].map(c => (
                  <button type="button" key={c} onClick={() => setPillarForm(f => ({ ...f, color: c }))} className="w-7 h-7 rounded-full border-2 transition" style={{ backgroundColor: c, borderColor: pillarForm.color === c ? "#2C3531" : "transparent" }} data-testid={`pillar-color-${c}`} />
                ))}
              </div>
            </div>
            <Button onClick={savePillar} className="w-full rounded-full bg-[#3B5249] hover:bg-[#2F4338] text-white" data-testid="pillar-submit">{editingPillar ? "Save Changes" : "Create Pillar"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* SCRIPT DIALOG */}
      <Dialog open={showScript} onOpenChange={setShowScript}>
        <DialogContent className="rounded-2xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle className="font-heading">New Script</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Pillar *</Label><Select value={scriptForm.pillar_id} onValueChange={v => setScriptForm(f => ({ ...f, pillar_id: v }))}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Select pillar" /></SelectTrigger><SelectContent>{pillars.map(p => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs">Title *</Label><Input value={scriptForm.title} onChange={e => setScriptForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Glow Serum — 30 sec Reel" className="rounded-xl" data-testid="script-title-input" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Content Type *</Label>
                <Select value={scriptForm.content_type} onValueChange={v => setScriptForm(f => ({ ...f, content_type: v }))}>
                  <SelectTrigger className="rounded-xl" data-testid="script-content-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CT_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.icon} {v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Platform</Label>
                <Select value={scriptForm.platform} onValueChange={v => setScriptForm(f => ({ ...f, platform: v }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>{["instagram", "facebook", "youtube", "tiktok", "linkedin", "whatsapp", "blog"].map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Priority</Label><Select value={scriptForm.priority} onValueChange={v => setScriptForm(f => ({ ...f, priority: v }))}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="P1">P1 · Urgent</SelectItem><SelectItem value="P2">P2 · Normal</SelectItem><SelectItem value="P3">P3 · Low</SelectItem></SelectContent></Select></div>
              <div><Label className="text-xs">Deadline</Label><Input type="date" value={scriptForm.deadline} onChange={e => setScriptForm(f => ({ ...f, deadline: e.target.value }))} className="rounded-xl" /></div>
            </div>
            <div><Label className="text-xs">Script / Brief</Label><Textarea value={scriptForm.script_text} onChange={e => setScriptForm(f => ({ ...f, script_text: e.target.value }))} placeholder="Full script, shot list, or detailed brief for the Content Developer…" className="rounded-xl min-h-[120px]" data-testid="script-text-input" /></div>
            <div className="bg-[#FAF8F3] rounded-xl p-3 border border-[#EAE7DE] text-[11px] text-[#59615D]">
              <p className="font-semibold text-[#3B5249] uppercase tracking-wider mb-1 text-[9px]">Production Steps</p>
              <p>{(CT_META[scriptForm.content_type] || CT_META.reel).steps}</p>
            </div>
            <Button onClick={createScript} className="w-full rounded-full bg-[#3B5249] hover:bg-[#2F4338] text-white" data-testid="script-submit">Create Script</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ASSIGN SCRIPT DIALOG */}
      <Dialog open={showAssign} onOpenChange={setShowAssign}>
        <DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Assign: {selectedScript?.title}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs font-medium">Content Developer *</Label>
              <Select value={assignForm.content_developer_id} onValueChange={v => setAssignForm(f => ({ ...f, content_developer_id: v }))}>
                <SelectTrigger className="rounded-xl" data-testid="forward-cd-select"><SelectValue placeholder="Select Content Developer" /></SelectTrigger>
                <SelectContent>{contentDevs.length === 0 ? <SelectItem value="none" disabled>No content developers</SelectItem> : contentDevs.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <p className="text-[10px] text-[#A66E4E]">The CD will produce the deliverable (shoot / edit / design), upload it to Drive, and submit it here for your review.</p>
            <Button onClick={assignScript} className="w-full rounded-full bg-[#3B5249] hover:bg-[#2F4338] text-white" data-testid="forward-submit"><Rocket className="w-3.5 h-3.5 mr-1" />Assign to CD</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* MARK POSTED (live URL capture) */}
      <Dialog open={!!markPostedTarget} onOpenChange={(o) => !o && setMarkPostedTarget(null)}>
        <DialogContent className="rounded-2xl" data-testid="mark-posted-dialog">
          <DialogHeader><DialogTitle className="font-heading flex items-center gap-2"><Globe className="w-4 h-4 text-emerald-600" />Mark as Posted — {markPostedTarget?.title}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-[11px] text-emerald-800 flex gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>Now that the post is live on the platform, paste its public URL here. This is mandatory and will be saved against the script for tracking.</p>
            </div>
            <div>
              <Label className="text-xs">Live Post URL *</Label>
              <div className="relative">
                <Link2 className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#59615D]" />
                <Input placeholder="https://instagram.com/p/…" value={livePostLink} onChange={e => setLivePostLink(e.target.value)} className="rounded-xl pl-9" data-testid="mark-posted-link-input" autoFocus />
              </div>
            </div>
            <div>
              <Label className="text-xs">Caption / Note (optional)</Label>
              <Textarea placeholder="Final caption used / any campaign note" value={livePostCaption} onChange={e => setLivePostCaption(e.target.value)} className="rounded-xl" />
            </div>
            <Button onClick={submitMarkPosted} className="w-full rounded-full bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="mark-posted-submit"><Send className="w-3.5 h-3.5 mr-1" />Save & Mark LIVE</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* CALENDAR DIALOG */}
      <Dialog open={showCal} onOpenChange={setShowCal}>
        <DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Schedule Post</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Title</Label><Input placeholder="Post title" value={calForm.title} onChange={e => setCalForm(f => ({ ...f, title: e.target.value }))} className="rounded-xl" data-testid="cal-title-input" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Platform</Label><Select value={calForm.platform} onValueChange={v => setCalForm(f => ({ ...f, platform: v }))}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{["instagram", "facebook", "youtube", "tiktok", "linkedin", "twitter", "blog"].map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-xs">Type</Label><Select value={calForm.content_type} onValueChange={v => setCalForm(f => ({ ...f, content_type: v }))}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{["post", "reel", "story", "video", "blog", "ad"].map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div><Label className="text-xs">Scheduled Date</Label><Input type="date" value={calForm.scheduled_date} onChange={e => setCalForm(f => ({ ...f, scheduled_date: e.target.value }))} className="rounded-xl" /></div>
            <div><Label className="text-xs">Notes</Label><Textarea placeholder="Notes / caption draft" value={calForm.notes} onChange={e => setCalForm(f => ({ ...f, notes: e.target.value }))} className="rounded-xl" /></div>
            <Button onClick={submitCal} className="w-full rounded-full bg-[#3B5249] hover:bg-[#2F4338] text-white" data-testid="cal-submit">Schedule</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* INFLUENCER DIALOG */}
      <Dialog open={showInf} onOpenChange={setShowInf}>
        <DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">Add Influencer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Influencer Name *" value={infForm.influencer_name} onChange={e => setInfForm(f => ({ ...f, influencer_name: e.target.value }))} className="rounded-xl" data-testid="inf-name-input" />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Phone (click-to-call) *" value={infForm.phone} onChange={e => setInfForm(f => ({ ...f, phone: e.target.value }))} className="rounded-xl" data-testid="inf-phone-input" />
              <Input placeholder="Email / handle" value={infForm.contact} onChange={e => setInfForm(f => ({ ...f, contact: e.target.value }))} className="rounded-xl" data-testid="inf-contact-input" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select value={infForm.platform} onValueChange={v => setInfForm(f => ({ ...f, platform: v }))}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{["instagram", "youtube", "facebook", "tiktok", "blog", "other"].map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent></Select>
              <Input placeholder="Followers (e.g., 50k)" value={infForm.followers} onChange={e => setInfForm(f => ({ ...f, followers: e.target.value }))} className="rounded-xl" />
            </div>
            <Input placeholder="Category (beauty/fashion…)" value={infForm.category} onChange={e => setInfForm(f => ({ ...f, category: e.target.value }))} className="rounded-xl" />
            <Button onClick={submitInf} className="w-full rounded-full bg-[#3B5249] hover:bg-[#2F4338] text-white" data-testid="inf-submit">Add</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* CONVERT INFLUENCER DIALOG */}
      <Dialog open={!!convertTarget} onOpenChange={(o) => !o && setConvertTarget(null)}>
        <DialogContent className="rounded-2xl" data-testid="convert-dialog">
          <DialogHeader><DialogTitle className="font-heading flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" />Mark as Converted — {convertTarget?.influencer_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800 flex gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>A live post link is <b>mandatory</b> when marking this influencer as converted. It proves the collaboration went live and is used in ROI reports.</p>
            </div>
            <div>
              <Label className="text-xs">Live Post URL *</Label>
              <div className="relative">
                <Link2 className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#59615D]" />
                <Input placeholder="https://instagram.com/p/…" value={convertPostLink} onChange={e => setConvertPostLink(e.target.value)} className="rounded-xl pl-9" data-testid="convert-post-link-input" autoFocus />
              </div>
            </div>
            <Button onClick={confirmConvert} className="w-full rounded-full bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="convert-submit"><CheckCircle2 className="w-3.5 h-3.5 mr-1" />Save & Mark Converted</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* INFLUENCER CALL LOG DIALOG */}
      <Dialog open={!!logCallTarget} onOpenChange={(o) => !o && setLogCallTarget(null)}>
        <DialogContent className="rounded-2xl" data-testid="log-call-dialog">
          <DialogHeader><DialogTitle className="font-heading flex items-center gap-2"><Phone className="w-4 h-4 text-[#3B5249]" />Log Call — {logCallTarget?.influencer_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="bg-[#FAF8F3] border border-[#EAE7DE] rounded-xl p-3 text-[11px] text-[#59615D]">
              {logCallTarget?.phone || logCallTarget?.contact ? <p>📞 <a className="underline text-[#3B5249]" href={`tel:${logCallTarget?.phone || logCallTarget?.contact}`}>{logCallTarget?.phone || logCallTarget?.contact}</a></p> : <p>No phone on file — add it via edit.</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Outcome</Label>
                <Select value={logCallForm.outcome} onValueChange={v => setLogCallForm(f => ({ ...f, outcome: v, new_status: v === "no_answer" ? f.new_status : v }))}>
                  <SelectTrigger className="rounded-xl" data-testid="log-call-outcome"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contacted">Contacted</SelectItem>
                    <SelectItem value="responded">Responded</SelectItem>
                    <SelectItem value="no_answer">No answer</SelectItem>
                    <SelectItem value="not_interested">Not interested</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">New Status</Label>
                <Select value={logCallForm.new_status} onValueChange={v => setLogCallForm(f => ({ ...f, new_status: v }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="contacted">Contacted</SelectItem>
                    <SelectItem value="responded">Responded</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Remarks * <span className="text-[#A66E4E]">(what you talked about)</span></Label>
              <Textarea value={logCallForm.remarks} onChange={e => setLogCallForm(f => ({ ...f, remarks: e.target.value }))} placeholder="Discussed our serum range, she's interested in barter — wants to send brand kit first…" className="rounded-xl min-h-[100px]" data-testid="log-call-remarks" autoFocus />
            </div>
            <div>
              <Label className="text-xs">Next action (optional)</Label>
              <Input value={logCallForm.next_action} onChange={e => setLogCallForm(f => ({ ...f, next_action: e.target.value }))} placeholder="Send brand deck Friday…" className="rounded-xl" />
            </div>
            <Button onClick={submitLogCall} className="w-full rounded-full bg-[#3B5249] hover:bg-[#2F4338] text-white" data-testid="log-call-submit"><MessageSquare className="w-3.5 h-3.5 mr-1" />Save Call Log</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* COLLAB / PRODUCT-SENT DIALOG */}
      <Dialog open={!!collabTarget} onOpenChange={(o) => !o && setCollabTarget(null)}>
        <DialogContent className="rounded-2xl max-h-[88vh] overflow-y-auto" data-testid="collab-dialog">
          <DialogHeader><DialogTitle className="font-heading flex items-center gap-2"><Truck className="w-4 h-4 text-[#A66E4E]" />Collaboration — {collabTarget?.influencer_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Collaboration Type *</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button type="button" onClick={() => setCollabForm(f => ({ ...f, barter_type: "free_product" }))} className={`rounded-xl border p-3 text-left transition ${collabForm.barter_type === "free_product" ? "border-[#A66E4E] bg-amber-50" : "border-[#E5E3DB] bg-white"}`} data-testid="collab-type-barter">
                  <div className="flex items-center gap-2"><Truck className="w-4 h-4 text-[#A66E4E]" /><span className="font-medium text-sm">Barter</span></div>
                  <p className="text-[10px] text-[#59615D] mt-1">Send free products in exchange for content</p>
                </button>
                <button type="button" onClick={() => setCollabForm(f => ({ ...f, barter_type: "paid" }))} className={`rounded-xl border p-3 text-left transition ${collabForm.barter_type === "paid" ? "border-violet-500 bg-violet-50" : "border-[#E5E3DB] bg-white"}`} data-testid="collab-type-paid">
                  <div className="flex items-center gap-2"><IndianRupee className="w-4 h-4 text-violet-600" /><span className="font-medium text-sm">Paid</span></div>
                  <p className="text-[10px] text-[#59615D] mt-1">Pay a fixed fee · auto-creates a fund request to Finance</p>
                </button>
              </div>
            </div>

            {collabForm.barter_type === "free_product" && (
              <>
                <div>
                  <Label className="text-xs">Product Tracking Link *</Label>
                  <div className="relative">
                    <Truck className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#59615D]" />
                    <Input value={collabForm.product_tracking_link} onChange={e => setCollabForm(f => ({ ...f, product_tracking_link: e.target.value }))} placeholder="https://shipway.com/track/abc123" className="rounded-xl pl-9" data-testid="collab-tracking-input" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Products being sent</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-1 max-h-40 overflow-y-auto">
                    {products.length === 0 ? <p className="text-[10px] text-[#59615D] italic">No products in catalogue.</p> : products.map(p => {
                      const checked = collabForm.products_sent.find(x => x.id === p.id);
                      return (
                        <label key={p.id} className={`text-[11px] rounded-lg border p-2 flex items-center gap-2 cursor-pointer ${checked ? "bg-amber-50 border-amber-300" : "border-[#E5E3DB]"}`} data-testid={`collab-product-${p.id}`}>
                          <input type="checkbox" checked={!!checked} onChange={() => toggleProductSent(p.id, p.name)} />
                          <span className="truncate">{p.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {collabForm.barter_type === "paid" && (
              <>
                <div>
                  <Label className="text-xs">Paid Amount (₹) *</Label>
                  <div className="relative">
                    <IndianRupee className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#59615D]" />
                    <Input type="number" value={collabForm.paid_amount} onChange={e => setCollabForm(f => ({ ...f, paid_amount: e.target.value }))} placeholder="5000" className="rounded-xl pl-9" data-testid="collab-amount-input" />
                  </div>
                </div>
                <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 text-[11px] text-violet-800 flex gap-2">
                  <Wallet className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p>A fund request for <b>₹{collabForm.paid_amount || 0}</b> will be created and sent to the <b>Finance Manager</b> for approval. Once approved, it auto-flows into Expenses.</p>
                </div>
              </>
            )}

            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea value={collabForm.notes} onChange={e => setCollabForm(f => ({ ...f, notes: e.target.value }))} placeholder="Anything Finance / inventory should know" className="rounded-xl" />
            </div>
            <Button onClick={submitCollab} className="w-full rounded-full bg-[#3B5249] hover:bg-[#2F4338] text-white" data-testid="collab-submit">
              {collabForm.barter_type === "paid" ? <><Wallet className="w-3.5 h-3.5 mr-1" />Save & Send Fund Request</> : <><Truck className="w-3.5 h-3.5 mr-1" />Save Product Send</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
