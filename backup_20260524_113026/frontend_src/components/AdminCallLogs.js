import { useState, useEffect } from "react";
import axios from "axios";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const API = "/api";

export default function AdminCallLogs() {
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [date, setDate] = useState("");

  useEffect(() => {
    let mounted = true;
    axios.get(`${API}/call-logs/all`).then(r => { if (mounted) setLogs(r.data.call_logs || []); }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  const filtered = logs.filter(c => {
    if (type !== "all" && c.source !== type && c.type !== type) return false;
    if (date && (c.created_at || c.call_date || "").slice(0, 10) !== date) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        (c.contact_name || "").toLowerCase().includes(s) ||
        (c.caller_name || "").toLowerCase().includes(s) ||
        (c.user_name || "").toLowerCase().includes(s) ||
        (c.phone || "").includes(s) ||
        (c.details || "").toLowerCase().includes(s)
      );
    }
    return true;
  });

  return (
    <div className="bg-white rounded-xl border border-[#E5E3DB] p-5" data-testid="admin-conversations-tab">
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <h3 className="font-heading text-lg font-medium">Conversations / Call Logs ({filtered.length})</h3>
        <div className="flex gap-2 items-center flex-wrap">
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customer / telecaller / phone…" className="rounded-full h-8 text-xs w-64" data-testid="conv-search" />
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-8 text-xs w-36 rounded-full" data-testid="conv-date" />
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-8 text-xs rounded-full w-40" data-testid="conv-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="telecaller_call">Telecaller Call</SelectItem>
              <SelectItem value="agent_call">Agent Call (DM)</SelectItem>
              <SelectItem value="inhouse_call">In-House Call</SelectItem>
              <SelectItem value="hr_call">HR Call</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="text-center py-8 text-[#59615D] text-sm">No conversations found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-[#F9F8F6]">
                {["Date", "Type", "Customer / Contact", "Phone", "Telecaller / Caller", "Status / Outcome", "Notes"].map(h => (
                  <th key={h} className="text-left p-2 text-[10px] uppercase text-[#59615D]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E3DB]">
              {filtered.slice(0, 500).map((c, i) => (
                <tr key={c.id || i} className="hover:bg-[#F9F8F6]" data-testid={`conv-row-${i}`}>
                  <td className="p-2 whitespace-nowrap">{(c.created_at || c.call_date || "").slice(0, 16).replace("T", " ")}</td>
                  <td className="p-2"><Badge variant="outline" className="text-[9px] capitalize">{c.type || c.source?.replace(/_/g, " ")}</Badge></td>
                  <td className="p-2 font-medium">{c.contact_name || c.influencer_name || "-"}</td>
                  <td className="p-2">{c.phone || "-"}</td>
                  <td className="p-2 text-[#3B5249] font-semibold">{c.caller_name || c.user_name || "-"}</td>
                  <td className="p-2"><Badge variant="outline" className="text-[9px] capitalize">{c.status || c.outcome || "-"}</Badge></td>
                  <td className="p-2 max-w-md truncate" title={c.details || c.notes}>{(c.details || c.notes || "").slice(0, 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
