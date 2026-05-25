import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, RotateCcw } from "lucide-react";

const API = "/api";

/** Trash bin for soft-deleted leads — restore or auto-purge after 30d. */
export default function TrashView() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = () => {
    setLoading(true);
    axios.get(`${API}/trash/leads`)
      .then(r => setItems(r.data.items))
      .catch(e => toast.error(e.response?.data?.detail || "Failed"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { fetch(); }, []);

  const restore = async (lid) => {
    try {
      await axios.post(`${API}/trash/leads/${lid}/restore`);
      toast.success("Lead restored");
      fetch();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E5E3DB] p-5" data-testid="trash-view">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-heading text-lg font-medium flex items-center gap-2"><Trash2 className="w-5 h-5 text-[#B75D69]"/>Deleted Leads <span className="text-sm text-[#59615D]">· {items.length} items</span></h3>
        <Button size="sm" variant="outline" onClick={fetch} className="rounded-full h-8">Refresh</Button>
      </div>
      {loading ? <p className="text-center py-6 text-[#59615D]">Loading…</p> : items.length === 0 ? (
        <p className="text-center py-8 text-[#59615D] text-sm">Trash is empty ✨</p>
      ) : (
        <div className="space-y-2">
          {items.map(l => (
            <div key={l.id} className="border border-[#E5E3DB] rounded-xl p-3 flex items-center justify-between" data-testid={`trash-${l.id}`}>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">{l.name} · {l.phone_number} <Badge variant="outline" className="text-[9px] ml-1">{l.status}</Badge></p>
                <p className="text-[10px] text-[#59615D]">Deleted {(l.deleted_at || "").slice(0, 16).replace("T", " ")} by {l.deleted_by || "—"}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => restore(l.id)} className="rounded-full text-xs h-7" data-testid={`restore-${l.id}`}>
                <RotateCcw className="w-3 h-3 mr-1"/>Restore
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
