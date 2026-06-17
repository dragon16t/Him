/**
 * CustomerPhotosPanel — Sales Manager + Telecaller
 * ---------------------------------------------------------------------------
 * Lists every customer in the user's team (leads + orders, not just photo
 * sessions). For each customer:
 *   - Shows existing photos (Before / Front / Left / Right / After)
 *   - Lets staff DIRECTLY upload from their own device (no customer link needed)
 *   - Lets staff GENERATE a customer-facing link to share on WhatsApp
 *   - Lets staff re-upload (overwrite) any kind, and delete a single photo
 * All uploads persist in MongoDB → survive container restarts.
 */
import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search, Camera, Send, Copy, Trash2, ChevronDown, ChevronUp, Image as ImageIcon, ExternalLink, RefreshCcw, Upload, Plus } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

const KIND_LABELS = { before: "Before", front: "Front", left: "Left", right: "Right", after: "After" };
const KIND_ORDER = ["before", "front", "left", "right", "after"];

export default function CustomerPhotosPanel() {
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [showRequest, setShowRequest] = useState(false);
  const [reqForm, setReqForm] = useState({ customer_phone: "", customer_name: "" });
  const [shareResult, setShareResult] = useState(null);
  const fileRefs = useRef({}); // {`${phone}-${kind}`: HTMLInputElement}
  const [uploadingKey, setUploadingKey] = useState("");

  const search = async (q = query) => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/customer-photos/search`, { params: { q: q.trim() } });
      setCustomers(data.customers || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Search failed");
    } finally {
      setLoading(false);
    }
  };

  // Auto-load all team customers on mount + debounced search on query change
  useEffect(() => { search(""); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    const t = setTimeout(() => { search(query); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [query]);

  const loadPhotos = async (phone) => {
    try {
      const { data } = await axios.get(`${API}/customer-photos/by-customer/${phone}`);
      setExpanded((s) => ({ ...s, [phone]: data.sessions || [] }));
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load photos");
    }
  };

  const toggle = async (phone) => {
    if (expanded[phone] !== undefined) setExpanded((s) => ({ ...s, [phone]: undefined }));
    else await loadPhotos(phone);
  };

  // Staff direct upload (SM or TC uploads on behalf of customer)
  const handleDirectUpload = async (phone, name, kind, file) => {
    if (!file) return;
    const key = `${phone}-${kind}`;
    setUploadingKey(key);
    try {
      const fd = new FormData();
      fd.append("customer_phone", phone);
      fd.append("customer_name", name || "");
      fd.append("kind", kind);
      fd.append("file", file, file.name || `${kind}.jpg`);
      await axios.post(`${API}/customer-photos/direct-upload`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(`${KIND_LABELS[kind]} photo uploaded`);
      await loadPhotos(phone);
      search(query);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    } finally {
      setUploadingKey("");
    }
  };

  const deletePhoto = async (phone, kind) => {
    if (!window.confirm(`Delete the ${KIND_LABELS[kind]} photo? You can re-upload after.`)) return;
    try {
      await axios.delete(`${API}/customer-photos/photo`, { params: { customer_phone: phone, kind } });
      toast.success("Photo deleted");
      loadPhotos(phone);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
  };

  const deleteSession = async (sid, phone) => {
    if (!window.confirm("Delete this whole session including all photos?")) return;
    try {
      await axios.delete(`${API}/customer-photos/session/${sid}`);
      toast.success("Session deleted");
      loadPhotos(phone);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
  };

  const requestRemoteLink = async () => {
    if (!reqForm.customer_phone.trim()) return toast.error("Phone number required");
    try {
      const { data } = await axios.post(`${API}/customer-photos/request`, reqForm);
      setShareResult(data);
      toast.success("Link generated");
      setQuery(reqForm.customer_phone);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
  };

  const copyLink = () => { navigator.clipboard.writeText(shareResult.share_url); toast.success("Link copied!"); };

  // Aggregate all photos for one customer across all sessions for the grid
  const aggregatePhotos = (sessions) => {
    const map = {};
    (sessions || []).forEach((sess) => {
      (sess.photos || []).forEach((p) => {
        // Keep the LATEST upload of each kind
        if (!map[p.kind] || (p.captured_at || "") > (map[p.kind].captured_at || "")) {
          map[p.kind] = { ...p, session_id: sess.id, session_type: sess.session_type };
        }
      });
    });
    return map;
  };

  return (
    <div className="space-y-4" data-testid="customer-photos-panel">
      {/* Search + request */}
      <div className="bg-white rounded-2xl border border-[#E5E3DB] p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-[#7B6D5A]" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search team customers by phone or name… (leave empty to see all)" className="pl-9 rounded-full h-10 text-[13px]" data-testid="customer-photos-search"/>
          </div>
          <Button onClick={() => { setReqForm({ customer_phone: query.trim(), customer_name: "" }); setShareResult(null); setShowRequest(true); }} className="rounded-full bg-[#3B5249] text-white px-5 h-10" data-testid="request-photos-btn">
            <Send className="w-4 h-4 mr-2" /> Send Link to Customer
          </Button>
        </div>
        <p className="text-[11px] text-[#7B6D5A] mt-2">All customers added by your team (leads + orders). Upload Before/After photos directly here, or send the customer a link to capture Front/Left/Right themselves.</p>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center text-[#7B6D5A] py-6 text-[12px]">Loading…</div>
      ) : customers.length === 0 ? (
        <div className="text-center text-[#7B6D5A] py-10 text-[13px] bg-white rounded-2xl border border-[#E5E3DB]">
          {query.trim() ? <>No customers found for &quot;{query}&quot;.</> : <>No customers in your team yet.</>}
        </div>
      ) : (
        <div className="space-y-2">
          {customers.map((c) => {
            const phone = c.customer_phone;
            const isOpen = expanded[phone] !== undefined && expanded[phone] !== null;
            const photoMap = isOpen ? aggregatePhotos(expanded[phone]) : {};
            return (
              <div key={phone} className="bg-white rounded-2xl border border-[#E5E3DB] overflow-hidden" data-testid={`customer-card-${phone}`}>
                <button onClick={() => toggle(phone)} className="w-full p-4 flex items-center justify-between hover:bg-[#FBF7F0] transition">
                  <div className="text-left">
                    <p className="font-medium text-[14px] text-[#2C3531]">{c.customer_name || "Unnamed customer"}</p>
                    <p className="text-[11px] text-[#7B6D5A]">
                      <span className="font-mono">{phone}</span>
                      {c.photos_count > 0 ? <> · <b className="text-[#15803D]">{c.photos_count} photo{c.photos_count !== 1 ? "s" : ""}</b></> : <> · <span className="text-[#A66E4E]">no photos yet</span></>}
                      {c.latest_lead_status && <> · status: {c.latest_lead_status}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.photos_count > 0 && <Badge variant="outline" className="text-[10px] border-[#15803D] text-[#15803D]">✓ {c.photos_count}</Badge>}
                    {isOpen ? <ChevronUp className="w-4 h-4 text-[#7B6D5A]" /> : <ChevronDown className="w-4 h-4 text-[#7B6D5A]" />}
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-[#E5E3DB] p-4 bg-[#FBF7F0]/40 space-y-4">
                    {/* Photo grid — Before / Front / Left / Right / After with inline upload */}
                    <div>
                      <h4 className="text-[11px] font-semibold text-[#3B5249] uppercase tracking-wider mb-2">Photo Gallery</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {KIND_ORDER.map((k) => {
                          const p = photoMap[k];
                          const key = `${phone}-${k}`;
                          return (
                            <div key={k} className="relative" data-testid={`slot-${phone}-${k}`}>
                              {p ? (
                                <div className="relative aspect-[3/4] overflow-hidden rounded-lg border border-[#E5E3DB] group">
                                  <a href={`${process.env.REACT_APP_BACKEND_URL}${p.url}`} target="_blank" rel="noreferrer">
                                    <img src={`${process.env.REACT_APP_BACKEND_URL}${p.url}`} alt={k} className="w-full h-full object-cover group-hover:scale-105 transition" />
                                  </a>
                                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent text-white text-[10px] py-1 px-1.5 flex items-center justify-between">
                                    <span className="capitalize">{KIND_LABELS[k]}</span>
                                    <ExternalLink className="w-3 h-3 text-white/80" />
                                  </div>
                                  <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                                    <button onClick={() => fileRefs.current[key]?.click()} className="bg-white/90 backdrop-blur rounded-full p-1 text-[#3B5249]" title="Replace" data-testid={`replace-${phone}-${k}`}><RefreshCcw className="w-3 h-3"/></button>
                                    <button onClick={() => deletePhoto(phone, k)} className="bg-white/90 backdrop-blur rounded-full p-1 text-red-600" title="Delete" data-testid={`del-photo-${phone}-${k}`}><Trash2 className="w-3 h-3"/></button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => fileRefs.current[key]?.click()}
                                  disabled={uploadingKey === key}
                                  className="aspect-[3/4] w-full bg-white border-2 border-dashed border-[#E5E3DB] hover:border-[#3B5249] hover:bg-[#FBF7F0] rounded-lg flex flex-col items-center justify-center text-[#7B6D5A] hover:text-[#3B5249] transition"
                                  data-testid={`upload-slot-${phone}-${k}`}
                                >
                                  {uploadingKey === key ? <Upload className="w-5 h-5 animate-pulse"/> : <Plus className="w-5 h-5"/>}
                                  <span className="text-[10px] mt-1 capitalize font-medium">{KIND_LABELS[k]}</span>
                                  <span className="text-[9px] text-[#A66E4E]">Upload</span>
                                </button>
                              )}
                              <input
                                ref={(el) => (fileRefs.current[key] = el)}
                                type="file" accept="image/*" capture="environment"
                                onChange={(e) => handleDirectUpload(phone, c.customer_name, k, e.target.files?.[0])}
                                className="hidden"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Sessions timeline — purely historical */}
                    {(expanded[phone] || []).length > 0 && (
                      <details className="bg-white rounded-xl border border-[#E5E3DB] p-3">
                        <summary className="text-[11px] font-medium text-[#3B5249] cursor-pointer">📜 Upload history ({(expanded[phone] || []).length} session{(expanded[phone] || []).length !== 1 ? "s" : ""})</summary>
                        <div className="mt-2 space-y-2">
                          {(expanded[phone] || []).map((sess) => (
                            <div key={sess.id} className="text-[10px] text-[#7B6D5A] border-l-2 border-[#E5E3DB] pl-2 flex items-center justify-between">
                              <div>
                                <p><b>{sess.id}</b> · {(sess.created_at || "").slice(0, 16).replace("T", " ")}</p>
                                <p>By {sess.created_by_name} · {sess.photos?.length || 0} photos · {sess.session_type === "staff" ? "staff upload" : "customer link"} · <span className={sess.status === "submitted" ? "text-[#15803D]" : "text-[#A66E4E]"}>{sess.status}</span></p>
                              </div>
                              {sess.session_type !== "staff" && (
                                <button onClick={() => deleteSession(sess.id, phone)} className="text-red-500 hover:text-red-700" data-testid={`del-session-${sess.id}`}><Trash2 className="w-3 h-3" /></button>
                              )}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Send-link dialog */}
      <Dialog open={showRequest} onOpenChange={(o) => { setShowRequest(o); if (!o) setShareResult(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Send Capture Link to Customer</DialogTitle></DialogHeader>
          {!shareResult ? (
            <div className="space-y-3 py-2">
              <div><Label className="text-[11px]">Customer Phone *</Label><Input value={reqForm.customer_phone} onChange={(e) => setReqForm({ ...reqForm, customer_phone: e.target.value })} placeholder="9876543210" className="rounded-xl" data-testid="req-phone"/></div>
              <div><Label className="text-[11px]">Customer Name (optional)</Label><Input value={reqForm.customer_name} onChange={(e) => setReqForm({ ...reqForm, customer_name: e.target.value })} placeholder="Riya Sharma" className="rounded-xl" data-testid="req-name"/></div>
              <p className="text-[10px] text-[#7B6D5A]">Generates a 7-day link the customer can open on their phone to capture Front/Left/Right photos themselves. Existing photos are kept.</p>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <div className="bg-[#F0F9F4] border border-[#D7F0DD] rounded-xl p-3">
                <p className="text-[10px] text-[#15803D] font-medium uppercase tracking-wider mb-1">Link ready</p>
                <p className="text-[11px] text-[#2C3531] font-mono break-all">{shareResult.share_url}</p>
              </div>
              <div className="flex gap-2">
                <a href={shareResult.wa_url} target="_blank" rel="noreferrer" className="flex-1">
                  <Button className="w-full rounded-full bg-[#25D366] hover:bg-[#1ebd5b] text-white" data-testid="wa-share-btn"><Send className="w-4 h-4 mr-2"/>WhatsApp</Button>
                </a>
                <Button onClick={copyLink} variant="outline" className="rounded-full border-[#3B5249] text-[#3B5249]" data-testid="copy-link-btn"><Copy className="w-4 h-4 mr-1"/>Copy</Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => { setShowRequest(false); setShareResult(null); }}>{shareResult ? "Done" : "Cancel"}</Button>
            {!shareResult && <Button onClick={requestRemoteLink} className="rounded-full bg-[#3B5249] text-white" data-testid="generate-link-btn">Generate Link</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
