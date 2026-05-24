import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const API = "/api";

/**
 * Shipping action group for an order row.
 * Props:
 *   order        — the order object (needs id, awb_number, tracking_url, status, customer_pincode, ...)
 *   role         — current user's role ("admin" | "inventory_manager" | "sales_manager" | "district_manager" | etc.)
 *   onChange     — callback after a successful ship/cancel so the parent can refresh
 *   compact      — when true, render small icon-only buttons
 */
export default function DelhiveryShipActions({ order, role, onChange, compact = false }) {
  const [busy, setBusy] = useState(false);
  const canShip = ["admin", "inventory_manager", "sales_manager"].includes(role);
  const canCancel = ["admin", "inventory_manager"].includes(role);
  const awb = order?.awb_number;

  const ship = async () => {
    if (!order?.customer_pincode || String(order.customer_pincode).length !== 6) {
      return toast.error("Customer pincode must be 6 digits before shipping");
    }
    if (!window.confirm(`Create Delhivery shipment for ${order.customer_name} (${order.customer_pincode})?`)) return;
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/shipping/delhivery/ship/${order.id}`);
      toast.success(`AWB ${data.awb_number} created`);
      onChange?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to create shipment");
    }
    setBusy(false);
  };

  const cancel = async () => {
    if (!awb) return;
    if (!window.confirm(`Cancel Delhivery shipment ${awb}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await axios.post(`${API}/shipping/delhivery/cancel/${order.id}`);
      toast.success(`AWB ${awb} cancelled`);
      onChange?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to cancel");
    }
    setBusy(false);
  };

  // Already shipped — show tracking link (visible to every role) + cancel for admin/inventory
  if (awb) {
    const url = order.tracking_url || `https://www.delhivery.com/tracking?awb=${awb}`;
    return (
      <div className="flex gap-1 flex-wrap items-center" data-testid={`ship-actions-${order.id}`}>
        <a href={url} target="_blank" rel="noreferrer" className="text-[10px] text-[#3B5249] underline" data-testid={`track-link-${order.id}`} title={`Track ${awb}`}>
          📦 {awb}
        </a>
        {canCancel && !order.shipment_cancelled && (
          <Button size="sm" variant="outline" className="rounded-full text-[9px] h-6 px-2 text-red-600 border-red-200 hover:bg-red-50" onClick={cancel} disabled={busy} data-testid={`cancel-ship-${order.id}`}>
            {busy ? "…" : "Cancel"}
          </Button>
        )}
      </div>
    );
  }

  // Not yet shipped — show Ship button for permitted roles
  if (!canShip) return null;
  if (order.status === "cancelled") return null;
  return (
    <Button size="sm" className={`rounded-full bg-[#3B5249] text-white ${compact ? "text-[9px] h-6 px-2" : "text-xs h-7"}`} onClick={ship} disabled={busy} data-testid={`ship-btn-${order.id}`}>
      {busy ? "Shipping…" : "🚚 Ship via Delhivery"}
    </Button>
  );
}
