"""
stock_allocation.py — Per-employee stock allocation + inline OFFLINE order creation.

Managers (Sales/District, Assistants) and Inventory Managers can:
 - Allocate a product qty to any field employee (agent / telecaller / assistant manager)
   with an optional MANUAL unit_price. If unit_price is left blank, the product's default
   price is used at order time.
 - Convert part (or all) of that allocation into an OFFLINE order directly — this bypasses
   shipping (marked delivered instantly) and updates BOTH the allocation's sold_qty AND
   the master product.stock.

Model:
    stock_allocations: {
        id, employee_id, employee_name, employee_role, employee_phone,
        product_id, product_name,
        allocated_qty, sold_qty (default 0),
        unit_price (float; falls back to product.price if 0/None),
        note,
        created_at, updated_at, created_by_name,
        deleted (bool)
    }

    orders: (existing collection) — offline orders are tagged with
      is_offline=True, allocation_id=<id>, status="delivered".

Endpoints (admin + inventory_manager + sales_manager + district_manager):
    GET  /api/stock-allocations                          — list all
    GET  /api/stock-allocations/by-person                — grouped by person (adds totals + values)
    GET  /api/stock-allocations/allocatable-employees    — flat list of field staff + managers
    POST /api/stock-allocations                          — allocate {employee_id, product_id, qty, unit_price?, note}
    PUT  /api/stock-allocations/{alloc_id}               — edit qty/unit_price/note
    DELETE /api/stock-allocations/{alloc_id}             — soft delete
    POST /api/stock-allocations/{alloc_id}/create-order  — CREATE OFFLINE ORDER (deducts stock)
"""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid


ALLOWED_ROLES = ("admin", "inventory_manager", "sales_manager", "district_manager",
                 "assistant_sales_manager", "assistant_district_manager")


