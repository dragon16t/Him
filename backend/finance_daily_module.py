"""
Finance Manager — Daily Sales & Profit/Loss module.

Aggregates a single day's (or date-range's) orders by the ROLE that created
them (Sales Manager vs Telecaller vs Admin), computes revenue, and produces a
P&L snapshot using either stored `cost_price` per product or a configurable
fallback cost ratio (default 40 % of sale = 60 % gross margin).

Cost inputs, in order of precedence per line item:
  1. `items[].cost_price` — if the line has an explicit cost snapshot
  2. `products.cost_price` — looked up by product_id
  3. `default_cost_ratio` × line total — fallback (default 0.4)

Extra costs subtracted from revenue:
  • Shipping fee estimate per order (default ₹65)
  • Payment gateway fee (Razorpay/UPI orders: 2.36 % ; COD: 0)
"""
import logging
from datetime import datetime, timezone, timedelta, date
from typing import Optional, Dict, Any, List
from fastapi import Depends, HTTPException, Query

logger = logging.getLogger("finance_daily")

_db = None

DEFAULT_COST_RATIO = 0.40         # fallback COGS assumption
DEFAULT_SHIPPING_COST = 65.0      # per order, Delhivery / India Post average
UPI_GATEWAY_FEE_RATIO = 0.0236    # Razorpay / UPI processing fee


def _day_bounds(day: str) -> tuple:
    """Return (start_iso, end_iso) for a YYYY-MM-DD day in UTC."""
    try:
        d0 = datetime.fromisoformat(day).replace(tzinfo=timezone.utc)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date; use YYYY-MM-DD")
    d1 = d0 + timedelta(days=1)
    return d0.isoformat(), d1.isoformat()


