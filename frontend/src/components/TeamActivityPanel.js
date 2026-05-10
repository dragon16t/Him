import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhoneCall, Home, FileText, User } from "lucide-react";
import MonthFilter from "./MonthFilter";

const API = "/api";

// Manager view of agent/telecaller calls + home visits with month/day filter
export default function TeamActivityPanel() {
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [day, setDay] = useState("all");
  const [activityType, setActivityType] = useState("all");
  const [userId, setUserId] = useState("all");
  const [activities, setActivities] = useState([]);
  const [summary, setSummary] = useState({ total: 0, calls: 0, home_visits: 0, with_notes: 0, by_user: {} });
  const [loading, setLoading] = useState(false);

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    try {
      const params = { month, year };
      if (day !== "all") params.day = day;
      if (activityType !== "all") params.activity_type = activityType;
      if (userId !== "all") params.user_id = userId;
      const { data } = await axios.get(`${API}/team-activity`, { params });
      setActivities(data.activities || []);
      setSummary(data.summary || { total: 0, calls: 0, home_visits: 0, with_notes: 0, by_user: {} });
    } catch (e) { /* ignore */ }
    setLoading(false);
  }, [month, year, day, activityType, userId]);

  useEffect(() => { fetchActivity(); }, [fetchActivity]);

  const fmtTs = (ts) => {
    if (!ts) return "—";
    return String(ts).slice(0, 16).replace("T", " ");
  };

  const userOptions = Object.entries(summary.by_user).map(([id, v]) => ({ id, ...v }));

  return (
    <div className="bg-white rounded-2xl border border-[#E5E3DB] p-5" data-testid="team-activity-panel">
      <div className="flex justify-between items-start mb-3 flex-wrap gap-2">
        <div>
          <h3 className="font-heading text-lg font-medium">Team Activity Tracker</h3>
          <p className="text-[11px] text-[#59615D]">Calls, home visits, customer notes, conversations — filter by date and team member.</p>
        </div>
      </div>
      <MonthFilter month={month} year={year} day={day} onMonthChange={setMonth} onYearChange={setYear} onDayChange={setDay}/>
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <span className="text-[10px] text-[#59615D] font-medium uppercase">Type:</span>
        {[{v:"all",l:"All"},{v:"call",l:"Calls"},{v:"home_visit",l:"Home Visits"}].map(t=>(
          <button key={t.v} onClick={()=>setActivityType(t.v)} className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${activityType===t.v?"bg-[#3B5249] text-white":"bg-white border border-[#E5E3DB] text-[#59615D] hover:bg-[#F9F8F6]"}`} data-testid={`activity-type-${t.v}`}>{t.l}</button>
        ))}
        <span className="text-[10px] text-[#59615D] font-medium uppercase ml-2">Member:</span>
        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger className="w-44 h-7 text-[10px] rounded-full" data-testid="activity-user-select"><SelectValue/></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All members</SelectItem>
            {userOptions.map(u => <SelectItem key={u.id} value={u.id}>{u.name} ({u.total})</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="rounded-full text-[10px] h-7" onClick={fetchActivity}>Refresh</Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <div className="bg-[#F9F8F6] rounded-xl p-3"><p className="text-[9px] uppercase text-[#59615D]">Activities</p><p className="font-heading font-semibold">{summary.total}</p></div>
        <div className="bg-[#F9F8F6] rounded-xl p-3"><p className="text-[9px] uppercase text-[#59615D]">Calls</p><p className="font-heading font-semibold text-[#3B5249]">{summary.calls}</p></div>
        <div className="bg-[#F9F8F6] rounded-xl p-3"><p className="text-[9px] uppercase text-[#59615D]">Home Visits</p><p className="font-heading font-semibold text-[#A66E4E]">{summary.home_visits}</p></div>
        <div className="bg-[#F9F8F6] rounded-xl p-3"><p className="text-[9px] uppercase text-[#59615D]">With Notes</p><p className="font-heading font-semibold text-[#6B8E6B]">{summary.with_notes}</p></div>
      </div>
      {loading ? (
        <p className="text-center py-6 text-[#59615D] text-sm">Loading…</p>
      ) : activities.length === 0 ? (
        <p className="text-center py-8 text-[#59615D] text-sm">No activity for the selected filters</p>
      ) : (
        <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
          {activities.map((a, idx) => (
            <div key={idx} className={`border border-[#E5E3DB] rounded-xl p-3 hover:shadow-sm transition-shadow ${a.type==="home_visit"?"border-l-4 border-l-[#A66E4E]":"border-l-4 border-l-[#3B5249]"}`} data-testid={`activity-row-${idx}`}>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div className="flex items-start gap-3 flex-1">
                  {a.type === "home_visit" ? <Home className="w-4 h-4 mt-0.5 text-[#A66E4E] shrink-0"/> : <PhoneCall className="w-4 h-4 mt-0.5 text-[#3B5249] shrink-0"/>}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={`text-[9px] ${a.type==="home_visit"?"bg-orange-100 text-orange-800":"bg-emerald-100 text-emerald-800"}`}>{a.type==="home_visit"?"Home Visit":"Call"}</Badge>
                      <span className="text-xs flex items-center gap-1 text-[#59615D]"><User className="w-3 h-3"/>{a.user_name}</span>
                      {a.outcome && <Badge variant="outline" className="text-[9px] capitalize">{String(a.outcome).replace(/_/g," ")}</Badge>}
                    </div>
                    <p className="text-sm font-medium mt-1">{a.customer_name || "(unknown customer)"}{a.customer_phone && <span className="text-xs text-[#59615D] font-normal ml-2">{a.customer_phone}</span>}</p>
                    {a.address && <p className="text-[11px] text-[#59615D]">📍 {a.address}</p>}
                    {a.product_interest && <p className="text-[11px] text-[#A66E4E]">Interested in: {a.product_interest}</p>}
                    {a.notes && (
                      <div className="mt-2 bg-[#F9F8F6] rounded-lg p-2 border-l-2 border-[#3B5249]">
                        <p className="text-[10px] uppercase tracking-wider text-[#3B5249] font-semibold flex items-center gap-1"><FileText className="w-3 h-3"/>Notes</p>
                        <p className="text-xs text-[#2C3531] mt-0.5 whitespace-pre-wrap">{a.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end text-right gap-1 shrink-0">
                  <span className="text-[10px] text-[#59615D]">{fmtTs(a.timestamp)}</span>
                  {a.duration && <span className="text-[10px] text-[#59615D]">⏱ {a.duration}s</span>}
                  {a.customer_phone && <a href={`tel:${a.customer_phone}`}><Button size="sm" variant="outline" className="rounded-full h-6 w-6 p-0 border-[#6B8E6B] text-[#6B8E6B] hover:bg-[#6B8E6B] hover:text-white"><PhoneCall className="w-3 h-3"/></Button></a>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