def register_stock_allocation(api_router: APIRouter, db, get_current_user):

    async def _require(user):
        if user.get("role") not in ALLOWED_ROLES:
            raise HTTPException(403, "Not authorised")

    async def _employee_lookup(emp_id):
        for coll in ("agents", "store_agents", "telecallers", "sales_managers", "district_managers",
                     "assistant_sales_managers", "assistant_district_managers",
                     "inventory_managers", "admins", "users"):
            doc = await db[coll].find_one({"id": emp_id}, {"_id": 0, "id": 1, "name": 1, "role": 1, "phone": 1})
            if doc:
                doc["role_source"] = coll.rstrip("s")
                return doc
        return None

    async def _product_price(pid):
        p = await db.products.find_one({"id": pid}, {"_id": 0, "price": 1, "name": 1, "stock": 1})
        return p or {}

    @api_router.get("/stock-allocations/allocatable-employees")
    async def allocatable_employees(current_user: dict = Depends(get_current_user)):
        """Employees who can *hold* allocated stock: field staff + managers."""
        await _require(current_user)
        out = []
        async for t in db.telecallers.find({"deleted": {"$ne": True}}, {"_id": 0, "id": 1, "name": 1, "phone": 1}):
            out.append({"id": t["id"], "name": t.get("name") or "", "role": "telecaller", "phone": t.get("phone") or ""})
        async for a in db.store_agents.find({"active": {"$ne": False}}, {"_id": 0, "id": 1, "name": 1, "phone": 1}):
            out.append({"id": a["id"], "name": a.get("name") or "", "role": "agent", "phone": a.get("phone") or ""})
        # Managers can also hold allocated stock (they run offline sales)
        for coll, role in [("sales_managers", "sales_manager"),
                           ("district_managers", "district_manager"),
                           ("assistant_sales_managers", "assistant_sales_manager"),
                           ("assistant_district_managers", "assistant_district_manager"),
                           ("inventory_managers", "inventory_manager")]:
            async for m in db[coll].find({"deleted": {"$ne": True}}, {"_id": 0, "id": 1, "name": 1, "phone": 1}):
                out.append({"id": m["id"], "name": m.get("name") or "", "role": role, "phone": m.get("phone") or ""})
        return {"employees": out}

    def _enrich(row, product_price=None):
        allocated = int(row.get("allocated_qty", 0) or 0)
        sold = int(row.get("sold_qty", 0) or 0)
        unit = float(row.get("unit_price") or 0)
        default_price = float(product_price or 0)
        effective_price = unit if unit > 0 else default_price
        remaining = max(0, allocated - sold)
        return {
            **row,
            "sold_qty": sold,
            "remaining_qty": remaining,
            "unit_price": unit,
            "default_price": default_price,
            "effective_unit_price": effective_price,
            "allocated_value": allocated * effective_price,
            "sold_value": sold * effective_price,
            "remaining_value": remaining * effective_price,
        }

    @api_router.get("/stock-allocations")
    async def list_allocations(current_user: dict = Depends(get_current_user)):
        await _require(current_user)
        rows = await db.stock_allocations.find({"deleted": {"$ne": True}}, {"_id": 0}).sort("updated_at", -1).to_list(5000)
        # bulk product price fetch
        pids = list({r["product_id"] for r in rows})
        prices = {}
        if pids:
            async for p in db.products.find({"id": {"$in": pids}}, {"_id": 0, "id": 1, "price": 1}):
                prices[p["id"]] = float(p.get("price") or 0)
        enriched = [_enrich(r, prices.get(r["product_id"], 0)) for r in rows]
        return {"allocations": enriched, "count": len(enriched)}

    @api_router.get("/stock-allocations/by-person")
    async def by_person(current_user: dict = Depends(get_current_user)):
        await _require(current_user)
        rows = await db.stock_allocations.find({"deleted": {"$ne": True}}, {"_id": 0}).to_list(5000)
        pids = list({r["product_id"] for r in rows})
        prices = {}
        if pids:
            async for p in db.products.find({"id": {"$in": pids}}, {"_id": 0, "id": 1, "price": 1}):
                prices[p["id"]] = float(p.get("price") or 0)
        grouped = {}
        for r in rows:
            enriched = _enrich(r, prices.get(r["product_id"], 0))
            eid = r["employee_id"]
            if eid not in grouped:
                grouped[eid] = {"employee_id": eid,
                                "employee_name": r.get("employee_name") or "—",
                                "employee_role": r.get("employee_role") or "",
                                "employee_phone": r.get("employee_phone") or "",
                                "total_qty": 0, "total_sold_qty": 0, "total_remaining_qty": 0,
                                "total_allocated_value": 0.0, "total_sold_value": 0.0, "total_remaining_value": 0.0,
                                "products": []}
            grouped[eid]["products"].append({
                "id": enriched["id"], "product_id": enriched["product_id"],
                "product_name": enriched.get("product_name") or "",
                "allocated_qty": enriched["allocated_qty"],
                "sold_qty": enriched["sold_qty"],
                "remaining_qty": enriched["remaining_qty"],
                "unit_price": enriched["unit_price"],
                "default_price": enriched["default_price"],
                "effective_unit_price": enriched["effective_unit_price"],
                "allocated_value": enriched["allocated_value"],
                "sold_value": enriched["sold_value"],
                "remaining_value": enriched["remaining_value"],
                "note": enriched.get("note", ""),
                "created_at": enriched.get("created_at"),
                "updated_at": enriched.get("updated_at"),
            })
            grouped[eid]["total_qty"] += enriched["allocated_qty"]
            grouped[eid]["total_sold_qty"] += enriched["sold_qty"]
            grouped[eid]["total_remaining_qty"] += enriched["remaining_qty"]
            grouped[eid]["total_allocated_value"] += enriched["allocated_value"]
            grouped[eid]["total_sold_value"] += enriched["sold_value"]
            grouped[eid]["total_remaining_value"] += enriched["remaining_value"]
        people = sorted(grouped.values(), key=lambda x: x["total_remaining_value"], reverse=True)
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
        prod = await _product_price(prod_id)
        if not prod:
            raise HTTPException(404, "Product not found")
        # unit_price is OPTIONAL — 0 / None means "use product default at order time"
        raw_price = data.get("unit_price")
        try:
            unit_price = float(raw_price) if raw_price not in (None, "") else 0.0
        except (TypeError, ValueError):
            unit_price = 0.0
        if unit_price < 0:
            raise HTTPException(400, "unit_price must be >= 0")
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
            "sold_qty": 0,
            "unit_price": unit_price,
            "note": data.get("note") or "",
            "created_at": now,
            "updated_at": now,
            "created_by_name": current_user.get("name", ""),
            "created_by_role": current_user.get("role", ""),
        }
        await db.stock_allocations.insert_one(doc)
        doc.pop("_id", None)
        return {"allocation": _enrich(doc, float(prod.get("price") or 0)), "message": "Allocated"}

    @api_router.put("/stock-allocations/{alloc_id}")
    async def update_alloc(alloc_id: str, data: dict, current_user: dict = Depends(get_current_user)):
        await _require(current_user)
        cur = await db.stock_allocations.find_one({"id": alloc_id}, {"_id": 0})
        if not cur:
            raise HTTPException(404, "Not found")
        update = {}
        if "qty" in data or "allocated_qty" in data:
            q = int(data.get("qty", data.get("allocated_qty", 0)) or 0)
            if q < int(cur.get("sold_qty", 0)):
                raise HTTPException(400, f"Cannot reduce below already-sold ({cur.get('sold_qty')})")
            update["allocated_qty"] = q
        if "unit_price" in data:
            try:
                up = float(data.get("unit_price") or 0)
            except (TypeError, ValueError):
                up = 0.0
            if up < 0:
                raise HTTPException(400, "unit_price must be >= 0")
            update["unit_price"] = up
        if "note" in data:
            update["note"] = str(data["note"] or "")
        if not update:
            raise HTTPException(400, "Nothing to update")
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.stock_allocations.update_one({"id": alloc_id}, {"$set": update})
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

    @api_router.post("/stock-allocations/{alloc_id}/create-order")
    async def create_offline_order(alloc_id: str, data: dict, current_user: dict = Depends(get_current_user)):
        """Convert (part of) an allocation into an OFFLINE order.

        Payload:
            sold_qty: int (required, must be > 0 and <= remaining_qty)
            unit_price: float (optional; overrides allocation unit_price for this order only)
            customer_name: str (optional)
            customer_phone: str (optional)
            notes: str (optional)
            payment_type: "cash"|"upi"|"offline"|"card" (optional, default "cash")

        Effects:
            - Inserts into `orders` with is_offline=True, status="delivered",
              customer_address="OFFLINE — allocated stock" (bypasses shipping).
            - Increments allocation.sold_qty
            - Decrements product.stock (never below 0)
        """
        await _require(current_user)
        alloc = await db.stock_allocations.find_one({"id": alloc_id, "deleted": {"$ne": True}}, {"_id": 0})
        if not alloc:
            raise HTTPException(404, "Allocation not found")
        try:
            sold_qty = int(data.get("sold_qty") or 0)
        except (TypeError, ValueError):
            sold_qty = 0
        if sold_qty <= 0:
            raise HTTPException(400, "sold_qty must be > 0")
        remaining = int(alloc.get("allocated_qty", 0)) - int(alloc.get("sold_qty", 0))
        if sold_qty > remaining:
            raise HTTPException(400, f"Only {remaining} unit(s) remain in this allocation")

        # Determine unit price for this order (per-order override → allocation → product default)
        override_price = data.get("unit_price")
        try:
            override_price_f = float(override_price) if override_price not in (None, "") else None
        except (TypeError, ValueError):
            override_price_f = None
        if override_price_f is not None and override_price_f < 0:
            raise HTTPException(400, "unit_price must be >= 0")
        product = await _product_price(alloc["product_id"])
        default_price = float(product.get("price") or 0)
        alloc_price = float(alloc.get("unit_price") or 0)
        effective_price = override_price_f if override_price_f is not None else (
            alloc_price if alloc_price > 0 else default_price
        )
        if effective_price <= 0:
            raise HTTPException(400, "unit_price is 0 — set it on the allocation, on this order, or on the product")

        total_amount = round(effective_price * sold_qty, 2)
        now = datetime.now(timezone.utc).isoformat()
        order_id = f"OFF-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
        order = {
            "id": order_id,
            "customer_name": (data.get("customer_name") or "Walk-in").strip(),
            "customer_phone": (data.get("customer_phone") or "").strip(),
            "customer_address": "OFFLINE — allocated stock",
            "customer_city": "",
            "customer_state": "",
            "customer_pincode": "",
            "customer_landmark": "",
            "items": [{
                "product_id": alloc["product_id"],
                "name": alloc.get("product_name") or product.get("name") or "",
                "price": effective_price,
                "quantity": sold_qty,
            }],
            "total_amount": total_amount,
            "payment_type": (data.get("payment_type") or "cash").lower(),
            "status": "delivered",
            "is_offline": True,
            "allocation_id": alloc_id,
            "notes": data.get("notes") or "",
            "created_by": current_user.get("id"),
            "created_by_role": current_user.get("role", ""),
            "created_by_name": current_user.get("name", ""),
            "approved_by": None, "approved_at": None,
            "shipped_at": None, "delivered_at": now,
            "created_at": now, "updated_at": now,
        }
        await db.orders.insert_one(order)
        order.pop("_id", None)

        # Increment allocation.sold_qty
        await db.stock_allocations.update_one({"id": alloc_id}, {"$set": {
            "sold_qty": int(alloc.get("sold_qty", 0)) + sold_qty,
            "updated_at": now,
        }})
        # Decrement master product stock (never below 0)
        try:
            cur_stock = int(product.get("stock") or 0)
            new_stock = max(0, cur_stock - sold_qty)
            await db.products.update_one({"id": alloc["product_id"]}, {"$set": {"stock": new_stock, "updated_at": now}})
        except Exception:
            pass
        # Record revenue transaction (offline sales credit)
        try:
            from server import record_transaction  # local import to avoid circular
            await record_transaction(
                "credit", "offline_order", total_amount,
                f"Offline order {order_id} — {alloc.get('product_name')} x{sold_qty} by {current_user.get('name','')}",
                reference_id=order_id, method=(data.get("payment_type") or "cash").lower(),
                created_by=current_user.get("id") or "system",
            )
        except Exception:
            pass

        updated_alloc = await db.stock_allocations.find_one({"id": alloc_id}, {"_id": 0})
        return {"order": order,
                "allocation": _enrich(updated_alloc, default_price),
                "message": f"Offline order created for {sold_qty} unit(s) — Rs.{total_amount:.2f}"}
