import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Plus, Pencil, Trash2 } from "lucide-react";

const API = "/api";

/**
 * Reusable monthly calendar.
 * Props:
 *  - title: header title (e.g. "Content Calendar" or "Campaign Calendar")
 *  - subtitle: small descriptive line
 *  - category: server-side tag used to filter entries ("content" | "campaign")
 *  - shootTypes: dropdown options for the "Type" field (array of strings)
 *  - platforms / formats: dropdown options
 *  - accent: tailwind color hex for accents (default brand green)
 */
export default function CalendarPanel({
  title = "Content Calendar",
  subtitle = "Plan daily activities month-by-month. Click any day to add or edit.",
  category = "content",
  shootTypes = ["UGC Awareness Reel", "Cinematic Product", "Product Showcase", "Myth & Fact Reel", "Static Post", "Carousel", "Story", "Other"],
  platforms = ["instagram", "facebook", "youtube", "tiktok", "linkedin", "twitter", "blog"],
  formats = ["post", "reel", "story", "video", "blog", "ad"],
  accent = "#3B5249",
}) {
  const [entries, setEntries] = useState([]);
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [showCal, setShowCal] = useState(false);
  const [editingCal, setEditingCal] = useState(null);
  const [calForm, setCalForm] = useState({ title: "", platform: platforms[0], content_type: formats[0], shoot_type: shootTypes[0], shoot_time: "", scheduled_date: "", assigned_to_name: "", notes: "", category });

  const fetchData = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/content-calendar`, { params: { category } });
      setEntries(r.data.entries || r.data || []);
    } catch { /* silent */ }
  }, [category]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const submitCal = async () => {
    if (!calForm.title && !calForm.shoot_type) return toast.error("Title or type required");
    if (!calForm.scheduled_date) return toast.error("Pick a date");
    try {
      const payload = { ...calForm, category };
      if (editingCal) {
        await axios.put(`${API}/content-calendar/${editingCal.id}`, payload);
        toast.success("Updated");
      } else {
        await axios.post(`${API}/content-calendar`, payload);
        toast.success("Scheduled");
      }
      setShowCal(false); setEditingCal(null);
      setCalForm({ title: "", platform: platforms[0], content_type: formats[0], shoot_type: shootTypes[0], shoot_time: "", scheduled_date: "", assigned_to_name: "", notes: "", category });
      fetchData();
    } catch { toast.error("Failed"); }
  };

  const openCalDay = (dateStr) => { setEditingCal(null); setCalForm(f => ({ ...f, title: "", scheduled_date: dateStr, notes: "", assigned_to_name: "" })); setShowCal(true); };
  const openEditCal = (c) => { setEditingCal(c); setCalForm({ title: c.title || "", platform: c.platform || platforms[0], content_type: c.content_type || formats[0], shoot_type: c.shoot_type || "", shoot_time: c.shoot_time || "", scheduled_date: c.scheduled_date || "", assigned_to_name: c.assigned_to_name || "", notes: c.notes || "", category }); setShowCal(true); };

  const firstDay = new Date(calYear, calMonth, 1);
  const lastDay = new Date(calYear, calMonth + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startWeekDay = firstDay.getDay();
  const cells = [];
  for (let i = 0; i < startWeekDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const todayStr = new Date().toISOString().slice(0, 10);
  const monthPad = (calMonth + 1).toString().padStart(2, "0");
  const byDay = {};
  (entries || []).forEach(c => {
    if (!c.scheduled_date || !c.scheduled_date.startsWith(`${calYear}-${monthPad}`)) return;
    const day = parseInt(c.scheduled_date.slice(8, 10), 10);
    (byDay[day] = byDay[day] || []).push(c);
  });

  return (
    <div className="bg-white rounded-2xl border border-[#E5E3DB] p-5" data-testid={`calendar-panel-${category}`}>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <div>
          <h3 className="font-heading text-lg font-medium text-[#2C3531]">{title} <span className="text-sm text-[#59615D]">({entries.length})</span></h3>
          <p className="text-[11px] text-[#59615D]">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="rounded-full text-xs h-8" onClick={() => { const d = new Date(calYear, calMonth - 1, 1); setCalMonth(d.getMonth()); setCalYear(d.getFullYear()); }} data-testid={`cal-${category}-prev`}>←</Button>
          <div className="font-heading text-sm font-medium min-w-[140px] text-center">{new Date(calYear, calMonth, 1).toLocaleString("en-US", { month: "long", year: "numeric" })}</div>
          <Button size="sm" variant="outline" className="rounded-full text-xs h-8" onClick={() => { const d = new Date(calYear, calMonth + 1, 1); setCalMonth(d.getMonth()); setCalYear(d.getFullYear()); }} data-testid={`cal-${category}-next`}>→</Button>
          <Button size="sm" style={{ background: accent }} className="rounded-full text-white text-xs h-8" onClick={() => { setEditingCal(null); setCalForm({ title: "", platform: platforms[0], content_type: formats[0], shoot_type: shootTypes[0], shoot_time: "", scheduled_date: new Date().toISOString().slice(0, 10), assigned_to_name: "", notes: "", category }); setShowCal(true); }} data-testid={`cal-${category}-add`}><Plus className="w-3.5 h-3.5 mr-1" />Add</Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1 text-[10px] uppercase tracking-wide text-[#59615D] font-medium">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <div key={d} className="text-center py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, idx) => {
          if (d === null) return <div key={`e${idx}`} className="min-h-[90px] rounded-lg bg-[#FAF8F3]/40" />;
          const dateStr = `${calYear}-${monthPad}-${d.toString().padStart(2, "0")}`;
          const items = byDay[d] || [];
          const isToday = dateStr === todayStr;
          return (
            <div key={dateStr} className={`min-h-[90px] rounded-lg border ${isToday ? "border-[#3B5249] bg-[#F4ECD2]/30" : "border-[#E5E3DB] bg-white"} p-1.5 hover:bg-[#FAF8F3] transition cursor-pointer flex flex-col`} onClick={() => openCalDay(dateStr)} data-testid={`cal-${category}-day-${dateStr}`}>
              <div className="flex justify-between items-center mb-1">
                <span className={`text-[11px] font-semibold ${isToday ? "text-[#3B5249]" : "text-[#2C3531]"}`}>{d}</span>
                {items.length > 0 && <span className="text-[8px] text-white rounded-full px-1.5 py-0.5" style={{ background: accent }}>{items.length}</span>}
              </div>
              <div className="space-y-0.5 overflow-hidden">
                {items.slice(0, 3).map(c => (
                  <button key={c.id} onClick={(ev) => { ev.stopPropagation(); openEditCal(c); }} className="w-full text-left text-[9px] truncate px-1 py-0.5 rounded bg-[#3B5249]/10 text-[#2C3531] hover:bg-[#3B5249]/20" title={`${c.shoot_type || c.title}${c.shoot_time ? ` · ${c.shoot_time}` : ""}`}>
                    {c.shoot_time && <b className="text-[#A66E4E]">{c.shoot_time} </b>}{c.shoot_type || c.title}
                  </button>
                ))}
                {items.length > 3 && <span className="text-[8px] text-[#59615D] pl-1">+{items.length - 3} more</span>}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={showCal} onOpenChange={(o) => { setShowCal(o); if (!o) setEditingCal(null); }}>
        <DialogContent className="rounded-2xl max-h-[88vh] overflow-y-auto"><DialogHeader><DialogTitle className="font-heading">{editingCal ? "Edit Schedule" : `Schedule ${category === "campaign" ? "Campaign" : "Content"}`}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Type *</Label>
              <Select value={calForm.shoot_type} onValueChange={v => setCalForm(f => ({ ...f, shoot_type: v }))}>
                <SelectTrigger className="rounded-xl" data-testid={`cal-${category}-type`}><SelectValue /></SelectTrigger>
                <SelectContent>{shootTypes.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Title / Caption Hint</Label><Input placeholder="Optional title" value={calForm.title} onChange={e => setCalForm(f => ({ ...f, title: e.target.value }))} className="rounded-xl" data-testid={`cal-${category}-title`}/></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Platform</Label><Select value={calForm.platform} onValueChange={v => setCalForm(f => ({ ...f, platform: v }))}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{platforms.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-xs">Format</Label><Select value={calForm.content_type} onValueChange={v => setCalForm(f => ({ ...f, content_type: v }))}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{formats.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Date *</Label><Input type="date" value={calForm.scheduled_date} onChange={e => setCalForm(f => ({ ...f, scheduled_date: e.target.value }))} className="rounded-xl" data-testid={`cal-${category}-date`}/></div>
              <div><Label className="text-xs">Time</Label><Input type="time" value={calForm.shoot_time} onChange={e => setCalForm(f => ({ ...f, shoot_time: e.target.value }))} className="rounded-xl"/></div>
            </div>
            <div><Label className="text-xs">Assigned To</Label><Input placeholder="Person responsible" value={calForm.assigned_to_name} onChange={e => setCalForm(f => ({ ...f, assigned_to_name: e.target.value }))} className="rounded-xl" /></div>
            <div><Label className="text-xs">Notes / Brief</Label><Textarea placeholder="Brief, budget, copy draft, audience..." value={calForm.notes} onChange={e => setCalForm(f => ({ ...f, notes: e.target.value }))} className="rounded-xl" rows={3}/></div>
            <Button onClick={submitCal} style={{ background: accent }} className="w-full rounded-full text-white" data-testid={`cal-${category}-submit`}>{editingCal ? "Update" : "Schedule"}</Button>
            {editingCal && (
              <Button variant="outline" onClick={async () => { if (!window.confirm("Delete this entry?")) return; try { await axios.delete(`${API}/content-calendar/${editingCal.id}`); toast.success("Deleted"); setShowCal(false); setEditingCal(null); fetchData(); } catch { toast.error("Failed"); } }} className="w-full rounded-full border-red-300 text-red-600 hover:bg-red-50" data-testid={`cal-${category}-delete`}><Trash2 className="w-3.5 h-3.5 mr-1.5" />Delete this entry</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
