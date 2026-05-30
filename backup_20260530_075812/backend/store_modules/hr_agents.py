"""HR external-agents directory + add-to-employees. Extracted from agent_store.py."""
from fastapi import HTTPException, Depends
import uuid


def register(router, db, get_current_user, helpers):
    now = helpers["now"]
    strip_mongo = helpers["strip_mongo"]

    @router.get("/hr/external-agents")
    async def hr_list_external_agents(current_user: dict = Depends(get_current_user)):
        if current_user.get("role") not in ("admin", "hr_manager"):
            raise HTTPException(403, "HR / Admin only")
        out = []
        async for a in db.hr_external_agents.find().sort("created_at", -1):
            d = strip_mongo(a)
            if d.get("agent_id"):
                emp = await db.agents.find_one({"agent_id": d["agent_id"]})
                d["added_to_employees"] = bool(emp) or bool(d.get("added_to_employees"))
            out.append(d)
        return {"agents": out}

    @router.post("/hr/external-agents/{agent_id}/add-to-employees")
    async def hr_add_agent_to_employees(agent_id: str, data: dict = None, current_user: dict = Depends(get_current_user)):
        if current_user.get("role") not in ("admin", "hr_manager"):
            raise HTTPException(403, "HR / Admin only")
        ext = await db.hr_external_agents.find_one({"agent_id": agent_id})
        if not ext:
            raise HTTPException(404, "External agent not found")
        existing = await db.agents.find_one({"agent_id": agent_id})
        if existing:
            await db.hr_external_agents.update_one(
                {"agent_id": agent_id},
                {"$set": {"added_to_employees": True, "employee_user_id": existing.get("id"), "added_at": now()}}
            )
            return {"ok": True, "user_id": existing.get("id"), "already_existed": True}
        uid = "agent-" + uuid.uuid4().hex[:8]
        commission_pct = float(ext.get("commission_pct", 10) or 10)
        salary = int((data or {}).get("salary", 0) or 0)
        phone = ext.get("phone", "")
        agent_doc = {
            "id": uid,
            "agent_id": agent_id,
            "name": ext.get("name", ""),
            "email": ext.get("email") or f"{(phone or uid)}@celestaglow.com",
            "phone": phone,
            "password": "agent" + (phone[-4:] if phone else "1234"),
            "designation": ext.get("designation", "agent"),
            "commission_pct": commission_pct,
            "region": ext.get("region", ""),
            "district": ext.get("region", ""),
            "area": "",
            "gpay_number": ext.get("gpay_number", ""),
            "upi_id": ext.get("gpay_number", ""),
            "managed_by": ext.get("sales_manager_id"),
            "sales_manager_id": ext.get("sales_manager_id"),
            "sales_manager_name": ext.get("sales_manager_name"),
            "salary": salary,
            "incentive": 0,
            "commission_earned": 0,
            "total_sales": 0,
            "status": "active",
            "inventory": {},
            "added_by": current_user.get("id"),
            "added_by_name": current_user.get("name"),
            "added_by_role": current_user.get("role"),
            "created_at": now(),
            "source": "external_agent",
        }
        await db.agents.insert_one(agent_doc)
        await db.hr_external_agents.update_one(
            {"agent_id": agent_id},
            {"$set": {"added_to_employees": True, "employee_user_id": uid, "added_at": now()}}
        )
        return {"ok": True, "user_id": uid, "agent": {k: v for k, v in agent_doc.items() if k not in ("password", "_id")}}
