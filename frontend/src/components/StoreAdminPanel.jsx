// StoreAdminPanel — admin panel for Razorpay keys, store settings, product/combo CRUD, coupons.
import { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Settings, Package, CreditCard, Plus, Pencil, Trash2, Save, Loader2, Image as ImageIcon, Upload, Tag } from "lucide-react";
import MultiImageUploader from "@/components/MultiImageUploader";

const API = "/api";

// Helper to convert a relative /api/uploads/... path into an absolute one for display
const _abs = (u) => {
  if (!u) return "";
  if (u.startsWith("http")) return u;
  const base = process.env.REACT_APP_BACKEND_URL || "";
  return u.startsWith("/") ? base + u : u;
};

/**
 * ImageUploadField — supports BOTH direct file upload AND URL paste.
 * Shows a preview thumbnail when an image is set.
 */
export function ImageUploadField({ label, value, onChange, testIdPrefix = "img" }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const auth = { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } };

  const handleFile = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be < 5 MB"); return; }
    const fd = new FormData();
    fd.append("file", file);
    setUploading(true);
    try {
      const r = await axios.post(`${API}/admin/upload`, fd, {
        headers: { ...auth.headers, "Content-Type": "multipart/form-data" },
      });
      onChange(r.data.url);
      toast.success("Image uploaded");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      {label && <Label className="text-[11px]">{label}</Label>}
      <div className="flex gap-2 items-start">
        {value && (
          <img src={_abs(value)} alt="preview" className="w-14 h-14 object-cover rounded border border-[#E5E3DB]"/>
        )}
        <div className="flex-1 space-y-2">
          <Input
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Paste image URL or upload below"
            data-testid={`${testIdPrefix}-url`}
          />
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleFile(e.target.files?.[0])}
              className="hidden"
              data-testid={`${testIdPrefix}-file`}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="rounded-full text-[11px] h-8"
              data-testid={`${testIdPrefix}-upload-btn`}
            >
              {uploading ? <Loader2 className="w-3 h-3 mr-1 animate-spin"/> : <Upload className="w-3 h-3 mr-1"/>}
              {uploading ? "Uploading…" : "Upload from device"}
            </Button>
            {value && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onChange("")}
                className="rounded-full text-[11px] h-8 text-red-600"
                data-testid={`${testIdPrefix}-clear-btn`}
              >
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StoreAdminPanel() {
  const [tab, setTab] = useState("settings");
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState({});
  const [products, setProducts] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [editProd, setEditProd] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [editCoupon, setEditCoupon] = useState(null);
  const [showNewCoupon, setShowNewCoupon] = useState(false);
  const auth = { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p, c] = await Promise.all([
        axios.get(`${API}/admin/store/settings`, auth),
        axios.get(`${API}/admin/store/products`, auth),
        axios.get(`${API}/admin/store/coupons`, auth).catch(() => ({ data: { coupons: [] } })),
      ]);
      setSettings(s.data.settings || {});
      setProducts(p.data.products || []);
      setCoupons(c.data.coupons || []);
    } catch { toast.error("Failed to load store data"); }
    finally { setLoading(false); }
  }, []); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  const saveSettings = async () => {
    try {
      await axios.put(`${API}/admin/store/settings`, settings, auth);
      toast.success("Settings saved"); load();
    } catch { toast.error("Save failed"); }
  };

  const saveProduct = async (p) => {
    try {
      if (p.id) await axios.put(`${API}/admin/store/products/${p.id}`, p, auth);
      else await axios.post(`${API}/admin/store/products`, p, auth);
      toast.success("Saved"); setEditProd(null); setShowNew(false); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
  };

  const deleteProduct = async (p) => {
    if (!window.confirm(`Delete ${p.name}?`)) return;
    try { await axios.delete(`${API}/admin/store/products/${p.id}`, auth); toast.success("Deleted"); load(); }
    catch { toast.error("Delete failed"); }
  };

  const saveCoupon = async (c) => {
    try {
      if (c.id) await axios.put(`${API}/admin/store/coupons/${c.id}`, c, auth);
      else await axios.post(`${API}/admin/store/coupons`, c, auth);
      toast.success("Coupon saved"); setEditCoupon(null); setShowNewCoupon(false); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
  };

  const deleteCoupon = async (c) => {
    if (!window.confirm(`Delete coupon ${c.code}?`)) return;
    try { await axios.delete(`${API}/admin/store/coupons/${c.id}`, auth); toast.success("Deleted"); load(); }
    catch { toast.error("Delete failed"); }
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E5E3DB] p-5" data-testid="store-admin-panel">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-heading text-lg font-medium text-[#2C3531] flex items-center gap-2">
            <Package className="w-5 h-5 text-[#A66E4E]"/> Store & Agent Website
          </h3>
          <p className="text-xs text-[#7B6D5A] mt-1">Manage anti-aging products, combos, Razorpay keys, coupons and storefront content.</p>
        </div>
      </div>

      <div className="flex gap-6 border-b border-[#E5E3DB] mb-5 text-xs uppercase tracking-wide overflow-x-auto">
        {[
          ["settings", "Settings & Payment"],
          ["products", `Products (${products.filter(p => !p.is_combo).length})`],
          ["combos", `Combos (${products.filter(p => p.is_combo).length})`],
          ["coupons", `Coupons (${coupons.length})`],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`pb-3 -mb-px border-b-2 whitespace-nowrap ${tab === k ? "border-[#3B5249] text-[#3B5249]" : "border-transparent text-[#7B6D5A]"}`} data-testid={`store-tab-${k}`}>{l}</button>
        ))}
      </div>

      {loading && <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-[#A66E4E]"/></div>}

      {!loading && tab === "settings" && (
        <div className="space-y-6 max-w-3xl">
          {/* Razorpay */}
          <div className="bg-[#FBF7F0] border border-[#E5E3DB] p-5 rounded">
            <h4 className="font-heading text-[14px] text-[#2C3531] mb-1 flex items-center gap-2"><CreditCard className="w-4 h-4"/> Razorpay Payment Gateway</h4>
            <p className="text-[11px] text-[#7B6D5A] mb-4">Get your keys from <a href="https://dashboard.razorpay.com/app/keys" target="_blank" rel="noreferrer" className="text-[#3B5249] underline">dashboard.razorpay.com</a></p>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px]">Razorpay Key ID</Label>
                <Input value={settings.razorpay_key_id || ""} onChange={e => setSettings({ ...settings, razorpay_key_id: e.target.value })} placeholder="rzp_live_xxxx or rzp_test_xxxx" data-testid="rzp-key-id"/>
              </div>
              <div>
                <Label className="text-[11px]">Razorpay Key Secret</Label>
                <Input type="password" value={settings.razorpay_key_secret || ""} onChange={e => setSettings({ ...settings, razorpay_key_secret: e.target.value })} placeholder={settings.razorpay_key_secret_masked ? `current: ${settings.razorpay_key_secret_masked}` : "Enter secret"} data-testid="rzp-key-secret"/>
              </div>
            </div>
            <div className="flex items-center gap-6 mt-4">
              <label className="flex items-center gap-2 text-[12px] text-[#2C3531]">
                <Switch checked={!!settings.razorpay_enabled} onCheckedChange={v => setSettings({ ...settings, razorpay_enabled: v })} data-testid="rzp-enabled"/>
                Razorpay Enabled
              </label>
              <label className="flex items-center gap-2 text-[12px] text-[#2C3531]">
                <Switch checked={settings.cod_enabled !== false} onCheckedChange={v => setSettings({ ...settings, cod_enabled: v })} data-testid="cod-enabled"/>
                Cash on Delivery
              </label>
            </div>
          </div>

          {/* Hero & banners */}
          <div className="bg-[#FBF7F0] border border-[#E5E3DB] p-5 rounded space-y-3">
            <h4 className="font-heading text-[14px] text-[#2C3531] mb-1">Homepage Content</h4>
            <div><Label className="text-[11px]">Announcement Bar (top of page)</Label><Input value={settings.announcement_bar || ""} onChange={e => setSettings({ ...settings, announcement_bar: e.target.value })}/></div>
            <div className="grid md:grid-cols-2 gap-3">
              <div><Label className="text-[11px]">Hero Title (plain)</Label><Input value={settings.hero_title || ""} onChange={e => setSettings({ ...settings, hero_title: e.target.value })} placeholder="Visible firming"/></div>
              <div><Label className="text-[11px]">Hero Title Accent (italic green)</Label><Input value={settings.hero_title_accent || ""} onChange={e => setSettings({ ...settings, hero_title_accent: e.target.value })} placeholder="&amp; youthful glow."/></div>
            </div>
            <div><Label className="text-[11px]">Hero Subtitle</Label><Textarea rows={2} value={settings.hero_subtitle || ""} onChange={e => setSettings({ ...settings, hero_subtitle: e.target.value })}/></div>
            <div><Label className="text-[11px]">Offer Banner (mid-page)</Label><Input value={settings.offer_banner || ""} onChange={e => setSettings({ ...settings, offer_banner: e.target.value })}/></div>
            <div><Label className="text-[11px]">Founder Note (footer)</Label><Textarea rows={2} value={settings.founder_note || ""} onChange={e => setSettings({ ...settings, founder_note: e.target.value })}/></div>
            <div>
              <Label className="text-[11px]">Public Storefront Domain</Label>
              <Input value={settings.public_base_url || ""} onChange={e => setSettings({ ...settings, public_base_url: e.target.value })} placeholder="https://celestaglow.com" data-testid="public-base-url"/>
              <div className="text-[10px] text-[#7B6D5A] mt-1">All agent store URLs will use this domain (e.g. https://celestaglow.com/store/agent-slug). Default: https://celestaglow.com</div>
            </div>
            <div className="md:col-span-2">
              <Label className="text-[11px]">Bottom Banner Image (above &quot;Real Results&quot;)</Label>
              <ImageUploadField
                value={settings.bottom_banner_image || ""}
                onChange={(v) => setSettings({ ...settings, bottom_banner_image: v })}
                testIdPrefix="bottom-banner"
              />
              <Input
                value={settings.bottom_banner_caption || ""}
                onChange={e => setSettings({ ...settings, bottom_banner_caption: e.target.value })}
                placeholder="Optional caption — e.g. ‘Trusted by 50,000+ Indians’"
                className="mt-2"
                data-testid="bottom-banner-caption"
              />
              <div className="text-[10px] text-[#7B6D5A] mt-1">Shows on the storefront home, just above the &quot;Real Results&quot; testimonials. Caption is overlaid at the bottom of the image.</div>
            </div>
          </div>

          {/* Home carousel images (auto-rotating) */}
          <div className="bg-[#FBF7F0] border border-[#E5E3DB] p-5 rounded space-y-3" data-testid="carousel-mgr">
            <h4 className="font-heading text-[14px] text-[#2C3531] mb-1">Homepage Carousel Images</h4>
            <p className="text-[11px] text-[#7B6D5A]">Auto-rotating banner on the storefront home. Your uploaded images show first; the Hero Image (above) shows last as the brand image. Side arrows disabled — images rotate automatically.</p>
            <div className="space-y-2">
              {((settings.home_carousel_images) || []).map((url, i) => (
                <div key={i} className="flex gap-2 items-center" data-testid={`carousel-row-${i}`}>
                  <span className="text-[10px] text-[#7B6D5A] w-6">#{i + 1}</span>
                  <div className="flex-1">
                    <ImageUploadField
                      value={url}
                      onChange={(v) => {
                        const arr = [...(settings.home_carousel_images || [])];
                        arr[i] = v;
                        setSettings({ ...settings, home_carousel_images: arr });
                      }}
                      testIdPrefix={`carousel-img-${i}`}
                    />
                  </div>
                  <Button
                    type="button" size="sm" variant="ghost"
                    onClick={() => {
                      const arr = [...(settings.home_carousel_images || [])];
                      arr.splice(i, 1);
                      setSettings({ ...settings, home_carousel_images: arr });
                    }}
                    className="text-red-600 h-8"
                    data-testid={`carousel-del-${i}`}
                  ><Trash2 className="w-3 h-3"/></Button>
                </div>
              ))}
              <Button
                type="button" size="sm" variant="outline"
                onClick={() => setSettings({ ...settings, home_carousel_images: [...(settings.home_carousel_images || []), ""] })}
                className="rounded-full text-[11px] h-8"
                data-testid="carousel-add-btn"
              ><Plus className="w-3 h-3 mr-1"/>Add Image</Button>
            </div>
          </div>

          {/* Promo Banners — horizontal-scroll banner carousel between trust strip and featured combo */}
          <div className="bg-[#FBF7F0] border border-[#E5E3DB] p-5 rounded space-y-3" data-testid="banners-mgr">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-heading text-[14px] text-[#2C3531] mb-1">Promo Banners (position 4 — between trust strip &amp; featured combo)</h4>
                <p className="text-[11px] text-[#7B6D5A]">Upload up to 10 banner images. Banners scroll sideways on the storefront home. The section is automatically hidden if no banners are uploaded, or if you switch it OFF below.</p>
              </div>
              <label className="flex items-center gap-2 text-[12px] shrink-0 ml-3">
                <Switch
                  checked={settings.banners_enabled !== false}
                  onCheckedChange={v => setSettings({ ...settings, banners_enabled: v })}
                  data-testid="banners-enabled-toggle"
                />
                <span className="text-[#3B5249] font-medium">Show banners</span>
              </label>
            </div>
            <div className="space-y-2">
              {((settings.banners) || []).map((b, i) => {
                const cur = typeof b === "string" ? { image: b, link: "" } : (b || { image: "", link: "" });
                return (
                  <div key={i} className="flex flex-col sm:flex-row gap-2 border border-[#E5E3DB] rounded p-3 bg-white" data-testid={`banner-row-${i}`}>
                    <div className="flex-1">
                      <ImageUploadField
                        value={cur.image || ""}
                        onChange={(v) => {
                          const arr = [...(settings.banners || [])];
                          arr[i] = { ...cur, image: v };
                          setSettings({ ...settings, banners: arr });
                        }}
                        testIdPrefix={`banner-${i}`}
                      />
                      <Input
                        value={cur.link || ""}
                        onChange={e => {
                          const arr = [...(settings.banners || [])];
                          arr[i] = { ...cur, link: e.target.value };
                          setSettings({ ...settings, banners: arr });
                        }}
                        placeholder="/products?tab=combos (optional click-through)"
                        className="mt-2 text-[12px]"
                        data-testid={`banner-link-${i}`}
                      />
                    </div>
                    <Button
                      type="button" size="sm" variant="outline"
                      onClick={() => {
                        const arr = [...(settings.banners || [])];
                        arr.splice(i, 1);
                        setSettings({ ...settings, banners: arr });
                      }}
                      className="rounded-full text-[11px] h-8 text-red-600 border-red-300 sm:w-24 self-start"
                      data-testid={`banner-del-${i}`}
                    ><Trash2 className="w-3 h-3 mr-1"/>Remove</Button>
                  </div>
                );
              })}
              <Button
                type="button" size="sm" variant="outline"
                onClick={() => setSettings({ ...settings, banners: [...(settings.banners || []), { image: "", link: "" }] })}
                disabled={(settings.banners || []).length >= 10}
                className="rounded-full text-[11px] h-8"
                data-testid="banner-add-btn"
              ><Plus className="w-3 h-3 mr-1"/>Add Banner</Button>
            </div>
          </div>

          {/* Home FAQs */}
          <div className="bg-[#FBF7F0] border border-[#E5E3DB] p-5 rounded space-y-3" data-testid="faq-mgr">
            <h4 className="font-heading text-[14px] text-[#2C3531] mb-1">Homepage FAQs</h4>
            <p className="text-[11px] text-[#7B6D5A]">Add common questions + answers shown on the storefront home. Leave empty to use defaults.</p>
            <div className="space-y-3">
              {((settings.home_faqs) || []).map((fq, i) => (
                <div key={i} className="space-y-1.5 border border-[#E5E3DB] rounded p-3 bg-white" data-testid={`faq-row-${i}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[#7B6D5A]">FAQ #{i + 1}</span>
                    <Button type="button" size="sm" variant="ghost" onClick={() => {
                      const arr = [...(settings.home_faqs || [])];
                      arr.splice(i, 1);
                      setSettings({ ...settings, home_faqs: arr });
                    }} className="text-red-600 h-7 text-[10px]" data-testid={`faq-del-${i}`}><Trash2 className="w-3 h-3"/></Button>
                  </div>
                  <Input
                    placeholder="Question"
                    value={fq.q || ""}
                    onChange={e => {
                      const arr = [...(settings.home_faqs || [])];
                      arr[i] = { ...arr[i], q: e.target.value };
                      setSettings({ ...settings, home_faqs: arr });
                    }}
                    data-testid={`faq-q-${i}`}
                  />
                  <Textarea
                    rows={2}
                    placeholder="Answer"
                    value={fq.a || ""}
                    onChange={e => {
                      const arr = [...(settings.home_faqs || [])];
                      arr[i] = { ...arr[i], a: e.target.value };
                      setSettings({ ...settings, home_faqs: arr });
                    }}
                    data-testid={`faq-a-${i}`}
                  />
                </div>
              ))}
              <Button type="button" size="sm" variant="outline" onClick={() => setSettings({ ...settings, home_faqs: [...(settings.home_faqs || []), { q: "", a: "" }] })} className="rounded-full text-[11px] h-8" data-testid="faq-add-btn"><Plus className="w-3 h-3 mr-1"/>Add FAQ</Button>
            </div>
          </div>

          <Button onClick={saveSettings} className="bg-[#3B5249] text-white rounded-full" data-testid="save-settings"><Save className="w-4 h-4 mr-1"/>Save All Settings</Button>
        </div>
      )}

      {!loading && (tab === "products" || tab === "combos") && (
        <>
          <div className="flex justify-between mb-3">
            <div className="text-[12px] text-[#7B6D5A]">{tab === "combos" ? "Bundle multiple products with discounted pricing." : "Edit, add, remove products. Changes reflect on every agent's storefront."}</div>
            <Button size="sm" onClick={() => setShowNew(true)} className="rounded-full bg-[#3B5249] text-white" data-testid="add-product-btn"><Plus className="w-4 h-4 mr-1"/>Add {tab === "combos" ? "Combo" : "Product"}</Button>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {products.filter(p => tab === "combos" ? p.is_combo : !p.is_combo).map(p => (
              <div key={p.id} className="bg-[#FBF7F0] border border-[#E5E3DB] rounded-lg p-3 flex gap-3" data-testid={`admin-product-${p.slug}`}>
                {p.image ? <img src={_abs(p.image)} alt={p.name} className="w-20 h-20 object-cover rounded"/> : <div className="w-20 h-20 bg-[#E5E3DB] flex items-center justify-center rounded"><ImageIcon className="w-6 h-6 text-[#7B6D5A]"/></div>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-heading text-[#2C3531] text-sm truncate">{p.name}</div>
                      <div className="text-[10px] text-[#7B6D5A]">{p.tagline}</div>
                    </div>
                    {p.active ? <Badge className="bg-emerald-100 text-emerald-800 text-[9px]">Live</Badge> : <Badge className="bg-gray-100 text-gray-700 text-[9px]">Hidden</Badge>}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="font-medium text-[13px] text-[#2C3531]">₹{p.price}</span>
                    {p.mrp > p.price && <span className="text-[11px] text-[#7B6D5A] line-through">₹{p.mrp}</span>}
                    <span className="text-[10px] text-[#7B6D5A]">• Stock: {p.stock}</span>
                    <span className="text-[10px] text-[#7B6D5A]">• Sort: <b>{p.sort_order ?? 999}</b></span>
                  </div>
                  <div className="flex gap-1 mt-2">
                    <Button size="sm" variant="outline" onClick={() => setEditProd({ ...p })} className="h-7 text-[10px] rounded-full" data-testid={`edit-${p.slug}`}><Pencil className="w-3 h-3 mr-1"/>Edit</Button>
                    <Button size="sm" variant="outline" onClick={() => deleteProduct(p)} className="h-7 text-[10px] rounded-full text-red-600 border-red-300" data-testid={`delete-${p.slug}`}><Trash2 className="w-3 h-3"/></Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && tab === "coupons" && (
        <>
          <div className="flex justify-between mb-3">
            <div className="text-[12px] text-[#7B6D5A]">Create promo codes — flat ₹, percent off, with min cart value, max cap & usage limit.</div>
            <Button size="sm" onClick={() => setShowNewCoupon(true)} className="rounded-full bg-[#3B5249] text-white" data-testid="add-coupon-btn"><Plus className="w-4 h-4 mr-1"/>Add Coupon</Button>
          </div>
          {coupons.length === 0 && <div className="text-center text-[#7B6D5A] text-[12px] py-10">No coupons yet. Click <strong>Add Coupon</strong> to create your first one.</div>}
          <div className="grid md:grid-cols-2 gap-3">
            {coupons.map(c => (
              <div key={c.id} className="bg-[#FBF7F0] border border-[#E5E3DB] rounded-lg p-3" data-testid={`admin-coupon-${c.code}`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-[#A66E4E]"/>
                    <span className="font-mono font-bold text-[14px] text-[#2C3531]">{c.code}</span>
                  </div>
                  {c.active ? <Badge className="bg-emerald-100 text-emerald-800 text-[9px]">Active</Badge> : <Badge className="bg-gray-100 text-gray-700 text-[9px]">Off</Badge>}
                </div>
                <div className="text-[11px] text-[#7B6D5A] mb-1.5">{c.description || "—"}</div>
                <div className="text-[12px] text-[#2C3531]">
                  {c.discount_type === "percent" ? `${c.discount_value}% OFF` : `₹${c.discount_value} OFF`}
                  {c.min_cart_value > 0 && <span className="text-[10px] text-[#7B6D5A] ml-1">• min ₹{c.min_cart_value}</span>}
                  {c.discount_type === "percent" && c.max_discount > 0 && <span className="text-[10px] text-[#7B6D5A] ml-1">• max ₹{c.max_discount}</span>}
                </div>
                <div className="text-[10px] text-[#7B6D5A] mt-1">
                  Used: {c.used_count || 0}{c.usage_limit ? ` / ${c.usage_limit}` : " (unlimited)"}
                  {c.valid_to && <span> • Expires {c.valid_to}</span>}
                </div>
                <div className="flex gap-1 mt-2">
                  <Button size="sm" variant="outline" onClick={() => setEditCoupon({ ...c })} className="h-7 text-[10px] rounded-full" data-testid={`edit-coupon-${c.code}`}><Pencil className="w-3 h-3 mr-1"/>Edit</Button>
                  <Button size="sm" variant="outline" onClick={() => deleteCoupon(c)} className="h-7 text-[10px] rounded-full text-red-600 border-red-300" data-testid={`delete-coupon-${c.code}`}><Trash2 className="w-3 h-3"/></Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Product edit / create */}
      <ProductEditDialog open={!!editProd || showNew} onClose={() => { setEditProd(null); setShowNew(false); }}
        initial={editProd || { name: "", tagline: "", short_desc: "", long_desc: "", price: 0, mrp: 0, image: "", card_image: "", home_image: "", stock: 100, active: true, is_combo: tab === "combos", ingredients: [], benefits: [], how_to_use: "", badges: [], size: "", sort_order: 999 }}
        products={products}
        onSave={saveProduct}/>

      {/* Coupon edit / create */}
      <CouponEditDialog open={!!editCoupon || showNewCoupon} onClose={() => { setEditCoupon(null); setShowNewCoupon(false); }}
        initial={editCoupon || { code: "", description: "", discount_type: "flat", discount_value: 50, min_cart_value: 0, max_discount: 0, usage_limit: 0, valid_from: "", valid_to: "", active: true }}
        onSave={saveCoupon}/>
    </div>
  );
}

function ProductEditDialog({ open, onClose, initial, onSave, products }) {
  const [p, setP] = useState(initial);
  useEffect(() => { setP(initial); }, [initial]);
  const setF = (k, v) => setP(prev => ({ ...prev, [k]: v }));
  const setList = (k, str) => setP(prev => ({ ...prev, [k]: str.split("\n").map(s => s.trim()).filter(Boolean) }));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{p.id ? "Edit" : "New"} {p.is_combo ? "Combo" : "Product"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-[11px]">Name *</Label><Input value={p.name} onChange={e => setF("name", e.target.value)} data-testid="prod-name"/></div>
            <div><Label className="text-[11px]">Tagline</Label><Input value={p.tagline} onChange={e => setF("tagline", e.target.value)}/></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label className="text-[11px]">Price (₹) *</Label><Input type="number" value={p.price} onChange={e => setF("price", Number(e.target.value))} data-testid="prod-price"/></div>
            <div><Label className="text-[11px]">MRP (₹)</Label><Input type="number" value={p.mrp} onChange={e => setF("mrp", Number(e.target.value))}/></div>
            <div><Label className="text-[11px]">Stock</Label><Input type="number" value={p.stock} onChange={e => setF("stock", Number(e.target.value))}/></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-[11px]">Size</Label><Input value={p.size} onChange={e => setF("size", e.target.value)} placeholder="30 ml"/></div>
            <div>
              <Label className="text-[11px]">Sort Order <span className="text-[#7B6D5A]">(lower = shown first)</span></Label>
              <Input type="number" value={p.sort_order ?? 999} onChange={e => setF("sort_order", Number(e.target.value))} data-testid="prod-sort-order" placeholder="10, 20, 30..."/>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-[12px]"><Switch checked={!!p.active} onCheckedChange={v => setF("active", v)}/>Active</label>
            <label className="flex items-center gap-2 text-[12px]"><Switch checked={!!p.is_combo} onCheckedChange={v => setF("is_combo", v)}/>Combo</label>
          </div>
          <ImageUploadField label="Primary Image * (used on product detail page)" value={p.image} onChange={(v) => setF("image", v)} testIdPrefix="prod-image"/>
          <ImageUploadField label="Home Card Image (small card on storefront home + sub-combo card — defaults to Primary if blank)" value={p.card_image || ""} onChange={(v) => setF("card_image", v)} testIdPrefix="prod-card-image"/>
          {!!p.is_combo && (
            <ImageUploadField label="Combo Home Image (large featured combo on homepage — defaults to Card / Primary if blank)" value={p.home_image || ""} onChange={(v) => setF("home_image", v)} testIdPrefix="prod-home-image"/>
          )}
          <div className="border-t border-[#E5E3DB] pt-3">
            <Label className="text-[11px] mb-2 block">Gallery Images (up to 5 additional)</Label>
            <MultiImageUploader
              value={p.gallery || []}
              max={5}
              onChange={(urls) => setF("gallery", urls)}
            />
            <p className="text-[10px] text-[#7B6D5A] mt-1">Storefront shows these as a swipe-able gallery next to the primary image.</p>
          </div>
          <div><Label className="text-[11px]">Short Description</Label><Textarea rows={2} value={p.short_desc} onChange={e => setF("short_desc", e.target.value)}/></div>
          <div><Label className="text-[11px]">Long Description</Label><Textarea rows={3} value={p.long_desc} onChange={e => setF("long_desc", e.target.value)}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px]">Ingredients (one per line)</Label>
              <Textarea rows={4} defaultValue={(p.ingredients || []).join("\n")} onChange={e => setList("ingredients", e.target.value)}/>
            </div>
            <div>
              <Label className="text-[11px]">Benefits (one per line)</Label>
              <Textarea rows={4} defaultValue={(p.benefits || []).join("\n")} onChange={e => setList("benefits", e.target.value)}/>
            </div>
          </div>
          <div><Label className="text-[11px]">How to Use</Label><Textarea rows={2} value={p.how_to_use} onChange={e => setF("how_to_use", e.target.value)}/></div>
          <div><Label className="text-[11px]">Badges (comma-separated, e.g. "Bestseller, Vegan")</Label><Input defaultValue={(p.badges || []).join(", ")} onChange={e => setP({ ...p, badges: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}/></div>
          {p.is_combo && (
            <div>
              <Label className="text-[11px]">Combo includes (pick existing products)</Label>
              <div className="border border-[#E5E3DB] rounded p-2 max-h-44 overflow-y-auto bg-[#FBF7F0] space-y-1" data-testid="combo-picker">
                {products.filter(x => !x.is_combo).length === 0 && (
                  <p className="text-[10px] text-[#7B6D5A] py-3 text-center">No simple products in store yet. Add products first to combine them.</p>
                )}
                {products.filter(x => !x.is_combo).map(prod => {
                  const checked = (p.combo_items || []).includes(prod.id);
                  return (
                    <label key={prod.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white cursor-pointer text-[12px]" data-testid={`combo-pick-${prod.id}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const set = new Set(p.combo_items || []);
                          if (checked) set.delete(prod.id); else set.add(prod.id);
                          setP({ ...p, combo_items: Array.from(set) });
                        }}
                        className="w-3.5 h-3.5 accent-[#3B5249]"
                      />
                      {prod.image ? <img src={prod.image} alt="" className="w-7 h-7 rounded object-cover border border-[#E5E3DB]"/> : <div className="w-7 h-7 rounded bg-[#E5E3DB]"/>}
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-[#2C3531]">{prod.name}</div>
                        <div className="text-[9px] text-[#7B6D5A] font-mono truncate">{prod.id} · ₹{prod.price}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
              <div className="text-[10px] text-[#7B6D5A] mt-1">Stock for each selected product is auto-deducted when a combo is ordered. Name, image, price &amp; description above override the combo&apos;s display.</div>
              {(p.combo_items || []).length > 0 && (
                <div className="text-[10px] text-[#3B5249] mt-1 font-medium">{(p.combo_items || []).length} item(s) selected</div>
              )}
            </div>
          )}
          <Button onClick={() => onSave(p)} className="w-full bg-[#3B5249] text-white rounded-full mt-2" data-testid="prod-save"><Save className="w-4 h-4 mr-1"/>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CouponEditDialog({ open, onClose, initial, onSave }) {
  const [c, setC] = useState(initial);
  useEffect(() => { setC(initial); }, [initial]);
  const setF = (k, v) => setC(prev => ({ ...prev, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{c.id ? "Edit Coupon" : "New Coupon"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-[11px]">Coupon Code *</Label>
            <Input value={c.code} onChange={e => setF("code", e.target.value.toUpperCase())} placeholder="e.g. WELCOME50" disabled={!!c.id} data-testid="coupon-code"/>
            <div className="text-[10px] text-[#7B6D5A] mt-1">Customers enter this at checkout. Auto-uppercased.</div>
          </div>
          <div>
            <Label className="text-[11px]">Description (internal)</Label>
            <Input value={c.description || ""} onChange={e => setF("description", e.target.value)} placeholder="e.g. Launch offer for new customers"/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px]">Discount Type *</Label>
              <select className="w-full h-10 rounded-md border border-[#E5E3DB] bg-white px-3 text-[12px]" value={c.discount_type} onChange={e => setF("discount_type", e.target.value)} data-testid="coupon-type">
                <option value="flat">Flat ₹ off</option>
                <option value="percent">Percentage off</option>
              </select>
            </div>
            <div>
              <Label className="text-[11px]">Discount Value *</Label>
              <Input type="number" value={c.discount_value} onChange={e => setF("discount_value", Number(e.target.value))} placeholder={c.discount_type === "percent" ? "10 (for 10%)" : "50 (for ₹50)"} data-testid="coupon-value"/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px]">Min Cart Value (₹)</Label>
              <Input type="number" value={c.min_cart_value || 0} onChange={e => setF("min_cart_value", Number(e.target.value))} placeholder="0 = no minimum" data-testid="coupon-min"/>
            </div>
            <div>
              <Label className="text-[11px]">Max Discount Cap (₹)</Label>
              <Input type="number" value={c.max_discount || 0} onChange={e => setF("max_discount", Number(e.target.value))} placeholder="0 = no cap (for % only)" disabled={c.discount_type !== "percent"} data-testid="coupon-max"/>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-[11px]">Usage Limit</Label>
              <Input type="number" value={c.usage_limit || 0} onChange={e => setF("usage_limit", Number(e.target.value))} placeholder="0 = unlimited" data-testid="coupon-limit"/>
            </div>
            <div>
              <Label className="text-[11px]">Valid From</Label>
              <Input type="date" value={c.valid_from || ""} onChange={e => setF("valid_from", e.target.value)}/>
            </div>
            <div>
              <Label className="text-[11px]">Valid To</Label>
              <Input type="date" value={c.valid_to || ""} onChange={e => setF("valid_to", e.target.value)}/>
            </div>
          </div>
          <label className="flex items-center gap-2 text-[12px]"><Switch checked={!!c.active} onCheckedChange={v => setF("active", v)} data-testid="coupon-active"/>Active</label>
          {c.id && <div className="text-[10px] text-[#7B6D5A]">Used so far: <strong>{c.used_count || 0}</strong>{c.usage_limit ? ` of ${c.usage_limit}` : ""}</div>}
          <Button onClick={() => onSave(c)} className="w-full bg-[#3B5249] text-white rounded-full mt-2" data-testid="coupon-save"><Save className="w-4 h-4 mr-1"/>Save Coupon</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
