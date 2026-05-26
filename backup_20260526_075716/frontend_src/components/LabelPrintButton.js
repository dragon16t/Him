import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

const API = "/api";

/** Single-order label print. sheet="single" (A6) or "a4" (4-up on A4). */
export default function LabelPrintButton({ orderId, sheet = "single", label = "Label", compact = false, variant = "outline" }) {
  const open = async () => {
    try {
      const res = await axios.get(`${API}/orders/${orderId}/label.pdf?sheet=${sheet}`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Label generation failed");
    }
  };
  return (
    <Button size="sm" variant={variant} onClick={open}
      className={`rounded-full text-[10px] ${compact ? "h-6 px-2" : "h-7 px-3"}`}
      data-testid={`print-label-${orderId}`}>
      <Printer className={`${compact ? "w-3 h-3" : "w-3.5 h-3.5"} mr-1`} />
      {label}
    </Button>
  );
}

/** Bulk label print for selected orders. */
export function BulkLabelButton({ orderIds = [], compact = false }) {
  const open = async () => {
    if (!orderIds.length) return toast.error("Select at least one order");
    try {
      const res = await axios.post(`${API}/orders/labels/bulk`, { order_ids: orderIds }, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Bulk label failed");
    }
  };
  return (
    <Button size="sm" onClick={open}
      className={`rounded-full text-xs bg-[#3B5249] text-white ${compact ? "h-7 px-3" : "h-8 px-4"}`}
      data-testid="bulk-label-btn">
      <Printer className="w-3.5 h-3.5 mr-1" />
      Print Labels ({orderIds.length})
    </Button>
  );
}
