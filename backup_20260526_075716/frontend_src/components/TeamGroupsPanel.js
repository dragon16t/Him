import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Crown, Users, Mail, Trash2, Edit } from "lucide-react";

const API = "/api";

// SM/DM groups: language- or locality-based, max 10 members, with a HEAD elected from the group.
// Manager can email a daily performance report to the group head.
export default function TeamGroupsPanel({ candidates, candidateLabel = "Members" }) {
  // candidates = list of telecallers (for SM) or agents (for DM) {id,name,language,district,area,phone,email}
  const [groups, setGroups] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name:"", type:"language", language:"", locality:"", district:"", head_id:"", member_ids:[] });

  const fetchGroups = useCallback(async () => {
    try { const { data } = await axios.get(`${API}/team/groups`); setGroups(data.groups || []); } catch {}
  }, []);
  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  const reset = () => setForm({ name:"", type:"language", language:"", locality:"", district:"", head_id:"", member_ids:[] });

  const toggleMember = (id) => setForm(f => f.member_ids.includes(id)
    ? { ...f, member_ids: f.member_ids.filter(x => x!==id), head_id: f.head_id===id ? "" : f.head_id }
    : (f.member_ids.length >= 10 ? (toast.error("Max 10 members per group") || f) : { ...f, member_ids: [...f.member_ids, id] }));

  const handleSave = async () => {
    if (!form.name) return toast.error("Group name required");
    if (form.member_ids.length === 0) return toast.error("Add at least 1 member");
    try {
      if (editing) {
        await axios.put(`${API}/team/groups/${editing.id}`, form);
        toast.success("Group updated");
      } else {
        await axios.post(`${API}/team/groups`, form);
        toast.success("Group created");
      }
      setShowAdd(false); setShowEdit(false); setEditing(null); reset(); fetchGroups();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const handleDelete = async (g) => {
    if (!window.confirm(`Delete group "${g.name}"?`)) return;
    try { await axios.delete(`${API}/team/groups/${g.id}`); toast.success("Deleted"); fetchGroups(); }
    catch { toast.error("Failed"); }
  };

  const openEdit = (g) => {
    setEditing(g);
    setForm({ name:g.name||"", type:g.type||"language", language:g.language||"", locality:g.locality||"", district:g.district||"", head_id:g.head_id||"", member_ids: g.member_ids||[] });
    setShowEdit(true);
  };

  const sendReport = async (g) => {
    if (!g.head_id) return toast.error("Set a group head first");
    try {
      const { data } = await axios.post(`${API}/team/groups/${g.id}/send-performance-report`, {});
      toast.success(data.message || "Report sent");
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  // Auto-suggest groups from candidates by language and locality
  const suggestions = (() => {
    const byLang = {}; const byArea = {};
    (candidates || []).forEach(c => {
      const lang = (c.language||"").trim();
      if (lang) { byLang[lang] = byLang[lang] || []; byLang[lang].push(c); }
      const area = (c.area || c.district || "").trim();
      if (area) { byArea[area] = byArea[area] || []; byArea[area].push(c); }
    });
    return { byLang, byArea };
  })();

  return (
    <div className="bg-white rounded-2xl border border-[#E5E3DB] p-5" data-testid="team-groups-panel">
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <div>
          <h3 className="font-heading text-lg font-medium">Team Groups (Language / Locality)</h3>
          <p className="text-[11px] text-[#59615D]">Group up to 10 {candidateLabel.toLowerCase()} per cluster. Pick a HEAD who'll get daily performance reports.</p>
        </div>
        <Button size="sm" className="rounded-full bg-[#3B5249] text-white" onClick={()=>{reset(); setShowAdd(true);}} data-testid="add-group-btn"><Plus className="w-4 h-4 mr-1"/>Create Group</Button>
      </div>

      {/* Auto-suggestions chips */}
      {(Object.keys(suggestions.byLang).length > 0 || Object.keys(suggestions.byArea).length > 0) && (
        <div className="bg-[#F9F8F6] rounded-xl p-3 mb-4">
          <p className="text-[10px] uppercase tracking-wider text-[#3B5249] font-semibold mb-2">Auto-suggestions</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(suggestions.byLang).map(([lang, list]) => (
              <button key={`lang-${lang}`} className="text-[10px] px-2 py-1 rounded-full bg-white border border-[#E5E3DB] hover:bg-[#3B5249] hover:text-white transition-colors" onClick={()=>{
                reset();
                setForm(f => ({ ...f, name: `${lang} Group`, type:"language", language: lang, member_ids: list.slice(0,10).map(c=>c.id) }));
                setShowAdd(true);
              }}>🗣 {lang} ({list.length})</button>
            ))}
            {Object.entries(suggestions.byArea).map(([area, list]) => (
              <button key={`area-${area}`} className="text-[10px] px-2 py-1 rounded-full bg-white border border-[#E5E3DB] hover:bg-[#A66E4E] hover:text-white transition-colors" onClick={()=>{
                reset();
                setForm(f => ({ ...f, name: `${area} Group`, type:"locality", locality: area, member_ids: list.slice(0,10).map(c=>c.id) }));
                setShowAdd(true);
              }}>📍 {area} ({list.length})</button>
            ))}
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-[#E5E3DB] rounded-xl">
          <Users className="w-8 h-8 mx-auto text-[#A0A39E] mb-2"/>
          <p className="text-sm text-[#59615D]">No groups yet</p>
          <p className="text-[11px] text-[#A0A39E]">Click "Create Group" to organise your team into clusters of up to 10 members each.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {groups.map(g => (
            <div key={g.id} className="border border-[#E5E3DB] rounded-xl p-4 hover:shadow-sm transition-shadow" data-testid={`group-card-${g.id}`}>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-heading font-medium text-[#2C3531]">{g.name}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <Badge variant="outline" className="text-[9px] capitalize">{g.type}</Badge>
                    {g.language && <Badge variant="outline" className="text-[9px] bg-[#F9F8F6]">🗣 {g.language}</Badge>}
                    {g.locality && <Badge variant="outline" className="text-[9px] bg-[#F9F8F6]">📍 {g.locality}</Badge>}
                    <Badge className="text-[9px] bg-[#3B5249] text-white">{(g.member_ids||[]).length}/10</Badge>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0 rounded-full" onClick={()=>openEdit(g)} data-testid={`edit-group-${g.id}`}><Edit className="w-3 h-3"/></Button>
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0 rounded-full text-red-500 border-red-200 hover:bg-red-50" onClick={()=>handleDelete(g)} data-testid={`del-group-${g.id}`}><Trash2 className="w-3 h-3"/></Button>
                </div>
              </div>
              {g.head ? (
                <div className="bg-gradient-to-r from-[#F4ECD2]/40 to-[#F9F8F6] rounded-lg px-3 py-2 mb-2 flex items-center gap-2 border border-[#A66E4E]/30">
                  <Crown className="w-3.5 h-3.5 text-[#A66E4E]"/>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[#2C3531]">{g.head.name} <span className="text-[10px] font-normal text-[#A66E4E] uppercase tracking-wider">Head</span></p>
                    <p className="text-[10px] text-[#59615D] truncate">{g.head.email} • {g.head.phone}</p>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-[#A66E4E] mb-2">⚠ No head selected — edit group to assign one</p>
              )}
              {(g.members||[]).length > 0 && (
                <div className="space-y-1 mb-2 max-h-40 overflow-y-auto">
                  {g.members.map(m => (
                    <div key={m.id} className={`flex items-center justify-between text-[11px] py-1 px-2 rounded ${m.id===g.head_id?"bg-[#F4ECD2]/40":"hover:bg-[#F9F8F6]"}`}>
                      <span className="flex items-center gap-1.5 truncate">
                        {m.id===g.head_id && <Crown className="w-3 h-3 text-[#A66E4E] shrink-0"/>}
                        <span className="truncate">{m.name}</span>
                        {m.language && <span className="text-[9px] text-[#59615D]">({m.language})</span>}
                      </span>
                      <span className="text-[9px] text-[#59615D] shrink-0 ml-2">{m.total_calls||0}c {m.conversions||0}o</span>
                    </div>
                  ))}
                </div>
              )}
              <Button size="sm" className="w-full rounded-full bg-[#A66E4E] text-white hover:bg-[#8E5A3F] text-[11px]" onClick={()=>sendReport(g)} disabled={!g.head_id} data-testid={`send-report-${g.id}`}><Mail className="w-3 h-3 mr-1"/>Email Daily Report to Head</Button>
            </div>
          ))}
        </div>
      )}

      {/* CREATE / EDIT DIALOG */}
      <Dialog open={showAdd || showEdit} onOpenChange={(o)=>{ if(!o){ setShowAdd(false); setShowEdit(false); setEditing(null); reset(); }}}>
        <DialogContent className="rounded-2xl max-w-2xl max-h-[88vh] overflow-y-auto" data-testid="group-dialog">
          <DialogHeader><DialogTitle className="font-heading">{editing ? "Edit Group" : "Create New Group"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Group Name *</Label><Input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Malayalam North Team" className="rounded-xl" data-testid="group-name-input"/></div>
              <div><Label className="text-xs">Group Type</Label>
                <Select value={form.type} onValueChange={v=>setForm(f=>({...f,type:v}))}>
                  <SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger>
                  <SelectContent><SelectItem value="language">Language-based</SelectItem><SelectItem value="locality">Locality-based</SelectItem><SelectItem value="hybrid">Hybrid</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Language (optional)</Label><Input value={form.language} onChange={e=>setForm(f=>({...f,language:e.target.value}))} placeholder="e.g. Malayalam" className="rounded-xl"/></div>
              <div><Label className="text-xs">Locality / District (optional)</Label><Input value={form.locality} onChange={e=>setForm(f=>({...f,locality:e.target.value}))} placeholder="e.g. Ernakulam, Kakkanad" className="rounded-xl"/></div>
            </div>

            <div>
              <Label className="text-xs">Members (max 10) — {form.member_ids.length}/10 selected</Label>
              <div className="border border-[#E5E3DB] rounded-xl p-2 max-h-56 overflow-y-auto bg-[#F9F8F6]">
                {(candidates || []).length === 0 ? <p className="text-xs text-[#59615D] py-3 text-center">No {candidateLabel.toLowerCase()} found</p> :
                (candidates || []).map(c => (
                  <label key={c.id} className={`flex items-center gap-2 p-1.5 rounded cursor-pointer hover:bg-white ${form.member_ids.includes(c.id)?"bg-white shadow-sm":""}`}>
                    <input type="checkbox" checked={form.member_ids.includes(c.id)} onChange={()=>toggleMember(c.id)} className="rounded"/>
                    <span className="text-xs flex-1">{c.name}</span>
                    {c.language && <Badge variant="outline" className="text-[8px]">{c.language}</Badge>}
                    {(c.area||c.district) && <Badge variant="outline" className="text-[8px]">{c.area||c.district}</Badge>}
                  </label>
                ))}
              </div>
            </div>

            {form.member_ids.length > 0 && (
              <div>
                <Label className="text-xs flex items-center gap-1"><Crown className="w-3.5 h-3.5 text-[#A66E4E]"/>Group Head — gets daily reports</Label>
                <Select value={form.head_id || "__none__"} onValueChange={v=>setForm(f=>({...f, head_id: v==="__none__" ? "" : v}))}>
                  <SelectTrigger className="rounded-xl" data-testid="group-head-select"><SelectValue placeholder="Pick a head from members"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— No head —</SelectItem>
                    {form.member_ids.map(mid => {
                      const c = (candidates||[]).find(x=>x.id===mid);
                      return c ? <SelectItem key={mid} value={mid}>{c.name}{c.email?` • ${c.email}`:""}</SelectItem> : null;
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button onClick={handleSave} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="save-group-btn">{editing ? "Save Changes" : "Create Group"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
