import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

const API = "/api";

const ENDPOINTS = {
  orders: "/v2/export/orders.csv",
  leads: "/v2/export/leads.csv",
  commissions: "/v2/export/commissions.csv",
};

/** Universal CSV export button. type: orders | leads | commissions */
export default function CsvExportButton({ type = "orders", label = "Export CSV", filters = {}, compact = false, className = "" }) {
  const download = async () => {
    try {
      const res = await axios.get(`${API}${ENDPOINTS[type]}`, { params: filters, responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = `${type}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast.success("Downloaded");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Export failed");
    }
  };
  return (
    <Button size="sm" variant="outline" onClick={download}
      className={`rounded-full text-xs ${compact ? "h-7 px-3" : "h-8 px-4"} ${className}`}
      data-testid={`csv-export-${type}`}>
      <Download className={`${compact ? "w-3 h-3" : "w-3.5 h-3.5"} mr-1`} />{label}
    </Button>
  );
}
