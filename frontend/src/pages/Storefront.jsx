// Storefront — mobile-first anti-aging e-commerce experience (matching prelaunch.celestaglow.com).
// Bottom nav, hamburger drawer, white+mint palette, urgency badges, promo codes, WhatsApp float.
//
// Routes under /store/:slug :
//   index            -> Home
//   /products        -> All Products / Combos switcher
//   /product/:pslug  -> Product detail (with reviews, promo code, urgency strip)
//   /cart            -> Cart
//   /checkout        -> Checkout (COD + Razorpay)
//   /thank-you/:oid  -> Thank you
//   /track           -> Track Order (public)
//   /agent-login     -> Agent login
//   /agent-portal    -> Agent dashboard (orders, customers, commission, withdraw, profile)

import { useEffect, useState, useMemo, useCallback, createContext, useContext } from "react";
import { useParams, useNavigate, Link, Routes, Route, useLocation, Navigate, NavLink } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ShoppingBag, Plus, Minus, X, Star, ShieldCheck, Truck, Leaf, Headphones,
  ChevronRight, Heart, Search, User, LogOut, Calendar, IndianRupee,
  PackageCheck, RefreshCw, Phone, Mail, MapPin, Users, TrendingUp, ArrowRight,
  Check, Menu, Home as HomeIcon, Grid3x3, Sparkles, ShoppingCart, Share2,
  MessageCircle, Wallet, Clock, Eye, Zap, ChevronLeft, Package, AlertCircle
} from "lucide-react";

const API = "/api";

// =================== CART CONTEXT (localStorage per agent slug) ===================
const CartCtx = createContext(null);
function useCart() { return useContext(CartCtx); }
function CartProvider({ slug, children }) {
  const key = `celesta-cart-${slug}`;
  const couponKey = `celesta-coupon-${slug}`;
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; }
  });
  const [coupon, setCoupon] = useState(() => {
    try { return JSON.parse(localStorage.getItem(couponKey) || "null"); } catch { return null; }
  });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(items)); }, [items, key]);
  useEffect(() => {
    if (coupon) localStorage.setItem(couponKey, JSON.stringify(coupon));
    else localStorage.removeItem(couponKey);
  }, [coupon, couponKey]);
  const add = useCallback((p, qty = 1) => {
    setItems(prev => {
      const i = prev.findIndex(x => x.id === p.id);
      if (i >= 0) {
        const next = [...prev]; next[i] = { ...next[i], qty: next[i].qty + qty }; return next;
      }
      return [...prev, { id: p.id, slug: p.slug, name: p.name, price: p.price, image: p.image, is_combo: p.is_combo, qty }];
    });
    toast.success(`${p.name} added`, { duration: 1500 });
  }, []);
  const remove = useCallback((id) => setItems(p => p.filter(x => x.id !== id)), []);
  const setQty = useCallback((id, qty) => setItems(p => p.map(x => x.id === id ? { ...x, qty: Math.max(1, qty) } : x)), []);
  const clear = useCallback(() => { setItems([]); setCoupon(null); }, []);
  const total = useMemo(() => items.reduce((s, x) => s + x.price * x.qty, 0), [items]);
  const count = useMemo(() => items.reduce((s, x) => s + x.qty, 0), [items]);
  return <CartCtx.Provider value={{ items, add, remove, setQty, clear, total, count, coupon, setCoupon }}>{children}</CartCtx.Provider>;
}

