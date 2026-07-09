import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const API = "/api";

/**
 * Shipping action group for an order row. Supports two flows:
 *   1. Delhivery (auto AWB) — if user has Delhivery permission & pincode is valid
 *   2. Self-Shipping (manual courier / in-house delivery) — no AWB, just records courier + tracking
 *
 * Props:
 *   order        — the order object
 *   role         — current user's role
 *   onChange     — callback after a successful ship/cancel so the parent can refresh
 *   compact      — when true, render small icon-only buttons
 */
export default function DelhiveryShipActions({ order, role, onChange, compact = false }) {
  const [busy, setBusy] = useState(false);
  const [selfDialogOpen, setSelfDialogOpen] = useState(false);
  const [selfForm, setSelfForm] = useState({ courier_name: "Self Delivery", tracking_number: "", tracking_link: "" });

  const canShipDelhivery = ["admin", "inventory_manager", "sales_manager"].includes(role);
  const canShipSelf = ["admin", "inventory_manager", "sales_manager", "district_manager", "hr_manager"].includes(role);
  const canCancel = ["admin", "inventory_manager"].includes(role);
  const awb = order?.awb_number;
  const isSelfShipped = order?.self_shipped || order?.courier === "self";

  const shipDelhivery = async () => {
    if (!order?.customer_pincode || String(order.customer_pincode).length !== 6) {
      return toast.error("Customer pincode must be 6 digits for Delhivery");
    }
    if (!window.confirm(`Create Delhivery shipment for ${order.customer_name} (${order.customer_pincode})?`)) return;
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/shipping/delhivery/ship/${order.id}`);
      toast.success(`AWB ${data.awb_number} created`);
      onChange?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to create Delhivery shipment");
    }
    setBusy(false);
  };

  const shipSelf = async () => {
    setBusy(true);
    try {
      await axios.post(`${API}/shipping/self/ship/${order.id}`, selfForm);
      toast.success(`Self-shipped via ${selfForm.courier_name || "Self Delivery"}`);
      setSelfDialogOpen(false);
      onChange?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to self-ship");
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

  const downloadLabel = async () => {
    if (!awb) return;
    setBusy(true);
    try {
      const r = await axios.get(`${API}/shipping/delhivery/label/${order.id}`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([r.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url; a.download = `delhivery-label-${awb}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success("Delhivery label downloaded");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to download label");
    }
    setBusy(false);
  };

  // Already shipped — show appropriate badge
  if (awb) {
    const url = order.tracking_url || `https://www.delhivery.com/tracking?awb=${awb}`;
    return (
      <div className="flex gap-1 flex-wrap items-center" data-testid={`ship-actions-${order.id}`}>
        <a href={url} target="_blank" rel="noreferrer" className="text-[10px] text-[#3B5249] underline" data-testid={`track-link-${order.id}`} title={`Track ${awb}`}>
          📦 {awb}
        </a>
        <Button size="sm" variant="outline" className="rounded-full text-[9px] h-6 px-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50" onClick={downloadLabel} disabled={busy} data-testid={`download-label-${order.id}`} title="Download Delhivery shipping label PDF">
          {busy ? "…" : "🏷 Label"}
        </Button>
        {canCancel && !order.shipment_cancelled && (
          <Button size="sm" variant="outline" className="rounded-full text-[9px] h-6 px-2 text-red-600 border-red-200 hover:bg-red-50" onClick={cancel} disabled={busy} data-testid={`cancel-ship-${order.id}`}>
            {busy ? "…" : "Cancel"}
          </Button>
        )}
      </div>
    );
  }

  if (isSelfShipped) {
    return (
      <div className="flex gap-1 items-center text-[10px] text-[#3B5249]" data-testid={`self-shipped-${order.id}`}>
        🚶 {order.courier_name || "Self Delivery"}
        {order.tracking_number ? <span className="text-[#A66E4E]">#{order.tracking_number}</span> : null}
      </div>
    );
  }

  if (order.status === "cancelled") return null;
  if (!canShipDelhivery && !canShipSelf) return null;

  return (
    <>
      <div className="flex gap-1 flex-wrap items-center" data-testid={`ship-options-${order.id}`}>
        {canShipDelhivery && (
          <Button size="sm" className={`rounded-full bg-[#3B5249] text-white hover:bg-[#2C3531] ${compact ? "text-[9px] h-6 px-2" : "text-xs h-7"}`} onClick={shipDelhivery} disabled={busy} data-testid={`ship-delhivery-btn-${order.id}`}>
            {busy ? "…" : "🚚 Delhivery"}
          </Button>
        )}
        {canShipSelf && (
          <Button size="sm" variant="outline" className={`rounded-full border-[#A66E4E] text-[#A66E4E] hover:bg-[#A66E4E]/10 ${compact ? "text-[9px] h-6 px-2" : "text-xs h-7"}`} onClick={() => setSelfDialogOpen(true)} disabled={busy} data-testid={`ship-self-btn-${order.id}`}>
            🚶 Self-Ship
          </Button>
        )}
      </div>

      <Dialog open={selfDialogOpen} onOpenChange={setSelfDialogOpen}>
        <DialogContent className="sm:max-w-md" data-testid={`self-ship-dialog-${order.id}`}>
          <DialogHeader>
            <DialogTitle className="text-[#3B5249]">Self-Ship Order</DialogTitle>
            <p className="text-xs text-[#59615D]">Use this for in-house delivery, walk-in pickup, or any non-Delhivery courier (DTDC, India Post, Bluedart, etc.).</p>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Courier / Method *</Label>
              <Input value={selfForm.courier_name} onChange={e => setSelfForm({ ...selfForm, courier_name: e.target.value })} placeholder="e.g. Self Delivery, DTDC, India Post" data-testid="self-ship-courier-input" />
            </div>
            <div>
              <Label className="text-xs">Tracking Number (optional)</Label>
              <Input value={selfForm.tracking_number} onChange={e => setSelfForm({ ...selfForm, tracking_number: e.target.value })} placeholder="e.g. TRK123456" data-testid="self-ship-tracking-input" />
            </div>
            <div>
              <Label className="text-xs">Tracking Link (optional)</Label>
              <Input value={selfForm.tracking_link} onChange={e => setSelfForm({ ...selfForm, tracking_link: e.target.value })} placeholder="https://..." data-testid="self-ship-link-input" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelfDialogOpen(false)} data-testid="self-ship-cancel-btn">Cancel</Button>
            <Button className="bg-[#3B5249] text-white hover:bg-[#2C3531]" onClick={shipSelf} disabled={busy || !selfForm.courier_name.trim()} data-testid="self-ship-confirm-btn">
              {busy ? "Shipping…" : "Mark Shipped"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
