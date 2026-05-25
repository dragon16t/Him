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
  LogOut, Loader2, Video, Film, Palette, Link as LinkIcon, Check,
  Sparkles, Upload, CheckCircle2, Clock3, CalendarDays, Camera, FileCheck2,
  ListChecks, Flame, Inbox, Plus, Layers, Pencil, AlertCircle,
} from "lucide-react";
import RoleGuidelines from "../components/RoleGuidelines";
import AttendanceCheckIn from "../components/AttendanceCheckIn";
import NotificationBell from "../components/NotificationBell";
import DarkModeToggle from "../components/DarkModeToggle";

const API = "/api";

const PRIORITY_META = {
  P1: { cls: "bg-rose-50 text-rose-700 border-rose-200", label: "P1" },
  P2: { cls: "bg-amber-50 text-amber-700 border-amber-200", label: "P2" },
  P3: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "P3" },
};
const STATUS_STYLE = (s) => {
  if (s === "completed" || s === "approved" || s === "posted") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (s === "submitted") return "bg-blue-100 text-blue-800 border-blue-200";
  if (s === "revision") return "bg-orange-100 text-orange-800 border-orange-200";
  if (s === "in_progress" || s === "assigned") return "bg-violet-100 text-violet-800 border-violet-200";
  return "bg-amber-100 text-amber-800 border-amber-200";
};
const CT_META = {
  reel:     { icon: "🎬", label: "Reel",      steps: { video: true,  edit: true,  design: false, post: true } },
  video:    { icon: "📹", label: "Video",     steps: { video: true,  edit: true,  design: false, post: true } },
  ai_video: { icon: "✨", label: "AI Video",   steps: { video: false, edit: true,  design: false, post: true } },
  story:    { icon: "📸", label: "Story",     steps: { video: true,  edit: false, design: true,  post: true } },
  post:     { icon: "🖼", label: "Static Post",steps: { video: false, edit: false, design: true,  post: true } },
  carousel: { icon: "🎠", label: "Carousel",  steps: { video: false, edit: false, design: true,  post: true } },
  flyer:    { icon: "📰", label: "Flyer",     steps: { video: false, edit: false, design: true,  post: true } },
  ad:       { icon: "💰", label: "Ad",        steps: { video: true,  edit: true,  design: true,  post: true } },
  blog:     { icon: "✍", label: "Blog",       steps: { video: false, edit: false, design: false, post: true } },
};

function StepChip({ label, status, icon: Icon, link, onClick, disabled }) {
  const done = status === "uploaded" || status === "posted";
  const cls = disabled
    ? "bg-stone-100 border-stone-200 text-stone-400 opacity-60"
    : done
      ? "bg-emerald-50 border-emerald-300 text-emerald-800"
      : status === "assigned"
        ? "bg-amber-50 border-amber-300 text-amber-800"
        : "bg-stone-50 border-stone-200 text-stone-600";
  return (
    <div className={`rounded-xl p-2.5 text-center border ${cls} transition-all ${onClick && !done && !disabled ? "cursor-pointer hover:scale-[1.02]" : ""}`} onClick={onClick && !done && !disabled ? onClick : undefined}>
      <div className="flex items-center justify-center gap-1 mb-1">
        <Icon className="w-3.5 h-3.5" />
        {done && <CheckCircle2 className="w-3 h-3" />}
      </div>
      <p className="text-[10px] font-medium uppercase tracking-wider">{label}</p>
      <p className="text-[9px] opacity-80 capitalize">{disabled ? "n/a" : done ? "done" : "pending"}</p>
      {link && <a href={link} target="_blank" rel="noreferrer" className="text-[9px] underline block mt-0.5">view</a>}
    </div>
  );
}

