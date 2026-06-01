"""
Agent Sales + Storefront module for Celesta Glow CRM.

Implements:
  * Public anti-aging e-commerce storefront (per-agent slug) — home, products, combos, cart, checkout
  * Razorpay payment integration (key_id + key_secret stored in MongoDB store_settings)
  * Agent CRUD by Sales Managers (designation, commission %, auto-generated slug + credentials)
  * Agent-portal (login on storefront): orders, customers, commission stats with date filter, repeat-order
  * Admin: store settings + product/combo CRUD + razorpay key management
  * Orders flow: storefront -> agent_orders -> sales-manager approval -> normal orders pipeline -> shipping

Mounted via init_agent_store(...) returning a router that is included into the FastAPI app.
"""
from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
import uuid, secrets, hashlib, hmac, re, logging, os, pathlib

from store_modules.coupons import evaluate_coupon, register as register_coupons
from store_modules.hr_agents import register as register_hr_agents
from store_modules.store_admin import register as register_store_admin

logger = logging.getLogger("agent_store")


# ---------------------------------------------------------------------------
# DEFAULT STORE CONTENT (anti-aging niche)
# ---------------------------------------------------------------------------
DEFAULT_PRODUCTS = [
    {
        "id": "p-cleanser",
        "slug": "gentle-cleanser",
        "name": "Celesta Glow Gentle Cleanser",
        "tagline": "Cleanse Deep. Glow Naturally.",
        "short_desc": "A gentle, pH-balanced daily cleanser that removes dirt, oil and impurities while improving skin clarity and supporting a youthful glow.",
        "long_desc": "A gentle, pH-balanced daily cleanser formulated with Niacinamide, Salicylic Acid and Hydrolyzed Pea Protein. Removes dirt, oil and impurities deeply while strengthening the skin barrier and supporting a soft, youthful glow. Suitable for all skin types.",
        "ingredients": [
            "Niacinamide", "Salicylic Acid", "Hydrolyzed Pea Protein",
            "Aloe Barbadensis Leaf Extract", "Sodium Lactate", "Sodium Gluconate",
            "Glycerin (Propylene Glycol)", "Tea Tree Oil", "Clove Oil", "Stevioside",
        ],
        "how_to_use": "Apply 1–2 pumps onto damp skin morning and night. Gently massage in circular motions for 30 seconds. Rinse off with lukewarm water. Follow with toner / serum.",
        "benefits": ["Deep cleans pores", "Controls oil & acne", "Brightens dull skin", "Maintains skin barrier"],
        "price": 299,
        "mrp": 399,
        "image": "https://images.unsplash.com/photo-1556228841-7d2750f31d4a?w=900&q=80",
        "gallery": [
            "https://images.unsplash.com/photo-1556228841-7d2750f31d4a?w=900&q=80",
            "https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?w=900&q=80",
        ],
        "badges": ["Bestseller", "All Skin Types"],
        "size": "100 ml",
        "skin_type": "All Skin Types",
        "is_combo": False,
        "stock": 320,
        "active": True,
        "rating": 4.8,
        "review_count": 2104,
    },
    {
        "id": "p-sunscreen",
        "slug": "daily-defense-sunscreen",
        "name": "Celesta Glow Daily Defense Sunscreen SPF 50 PA+++",
        "tagline": "Protect. Brighten. Prevent Aging.",
        "short_desc": "A lightweight, non-greasy sunscreen that protects against harmful UV rays while enhancing skin brightness and preventing premature aging.",
        "long_desc": "Daily Defense is a broad-spectrum SPF 50 PA+++ mineral-hybrid sunscreen made with Titanium Dioxide, Niacinamide and Vitamin E. It shields skin from UVA + UVB damage, prevents tanning and pigmentation, and leaves a clean matte finish — no white cast, no greasy feel.",
        "ingredients": [
            "Niacinamide", "Titanium Dioxide", "Vitamin E (Tocopherol)",
            "Methylene Bis-Benzotriazolyl Tetramethylbutylphenol", "Aloe Vera Extract",
            "Chamomile Extract", "Decyl Glucoside", "Glycerin", "Carbomer",
        ],
        "how_to_use": "Apply two finger-lengths to face and neck as the last step of your morning routine. Reapply every 2-3 hours when in direct sun.",
        "benefits": ["Broad-spectrum UV protection", "Prevents tanning & pigmentation", "Reduces sun damage", "Matte, non-greasy finish"],
        "price": 399,
        "mrp": 499,
        "image": "https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=900&q=80",
        "gallery": [
            "https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=900&q=80",
            "https://images.unsplash.com/photo-1570194065650-d99fb4bedf0a?w=900&q=80",
        ],
        "badges": ["SPF 50 PA+++", "Dermatologist Tested"],
        "size": "100 ml",
        "skin_type": "All Skin Types",
        "is_combo": False,
        "stock": 280,
        "active": True,
        "rating": 4.8,
        "review_count": 1532,
    },
    {
        "id": "p-eye-cream",
        "slug": "caffeine-under-eye-cream",
        "name": "Celesta Glow Caffeine Under Eye Cream",
        "tagline": "Bright Eyes. Zero Tired Look.",
        "short_desc": "A lightweight under-eye cream designed to reduce puffiness, dark circles and fine lines while deeply hydrating delicate skin.",
        "long_desc": "Our Caffeine Under Eye Cream is engineered for delicate skin around the eyes. With high-purity Caffeine, Niacinamide and Hyaluronic Acid, plus nourishing Shea Butter and Almond Oil, it instantly de-puffs, brightens dark circles and smooths fine lines for a refreshed, well-rested look.",
        "ingredients": [
            "Caffeine", "Niacinamide", "Hyaluronic Acid (Sodium Hyaluronate)",
            "Shea Butter", "Almond Oil", "Olive Oil", "Licorice Extract",
            "Aloe Vera Extract", "Beeswax", "Vitamin E (Tocopherol)",
        ],
        "how_to_use": "Dot a tiny pea-sized amount under each eye morning and night. Gently pat in with your ring finger until absorbed. Avoid direct contact with eyes.",
        "benefits": ["Reduces dark circles", "Minimises puffiness", "Smooths fine lines", "Deeply hydrates"],
        "price": 349,
        "mrp": 449,
        "image": "https://images.unsplash.com/photo-1631729371254-42c2892f0e6e?w=900&q=80",
        "gallery": [
            "https://images.unsplash.com/photo-1631729371254-42c2892f0e6e?w=900&q=80",
        ],
        "badges": ["NEW", "Bestseller"],
        "size": "15 g",
        "skin_type": "All Skin Types",
        "is_combo": False,
        "stock": 220,
        "active": True,
        "rating": 4.7,
        "review_count": 3571,
    },
    {
        "id": "p-night-cream",
        "slug": "advanced-retinoid-night-cream",
        "name": "Celesta Glow Advanced Retinoid Night Cream",
        "tagline": "Repair While You Sleep. Glow When You Wake.",
        "short_desc": "An advanced night treatment that targets fine lines, wrinkles and uneven tone while deeply hydrating and repairing skin overnight.",
        "long_desc": "Our Advanced Retinoid Night Cream pairs gentle next-generation Retinoid (Hydroxypinacolone Retinoate) with Hyaluronic Acid and Vitamin E to repair skin overnight. It smooths wrinkles, firms texture and boosts collagen — without the irritation of traditional retinol. Wake up to visibly plumper, radiant skin.",
        "ingredients": [
            "Retinoid (Hydroxypinacolone Retinoate)", "Hyaluronic Acid (Sodium Hyaluronate)",
            "Vitamin E (Tocopherol)", "4-n-Butylresorcinol", "Coco-Caprylate",
            "Sunflower Oil", "Glycerin", "Aloe Vera Extract",
        ],
        "how_to_use": "Apply a pearl-sized amount onto cleansed, dry skin every night. Massage gently into face and neck. Always follow with SPF the next morning.",
        "benefits": ["Reduces wrinkles", "Improves firmness", "Boosts collagen", "Enhances glow"],
        "price": 499,
        "mrp": 599,
        "image": "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=900&q=80",
        "gallery": [
            "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=900&q=80",
        ],
        "badges": ["Clean Beauty", "Dermatologist Tested"],
        "size": "50 ml",
        "skin_type": "All Skin Types",
        "is_combo": False,
        "stock": 200,
        "active": True,
        "rating": 4.8,
        "review_count": 1247,
    },
    {
        "id": "p-serum",
        "slug": "advanced-face-serum",
        "name": "Celesta Glow Advanced Face Serum",
        "tagline": "Brighten. Even. Glow.",
        "short_desc": "A fast-absorbing serum that targets dullness, uneven skin tone and pigmentation to reveal radiant, healthy-looking skin.",
        "long_desc": "Our hero brightening serum blends Niacinamide, Alpha Arbutin and Vitamin C with Hyaluronic Acid to even skin tone, fade pigmentation and visibly boost radiance. Lightweight, fast-absorbing and gentle enough for daily use.",
        "ingredients": [
            "Niacinamide", "Alpha Arbutin", "Vitamin C (L-Ascorbic Acid)",
            "Hyaluronic Acid (Sodium Hyaluronate)", "Vitamin E (Tocopherol)",
            "Aloe Vera Extract", "Glycerin",
        ],
        "how_to_use": "Apply 4-5 drops on cleansed skin morning and night, before moisturiser. Avoid the eye area. Always pair with SPF during the day.",
        "benefits": ["Brightens skin tone", "Reduces pigmentation", "Improves texture", "Boosts radiance"],
        "price": 449,
        "mrp": 549,
        "image": "https://images.unsplash.com/photo-1608248511503-7bd5e74c2c2c?w=900&q=80",
        "gallery": [
            "https://images.unsplash.com/photo-1608248511503-7bd5e74c2c2c?w=900&q=80",
            "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=900&q=80",
        ],
        "badges": ["Bestseller", "Clean Beauty"],
        "size": "30 ml",
        "skin_type": "All Skin Types",
        "is_combo": False,
        "stock": 260,
        "active": True,
        "rating": 4.8,
        "review_count": 1856,
    },
]

