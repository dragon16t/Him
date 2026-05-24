import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const API = "/api";

const TYPE_LABEL = {
  business_collaboration: { label: "Business Collab", color: "bg-purple-100 text-purple-800" },
  influencer: { label: "Influencer", color: "bg-pink-100 text-pink-800" },
  sales_opportunity: { label: "Sales Opportunity", color: "bg-emerald-100 text-emerald-800" },
};

/**
 * CollaborationContactsPanel
 *   - For SMM: shows business_collaboration + influencer entries.
 *   - For SM: shows sales_opportunity entries.
 *   Filter chips: "All / Today / Last 7d" + per-type filter.
 *   Inline edit of notes + status.
 */
export default function CollaborationContactsPanel({ title = "Collaboration Contacts", allowedTypes = null }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [filterRange, setFilterRange] = useState("all"); // all | today | 7d
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ notes: "", status: "new" });

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/collaboration-contacts`);
      setContacts(data.contacts || []);
    } catch (e) { toast.error(e.response?.data?.detail || "Failed to load contacts"); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const types = allowedTypes && allowedTypes.length ? allowedTypes : Object.keys(TYPE_LABEL);
  const filtered = contacts.filter(c => {
    if (allowedTypes && !allowedTypes.includes(c.enquiry_type)) return false;
    if (filterType !== "all" && c.enquiry_type !== filterType) return false;
    const d = (c.created_at || "").slice(0, 10);
    if (filterRange === "today" && d !== today) return false;
    if (filterRange === "7d" && d < weekAgo) return false;
    return true;
  });

  const startEdit = (c) => { setEditing(c); setEditForm({ notes: c.notes || "", status: c.status || "new" }); };
  const save = async () => {
    if (!editing) return;
    try {
      await axios.put(`${API}/collaboration-contacts/${editing.id}`, editForm);
      toast.success("Updated");
      setEditing(null);
      fetchContacts();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E5E3DB] p-5" data-testid="collab-contacts-panel">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <h3 className="font-heading text-lg font-medium">{title} ({filtered.length})</h3>
        <div className="flex gap-1 flex-wrap items-center">
          {[{v:"all",l:"All"},{v:"today",l:"Today"},{v:"7d",l:"Last 7d"}].map(o => (
            <Button key={o.v} size="sm" variant={filterRange===o.v?"default":"outline"} className={`rounded-full h-7 text-[10px] ${filterRange===o.v?"bg-[#3B5249] text-white":"border-[#E5E3DB]"}`} onClick={()=>setFilterRange(o.v)} data-testid={`collab-range-${o.v}`}>{o.l}</Button>
          ))}
          {types.length > 1 && (
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="rounded-full h-7 text-[10px] w-32" data-testid="collab-type-filter"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {types.map(t => <SelectItem key={t} value={t} className="text-xs">{TYPE_LABEL[t]?.label || t}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {loading ? <p className="text-xs text-[#59615D]">Loading…</p> :
       filtered.length === 0 ? <p className="text-center py-6 text-sm text-[#59615D]">No contacts in this view yet. Telecallers will route new ones here.</p> :
       <div className="space-y-2" data-testid="collab-list">
         {filtered.map(c => {
           const info = TYPE_LABEL[c.enquiry_type] || { label: c.enquiry_type, color: "bg-gray-100 text-gray-800" };
           return (
             <div key={c.id} className="border border-[#E5E3DB] rounded-xl p-3" data-testid={`collab-${c.id}`}>
               <div className="flex justify-between items-start gap-2 flex-wrap">
                 <div className="min-w-0 flex-1">
                   <p className="font-medium text-sm">{c.name || "—"} <span className="text-[#59615D] text-xs font-normal">· {c.phone || "—"}</span></p>
                   <div className="flex gap-1 flex-wrap mt-1 text-[10px]">
                     <Badge className={`text-[9px] ${info.color}`}>{info.label}</Badge>
                     {c.status && c.status !== "new" && <Badge variant="outline" className="text-[9px] capitalize">{String(c.status).replace(/_/g," ")}</Badge>}
                     {c.source_tc_name && <span className="text-[#59615D]">via <b className="text-[#3B5249]">{c.source_tc_name}</b></span>}
                   </div>
                   {c.notes && <p className="text-[11px] text-[#2C3531] mt-1 bg-[#F9F8F6] rounded p-2 whitespace-pre-wrap">{c.notes}</p>}
                 </div>
                 <div className="flex flex-col gap-1 items-end text-[10px] text-[#59615D]">
                   <span>{String(c.created_at || "").slice(0, 10)}</span>
                   <div className="flex gap-1">
                     {c.phone && <a href={`tel:${c.phone}`}><Button size="sm" variant="outline" className="rounded-full h-7 text-[9px] px-2">📞 Call</Button></a>}
                     <Button size="sm" variant="outline" className="rounded-full h-7 text-[9px] px-2" onClick={()=>startEdit(c)} data-testid={`collab-edit-${c.id}`}>✎ Edit</Button>
                   </div>
                 </div>
               </div>
             </div>
           );
         })}
       </div>}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={()=>setEditing(null)} data-testid="collab-edit-overlay">
          <div className="bg-white rounded-2xl p-5 max-w-md w-full" onClick={e=>e.stopPropagation()}>
            <h4 className="font-heading text-base mb-3">Update — {editing.name || editing.phone}</h4>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium">Status</label>
                <Select value={editForm.status} onValueChange={v=>setEditForm(f=>({...f, status:v}))}>
                  <SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="negotiating">Negotiating</SelectItem>
                    <SelectItem value="onboarded">Onboarded / Signed</SelectItem>
                    <SelectItem value="not_interested">Not Interested</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium">Notes</label>
                <Textarea value={editForm.notes} onChange={e=>setEditForm(f=>({...f, notes:e.target.value}))} className="rounded-xl" rows={4} data-testid="collab-edit-notes"/>
              </div>
              <div className="flex gap-2">
                <Button onClick={save} className="flex-1 rounded-full bg-[#3B5249] text-white" data-testid="collab-edit-save">Save</Button>
                <Button variant="outline" onClick={()=>setEditing(null)} className="flex-1 rounded-full">Cancel</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