def register(api_router, database, get_current_user):
    global _db
    _db = database

    def _fm_or_admin(current_user: dict = Depends(get_current_user)):
        role = current_user.get("role")
        if role not in ("finance_manager", "admin"):
            raise HTTPException(status_code=403, detail="Finance Manager or Admin only")
        return current_user

    async def _load_product_costs(product_ids: List[str]) -> Dict[str, float]:
        if not product_ids:
            return {}
        cur = _db.products.find(
            {"id": {"$in": product_ids}},
            {"_id": 0, "id": 1, "cost_price": 1, "price": 1},
        )
        out: Dict[str, float] = {}
        async for p in cur:
            cp = p.get("cost_price")
            if cp is not None and cp > 0:
                out[p["id"]] = float(cp)
        return out

    def _cost_for_order(order: Dict[str, Any], prod_cost_map: Dict[str, float]) -> float:
        items = order.get("items") or []
        cogs = 0.0
        for it in items:
            if not isinstance(it, dict):
                continue
            qty = float(it.get("quantity") or 1)
            price = float(it.get("price") or 0)
            explicit = it.get("cost_price")
            if explicit is not None and float(explicit) > 0:
                cogs += float(explicit) * qty
                continue
            pid = str(it.get("product_id") or "")
            if pid in prod_cost_map:
                cogs += prod_cost_map[pid] * qty
            else:
                cogs += price * qty * DEFAULT_COST_RATIO
        return round(cogs, 2)

    @api_router.get("/finance/daily-sales")
    async def daily_sales(
        day: Optional[str] = Query(None, description="YYYY-MM-DD (defaults to today UTC)"),
        include_pending: bool = Query(True, description="Include pending/unshipped orders"),
        current_user: dict = Depends(_fm_or_admin),
    ):
        """Return today's revenue + P&L broken down by role (SM/TC/Admin/etc)."""
        day = day or date.today().isoformat()
        start_iso, end_iso = _day_bounds(day)
        q: Dict[str, Any] = {"created_at": {"$gte": start_iso, "$lt": end_iso}}
        if not include_pending:
            q["status"] = {"$in": ["confirmed", "shipped", "delivered"]}
        orders = await _db.orders.find(q, {"_id": 0}).to_list(5000)

        # Preload all product costs used today
        all_pids: List[str] = []
        for o in orders:
            for it in (o.get("items") or []):
                pid = str((it or {}).get("product_id") or "")
                if pid:
                    all_pids.append(pid)
        prod_cost_map = await _load_product_costs(list(set(all_pids)))

        # Aggregate by role
        by_role: Dict[str, Dict[str, Any]] = {}
        total_revenue = 0.0
        total_cogs = 0.0
        total_shipping = 0.0
        total_gateway = 0.0
        cod_revenue = 0.0
        online_revenue = 0.0
        order_count = 0

        for o in orders:
            role = (o.get("created_by_role") or "unknown").lower()
            revenue = float(o.get("total_amount") or 0)
            cogs = _cost_for_order(o, prod_cost_map)
            shipping = DEFAULT_SHIPPING_COST
            payment_type = (o.get("payment_type") or "cod").lower()
            gateway = revenue * UPI_GATEWAY_FEE_RATIO if payment_type not in ("cod",) else 0.0
            gross_profit = revenue - cogs
            net_profit = gross_profit - shipping - gateway

            b = by_role.setdefault(role, {
                "role": role, "orders": 0, "revenue": 0.0,
                "cogs": 0.0, "shipping": 0.0, "gateway": 0.0,
                "gross_profit": 0.0, "net_profit": 0.0,
                "cod_orders": 0, "online_orders": 0,
            })
            b["orders"] += 1
            b["revenue"] += revenue
            b["cogs"] += cogs
            b["shipping"] += shipping
            b["gateway"] += gateway
            b["gross_profit"] += gross_profit
            b["net_profit"] += net_profit
            if payment_type == "cod":
                b["cod_orders"] += 1
                cod_revenue += revenue
            else:
                b["online_orders"] += 1
                online_revenue += revenue

            total_revenue += revenue
            total_cogs += cogs
            total_shipping += shipping
            total_gateway += gateway
            order_count += 1

        # Round for display
        for b in by_role.values():
            for k in ("revenue", "cogs", "shipping", "gateway", "gross_profit", "net_profit"):
                b[k] = round(b[k], 2)

        # Top-level P&L
        gross = total_revenue - total_cogs
        net = gross - total_shipping - total_gateway
        margin_pct = (net / total_revenue * 100) if total_revenue else 0

        return {
            "day": day,
            "totals": {
                "orders": order_count,
                "revenue": round(total_revenue, 2),
                "cogs": round(total_cogs, 2),
                "shipping": round(total_shipping, 2),
                "gateway_fees": round(total_gateway, 2),
                "gross_profit": round(gross, 2),
                "net_profit": round(net, 2),
                "net_margin_pct": round(margin_pct, 2),
                "cod_revenue": round(cod_revenue, 2),
                "online_revenue": round(online_revenue, 2),
            },
            "by_role": sorted(by_role.values(), key=lambda x: x["revenue"], reverse=True),
            "assumptions": {
                "default_cost_ratio": DEFAULT_COST_RATIO,
                "shipping_per_order": DEFAULT_SHIPPING_COST,
                "gateway_fee_pct": UPI_GATEWAY_FEE_RATIO * 100,
                "note": "Costs use product.cost_price when set, else default_cost_ratio × sale price.",
            },
        }

    @api_router.get("/finance/daily-sales/range")
    async def daily_sales_range(
        start: str = Query(..., description="YYYY-MM-DD"),
        end: str = Query(..., description="YYYY-MM-DD (inclusive)"),
        current_user: dict = Depends(_fm_or_admin),
    ):
        """Return an array of per-day totals for a date range (for the trend chart)."""
        try:
            d0 = datetime.fromisoformat(start).replace(tzinfo=timezone.utc)
            d1 = datetime.fromisoformat(end).replace(tzinfo=timezone.utc) + timedelta(days=1)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid start/end date")
        if (d1 - d0).days > 92:
            raise HTTPException(status_code=400, detail="Max 90 days")
        days: List[Dict[str, Any]] = []
        cur = d0
        while cur < d1:
            day_str = cur.date().isoformat()
            payload = await daily_sales(day=day_str, current_user=current_user)
            days.append({"day": day_str, **payload["totals"]})
            cur += timedelta(days=1)
        return {"days": days, "assumptions": {
            "default_cost_ratio": DEFAULT_COST_RATIO,
            "shipping_per_order": DEFAULT_SHIPPING_COST,
            "gateway_fee_pct": UPI_GATEWAY_FEE_RATIO * 100,
        }}

    logger.info("Finance daily-sales routes registered")
