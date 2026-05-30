import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Activity, ChevronDown, ChevronRight, Users } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function EmployeeEfficiency() {
  const today = new Date().toISOString().slice(0, 10);
  const [dateFilter, setDateFilter] = useState(today);
  const [data, setData] = useState({ employees: [], date: today });
  const [expanded, setExpanded] = useState({});
  const [roleFilter, setRoleFilter] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/employee-tasks/efficiency`, { params: { date_filter: dateFilter } });
      setData(data);
    } catch {
      setData({ employees: [], date: dateFilter });
    }
  }, [dateFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = data.employees.filter(e => !roleFilter || (e.user_role || "").includes(roleFilter));
  const totals = filtered.reduce((a, e) => ({
    total: a.total + e.total, completed: a.completed + e.completed,
    in_progress: a.in_progress + e.in_progress, pending: a.pending + e.pending
  }), { total: 0, completed: 0, in_progress: 0, pending: 0 });

  const rolesAvailable = Array.from(new Set(data.employees.map(e => e.user_role).filter(Boolean)));

  return (
    <Card className="rounded-2xl border-[#E5E3DB]" data-testid="employee-efficiency">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-lg font-heading">
            <Activity className="w-5 h-5 text-[#3B5249]" />
            Employee Efficiency — Task Sheets
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="h-8 w-[150px] rounded-lg text-xs" data-testid="eff-date-filter" />
            <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="h-8 rounded-lg text-xs border border-[#E5E3DB] px-2" data-testid="eff-role-filter">
              <option value="">All roles</option>
              {rolesAvailable.map(r => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-3 text-xs mt-2">
          <Badge className="bg-[#3B5249] text-white"><Users className="w-3 h-3 mr-1" />{filtered.length} employees</Badge>
          <Badge variant="outline">{totals.total} entries</Badge>
          <Badge className="bg-green-100 text-green-800 border-green-300">{totals.completed} completed</Badge>
          <Badge className="bg-blue-100 text-blue-800 border-blue-300">{totals.in_progress} in-progress</Badge>
          <Badge className="bg-amber-100 text-amber-800 border-amber-300">{totals.pending} pending</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-sm text-[#59615D]">No task entries logged for {dateFilter}.</div>
        ) : filtered.map(emp => {
          const isOpen = !!expanded[emp.user_id];
          const pct = emp.total ? Math.round((emp.completed / emp.total) * 100) : 0;
          return (
            <div key={emp.user_id} className="rounded-xl border border-[#E5E3DB] bg-white" data-testid={`eff-emp-${emp.user_id}`}>
              <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-[#FAF8F3]" onClick={() => setExpanded(s => ({ ...s, [emp.user_id]: !isOpen }))}>
                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#3B5249] truncate">{emp.user_name || emp.user_id}</p>
                  <p className="text-[11px] text-[#59615D] capitalize">{(emp.user_role || "").replace(/_/g, " ")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-[120px] h-2 bg-[#F0EFE8] rounded-full overflow-hidden"><div className="h-full bg-[#3B5249]" style={{ width: `${pct}%` }} /></div>
                  <span className="text-xs font-medium text-[#3B5249] w-[45px] text-right">{pct}%</span>
                  <Badge variant="outline" className="text-[10px]">{emp.completed}/{emp.total}</Badge>
                </div>
              </div>
              {isOpen && (
                <div className="border-t border-[#E5E3DB] p-3 space-y-1.5 bg-[#FAFAF7]">
                  {emp.entries.map(t => (
                    <div key={t.id} className="flex items-center gap-3 text-xs px-2 py-1.5 rounded-lg bg-white">
                      <span className="font-mono text-[#59615D] w-[90px]">{t.from_time || "--:--"} → {t.to_time || "--:--"}</span>
                      <span className="flex-1 truncate text-[#3B5249]">{t.title}</span>
                      <Badge className={
                        t.status === "completed" ? "bg-green-100 text-green-800 border-green-300 text-[9px]" :
                        t.status === "in_progress" ? "bg-blue-100 text-blue-800 border-blue-300 text-[9px]" :
                        "bg-amber-100 text-amber-800 border-amber-300 text-[9px]"
                      }>{t.status.replace("_", " ")}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