// =================== HEADER (mobile-first, hamburger + logo + search + cart) ===================
function StoreHeader({ slug, onMenuOpen }) {
  const cart = useCart();
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-[#F0F0F0]">
      <div className="max-w-2xl mx-auto px-4 h-14 grid grid-cols-3 items-center">
        <div className="flex justify-start">
          <button onClick={onMenuOpen} className="p-2 -ml-2" data-testid="store-menu-btn" aria-label="Menu">
            <Menu className="w-6 h-6 text-[#1F2937]"/>
          </button>
        </div>
        <Link to={`/store/${slug}`} className="flex flex-col items-center" data-testid="store-logo-link">
          <span className="font-serif text-[18px] text-[#1F2937] leading-none tracking-[0.04em]">CELESTA</span>
          <span className="text-[8px] tracking-[0.5em] text-[#6B7280] mt-0.5">G L O W</span>
        </Link>
        <div className="flex items-center gap-0 justify-end">
          <Link to={`/store/${slug}/products`} className="p-2" data-testid="store-search-btn" aria-label="Search">
            <Search className="w-5 h-5 text-[#1F2937]"/>
          </Link>
          <Link to={`/store/${slug}/cart`} className="relative p-2 -mr-2" data-testid="cart-icon-btn" aria-label="Cart">
            <ShoppingBag className="w-5 h-5 text-[#1F2937]"/>
            {cart.count > 0 && (
              <span className="absolute top-0 right-0 bg-[#16A34A] text-white text-[10px] rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1" data-testid="cart-count">
                {cart.count}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}

// =================== HAMBURGER DRAWER ===================
function MenuDrawer({ open, onClose, slug }) {
  const navigate = useNavigate();
  const goto = (path) => { onClose(); navigate(path); };
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" data-testid="menu-drawer">
      <div className="absolute inset-0 bg-black/40" onClick={onClose}/>
      <div className="absolute left-0 top-0 bottom-0 w-[82%] max-w-sm bg-white flex flex-col">
        <div className="px-5 py-5 border-b border-[#F0F0F0] flex items-center justify-between">
          <div>
            <div className="font-serif text-[20px] text-[#1F2937] tracking-[0.04em]">CELESTA</div>
            <div className="text-[9px] tracking-[0.4em] text-[#6B7280]">G L O W</div>
          </div>
          <button onClick={onClose} className="p-1" data-testid="menu-close-btn"><X className="w-5 h-5 text-[#6B7280]"/></button>
        </div>
        <nav className="flex-1 py-4">
          <DrawerItem icon={<HomeIcon className="w-5 h-5"/>} label="Home" onClick={() => goto(`/store/${slug}`)} data-testid="menu-home"/>
          <DrawerItem icon={<Grid3x3 className="w-5 h-5"/>} label="Shop" onClick={() => goto(`/store/${slug}/products`)} data-testid="menu-shop"/>
          <DrawerItem icon={<Sparkles className="w-5 h-5"/>} label="Combos" onClick={() => goto(`/store/${slug}/products?tab=combos`)} data-testid="menu-combos"/>
          <div className="h-px bg-[#F0F0F0] my-2 mx-5"/>
          <DrawerItem icon={<Package className="w-5 h-5"/>} label="Track Order" onClick={() => goto(`/store/${slug}/track`)} data-testid="menu-track"/>
          <DrawerItem icon={<User className="w-5 h-5"/>} label="Agent Login" onClick={() => goto(`/store/${slug}/agent-login`)} data-testid="menu-agent-login"/>
          <div className="h-px bg-[#F0F0F0] my-2 mx-5"/>
          <DrawerItem icon={<MessageCircle className="w-5 h-5"/>} label="WhatsApp Us" onClick={() => window.open("https://wa.me/919446125745", "_blank")} data-testid="menu-whatsapp"/>
          <DrawerItem icon={<ShieldCheck className="w-5 h-5"/>} label="Shipping & Returns" onClick={() => {}}/>
          <DrawerItem icon={<Mail className="w-5 h-5"/>} label="Contact Us" onClick={() => {}}/>
        </nav>
        <div className="px-5 py-4 border-t border-[#F0F0F0] text-[11px] text-[#9CA3AF]">
          © 2026 Celesta Glow • Made in India
        </div>
      </div>
    </div>
  );
}
function DrawerItem({ icon, label, onClick, "data-testid": testId }) {
  return (
    <button onClick={onClick} data-testid={testId} className="w-full px-5 py-3 flex items-center gap-3 text-[14px] text-[#1F2937] hover:bg-[#F9FAFB] transition">
      <span className="text-[#16A34A]">{icon}</span>{label}
    </button>
  );
}

// =================== BOTTOM NAVIGATION (3 items only) ===================
function BottomNav({ slug }) {
  const items = [
    { to: `/store/${slug}`, icon: HomeIcon, label: "Home", end: true, test: "bottom-nav-home" },
    { to: `/store/${slug}/products`, icon: Grid3x3, label: "Categories", test: "bottom-nav-categories" },
    { to: `/store/${slug}/cart`, icon: ShoppingCart, label: "Cart", test: "bottom-nav-cart" },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-[#F0F0F0] pb-safe">
      <div className="max-w-2xl mx-auto flex items-center justify-around h-16">
        {items.map(it => (
          <NavLink key={it.label} to={it.to} end={it.end} data-testid={it.test}
            className={({ isActive }) => `relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full ${isActive ? "text-[#16A34A]" : "text-[#9CA3AF]"}`}>
            {({ isActive }) => (<>
              <it.icon className={`w-[22px] h-[22px] ${isActive ? "stroke-[2.5]" : ""}`}/>
              <span className="text-[11px]">{it.label}</span>
              {isActive && <div className="absolute top-0 w-8 h-0.5 bg-[#16A34A] rounded-full"/>}
            </>)}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

// =================== WHATSAPP FLOAT ===================
function WhatsAppFloat() {
  return (
    <a href="https://wa.me/919446125745" target="_blank" rel="noreferrer"
       className="fixed bottom-20 right-4 z-20 w-12 h-12 rounded-full bg-[#25D366] text-white flex items-center justify-center shadow-lg hover:scale-110 transition"
       data-testid="whatsapp-float">
      <MessageCircle className="w-6 h-6 fill-white"/>
    </a>
  );
}

// =================== HOME ===================
function StoreHome({ slug, meta, products }) {
  const navigate = useNavigate();
  const cart = useCart();
  // Show ALL non-combo products on the home page (sorted by backend's sort_order field)
  const bestSellers = products.filter(p => !p.is_combo);
  const combos = products.filter(p => p.is_combo);
  // Featured combo: prefer the Complete Anti-Aging Kit, else first combo
  const featuredCombo = combos.find(c => /anti-aging|complete/i.test(c.name)) || combos[0];
  return (
    <div className="bg-white" data-testid="store-home">
      {/* Search Bar */}
      <div className="max-w-2xl mx-auto px-4 pt-4">
        <button onClick={() => navigate(`/store/${slug}/products`)} className="w-full flex items-center gap-3 bg-white border border-[#E5E7EB] rounded-full px-5 py-3 text-left text-[13px] text-[#9CA3AF]" data-testid="hero-search-bar">
          <Search className="w-4 h-4"/> Search anti-aging products, ingredients…
        </button>
      </div>

      {/* HERO CARD */}
      <section className="max-w-2xl mx-auto px-4 pt-4">
        <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#F0F9F4] to-white border border-[#E5F0E8]">
          <div className="relative z-10 p-6">
            <div className="inline-flex items-center gap-1.5 bg-[#DCFCE7] text-[#15803D] text-[10px] tracking-[0.18em] uppercase px-3 py-1 rounded-full mb-4" data-testid="hero-eyebrow">
              <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]"/> Anti-Aging
            </div>
            <h1 className="font-serif text-[28px] leading-[1.15] text-[#1F2937] mb-1">{meta?.settings?.hero_title || "Visible firming"}</h1>
            <h1 className="font-serif italic text-[28px] leading-[1.15] text-[#16A34A] mb-3">{meta?.settings?.hero_title_accent || "& youthful glow."}</h1>
            <p className="text-[13px] text-[#6B7280] leading-relaxed mb-5">{meta?.settings?.hero_subtitle || "Clinical-grade Retinol, Vitamin C and Peptides — formulated for Indian skin to reduce fine lines and brighten in 4 weeks."}</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => navigate(`/store/${slug}/products`)} className="bg-[#15803D] hover:bg-[#166534] text-white rounded-full px-5 h-11 text-[13px]" data-testid="hero-cta">
                Shop the routine <ArrowRight className="w-4 h-4 ml-1"/>
              </Button>
              <Button variant="outline" onClick={() => navigate(`/store/${slug}/products?tab=combos`)} className="bg-white border-[#E5E7EB] rounded-full px-5 h-11 text-[13px] text-[#15803D]" data-testid="hero-combos-cta">
                <Sparkles className="w-4 h-4 mr-1"/>Shop Combos
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* (Banner carousel moved to between trust strip and featured combo — admin-controlled, disabled by default until banners uploaded) */}

      {/* TRUST STRIP */}
      <section className="max-w-2xl mx-auto px-4 pt-5">
        <div className="bg-white border border-[#E5E7EB] rounded-[20px] p-5">
          <div className="grid grid-cols-4 gap-2">
            {[
              { icon: Truck, title: "24H Dispatch", sub: "Fast Delivery" },
              { icon: ShieldCheck, title: "Derma Tested", sub: "Clinically Safe" },
              { icon: Leaf, title: "Clean & Safe", sub: "Ingredients" },
              { icon: Headphones, title: "Expert", sub: "Support" },
            ].map((b, i) => (
              <div key={i} className="flex flex-col items-center text-center" data-testid={`trust-${i}`}>
                <div className="w-12 h-12 rounded-full bg-[#D7F0DD] flex items-center justify-center text-[#15803D] mb-2">
                  <b.icon className="w-5 h-5" strokeWidth={1.8}/>
                </div>
                <div className="text-[11px] font-medium text-[#1F2937] leading-tight">{b.title}</div>
                <div className="text-[10px] text-[#6B7280]">{b.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BANNER CAROUSEL — admin-uploaded promo banners (position 4: between trust strip and featured combo).
          Hidden unless admin uploads at least one banner AND keeps banners_enabled !== false. */}
      {meta?.settings?.banners_enabled !== false && Array.isArray(meta?.settings?.banners) &&
       meta.settings.banners.filter(b => (typeof b === "string" ? b : b?.image)).length > 0 && (
        <section className="max-w-2xl mx-auto px-4 pt-5" data-testid="banner-carousel">
          <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
            {meta.settings.banners.map((b, idx) => {
              const url = typeof b === "string" ? b : b?.image;
              const link = typeof b === "string" ? "" : (b?.link || "");
              if (!url) return null;
              return (
                <button
                  key={idx}
                  onClick={() => link && navigate(link.startsWith("/") ? `/store/${slug}${link}` : `/store/${slug}/${link}`)}
                  className="relative shrink-0 w-[88%] aspect-[16/9] snap-center overflow-hidden rounded-[20px] border border-[#E5E7EB] bg-[#F9FAFB]"
                  data-testid={`banner-${idx}`}
                >
                  <img src={url} alt={`Banner ${idx + 1}`} className="w-full h-full object-cover"/>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* (Featured Anti-Aging Kit hero section removed per admin request — combos now surface
          only via the BESTSELLERS / All Products grid and the Combos tab.) */}

      {/* BESTSELLERS */}
      <section className="max-w-2xl mx-auto px-4 pt-8">
        <div className="flex items-end justify-between mb-4">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] tracking-[0.18em] uppercase text-[#16A34A] mb-1">
              <Zap className="w-3 h-3 fill-[#16A34A]"/> Trending Now
            </div>
            <h2 className="font-serif text-[22px] text-[#1F2937]">Anti-Aging <span className="italic text-[#16A34A]">Bestsellers</span></h2>
          </div>
          <Link to={`/store/${slug}/products`} className="text-[12px] text-[#16A34A] flex items-center gap-1">View all <ArrowRight className="w-3 h-3"/></Link>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {bestSellers.map(p => <ProductCard key={p.id} p={p} slug={slug}/>)}
        </div>
      </section>

      {/* COMBOS */}
      {combos.length > 1 && (
        <section className="max-w-2xl mx-auto px-4 pt-8 pb-8">
          <div className="flex items-end justify-between mb-4">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] tracking-[0.18em] uppercase text-[#16A34A] mb-1">
                <Sparkles className="w-3 h-3"/> Save More
              </div>
              <h2 className="font-serif text-[22px] text-[#1F2937]">Curated <span className="italic text-[#16A34A]">Combos</span></h2>
            </div>
            <Link to={`/store/${slug}/products?tab=combos`} className="text-[12px] text-[#16A34A] flex items-center gap-1">All <ArrowRight className="w-3 h-3"/></Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {combos.slice(0, combos.length - 1).map(p => <ProductCard key={p.id} p={p} slug={slug}/>)}
          </div>
        </section>
      )}

      {/* AUTO-ROTATING IMAGE CAROUSEL (admin-managed) */}
      <HomeImageCarousel images={meta?.settings?.home_carousel_images} brandImage={meta?.settings?.hero_image} brandTitle={meta?.settings?.hero_title}/>

      {/* BOTTOM BANNER IMAGE (admin-managed, above Real Results) */}
      {meta?.settings?.bottom_banner_image && (
        <section className="max-w-2xl mx-auto px-4 pb-4" data-testid="bottom-banner-section">
          <div className="relative rounded-[20px] overflow-hidden aspect-[16/9] bg-[#F9FAFB]">
            <img
              src={meta.settings.bottom_banner_image}
              alt={meta.settings.bottom_banner_caption || "Celesta Glow"}
              className="absolute inset-0 w-full h-full object-cover"
              data-testid="bottom-banner-img"
            />
            {meta.settings.bottom_banner_caption && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
                <p className="text-white text-[13px] font-medium" data-testid="bottom-banner-caption">{meta.settings.bottom_banner_caption}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* TESTIMONIALS */}
      <section className="max-w-2xl mx-auto px-4 pb-6">
        <div className="bg-[#F9FAFB] rounded-[20px] p-5">
          <div className="text-center mb-4">
            <div className="text-[10px] tracking-[0.18em] uppercase text-[#16A34A] mb-1">Real Results</div>
            <h2 className="font-serif text-[20px] text-[#1F2937]">Loved by 50,000+ Indians</h2>
          </div>
          <div className="space-y-3">
            {(meta?.settings?.testimonials || []).slice(0, 2).map((t, i) => (
              <div key={i} className="bg-white p-4 rounded-xl" data-testid={`testimonial-${i}`}>
                <div className="flex mb-2">{[...Array(t.rating || 5)].map((_, j) => <Star key={j} className="w-3 h-3 fill-[#F59E0B] text-[#F59E0B]"/>)}</div>
                <p className="text-[13px] text-[#1F2937] leading-relaxed mb-2">"{t.text}"</p>
                <div className="text-[11px] text-[#6B7280]">— {t.name}, {t.location}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOMEPAGE FAQ */}
      <section className="max-w-2xl mx-auto px-4 pb-10" data-testid="home-faq-section">
        <div className="text-center mb-4">
          <div className="text-[10px] tracking-[0.18em] uppercase text-[#16A34A] mb-1">Got Questions?</div>
          <h2 className="font-serif text-[22px] text-[#1F2937]">Frequently Asked Questions</h2>
        </div>
        <div className="space-y-2">
          {(meta?.settings?.home_faqs?.length
            ? meta.settings.home_faqs
            : [
                { q: "Are Celesta Glow products safe for Indian skin?", a: "Yes. Every product is dermatologically tested, formulated for Indian climate and skin types, and free from harmful parabens and sulphates." },
                { q: "When will I see visible results?", a: "Most customers report visible firming, brightness and a reduction in fine lines within 4 weeks of consistent daily use." },
                { q: "Is the kit suitable for sensitive skin?", a: "Absolutely. Our retinoid is the gentle next-generation HPR, and all products are fragrance-light and ophthalmologist-tested." },
                { q: "Do you offer Cash on Delivery?", a: "Yes — COD is available across 19,000+ pincodes. A small handling fee applies." },
                { q: "What is your return policy?", a: "30-day no-questions-asked money-back guarantee. We pick up the return for free." },
              ]
          ).map((f, i) => <FAQItem key={i} q={f.q} a={f.a}/>)}
        </div>
      </section>
    </div>
  );
}

// =================== HOME IMAGE CAROUSEL ===================
function HomeImageCarousel({ images, brandImage, brandTitle }) {
  // Build the slide list: configured images first, then brand fallback image last
  const slides = (Array.isArray(images) && images.length > 0 ? images : [])
    .filter(Boolean)
    .concat(brandImage ? [brandImage] : []);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => setIdx(i => (i + 1) % slides.length), 3500);
    return () => clearInterval(t);
  }, [slides.length]);
  if (slides.length === 0) return null;
  return (
    <section className="max-w-2xl mx-auto px-4 pt-8 pb-2" data-testid="home-carousel">
      <div className="relative rounded-[20px] overflow-hidden aspect-[16/9] bg-[#F9FAFB]">
        {slides.map((src, i) => (
          <img
            key={i}
            src={src}
            alt={brandTitle || "Celesta Glow"}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${i === idx ? "opacity-100" : "opacity-0"}`}
            data-testid={`carousel-img-${i}`}
          />
        ))}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
          {slides.map((_, i) => (
            <span key={i} className={`w-1.5 h-1.5 rounded-full transition ${i === idx ? "bg-white w-4" : "bg-white/60"}`}/>
          ))}
        </div>
      </div>
    </section>
  );
}

// =================== PRODUCT CARD ===================
function ProductCard({ p, slug }) {
  const cart = useCart();
  const navigate = useNavigate();
  const savings = p.mrp - p.price;
  const isNew = p.badges?.some(b => /new|bestseller/i.test(b));
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-[16px] overflow-hidden flex flex-col" data-testid={`product-card-${p.slug}`}>
      <div className="relative aspect-square overflow-hidden bg-[#F9FAFB]" onClick={() => navigate(`/store/${slug}/product/${p.slug}`)}>
        {isNew && (
          <span className="absolute top-2.5 left-2.5 z-10 bg-[#DCFCE7] text-[#15803D] text-[9px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5"/> NEW
          </span>
        )}
        <button className="absolute top-2.5 right-2.5 z-10 w-7 h-7 rounded-full bg-white shadow-sm flex items-center justify-center" onClick={e => {e.stopPropagation(); navigator.share?.({title: p.name, url: window.location.origin + `/store/${slug}/product/${p.slug}`}) || navigator.clipboard.writeText(window.location.origin + `/store/${slug}/product/${p.slug}`); toast.success("Link copied");}} data-testid={`share-${p.slug}`}>
          <Share2 className="w-3.5 h-3.5 text-[#6B7280]"/>
        </button>
        <img src={p.card_image || p.image} alt={p.name} className="w-full h-full object-cover"/>
      </div>
      <div className="p-3 flex-1 flex flex-col">
        <div className="text-[9px] tracking-[0.15em] uppercase text-[#16A34A] font-medium mb-0.5">Celesta Glow</div>
        <Link to={`/store/${slug}/product/${p.slug}`} className="text-[14px] font-semibold text-[#1F2937] leading-tight mb-1 line-clamp-2">{p.name}</Link>
        <div className="text-[11px] text-[#16A34A] leading-snug mb-2 line-clamp-1">{p.tagline}</div>
        <div className="flex items-baseline gap-1.5 mb-1.5">
          <span className="text-[15px] font-bold text-[#1F2937]">₹{p.price}</span>
          {p.mrp > p.price && <span className="text-[11px] text-[#9CA3AF] line-through">₹{p.mrp}</span>}
        </div>
        {savings > 0 && (
          <div className="inline-flex items-center gap-1 bg-[#DCFCE7] text-[#15803D] text-[10px] px-2 py-1 rounded-full mb-1.5 w-fit">
            <Check className="w-3 h-3"/> Get it for ₹{p.price - 50}
          </div>
        )}
        <div className="flex items-center gap-1 text-[10px] text-[#6B7280] mb-2">
          <Sparkles className="w-3 h-3 text-[#16A34A]"/> Free skin analysis included
        </div>
        <div className="flex items-center gap-1 mb-2.5">
          {[...Array(5)].map((_, i) => <Star key={i} className={`w-3 h-3 ${i < Math.floor(p.rating || 0) ? "fill-[#F59E0B] text-[#F59E0B]" : "text-[#E5E7EB]"}`}/>)}
          <span className="text-[10px] text-[#6B7280] ml-1">({p.review_count?.toLocaleString() || 0})</span>
        </div>
        <div className="mt-auto flex items-center gap-1.5 w-full">
          <button className="w-8 h-8 rounded-full border border-[#E5E7EB] flex items-center justify-center shrink-0" data-testid={`fav-${p.slug}`}>
            <Heart className="w-3.5 h-3.5 text-[#9CA3AF]"/>
          </button>
          <Button onClick={() => cart.add(p)} className="flex-1 min-w-0 h-8 px-2 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-full text-[11px] font-medium whitespace-nowrap" data-testid={`add-to-cart-${p.slug}`}>
            <ShoppingCart className="w-3 h-3 mr-1 shrink-0"/>Add to Bag
          </Button>
        </div>
      </div>
    </div>
  );
}

// =================== PRODUCTS LIST ===================
function StoreProducts({ slug, products }) {
  const location = useLocation();
  const initial = new URLSearchParams(location.search).get("tab") === "combos" ? "combos" : "all";
  const [tab, setTab] = useState(initial);
  useEffect(()=>{ setTab(initial); }, [initial]);
  const list = tab === "combos" ? products.filter(p => p.is_combo) : products.filter(p => !p.is_combo);
  return (
    <div className="bg-white min-h-[60vh]">
      <div className="max-w-2xl mx-auto px-4 pt-5 pb-8">
        <div className="text-center mb-5">
          <div className="text-[10px] tracking-[0.18em] uppercase text-[#16A34A] mb-1">Shop the Collection</div>
          <h1 className="font-serif text-[24px] text-[#1F2937] mb-4">Anti-Aging, <span className="italic text-[#16A34A]">Reimagined</span></h1>
          <div className="inline-flex bg-[#F0F9F4] rounded-full p-1" data-testid="product-tabs">
            <button onClick={() => setTab("all")} className={`px-5 py-2 rounded-full text-[12px] transition ${tab==="all" ? "bg-[#16A34A] text-white shadow-sm" : "text-[#15803D]"}`} data-testid="tab-all-products">All Products</button>
            <button onClick={() => setTab("combos")} className={`px-5 py-2 rounded-full text-[12px] transition ${tab==="combos" ? "bg-[#16A34A] text-white shadow-sm" : "text-[#15803D]"}`} data-testid="tab-combos">Combos</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {list.map(p => <ProductCard key={p.id} p={p} slug={slug}/>)}
        </div>
      </div>
    </div>
  );
}

// =================== PRODUCT DETAIL ===================
function StoreProductDetail({ slug }) {
  const { pslug } = useParams();
  const navigate = useNavigate();
  const cart = useCart();
  const [p, setP] = useState(null);
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState("desc");
  useEffect(() => {
    axios.get(`${API}/store/${slug}/product/${pslug}`).then(r => setP(r.data)).catch(() => toast.error("Product not found"));
  }, [slug, pslug]);
  if (!p) return <div className="min-h-[60vh] flex items-center justify-center text-[#9CA3AF]">Loading…</div>;
  const savings = p.mrp - p.price;
  return (
    <div className="bg-white" data-testid="product-detail-page">
      <div className="max-w-2xl mx-auto px-4 pt-4">
        {/* Image */}
        <div className="bg-[#F9FAFB] rounded-[20px] aspect-square overflow-hidden mb-4">
          <img src={p.image} alt={p.name} className="w-full h-full object-cover"/>
        </div>

        {/* Urgency Strip */}
        <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-xl px-3 py-2.5 flex items-center justify-around text-[11px] mb-4" data-testid="urgency-strip">
          <span className="flex items-center gap-1.5 text-[#A16207]"><Eye className="w-3.5 h-3.5"/><strong>10</strong> viewing</span>
          <span className="flex items-center gap-1.5 text-[#15803D]"><Zap className="w-3.5 h-3.5"/><strong>{Math.floor((p.review_count || 100)/100)}</strong> sold today</span>
          <span className="flex items-center gap-1.5 text-[#DC2626]"><Clock className="w-3.5 h-3.5"/>Only <strong>{p.stock || 20}</strong> left!</span>
        </div>

        {/* Rating + Title */}
        <div className="flex items-center gap-2 mb-2">
          {[...Array(5)].map((_, i) => <Star key={i} className={`w-3.5 h-3.5 ${i < Math.floor(p.rating) ? "fill-[#F59E0B] text-[#F59E0B]" : "text-[#E5E7EB]"}`}/>)}
          <span className="text-[12px] text-[#1F2937] font-medium">{p.rating}</span>
          <span className="text-[11px] text-[#6B7280]">({p.review_count?.toLocaleString()} reviews)</span>
        </div>
        <h1 className="font-serif font-bold text-[22px] leading-tight text-[#1F2937] mb-1.5">Celesta Glow {p.name.replace("Celesta ", "")}</h1>
        <div className="text-[12px] text-[#16A34A] mb-4 leading-snug">{p.tagline} | {p.size}</div>

        {/* Price Card */}
        <div className="bg-[#F0F9F4] border border-[#D1FAE5] rounded-[16px] p-5 mb-5" data-testid="price-card">
          <div className="flex items-baseline gap-3 mb-1">
            <span className="font-serif text-[32px] font-bold text-[#1F2937]">₹{p.price}</span>
            {p.mrp > p.price && <span className="text-[15px] text-[#9CA3AF] line-through">₹{p.mrp}</span>}
          </div>
          {savings > 0 && <div className="text-[13px] text-[#15803D] font-medium mb-1">You save ₹{savings} on this product</div>}
          <div className="text-[11px] text-[#6B7280] mb-3">Free Shipping | COD ₹{p.price + 100} | Inclusive of all taxes</div>
          <div className="bg-white border border-[#FED7AA] rounded-lg px-3 py-2 flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#F59E0B] flex items-center justify-center"><Zap className="w-4 h-4 text-white"/></div>
            <span className="text-[12px] text-[#1F2937]">Use code <span className="bg-[#FFFBEB] text-[#A16207] font-mono font-bold px-1.5 py-0.5 rounded text-[11px]">WELCOME50</span> for extra ₹50 OFF</span>
          </div>
        </div>

        {/* Qty + CTA */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex items-center border border-[#E5E7EB] rounded-full">
            <button onClick={() => setQty(q => Math.max(1, q-1))} className="px-3 py-2 text-[#1F2937]" data-testid="qty-dec"><Minus className="w-3.5 h-3.5"/></button>
            <span className="px-3 text-[13px] min-w-[28px] text-center" data-testid="qty-val">{qty}</span>
            <button onClick={() => setQty(q => q+1)} className="px-3 py-2 text-[#1F2937]" data-testid="qty-inc"><Plus className="w-3.5 h-3.5"/></button>
          </div>
          <Button onClick={() => cart.add(p, qty)} className="flex-1 bg-white border border-[#16A34A] text-[#16A34A] hover:bg-[#F0F9F4] rounded-full h-11 text-[12px] font-medium" data-testid="pdp-add-to-cart">
            Add to Bag
          </Button>
          <Button onClick={() => { cart.add(p, qty); navigate(`/store/${slug}/checkout`); }} className="flex-1 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-full h-11 text-[12px] font-medium" data-testid="pdp-buy-now">
            Buy Now
          </Button>
        </div>

        {/* Tabs */}
        <div className="border-b border-[#E5E7EB] flex gap-5 text-[12px] mb-4">
          {[["desc","Description"],["ing","Ingredients"],["how","How to Use"],["ben","Benefits"]].map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)} className={`pb-3 -mb-px border-b-2 ${tab===k ? "border-[#16A34A] text-[#1F2937] font-medium" : "border-transparent text-[#6B7280]"}`} data-testid={`pdp-tab-${k}`}>{l}</button>
          ))}
        </div>
        <div className="pb-6 text-[13px] text-[#374151] leading-relaxed">
          {tab==="desc" && <p>{p.long_desc}</p>}
          {tab==="ing" && <ul className="space-y-2">{p.ingredients?.map((x,i) => <li key={i} className="flex items-start gap-2"><Check className="w-4 h-4 text-[#16A34A] mt-0.5 shrink-0"/>{x}</li>)}</ul>}
          {tab==="how" && <p>{p.how_to_use}</p>}
          {tab==="ben" && <ul className="space-y-2">{p.benefits?.map((x,i) => <li key={i} className="flex items-start gap-2"><Check className="w-4 h-4 text-[#16A34A] mt-0.5 shrink-0"/>{x}</li>)}</ul>}
        </div>

        {/* Trust */}
        <div className="grid grid-cols-3 gap-2 text-center py-4 border-y border-[#E5E7EB] mb-6">
          <div><Truck className="w-5 h-5 text-[#16A34A] mx-auto mb-1"/><div className="text-[10px] text-[#6B7280]">24H Dispatch</div></div>
          <div><ShieldCheck className="w-5 h-5 text-[#16A34A] mx-auto mb-1"/><div className="text-[10px] text-[#6B7280]">30-Day Returns</div></div>
          <div><PackageCheck className="w-5 h-5 text-[#16A34A] mx-auto mb-1"/><div className="text-[10px] text-[#6B7280]">COD Available</div></div>
        </div>

        {/* FLOATING / SCROLLING REVIEWS */}
        <FloatingReviews productName={p.name}/>

        {/* PRODUCT FAQ */}
        <div className="mb-8" data-testid="product-faq-section">
          <div className="text-[10px] tracking-[0.18em] uppercase text-[#16A34A] mb-1">Frequently Asked Questions</div>
          <h3 className="font-serif text-[18px] text-[#1F2937] mb-3">About this product</h3>
          <div className="space-y-2">
            {(p.faqs?.length ? p.faqs : [
              { q: `Is ${p.name.replace("Celesta Glow ", "")} safe for daily use?`, a: "Yes. This formula is dermatologically tested and safe for daily morning and night use on all Indian skin types, including sensitive skin." },
              { q: "Can I use this with other actives?", a: "Yes — pair with our Cleanser and SPF 50 sunscreen during the day. Avoid layering strong AHAs/BHAs the same night to prevent irritation." },
              { q: "How long until I see results?", a: "Most customers see visible improvement in skin texture, brightness or hydration within 2–4 weeks of consistent daily use." },
              { q: "Is it suitable for sensitive skin?", a: "Yes. Free of parabens, sulphates and synthetic fragrance. Patch-test on the inner forearm for 24 hours before first use." },
              { q: "Is it cruelty-free and vegan?", a: "100% cruelty-free and vegan. Made in India under strict GMP-certified facilities." },
            ]).map((f, i) => <FAQItem key={i} q={f.q} a={f.a}/>)}
          </div>
        </div>
      </div>
    </div>
  );
}

function FloatingReviews({ productName }) {
  const reviews = [
    { name: "Priya M.", city: "Mumbai", rating: 5, text: `${productName ? productName.replace("Celesta Glow ", "") : "This"} is the best I've tried — visible difference in 3 weeks.` },
    { name: "Anjali R.", city: "Bangalore", rating: 5, text: "Lightweight, absorbs fast, no white cast. Worth every rupee." },
    { name: "Kavya S.", city: "Hyderabad", rating: 5, text: "Finally a formula that works on Indian skin. Already on my second tube!" },
    { name: "Neha T.", city: "Pune", rating: 5, text: "Skin feels visibly firmer and brighter. Friends have started asking what I'm using." },
    { name: "Riya P.", city: "Delhi", rating: 5, text: "Genuine results, premium feel, packaging is gorgeous. Re-ordering already." },
    { name: "Aisha K.", city: "Chennai", rating: 4, text: "Sensitive-skin friendly. No breakouts, no irritation, just a smooth glow." },
  ];
  return (
    <div className="mb-8 -mx-4" data-testid="floating-reviews">
      <div className="text-[10px] tracking-[0.18em] uppercase text-[#16A34A] mb-1 px-4">Verified Reviews</div>
      <div className="flex items-end justify-between mb-3 px-4">
        <h3 className="font-serif text-[18px] text-[#1F2937]">What customers say</h3>
        <div className="flex items-center gap-1 text-[11px] text-[#6B7280]">
          <Star className="w-3.5 h-3.5 fill-[#F59E0B] text-[#F59E0B]"/>4.8 average
        </div>
      </div>
      {/* Marquee (scrolling) row */}
      <div className="overflow-hidden">
        <div className="flex gap-3 marquee-track w-max">
          {[...reviews, ...reviews].map((r, i) => (
            <div key={i} className="w-[260px] shrink-0 bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-sm" data-testid={`floating-review-${i}`}>
              <div className="flex mb-1.5">{[...Array(r.rating)].map((_, j) => <Star key={j} className="w-3 h-3 fill-[#F59E0B] text-[#F59E0B]"/>)}</div>
              <p className="text-[12px] text-[#1F2937] leading-relaxed mb-2 line-clamp-3">"{r.text}"</p>
              <div className="text-[10px] text-[#6B7280]">— {r.name}, {r.city}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =================== CART ===================
function StoreCart({ slug, meta }) {
  const cart = useCart();
  const navigate = useNavigate();
  const [couponInput, setCouponInput] = useState(cart.coupon?.code || "");
  const [applying, setApplying] = useState(false);
  const shipping = cart.total >= 999 ? 0 : (cart.items.length ? 79 : 0);
  const discount = cart.coupon?.discount || 0;
  const grandTotal = Math.max(0, cart.total - discount) + shipping;
  const savings = cart.items.reduce((s, x) => {
    // approximate savings via 25% MRP markup (matches average mrp/price ratio of seed data)
    return s + Math.round(x.price * 0.25) * x.qty;
  }, 0);

  const applyCoupon = async () => {
    const code = (couponInput || "").trim().toUpperCase();
    if (!code) { toast.error("Enter a coupon code"); return; }
    setApplying(true);
    try {
      const r = await axios.post(`${API}/store/${slug}/validate-coupon`, { code, subtotal: cart.total });
      cart.setCoupon({ code: r.data.code, discount: r.data.discount, description: r.data.description });
      toast.success(`Coupon ${r.data.code} applied: -₹${r.data.discount}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Invalid coupon");
    } finally { setApplying(false); }
  };
  const removeCoupon = () => { cart.setCoupon(null); setCouponInput(""); toast.info("Coupon removed"); };

  return (
    <div className="bg-white min-h-[60vh]" data-testid="cart-page">
      <div className="max-w-2xl mx-auto px-4 py-5">
        <h1 className="font-serif text-[24px] text-[#1F2937] mb-1">Your Bag</h1>
        <p className="text-[12px] text-[#6B7280] mb-5">{cart.count} {cart.count === 1 ? "item" : "items"} • Free shipping over ₹999</p>

        {cart.items.length === 0 ? (
          <div className="bg-[#F9FAFB] rounded-[20px] p-10 text-center">
            <ShoppingBag className="w-10 h-10 text-[#16A34A] mx-auto mb-3"/>
            <p className="text-[13px] text-[#6B7280] mb-4">Your bag is empty.</p>
            <Button onClick={() => navigate(`/store/${slug}/products`)} className="bg-[#16A34A] text-white rounded-full px-5">Continue shopping</Button>
          </div>
        ) : (
          <>
            <div className="space-y-2 mb-4">
              {cart.items.map(it => (
                <div key={it.id} className="bg-white border border-[#E5E7EB] rounded-[14px] p-3 flex items-center gap-3" data-testid={`cart-item-${it.slug}`}>
                  <img src={it.image} alt={it.name} className="w-16 h-16 object-cover bg-[#F9FAFB] rounded-lg"/>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[13px] text-[#1F2937] line-clamp-2 leading-tight">{it.name}</div>
                    <div className="text-[13px] text-[#1F2937] font-bold mt-1">₹{it.price * it.qty}</div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex items-center border border-[#E5E7EB] rounded-full text-[11px]">
                        <button onClick={() => cart.setQty(it.id, it.qty - 1)} className="px-2 py-1" data-testid={`cart-dec-${it.slug}`}><Minus className="w-3 h-3"/></button>
                        <span className="px-2 min-w-[22px] text-center">{it.qty}</span>
                        <button onClick={() => cart.setQty(it.id, it.qty + 1)} className="px-2 py-1" data-testid={`cart-inc-${it.slug}`}><Plus className="w-3 h-3"/></button>
                      </div>
                      <button onClick={() => cart.remove(it.id)} className="text-[10px] text-[#9CA3AF] hover:text-red-500" data-testid={`cart-remove-${it.slug}`}>Remove</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Promo code box */}
            <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-xl p-3 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-full bg-[#F59E0B] flex items-center justify-center shrink-0"><Zap className="w-4 h-4 text-white"/></div>
                <div className="text-[12px] font-medium text-[#1F2937]">Have a promo code?</div>
              </div>
              {cart.coupon ? (
                <div className="flex items-center justify-between bg-white border border-[#D1FAE5] rounded-lg px-3 py-2" data-testid="applied-coupon">
                  <div>
                    <div className="font-mono font-bold text-[12px] text-[#15803D]">{cart.coupon.code}</div>
                    <div className="text-[10px] text-[#16A34A]">- ₹{cart.coupon.discount} off applied</div>
                  </div>
                  <button onClick={removeCoupon} className="text-[10px] text-red-600" data-testid="remove-coupon-btn">Remove</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    value={couponInput}
                    onChange={e => setCouponInput(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === "Enter" && applyCoupon()}
                    placeholder="Enter code"
                    className="h-9 rounded-lg text-[12px] flex-1"
                    data-testid="coupon-input"
                  />
                  <Button onClick={applyCoupon} disabled={applying || !couponInput} className="h-9 px-4 bg-[#F59E0B] hover:bg-[#D97706] text-white rounded-lg text-[12px]" data-testid="apply-coupon-btn">
                    {applying ? "…" : "Apply"}
                  </Button>
                </div>
              )}
            </div>

            {/* Summary */}
            <div className="bg-[#F9FAFB] rounded-[14px] p-4 mb-4">
              <div className="flex justify-between text-[13px] mb-2"><span className="text-[#6B7280]">Subtotal</span><span className="font-medium">₹{cart.total}</span></div>
              {discount > 0 && <div className="flex justify-between text-[12px] mb-2" data-testid="cart-discount-line"><span className="text-[#16A34A]">Coupon ({cart.coupon.code})</span><span className="font-medium text-[#16A34A]">- ₹{discount}</span></div>}
              {savings > 0 && <div className="flex justify-between text-[12px] mb-2"><span className="text-[#16A34A]">You save</span><span className="font-medium text-[#16A34A]">- ₹{savings}</span></div>}
              <div className="flex justify-between text-[13px] mb-2"><span className="text-[#6B7280]">Shipping</span><span className="font-medium text-[#16A34A]">{shipping === 0 ? "FREE" : `₹${shipping}`}</span></div>
              <div className="border-t border-[#E5E7EB] mt-2 pt-2 flex justify-between text-[15px] font-bold"><span>Total</span><span data-testid="cart-grand-total">₹{grandTotal}</span></div>
            </div>

            {cart.total < 999 && (
              <div className="bg-[#F0F9F4] border border-[#D1FAE5] rounded-xl p-3 mb-4 text-[12px] text-[#15803D] flex items-center gap-2">
                <Truck className="w-4 h-4"/>Add <strong>₹{999 - cart.total}</strong> more to unlock FREE shipping
              </div>
            )}

            <Button onClick={() => navigate(`/store/${slug}/checkout`)} className="w-full bg-[#16A34A] hover:bg-[#15803D] text-white rounded-full h-12 text-[13px] font-medium mb-5" data-testid="cart-checkout-btn">
              Proceed to Checkout • ₹{grandTotal}
            </Button>

            {/* Trust badges */}
            <div className="grid grid-cols-3 gap-2 text-center py-4 border-y border-[#E5E7EB] mb-5">
              <div><ShieldCheck className="w-5 h-5 text-[#16A34A] mx-auto mb-1"/><div className="text-[10px] text-[#6B7280]">100% Secure</div></div>
              <div><Truck className="w-5 h-5 text-[#16A34A] mx-auto mb-1"/><div className="text-[10px] text-[#6B7280]">Fast Shipping</div></div>
              <div><RefreshCw className="w-5 h-5 text-[#16A34A] mx-auto mb-1"/><div className="text-[10px] text-[#6B7280]">30-Day Returns</div></div>
            </div>

            {/* Reviews carousel */}
            <div className="mb-5">
              <div className="text-[10px] tracking-[0.18em] uppercase text-[#16A34A] mb-2">What Customers Say</div>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory" data-testid="cart-reviews">
                {(meta?.settings?.testimonials || []).map((t, i) => (
                  <div key={i} className="min-w-[80%] snap-start bg-[#F9FAFB] rounded-xl p-4">
                    <div className="flex mb-2">{[...Array(t.rating || 5)].map((_, j) => <Star key={j} className="w-3 h-3 fill-[#F59E0B] text-[#F59E0B]"/>)}</div>
                    <p className="text-[12px] text-[#1F2937] leading-relaxed mb-2 line-clamp-3">"{t.text}"</p>
                    <div className="text-[10px] text-[#6B7280]">— {t.name}, {t.location}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* You may also like */}
            <div className="text-[10px] tracking-[0.18em] uppercase text-[#16A34A] mb-2">You May Also Like</div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
              <UpsellGrid slug={slug}/>
            </div>

            {/* FAQs */}
            <div className="mt-6 pt-5 border-t border-[#E5E7EB]">
              <div className="text-[10px] tracking-[0.18em] uppercase text-[#16A34A] mb-3">Frequently Asked</div>
              <FAQItem q="When will my order ship?" a="Same-day dispatch on orders placed before 4 PM. Delivery in 3-5 business days across India."/>
              <FAQItem q="Is COD available?" a="Yes! Cash on Delivery is available across 19,000+ pincodes. A small COD handling fee applies."/>
              <FAQItem q="What's your return policy?" a="30-day no-questions-asked money-back guarantee. We pick up the return for free."/>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[#E5E7EB] py-3">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-start justify-between text-left">
        <span className="text-[13px] font-medium text-[#1F2937] flex-1 pr-2">{q}</span>
        <ChevronRight className={`w-4 h-4 text-[#6B7280] mt-0.5 transition-transform ${open ? "rotate-90" : ""}`}/>
      </button>
      {open && <p className="text-[12px] text-[#6B7280] mt-2 leading-relaxed">{a}</p>}
    </div>
  );
}

function UpsellGrid({ slug }) {
  const [products, setProducts] = useState([]);
  useEffect(() => {
    axios.get(`${API}/store/${slug}/products`).then(r => setProducts((r.data.products || []).filter(p => !p.is_combo).slice(0, 4)));
  }, [slug]);
  const cart = useCart();
  return (
    <>
      {products.map(p => (
        <div key={p.id} className="min-w-[150px] bg-white border border-[#E5E7EB] rounded-xl overflow-hidden">
          <Link to={`/store/${slug}/product/${p.slug}`} className="block aspect-square bg-[#F9FAFB]">
            <img src={p.image} alt={p.name} className="w-full h-full object-cover"/>
          </Link>
          <div className="p-2">
            <div className="text-[10px] text-[#16A34A] font-medium">CELESTA GLOW</div>
            <div className="text-[12px] text-[#1F2937] font-medium line-clamp-2 mb-1 leading-tight">{p.name.replace("Celesta Glow ", "")}</div>
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-[13px] font-bold">₹{p.price}</span>
              {p.mrp > p.price && <span className="text-[10px] text-[#9CA3AF] line-through">₹{p.mrp}</span>}
            </div>
            <Button size="sm" onClick={() => cart.add(p)} className="w-full h-8 bg-[#16A34A] text-white rounded-full text-[10px]">+ Add</Button>
          </div>
        </div>
      ))}
    </>
  );
}

// =================== CHECKOUT ===================
function StoreCheckout({ slug, meta }) {
  const cart = useCart();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    customer_name: "", customer_phone: "", customer_email: "",
    address: "", locality: "", city: "", state: "", pincode: "",
    payment_method: "cod",
  });
  const [pinLoading, setPinLoading] = useState(false);
  const [localityOptions, setLocalityOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [placed, setPlaced] = useState(false);
  const rzp_enabled = meta?.settings?.razorpay_enabled && meta?.settings?.razorpay_key_id;
  const shipping = cart.total >= 999 ? 0 : 79;

  // Auto-fetch state, city and locality when pincode is 6 digits
  useEffect(() => {
    const pin = (form.pincode || "").trim();
    if (!/^\d{6}$/.test(pin)) { setLocalityOptions([]); return; }
    let cancelled = false;
    setPinLoading(true);
    fetch(`https://api.postalpincode.in/pincode/${pin}`)
      .then(r => r.json())
      .then(arr => {
        if (cancelled) return;
        const data = Array.isArray(arr) ? arr[0] : null;
        if (data?.Status === "Success" && data.PostOffice?.length) {
          const po = data.PostOffice[0];
          setForm(f => ({
            ...f,
            state: f.state || po.State || "",
            city: f.city || po.District || "",
            locality: f.locality || po.Name || "",
          }));
          setLocalityOptions(data.PostOffice.map(x => x.Name));
        } else {
          setLocalityOptions([]);
        }
      })
      .catch(() => setLocalityOptions([]))
      .finally(() => { if (!cancelled) setPinLoading(false); });
    return () => { cancelled = true; };
  }, [form.pincode]);

  useEffect(() => {
    if (cart.items.length === 0 && !placed) navigate(`/store/${slug}/cart`);
    if (!document.getElementById("rzp-script")) {
      const s = document.createElement("script");
      s.id = "rzp-script"; s.src = "https://checkout.razorpay.com/v1/checkout.js"; s.async = true;
      document.body.appendChild(s);
    }
  }, [cart.items.length, navigate, slug, placed]);

  const placeOrder = async () => {
    if (!form.customer_name || !form.customer_phone || !form.address || !form.city || !form.pincode) {
      toast.error("Please fill name, phone, address, city and pincode"); return;
    }
    setLoading(true);
    try {
      const payload = { ...form, items: cart.items.map(i => ({ id: i.id, qty: i.qty })), coupon_code: cart.coupon?.code || "" };
      const r = await axios.post(`${API}/store/${slug}/order`, payload);
      const { order_id, razorpay } = r.data;
      if (form.payment_method === "razorpay" && razorpay) {
        const opts = {
          key: razorpay.key_id, amount: razorpay.amount, currency: razorpay.currency,
          name: "Celesta Glow", description: "Order #" + order_id,
          order_id: razorpay.order_id,
          prefill: { name: form.customer_name, email: form.customer_email, contact: form.customer_phone },
          theme: { color: "#16A34A" },
          handler: async (res) => {
            try {
              await axios.post(`${API}/store/${slug}/order/verify`, {
                order_id, razorpay_order_id: res.razorpay_order_id,
                razorpay_payment_id: res.razorpay_payment_id, razorpay_signature: res.razorpay_signature,
              });
              setPlaced(true);
              cart.clear();
              navigate(`/store/${slug}/thank-you/${order_id}`);
            } catch (e) { toast.error("Payment verification failed"); }
          },
          modal: { ondismiss: () => toast.info("Payment cancelled") },
        };
        if (window.Razorpay) { new window.Razorpay(opts).open(); }
        else { toast.error("Payment gateway not loaded. Try again."); }
      } else {
        setPlaced(true);
        cart.clear();
        navigate(`/store/${slug}/thank-you/${order_id}`);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Order failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="bg-white min-h-[60vh]" data-testid="checkout-page">
      <div className="max-w-2xl mx-auto px-4 py-5">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-[12px] text-[#6B7280] mb-3"><ChevronLeft className="w-4 h-4"/>Back</button>
        <h1 className="font-serif text-[24px] text-[#1F2937] mb-1">Secure Checkout</h1>
        <p className="text-[12px] text-[#6B7280] mb-5 flex items-center gap-2"><ShieldCheck className="w-3.5 h-3.5 text-[#16A34A]"/>SSL encrypted • PCI compliant • Powered by Razorpay</p>

        {/* Steps indicator */}
        <div className="flex items-center gap-2 mb-5 text-[11px] text-[#6B7280]">
          <div className="flex items-center gap-1 text-[#16A34A] font-medium"><div className="w-5 h-5 rounded-full bg-[#16A34A] text-white flex items-center justify-center text-[10px]">1</div>Cart</div>
          <div className="flex-1 h-px bg-[#16A34A]"/>
          <div className="flex items-center gap-1 text-[#16A34A] font-medium"><div className="w-5 h-5 rounded-full bg-[#16A34A] text-white flex items-center justify-center text-[10px]">2</div>Details</div>
          <div className="flex-1 h-px bg-[#E5E7EB]"/>
          <div className="flex items-center gap-1"><div className="w-5 h-5 rounded-full bg-[#E5E7EB] text-[#6B7280] flex items-center justify-center text-[10px]">3</div>Done</div>
        </div>

        <div className="space-y-4 mb-5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#6B7280] font-medium">📞 Contact</div>
          <Input placeholder="Full Name *" value={form.customer_name} onChange={e=>setForm({...form, customer_name:e.target.value})} className="h-11 rounded-xl" data-testid="co-name"/>
          <Input placeholder="Phone *" value={form.customer_phone} onChange={e=>setForm({...form, customer_phone:e.target.value})} className="h-11 rounded-xl" data-testid="co-phone"/>
          <Input placeholder="Email" type="email" value={form.customer_email} onChange={e=>setForm({...form, customer_email:e.target.value})} className="h-11 rounded-xl" data-testid="co-email"/>
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#6B7280] font-medium pt-2">📦 Shipping Address</div>
          {/* Pincode first — auto-fills state, city & locality */}
          <div className="relative">
            <Input
              placeholder="Pincode *"
              value={form.pincode}
              maxLength={6}
              inputMode="numeric"
              onChange={e => setForm({...form, pincode: e.target.value.replace(/\D/g, "").slice(0, 6)})}
              className="h-11 rounded-xl pr-24"
              data-testid="co-pincode"
            />
            {pinLoading && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#6B7280]">Looking up…</span>}
            {!pinLoading && form.pincode.length === 6 && form.state && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#16A34A] font-medium">✓ {form.state}</span>
            )}
          </div>
          {/* Locality (auto-fill from pincode lookup) */}
          {localityOptions.length > 0 ? (
            <select
              value={form.locality}
              onChange={e => setForm({...form, locality: e.target.value})}
              className="w-full h-11 rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px]"
              data-testid="co-locality-select"
            >
              <option value="">Select locality / area *</option>
              {localityOptions.map(loc => <option key={loc} value={loc}>{loc}</option>)}
            </select>
          ) : (
            <Input
              placeholder="Locality / Area *"
              value={form.locality}
              onChange={e => setForm({...form, locality: e.target.value})}
              className="h-11 rounded-xl"
              data-testid="co-locality"
            />
          )}
          <Textarea rows={2} placeholder="House #, Street, Landmark *" value={form.address} onChange={e=>setForm({...form, address:e.target.value})} className="rounded-xl" data-testid="co-address"/>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="City *" value={form.city} onChange={e=>setForm({...form, city:e.target.value})} className="h-11 rounded-xl" data-testid="co-city"/>
            <Input placeholder="State" value={form.state} onChange={e=>setForm({...form, state:e.target.value})} className="h-11 rounded-xl" data-testid="co-state"/>
          </div>
        </div>

        <div className="space-y-2 mb-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#6B7280] font-medium mb-1">💳 Payment Method</div>
          {meta?.settings?.cod_enabled !== false && (
            <label className={`flex items-center gap-3 p-3 border-2 rounded-xl cursor-pointer transition ${form.payment_method==="cod" ? "border-[#16A34A] bg-[#F0F9F4]" : "border-[#E5E7EB]"}`} data-testid="pay-cod">
              <input type="radio" name="pm" checked={form.payment_method==="cod"} onChange={()=>setForm({...form, payment_method:"cod"})} className="accent-[#16A34A]"/>
              <div className="flex-1">
                <div className="text-[13px] font-medium text-[#1F2937] flex items-center gap-2">Cash on Delivery <span className="text-[10px] bg-[#FEF3C7] text-[#A16207] px-1.5 py-0.5 rounded">+₹40</span></div>
                <div className="text-[11px] text-[#6B7280]">Pay when you receive the order</div>
              </div>
            </label>
          )}
          {rzp_enabled && (
            <label className={`flex items-center gap-3 p-3 border-2 rounded-xl cursor-pointer transition ${form.payment_method==="razorpay" ? "border-[#16A34A] bg-[#F0F9F4]" : "border-[#E5E7EB]"}`} data-testid="pay-online">
              <input type="radio" name="pm" checked={form.payment_method==="razorpay"} onChange={()=>setForm({...form, payment_method:"razorpay"})} className="accent-[#16A34A]"/>
              <div className="flex-1">
                <div className="text-[13px] font-medium text-[#1F2937] flex items-center gap-2">Pay Online <span className="text-[10px] bg-[#DCFCE7] text-[#15803D] px-1.5 py-0.5 rounded">Save ₹40</span></div>
                <div className="text-[11px] text-[#6B7280]">UPI · Card · Net Banking · Wallets</div>
              </div>
            </label>
          )}
        </div>

        {/* Trust strip */}
        <div className="bg-gradient-to-r from-[#F0F9F4] to-[#FFFBEB] rounded-xl p-3 mb-4 flex items-center justify-around text-center">
          <div className="flex-1"><ShieldCheck className="w-5 h-5 text-[#16A34A] mx-auto mb-1"/><div className="text-[10px] text-[#1F2937] font-medium">100% Safe</div></div>
          <div className="w-px h-8 bg-[#E5E7EB]"/>
          <div className="flex-1"><Truck className="w-5 h-5 text-[#16A34A] mx-auto mb-1"/><div className="text-[10px] text-[#1F2937] font-medium">Fast Delivery</div></div>
          <div className="w-px h-8 bg-[#E5E7EB]"/>
          <div className="flex-1"><RefreshCw className="w-5 h-5 text-[#16A34A] mx-auto mb-1"/><div className="text-[10px] text-[#1F2937] font-medium">30-Day Returns</div></div>
        </div>

        {/* Summary */}
        <div className="bg-[#F9FAFB] rounded-xl p-4 mb-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#6B7280] font-medium mb-2">Order Summary</div>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {cart.items.map(it => (
              <div key={it.id} className="flex items-center gap-2 text-[12px]">
                <img src={it.image} alt="" className="w-10 h-10 object-cover rounded"/>
                <div className="flex-1 leading-tight">
                  <div className="text-[#1F2937] line-clamp-1">{it.name}</div>
                  <div className="text-[10px] text-[#6B7280]">Qty {it.qty}</div>
                </div>
                <div className="text-[#1F2937] font-medium">₹{it.price * it.qty}</div>
              </div>
            ))}
          </div>
          <div className="border-t border-[#E5E7EB] mt-3 pt-3 space-y-1.5 text-[13px]">
            <div className="flex justify-between"><span className="text-[#6B7280]">Subtotal</span><span>₹{cart.total}</span></div>
            <div className="flex justify-between"><span className="text-[#6B7280]">Shipping</span><span className="text-[#16A34A]">{shipping===0?"FREE":`₹${shipping}`}</span></div>
            <div className="flex justify-between font-bold text-[15px] pt-1.5 border-t border-[#E5E7EB]"><span>Total</span><span>₹{cart.total + shipping}</span></div>
          </div>
        </div>

        <Button onClick={placeOrder} disabled={loading} className="w-full bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:brightness-110 text-white rounded-full h-12 text-[14px] font-semibold shadow-md" data-testid="place-order-btn">
          {loading ? "Placing…" : `🔒 Place Order • ₹${cart.total + shipping}`}
        </Button>

        {/* Reviews */}
        <div className="mt-6 pt-5 border-t border-[#E5E7EB]">
          <div className="text-[10px] tracking-[0.18em] uppercase text-[#16A34A] mb-2 text-center">⭐ Trusted by 50,000+ Indians</div>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory">
            {(meta?.settings?.testimonials || []).map((t, i) => (
              <div key={i} className="min-w-[85%] snap-start bg-[#F9FAFB] rounded-xl p-4">
                <div className="flex mb-2">{[...Array(t.rating || 5)].map((_, j) => <Star key={j} className="w-3 h-3 fill-[#F59E0B] text-[#F59E0B]"/>)}</div>
                <p className="text-[12px] text-[#1F2937] leading-relaxed mb-2">"{t.text}"</p>
                <div className="text-[10px] text-[#6B7280]">— {t.name}, {t.location}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Trust seals */}
        <div className="mt-4 flex items-center justify-center gap-3 text-[10px] text-[#6B7280] flex-wrap">
          <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3"/>SSL Encrypted</span>
          <span>•</span>
          <span>Verified Indian Brand</span>
          <span>•</span>
          <span>FSSAI Approved</span>
        </div>
      </div>
    </div>
  );
}

// =================== THANK YOU ===================
function StoreThankYou({ slug }) {
  const { oid } = useParams();
  const [order, setOrder] = useState(null);
  useEffect(() => { axios.get(`${API}/store/${slug}/order/${oid}`).then(r => setOrder(r.data)).catch(()=>{}); }, [slug, oid]);
  return (
    <div className="bg-white min-h-[60vh]" data-testid="thank-you-page">
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-[#DCFCE7] text-[#15803D] flex items-center justify-center mb-5">
          <Check className="w-8 h-8" strokeWidth={3}/>
        </div>
        <h1 className="font-serif text-[26px] text-[#1F2937] mb-2">Order Placed!</h1>
        <p className="text-[13px] text-[#6B7280] mb-1">Order #<strong className="text-[#1F2937]">{oid}</strong></p>
        {order && <p className="text-[13px] text-[#6B7280] mb-5">Thanks {order.customer_name}, we'll WhatsApp you a confirmation shortly.</p>}
        <div className="bg-[#F0F9F4] border border-[#D1FAE5] p-5 text-left rounded-xl mb-5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#15803D] font-medium mb-3">What happens next</div>
          <ol className="space-y-2 text-[13px] text-[#1F2937]">
            <li className="flex gap-2"><span className="text-[#16A34A] font-bold">1.</span>Sales team reviews your order.</li>
            <li className="flex gap-2"><span className="text-[#16A34A] font-bold">2.</span>You'll get a confirmation call from our telecaller.</li>
            <li className="flex gap-2"><span className="text-[#16A34A] font-bold">3.</span>Same-day dispatch. Delivery in 3-5 business days.</li>
          </ol>
        </div>
        <Link to={`/store/${slug}/track`} className="text-[#16A34A] text-[13px] underline">Track this order →</Link>
        <div className="mt-3">
          <Link to={`/store/${slug}`} className="text-[#6B7280] text-[12px]">Continue shopping</Link>
        </div>
      </div>
    </div>
  );
}

// =================== TRACK ORDER ===================
function StoreTrackOrder({ slug }) {
  const [form, setForm] = useState({ phone: "", order_id: "" });
  const [orders, setOrders] = useState(null);
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    if (!form.phone) { toast.error("Enter your phone number"); return; }
    setLoading(true);
    try {
      const r = await axios.post(`${API}/store/track-order`, form);
      setOrders(r.data.orders || []);
      if ((r.data.orders || []).length === 0) toast.info("No orders found for this phone.");
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not track"); }
    finally { setLoading(false); }
  };
  const status_color = (s) => ({
    pending: "bg-amber-100 text-amber-800",
    sm_approved: "bg-blue-100 text-blue-800",
    approved: "bg-blue-100 text-blue-800",
    shipped: "bg-emerald-100 text-emerald-800",
    delivered: "bg-emerald-200 text-emerald-900",
    rejected: "bg-red-100 text-red-800",
  }[s] || "bg-gray-100 text-gray-700");
  return (
    <div className="bg-white min-h-[60vh]" data-testid="track-order-page">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="font-serif text-[24px] text-[#1F2937] mb-2">Track Your Order</h1>
        <p className="text-[13px] text-[#6B7280] mb-5">Enter your phone number to see your orders and delivery status.</p>
        <div className="space-y-3 mb-5">
          <Input placeholder="Phone number *" value={form.phone} onChange={e=>setForm({...form, phone:e.target.value})} className="h-11 rounded-xl" data-testid="track-phone"/>
          <Input placeholder="Order ID (optional)" value={form.order_id} onChange={e=>setForm({...form, order_id:e.target.value})} className="h-11 rounded-xl" data-testid="track-order-id"/>
          <Button onClick={submit} disabled={loading} className="w-full bg-[#16A34A] text-white rounded-full h-11 text-[13px] font-medium" data-testid="track-submit">
            {loading ? "Searching…" : "Track Order"}
          </Button>
        </div>
        {orders && orders.length > 0 && (
          <div className="space-y-3">
            <div className="text-[12px] text-[#6B7280]">Found {orders.length} order{orders.length>1?"s":""}:</div>
            {orders.map(o => (
              <div key={o.id} className="bg-white border border-[#E5E7EB] rounded-xl p-4" data-testid={`track-order-${o.id}`}>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-mono text-[11px] text-[#6B7280]">{o.id}</div>
                    <div className="text-[13px] font-medium text-[#1F2937]">₹{o.total}</div>
                  </div>
                  <span className={`text-[10px] px-2 py-1 rounded-full ${status_color(o.status)}`}>{o.status}</span>
                </div>
                <div className="text-[12px] text-[#374151] mb-1">{(o.items||[]).map(i=>`${i.name}×${i.qty}`).join(", ")}</div>
                <div className="text-[11px] text-[#6B7280]">Ordered on {(o.created_at || "").slice(0, 10)}</div>
                {o.awb && <div className="text-[11px] text-[#16A34A] mt-1">AWB: {o.awb} {o.tracking_url && <a href={o.tracking_url} target="_blank" rel="noreferrer" className="underline">Track →</a>}</div>}
                <div className="mt-3 text-[11px] text-[#6B7280]">
                  Delivery to {o.city}, {o.pincode}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =================== AGENT LOGIN ===================
function AgentLogin({ slug }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    setLoading(true);
    try {
      const r = await axios.post(`${API}/store-agent/login`, form);
      localStorage.setItem(`agent-token-${slug}`, r.data.token);
      localStorage.setItem(`agent-info-${slug}`, JSON.stringify(r.data.agent));
      toast.success(`Welcome back, ${r.data.agent.name}`);
      navigate(`/store/${slug}/agent-portal`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Login failed"); }
    finally { setLoading(false); }
  };
  return (
    <div className="bg-white min-h-[70vh] flex items-start justify-center pt-10" data-testid="agent-login-page">
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 w-full max-w-md mx-4">
        <div className="text-center mb-5">
          <div className="w-12 h-12 rounded-full bg-[#DCFCE7] text-[#15803D] flex items-center justify-center mx-auto mb-3">
            <User className="w-6 h-6"/>
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#16A34A] mb-1">Agent Portal</div>
          <h1 className="font-serif text-[22px] text-[#1F2937]">Sign In</h1>
          <p className="text-[12px] text-[#6B7280] mt-1.5">Track your orders, customers and commission</p>
        </div>
        <div className="space-y-3">
          <Input placeholder="Username" value={form.username} onChange={e=>setForm({...form, username:e.target.value})} className="h-11 rounded-xl" data-testid="agent-login-username"/>
          <Input type="password" placeholder="Password" value={form.password} onChange={e=>setForm({...form, password:e.target.value})} onKeyDown={e=>e.key==='Enter'&&submit()} className="h-11 rounded-xl" data-testid="agent-login-password"/>
          <Button onClick={submit} disabled={loading} className="w-full bg-[#16A34A] hover:bg-[#15803D] text-white rounded-full h-11" data-testid="agent-login-submit">
            {loading ? "Signing in…" : "Sign In"}
          </Button>
        </div>
        <div className="text-[11px] text-[#6B7280] text-center mt-4">
          Don't have an account? <span className="text-[#16A34A]">Contact your sales manager.</span>
        </div>
      </div>
    </div>
  );
}

// =================== AGENT PORTAL (orders, customers, commission, withdraw, profile) ===================
function AgentPortalScreen({ slug }) {
  const navigate = useNavigate();
  const token = localStorage.getItem(`agent-token-${slug}`);
  const agent = JSON.parse(localStorage.getItem(`agent-info-${slug}`) || "null");
  const [tab, setTab] = useState("dashboard");
  const [stats, setStats] = useState({ total_orders: 0, revenue: 0, commission: 0, by_status: {} });
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [withdraws, setWithdraws] = useState({ requests: [], balance: { earned: 0, paid: 0, pending: 0, available: 0 } });
  const [productStats, setProductStats] = useState([]);
  const [filter, setFilter] = useState("all"); // today | last7 | last30 | month | all
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawForm, setWithdrawForm] = useState({ amount: 0, method: "gpay", note: "" });

  const auth = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  const getRange = useCallback(() => {
    const now = new Date();
    if (filter === "today") return [now.toISOString().slice(0,10), now.toISOString().slice(0,10)];
    if (filter === "last7") { const d = new Date(); d.setDate(d.getDate() - 7); return [d.toISOString().slice(0,10), now.toISOString().slice(0,10)]; }
    if (filter === "last30") { const d = new Date(); d.setDate(d.getDate() - 30); return [d.toISOString().slice(0,10), now.toISOString().slice(0,10)]; }
    if (filter === "month") return [now.toISOString().slice(0,7) + "-01", now.toISOString().slice(0,10)];
    return ["", ""];
  }, [filter]);

  const load = useCallback(async () => {
    try {
      const [from, to] = getRange();
      const q = (from || to) ? `?date_from=${from}&date_to=${to}` : "";
      const [s, o, c, w, ps] = await Promise.all([
        axios.get(`${API}/store-agent/stats${q}`, auth),
        axios.get(`${API}/store-agent/orders${q}`, auth),
        axios.get(`${API}/store-agent/customers`, auth),
        axios.get(`${API}/store-agent/withdraw-requests`, auth),
        axios.get(`${API}/store-agent/product-stats`, auth),
      ]);
      setStats(s.data); setOrders(o.data.orders || []);
      setCustomers(c.data.customers || []);
      setWithdraws(w.data); setProductStats(ps.data.products || []);
    } catch (e) {
      if (e?.response?.status === 401) {
        localStorage.removeItem(`agent-token-${slug}`); navigate(`/store/${slug}/agent-login`);
      }
    }
  }, [auth, slug, navigate, getRange]);

  useEffect(() => { if (!token) navigate(`/store/${slug}/agent-login`); else load(); }, [token, load, slug, navigate]);

  if (!token || !agent) return null;

  const logout = () => {
    localStorage.removeItem(`agent-token-${slug}`);
    localStorage.removeItem(`agent-info-${slug}`);
    navigate(`/store/${slug}`);
  };

  const repeat = async (oid) => {
    try { await axios.post(`${API}/store-agent/repeat-order/${oid}`, { payment_method: "cod" }, auth); toast.success("Repeat order created"); load(); }
    catch { toast.error("Could not repeat order"); }
  };

  const requestWithdraw = async () => {
    if (!withdrawForm.amount || withdrawForm.amount <= 0) { toast.error("Enter a valid amount"); return; }
    if (withdrawForm.amount > withdraws.balance.available) { toast.error(`Only ₹${withdraws.balance.available} available`); return; }
    try {
      await axios.post(`${API}/store-agent/withdraw-request`, withdrawForm, auth);
      toast.success("Withdraw request submitted. HR will process it."); setShowWithdraw(false);
      setWithdrawForm({ amount: 0, method: "gpay", note: "" }); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const statusColor = (s) => ({
    pending: "bg-amber-100 text-amber-800",
    sm_approved: "bg-blue-100 text-blue-800",
    approved: "bg-blue-100 text-blue-800",
    shipped: "bg-emerald-100 text-emerald-800",
    delivered: "bg-emerald-200 text-emerald-900",
    rejected: "bg-red-100 text-red-800",
    paid: "bg-emerald-100 text-emerald-800",
  }[s] || "bg-gray-100 text-gray-700");

  return (
    <div className="bg-white min-h-[80vh]" data-testid="agent-portal">
      <div className="max-w-2xl mx-auto px-4 py-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#16A34A]">{agent.designation}</div>
            <h1 className="font-serif text-[22px] text-[#1F2937]">Hi, {agent.name.split(" ")[0]} 👋</h1>
            <div className="text-[11px] text-[#6B7280]">Earning {agent.commission_pct}% on every order</div>
          </div>
          <Button size="sm" variant="outline" onClick={logout} className="rounded-full h-8 text-[11px]" data-testid="agent-logout"><LogOut className="w-3 h-3 mr-1"/>Logout</Button>
        </div>

        {/* Quick filter pills */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
          {[["today","Today"],["last7","7 Days"],["last30","30 Days"],["month","This Month"],["all","All Time"]].map(([k,l]) => (
            <button key={k} onClick={()=>setFilter(k)} className={`px-3 py-1.5 rounded-full text-[11px] whitespace-nowrap ${filter===k ? "bg-[#16A34A] text-white" : "bg-[#F0F9F4] text-[#15803D]"}`} data-testid={`portal-filter-${k}`}>{l}</button>
          ))}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <StatTile label="Orders" value={stats.total_orders} icon={<ShoppingBag className="w-4 h-4"/>}/>
          <StatTile label="Revenue" value={`₹${(stats.revenue||0).toLocaleString()}`} icon={<IndianRupee className="w-4 h-4"/>}/>
          <StatTile label="Commission" value={`₹${(stats.commission||0).toLocaleString()}`} icon={<TrendingUp className="w-4 h-4"/>} primary/>
          <StatTile label="Customers" value={customers.length} icon={<Users className="w-4 h-4"/>}/>
        </div>

        {/* Wallet card */}
        <div className="bg-gradient-to-br from-[#15803D] to-[#166534] text-white rounded-2xl p-5 mb-5" data-testid="wallet-card">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/70 mb-1">Available Balance</div>
              <div className="font-serif text-[28px] font-bold">₹{withdraws.balance.available?.toLocaleString() || 0}</div>
            </div>
            <Wallet className="w-8 h-8 text-white/40"/>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[10px] mb-3">
            <div><div className="text-white/60">Earned</div><div className="font-medium">₹{withdraws.balance.earned}</div></div>
            <div><div className="text-white/60">Paid</div><div className="font-medium">₹{withdraws.balance.paid}</div></div>
            <div><div className="text-white/60">Pending</div><div className="font-medium">₹{withdraws.balance.pending}</div></div>
          </div>
          <Button onClick={()=>setShowWithdraw(true)} disabled={withdraws.balance.available <= 0} className="w-full bg-white text-[#15803D] hover:bg-white/90 rounded-full h-10 text-[12px] font-medium" data-testid="withdraw-btn">
            Request Withdraw
          </Button>
        </div>

        {/* Tabs */}
        <div className="border-b border-[#E5E7EB] flex gap-4 mb-4 text-[11px] uppercase tracking-wide overflow-x-auto">
          {[["dashboard","Dashboard"], ["orders",`Orders (${orders.length})`], ["customers",`Relationships (${customers.length})`], ["products","Top Products"], ["withdraws",`Withdraws (${withdraws.requests.length})`]].map(([k,l]) => (
            <button key={k} onClick={()=>setTab(k)} className={`pb-2.5 -mb-px border-b-2 whitespace-nowrap ${tab===k ? "border-[#16A34A] text-[#1F2937] font-medium" : "border-transparent text-[#6B7280]"}`} data-testid={`agent-tab-${k}`}>{l}</button>
          ))}
        </div>

        {tab === "dashboard" && (
          <div className="space-y-4">
            <div className="bg-[#F9FAFB] rounded-xl p-4">
              <div className="text-[12px] font-medium text-[#1F2937] mb-2">Your Store</div>
              <div className="flex items-center gap-2 bg-white border border-[#E5E7EB] rounded-lg px-3 py-2">
                <span className="text-[11px] text-[#6B7280] font-mono flex-1 truncate">{window.location.origin}/store/{agent.slug}</span>
                <button onClick={()=>{navigator.clipboard.writeText(`${window.location.origin}/store/${agent.slug}`); toast.success("Link copied!");}} className="text-[10px] text-[#16A34A] font-medium" data-testid="copy-store-link">Copy</button>
              </div>
            </div>
            <div className="text-[12px] text-[#6B7280]">Recent orders</div>
            {orders.slice(0,3).map(o => (
              <div key={o.id} className="bg-white border border-[#E5E7EB] rounded-xl p-3 flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-medium text-[#1F2937]">{o.customer_name}</div>
                  <div className="text-[10px] text-[#6B7280]">{(o.items||[]).map(i=>i.name).join(", ").slice(0,40)}…</div>
                </div>
                <div className="text-right">
                  <div className="text-[13px] font-bold text-[#1F2937]">₹{o.total}</div>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${statusColor(o.status)}`}>{o.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "orders" && (
          <div className="space-y-2">
            {orders.length === 0 && <div className="bg-[#F9FAFB] rounded-xl p-8 text-center text-[#6B7280] text-[13px]">No orders yet. Share your store link to start earning!</div>}
            {orders.map(o => (
              <div key={o.id} className="bg-white border border-[#E5E7EB] rounded-xl p-3" data-testid={`agent-order-row-${o.id}`}>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="text-[13px] font-medium text-[#1F2937]">{o.customer_name}</div>
                    <div className="text-[10px] text-[#6B7280]">{o.customer_phone} • {o.city} {o.pincode}</div>
                    <div className="text-[11px] text-[#6B7280] mt-1">{(o.items||[]).map(i=>`${i.name}×${i.qty}`).join(", ")}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-[#1F2937]">₹{o.total}</div>
                    <div className="text-[10px] text-[#A66E4E] font-medium">+₹{o.commission_amount}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded ${statusColor(o.status)}`}>{o.status}</span>
                    <span className="text-[10px] text-[#9CA3AF]">{(o.created_at||"").slice(0,10)}</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={()=>repeat(o.id)} className="h-7 text-[10px] rounded-full" data-testid={`repeat-${o.id}`}>
                    <RefreshCw className="w-3 h-3 mr-1"/>Repeat
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "customers" && (
          <div className="space-y-3">
            {customers.length === 0 && <div className="bg-[#F9FAFB] rounded-xl p-8 text-center text-[#6B7280] text-[13px]">No customers yet.</div>}
            {customers.map((c,i) => (
              <div key={i} className="bg-white border border-[#E5E7EB] rounded-xl p-4" data-testid={`customer-card-${c.customer_phone}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="text-[14px] font-medium text-[#1F2937]">{c.customer_name}</div>
                    <div className="text-[11px] text-[#6B7280]">{c.customer_phone}</div>
                    {c.city && <div className="text-[11px] text-[#6B7280]">{c.city}</div>}
                  </div>
                  <span className="text-[10px] bg-[#F0F9F4] text-[#15803D] px-2 py-0.5 rounded-full">{c.orders.length} orders</span>
                </div>
                <div className="text-[12px] text-[#6B7280] mb-2">Total spent: <strong className="text-[#1F2937]">₹{c.total_spent}</strong> • Last: {(c.last_order_at||"").slice(0,10)}</div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={()=>repeat(c.orders[0].id)} className="h-8 text-[10px] rounded-full bg-[#16A34A] text-white" data-testid={`repeat-cust-${c.customer_phone}`}><RefreshCw className="w-3 h-3 mr-1"/>Repeat last order</Button>
                  <a href={`tel:${c.customer_phone}`} className="h-8 px-3 rounded-full border border-[#E5E7EB] text-[10px] flex items-center"><Phone className="w-3 h-3 mr-1"/>Call</a>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "products" && (
          <div className="space-y-2">
            {productStats.length === 0 && <div className="bg-[#F9FAFB] rounded-xl p-8 text-center text-[#6B7280] text-[13px]">No products ordered yet.</div>}
            {productStats.map((p,i) => (
              <div key={i} className="bg-white border border-[#E5E7EB] rounded-xl p-3 flex items-center gap-3" data-testid={`product-stat-${p.id}`}>
                {p.image && <img src={p.image} alt="" className="w-12 h-12 object-cover rounded-lg"/>}
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[#1F2937] truncate">{p.name}</div>
                  <div className="text-[10px] text-[#6B7280]">{p.qty} units across {p.orders} orders</div>
                </div>
                <div className="text-right">
                  <div className="text-[12px] font-bold text-[#1F2937]">₹{p.revenue}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "withdraws" && (
          <div className="space-y-2">
            {withdraws.requests.length === 0 && <div className="bg-[#F9FAFB] rounded-xl p-8 text-center text-[#6B7280] text-[13px]">No withdraw requests yet.</div>}
            {withdraws.requests.map(w => (
              <div key={w.id} className="bg-white border border-[#E5E7EB] rounded-xl p-3" data-testid={`withdraw-${w.id}`}>
                <div className="flex justify-between items-start mb-1">
                  <div>
                    <div className="text-[14px] font-bold text-[#1F2937]">₹{w.amount}</div>
                    <div className="text-[10px] text-[#6B7280]">Via {w.method.toUpperCase()} • {(w.created_at||"").slice(0,10)}</div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded ${statusColor(w.status)}`}>{w.status}</span>
                </div>
                {w.transaction_ref && <div className="text-[10px] text-[#16A34A] mt-1">Ref: {w.transaction_ref}</div>}
                {w.rejection_reason && <div className="text-[10px] text-red-600 mt-1">Rejected: {w.rejection_reason}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Withdraw dialog */}
      <Dialog open={showWithdraw} onOpenChange={setShowWithdraw}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request Withdraw</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="bg-[#F0F9F4] p-3 rounded text-[12px] text-[#15803D]">Available balance: <strong>₹{withdraws.balance.available}</strong></div>
            <div><Label>Amount (₹)</Label><Input type="number" value={withdrawForm.amount} onChange={e=>setWithdrawForm({...withdrawForm, amount: Number(e.target.value)})} max={withdraws.balance.available} data-testid="withdraw-amount"/></div>
            <div><Label>Method</Label>
              <div className="flex gap-2 mt-1">
                {["gpay","upi","bank"].map(m => (
                  <button key={m} onClick={()=>setWithdrawForm({...withdrawForm, method: m})} className={`px-3 py-1.5 rounded-full text-[11px] ${withdrawForm.method===m?"bg-[#16A34A] text-white":"bg-[#F0F9F4] text-[#15803D]"}`} data-testid={`withdraw-method-${m}`}>{m.toUpperCase()}</button>
                ))}
              </div>
            </div>
            <div><Label>Note (optional)</Label><Input value={withdrawForm.note} onChange={e=>setWithdrawForm({...withdrawForm, note:e.target.value})} placeholder="GPay number or notes for HR" data-testid="withdraw-note"/></div>
            <Button onClick={requestWithdraw} className="w-full bg-[#16A34A] text-white rounded-full" data-testid="withdraw-submit">Submit Request</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatTile({ label, value, icon, primary }) {
  return (
    <div className={`p-4 rounded-2xl ${primary ? "bg-gradient-to-br from-[#16A34A] to-[#15803D] text-white" : "bg-white border border-[#E5E7EB]"}`} data-testid={`stat-${label.toLowerCase()}`}>
      <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wide mb-1.5 ${primary ? "text-white/80" : "text-[#6B7280]"}`}>{icon}{label}</div>
      <div className={`font-serif text-[22px] font-bold ${primary ? "text-white" : "text-[#1F2937]"}`}>{value}</div>
    </div>
  );
}

// =================== ROOT ===================
export default function Storefront() {
  const { slug } = useParams();
  const [meta, setMeta] = useState(null);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/store/${slug}/meta`),
      axios.get(`${API}/store/${slug}/products`),
    ]).then(([m, p]) => { setMeta(m.data); setProducts(p.data.products || []); })
      .catch(e => setError(e?.response?.data?.detail || "Storefront not found"));
  }, [slug]);

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-white text-[#1F2937] font-serif text-xl" data-testid="store-error">{error}</div>
  );
  if (!meta) return <div className="min-h-screen flex items-center justify-center bg-white text-[#6B7280]">Loading…</div>;

  // hide bottom nav on agent portal/login for cleaner experience? keep visible — user may need it
  const isAgentArea = location.pathname.includes("/agent-portal") || location.pathname.includes("/agent-login");

  return (
    <CartProvider slug={slug}>
      <div className="bg-white min-h-screen pb-20" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <StoreHeader slug={slug} onMenuOpen={() => setMenuOpen(true)}/>
        <MenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} slug={slug}/>
        <main>
          <Routes>
            <Route index element={<StoreHome slug={slug} meta={meta} products={products}/>}/>
            <Route path="products" element={<StoreProducts slug={slug} products={products}/>}/>
            <Route path="product/:pslug" element={<StoreProductDetail slug={slug}/>}/>
            <Route path="cart" element={<StoreCart slug={slug} meta={meta}/>}/>
            <Route path="checkout" element={<StoreCheckout slug={slug} meta={meta}/>}/>
            <Route path="thank-you/:oid" element={<StoreThankYou slug={slug}/>}/>
            <Route path="track" element={<StoreTrackOrder slug={slug}/>}/>
            <Route path="agent-login" element={<AgentLogin slug={slug}/>}/>
            <Route path="agent-portal" element={<AgentPortalScreen slug={slug}/>}/>
            <Route path="*" element={<Navigate to={`/store/${slug}`} replace/>}/>
          </Routes>
        </main>
        {!isAgentArea && <WhatsAppFloat/>}
        <BottomNav slug={slug}/>
      </div>
    </CartProvider>
  );
}
