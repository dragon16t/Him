import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { User, Phone, Calendar, IndianRupee, Package, FileText, ShoppingBag } from "lucide-react";

const API = "/api";

export default function CustomerHistoryModal({ phone, onClose }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!phone) return;
    setLoading(true);
    axios.get(`${API}/customers/${phone}/360`)
      .then(r => setD(r.data))
      .catch(e => toast.error(e.response?.data?.detail || "Failed"))
      .finally(() => setLoading(false));
  }, [phone]);

  if (!phone) return null;

  return (
    <Dialog open={!!phone} onOpenChange={(o) => !o && onClose && onClose()}>
      <DialogContent className="rounded-2xl max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="customer-360">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2"><User className="w-5 h-5"/>Customer 360°</DialogTitle>
        </DialogHeader>
        {loading || !d ? <p className="text-center py-8 text-[#59615D]">Loading…</p> : (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#E5E3DB] bg-gradient-to-br from-[#F9F8F6] to-white p-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#3B5249] to-[#A66E4E] flex items-center justify-center text-white font-heading text-lg">
                  {(d.leads?.[0]?.name || d.orders?.[0]?.customer_name || "?").slice(0, 1)}
                </div>
                <div>
                  <p className="text-xl font-heading font-semibold">{d.leads?.[0]?.name || d.orders?.[0]?.customer_name || "Unknown"}</p>
                  <p className="text-sm text-[#59615D] flex items-center gap-1"><Phone className="w-3 h-3"/>{d.phone}</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <KpiTile label="Orders" value={d.stats.total_orders} icon={ShoppingBag} />
              <KpiTile label="Delivered" value={d.stats.delivered} icon={Package} />
              <KpiTile label="Total Spent" value={`Rs.${d.stats.total_spent.toLocaleString()}`} icon={IndianRupee} />
              <KpiTile label="Avg Order" value={`Rs.${d.stats.avg_order_value.toLocaleString()}`} icon={IndianRupee} />
            </div>
            {d.stats.first_order_date && (
              <div className="text-xs text-[#59615D] flex items-center gap-3"><Calendar className="w-3 h-3"/>First order: <b>{d.stats.first_order_date.slice(0, 10)}</b> · Last: <b>{d.stats.last_order_date.slice(0, 10)}</b></div>
            )}
            <div>
              <p className="font-heading text-sm text-[#3B5249] mb-2 flex items-center gap-1"><ShoppingBag className="w-4 h-4"/>Order History ({d.orders.length})</p>
              {d.orders.length === 0 ? <p className="text-[#59615D] text-sm">No orders yet</p> : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {d.orders.map(o => (
                    <div key={o.id} className="flex items-center justify-between text-xs border border-[#E5E3DB] rounded-lg p-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-[10px]">{o.id} <Badge className={`text-[9px] ml-1 ${o.status === "delivered" ? "bg-green-100 text-green-800" : o.status === "shipped" ? "bg-blue-100 text-blue-800" : "bg-yellow-100 text-yellow-800"}`}>{o.status}</Badge></p>
                        <p className="text-[#59615D]">{(o.created_at || "").slice(0, 16).replace("T", " ")}</p>
                      </div>
                      <p className="font-semibold text-[#3B5249]">Rs.{(o.total_amount || 0).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {d.leads.length > 0 && (
              <div>
                <p className="font-heading text-sm text-[#3B5249] mb-2 flex items-center gap-1"><FileText className="w-4 h-4"/>Lead History ({d.leads.length})</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {d.leads.map(l => (
                    <div key={l.id} className="text-xs border border-[#E5E3DB] rounded-lg p-2.5">
                      <Badge className="text-[9px] mr-2">{l.status}</Badge>
                      Source: <b>{l.source}</b> · By: <b>{l.assigned_to_name}</b>
                      {l.remarks && <p className="text-[#59615D] mt-1">{l.remarks}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const KpiTile = ({ label, value, icon: Icon }) => (
  <div className="rounded-xl border border-[#E5E3DB] bg-white p-3">
    <div className="flex items-center justify-between text-[10px] uppercase text-[#59615D]">
      <span>{label}</span>{Icon && <Icon className="w-3 h-3" />}
    </div>
    <p className="text-lg font-heading font-semibold text-[#3B5249] mt-1">{value}</p>
  </div>
);
