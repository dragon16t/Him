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
import { LogOut, FileText, Loader2, Upload, Link, Video, Film, UserCheck } from "lucide-react";
import AttendanceCheckIn from "../components/AttendanceCheckIn";
import NotificationBell from "../components/NotificationBell";
import DarkModeToggle from "../components/DarkModeToggle";

const API = "/api";

export default function ContentStrategistDashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const [briefs, setBriefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showScript, setShowScript] = useState(false);
  const [showDeliver, setShowDeliver] = useState(false);
  const [showForward, setShowForward] = useState(false);
  const [selected, setSelected] = useState(null);
  const [script, setScript] = useState("");
  const [deliveryLink, setDeliveryLink] = useState("");
  const [forwardForm, setForwardForm] = useState({ videographer_name: "", editor_name: "", production_notes: "" });
  const [showCreateBrief, setShowCreateBrief] = useState(false);
  const [briefForm, setBriefForm] = useState({ title: "", description: "", content_type: "video", pillar_name: "", script: "", needs_shoot: true, production_notes: "", due_date: "", videographer_name: "", editor_name: "" });
  const [contentDevs, setContentDevs] = useState([]);
  // Legacy variables retained for backward compatibility with existing UI
  const videographers = contentDevs;
  const editors = contentDevs;

  const fetchData = useCallback(async () => {
    try {
      const [br, v, e] = await Promise.all([
        axios.get(`${API}/content-briefs`),
        axios.get(`${API}/hr-team`).catch(()=>({data:{hr_team:[]}})),
        axios.get(`${API}/hr-team`).catch(()=>({data:{hr_team:[]}}))
      ]);
      setBriefs(br.data.briefs);
      // Get content developers (replaces old videographer/editor roles)
      try { const vu = await axios.get(`${API}/all-users`);
        setContentDevs(vu.data.users?.filter(u=>u.role==="content_developer")||[]);
      } catch { /* non-admin, use defaults */ }
    } catch (err) { console.error(err); }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-save script draft to localStorage every 5s while writing
  useEffect(() => {
    if (!selected?.id || !showScript) return;
    const key = `cs-script-draft-${selected.id}`;
    if (script && script.trim()) {
      const t = setTimeout(() => { try { localStorage.setItem(key, script); } catch {} }, 5000);
      return () => clearTimeout(t);
    }
  }, [script, selected?.id, showScript]);
  // Restore draft when script dialog opens
  useEffect(() => {
    if (showScript && selected?.id) {
      try { const draft = localStorage.getItem(`cs-script-draft-${selected.id}`); if (draft && !script) setScript(draft); } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showScript, selected?.id]);

  const handleScript = async () => {
    if (!script || !selected) return toast.error("Write the script");
    try {
      await axios.put(`${API}/content-briefs/${selected.id}`, { script, status: "scripted" });
      try { localStorage.removeItem(`cs-script-draft-${selected.id}`); } catch {}
      toast.success("Script submitted!"); setShowScript(false); setScript(""); fetchData();
    } catch(e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const handleCreateBrief = async () => {
    if (!briefForm.title) return toast.error("Title required");
    try {
      const { data } = await axios.post(`${API}/content-briefs`, briefForm);
      const status = data.brief?.status;
      if (status === "in_production") toast.success("Brief created & auto-forwarded to Videographer + Editor!");
      else toast.success("Brief created!");
      setShowCreateBrief(false); setBriefForm({ title: "", description: "", content_type: "video", pillar_name: "", script: "", needs_shoot: true, production_notes: "", due_date: "" });
      fetchData();
    } catch(e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const handleDeliver = async () => {
    if (!deliveryLink || !selected) return toast.error("Add delivery link");
    try { await axios.put(`${API}/content-briefs/${selected.id}`, { delivery_link: deliveryLink, status: "completed" }); toast.success("Delivered!"); setShowDeliver(false); setDeliveryLink(""); fetchData(); } catch(e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const handleForwardToProduction = async () => {
    if (!selected) return;
    try {
      await axios.put(`${API}/content-briefs/${selected.id}`, {
        status: "in_production",
        videographer_name: forwardForm.videographer_name,
        editor_name: forwardForm.editor_name,
        production_notes: forwardForm.production_notes
      });
      toast.success("Forwarded to production!");
      setShowForward(false);
      setForwardForm({ videographer_name: "", editor_name: "", production_notes: "" });
      fetchData();
    } catch(e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const logout = () => { localStorage.clear(); navigate("/login"); };
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F9F8F6]"><Loader2 className="w-8 h-8 animate-spin text-[#3B5249]" /></div>;

  const pending = briefs.filter(b => b.status === "pending");
  const scripted = briefs.filter(b => b.status === "scripted");
  const inProduction = briefs.filter(b => b.status === "in_production");
  const completed = briefs.filter(b => b.status === "completed");

  return (
    <div className="min-h-screen bg-[#F9F8F6]" data-testid="content-strategist-dashboard">
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-[#F9F8F6]/80 border-b border-[#E5E3DB]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div><h1 className="font-heading text-xl sm:text-2xl font-medium text-[#2C3531]">Celesta <span className="text-[#3B5249] font-semibold">Glow</span></h1><p className="text-xs text-[#59615D] uppercase tracking-[0.15em]">Content Strategist - {user.name}</p></div>
          <div className="flex items-center gap-2"><DarkModeToggle compact /><NotificationBell /><AttendanceCheckIn /><Button variant="outline" onClick={logout} className="rounded-full border-[#E5E3DB] text-sm" data-testid="logout-btn"><LogOut className="w-4 h-4 mr-1 sm:mr-2"/>Logout</Button></div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex justify-between items-center mb-4">
          <div></div>
          <Button className="rounded-full bg-[#3B5249] text-white text-xs" onClick={() => setShowCreateBrief(true)} data-testid="create-brief-btn"><FileText className="w-3 h-3 mr-1"/>Create Content + Script</Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div className="bg-white rounded-xl sm:rounded-2xl border border-[#E5E3DB] p-4 sm:p-5"><p className="font-heading text-xl sm:text-2xl font-semibold text-[#D4A373]">{pending.length}</p><p className="text-[10px] sm:text-xs text-[#59615D] uppercase mt-1">Pending Briefs</p></div>
          <div className="bg-white rounded-xl sm:rounded-2xl border border-[#E5E3DB] p-4 sm:p-5"><p className="font-heading text-xl sm:text-2xl font-semibold text-[#3B5249]">{scripted.length}</p><p className="text-[10px] sm:text-xs text-[#59615D] uppercase mt-1">Scripted</p></div>
          <div className="bg-white rounded-xl sm:rounded-2xl border border-[#E5E3DB] p-4 sm:p-5"><p className="font-heading text-xl sm:text-2xl font-semibold text-[#A66E4E]">{inProduction.length}</p><p className="text-[10px] sm:text-xs text-[#59615D] uppercase mt-1">In Production</p></div>
          <div className="bg-white rounded-xl sm:rounded-2xl border border-[#E5E3DB] p-4 sm:p-5"><p className="font-heading text-xl sm:text-2xl font-semibold text-[#6B8E6B]">{completed.length}</p><p className="text-[10px] sm:text-xs text-[#59615D] uppercase mt-1">Completed</p></div>
        </div>

        <Tabs defaultValue="pending" className="space-y-6">
          <TabsList className="bg-white border border-[#E5E3DB] rounded-full p-1 h-auto flex-wrap">
            {[{v:"pending",l:`Pending (${pending.length})`},{v:"scripted",l:`Scripted (${scripted.length})`},{v:"production",l:`Production (${inProduction.length})`},{v:"completed",l:`Done (${completed.length})`}].map(t=>(
              <TabsTrigger key={t.v} value={t.v} className="rounded-full text-[11px] sm:text-xs data-[state=active]:bg-[#3B5249] data-[state=active]:text-white px-3 sm:px-4" data-testid={`tab-${t.v}`}>{t.l}</TabsTrigger>
            ))}
          </TabsList>

          {/* Pending - Write Script */}
          <TabsContent value="pending"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-4 sm:p-5"><h3 className="font-heading text-base sm:text-lg font-medium mb-4">Pending Briefs - Write Scripts</h3>
            {pending.length===0?<p className="text-center py-8 text-[#59615D]">No pending briefs</p>:
            <div className="space-y-4">{pending.map(b=>(<div key={b.id} className="border border-[#E5E3DB] rounded-xl p-4" data-testid={`brief-${b.id}`}>
              <div className="flex justify-between items-start mb-2"><div><p className="font-heading font-medium">{b.title}</p><p className="text-xs text-[#A66E4E]">{b.pillar_name} | {b.content_type}</p></div><Badge className="bg-yellow-100 text-yellow-800 text-[10px]">PENDING</Badge></div>
              <p className="text-sm text-[#59615D] mt-1">{b.description}</p>
              {b.due_date&&<p className="text-xs text-[#B75D69] mt-1">Due: {b.due_date}</p>}
              <Button size="sm" className="mt-3 rounded-full bg-[#3B5249] text-white" onClick={()=>{setSelected(b);setShowScript(true);}} data-testid={`write-script-${b.id}`}><FileText className="w-3 h-3 mr-1"/>Write Script</Button>
            </div>))}</div>}
          </div></TabsContent>

          {/* Scripted - Forward to Production with Videographer/Editor Assignment */}
          <TabsContent value="scripted"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-4 sm:p-5"><h3 className="font-heading text-base sm:text-lg font-medium mb-4">Scripted - Assign to Production Team</h3>
            {scripted.length===0?<p className="text-center py-8 text-[#59615D]">No scripted briefs</p>:
            <div className="space-y-4">{scripted.map(b=>(<div key={b.id} className="border border-[#E5E3DB] rounded-xl p-4" data-testid={`scripted-${b.id}`}>
              <div className="flex justify-between"><p className="font-heading font-medium">{b.title}</p><Badge className="bg-blue-100 text-blue-800 text-[10px]">SCRIPTED</Badge></div>
              <p className="text-xs text-[#A66E4E]">{b.content_type}</p>
              <div className="bg-[#F9F8F6] rounded-lg p-2 mt-2"><p className="text-xs font-medium">Script:</p><p className="text-xs whitespace-pre-wrap line-clamp-3">{b.script}</p></div>
              <Button size="sm" className="mt-3 rounded-full bg-[#A66E4E] text-white" onClick={()=>{setSelected(b);setForwardForm({videographer_name:b.videographer_name||"",editor_name:b.editor_name||"",production_notes:b.production_notes||""});setShowForward(true);}} data-testid={`forward-${b.id}`}><Film className="w-3 h-3 mr-1"/>Assign & Forward</Button>
            </div>))}</div>}
          </div></TabsContent>

          {/* In Production - Shows videographer/editor + Upload Deliverable */}
          <TabsContent value="production"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-4 sm:p-5"><h3 className="font-heading text-base sm:text-lg font-medium mb-4">In Production - Upload Deliverables</h3>
            {inProduction.length===0?<p className="text-center py-8 text-[#59615D]">Nothing in production</p>:
            <div className="space-y-4">{inProduction.map(b=>(<div key={b.id} className="border border-[#E5E3DB] rounded-xl p-4" data-testid={`production-${b.id}`}>
              <div className="flex justify-between"><p className="font-heading font-medium">{b.title}</p><Badge className="bg-purple-100 text-purple-800 text-[10px]">IN PRODUCTION</Badge></div>
              <p className="text-xs text-[#A66E4E]">{b.content_type} | Due: {b.due_date}</p>
              {/* Videographer/Editor Info */}
              <div className="flex flex-wrap gap-2 mt-2">
                {b.videographer_name && <div className="flex items-center gap-1 bg-[#F9F8F6] rounded-lg px-2 py-1"><Video className="w-3 h-3 text-[#3B5249]"/><span className="text-xs"><span className="text-[#59615D]">Videographer:</span> <span className="font-medium">{b.videographer_name}</span></span></div>}
                {b.editor_name && <div className="flex items-center gap-1 bg-[#F9F8F6] rounded-lg px-2 py-1"><Film className="w-3 h-3 text-[#A66E4E]"/><span className="text-xs"><span className="text-[#59615D]">Editor:</span> <span className="font-medium">{b.editor_name}</span></span></div>}
              </div>
              {b.production_notes && <p className="text-xs text-[#59615D] mt-1 italic">Notes: {b.production_notes}</p>}
              <Button size="sm" className="mt-3 rounded-full bg-[#3B5249] text-white" onClick={()=>{setSelected(b);setDeliveryLink(b.delivery_link||"");setShowDeliver(true);}} data-testid={`deliver-${b.id}`}><Link className="w-3 h-3 mr-1"/>Upload Video Link</Button>
            </div>))}</div>}
          </div></TabsContent>

          {/* Completed */}
          <TabsContent value="completed"><div className="bg-white rounded-2xl border border-[#E5E3DB] p-4 sm:p-5"><h3 className="font-heading text-base sm:text-lg font-medium mb-4">Completed</h3>
            {completed.length===0?<p className="text-center py-8 text-[#59615D]">No completed content</p>:
            <div className="space-y-3">{completed.map(b=>(<div key={b.id} className="border border-[#E5E3DB] rounded-xl p-4" data-testid={`completed-${b.id}`}>
              <div className="flex justify-between"><p className="font-heading font-medium">{b.title}</p><Badge className="bg-green-100 text-green-800 text-[10px]">COMPLETED</Badge></div>
              <p className="text-xs text-[#A66E4E]">{b.content_type} | {b.pillar_name}</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {b.videographer_name && <span className="text-xs text-[#59615D]"><Video className="w-3 h-3 inline mr-0.5"/>Videographer: {b.videographer_name}</span>}
                {b.editor_name && <span className="text-xs text-[#59615D]"><Film className="w-3 h-3 inline mr-0.5"/>Editor: {b.editor_name}</span>}
              </div>
              {b.delivery_link&&<a href={b.delivery_link} target="_blank" rel="noreferrer" className="text-xs text-[#3B5249] underline mt-2 inline-flex items-center" data-testid={`view-link-${b.id}`}><Link className="w-3 h-3 mr-1"/>View Deliverable</a>}
            </div>))}</div>}
          </div></TabsContent>
        </Tabs>
      </div>

      {/* Write Script Dialog */}
      <Dialog open={showScript} onOpenChange={setShowScript}><DialogContent className="rounded-2xl" data-testid="write-script-dialog"><DialogHeader><DialogTitle className="font-heading">Write Script - {selected?.title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="bg-[#F9F8F6] rounded-xl p-3"><p className="text-xs font-medium">Brief:</p><p className="text-xs text-[#59615D]">{selected?.description}</p><p className="text-xs text-[#A66E4E] mt-1">{selected?.content_type} | {selected?.pillar_name}</p></div>
          <Textarea value={script} onChange={e=>setScript(e.target.value)} placeholder="Write the script here..." className="rounded-xl min-h-[150px]" data-testid="script-input"/>
          <div className="flex justify-between text-[10px] text-[#59615D]">
            <span>{script.length} chars · {script.split(/\s+/).filter(Boolean).length} words</span>
            <span className="italic">Auto-saved as draft every 5s</span>
          </div>
          <Button onClick={handleScript} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-script-btn">Submit Script</Button>
        </div>
      </DialogContent></Dialog>

      {/* Forward to Production Dialog - Assign Videographer & Editor */}
      <Dialog open={showForward} onOpenChange={setShowForward}><DialogContent className="rounded-2xl" data-testid="forward-production-dialog"><DialogHeader><DialogTitle className="font-heading">Assign Production Team - {selected?.title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="bg-[#F9F8F6] rounded-xl p-3">
            <p className="text-xs font-medium">Script Preview:</p>
            <p className="text-xs text-[#59615D] line-clamp-4 whitespace-pre-wrap">{selected?.script}</p>
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1"><Video className="w-3 h-3"/>Videographer Name</Label>
            <Input value={forwardForm.videographer_name} onChange={e=>setForwardForm(f=>({...f,videographer_name:e.target.value}))} placeholder="Assign videographer..." className="rounded-xl" data-testid="videographer-input"/>
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1"><Film className="w-3 h-3"/>Editor Name</Label>
            <Input value={forwardForm.editor_name} onChange={e=>setForwardForm(f=>({...f,editor_name:e.target.value}))} placeholder="Assign editor..." className="rounded-xl" data-testid="editor-input"/>
          </div>
          <div>
            <Label className="text-xs">Production Notes</Label>
            <Textarea value={forwardForm.production_notes} onChange={e=>setForwardForm(f=>({...f,production_notes:e.target.value}))} placeholder="Specific instructions for the production team..." className="rounded-xl" data-testid="production-notes-input"/>
          </div>
          <Button onClick={handleForwardToProduction} className="w-full rounded-full bg-[#A66E4E] text-white" data-testid="submit-forward-btn"><UserCheck className="w-4 h-4 mr-1"/>Assign & Forward to Production</Button>
        </div>
      </DialogContent></Dialog>

      {/* Deliver Dialog - Upload Video Link */}
      <Dialog open={showDeliver} onOpenChange={setShowDeliver}><DialogContent className="rounded-2xl" data-testid="deliver-dialog"><DialogHeader><DialogTitle className="font-heading">Upload Video Link - {selected?.title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {selected?.videographer_name && <div className="bg-[#F9F8F6] rounded-xl p-3 text-xs">
            <div className="flex gap-3">
              {selected.videographer_name && <p><Video className="w-3 h-3 inline mr-1"/>Videographer: <b>{selected.videographer_name}</b></p>}
              {selected.editor_name && <p><Film className="w-3 h-3 inline mr-1"/>Editor: <b>{selected.editor_name}</b></p>}
            </div>
          </div>}
          <div>
            <Label className="text-xs">Delivery Link (Google Drive, YouTube, Dropbox)</Label>
            <Input placeholder="https://drive.google.com/..." value={deliveryLink} onChange={e=>setDeliveryLink(e.target.value)} className="rounded-xl" data-testid="delivery-link-input"/>
          </div>
          <Button onClick={handleDeliver} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-delivery-btn">Mark as Delivered</Button>
        </div>
      </DialogContent></Dialog>

      {/* Create Content Brief + Script Dialog */}
      <Dialog open={showCreateBrief} onOpenChange={setShowCreateBrief}><DialogContent className="rounded-2xl max-h-[85vh] overflow-y-auto" data-testid="create-brief-dialog"><DialogHeader><DialogTitle className="font-heading">Create Content + Script</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs font-medium">Title</Label><Input value={briefForm.title} onChange={e=>setBriefForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Product Launch Reel" className="rounded-xl"/></div>
          <div><Label className="text-xs font-medium">Content Type</Label><Select value={briefForm.content_type} onValueChange={v=>setBriefForm(f=>({...f,content_type:v}))}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="video">Video</SelectItem><SelectItem value="reel">Reel</SelectItem><SelectItem value="post">Post</SelectItem><SelectItem value="story">Story</SelectItem><SelectItem value="carousel">Carousel</SelectItem></SelectContent></Select></div>
          <div><Label className="text-xs font-medium">Content Pillar</Label><Input value={briefForm.pillar_name} onChange={e=>setBriefForm(f=>({...f,pillar_name:e.target.value}))} placeholder="e.g. Skincare Education" className="rounded-xl"/></div>
          <div><Label className="text-xs font-medium">Description / Idea</Label><Textarea value={briefForm.description} onChange={e=>setBriefForm(f=>({...f,description:e.target.value}))} placeholder="Describe the content idea..." className="rounded-xl"/></div>
          <div><Label className="text-xs font-medium">Script (write here to auto-forward)</Label><Textarea value={briefForm.script} onChange={e=>setBriefForm(f=>({...f,script:e.target.value}))} placeholder="Write the full script..." className="rounded-xl min-h-[100px]"/></div>
          <div className="flex items-center gap-2"><input type="checkbox" checked={briefForm.needs_shoot} onChange={e=>setBriefForm(f=>({...f,needs_shoot:e.target.checked}))} className="rounded" id="needs-shoot"/><Label htmlFor="needs-shoot" className="text-xs">Needs video shoot (auto-forward to Videographer + Editor)</Label></div>
          {briefForm.needs_shoot && <><div><Label className="text-xs font-medium">Production Notes</Label><Input value={briefForm.production_notes} onChange={e=>setBriefForm(f=>({...f,production_notes:e.target.value}))} placeholder="Shooting instructions..." className="rounded-xl"/></div>
            <div><Label className="text-xs font-medium">Select Videographer</Label><Select value={briefForm.videographer_name} onValueChange={v=>setBriefForm(f=>({...f,videographer_name:v}))}><SelectTrigger className="rounded-xl"><SelectValue placeholder={videographers.length>0?"Choose videographer":"No content developers found"}/></SelectTrigger><SelectContent>{videographers.length>0?videographers.map(v=><SelectItem key={v.id} value={v.name}>{v.name}</SelectItem>):<div className="px-2 py-1 text-xs text-[#59615D]">Ask admin to add a Content Developer</div>}</SelectContent></Select></div>
            <div><Label className="text-xs font-medium">Select Editor</Label><Select value={briefForm.editor_name} onValueChange={v=>setBriefForm(f=>({...f,editor_name:v}))}><SelectTrigger className="rounded-xl"><SelectValue placeholder={editors.length>0?"Choose editor":"No content developers found"}/></SelectTrigger><SelectContent>{editors.length>0?editors.map(e=><SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>):<div className="px-2 py-1 text-xs text-[#59615D]">Ask admin to add a Content Developer</div>}</SelectContent></Select></div></>}
          <div><Label className="text-xs font-medium">Due Date</Label><Input type="date" value={briefForm.due_date} onChange={e=>setBriefForm(f=>({...f,due_date:e.target.value}))} className="rounded-xl"/></div>
          <div className="bg-[#F9F8F6] rounded-xl p-3 text-xs text-[#59615D]">{briefForm.script && briefForm.needs_shoot ? "Script will be auto-forwarded to Videographer + Editor" : briefForm.script ? "Brief will be saved as scripted" : "Brief will be saved as pending"}</div>
          <Button onClick={handleCreateBrief} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="submit-create-brief-btn">Create & {briefForm.script && briefForm.needs_shoot ? "Auto-Forward" : "Save"}</Button>
        </div>
      </DialogContent></Dialog>
    </div>
  );
}
