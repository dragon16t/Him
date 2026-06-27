/**
 * PostOfficePanel.jsx — India Post bulk-upload + telecaller follow-up
 *
 * Visible on Inventory Manager + Admin dashboards.
 * 1. Upload the daily Excel manifest (drag-drop / click).
 * 2. Each parsed row is auto-matched to an existing order by name + COD + destination.
 * 3. Matched rows show the linked telecaller with one-click WhatsApp + Call.
 * 4. Per-telecaller stats card: total / in-transit / delivered / returned counts.
 */
import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Upload, Truck, Phone, MessageSquare, Link2, RefreshCw, Search, X, Users, Package, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

const STATUS_META = {
  matched: { cls: "bg-emerald-100 text-emerald-800", icon: CheckCircle2, label: "Matched" },
  ambiguous: { cls: "bg-amber-100 text-amber-800", icon: AlertTriangle, label: "Ambiguous" },
  unmatched: { cls: "bg-red-100 text-red-800", icon: XCircle, label: "Unmatched" },
};

export default function PostOfficePanel({ role = "inventory_manager" }) {
  const [tab, setTab] = useState("shipments");
  const [shipments, setShipments] = useState([]);
  const [stats, setStats] = useState([]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDate, setFilterDate] = useState("");
  const [uploading, setUploading] = useState(false);
  const [lastUpload, setLastUpload] = useState(null);
  const [waModal, setWaModal] = useState(null);
  const [relinkTarget, setRelinkTarget] = useState(null);
  const [relinkOrderId, setRelinkOrderId] = useState("");

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        axios.get(`${API}/post-office/shipments`, { params: { limit: 1000 } }),
        axios.get(`${API}/post-office/telecaller-stats`),
      ]);
      setShipments(a.data?.shipments || []);
      setStats(b.data?.telecallers || []);
    } catch (e) { /* silent */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const uploadFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setLastUpload(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await axios.post(`${API}/post-office/upload`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`Parsed ${data.total_rows} rows · ${data.matched} matched · ${data.ambiguous} need review · ${data.unmatched} unmatched`);
      setLastUpload(data);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Upload failed");
    } finally { setUploading(false); }
  };

  const openWa = async (shipment) => {
    try {
      const { data } = await axios.post(`${API}/post-office/whatsapp-template`, { shipment_id: shipment.id });
      setWaModal({ shipment, ...data });
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to load template");
    }
  };

  const relink = async () => {
    if (!relinkTarget || !relinkOrderId.trim()) return;
    try {
      await axios.post(`${API}/post-office/relink/${relinkTarget.id}`, { order_id: relinkOrderId.trim() });
      toast.success("Relinked");
      setRelinkTarget(null); setRelinkOrderId(""); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const filtered = shipments.filter(s => {
    if (filterStatus !== "all" && s.match_status !== filterStatus) return false;
    if (filterDate && s.shipment_date !== filterDate) return false;
    if (search) {
      const q = search.toLowerCase();
      return (s.tracking_no || "").toLowerCase().includes(q)
        || (s.customer_name || "").toLowerCase().includes(q)
        || (s.destination || "").toLowerCase().includes(q)
        || (s.telecaller_name || "").toLowerCase().includes(q)
        || (s.order_id || "").toLowerCase().includes(q);
    }
    return true;
  });

  // Summary counts for header chips
  const counts = {
    total: shipments.length,
    matched: shipments.filter(s => s.match_status === "matched").length,
    ambiguous: shipments.filter(s => s.match_status === "ambiguous").length,
    unmatched: shipments.filter(s => s.match_status === "unmatched").length,
    delivered: shipments.filter(s => s.current_status === "delivered").length,
    returned: shipments.filter(s => ["returned", "rto"].includes(s.current_status)).length,
  };

  return (
    <div className="space-y-4" data-testid="post-office-panel">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-heading text-[18px] text-[#2C3531] flex items-center gap-2"><Truck className="w-4 h-4 text-[#A66E4E]"/>Post Office Manifests</h3>
          <p className="text-[10px] text-[#7B6D5A]">Upload daily India Post Excel → auto-match to orders → one-click follow-up with telecaller.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={load} variant="outline" size="sm" className="rounded-full text-[11px] h-8" data-testid="po-refresh"><RefreshCw className="w-3 h-3 mr-1"/>Refresh</Button>
          <label className={`inline-flex items-center gap-1.5 cursor-pointer rounded-full text-[11px] h-8 px-3 ${uploading ? "bg-[#7B6D5A]" : "bg-[#3B5249] hover:bg-[#2C3531]"} text-white font-medium transition`} data-testid="po-upload-btn">
            <Upload className="w-3.5 h-3.5"/>
            {uploading ? "Uploading..." : "Upload Excel"}
            <input type="file" accept=".xlsx,.xls" disabled={uploading} className="hidden" onChange={e => { uploadFile(e.target.files?.[0]); e.target.value = ""; }} data-testid="po-upload-input"/>
          </label>
        </div>
      </div>

      {/* Last-upload summary banner */}
      {lastUpload && (
        <div className="bg-[#F9F8F6] border border-[#E5E3DB] rounded-2xl p-3 flex flex-wrap items-center gap-3 text-[11px]" data-testid="po-last-upload">
          <span className="font-medium text-[#2C3531]">Last upload <span className="font-mono text-[10px] text-[#A66E4E]">{lastUpload.upload_id}</span>:</span>
          <span>📥 <b>{lastUpload.total_rows}</b> rows</span>
          <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">✓ {lastUpload.matched} matched</Badge>
          <Badge className="bg-amber-100 text-amber-800 text-[10px]">⚠ {lastUpload.ambiguous} ambiguous</Badge>
          <Badge className="bg-red-100 text-red-800 text-[10px]">✕ {lastUpload.unmatched} unmatched</Badge>
        </div>
      )}

      {/* Top counts strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2" data-testid="po-stats-strip">
        {[
          { k: "total", label: "Total Shipments", icon: Package, color: "bg-[#F9F8F6] text-[#3B5249]" },
          { k: "matched", label: "Matched", icon: CheckCircle2, color: "bg-emerald-50 text-emerald-700" },
          { k: "ambiguous", label: "Review", icon: AlertTriangle, color: "bg-amber-50 text-amber-700" },
          { k: "unmatched", label: "Unmatched", icon: XCircle, color: "bg-red-50 text-red-700" },
          { k: "delivered", label: "Delivered", icon: CheckCircle2, color: "bg-[#DBE9DD] text-[#15803D]" },
          { k: "returned", label: "Returned", icon: RefreshCw, color: "bg-[#F4EAE0] text-[#A66E4E]" },
        ].map(({ k, label, icon: Icon, color }) => (
          <div key={k} className={`rounded-2xl p-3 ${color}`} data-testid={`po-count-${k}`}>
            <div className="flex items-center justify-between"><Icon className="w-3.5 h-3.5"/></div>
            <div className="text-[18px] font-bold leading-tight mt-1">{counts[k]}</div>
            <div className="text-[9px] uppercase tracking-wide opacity-80">{label}</div>
          </div>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-full bg-[#F9F8F6]">
          <TabsTrigger value="shipments" className="rounded-full text-[11px]" data-testid="po-tab-shipments">Shipments ({shipments.length})</TabsTrigger>
          <TabsTrigger value="telecallers" className="rounded-full text-[11px]" data-testid="po-tab-tc">Telecaller Performance ({stats.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="shipments" className="space-y-3 mt-3">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[#7B6D5A]"/>
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search article #, customer, telecaller, destination, order ID..." className="rounded-full text-xs h-8 pl-8" data-testid="po-search"/>
            </div>
            <div className="flex gap-1">
              {["all", "matched", "ambiguous", "unmatched"].map(s => (
                <button key={s} onClick={() => setFilterStatus(s)} className={`px-3 py-1 rounded-full text-[10px] font-medium ${filterStatus === s ? "bg-[#3B5249] text-white" : "bg-white border border-[#E5E3DB] text-[#59615D]"}`} data-testid={`po-filter-${s}`}>{s[0].toUpperCase() + s.slice(1)}</button>
              ))}
            </div>
            <Input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="rounded-full text-xs h-8 w-36" data-testid="po-filter-date"/>
            {filterDate && <button onClick={() => setFilterDate("")} className="text-[10px] underline text-[#3B5249]">clear</button>}
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-10 text-[#7B6D5A] text-sm bg-white border border-[#E5E3DB] rounded-2xl" data-testid="po-empty">
              {shipments.length === 0 ? "No India Post shipments uploaded yet — click Upload Excel to start." : "No shipments match the current filter."}
            </div>
          ) : (
            <div className="space-y-2" data-testid="po-shipment-list">
              {filtered.map(s => {
                const meta = STATUS_META[s.match_status] || STATUS_META.unmatched;
                const Icon = meta.icon;
                return (
                  <div key={s.id} className="bg-white border border-[#E5E3DB] rounded-2xl p-3 hover:border-[#3B5249] transition" data-testid={`po-row-${s.id}`}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-[260px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={`text-[9px] ${meta.cls}`}><Icon className="w-3 h-3 mr-1"/>{meta.label}</Badge>
                          <span className="font-mono text-[11px] font-bold text-[#3B5249]">{s.tracking_no}</span>
                          {s.shipment_date && <span className="text-[10px] text-[#7B6D5A]">📅 {s.shipment_date}</span>}
                          {s.current_status === "delivered" && <Badge className="bg-[#DBE9DD] text-[#15803D] text-[9px]">✓ Delivered</Badge>}
                          {["returned", "rto"].includes(s.current_status) && <Badge className="bg-orange-100 text-orange-800 text-[9px]">↩ Returned</Badge>}
                          {s.current_status === "shipped" && <Badge className="bg-purple-100 text-purple-800 text-[9px]">🚚 In Transit</Badge>}
                        </div>
                        <p className="font-medium text-sm mt-1.5">
                          <span className="text-[#2C3531]">{s.customer_name || "—"}</span>
                          <span className="text-[#7B6D5A] text-[11px] font-normal"> → {s.destination || "—"}</span>
                        </p>
                        {s.order ? (
                          <p className="text-[10px] text-[#3B5249] mt-0.5">📦 Order <b>{s.order.id}</b> · {s.order.customer_phone} · Rs.{s.order.total_amount} · <span className="text-[#7B6D5A]">{s.order.customer_address}</span></p>
                        ) : (
                          <p className="text-[10px] text-red-600 mt-0.5">No matching order. {s.candidates?.length > 0 && `${s.candidates.length} possible candidates — click Relink to choose.`}</p>
                        )}
                        {s.telecaller_name && (
                          <p className="text-[10px] text-[#A66E4E] mt-0.5">
                            👤 TC: <b>{s.telecaller_name}</b>
                            {s.telecaller_phone && <span> · {s.telecaller_phone}</span>}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        <a href={s.tracking_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] bg-purple-50 border border-purple-300 text-purple-800 hover:bg-purple-100" data-testid={`po-track-${s.id}`}><Link2 className="w-3 h-3"/>Track</a>
                        {s.telecaller_phone && (
                          <>
                            <a href={`tel:${s.telecaller_phone}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] bg-blue-50 border border-blue-300 text-blue-800 hover:bg-blue-100" data-testid={`po-call-${s.id}`}><Phone className="w-3 h-3"/>Call TC</a>
                            <button onClick={() => openWa(s)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100" data-testid={`po-wa-${s.id}`}><MessageSquare className="w-3 h-3"/>WhatsApp</button>
                          </>
                        )}
                        {(role === "inventory_manager" || role === "admin") && (
                          <button onClick={() => { setRelinkTarget(s); setRelinkOrderId(s.order_id || ""); }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] bg-white border border-[#E5E3DB] text-[#59615D] hover:bg-[#F9F8F6]" data-testid={`po-relink-${s.id}`}>↔ Relink</button>
                        )}
                      </div>
                    </div>
                    {s.match_status === "ambiguous" && s.candidates?.length > 0 && (
                      <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl p-2">
                        <p className="text-[10px] font-medium text-amber-900 mb-1">Possible candidates — pick one:</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {s.candidates.slice(0, 4).map(c => (
                            <button key={c.order_id} onClick={() => { setRelinkTarget(s); setRelinkOrderId(c.order_id); }} className="text-left text-[10px] bg-white border border-amber-200 rounded-lg p-1.5 hover:bg-amber-100" data-testid={`po-cand-${s.id}-${c.order_id}`}>
                              <b>{c.order_id}</b> · {c.name} · {c.phone} · Rs.{c.amount} <span className="text-[9px] text-amber-700">(score {c.score})</span>
                              <div className="text-[9px] text-[#7B6D5A] truncate">{c.address}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="telecallers" className="space-y-2 mt-3">
          {stats.length === 0 ? (
            <div className="text-center py-10 text-[#7B6D5A] text-sm bg-white border border-[#E5E3DB] rounded-2xl">No India Post shipments matched to any telecaller yet.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2" data-testid="po-tc-stats-grid">
              {stats.map(t => {
                const total = t.total_shipments || 0;
                const deliveredPct = total ? Math.round((t.delivered / total) * 100) : 0;
                const returnedPct = total ? Math.round((t.returned / total) * 100) : 0;
                return (
                  <div key={t.telecaller_id} className="bg-white border border-[#E5E3DB] rounded-2xl p-3" data-testid={`po-tc-${t.telecaller_id}`}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium text-sm text-[#2C3531]">{t.telecaller_name}</p>
                        <p className="text-[10px] text-[#7B6D5A] font-mono">{t.telecaller_phone || "—"}</p>
                      </div>
                      <Badge className="bg-[#3B5249] text-white text-[10px]">{total} ships</Badge>
                    </div>
                    <div className="grid grid-cols-4 gap-1 text-center mb-2">
                      <div className="bg-purple-50 rounded-lg py-1.5"><div className="text-sm font-bold text-purple-800">{t.in_transit}</div><div className="text-[8px] uppercase text-purple-600">Transit</div></div>
                      <div className="bg-emerald-50 rounded-lg py-1.5"><div className="text-sm font-bold text-emerald-800">{t.delivered}</div><div className="text-[8px] uppercase text-emerald-600">Delivered</div></div>
                      <div className="bg-orange-50 rounded-lg py-1.5"><div className="text-sm font-bold text-orange-800">{t.returned}</div><div className="text-[8px] uppercase text-orange-600">Returned</div></div>
                      <div className="bg-[#F9F8F6] rounded-lg py-1.5"><div className="text-sm font-bold text-[#7B6D5A]">{t.pending}</div><div className="text-[8px] uppercase text-[#7B6D5A]">Other</div></div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 flex-1 bg-[#F0EDE5] rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${deliveredPct}%` }}/></div>
                        <span className="text-[9px] text-emerald-700 w-9 text-right">{deliveredPct}%</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 flex-1 bg-[#F0EDE5] rounded-full overflow-hidden"><div className="h-full bg-orange-500" style={{ width: `${returnedPct}%` }}/></div>
                        <span className="text-[9px] text-orange-700 w-9 text-right">{returnedPct}%</span>
                      </div>
                    </div>
                    {t.telecaller_phone && (
                      <div className="flex gap-1.5 mt-2">
                        <a href={`tel:${t.telecaller_phone}`} className="flex-1 inline-flex items-center justify-center gap-1 py-1 rounded-full text-[10px] bg-blue-50 border border-blue-300 text-blue-800"><Phone className="w-3 h-3"/>Call</a>
                        <a href={`https://wa.me/91${(t.telecaller_phone || "").replace(/\D/g, "").replace(/^91/, "")}`} target="_blank" rel="noreferrer" className="flex-1 inline-flex items-center justify-center gap-1 py-1 rounded-full text-[10px] bg-emerald-50 border border-emerald-300 text-emerald-800"><MessageSquare className="w-3 h-3"/>WhatsApp</a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* WhatsApp template modal */}
      <Dialog open={!!waModal} onOpenChange={o => !o && setWaModal(null)}>
        <DialogContent className="max-w-lg rounded-2xl" data-testid="po-wa-modal" aria-describedby="po-wa-desc">
          <DialogHeader><DialogTitle className="font-heading flex items-center gap-2"><MessageSquare className="w-4 h-4"/>Follow-up Templates</DialogTitle></DialogHeader>
          <p id="po-wa-desc" className="sr-only">WhatsApp templates for telecaller and customer follow-up.</p>
          {waModal && (
            <div className="space-y-3">
              <div className="bg-[#F9F8F6] rounded-2xl p-3">
                <p className="text-[10px] uppercase tracking-wider text-[#7B6D5A] mb-1.5">Telecaller — {waModal.shipment.telecaller_name}</p>
                <pre className="text-[11px] text-[#2C3531] whitespace-pre-wrap font-sans">{waModal.text}</pre>
                <div className="flex gap-2 mt-2">
                  <a href={waModal.wa_link_tc} target="_blank" rel="noreferrer" className="flex-1 text-center py-2 rounded-full text-[11px] bg-emerald-600 text-white hover:bg-emerald-700" data-testid="wa-send-tc"><MessageSquare className="w-3 h-3 inline mr-1"/>WhatsApp to TC</a>
                  <a href={waModal.call_tc_link} className="flex-1 text-center py-2 rounded-full text-[11px] bg-blue-600 text-white hover:bg-blue-700" data-testid="wa-call-tc"><Phone className="w-3 h-3 inline mr-1"/>Call TC</a>
                  <button onClick={() => { navigator.clipboard.writeText(waModal.text); toast.success("Copied"); }} className="px-3 py-2 rounded-full text-[11px] bg-white border border-[#E5E3DB] text-[#3B5249]" data-testid="wa-copy-tc">Copy</button>
                </div>
              </div>
              {waModal.customer_phone && (
                <div className="bg-[#F4F1EA] rounded-2xl p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#7B6D5A] mb-1.5">Customer — {waModal.customer_phone}</p>
                  <pre className="text-[11px] text-[#2C3531] whitespace-pre-wrap font-sans">{waModal.customer_text}</pre>
                  <div className="flex gap-2 mt-2">
                    <a href={waModal.wa_link_customer} target="_blank" rel="noreferrer" className="flex-1 text-center py-2 rounded-full text-[11px] bg-emerald-600 text-white hover:bg-emerald-700" data-testid="wa-send-customer">WhatsApp Customer</a>
                    <button onClick={() => { navigator.clipboard.writeText(waModal.customer_text); toast.success("Copied"); }} className="px-3 py-2 rounded-full text-[11px] bg-white border border-[#E5E3DB] text-[#3B5249]">Copy</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Relink dialog */}
      <Dialog open={!!relinkTarget} onOpenChange={o => !o && setRelinkTarget(null)}>
        <DialogContent className="max-w-md rounded-2xl" data-testid="po-relink-modal" aria-describedby="po-relink-desc">
          <DialogHeader><DialogTitle className="font-heading">Relink Shipment</DialogTitle></DialogHeader>
          <p id="po-relink-desc" className="sr-only">Manually attach this shipment to a different order.</p>
          {relinkTarget && (
            <div className="space-y-2 text-sm">
              <div className="bg-[#F9F8F6] rounded-xl p-2 text-[11px]">
                <p><b>{relinkTarget.tracking_no}</b> · {relinkTarget.customer_name} → {relinkTarget.destination}</p>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#7B6D5A]">Order ID</label>
                <Input value={relinkOrderId} onChange={e => setRelinkOrderId(e.target.value)} placeholder="ORD-20260627-..." className="rounded-xl text-xs" data-testid="po-relink-input"/>
              </div>
              {relinkTarget.candidates?.length > 0 && (
                <div>
                  <p className="text-[10px] text-[#7B6D5A] mb-1">Suggested:</p>
                  <div className="space-y-1">
                    {relinkTarget.candidates.map(c => (
                      <button key={c.order_id} onClick={() => setRelinkOrderId(c.order_id)} className={`w-full text-left text-[10px] p-1.5 rounded-lg border ${relinkOrderId === c.order_id ? "border-[#3B5249] bg-[#3B5249]/5" : "border-[#E5E3DB] bg-white"}`}>
                        <b>{c.order_id}</b> · {c.name} · {c.phone} · Rs.{c.amount} <span className="text-[#7B6D5A]">(score {c.score})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <Button onClick={relink} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="po-relink-submit">Relink to {relinkOrderId || "..."}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
