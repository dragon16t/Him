"""Admin store settings + product CRUD + admin image upload.
Mirrors the inline behavior from agent_store.py exactly:
  - settings PUT validates carousel/FAQs/public_base_url
  - settings GET masks razorpay_key_secret
  - product CRUD generates unique slug (c-/p- prefix by combo flag)
  - upload endpoint at /admin/upload (5 MB cap, jpg/png/webp/gif/avif)
  - includes admin_list_all_agents at /admin/store/agents
"""
import uuid
import os
import pathlib

from fastapi import HTTPException, Depends, UploadFile, File


def register(router, db, get_current_user, helpers):
    now = helpers["now"]
    strip_mongo = helpers["strip_mongo"]
    ensure_admin = helpers["ensure_admin"]
    ensure_admin_or_sm = helpers.get("ensure_admin_or_sm", ensure_admin)
    slugify = helpers["slugify"]
    ensure_seed = helpers["ensure_seed"]
    validate_carousel_images = helpers["validate_carousel_images"]
    validate_faqs = helpers["validate_faqs"]
    DEFAULT_STORE_SETTINGS = helpers["DEFAULT_STORE_SETTINGS"]

    # ------------------------------------------------------------- STORE SETTINGS
    @router.get("/admin/store/settings")
    async def admin_get_store_settings(current_user: dict = Depends(get_current_user)):
        ensure_admin(current_user)
        s = await db.store_settings.find_one({"_id": "store_settings"}) or dict(DEFAULT_STORE_SETTINGS)
        out = strip_mongo(s)
        # Mask secret for display
        if out.get("razorpay_key_secret"):
            out["razorpay_key_secret_masked"] = "•" * 8 + out["razorpay_key_secret"][-4:]
            out["razorpay_key_secret"] = ""
        return {"settings": out}

    @router.put("/admin/store/settings")
    async def admin_update_store_settings(data: dict, current_user: dict = Depends(get_current_user)):
        ensure_admin(current_user)
        allowed = {"razorpay_key_id", "razorpay_key_secret", "razorpay_enabled", "cod_enabled",
                   "hero_title", "hero_title_accent", "hero_subtitle", "hero_cta", "hero_image",
                   "announcement_bar", "trust_badges", "offer_banner", "founder_note", "testimonials",
                   "home_carousel_images", "home_faqs", "product_faqs", "public_base_url",
                   "bottom_banner_image", "bottom_banner_caption", "banners", "banners_enabled"}
        updates = {k: v for k, v in (data or {}).items() if k in allowed}
        # Don't overwrite the secret with empty string
        if "razorpay_key_secret" in updates and not updates["razorpay_key_secret"]:
            updates.pop("razorpay_key_secret")
        if "home_carousel_images" in updates:
            updates["home_carousel_images"] = validate_carousel_images(updates["home_carousel_images"])
        if "banners" in updates:
            # Accept array of {image, link?} OR plain URLs; clamp to 10 entries
            raw = updates["banners"] or []
            if not isinstance(raw, list):
                raise HTTPException(400, "banners must be an array")
            out = []
            for b in raw[:10]:
                if isinstance(b, str) and b.strip():
                    out.append({"image": b.strip()[:500], "link": ""})
                elif isinstance(b, dict) and b.get("image"):
                    out.append({"image": str(b["image"])[:500], "link": str(b.get("link", ""))[:300]})
            updates["banners"] = out
        if "home_faqs" in updates:
            updates["home_faqs"] = validate_faqs(updates["home_faqs"], "home_faqs")
        if "product_faqs" in updates:
            updates["product_faqs"] = validate_faqs(updates["product_faqs"], "product_faqs")
        if "public_base_url" in updates:
            url = (updates["public_base_url"] or "").strip().rstrip("/")
            if url and not (url.startswith("http://") or url.startswith("https://")):
                raise HTTPException(400, "public_base_url must start with http:// or https://")
            updates["public_base_url"] = url
        if "bottom_banner_image" in updates:
            v = (updates["bottom_banner_image"] or "").strip()
            if v and len(v) > 500:
                raise HTTPException(400, "bottom_banner_image URL must be ≤ 500 chars")
            updates["bottom_banner_image"] = v
        if "bottom_banner_caption" in updates:
            updates["bottom_banner_caption"] = (updates["bottom_banner_caption"] or "").strip()[:300]
        if updates:
            await db.store_settings.update_one(
                {"_id": "store_settings"},
                {"$set": {**updates, "updated_at": now()}},
                upsert=True,
            )
        return {"ok": True}

    # ------------------------------------------------------------- PRODUCT CRUD
    @router.get("/admin/store/products")
    async def admin_list_products(current_user: dict = Depends(get_current_user)):
        ensure_admin_or_sm(current_user)
        await ensure_seed()
        out = []
        async for p in db.store_products.find().sort([("is_combo", 1), ("sort_order", 1), ("name", 1)]):
            out.append(strip_mongo(p))
        return {"products": out}

    @router.post("/admin/store/products")
    async def admin_create_product(data: dict, current_user: dict = Depends(get_current_user)):
        ensure_admin_or_sm(current_user)
        name = (data.get("name") or "").strip()
        if not name:
            raise HTTPException(400, "Name is required")
        slug_base = slugify(name)
        slug = slug_base
        i = 1
        while await db.store_products.find_one({"slug": slug}):
            i += 1
            slug = f"{slug_base}-{i}"
        is_combo = bool(data.get("is_combo"))
        doc = {
            "id": ("c-" if is_combo else "p-") + uuid.uuid4().hex[:8],
            "slug": slug,
            "name": name,
            "tagline": data.get("tagline", ""),
            "short_desc": data.get("short_desc", ""),
            "long_desc": data.get("long_desc", ""),
            "ingredients": data.get("ingredients") or [],
            "how_to_use": data.get("how_to_use", ""),
            "benefits": data.get("benefits") or [],
            "price": int(data.get("price", 0) or 0),
            "mrp": int(data.get("mrp", 0) or 0),
            "image": data.get("image", ""),
            "card_image": data.get("card_image", ""),
            "home_image": data.get("home_image", ""),
            "gallery": data.get("gallery") or [],
            "badges": data.get("badges") or [],
            "size": data.get("size", ""),
            "faqs": data.get("faqs") or [],
            "is_combo": is_combo,
            "combo_items": data.get("combo_items") or [],
            "stock": int(data.get("stock", 100) or 100),
            "active": bool(data.get("active", True)),
            "rating": float(data.get("rating", 4.8) or 4.8),
            "review_count": int(data.get("review_count", 0) or 0),
            "sort_order": int(data.get("sort_order", 999) or 999),
            "created_at": now(),
            "updated_at": now(),
        }
        await db.store_products.insert_one(doc)
        return {"product": {k: v for k, v in doc.items() if k != "_id"}}

    @router.put("/admin/store/products/{pid}")
    async def admin_update_product(pid: str, data: dict, current_user: dict = Depends(get_current_user)):
        ensure_admin_or_sm(current_user)
        # STRICT: only include fields the client actually sent AND that are non-empty.
        # Historically, sending image="" / gallery=[] would wipe the product image
        # when the SM was just tweaking price. Now we skip empty-string / empty-list
        # image fields entirely so the existing images are preserved.
        allowed = {"name", "tagline", "short_desc", "long_desc", "ingredients", "how_to_use", "benefits",
                   "price", "mrp", "image", "card_image", "home_image", "gallery", "badges", "size", "faqs", "is_combo", "combo_items",
                   "stock", "active", "rating", "review_count", "sort_order"}
        _skip_if_empty = {"image", "card_image", "home_image", "gallery", "badges", "faqs"}
        updates = {}
        for k, v in (data or {}).items():
            if k not in allowed: continue
            # Skip empty image/gallery/faq updates so we don't wipe existing values on partial edits.
            if k in _skip_if_empty and (v is None or v == "" or v == []):
                continue
            updates[k] = v
        if "price" in updates: updates["price"] = int(updates["price"] or 0)
        if "mrp" in updates: updates["mrp"] = int(updates["mrp"] or 0)
        if "stock" in updates: updates["stock"] = int(updates["stock"] or 0)
        if "sort_order" in updates: updates["sort_order"] = int(updates["sort_order"] or 999)
        if updates:
            updates["updated_at"] = now()
            await db.store_products.update_one({"id": pid}, {"$set": updates})
        return {"ok": True, "updated_fields": list(updates.keys())}

    @router.delete("/admin/store/products/{pid}")
    async def admin_delete_product(pid: str, current_user: dict = Depends(get_current_user)):
        # Delete stays admin-only — SMs can edit but should not be able to permanently
        # remove products from the catalog.
        ensure_admin(current_user)
        await db.store_products.delete_one({"id": pid})
        return {"ok": True}

    @router.get("/admin/store/agents")
    async def admin_list_all_agents(current_user: dict = Depends(get_current_user)):
        ensure_admin(current_user)
        out = []
        async for a in db.store_agents.find().sort("created_at", -1):
            d = strip_mongo(a)
            d.pop("password_hash", None)
            out.append(d)
        return {"agents": out}

    # ------------------------------------------------------------- IMAGE UPLOAD
    # Images are persisted in MongoDB (GridFS-style — stored as binary in the
    # `uploaded_images` collection) so they survive container restarts and
    # deployments. Local filesystem storage was lost every pod restart.
    @router.post("/admin/upload")
    async def admin_upload_image(
        file: UploadFile = File(...),
        current_user: dict = Depends(get_current_user),
    ):
        ensure_admin(current_user)
        allowed = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}
        ext = os.path.splitext(file.filename or "")[1].lower()
        if ext not in allowed:
            raise HTTPException(400, f"File type {ext} not allowed. Use JPG/PNG/WEBP/GIF/AVIF.")
        data = await file.read()
        if len(data) > 5 * 1024 * 1024:
            raise HTTPException(400, "Image must be smaller than 5 MB")
        from datetime import datetime, timezone
        import base64
        safe_name = f"img-{uuid.uuid4().hex[:12]}{ext}"
        content_type = {
            ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
            ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif",
        }.get(ext, "application/octet-stream")
        # Store binary in MongoDB so it survives pod restarts.
        await db.uploaded_images.insert_one({
            "filename": safe_name,
            "content_type": content_type,
            "data": data,
            "size": len(data),
            "uploaded_by": current_user["id"],
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
        })
        # Also persist to local /uploads as a cache (faster reads while pod alive).
        try:
            uploads_dir = pathlib.Path(__file__).parent.parent / "uploads"
            uploads_dir.mkdir(parents=True, exist_ok=True)
            with open(uploads_dir / safe_name, "wb") as f:
                f.write(data)
        except Exception:
            pass
        return {"url": f"/api/uploads/{safe_name}", "filename": safe_name, "size": len(data)}
