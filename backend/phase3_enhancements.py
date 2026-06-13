"""Phase 3 enhancements (May 2026)
- Finance payment-proof storage with grouping/listing/download
- Multi-image upload helper for products/combos
- Attendance 5:30 PM unlock + late-attendance helpers
- Smart budgeting calendar (payment-reminder + planned payments)
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, List
import uuid
import base64
import os
import pathlib

from fastapi import HTTPException, Depends, UploadFile, File


def register_phase3(api_router, db, get_current_user, log_audit, logger):

    UPLOADS_DIR = pathlib.Path(__file__).parent / "uploads"
    UPLOADS_DIR.mkdir(exist_ok=True)
    FINANCE_DIR = UPLOADS_DIR / "finance_proofs"
    FINANCE_DIR.mkdir(exist_ok=True)
    PRODUCT_DIR = UPLOADS_DIR / "product_images"
    PRODUCT_DIR.mkdir(exist_ok=True)

    # ---------- Finance Proofs ----------
    @api_router.post("/finance/proofs/upload")
    async def upload_finance_proof(
        file: UploadFile = File(...),
        current_user: dict = Depends(get_current_user),
    ):
        """Upload a payment proof / bill / receipt. Stored on disk + indexed in DB."""
        if current_user['role'] not in ('admin', 'finance_manager'):
            raise HTTPException(status_code=403)
        if file.content_type not in ("image/jpeg", "image/png", "image/webp", "application/pdf"):
            raise HTTPException(status_code=400, detail="Only JPG/PNG/WEBP/PDF allowed")
        contents = await file.read()
        if len(contents) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Max 10 MB")
        ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin"
        fid = uuid.uuid4().hex[:12]
        fname = f"{fid}.{ext}"
        fpath = FINANCE_DIR / fname
        fpath.write_bytes(contents)
        # Build static URL (mounted at /api/uploads)
        rel = f"finance_proofs/{fname}"
        return {
            "file_id": fid,
            "filename": file.filename,
            "url": f"/api/uploads/{rel}",
            "size": len(contents),
            "content_type": file.content_type,
        }

    @api_router.post("/finance/proofs")
    async def create_finance_proof(data: dict, current_user: dict = Depends(get_current_user)):
        """Save proof metadata after upload, with grouping fields."""
        if current_user['role'] not in ('admin', 'finance_manager'):
            raise HTTPException(status_code=403)
        proof = {
            "id": f"proof-{uuid.uuid4().hex[:10]}",
            "title": (data.get("title") or "").strip(),
            "vendor": data.get("vendor", ""),
            "payment_type": data.get("payment_type", "expense"),  # expense / bill / refund / advance
            "department": data.get("department", ""),
            "category": data.get("category", ""),
            "amount": float(data.get("amount") or 0),
            "payment_date": data.get("payment_date") or datetime.now(timezone.utc).date().isoformat(),
            "payment_method": data.get("payment_method", "cash"),
            "file_url": data.get("file_url", ""),
            "filename": data.get("filename", ""),
            "notes": data.get("notes", ""),
            "linked_expense_id": data.get("linked_expense_id", ""),
            "uploaded_by": current_user['id'],
            "uploaded_by_name": current_user.get("name", ""),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        if not proof["title"]:
            raise HTTPException(status_code=400, detail="Title is required")
        await db.finance_proofs.insert_one(proof)
        proof.pop("_id", None)
        await log_audit("create_finance_proof", "finance_proof", proof["id"],
                        current_user['id'], current_user.get('name', ''),
                        f"Rs.{proof['amount']} · {proof['title']}")
        return {"proof": proof}

    @api_router.get("/finance/proofs")
    async def list_finance_proofs(
        group_by: Optional[str] = None,
        month: Optional[str] = None,
        year: Optional[str] = None,
        vendor: Optional[str] = None,
        category: Optional[str] = None,
        department: Optional[str] = None,
        current_user: dict = Depends(get_current_user),
    ):
        """List proofs with optional grouping (date / vendor / payment_type / department /
        category). Supports month/year filters."""
        if current_user['role'] not in ('admin', 'finance_manager'):
            raise HTTPException(status_code=403)
        q = {}
        if year and month and month != "all":
            prefix = f"{year}-{str(month).zfill(2)}"
            q['payment_date'] = {"$gte": prefix, "$lt": prefix + "~"}
        elif year:
            q['payment_date'] = {"$gte": year, "$lt": year + "~"}
        if vendor:
            q['vendor'] = vendor
        if category:
            q['category'] = category
        if department:
            q['department'] = department
        proofs = await db.finance_proofs.find(q, {"_id": 0}).sort("payment_date", -1).to_list(1000)
        if not group_by:
            return {"proofs": proofs, "total": sum(p.get("amount", 0) for p in proofs), "count": len(proofs)}
        # Group by key
        groups = {}
        for p in proofs:
            if group_by == "date":
                key = (p.get("payment_date") or "")[:10]
            elif group_by == "month":
                key = (p.get("payment_date") or "")[:7]
            elif group_by == "vendor":
                key = p.get("vendor") or "Unspecified"
            elif group_by == "payment_type":
                key = p.get("payment_type") or "expense"
            elif group_by == "department":
                key = p.get("department") or "General"
            elif group_by == "category":
                key = p.get("category") or "Uncategorized"
            else:
                key = "All"
            g = groups.setdefault(key, {"key": key, "items": [], "total": 0, "count": 0})
            g["items"].append(p)
            g["total"] += float(p.get("amount") or 0)
            g["count"] += 1
        return {
            "groups": sorted(groups.values(), key=lambda x: -x["total"]),
            "total": sum(g["total"] for g in groups.values()),
            "count": sum(g["count"] for g in groups.values()),
            "group_by": group_by,
        }

    @api_router.delete("/finance/proofs/{pid}")
    async def delete_finance_proof(pid: str, current_user: dict = Depends(get_current_user)):
        if current_user['role'] not in ('admin', 'finance_manager'):
            raise HTTPException(status_code=403)
        p = await db.finance_proofs.find_one({"id": pid}, {"_id": 0, "file_url": 1, "title": 1})
        if not p:
            raise HTTPException(status_code=404)
        await db.finance_proofs.delete_one({"id": pid})
        # Try to remove file from disk
        url = p.get("file_url", "")
        if url.startswith("/api/uploads/"):
            try:
                (UPLOADS_DIR / url.replace("/api/uploads/", "")).unlink(missing_ok=True)
            except Exception:
                pass
        await log_audit("delete_finance_proof", "finance_proof", pid,
                        current_user['id'], current_user.get('name', ''),
                        p.get("title", ""))
        return {"message": "Proof deleted"}

    # ---------- Planned Payments / Budgeting Calendar ----------
    @api_router.get("/finance/planned-payments")
    async def list_planned_payments(
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        current_user: dict = Depends(get_current_user),
    ):
        if current_user['role'] not in ('admin', 'finance_manager'):
            raise HTTPException(status_code=403)
        q = {}
        if from_date or to_date:
            q['due_date'] = {}
            if from_date:
                q['due_date']['$gte'] = from_date
            if to_date:
                q['due_date']['$lte'] = to_date
        items = await db.planned_payments.find(q, {"_id": 0}).sort("due_date", 1).to_list(5000)
        return {"items": items, "total": sum(i.get("amount", 0) for i in items if i.get("status") != "paid")}

    @api_router.post("/finance/planned-payments")
    async def create_planned_payment(data: dict, current_user: dict = Depends(get_current_user)):
        if current_user['role'] not in ('admin', 'finance_manager'):
            raise HTTPException(status_code=403)
        item = {
            "id": f"pp-{uuid.uuid4().hex[:10]}",
            "title": (data.get("title") or "").strip(),
            "vendor": data.get("vendor", ""),
            "category": data.get("category", ""),
            "amount": float(data.get("amount") or 0),
            "due_date": data.get("due_date") or "",
            "recurring": data.get("recurring", "none"),  # none / monthly / quarterly / yearly
            "status": "scheduled",
            "notes": data.get("notes", ""),
            "created_by": current_user['id'],
            "created_by_name": current_user.get("name", ""),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        if not item["title"] or not item["due_date"]:
            raise HTTPException(status_code=400, detail="Title and due_date are required")
        await db.planned_payments.insert_one(item)
        item.pop("_id", None)
        return {"item": item}

    @api_router.put("/finance/planned-payments/{pid}/mark-paid")
    async def mark_planned_paid(pid: str, data: dict = None,
                                current_user: dict = Depends(get_current_user)):
        if current_user['role'] not in ('admin', 'finance_manager'):
            raise HTTPException(status_code=403)
        upd = {"status": "paid", "paid_at": datetime.now(timezone.utc).isoformat()}
        if data and data.get("proof_url"):
            upd["proof_url"] = data["proof_url"]
        r = await db.planned_payments.update_one({"id": pid}, {"$set": upd})
        if not r.matched_count:
            raise HTTPException(status_code=404)
        return {"message": "Marked paid"}

    @api_router.delete("/finance/planned-payments/{pid}")
    async def delete_planned_payment(pid: str,
                                     current_user: dict = Depends(get_current_user)):
        if current_user['role'] not in ('admin', 'finance_manager'):
            raise HTTPException(status_code=403)
        await db.planned_payments.delete_one({"id": pid})
        return {"message": "Deleted"}

    # ---------- Multi-image Upload for Products/Combos ----------
    @api_router.post("/products/upload-images")
    async def upload_product_images(
        files: List[UploadFile] = File(...),
        current_user: dict = Depends(get_current_user),
    ):
        """Upload multiple images for a product/combo. Returns list of URLs."""
        if current_user['role'] not in ('admin', 'inventory_manager', 'sales_manager'):
            raise HTTPException(status_code=403)
        if len(files) > 10:
            raise HTTPException(status_code=400, detail="Max 10 images at once")
        urls = []
        for file in files:
            if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
                continue
            contents = await file.read()
            if len(contents) > 5 * 1024 * 1024:
                continue
            ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "jpg"
            fname = f"{uuid.uuid4().hex[:12]}.{ext}"
            (PRODUCT_DIR / fname).write_bytes(contents)
            urls.append({
                "url": f"/api/uploads/product_images/{fname}",
                "filename": file.filename,
                "size": len(contents),
            })
        return {"uploaded": urls, "count": len(urls)}

    # ---------- Attendance helpers ----------
    @api_router.post("/attendance/unlock")
    async def unlock_attendance(data: dict, current_user: dict = Depends(get_current_user)):
        """Allow late check-out / clock-out for an employee at/after 5:30 PM. Admin/HR only."""
        if current_user['role'] not in ('admin', 'hr_manager'):
            raise HTTPException(status_code=403)
        user_id = data.get("user_id", "")
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id required")
        today = datetime.now(timezone.utc).date().isoformat()
        # Insert an unlock record
        rec = {
            "id": f"unlock-{uuid.uuid4().hex[:10]}",
            "user_id": user_id,
            "date": today,
            "unlocked_at": datetime.now(timezone.utc).isoformat(),
            "unlocked_by": current_user['id'],
            "unlocked_by_name": current_user.get("name", ""),
            "reason": data.get("reason", ""),
        }
        await db.attendance_unlocks.insert_one(rec)
        # Update today's attendance: set late_unlock=true so frontend allows check-out
        await db.attendance.update_one(
            {"user_id": user_id, "date": today},
            {"$set": {"late_unlock": True, "late_unlock_at": rec["unlocked_at"],
                      "late_unlock_by": current_user.get("name", "")}},
            upsert=False,
        )
        await log_audit("attendance_unlock", "attendance", user_id,
                        current_user['id'], current_user.get('name', ''),
                        f"Unlocked check-out for {user_id} at 5:30+")
        rec.pop("_id", None)
        return {"message": "Attendance unlocked for 5:30 PM check-out", "unlock": rec}

    @api_router.get("/attendance/unlocks/today")
    async def attendance_unlocks_today(current_user: dict = Depends(get_current_user)):
        today = datetime.now(timezone.utc).date().isoformat()
        items = await db.attendance_unlocks.find({"date": today}, {"_id": 0}).to_list(5000)
        return {"unlocks": items}

    # ---------- Smart Budgets (auto-update with debit) ----------
    @api_router.get("/finance/budgets")
    async def list_budgets(month: Optional[str] = None, year: Optional[str] = None,
                           current_user: dict = Depends(get_current_user)):
        if current_user['role'] not in ('admin', 'finance_manager'):
            raise HTTPException(status_code=403)
        q = {}
        if year:
            q['year'] = year
        if month:
            q['month'] = month
        budgets = await db.budgets.find(q, {"_id": 0}).to_list(5000)
        # Auto-compute spent amount per category
        for b in budgets:
            prefix = f"{b['year']}-{str(b['month']).zfill(2)}"
            spent = 0.0
            async for e in db.expenses.find({"category": b["category"],
                                              "created_at": {"$gte": prefix, "$lt": prefix + "~"}},
                                             {"_id": 0, "amount": 1}):
                spent += float(e.get("amount") or 0)
            b["spent"] = round(spent, 2)
            b["remaining"] = round(max(0, b["budget_amount"] - spent), 2)
            b["over_budget"] = spent > b["budget_amount"]
            b["usage_pct"] = round((spent / b["budget_amount"] * 100) if b["budget_amount"] else 0, 1)
        return {"budgets": budgets}

    @api_router.post("/finance/budgets")
    async def create_budget(data: dict, current_user: dict = Depends(get_current_user)):
        if current_user['role'] not in ('admin', 'finance_manager'):
            raise HTTPException(status_code=403)
        b = {
            "id": f"bud-{uuid.uuid4().hex[:10]}",
            "category": (data.get("category") or "").strip(),
            "budget_amount": float(data.get("budget_amount") or 0),
            "year": data.get("year") or str(datetime.now().year),
            "month": data.get("month") or str(datetime.now().month),
            "notes": data.get("notes", ""),
            "created_by": current_user['id'],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        if not b["category"] or b["budget_amount"] <= 0:
            raise HTTPException(status_code=400, detail="category & budget_amount required")
        # Upsert (one budget per cat/month/year)
        await db.budgets.update_one(
            {"category": b["category"], "month": b["month"], "year": b["year"]},
            {"$set": b}, upsert=True
        )
        # Auto-register as an Expense Head so the same category appears in expense
        # / payment / budget dropdowns everywhere — only if it isn't already there.
        existing = await db.expense_heads.find_one({"name": b["category"]})
        if not existing:
            await db.expense_heads.insert_one({
                "id": f"head-budget-{uuid.uuid4().hex[:6]}",
                "name": b["category"],
                "keywords": "",
                "expense_type": "variable",
                "active": True,
                "auto_created_from": "budget",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        return {"budget": b}

    @api_router.delete("/finance/budgets/{bid}")
    async def delete_budget(bid: str, current_user: dict = Depends(get_current_user)):
        if current_user['role'] not in ('admin', 'finance_manager'):
            raise HTTPException(status_code=403)
        await db.budgets.delete_one({"id": bid})
        return {"message": "Budget deleted"}

    logger.info("Phase-3 enhancements registered: finance proofs, multi-image, "
                "attendance unlock, planned payments, budgets")