DEFAULT_COMBOS = [
    {
        "id": "c-anti-aging-kit",
        "slug": "complete-anti-aging-kit",
        "name": "Celesta Glow Anti-Aging Skincare Kit",
        "tagline": "Complete daily + night skincare routine",
        "short_desc": "All 5 products for a complete anti-aging routine. Cleanse, treat, hydrate, protect.",
        "long_desc": "Everything you need for visibly younger, radiant skin in one luxe box. Includes our Gentle Cleanser, Daily Defense Sunscreen SPF 50, Caffeine Under Eye Cream, Advanced Retinoid Night Cream and Advanced Face Serum. Built for a complete day + night routine — clinically-backed, dermatologically tested, made in India.",
        "combo_items": ["p-cleanser", "p-sunscreen", "p-eye-cream", "p-night-cream", "p-serum"],
        "price": 1899,
        "mrp": 2499,
        "image": "https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=1200&q=80",
        "gallery": [
            "https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=1200&q=80",
            "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=1200&q=80",
        ],
        "badges": ["SAVE ₹600", "Best Value", "Gift Ready"],
        "ingredients": [],
        "how_to_use": "AM: Cleanser → Serum → Eye Cream → SPF 50 | PM: Cleanser → Serum → Eye Cream → Retinoid Night Cream",
        "benefits": [
            "All 5 anti-aging heroes in one kit",
            "Save ₹600 vs buying individually",
            "Visible glow in 28 days, money-back guarantee",
            "Travel-friendly premium box",
        ],
        "size": "Set of 5",
        "is_combo": True,
        "stock": 80,
        "active": True,
        "rating": 4.9,
        "review_count": 12000,
    },
    {
        "id": "c-day-routine",
        "slug": "day-routine-combo",
        "name": "Day Glow Routine",
        "tagline": "Cleanser + Sunscreen + Serum",
        "short_desc": "Your complete morning anti-aging ritual — cleanse, treat and protect for radiant skin every day.",
        "long_desc": "The essential AM ritual. Cleanses, brightens and shields with SPF 50. Perfect for daily use.",
        "combo_items": ["p-cleanser", "p-sunscreen", "p-serum"],
        "price": 999,
        "mrp": 1347,
        "image": "https://images.unsplash.com/photo-1612817288484-6f916006741a?w=1200&q=80",
        "gallery": ["https://images.unsplash.com/photo-1612817288484-6f916006741a?w=1200&q=80"],
        "badges": ["Save ₹348", "Most Loved"],
        "ingredients": [],
        "how_to_use": "AM: Cleanser → Serum → SPF 50",
        "benefits": ["Complete morning routine", "Save 26%", "Brighten + protect"],
        "size": "Set of 3",
        "is_combo": True,
        "stock": 120,
        "active": True,
        "rating": 4.9,
        "review_count": 542,
    },
    {
        "id": "c-night-routine",
        "slug": "night-routine-combo",
        "name": "Night Renewal Routine",
        "tagline": "Cleanser + Eye Cream + Retinoid Night Cream",
        "short_desc": "Wake up to firmer, brighter, younger-looking skin.",
        "long_desc": "Our nighttime hero stack. Cleanse, treat your under-eyes, and seal it all in with our retinoid night cream.",
        "combo_items": ["p-cleanser", "p-eye-cream", "p-night-cream"],
        "price": 1099,
        "mrp": 1447,
        "image": "https://images.unsplash.com/photo-1631729371254-42c2892f0e6e?w=1200&q=80",
        "gallery": ["https://images.unsplash.com/photo-1631729371254-42c2892f0e6e?w=1200&q=80"],
        "badges": ["Save ₹348", "Bestseller"],
        "ingredients": [],
        "how_to_use": "PM: Cleanser → Eye Cream → Retinoid Night Cream",
        "benefits": ["Visible glow in 28 days", "Deep overnight repair", "Save 24%"],
        "size": "Set of 3",
        "is_combo": True,
        "stock": 100,
        "active": True,
        "rating": 4.8,
        "review_count": 387,
    },
]

DEFAULT_STORE_SETTINGS = {
    "_id": "store_settings",
    "razorpay_key_id": "",
    "razorpay_key_secret": "",
    "razorpay_enabled": False,
    "cod_enabled": True,
    "hero_title": "The Science of Ageless Skin",
    "hero_subtitle": "Clinically-backed anti-aging skincare crafted in India. Visible results in 28 days, or your money back.",
    "hero_cta": "Shop the Routine",
    "hero_image": "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=1600&q=80",
    "announcement_bar": "✨ FREE shipping on orders above ₹999 • COD available • Same-day dispatch",
    "trust_badges": [
        {"icon": "leaf", "title": "Clean Beauty", "subtitle": "Vegan & Cruelty-Free"},
        {"icon": "flask", "title": "Dermatologist Tested", "subtitle": "Made for Indian skin"},
        {"icon": "truck", "title": "Free Shipping", "subtitle": "On orders over ₹999"},
        {"icon": "shield", "title": "30-Day Returns", "subtitle": "Easy money-back"},
    ],
    "offer_banner": "BUY 2 GET 1 FREE — auto-applied at checkout. Code: GLOW3",
    "founder_note": "“We built Celesta Glow because every Indian deserves world-class anti-aging skincare made for our skin, our climate, our lives.” — Founder, Celesta Glow",
    "public_base_url": "https://software.celestaglow.com",
    "testimonials": [
        {"name": "Priya M.", "location": "Mumbai", "rating": 5, "text": "Bought the Night Renewal Combo and my fine lines are visibly softer in 3 weeks. Hooked!"},
        {"name": "Anjali R.", "location": "Bangalore", "rating": 5, "text": "The Vitamin C serum is the best I’ve tried — and I’ve tried a LOT. Skin glows by week 2."},
        {"name": "Kavya S.", "location": "Hyderabad", "rating": 5, "text": "Finally an SPF that doesn’t leave a white cast on Indian skin. Bought 3 already."},
    ],
}


# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------
def _slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9\s-]", "", (name or "").lower()).strip()
    s = re.sub(r"[\s-]+", "-", s)
    return s[:60] or f"agent-{uuid.uuid4().hex[:6]}"


def _hash_pw(plain: str) -> str:
    return hashlib.sha256(("celesta-agent::" + plain).encode()).hexdigest()


def _verify_pw(plain: str, hashed: str) -> bool:
    return _hash_pw(plain) == hashed


def _now():
    return datetime.now(timezone.utc).isoformat()


def _strip_mongo(doc: dict) -> dict:
    if not doc:
        return doc
    d = {k: v for k, v in doc.items() if k != "_id"}
    return d


# ---------------------------------------------------------------------------
# VALIDATION HELPERS
# ---------------------------------------------------------------------------
_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_CAROUSEL_IMAGES = 20
MAX_CAROUSEL_URL_LEN = 500
MAX_FAQS = 30


def _validate_iso_date(s: str, field: str) -> str:
    """Empty string passes (means 'no constraint'); else must be YYYY-MM-DD."""
    s = (s or "").strip()
    if not s:
        return ""
    if not _ISO_DATE_RE.match(s):
        raise HTTPException(400, f"{field} must be in YYYY-MM-DD format")
    try:
        datetime.strptime(s, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, f"{field} is not a valid calendar date")
    return s


def _validate_carousel_images(arr) -> list:
    if arr is None:
        return []
    if not isinstance(arr, list):
        raise HTTPException(400, "home_carousel_images must be an array of image URLs")
    if len(arr) > MAX_CAROUSEL_IMAGES:
        raise HTTPException(400, f"home_carousel_images cannot exceed {MAX_CAROUSEL_IMAGES} images")
    out = []
    for i, u in enumerate(arr):
        if u is None or u == "":
            continue
        if not isinstance(u, str):
            raise HTTPException(400, f"home_carousel_images[{i}] must be a string URL")
        if len(u) > MAX_CAROUSEL_URL_LEN:
            raise HTTPException(400, f"home_carousel_images[{i}] exceeds max URL length ({MAX_CAROUSEL_URL_LEN} chars)")
        out.append(u.strip())
    return out


def _validate_faqs(arr, field: str = "home_faqs") -> list:
    if arr is None:
        return []
    if not isinstance(arr, list):
        raise HTTPException(400, f"{field} must be an array of {{q, a}} objects")
    if len(arr) > MAX_FAQS:
        raise HTTPException(400, f"{field} cannot exceed {MAX_FAQS} entries")
    out = []
    for i, fq in enumerate(arr):
        if not isinstance(fq, dict):
            raise HTTPException(400, f"{field}[{i}] must be an object with q + a fields")
        q = (fq.get("q") or "").strip()[:500]
        a = (fq.get("a") or "").strip()[:2000]
        if not q and not a:
            continue
        out.append({"q": q, "a": a})
    return out


