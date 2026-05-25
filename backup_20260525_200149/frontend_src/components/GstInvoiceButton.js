import { Button } from "@/components/ui/button";
import { Receipt } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

const API = "/api";

/** GST invoice PDF — opens in new tab. */
export default function GstInvoiceButton({ orderId, compact = false }) {
  const open = async () => {
    try {
      const res = await axios.get(`${API}/orders/${orderId}/invoice.pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Invoice generation failed");
    }
  };
  return (
    <Button size="sm" variant="outline" onClick={open}
      className={`rounded-full text-[10px] border-[#A66E4E] text-[#A66E4E] hover:bg-[#A66E4E] hover:text-white ${compact ? "h-6 px-2" : "h-7 px-3"}`}
      data-testid={`gst-invoice-${orderId}`}>
      <Receipt className={`${compact ? "w-3 h-3" : "w-3.5 h-3.5"} mr-1`}/>GST Invoice
    </Button>
  );
}