export default function ContentDeveloperDashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const [myScripts, setMyScripts] = useState([]); // from /content/my-tasks (assigned to me)
  const [myOwnScripts, setMyOwnScripts] = useState([]); // created_by me
  const [pillars, setPillars] = useState([]);
  const [shootPlans, setShootPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showUpload, setShowUpload] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [uploadType, setUploadType] = useState("edit");
  const [uploadLink, setUploadLink] = useState("");
  const [uploadNotes, setUploadNotes] = useState("");

  // CD direct post (CD publishes themselves and saves the live URL)
  const [directPostTarget, setDirectPostTarget] = useState(null);
  const [directPostLink, setDirectPostLink] = useState("");
  const [directPostCaption, setDirectPostCaption] = useState("");

  const [showShoot, setShowShoot] = useState(false);
  const [shootForm, setShootForm] = useState({ title: "", shoot_date: new Date().toISOString().slice(0, 10), location: "", deadline: "", notes: "" });

  const [showOwnScript, setShowOwnScript] = useState(false);
  const [ownScriptForm, setOwnScriptForm] = useState({ pillar_id: "", title: "", content_type: "reel", platform: "instagram", script_text: "", priority: "P2", deadline: "" });

  const fetchData = useCallback(async () => {
    try {
      const [ct, pil, sp] = await Promise.all([
        axios.get(`${API}/content/my-tasks`).catch(() => ({ data: { tasks: [] } })),
        axios.get(`${API}/content/pillars`).catch(() => ({ data: { pillars: [] } })),
        axios.get(`${API}/shoot-plans`).catch(() => ({ data: { plans: [] } })),
      ]);
      const tasks = ct.data.tasks || [];
      setMyScripts(tasks);
      // Own scripts — created by me, from pillars payload
      const ownIds = new Set();
      const allFromPillars = (pil.data.pillars || []).flatMap(p => (p.scripts || []).map(s => ({ ...s, pillar_title: p.title })));
      const own = allFromPillars.filter(s => s.created_by === user.id);
      own.forEach(s => ownIds.add(s.id));
      setMyOwnScripts(own);
      setPillars(pil.data.pillars || []);
      setShootPlans(sp.data.plans || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [user.id]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const pending = useMemo(() => myScripts.filter(t => t.post_status !== 'posted' && t.status !== 'cancelled'), [myScripts]);
  const completed = useMemo(() => myScripts.filter(t => t.post_status === 'posted'), [myScripts]);
  const awaitingApproval = useMemo(() => myScripts.filter(t => t.post_approval_status === 'pending'), [myScripts]);
  const needsRevision = useMemo(() => myScripts.filter(t => t.post_approval_status === 'rejected'), [myScripts]);
  const today = new Date().toISOString().slice(0, 10);
  const todayShoots = shootPlans.filter(p => p.shoot_date === today && p.status !== 'completed' && p.status !== 'cancelled');
  const overdueShoots = shootPlans.filter(p => p.deadline && p.deadline < today && p.status !== 'completed' && p.status !== 'cancelled');

  const openUpload = (task, type) => {
    setSelectedTask(task); setUploadType(type);
    const existing = type === "video" ? task.video_link : type === "edit" ? task.edited_link : type === "design" ? task.design_link : task.post_link;
    setUploadLink(existing || ""); setUploadNotes(""); setShowUpload(true);
  };

  const handleUpload = async () => {
    if (!selectedTask) return;
    try {
      if (uploadType === "submit_post") {
        // Submit work for SMM approval. NO live URL needed here — the SMM publishes and records the live URL.
        await axios.post(`${API}/content/scripts/${selectedTask.id}/submit-post`, { notes: uploadNotes });
        toast.success("Submitted to SMM for approval");
      } else {
        if (!uploadLink.trim()) return toast.error("Enter a link");
        const updates = {};
        if (uploadType === "video") { updates.video_link = uploadLink.trim(); updates.video_status = "uploaded"; }
        else if (uploadType === "edit") { updates.edited_link = uploadLink.trim(); updates.edit_status = "uploaded"; }
        else if (uploadType === "design") { updates.design_link = uploadLink.trim(); updates.design_status = "uploaded"; }
        await axios.put(`${API}/content/scripts/${selectedTask.id}`, updates);
        toast.success("Updated — SMM can see the link");
      }
      setShowUpload(false); setUploadLink(""); setUploadNotes(""); fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const submitShoot = async () => {
    if (!shootForm.title) return toast.error("Title required");
    try {
      await axios.post(`${API}/shoot-plans`, shootForm);
      toast.success("Shoot plan added"); setShowShoot(false);
      setShootForm({ title: "", shoot_date: new Date().toISOString().slice(0, 10), location: "", deadline: "", notes: "" });
      fetchData();
    } catch(e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const createOwnScript = async () => {
    if (!ownScriptForm.pillar_id || !ownScriptForm.title) return toast.error("Pillar + title required");
    try {
      await axios.post(`${API}/content/scripts`, ownScriptForm);
      toast.success("Script created — you can now produce it");
      setShowOwnScript(false);
      setOwnScriptForm({ pillar_id: "", title: "", content_type: "reel", platform: "instagram", script_text: "", priority: "P2", deadline: "" });
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const submitDirectPost = async () => {
    if (!directPostLink.trim()) return toast.error("Live post URL is required");
    try {
      await axios.post(`${API}/content/scripts/${directPostTarget.id}/mark-posted`, { post_link: directPostLink.trim(), caption: directPostCaption });
      toast.success("Marked LIVE 🎉");
      setDirectPostTarget(null); setDirectPostLink(""); setDirectPostCaption("");
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const logout = () => { localStorage.clear(); navigate("/login"); };
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F9F8F6]"><Loader2 className="w-8 h-8 animate-spin text-[#3B5249]" /></div>;

  const renderScriptCard = (t, isOwn = false) => {
    const ct = CT_META[t.content_type] || CT_META.reel;
    const steps = t.steps || ct.steps;
    const pr = PRIORITY_META[t.priority] || PRIORITY_META.P2;
    const awaiting = t.post_approval_status === 'pending';
    const rejected = t.post_approval_status === 'rejected';
    const approvedNotPosted = t.post_approval_status === 'approved' && t.post_status !== 'posted';
    const isLive = t.post_status === 'posted';
    return (
      <div key={t.id} className={`rounded-2xl border p-4 transition ${awaiting ? 'border-blue-300 bg-blue-50/40' : rejected ? 'border-rose-300 bg-rose-50/40' : approvedNotPosted ? 'border-emerald-300 bg-emerald-50/30' : 'border-[#E5E3DB] bg-white hover:shadow-sm'}`} data-testid={`cd-script-${t.id}`}>
        <div className="flex justify-between items-start mb-3 gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-heading font-medium text-[#2C3531]">{t.title}</p>
              <Badge className={`text-[9px] border ${pr.cls}`}>{pr.label}</Badge>
              <Badge variant="outline" className="text-[9px] capitalize bg-[#3B5249]/5">{ct.icon} {ct.label}</Badge>
              {t.platform && <Badge variant="outline" className="text-[9px] capitalize">{t.platform}</Badge>}
              {isOwn && <Badge variant="outline" className="text-[9px] bg-[#A66E4E]/10 text-[#A66E4E] border-[#A66E4E]/30">Your Draft</Badge>}
              {awaiting && <Badge className="text-[9px] bg-blue-100 text-blue-800 border-blue-200">✋ Awaiting SMM Review</Badge>}
              {rejected && <Badge className="text-[9px] bg-rose-100 text-rose-800 border-rose-200"><AlertCircle className="w-2.5 h-2.5 mr-0.5" />Revision needed</Badge>}
              {approvedNotPosted && <Badge className="text-[9px] bg-emerald-100 text-emerald-800 border-emerald-200"><CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />Approved · SMM publishing</Badge>}
              {isLive && <Badge className="text-[9px] bg-emerald-600 text-white"><CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />LIVE</Badge>}
              {t.deadline && <Badge variant="outline" className="text-[9px]"><Clock3 className="w-2.5 h-2.5 mr-0.5" />{t.deadline}</Badge>}
            </div>
            {t.pillar_title && <p className="text-[10px] text-[#A66E4E]">{t.pillar_title}</p>}
            {t.script_text && <details className="mt-1"><summary className="text-[10px] text-[#3B5249] cursor-pointer underline">View script</summary><pre className="text-[11px] mt-1 bg-[#F9F8F6] p-2 rounded whitespace-pre-wrap border border-[#E5E3DB]">{t.script_text}</pre></details>}
            {rejected && t.post_feedback && <p className="text-[10px] text-rose-700 mt-1 bg-rose-50 border border-rose-200 rounded p-1.5">SMM feedback: "{t.post_feedback}"</p>}
            {isLive && t.post_link && <a href={t.post_link} target="_blank" rel="noreferrer" className="text-[10px] text-emerald-700 hover:underline inline-flex items-center gap-1 mt-1"><LinkIcon className="w-3 h-3" />View live post</a>}
          </div>
        </div>
        {/* Steps */}
        <div className={`grid gap-2 mb-3`} style={{ gridTemplateColumns: `repeat(${[steps.video, steps.edit, steps.design, steps.post].filter(Boolean).length || 1}, minmax(0, 1fr))` }}>
          {steps.video  && <StepChip label="Shoot"  status={t.video_status}  icon={Video}   link={t.video_link} />}
          {steps.edit   && <StepChip label="Edit"   status={t.edit_status}   icon={Film}    link={t.edited_link} />}
          {steps.design && <StepChip label="Design" status={t.design_status} icon={Palette} link={t.design_link} />}
          {steps.post   && <StepChip label="Post"   status={t.post_status}   icon={Check}   link={t.post_link} />}
        </div>
        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {steps.video && t.video_status !== 'uploaded' && <Button size="sm" className="rounded-full text-[10px] bg-[#3B5249] hover:bg-[#2F4338] text-white h-7" onClick={() => openUpload(t, "video")} data-testid={`upload-video-${t.id}`}><Video className="w-3 h-3 mr-1" />Shoot Uploaded</Button>}
          {steps.edit  && t.edit_status  !== 'uploaded' && <Button size="sm" className="rounded-full text-[10px] bg-[#7D6E83] hover:bg-[#6A5D70] text-white h-7" onClick={() => openUpload(t, "edit")} data-testid={`upload-edit-${t.id}`}><Film className="w-3 h-3 mr-1" />Upload Edit</Button>}
          {steps.design && t.design_status !== 'uploaded' && <Button size="sm" variant="outline" className="rounded-full text-[10px] h-7 border-[#A66E4E] text-[#A66E4E] hover:bg-[#A66E4E]/5" onClick={() => openUpload(t, "design")} data-testid={`upload-design-${t.id}`}><Palette className="w-3 h-3 mr-1" />Upload Design</Button>}
          {!awaiting && !approvedNotPosted && !isLive && <Button size="sm" className="rounded-full text-[10px] bg-blue-600 hover:bg-blue-700 text-white h-7" onClick={() => openUpload(t, "submit_post")} data-testid={`submit-post-${t.id}`}><Upload className="w-3 h-3 mr-1" />{rejected ? "Resubmit" : "Submit to SMM"}</Button>}
          {!isLive && (
            <Button size="sm" variant="outline" className="rounded-full text-[10px] h-7 border-emerald-500 text-emerald-700 hover:bg-emerald-50" onClick={() => { setDirectPostTarget(t); setDirectPostLink(t.post_link || ""); setDirectPostCaption(""); }} data-testid={`cd-direct-post-${t.id}`}>
              <Check className="w-3 h-3 mr-1" />{approvedNotPosted ? "Mark Posted" : "Direct Post"}
            </Button>
          )}
          {awaiting && <Badge className="bg-blue-100 text-blue-800 text-[10px]">⏳ Waiting for SMM review…</Badge>}
          {approvedNotPosted && <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">✅ Approved — ready to publish</Badge>}
          {isLive && t.post_link && (
            <Button size="sm" variant="outline" className="rounded-full text-[10px] h-7 border-emerald-500 text-emerald-700 hover:bg-emerald-50" onClick={() => { setDirectPostTarget(t); setDirectPostLink(t.post_link); setDirectPostCaption(""); }} data-testid={`cd-edit-post-${t.id}`}>
              <Pencil className="w-3 h-3 mr-1" />Update Link
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F9F8F6]" data-testid="content-developer-dashboard">
      {/* Header */}
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#F9F8F6]/85 border-b border-[#E5E3DB]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-heading text-xl font-medium text-[#2C3531]">Celesta <span className="text-[#3B5249] font-semibold">Glow</span></h1>
            <p className="text-xs text-[#59615D] uppercase tracking-[0.15em]">Content Developer · {user.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <DarkModeToggle compact /><NotificationBell />
            <AttendanceCheckIn />
            <Button variant="outline" onClick={logout} className="rounded-full border-[#E5E3DB] text-sm" data-testid="logout-btn"><LogOut className="w-4 h-4 mr-1" />Logout</Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5">
        {/* Hero */}
        <div className="mb-5 rounded-3xl overflow-hidden border border-[#E5E3DB] bg-gradient-to-br from-[#A66E4E] via-[#B08968] to-[#8A5A3B] text-white px-6 py-5 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center flex-shrink-0"><Camera className="w-6 h-6" /></div>
          <div className="flex-1 min-w-0">
            <p className="font-heading text-lg leading-tight">Receive brief → Decide (shoot or edit) → Upload to Drive → Submit to SMM</p>
            <p className="text-xs text-white/85">{pending.length} active · {awaitingApproval.length} awaiting approval{needsRevision.length > 0 && <> · <span className="font-semibold">{needsRevision.length} need revision</span></>}{todayShoots.length > 0 && <> · 📅 {todayShoots.length} shoot(s) today</>}</p>
          </div>
          {needsRevision.length > 0 && <Badge className="bg-rose-500/90 border-rose-300 text-white text-[10px] animate-pulse"><Flame className="w-3 h-3 mr-1" />{needsRevision.length} REVISION</Badge>}
        </div>

        <RoleGuidelines role="content_developer" />

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
          {[
            { l: "Inbox", v: pending.length, i: Inbox, c: "#3B5249" },
            { l: "Awaiting SMM", v: awaitingApproval.length, i: Clock3, c: "#4E6FA0" },
            { l: "Need Revision", v: needsRevision.length, i: AlertCircle, c: "#B75D69" },
            { l: "Live Posts", v: completed.length, i: CheckCircle2, c: "#6B8E6B" },
            { l: "My Own Scripts", v: myOwnScripts.length, i: Pencil, c: "#A66E4E" },
          ].map((s, i) => (
            <div key={`cdd-${i}`} className="bg-white rounded-2xl border border-[#E5E3DB] p-3 hover:shadow-md transition">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-2" style={{ backgroundColor: `${s.c}18` }}>
                <s.i className="w-4 h-4" style={{ color: s.c }} />
              </div>
              <p className="font-heading text-xl font-semibold text-[#2C3531]">{s.v}</p>
              <p className="text-[10px] text-[#59615D] uppercase tracking-wider">{s.l}</p>
            </div>
          ))}
        </div>

        {overdueShoots.length > 0 && (
          <div className="mb-4 px-4 py-3 rounded-2xl bg-rose-50 border border-rose-200 flex items-center gap-2">
            <Flame className="w-4 h-4 text-rose-600" />
            <p className="text-xs text-rose-800"><span className="font-semibold">{overdueShoots.length} overdue shoot{overdueShoots.length > 1 ? 's' : ''}</span> — check Shoot Plans.</p>
          </div>
        )}

        <Tabs defaultValue="inbox" className="space-y-4">
          <TabsList className="bg-white border border-[#E5E3DB] rounded-full p-1 h-auto flex-wrap gap-0.5">
            {[
              { v: "inbox", l: `Inbox from SMM (${pending.length})`, i: Inbox },
              { v: "own", l: `My Own Scripts (${myOwnScripts.length})`, i: Pencil },
              { v: "completed", l: `Completed (${completed.length})`, i: FileCheck2 },
              { v: "shoots", l: `Shoots (${shootPlans.length})`, i: Camera },
              { v: "mysheet", l: "My Task Sheet", i: ListChecks },
            ].map(t => (
              <TabsTrigger key={t.v} value={t.v} className="rounded-full text-[11px] data-[state=active]:bg-[#3B5249] data-[state=active]:text-white px-3 py-1.5 flex items-center gap-1.5" data-testid={`cd-tab-${t.v}`}>
                <t.i className="w-3.5 h-3.5" /> {t.l}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* INBOX */}
          <TabsContent value="inbox">
            <div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
              <div className="mb-3">
                <h3 className="font-heading text-lg font-medium text-[#2C3531]">Scripts sent by Social Media Manager</h3>
                <p className="text-[11px] text-[#59615D]">Steps adapt per content type (Flyer = design → post; Reel = shoot → edit → post; AI Video = edit → post). Upload each deliverable to Drive and submit the final link to SMM for approval.</p>
              </div>
              {pending.length === 0 ? (
                <div className="text-center py-10 text-[#59615D]">
                  <Inbox className="w-10 h-10 mx-auto text-[#D4A373] mb-2" />
                  <p className="text-sm">All caught up!</p>
                </div>
              ) : (
                <div className="space-y-3">{pending.map(t => renderScriptCard(t, false))}</div>
              )}
            </div>
          </TabsContent>

          {/* MY OWN SCRIPTS */}
          <TabsContent value="own">
            <div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
              <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                <div>
                  <h3 className="font-heading text-lg font-medium text-[#2C3531]">My Own Scripts</h3>
                  <p className="text-[11px] text-[#59615D]">Draft your own content ideas, produce them and submit for SMM approval.</p>
                </div>
                <Button size="sm" className="rounded-full bg-[#3B5249] hover:bg-[#2F4338] text-white text-xs" onClick={() => setShowOwnScript(true)} data-testid="cd-new-script-btn"><Plus className="w-3.5 h-3.5 mr-1" />New Script</Button>
              </div>
              {myOwnScripts.length === 0 ? (
                <div className="text-center py-10 text-[#59615D]">
                  <Pencil className="w-10 h-10 mx-auto text-[#D4A373] mb-2" />
                  <p className="text-sm">No self-drafted scripts yet</p>
                </div>
              ) : (
                <div className="space-y-3">{myOwnScripts.map(t => renderScriptCard(t, true))}</div>
              )}
            </div>
          </TabsContent>

          {/* COMPLETED */}
          <TabsContent value="completed">
            <div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
              <h3 className="font-heading text-lg font-medium text-[#2C3531] mb-3">Completed Work — Portfolio</h3>
              {completed.length === 0 ? (
                <div className="text-center py-10 text-[#59615D]">
                  <FileCheck2 className="w-10 h-10 mx-auto text-[#D4A373] mb-2" />
                  <p className="text-sm">No completed scripts yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">{completed.map(t => {
                  const ct = CT_META[t.content_type] || CT_META.reel;
                  return (
                    <div key={t.id} className="bg-gradient-to-br from-emerald-50 to-[#FAF8F3] rounded-xl border border-emerald-200 p-3 flex justify-between items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" /><p className="font-medium text-sm text-[#2C3531] truncate">{t.title}</p></div>
                        <p className="text-[10px] text-[#A66E4E] ml-5">{ct.icon} {ct.label} · {t.pillar_title}</p>
                      </div>
                      <div className="flex gap-1 items-center flex-shrink-0">
                        {t.post_link && <a href={t.post_link} target="_blank" rel="noreferrer" className="text-xs text-emerald-700 hover:underline"><LinkIcon className="w-3 h-3 inline" />Post</a>}
                        <Badge className="bg-emerald-100 text-emerald-800 text-[9px]">LIVE</Badge>
                      </div>
                    </div>
                  );
                })}</div>
              )}
            </div>
          </TabsContent>

          {/* SHOOTS */}
          <TabsContent value="shoots">
            <div className="bg-white rounded-2xl border border-[#E5E3DB] p-5">
              <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                <div>
                  <h3 className="font-heading text-lg font-medium text-[#2C3531]">Shoot Plans & Deadlines</h3>
                  <p className="text-[11px] text-[#59615D]">Schedule shoots, track locations, hit deadlines.</p>
                </div>
                <Button size="sm" className="rounded-full bg-[#3B5249] hover:bg-[#2F4338] text-white text-xs" onClick={() => setShowShoot(true)} data-testid="add-shoot-btn"><CalendarDays className="w-3.5 h-3.5 mr-1" />New Shoot</Button>
              </div>
              {shootPlans.length === 0 ? (
                <div className="text-center py-10 text-[#59615D]">
                  <Camera className="w-10 h-10 mx-auto text-[#D4A373] mb-2" />
                  <p className="text-sm">No shoot plans yet</p>
                </div>
              ) : (
                <div className="space-y-2">{shootPlans.map(p => {
                  const isOverdue = p.deadline && p.deadline < today && p.status !== 'completed' && p.status !== 'cancelled';
                  const isToday = p.shoot_date === today && p.status !== 'completed' && p.status !== 'cancelled';
                  return (
                    <div key={p.id} className={`border rounded-xl p-3 flex justify-between items-center transition ${isOverdue ? 'border-rose-300 bg-rose-50/50' : isToday ? 'border-amber-300 bg-amber-50/50' : 'border-[#E5E3DB] hover:bg-[#FAF8F3]'}`} data-testid={`shoot-${p.id}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isOverdue ? 'bg-rose-100' : isToday ? 'bg-amber-100' : 'bg-[#3B5249]/10'}`}>
                          <Camera className={`w-4 h-4 ${isOverdue ? 'text-rose-700' : isToday ? 'text-amber-700' : 'text-[#3B5249]'}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-medium text-sm text-[#2C3531] truncate">{p.title}</p>
                            <Badge className={`text-[9px] border ${STATUS_STYLE(p.status)}`}>{p.status?.replace('_', ' ')}</Badge>
                            {isToday && <Badge className="text-[9px] bg-amber-100 text-amber-800 border-amber-200">TODAY</Badge>}
                            {isOverdue && <Badge className="text-[9px] bg-rose-100 text-rose-800 border-rose-200"><Flame className="w-2.5 h-2.5 mr-0.5" />OVERDUE</Badge>}
                          </div>
                          <p className="text-[10px] text-[#59615D]">📅 {p.shoot_date}{p.location && <> · 📍 {p.location}</>}{p.deadline && <> · ⏰ Due {p.deadline}</>}</p>
                          {p.notes && <p className="text-[9px] text-[#A66E4E] mt-0.5">{p.notes}</p>}
                        </div>
                      </div>
                      <Select value={p.status} onValueChange={async (v) => { await axios.put(`${API}/shoot-plans/${p.id}`, { status: v }); fetchData(); }}>
                        <SelectTrigger className={`h-7 w-28 text-[9px] rounded-full border ${STATUS_STYLE(p.status)}`}><SelectValue /></SelectTrigger>
                        <SelectContent>{["scheduled", "in_progress", "completed", "cancelled"].map(s => <SelectItem key={s} value={s} className="text-xs">{s.replace('_', ' ')}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  );
                })}</div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="mysheet"><DailyTaskSheet titleSuffix="Content Developer" /></TabsContent>
        </Tabs>
      </div>

      {/* UPLOAD DIALOG */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="rounded-2xl">
          <DialogHeader><DialogTitle className="font-heading">{uploadType === "video" ? "Shoot Uploaded to Drive" : uploadType === "edit" ? "Edit Uploaded to Drive" : uploadType === "design" ? "Design Uploaded to Drive" : "Submit Deliverable for SMM Approval"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="bg-[#FAF8F3] rounded-xl p-3 border border-[#EAE7DE]">
              <p className="text-[10px] text-[#59615D] uppercase tracking-wider mb-1">Script</p>
              <p className="text-sm font-medium text-[#2C3531]">{selectedTask?.title}</p>
              {uploadType === "submit_post" && (
                <div className="mt-2 grid grid-cols-1 gap-1">
                  {selectedTask?.video_link && <a href={selectedTask.video_link} target="_blank" rel="noreferrer" className="text-[10px] text-[#3B5249] hover:underline inline-flex items-center gap-1"><LinkIcon className="w-3 h-3" />Raw footage</a>}
                  {selectedTask?.edited_link && <a href={selectedTask.edited_link} target="_blank" rel="noreferrer" className="text-[10px] text-[#6B8E6B] hover:underline inline-flex items-center gap-1"><LinkIcon className="w-3 h-3" />Edited video</a>}
                  {selectedTask?.design_link && <a href={selectedTask.design_link} target="_blank" rel="noreferrer" className="text-[10px] text-[#A66E4E] hover:underline inline-flex items-center gap-1"><LinkIcon className="w-3 h-3" />Design</a>}
                </div>
              )}
            </div>

            {uploadType === "submit_post" ? (
              <>
                {!(selectedTask?.edited_link || selectedTask?.design_link || selectedTask?.video_link) && (
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-[11px] text-rose-700 flex gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <p>You haven't uploaded an edit / design link yet. Close this and upload it via the step buttons first, then submit for approval.</p>
                  </div>
                )}
                <div><Label className="text-xs">Notes to SMM (optional)</Label><Textarea value={uploadNotes} onChange={e => setUploadNotes(e.target.value)} placeholder="Anything SMM should know about this deliverable?" className="rounded-xl" /></div>
                <p className="text-[10px] text-[#A66E4E] flex items-center gap-1 bg-amber-50 border border-amber-200 rounded p-2"><Sparkles className="w-3 h-3" />The SMM will review your deliverable. They post it on the platform and record the live URL — you don't need to provide it here.</p>
              </>
            ) : (
              <div>
                <Label className="text-xs">Google Drive / Public Link *</Label>
                <div className="relative">
                  <LinkIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#59615D]" />
                  <Input value={uploadLink} onChange={e => setUploadLink(e.target.value)} placeholder="https://drive.google.com/…" className="rounded-xl pl-9" data-testid="upload-link-input" autoFocus />
                </div>
              </div>
            )}

            <Button onClick={handleUpload} className="w-full rounded-full bg-[#3B5249] hover:bg-[#2F4338] text-white" data-testid="upload-submit">
              <Upload className="w-3.5 h-3.5 mr-1" />{uploadType === "submit_post" ? "Submit for Approval" : "Save Link"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* SHOOT DIALOG */}
      <Dialog open={showShoot} onOpenChange={setShowShoot}>
        <DialogContent className="rounded-2xl"><DialogHeader><DialogTitle className="font-heading">New Shoot Plan</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Title *</Label><Input placeholder="e.g. Product hero shots" value={shootForm.title} onChange={e => setShootForm(f => ({ ...f, title: e.target.value }))} className="rounded-xl" data-testid="shoot-title-input" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Shoot Date</Label><Input type="date" value={shootForm.shoot_date} onChange={e => setShootForm(f => ({ ...f, shoot_date: e.target.value }))} className="rounded-xl" /></div>
              <div><Label className="text-xs">Deadline</Label><Input type="date" value={shootForm.deadline} onChange={e => setShootForm(f => ({ ...f, deadline: e.target.value }))} className="rounded-xl" /></div>
            </div>
            <div><Label className="text-xs">Location</Label><Input placeholder="Studio / location" value={shootForm.location} onChange={e => setShootForm(f => ({ ...f, location: e.target.value }))} className="rounded-xl" /></div>
            <div><Label className="text-xs">Notes</Label><Textarea placeholder="Equipment / notes" value={shootForm.notes} onChange={e => setShootForm(f => ({ ...f, notes: e.target.value }))} className="rounded-xl" /></div>
            <Button onClick={submitShoot} className="w-full rounded-full bg-[#3B5249] hover:bg-[#2F4338] text-white" data-testid="shoot-submit">Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIRECT POST / MARK LIVE — CD can publish themselves */}
      <Dialog open={!!directPostTarget} onOpenChange={(o) => !o && setDirectPostTarget(null)}>
        <DialogContent className="rounded-2xl" data-testid="cd-direct-post-dialog">
          <DialogHeader><DialogTitle className="font-heading flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600" />Mark Posted — {directPostTarget?.title}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-[11px] text-emerald-800 flex gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>Posting this directly? Paste the live post URL — it will be saved against the script and SMM will see it as published.</p>
            </div>
            <div>
              <Label className="text-xs">Live Post URL *</Label>
              <div className="relative">
                <LinkIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#59615D]" />
                <Input value={directPostLink} onChange={e => setDirectPostLink(e.target.value)} placeholder="https://instagram.com/p/…" className="rounded-xl pl-9" data-testid="cd-direct-post-link-input" autoFocus />
              </div>
            </div>
            <div>
              <Label className="text-xs">Caption (optional)</Label>
              <Textarea value={directPostCaption} onChange={e => setDirectPostCaption(e.target.value)} placeholder="Final caption / hashtags used" className="rounded-xl" />
            </div>
            <Button onClick={submitDirectPost} className="w-full rounded-full bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="cd-direct-post-submit"><Upload className="w-3.5 h-3.5 mr-1" />Save & Mark LIVE</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* OWN SCRIPT DIALOG */}
      <Dialog open={showOwnScript} onOpenChange={setShowOwnScript}>
        <DialogContent className="rounded-2xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle className="font-heading">Draft Your Own Script</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Pillar *</Label>
              <Select value={ownScriptForm.pillar_id} onValueChange={v => setOwnScriptForm(f => ({ ...f, pillar_id: v }))}>
                <SelectTrigger className="rounded-xl" data-testid="cd-own-pillar"><SelectValue placeholder="Choose pillar" /></SelectTrigger>
                <SelectContent>{pillars.length === 0 ? <SelectItem value="none" disabled>No pillars yet — ask SMM</SelectItem> : pillars.map(p => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Title *</Label><Input value={ownScriptForm.title} onChange={e => setOwnScriptForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Unboxing Reel — Brand Kit" className="rounded-xl" data-testid="cd-own-title" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Content Type</Label>
                <Select value={ownScriptForm.content_type} onValueChange={v => setOwnScriptForm(f => ({ ...f, content_type: v }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reel">🎬 Reel</SelectItem>
                    <SelectItem value="video">📹 Video</SelectItem>
                    <SelectItem value="ai_video">✨ AI Video</SelectItem>
                    <SelectItem value="story">📸 Story</SelectItem>
                    <SelectItem value="post">🖼 Static Post</SelectItem>
                    <SelectItem value="carousel">🎠 Carousel</SelectItem>
                    <SelectItem value="flyer">📰 Flyer</SelectItem>
                    <SelectItem value="ad">💰 Ad</SelectItem>
                    <SelectItem value="blog">✍ Blog</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Platform</Label>
                <Select value={ownScriptForm.platform} onValueChange={v => setOwnScriptForm(f => ({ ...f, platform: v }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>{["instagram", "facebook", "youtube", "tiktok", "whatsapp", "linkedin", "blog"].map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label className="text-xs">Script / Brief</Label><Textarea value={ownScriptForm.script_text} onChange={e => setOwnScriptForm(f => ({ ...f, script_text: e.target.value }))} placeholder="Your ideas, shot list, hook, CTA…" className="rounded-xl min-h-[120px]" data-testid="cd-own-text" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Priority</Label><Select value={ownScriptForm.priority} onValueChange={v => setOwnScriptForm(f => ({ ...f, priority: v }))}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="P1">P1 · Urgent</SelectItem><SelectItem value="P2">P2 · Normal</SelectItem><SelectItem value="P3">P3 · Low</SelectItem></SelectContent></Select></div>
              <div><Label className="text-xs">Deadline</Label><Input type="date" value={ownScriptForm.deadline} onChange={e => setOwnScriptForm(f => ({ ...f, deadline: e.target.value }))} className="rounded-xl" /></div>
            </div>
            <Button onClick={createOwnScript} className="w-full rounded-full bg-[#3B5249] hover:bg-[#2F4338] text-white" data-testid="cd-own-submit">Save Script</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
