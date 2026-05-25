import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { toast } from "sonner";
import { ClipboardCheck, Plus, CheckCircle2, Clock, Loader2, Trash2, Calendar } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_META = {
  pending: { color: "bg-amber-100 text-amber-800 border-amber-300", icon: Clock, label: "Pending" },
  in_progress: { color: "bg-blue-100 text-blue-800 border-blue-300", icon: Loader2, label: "In Progress" },
  completed: { color: "bg-green-100 text-green-800 border-green-300", icon: CheckCircle2, label: "Completed" },
};

export default function DailyTaskSheet({ titleSuffix = "", compact = false }) {
  const today = new Date().toISOString().slice(0, 10);
  const [dateFilter, setDateFilter] = useState(today);
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState({ from_time: "", to_time: "", title: "", notes: "", status: "pending" });
  const [loading, setLoading] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/employee-tasks`, { params: { date_filter: dateFilter } });
      setTasks(data.tasks || []);
    } catch {
      setTasks([]);
    }
  }, [dateFilter]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const addTask = async () => {
    if (!form.title.trim()) return toast.error("Task title is required");
    if (!form.from_time || !form.to_time) return toast.error("From time and To time are required");
    setLoading(true);
    try {
      await axios.post(`${API}/employee-tasks`, { ...form, date: dateFilter });
      setForm({ from_time: "", to_time: "", title: "", notes: "", status: "pending" });
      toast.success("Task entry added");
      fetchTasks();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to add task");
    } finally { setLoading(false); }
  };

  const updateStatus = async (id, status) => {
    try {
      await axios.put(`${API}/employee-tasks/${id}`, { status });
      fetchTasks();
    } catch { toast.error("Update failed"); }
  };

  const deleteTask = async (id) => {
    if (!window.confirm("Delete this task entry?")) return;
    try {
      await axios.delete(`${API}/employee-tasks/${id}`);
      fetchTasks();
    } catch { toast.error("Delete failed"); }
  };

  const completedCount = tasks.filter(t => t.status === "completed").length;

  return (
    <Card className="rounded-2xl border-[#E5E3DB]" data-testid="daily-task-sheet">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-lg font-heading">
            <ClipboardCheck className="w-5 h-5 text-[#3B5249]" />
            Today's Task Sheet {titleSuffix && <span className="text-sm text-[#59615D]">— {titleSuffix}</span>}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#59615D]" />
            <Input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="h-8 w-[150px] rounded-lg text-xs" data-testid="task-date-filter" />
            <Badge variant="outline" className="text-xs">{completedCount}/{tasks.length} done</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Add entry row */}
        <div className="grid grid-cols-12 gap-2 p-3 rounded-xl bg-[#FAF8F3] border border-[#E5E3DB]">
          <div className="col-span-2"><Label className="text-[10px] text-[#59615D]">From</Label><Input type="time" value={form.from_time} onChange={e => setForm(f => ({ ...f, from_time: e.target.value }))} className="h-9 rounded-lg text-sm" data-testid="task-from-input" /></div>
          <div className="col-span-2"><Label className="text-[10px] text-[#59615D]">To</Label><Input type="time" value={form.to_time} onChange={e => setForm(f => ({ ...f, to_time: e.target.value }))} className="h-9 rounded-lg text-sm" data-testid="task-to-input" /></div>
          <div className="col-span-5"><Label className="text-[10px] text-[#59615D]">What did you do / will do?</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Called 20 leads, created 2 Reels, processed payroll…" className="h-9 rounded-lg text-sm" data-testid="task-title-input" /></div>
          <div className="col-span-2"><Label className="text-[10px] text-[#59615D]">Status</Label>
            <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
              <SelectTrigger className="h-9 rounded-lg text-xs" data-testid="task-status-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Planned</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-1 flex items-end"><Button onClick={addTask} disabled={loading} className="h-9 w-full rounded-lg bg-[#3B5249] hover:bg-[#2F4338] text-white" data-testid="task-add-btn"><Plus className="w-4 h-4" /></Button></div>
          {!compact && <div className="col-span-12"><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes / outcomes (optional)" className="rounded-lg text-sm min-h-[48px]" data-testid="task-notes-input" /></div>}
        </div>

        {/* Entries list */}
        {tasks.length === 0 ? (
          <div className="text-center py-6 text-sm text-[#59615D]">No entries for {dateFilter}. Start logging your work!</div>
        ) : (
          <div className="space-y-2">
            {tasks.map(t => {
              const meta = STATUS_META[t.status] || STATUS_META.pending;
              const Icon = meta.icon;
              return (
                <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-[#E5E3DB] bg-white hover:bg-[#FAF8F3] transition-colors" data-testid={`task-row-${t.id}`}>
                  <div className="flex-shrink-0 w-[90px] text-xs text-[#59615D] font-mono">{t.from_time || "--:--"} → {t.to_time || "--:--"}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#3B5249] truncate">{t.title}</p>
                    {t.notes && <p className="text-xs text-[#59615D] truncate">{t.notes}</p>}
                  </div>
                  <Badge className={`text-[10px] border ${meta.color}`}><Icon className="w-3 h-3 mr-1" />{meta.label}</Badge>
                  <Select value={t.status} onValueChange={v => updateStatus(t.id, v)}>
                    <SelectTrigger className="h-8 w-[120px] rounded-lg text-xs" data-testid={`task-status-${t.id}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Planned</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="ghost" onClick={() => deleteTask(t.id)} className="h-8 w-8 p-0 text-red-500 hover:bg-red-50" data-testid={`task-del-${t.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
