"""
Financial Projections Module — imports the 3 uploaded projection sheets
(1.xlsx, 2.xlsx, 3.xlsx = Year 1/2/3) into MongoDB and exposes an API for
the Finance Manager dashboard to compare "projected" vs "actual" P&L.

Storage: `projections` collection with docs shaped like:
  { year: 1|2|3, month: "Jul", month_index: 1..12, sales, cogs, marketing,
    employee, tech, depreciation, other_opex, net_income,
    cash, inventory, debtors, furniture_net, total_assets }

Auto-seeded from /app/backend/data/projections/*.xlsx if present.
"""
import os
import re
import logging
from datetime import datetime, timezone, date
from typing import Dict, Any, List, Optional
from fastapi import Depends, HTTPException, Query
import openpyxl

logger = logging.getLogger("projections")

_db = None

MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
               "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

MONTH_ALIASES = {m.lower(): i+1 for i, m in enumerate(MONTH_NAMES)}
MONTH_ALIASES.update({m.lower()[:3]: i+1 for i, m in enumerate(MONTH_NAMES)})


def _month_index(cell_value: str) -> Optional[int]:
    """Extract 1-12 from a header cell like 'Jul (Actual)' or 'September'."""
    if not cell_value:
        return None
    s = str(cell_value).strip().lower()
    m = re.match(r"^([a-z]+)", s)
    if not m:
        return None
    key = m.group(1)[:3]
    return MONTH_ALIASES.get(key)


def _num(v) -> float:
    if v is None or v == "":
        return 0.0
    try:
        return float(v)
    except (ValueError, TypeError):
        return 0.0


def parse_projection_workbook(path: str, year: int) -> List[Dict[str, Any]]:
    """Parse a Year-X projection workbook. Returns one dict per month.
    We use the 'PL' + 'BS' sheets (most-detailed variants) for figures."""
    wb = openpyxl.load_workbook(path, data_only=True)

    # Find PL sheet (some files use 'PL', some 'P&L') — prefer the one with real numbers.
    pl_sheet = None
    for name in ("PL", "P&L"):
        if name in wb.sheetnames:
            ws = wb[name]
            # Non-zero sales?
            for r in range(5, min(ws.max_row, 30)+1):
                if ws.cell(r, 1).value and "sales" in str(ws.cell(r, 1).value).lower():
                    if any(_num(ws.cell(r, c).value) > 0 for c in range(2, ws.max_column+1)):
                        pl_sheet = ws
                        break
            if pl_sheet:
                break
    if not pl_sheet and "P&L" in wb.sheetnames:
        pl_sheet = wb["P&L"]

    bs_sheet = wb["BS"] if "BS" in wb.sheetnames else wb.get("Balance Sheet ", None) or wb["Balance Sheet"]

    # Header row = row 4, month columns from C2 onward
    def _header_months(ws):
        out = {}  # col_index → month_index
        for c in range(2, ws.max_column+1):
            mi = _month_index(ws.cell(4, c).value)
            if mi:
                out[c] = mi
        return out

    pl_months = _header_months(pl_sheet) if pl_sheet else {}
    bs_months = _header_months(bs_sheet)

    # Build a row-label → row-index map for each sheet
    def _row_map(ws):
        m = {}
        for r in range(1, ws.max_row+1):
            v = ws.cell(r, 1).value
            if isinstance(v, str) and v.strip():
                m[v.strip().lower()] = r
        return m

    pl_rows = _row_map(pl_sheet) if pl_sheet else {}
    bs_rows = _row_map(bs_sheet)

    def _get(rows, ws, label_keys: List[str], col: int) -> float:
        for k in label_keys:
            for label, r in rows.items():
                if k in label:
                    return _num(ws.cell(r, col).value)
        return 0.0

    records: Dict[int, Dict[str, Any]] = {}

    if pl_sheet:
        for col, mi in pl_months.items():
            rec = records.setdefault(mi, {"month_index": mi, "month": MONTH_NAMES[mi-1]})
            rec["sales"] = _get(pl_rows, pl_sheet, ["sales", "revenue"], col)
            rec["cogs"] = _get(pl_rows, pl_sheet, ["cost of goods", "cost of sales"], col)
            rec["marketing"] = _get(pl_rows, pl_sheet, ["marketing"], col)
            rec["employee"] = _get(pl_rows, pl_sheet, ["employee benefit", "salary"], col)
            rec["tech"] = _get(pl_rows, pl_sheet, ["tech & software", "software"], col)
            rec["depreciation"] = _get(pl_rows, pl_sheet, ["depreciation"], col)
            # Compute net operating income
            total_opex = rec["marketing"] + rec["employee"] + rec["tech"] + rec["depreciation"]
            rec["other_opex"] = total_opex
            rec["gross_profit"] = rec["sales"] - rec["cogs"]
            rec["net_income"] = rec["gross_profit"] - total_opex

    for col, mi in bs_months.items():
        rec = records.setdefault(mi, {"month_index": mi, "month": MONTH_NAMES[mi-1]})
        rec["cash"] = _get(bs_rows, bs_sheet, ["cash in hand"], col)
        rec["debtors"] = _get(bs_rows, bs_sheet, ["debtors"], col)
        rec["inventory"] = _get(bs_rows, bs_sheet, ["inventory"], col)
        rec["furniture_net"] = _get(bs_rows, bs_sheet, ["furniture"], col)
        rec["total_current_assets"] = _get(bs_rows, bs_sheet, ["total current assets"], col)

    out: List[Dict[str, Any]] = []
    for mi, rec in sorted(records.items()):
        rec["year"] = year
        rec["is_projection"] = True
        rec["updated_at"] = datetime.now(timezone.utc).isoformat()
        out.append(rec)
    return out


