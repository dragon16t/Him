"""
stock_allocation.py — Inventory Manager: track how much stock of each product
is allocated to each employee (usually agents/telecallers), so IM can see at a
glance who holds how much of what.

Model:
    stock_allocations: {
        id, employee_id, employee_name, employee_role,
        product_id, product_name, allocated_qty, note,
        created_at, updated_at
    }

Endpoints (admin + inventory_manager):
    GET  /api/stock-allocations               — list all
    GET  /api/stock-allocations/by-person     — grouped by person with per-product totals
    POST /api/stock-allocations               — allocate {employee_id, product_id, qty, note}
    PUT  /api/stock-allocations/{alloc_id}    — edit qty/note
    DELETE /api/stock-allocations/{alloc_id}  — remove
"""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid


def register_stock_allocation(api_router: APIRouter, db, get_current_user):

    async def _require(user):
        if user.get("role") not in ("admin", "inventory_manager"):
            raise HTTPException(403, "Not authorised")

    async def _employee_lookup(emp_id):
        for coll in ("agents", "telecallers", "sales_managers", "district_managers",
                     "assistant_sales_managers", "assistant_district_managers",
                     "inventory_managers", "admins", "users"):
            doc = await db[coll].find_one({"id": emp_id}, {"_id": 0, "id": 1, "name": 1, "role": 1, "phone": 1})
            if doc:
                doc["role_source"] = coll.rstrip("s")
                return doc
        return None

    @api_router.get("/stock-allocations")
    async def list_allocations(current_user: dict = Depends(get_current_user)):
        await _require(current_user)
        rows = await db.stock_allocations.find({"deleted": {"$ne": True}}, {"_id": 0}).sort("updated_at", -1).to_list(5000)
        return {"allocations": rows, "count": len(rows)}

    @api_router.get("/stock-allocations/by-person")
    async def by_person(current_user: dict = Depends(get_current_user)):
        await _require(current_user)
        rows = await db.stock_allocations.find({"deleted": {"$ne": True}}, {"_id": 0}).to_list(5000)
        grouped = {}
        for r in rows:
            eid = r["employee_id"]
            if eid not in grouped:
                grouped[eid] = {"employee_id": eid,
                                 "employee_name": r.get("employee_name") or "—",
                                 "employee_role": r.get("employee_role") or "",
                                 "employee_phone": r.get("employee_phone") or "",
                                 "total_qty": 0, "products": []}
            grouped[eid]["products"].append({
                "id": r["id"], "product_id": r["product_id"],
                "product_name": r.get("product_name") or "",
                "allocated_qty": r.get("allocated_qty", 0),
                "note": r.get("note", ""),
                "created_at": r.get("created_at"),
                "updated_at": r.get("updated_at"),
            })
            grouped[eid]["total_qty"] += r.get("allocated_qty", 0)
        people = sorted(grouped.values(), key=lambda x: x["total_qty"], reverse=True)
        return {"people": people, "count": len(people)}

    @api_router.post("/stock-allocations")
    async def create_alloc(data: dict, current_user: dict = Depends(get_current_user)):
        await _require(current_user)
        emp_id = data.get("employee_id")
        prod_id = data.get("product_id")
        qty = int(data.get("qty") or data.get("allocated_qty") or 0)
        if not emp_id or not prod_id or qty <= 0:
            raise HTTPException(400, "employee_id, product_id, qty (>0) required")
        emp = await _employee_lookup(emp_id)
        if not emp:
            raise HTTPException(404, "Employee not found")
        prod = await db.products.find_one({"id": prod_id}, {"_id": 0, "name": 1})
        if not prod:
            raise HTTPException(404, "Product not found")
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": f"salloc-{uuid.uuid4().hex[:8]}",
            "employee_id": emp_id,
            "employee_name": emp.get("name") or "",
            "employee_role": emp.get("role") or emp.get("role_source") or "",
            "employee_phone": emp.get("phone") or "",
            "product_id": prod_id,
            "product_name": prod.get("name") or "",
            "allocated_qty": qty,
            "note": data.get("note") or "",
            "created_at": now,
            "updated_at": now,
            "created_by_name": current_user.get("name", ""),
        }
        await db.stock_allocations.insert_one(doc)
        doc.pop("_id", None)
        return {"allocation": doc, "message": "Allocated"}

    @api_router.put("/stock-allocations/{alloc_id}")
    async def update_alloc(alloc_id: str, data: dict, current_user: dict = Depends(get_current_user)):
        await _require(current_user)
        update = {}
        if "qty" in data or "allocated_qty" in data:
            q = int(data.get("qty", data.get("allocated_qty", 0)) or 0)
            if q < 0:
                raise HTTPException(400, "qty must be >= 0")
            update["allocated_qty"] = q
        if "note" in data:
            update["note"] = str(data["note"] or "")
        if not update:
            raise HTTPException(400, "Nothing to update")
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        r = await db.stock_allocations.update_one({"id": alloc_id}, {"$set": update})
        if not r.matched_count:
            raise HTTPException(404, "Not found")
        return {"message": "Updated"}

    @api_router.delete("/stock-allocations/{alloc_id}")
    async def delete_alloc(alloc_id: str, current_user: dict = Depends(get_current_user)):
        await _require(current_user)
        r = await db.stock_allocations.update_one({"id": alloc_id}, {"$set": {
            "deleted": True, "deleted_at": datetime.now(timezone.utc).isoformat(),
            "deleted_by_name": current_user.get("name", "")}})
        if not r.matched_count:
            raise HTTPException(404, "Not found")
        return {"message": "Removed"}
