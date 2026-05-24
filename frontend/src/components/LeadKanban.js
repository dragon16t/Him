import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

const API = "/api";

const COLUMNS = [
  { key: "new", label: "New", color: "#A66E4E" },
  { key: "contacted", label: "Contacted", color: "#D4A373" },
  { key: "interested", label: "Interested", color: "#6B8E6B" },
  { key: "ordered", label: "Ordered", color: "#3B5249" },
  { key: "delivered", label: "Delivered", color: "#2C3531" },
  { key: "not_interested", label: "Lost", color: "#B75D69" },
];

/** Lead pipeline kanban — drag to update status. Uses HTML5 native drag-drop. */
export default function LeadKanban() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drag, setDrag] = useState(null);

  const fetch = () => {
    setLoading(true);
    axios.get(`${API}/v2/leads`, { params: { limit: 500 } })
      .then(r => setLeads(r.data.leads))
      .catch(e => toast.error("Failed to load"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { fetch(); }, []);

  const move = async (lid, newStatus) => {
    try {
      await axios.put(`${API}/leads/${lid}`, { status: newStatus });
      setLeads(ls => ls.map(l => l.id === lid ? { ...l, status: newStatus } : l));
    } catch (e) { toast.error(e.response?.data?.detail || "Move failed"); fetch(); }
  };

  return (
    <div className="space-y-3" data-testid="lead-kanban">
      <div className="bg-white rounded-2xl border border-[#E5E3DB] p-3">
        <h3 className="font-heading text-lg font-medium">Lead Pipeline · {leads.length} total</h3>
      </div>
      {loading ? <p className="text-center py-12 text-[#59615D]">Loading…</p> : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 overflow-x-auto">
          {COLUMNS.map(col => {
            const items = leads.filter(l => (l.status || "new") === col.key);
            return (
              <div key={col.key}
                onDragOver={e => e.preventDefault()}
                onDrop={() => { if (drag) move(drag, col.key); setDrag(null); }}
                className="rounded-2xl border-2 border-dashed bg-white p-2 min-h-[400px]"
                style={{ borderColor: `${col.color}30` }}
                data-testid={`kanban-col-${col.key}`}>
                <div className="px-2 py-1.5 rounded-lg text-white text-xs uppercase tracking-wider font-heading flex items-center justify-between" style={{ background: col.color }}>
                  <span>{col.label}</span><span className="bg-white/30 px-1.5 rounded-full text-[10px]">{items.length}</span>
                </div>
                <div className="space-y-2 mt-2">
                  {items.map(l => (
                    <div key={l.id}
                      draggable onDragStart={() => setDrag(l.id)} onDragEnd={() => setDrag(null)}
                      className="bg-white rounded-xl border border-[#E5E3DB] p-2 cursor-move hover:shadow-md transition"
                      data-testid={`kanban-card-${l.id}`}>
                      <p className="font-medium text-xs truncate">{l.name}</p>
                      <p className="text-[10px] text-[#59615D]">{l.phone_number}</p>
                      <div className="flex items-center justify-between mt-1">
                        <Badge variant="outline" className="text-[9px]">{l.product_interest || "general"}</Badge>
                        <span className="text-[9px] text-[#59615D]">{l.assigned_to_name?.split(" ")[0] || "—"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