async def seed_projections_if_present():
    """Look in /app/backend/data/projections/{1,2,3}.xlsx and load them once.
    Idempotent: uses (year, month_index) upsert."""
    if _db is None:
        return {"loaded": 0, "reason": "db not ready"}
    base = "/app/backend/data/projections"
    if not os.path.isdir(base):
        return {"loaded": 0, "reason": "no data dir"}
    loaded = 0
    for y in (1, 2, 3):
        path = os.path.join(base, f"{y}.xlsx")
        if not os.path.isfile(path):
            continue
        try:
            recs = parse_projection_workbook(path, y)
            for r in recs:
                await _db.projections.update_one(
                    {"year": r["year"], "month_index": r["month_index"]},
                    {"$set": r},
                    upsert=True,
                )
            loaded += len(recs)
        except Exception as e:
            logger.exception(f"seed year {y}: {e}")
    logger.info(f"Projections seeded: {loaded} monthly rows")
    return {"loaded": loaded}


def register(api_router, database, get_current_user):
    global _db
    _db = database

    def _fm_or_admin(current_user: dict = Depends(get_current_user)):
        role = current_user.get("role")
        if role not in ("finance_manager", "admin"):
            raise HTTPException(status_code=403, detail="Finance Manager or Admin only")
        return current_user

    @api_router.post("/finance/projections/reseed")
    async def reseed(current_user: dict = Depends(_fm_or_admin)):
        return await seed_projections_if_present()

    @api_router.get("/finance/projections")
    async def list_projections(
        year: Optional[int] = Query(None),
        current_user: dict = Depends(_fm_or_admin),
    ):
        q = {"year": year} if year else {}
        cursor = _db.projections.find(q, {"_id": 0}).sort([("year", 1), ("month_index", 1)])
        docs = await cursor.to_list(500)
        return {"projections": docs, "count": len(docs)}

    @api_router.get("/finance/projections/vs-actual")
    async def projections_vs_actual(
        year: int = Query(1, ge=1, le=3, description="Projection year 1, 2, or 3"),
        current_user: dict = Depends(_fm_or_admin),
    ):
        """Return per-month projected vs actual revenue/expenses/net income.
        Actuals aggregated from `orders` collection by created_at month."""
        proj_cursor = _db.projections.find({"year": year}, {"_id": 0}).sort("month_index", 1)
        projections = await proj_cursor.to_list(50)

        # Aggregate actual revenue by (year, month) — CURRENT calendar year assumed.
        current_year = date.today().year
        pipeline = [
            {"$match": {"created_at": {"$gte": f"{current_year}-01-01"}}},
            {"$addFields": {"_mo": {"$substr": ["$created_at", 5, 2]}}},
            {"$group": {
                "_id": "$_mo",
                "revenue": {"$sum": "$total_amount"},
                "orders": {"$sum": 1},
            }},
        ]
        actuals: Dict[int, Dict[str, float]] = {}
        async for row in _db.orders.aggregate(pipeline):
            mi = int(row["_id"])
            actuals[mi] = {"revenue": row["revenue"], "orders": row["orders"]}

        # Merge
        rows: List[Dict[str, Any]] = []
        for p in projections:
            mi = p["month_index"]
            actual_rev = actuals.get(mi, {}).get("revenue", 0)
            actual_orders = actuals.get(mi, {}).get("orders", 0)
            # Estimated actual net: revenue - 40% COGS - fixed opex
            fixed_opex = p.get("marketing", 0) + p.get("employee", 0) + p.get("tech", 0) + p.get("depreciation", 0)
            actual_net = actual_rev - actual_rev * 0.40 - fixed_opex
            rows.append({
                **p,
                "actual_revenue": round(actual_rev, 2),
                "actual_orders": actual_orders,
                "actual_net_income": round(actual_net, 2),
                "variance_revenue": round(actual_rev - p.get("sales", 0), 2),
                "variance_net": round(actual_net - p.get("net_income", 0), 2),
            })

        totals = {
            "projected_revenue": sum(p.get("sales", 0) for p in projections),
            "actual_revenue": sum(r["actual_revenue"] for r in rows),
            "projected_net": sum(p.get("net_income", 0) for p in projections),
            "actual_net": sum(r["actual_net_income"] for r in rows),
        }
        totals["variance_revenue"] = round(totals["actual_revenue"] - totals["projected_revenue"], 2)
        totals["variance_net"] = round(totals["actual_net"] - totals["projected_net"], 2)

        return {"year": year, "rows": rows, "totals": totals}

    logger.info("Projections routes registered")