# ---------------------------------------------------------------------------
# MODULE ENTRY
# ---------------------------------------------------------------------------
def init_agent_store(db, get_current_user, JWT_SECRET, JWT_ALGORITHM, create_token_fn=None):
    """Create router and return it. Pass in shared deps from server.py."""
    import jwt as _jwt

    router = APIRouter(prefix="/api")

    # ---------- Agent token helpers ----------
    def _make_agent_token(agent_id: str, agent_slug: str) -> str:
        payload = {
            "sub": agent_id,
            "agent_id": agent_id,
            "agent_slug": agent_slug,
            "role": "store_agent",
            "exp": datetime.now(timezone.utc) + timedelta(days=30),
        }
        return _jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

    async def _get_agent(request: Request) -> dict:
        auth = request.headers.get("authorization") or ""
        if not auth.lower().startswith("bearer "):
            raise HTTPException(status_code=401, detail="Agent auth required")
        token = auth.split(" ", 1)[1].strip()
        try:
            payload = _jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid agent token")
        if payload.get("role") != "store_agent":
            raise HTTPException(status_code=401, detail="Not an agent token")
        ag = await db.store_agents.find_one({"id": payload.get("agent_id")})
        if not ag or not ag.get("active", True):
            raise HTTPException(status_code=401, detail="Agent not found / inactive")
        d = _strip_mongo(ag)
        d.pop("password_hash", None)
        return d

    # ---------- Settings + product seed ----------
    async def _ensure_seed():
        if not await db.store_settings.find_one({"_id": "store_settings"}):
            await db.store_settings.insert_one(dict(DEFAULT_STORE_SETTINGS))
        # Seed products if collection is empty (with sort_order)
        if await db.store_products.count_documents({}) == 0:
            for idx, p in enumerate(DEFAULT_PRODUCTS):
                await db.store_products.insert_one({**p, "sort_order": (idx + 1) * 10, "created_at": _now(), "updated_at": _now()})
            for idx, p in enumerate(DEFAULT_COMBOS):
                await db.store_products.insert_one({**p, "sort_order": (idx + 1) * 10, "created_at": _now(), "updated_at": _now()})
        # Backfill: assign sort_order to existing products that don't have one
        # Non-combos get 10/20/30/... in current name order; combos likewise.
        missing_noncombo = []
        async for p in db.store_products.find({"is_combo": False, "sort_order": {"$exists": False}}, {"_id": 0, "id": 1, "name": 1}).sort("name", 1):
            missing_noncombo.append(p)
        for idx, p in enumerate(missing_noncombo):
            await db.store_products.update_one({"id": p["id"]}, {"$set": {"sort_order": (idx + 1) * 10}})
        missing_combo = []
        async for p in db.store_products.find({"is_combo": True, "sort_order": {"$exists": False}}, {"_id": 0, "id": 1, "name": 1}).sort("name", 1):
            missing_combo.append(p)
        for idx, p in enumerate(missing_combo):
            await db.store_products.update_one({"id": p["id"]}, {"$set": {"sort_order": (idx + 1) * 10}})

    async def _get_settings() -> dict:
        await _ensure_seed()
        s = await db.store_settings.find_one({"_id": "store_settings"})
        return _strip_mongo(s) if s else dict(DEFAULT_STORE_SETTINGS)

    # ---------- Razorpay helpers ----------
    def _razorpay_client(settings):
        try:
            import razorpay
        except Exception:
            return None
        kid = (settings or {}).get("razorpay_key_id") or ""
        ksec = (settings or {}).get("razorpay_key_secret") or ""
        if not kid or not ksec:
            return None
        try:
            return razorpay.Client(auth=(kid, ksec))
        except Exception as e:
            logger.warning(f"razorpay client init failed: {e}")
            return None

    def _verify_rzp_signature(order_id: str, payment_id: str, signature: str, key_secret: str) -> bool:
        if not (order_id and payment_id and signature and key_secret):
            return False
        body = f"{order_id}|{payment_id}".encode()
        expected = hmac.new(key_secret.encode(), body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature)

    # ---------- Order -> existing CRM orders helper ----------
    async def _push_to_crm_orders(agent_order: dict):
        """When sales manager approves an agent order, mirror it into the existing
        `orders` collection so telecallers / shipping pipeline picks it up."""
        product_text = ", ".join(
            f"{it.get('name')} x{it.get('qty', 1)}" for it in (agent_order.get("items") or [])
        )
        crm_order = {
            "id": agent_order["id"],
            "source": "agent_store",
            "agent_id": agent_order.get("agent_id"),
            "agent_name": agent_order.get("agent_name"),
            "agent_slug": agent_order.get("agent_slug"),
            "customer_name": agent_order.get("customer_name"),
            "customer_phone": agent_order.get("customer_phone"),
            "customer_email": agent_order.get("customer_email"),
            "address": agent_order.get("address"),
            "city": agent_order.get("city"),
            "state": agent_order.get("state"),
            "pincode": agent_order.get("pincode"),
            "items": agent_order.get("items") or [],
            "products": product_text,
            "subtotal": agent_order.get("subtotal", 0),
            "discount": agent_order.get("discount", 0),
            "total": agent_order.get("total", 0),
            "amount": agent_order.get("total", 0),
            "payment_method": agent_order.get("payment_method", "cod"),
            "payment_status": agent_order.get("payment_status", "pending"),
            "status": "approved",
            "commission_amount": agent_order.get("commission_amount", 0),
            "commission_pct": agent_order.get("commission_pct", 10),
            "region": agent_order.get("region", ""),
            "manager_id": agent_order.get("sales_manager_id"),
            "created_at": agent_order.get("created_at", _now()),
            "approved_at": _now(),
        }
        await db.orders.update_one({"id": crm_order["id"]}, {"$set": crm_order}, upsert=True)
        # Inventory deduction: decrement stock for each item (combos deduct their parts too)
        try:
            for it in agent_order.get("items") or []:
                pid = it.get("id")
                qty = int(it.get("qty", 1)) or 1
                p = await db.store_products.find_one({"id": pid})
                if not p:
                    continue
                if p.get("is_combo") and p.get("combo_items"):
                    for child_id in p["combo_items"]:
                        await db.store_products.update_one(
                            {"id": child_id},
                            {"$inc": {"stock": -qty}}
                        )
                else:
                    await db.store_products.update_one(
                        {"id": pid},
                        {"$inc": {"stock": -qty}}
                    )
        except Exception as e:
            logger.warning(f"inventory deduction failed: {e}")
        # Expense / payout reservation: log commission as a reserved expense for HR visibility
        try:
            await db.expenses.update_one(
                {"id": "comm-" + agent_order["id"]},
                {"$set": {
                    "id": "comm-" + agent_order["id"],
                    "type": "agent_commission",
                    "agent_id": agent_order.get("agent_id"),
                    "agent_name": agent_order.get("agent_name"),
                    "order_id": agent_order["id"],
                    "amount": agent_order.get("commission_amount", 0),
                    "status": "reserved",
                    "category": "Sales / Agent Commission",
                    "description": f"Reserved commission for agent order {agent_order['id']}",
                    "created_at": _now(),
                }},
                upsert=True,
            )
        except Exception as e:
            logger.warning(f"commission expense log failed: {e}")

    # =========================================================================
    # PUBLIC STOREFRONT ENDPOINTS  (no auth)
    # =========================================================================
    @router.get("/store/{slug}/meta")
    async def store_meta(slug: str):
        await _ensure_seed()
        agent = await db.store_agents.find_one({"slug": slug, "active": True})
        if not agent:
            raise HTTPException(404, "Agent storefront not found")
        s = await _get_settings()
        # Hide secrets from public payload
        s.pop("razorpay_key_secret", None)
        return {
            "agent": {
                "id": agent["id"],
                "slug": agent["slug"],
                "name": agent["name"],
                "designation": agent.get("designation", "agent"),
            },
            "settings": s,
        }

    @router.get("/store/{slug}/products")
    async def store_products(slug: str):
        await _ensure_seed()
        agent = await db.store_agents.find_one({"slug": slug, "active": True})
        if not agent:
            raise HTTPException(404, "Agent storefront not found")
        items = []
        # Sort: non-combos first by sort_order ASC, then combos by sort_order ASC, then name
        async for p in db.store_products.find({"active": True}).sort([("is_combo", 1), ("sort_order", 1), ("name", 1)]):
            items.append(_strip_mongo(p))
        return {"products": items}

    @router.get("/store/{slug}/product/{product_slug}")
    async def store_product_detail(slug: str, product_slug: str):
        agent = await db.store_agents.find_one({"slug": slug, "active": True})
        if not agent:
            raise HTTPException(404, "Agent storefront not found")
        p = await db.store_products.find_one({"slug": product_slug, "active": True})
        if not p:
            raise HTTPException(404, "Product not found")
        return _strip_mongo(p)

    @router.post("/store/{slug}/order")
    async def store_place_order(slug: str, data: dict):
        agent = await db.store_agents.find_one({"slug": slug, "active": True})
        if not agent:
            raise HTTPException(404, "Agent storefront not found")
        items_in = data.get("items") or []
        if not items_in:
            raise HTTPException(400, "Cart is empty")

        # Resolve prices server-side
        resolved = []
        subtotal = 0
        for it in items_in:
            pid = it.get("id")
            qty = int(it.get("qty", 1)) or 1
            p = await db.store_products.find_one({"id": pid, "active": True})
            if not p:
                raise HTTPException(400, f"Product {pid} unavailable")
            price = int(p["price"])
            line_total = price * qty
            subtotal += line_total
            resolved.append({
                "id": p["id"],
                "name": p["name"],
                "slug": p["slug"],
                "image": p.get("image"),
                "price": price,
                "qty": qty,
                "total": line_total,
                "is_combo": bool(p.get("is_combo")),
            })

        discount = int(data.get("discount", 0) or 0)
        coupon_code = (data.get("coupon_code") or "").strip().upper()
        coupon_doc = None
        coupon_applied = False
        coupon_reason = ""
        if coupon_code:
            coupon_doc = await db.store_coupons.find_one({"code": coupon_code})
            if not coupon_doc:
                coupon_reason = "Invalid coupon code"
            else:
                res = evaluate_coupon(coupon_doc, subtotal)
                if res["ok"]:
                    discount = int(res["discount"])
                    coupon_applied = True
                else:
                    coupon_reason = res["reason"]
                    coupon_doc = None  # don't record code if not applied
        shipping = 0 if subtotal >= 999 else 79
        total = max(0, subtotal - discount) + shipping

        commission_pct = float(agent.get("commission_pct", 10))
        commission_amount = round((subtotal - discount) * commission_pct / 100, 2)

        oid = "ord-" + uuid.uuid4().hex[:10]
        payment_method = (data.get("payment_method") or "cod").lower()

        order_doc = {
            "id": oid,
            "agent_id": agent["id"],
            "agent_slug": agent["slug"],
            "agent_name": agent["name"],
            "sales_manager_id": agent.get("sales_manager_id"),
            "region": agent.get("region", ""),
            "customer_name": (data.get("customer_name") or "").strip(),
            "customer_phone": (data.get("customer_phone") or "").strip(),
            "customer_email": (data.get("customer_email") or "").strip(),
            "address": (data.get("address") or "").strip(),
            "locality": (data.get("locality") or "").strip(),
            "city": (data.get("city") or "").strip(),
            "state": (data.get("state") or "").strip(),
            "pincode": (data.get("pincode") or "").strip(),
            "items": resolved,
            "subtotal": subtotal,
            "discount": discount,
            "coupon_code": coupon_code if coupon_doc else "",
            "shipping": shipping,
            "total": total,
            "commission_pct": commission_pct,
            "commission_amount": commission_amount,
            "payment_method": payment_method,
            "payment_status": "pending",
            "status": "pending",   # pending -> sm_approved (-> mirrored into orders) -> shipped -> delivered
            "razorpay_order_id": "",
            "razorpay_payment_id": "",
            "created_at": _now(),
        }

        if not order_doc["customer_name"] or not order_doc["customer_phone"] or not order_doc["address"]:
            raise HTTPException(400, "Customer name, phone and address are required")

        # Razorpay path
        rzp_order = None
        if payment_method == "razorpay":
            settings = await _get_settings()
            full_settings = await db.store_settings.find_one({"_id": "store_settings"}) or {}
            client = _razorpay_client(full_settings)
            if not client:
                raise HTTPException(400, "Online payment is not configured. Please choose COD.")
            try:
                rzp_order = client.order.create({
                    "amount": int(total * 100),
                    "currency": "INR",
                    "receipt": oid[:40],
                    "payment_capture": 1,
                })
                order_doc["razorpay_order_id"] = rzp_order["id"]
            except Exception as e:
                logger.exception("razorpay order.create failed")
                raise HTTPException(502, f"Payment gateway error: {e}")

        await db.agent_orders.insert_one(order_doc)
        # Increment coupon usage count (after successful insert)
        if coupon_doc:
            try:
                await db.store_coupons.update_one({"id": coupon_doc["id"]}, {"$inc": {"used_count": 1}})
            except Exception as e:
                logger.warning(f"coupon usage increment failed: {e}")
        return {
            "order_id": oid,
            "total": total,
            "discount": discount,
            "coupon_code": coupon_code if coupon_doc else "",
            "coupon_applied": coupon_applied,
            "coupon_reason": coupon_reason,
            "razorpay": (
                {
                    "key_id": (await _get_settings()).get("razorpay_key_id", ""),
                    "order_id": rzp_order["id"],
                    "amount": int(total * 100),
                    "currency": "INR",
                }
                if rzp_order else None
            ),
        }

    @router.post("/store/{slug}/order/verify")
    async def store_verify_payment(slug: str, data: dict):
        oid = data.get("order_id")
        rzp_order_id = data.get("razorpay_order_id")
        rzp_payment_id = data.get("razorpay_payment_id")
        rzp_signature = data.get("razorpay_signature")
        if not all([oid, rzp_order_id, rzp_payment_id, rzp_signature]):
            raise HTTPException(400, "Missing payment fields")
        order = await db.agent_orders.find_one({"id": oid})
        if not order:
            raise HTTPException(404, "Order not found")
        full_settings = await db.store_settings.find_one({"_id": "store_settings"}) or {}
        ok = _verify_rzp_signature(rzp_order_id, rzp_payment_id, rzp_signature, full_settings.get("razorpay_key_secret", ""))
        if not ok:
            await db.agent_orders.update_one({"id": oid}, {"$set": {"payment_status": "failed"}})
            raise HTTPException(400, "Signature verification failed")
        await db.agent_orders.update_one(
            {"id": oid},
            {"$set": {"payment_status": "paid", "razorpay_payment_id": rzp_payment_id, "razorpay_signature": rzp_signature}}
        )
        return {"ok": True}

    @router.get("/store/{slug}/order/{oid}")
    async def store_order_status(slug: str, oid: str):
        order = await db.agent_orders.find_one({"id": oid, "agent_slug": slug})
        if not order:
            raise HTTPException(404, "Order not found")
        return _strip_mongo(order)

    # =========================================================================
    # AGENT-PORTAL ENDPOINTS (on the storefront — username + password)
    # =========================================================================
    @router.post("/store-agent/login")
    async def store_agent_login(data: dict):
        username = (data.get("username") or "").strip().lower()
        password = data.get("password") or ""
        if not username or not password:
            raise HTTPException(400, "Username and password required")
        agent = await db.store_agents.find_one({"username": username})
        if not agent or not agent.get("active", True):
            raise HTTPException(401, "Invalid credentials")
        if not _verify_pw(password, agent.get("password_hash", "")):
            raise HTTPException(401, "Invalid credentials")
        token = _make_agent_token(agent["id"], agent["slug"])
        return {
            "token": token,
            "agent": {
                "id": agent["id"], "name": agent["name"], "email": agent.get("email"),
                "phone": agent.get("phone"), "username": agent["username"], "slug": agent["slug"],
                "designation": agent.get("designation", "agent"), "commission_pct": agent.get("commission_pct", 10),
            },
        }

    @router.get("/store-agent/me")
    async def store_agent_me(agent=Depends(_get_agent)):
        return {"agent": agent}

    def _parse_date(s):
        try:
            return datetime.fromisoformat(s).replace(tzinfo=timezone.utc) if s else None
        except Exception:
            return None

    @router.get("/store-agent/stats")
    async def store_agent_stats(date_from: str = "", date_to: str = "", agent=Depends(_get_agent)):
        q = {"agent_id": agent["id"]}
        if date_from or date_to:
            rng = {}
            if date_from: rng["$gte"] = date_from
            if date_to: rng["$lte"] = date_to + "T23:59:59"
            q["created_at"] = rng
        total_orders = 0
        revenue = 0
        commission = 0
        by_status = {}
        async for o in db.agent_orders.find(q):
            total_orders += 1
            revenue += int(o.get("total", 0) or 0)
            commission += float(o.get("commission_amount", 0) or 0)
            st = o.get("status", "pending")
            by_status[st] = by_status.get(st, 0) + 1
        return {
            "total_orders": total_orders,
            "revenue": revenue,
            "commission": round(commission, 2),
            "by_status": by_status,
        }

    @router.get("/store-agent/orders")
    async def store_agent_orders(date_from: str = "", date_to: str = "", agent=Depends(_get_agent)):
        q = {"agent_id": agent["id"]}
        if date_from or date_to:
            rng = {}
            if date_from: rng["$gte"] = date_from
            if date_to: rng["$lte"] = date_to + "T23:59:59"
            q["created_at"] = rng
        out = []
        async for o in db.agent_orders.find(q).sort("created_at", -1):
            out.append(_strip_mongo(o))
        return {"orders": out}

    @router.get("/store-agent/customers")
    async def store_agent_customers(agent=Depends(_get_agent)):
        """Unique customer book (relationship tab)."""
        groups = {}
        async for o in db.agent_orders.find({"agent_id": agent["id"]}).sort("created_at", -1):
            key = (o.get("customer_phone") or o.get("customer_email") or "").strip()
            if not key:
                continue
            g = groups.setdefault(key, {
                "customer_name": o.get("customer_name"),
                "customer_phone": o.get("customer_phone"),
                "customer_email": o.get("customer_email"),
                "address": o.get("address"),
                "city": o.get("city"),
                "orders": [],
                "total_spent": 0,
                "last_order_at": o.get("created_at"),
                "first_order_at": o.get("created_at"),
            })
            g["orders"].append({
                "id": o["id"], "total": o.get("total", 0),
                "status": o.get("status"), "created_at": o.get("created_at"),
                "items": o.get("items", []),
            })
            g["total_spent"] += int(o.get("total", 0) or 0)
            g["first_order_at"] = o.get("created_at")  # since sorted desc, last loop iteration is oldest
        return {"customers": list(groups.values())}

    @router.post("/store-agent/repeat-order/{oid}")
    async def store_agent_repeat_order(oid: str, data: dict, agent=Depends(_get_agent)):
        src = await db.agent_orders.find_one({"id": oid, "agent_id": agent["id"]})
        if not src:
            raise HTTPException(404, "Order not found")
        new_oid = "ord-" + uuid.uuid4().hex[:10]
        new_doc = {
            **{k: v for k, v in src.items() if k != "_id"},
            "id": new_oid,
            "status": "pending",
            "payment_status": "pending",
            "payment_method": (data.get("payment_method") or src.get("payment_method", "cod")),
            "razorpay_order_id": "",
            "razorpay_payment_id": "",
            "created_at": _now(),
            "parent_order_id": oid,
            "repeat_order": True,
        }
        await db.agent_orders.insert_one(new_doc)
        return {"order_id": new_oid}

    # =========================================================================
    # SALES MANAGER — AGENT MANAGEMENT
    # =========================================================================
    def _ensure_sales_manager(user):
        if user.get("role") not in ("sales_manager", "admin"):
            raise HTTPException(403, "Sales Manager / Admin only")

    @router.get("/sales-manager/agents")
    async def sm_list_agents(window: str = "all", current_user: dict = Depends(get_current_user)):
        """`window` ∈ today | last7 | last30 | month | all — adds *_window stats per agent."""
        _ensure_sales_manager(current_user)
        q = {} if current_user.get("role") == "admin" else {"sales_manager_id": current_user.get("id")}

        # Public base URL for storefront links
        settings = await _get_settings()
        pub_base = (settings.get("public_base_url") or "https://software.celestaglow.com").rstrip("/")

        # Date window range
        now = datetime.now(timezone.utc)
        if window == "today":
            since = now.replace(hour=0, minute=0, second=0, microsecond=0)
        elif window == "last7":
            since = now - timedelta(days=7)
        elif window == "last30":
            since = now - timedelta(days=30)
        elif window == "month":
            since = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        else:
            since = None

        out = []
        async for a in db.store_agents.find(q).sort("created_at", -1):
            d = _strip_mongo(a)
            d.pop("password_hash", None)
            d["store_url"] = f"{pub_base}/store/{d.get('slug','')}"
            d["agent_portal_url"] = f"{pub_base}/store/{d.get('slug','')}/agent-login"
            if a.get("store_url") != d["store_url"]:
                await db.store_agents.update_one({"id": d["id"]}, {"$set": {"store_url": d["store_url"], "agent_portal_url": d["agent_portal_url"]}})
            # All-time stats
            orders_q = {"agent_id": d["id"]}
            tot = await db.agent_orders.count_documents(orders_q)
            rev_doc = await db.agent_orders.aggregate([
                {"$match": orders_q},
                {"$group": {"_id": None, "rev": {"$sum": "$total"}, "comm": {"$sum": "$commission_amount"}}}
            ]).to_list(1)
            d["total_orders"] = tot
            d["total_revenue"] = (rev_doc[0]["rev"] if rev_doc else 0) or 0
            d["total_commission"] = round(((rev_doc[0]["comm"] if rev_doc else 0) or 0), 2)
            # Windowed stats
            if since is not None:
                wq = {"agent_id": d["id"], "created_at": {"$gte": since.isoformat()}}
                w_tot = await db.agent_orders.count_documents(wq)
                w_rev = await db.agent_orders.aggregate([
                    {"$match": wq},
                    {"$group": {"_id": None, "rev": {"$sum": "$total"}, "comm": {"$sum": "$commission_amount"}}}
                ]).to_list(1)
                d["window_orders"] = w_tot
                d["window_revenue"] = (w_rev[0]["rev"] if w_rev else 0) or 0
                d["window_commission"] = round(((w_rev[0]["comm"] if w_rev else 0) or 0), 2)
            else:
                d["window_orders"] = d["total_orders"]
                d["window_revenue"] = d["total_revenue"]
                d["window_commission"] = d["total_commission"]
            out.append(d)

        # Aggregate totals
        agent_ids = [d["id"] for d in out]
        all_q = {"agent_id": {"$in": agent_ids}}
        if since is not None:
            all_q["created_at"] = {"$gte": since.isoformat()}
        totals = await db.agent_orders.aggregate([
            {"$match": all_q},
            {"$group": {"_id": "$status", "rev": {"$sum": "$total"}, "comm": {"$sum": "$commission_amount"}, "cnt": {"$sum": 1}}}
        ]).to_list(50)
        summary = {
            "total_agents": len(out),
            "total_orders": sum(t["cnt"] for t in totals),
            "total_revenue": sum(t["rev"] for t in totals) or 0,
            "total_commission": round(sum(t["comm"] for t in totals) or 0, 2),
            "by_status": {t["_id"]: t["cnt"] for t in totals},
        }
        return {"agents": out, "summary": summary, "window": window}

    @router.post("/sales-manager/agents")
    async def sm_create_agent(data: dict, current_user: dict = Depends(get_current_user)):
        _ensure_sales_manager(current_user)
        name = (data.get("name") or "").strip()
        phone = (data.get("phone") or "").strip()
        email = (data.get("email") or "").strip().lower()
        designation = (data.get("designation") or "agent").lower()
        commission_pct = float(data.get("commission_pct", 10) or 10)
        region = (data.get("region") or current_user.get("region") or "").strip()
        gpay_number = (data.get("gpay_number") or "").strip()
        custom_username = (data.get("username") or "").strip().lower()
        custom_password = (data.get("password") or "").strip()

        if designation not in ("influencer", "dealer", "agent"):
            raise HTTPException(400, "Designation must be one of influencer / dealer / agent")
        if not name or not phone:
            raise HTTPException(400, "Name and phone required")

        # unique slug
        base = _slugify(name) or "agent"
        slug = base
        i = 1
        while await db.store_agents.find_one({"slug": slug}):
            i += 1
            slug = f"{base}-{i}"

        # username: prefer custom (must be unique), else slug-based (auto-resolves)
        if custom_username:
            if await db.store_agents.find_one({"username": custom_username}):
                raise HTTPException(400, f"Username '{custom_username}' already taken")
            username = custom_username
        else:
            username = slug
        plain_pw = custom_password or secrets.token_urlsafe(6)
        agent_id = "ag-" + uuid.uuid4().hex[:10]

        doc = {
            "id": agent_id,
            "name": name,
            "phone": phone,
            "email": email,
            "designation": designation,
            "commission_pct": commission_pct,
            "slug": slug,
            "username": username,
            "password_hash": _hash_pw(plain_pw),
            "sales_manager_id": current_user.get("id"),
            "sales_manager_name": current_user.get("name"),
            "region": region,
            "gpay_number": gpay_number,
            "active": True,
            "wallet_balance": 0.0,  # paid out commission balance
            "created_at": _now(),
        }
        await db.store_agents.insert_one(doc)

        # Sync to HR employees collection as an external agent record (visible to HR for salary processing)
        try:
            await db.hr_external_agents.update_one(
                {"agent_id": agent_id},
                {"$set": {
                    "agent_id": agent_id,
                    "name": name,
                    "phone": phone,
                    "email": email,
                    "gpay_number": gpay_number,
                    "designation": designation,
                    "commission_pct": commission_pct,
                    "sales_manager_id": current_user.get("id"),
                    "sales_manager_name": current_user.get("name"),
                    "region": region,
                    "type": "external_agent",
                    "active": True,
                    "created_at": _now(),
                }},
                upsert=True,
            )
        except Exception as e:
            logger.warning(f"hr_external_agents sync failed: {e}")

        resp_doc = {k: v for k, v in doc.items() if k not in ("password_hash", "_id")}
        # Build public URLs with configured public_base_url (default celestaglow.com)
        settings = await _get_settings()
        pub_base = (settings.get("public_base_url") or "https://software.celestaglow.com").rstrip("/")
        return {
            "agent": {**resp_doc,
                      "initial_password": plain_pw,
                      "store_url": f"{pub_base}/store/{slug}",
                      "agent_portal_url": f"{pub_base}/store/{slug}/agent-login"},
        }

    @router.patch("/sales-manager/agents/{aid}")
    async def sm_update_agent(aid: str, data: dict, current_user: dict = Depends(get_current_user)):
        _ensure_sales_manager(current_user)
        agent = await db.store_agents.find_one({"id": aid})
        if not agent: raise HTTPException(404, "Agent not found")
        if current_user.get("role") != "admin" and agent.get("sales_manager_id") != current_user.get("id"):
            raise HTTPException(403, "Not your agent")
        updates = {}
        for k in ("name", "phone", "email", "designation", "region", "active", "gpay_number"):
            if k in data: updates[k] = data[k]
        if "commission_pct" in data: updates["commission_pct"] = float(data["commission_pct"])
        if data.get("new_password"):
            updates["password_hash"] = _hash_pw(data["new_password"])
        if data.get("username"):
            new_u = data["username"].strip().lower()
            exists = await db.store_agents.find_one({"username": new_u, "id": {"$ne": aid}})
            if exists: raise HTTPException(400, "Username already taken")
            updates["username"] = new_u
        if updates:
            updates["updated_at"] = _now()
            await db.store_agents.update_one({"id": aid}, {"$set": updates})
            # Sync HR record
            hr_updates = {k: v for k, v in updates.items() if k in ("name", "phone", "email", "designation", "region", "active", "gpay_number", "commission_pct")}
            if hr_updates:
                await db.hr_external_agents.update_one({"agent_id": aid}, {"$set": hr_updates})
        return {"ok": True}

    @router.delete("/sales-manager/agents/{aid}")
    async def sm_delete_agent(aid: str, current_user: dict = Depends(get_current_user)):
        _ensure_sales_manager(current_user)
        agent = await db.store_agents.find_one({"id": aid})
        if not agent: raise HTTPException(404, "Agent not found")
        if current_user.get("role") != "admin" and agent.get("sales_manager_id") != current_user.get("id"):
            raise HTTPException(403, "Not your agent")
        await db.store_agents.update_one({"id": aid}, {"$set": {"active": False, "deleted_at": _now()}})
        return {"ok": True}

    # =========================================================================
    # AGENT WITHDRAW REQUESTS  (agent submits → HR processes)
    # =========================================================================
    @router.post("/store-agent/withdraw-request")
    async def agent_create_withdraw(data: dict, agent=Depends(_get_agent)):
        amount = float(data.get("amount", 0) or 0)
        if amount <= 0:
            raise HTTPException(400, "Amount must be > 0")
        # Sum approved-pending commission earned vs already paid + approved (locked)
        comm_doc = await db.agent_orders.aggregate([
            {"$match": {"agent_id": agent["id"], "status": {"$in": ["sm_approved", "shipped", "delivered"]}}},
            {"$group": {"_id": None, "comm": {"$sum": "$commission_amount"}}}
        ]).to_list(1)
        earned = float(comm_doc[0]["comm"] if comm_doc else 0)
        locked_doc = await db.withdraw_requests.aggregate([
            {"$match": {"agent_id": agent["id"], "status": {"$in": ["paid", "approved"]}}},
            {"$group": {"_id": None, "amt": {"$sum": "$amount"}}}
        ]).to_list(1)
        locked = float(locked_doc[0]["amt"] if locked_doc else 0)
        pending_doc = await db.withdraw_requests.aggregate([
            {"$match": {"agent_id": agent["id"], "status": "pending"}},
            {"$group": {"_id": None, "amt": {"$sum": "$amount"}}}
        ]).to_list(1)
        pending = float(pending_doc[0]["amt"] if pending_doc else 0)
        available = earned - locked - pending
        if amount > available:
            raise HTTPException(400, f"Requested ₹{amount:.2f} exceeds available balance ₹{available:.2f}")
        wid = "wd-" + uuid.uuid4().hex[:10]
        doc = {
            "id": wid,
            "agent_id": agent["id"],
            "agent_name": agent["name"],
            "agent_phone": agent.get("phone"),
            "agent_email": agent.get("email"),
            "gpay_number": agent.get("gpay_number", ""),
            "sales_manager_id": agent.get("sales_manager_id"),
            "amount": amount,
            "method": (data.get("method") or "gpay").lower(),
            "note": (data.get("note") or "").strip(),
            "status": "pending",  # pending -> approved -> paid (or rejected)
            "created_at": _now(),
        }
        await db.withdraw_requests.insert_one(doc)
        return {"request": {k: v for k, v in doc.items() if k != "_id"}}

    @router.get("/store-agent/withdraw-requests")
    async def agent_list_withdraws(agent=Depends(_get_agent)):
        out = []
        async for r in db.withdraw_requests.find({"agent_id": agent["id"]}).sort("created_at", -1):
            out.append(_strip_mongo(r))
        # Available balance (locks both 'approved' and 'paid' withdraws)
        comm_doc = await db.agent_orders.aggregate([
            {"$match": {"agent_id": agent["id"], "status": {"$in": ["sm_approved", "shipped", "delivered"]}}},
            {"$group": {"_id": None, "comm": {"$sum": "$commission_amount"}}}
        ]).to_list(1)
        earned = float(comm_doc[0]["comm"] if comm_doc else 0)
        paid_doc = await db.withdraw_requests.aggregate([
            {"$match": {"agent_id": agent["id"], "status": "paid"}},
            {"$group": {"_id": None, "amt": {"$sum": "$amount"}}}
        ]).to_list(1)
        paid = float(paid_doc[0]["amt"] if paid_doc else 0)
        approved_doc = await db.withdraw_requests.aggregate([
            {"$match": {"agent_id": agent["id"], "status": "approved"}},
            {"$group": {"_id": None, "amt": {"$sum": "$amount"}}}
        ]).to_list(1)
        approved_locked = float(approved_doc[0]["amt"] if approved_doc else 0)
        pending_doc = await db.withdraw_requests.aggregate([
            {"$match": {"agent_id": agent["id"], "status": "pending"}},
            {"$group": {"_id": None, "amt": {"$sum": "$amount"}}}
        ]).to_list(1)
        pending = float(pending_doc[0]["amt"] if pending_doc else 0)
        return {
            "requests": out,
            "balance": {
                "earned": round(earned, 2),
                "paid": round(paid, 2),
                "pending": round(pending + approved_locked, 2),  # pending = unprocessed + approved-but-not-paid
                "available": round(earned - paid - approved_locked - pending, 2),
            },
        }

    # HR / Admin / Finance: list ALL withdraw requests + approve/reject/mark-paid
    @router.get("/hr/withdraw-requests")
    async def hr_list_withdraws(status: str = "", current_user: dict = Depends(get_current_user)):
        if current_user.get("role") not in ("admin", "hr_manager", "finance_manager"):
            raise HTTPException(403, "HR / Admin / Finance only")
        q = {}
        if status: q["status"] = status
        out = []
        async for r in db.withdraw_requests.find(q).sort("created_at", -1):
            out.append(_strip_mongo(r))
        return {"requests": out}

    # Sales Manager: list their agents' withdraw requests (read-only)
    @router.get("/sales-manager/withdraw-requests")
    async def sm_list_withdraws(status: str = "", current_user: dict = Depends(get_current_user)):
        _ensure_sales_manager(current_user)
        q = {}
        if current_user.get("role") != "admin":
            # only requests from this SM's agents
            agent_ids = [a["id"] async for a in db.store_agents.find({"sales_manager_id": current_user.get("id")})]
            q["agent_id"] = {"$in": agent_ids}
        if status: q["status"] = status
        out = []
        async for r in db.withdraw_requests.find(q).sort("created_at", -1):
            out.append(_strip_mongo(r))
        return {"requests": out}

    @router.post("/hr/withdraw-requests/{wid}/{action}")
    async def hr_process_withdraw(wid: str, action: str, data: dict = None,
                                   current_user: dict = Depends(get_current_user)):
        if current_user.get("role") not in ("admin", "hr_manager", "finance_manager"):
            raise HTTPException(403, "HR / Admin / Finance only")
        if action not in ("approve", "reject", "paid"):
            raise HTTPException(400, "Invalid action")
        wr = await db.withdraw_requests.find_one({"id": wid})
        if not wr: raise HTTPException(404, "Request not found")
        status_map = {"approve": "approved", "reject": "rejected", "paid": "paid"}
        updates = {"status": status_map[action],
                   f"{status_map[action]}_at": _now(),
                   f"{status_map[action]}_by": current_user.get("id")}
        if action == "reject" and data and data.get("reason"):
            updates["rejection_reason"] = data["reason"]
        if action == "paid" and data and data.get("transaction_ref"):
            updates["transaction_ref"] = data["transaction_ref"]
        await db.withdraw_requests.update_one({"id": wid}, {"$set": updates})
        # When marked paid → log into expenses
        if action == "paid":
            try:
                await db.expenses.update_one(
                    {"id": "wd-" + wid},
                    {"$set": {
                        "id": "wd-" + wid,
                        "type": "agent_payout",
                        "agent_id": wr.get("agent_id"),
                        "agent_name": wr.get("agent_name"),
                        "withdraw_id": wid,
                        "amount": wr.get("amount", 0),
                        "method": wr.get("method"),
                        "gpay_number": wr.get("gpay_number"),
                        "transaction_ref": updates.get("transaction_ref", ""),
                        "category": "Agent Payout",
                        "description": f"Commission payout to {wr.get('agent_name')} via {wr.get('method','').upper()}",
                        "paid_by": current_user.get("id"),
                        "paid_at": _now(),
                        "status": "paid",
                        "created_at": _now(),
                    }},
                    upsert=True,
                )
            except Exception as e:
                logger.warning(f"expense log failed for withdraw {wid}: {e}")
        return {"ok": True}

    # =========================================================================
    # CUSTOMER TRACK ORDER  (no auth — by phone + optional order id)
    # =========================================================================
    @router.post("/store/track-order")
    async def track_order(data: dict):
        phone = (data.get("phone") or "").strip()
        oid = (data.get("order_id") or "").strip()
        if not phone:
            raise HTTPException(400, "Phone number required")
        q = {"customer_phone": phone}
        if oid: q["id"] = oid
        out = []
        async for o in db.agent_orders.find(q).sort("created_at", -1).limit(20):
            d = _strip_mongo(o)
            # Hide commission from public response
            d.pop("commission_amount", None)
            d.pop("commission_pct", None)
            # Pull AWB / shipping if available from the crm orders mirror
            crm = await db.orders.find_one({"id": d["id"]})
            if crm:
                for k in ("awb", "courier", "tracking_url", "shipping_status", "delivered_at"):
                    if crm.get(k): d[k] = crm[k]
            out.append(d)
        if not out:
            return {"orders": [], "message": "No orders found for this phone number."}
        return {"orders": out}

    # =========================================================================
    # PRODUCT FREQUENCY for agent (most ordered products)
    # =========================================================================
    @router.get("/store-agent/product-stats")
    async def agent_product_stats(agent=Depends(_get_agent)):
        pipeline = [
            {"$match": {"agent_id": agent["id"]}},
            {"$unwind": "$items"},
            {"$group": {
                "_id": {"id": "$items.id", "name": "$items.name", "image": "$items.image"},
                "qty": {"$sum": "$items.qty"},
                "revenue": {"$sum": "$items.total"},
                "orders": {"$sum": 1}
            }},
            {"$sort": {"qty": -1}}
        ]
        out = []
        async for r in db.agent_orders.aggregate(pipeline):
            out.append({**r["_id"], "qty": r["qty"], "revenue": r["revenue"], "orders": r["orders"]})
        return {"products": out}

    # =========================================================================
    # SALES MANAGER — AGENT-ORDER REVIEW QUEUE
    # =========================================================================
    @router.get("/sales-manager/agent-orders")
    async def sm_list_agent_orders(status: str = "", date_from: str = "", date_to: str = "",
                                   current_user: dict = Depends(get_current_user)):
        _ensure_sales_manager(current_user)
        q = {}
        if current_user.get("role") != "admin":
            q["sales_manager_id"] = current_user.get("id")
        if status: q["status"] = status
        if date_from or date_to:
            rng = {}
            if date_from: rng["$gte"] = date_from
            if date_to: rng["$lte"] = date_to + "T23:59:59"
            q["created_at"] = rng
        out = []
        async for o in db.agent_orders.find(q).sort("created_at", -1):
            out.append(_strip_mongo(o))
        return {"orders": out}

    @router.post("/sales-manager/agent-orders/{oid}/approve")
    async def sm_approve_agent_order(oid: str, current_user: dict = Depends(get_current_user)):
        _ensure_sales_manager(current_user)
        order = await db.agent_orders.find_one({"id": oid})
        if not order: raise HTTPException(404, "Order not found")
        if current_user.get("role") != "admin" and order.get("sales_manager_id") != current_user.get("id"):
            raise HTTPException(403, "Not your agent's order")
        # Idempotency: only deduct inventory / log expense if status is still pending
        already_processed = order.get("status") in ("sm_approved", "shipped", "delivered")
        await db.agent_orders.update_one(
            {"id": oid},
            {"$set": {"status": "sm_approved", "approved_at": _now(), "approved_by": current_user.get("id")}}
        )
        order["status"] = "sm_approved"
        if not already_processed:
            await _push_to_crm_orders(order)
        return {"ok": True, "deducted_inventory": not already_processed}

    @router.post("/sales-manager/agent-orders/{oid}/reject")
    async def sm_reject_agent_order(oid: str, data: dict, current_user: dict = Depends(get_current_user)):
        _ensure_sales_manager(current_user)
        order = await db.agent_orders.find_one({"id": oid})
        if not order: raise HTTPException(404, "Order not found")
        if current_user.get("role") != "admin" and order.get("sales_manager_id") != current_user.get("id"):
            raise HTTPException(403, "Not your agent's order")
        await db.agent_orders.update_one(
            {"id": oid},
            {"$set": {"status": "rejected", "rejected_at": _now(),
                      "rejection_reason": (data or {}).get("reason", "")}}
        )
        return {"ok": True}


    # =========================================================================
    # WIRE-IN: extracted store modules (coupons, hr_agents, store_admin)
    # =========================================================================
    def _ensure_admin(user):
        if user.get("role") != "admin":
            raise HTTPException(403, "Admin only")

    helpers = {
        "now": _now,
        "strip_mongo": _strip_mongo,
        "slugify": _slugify,
        "ensure_admin": _ensure_admin,
        "ensure_seed": _ensure_seed,
        "validate_iso_date": _validate_iso_date,
        "validate_carousel_images": _validate_carousel_images,
        "validate_faqs": _validate_faqs,
        "DEFAULT_STORE_SETTINGS": DEFAULT_STORE_SETTINGS,
    }
    register_coupons(router, db, get_current_user, helpers)
    register_hr_agents(router, db, get_current_user, helpers)
    register_store_admin(router, db, get_current_user, helpers)

    return router
