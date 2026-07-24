import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Package, Calendar as CalendarIcon, Filter, Loader2, FileSpreadsheet } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

// ── Amazon Bulk Pickup Sheet Exporter (Inventory Manager)
// Lets the IM filter orders by date + payment mode and download an .xlsx that
// exactly matches Amazon's IN Schedule Pickup V2 template — auto-filled with
// customer address, order value (GST-inclusive), weight 250g, dims 9×6×3.
export default function AmazonPickupExportPanel() {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);

  const [orderDate, setOrderDate] = useState(""); // "" = all dates by default
  const [paymentType, setPaymentType] = useState("all"); // all | cod | prepaid
  const [status, setStatus] = useState("all");
  const [pickupDate, setPickupDate] = useState(tomorrow); // YYYY-MM-DD
  const [pickupTime, setPickupTime] = useState("11:00"); // Amazon spec: HH:MM format
  const [weightKg, setWeightKg] = useState(0.25);
  const [dimL, setDimL] = useState(9);
  const [dimW, setDimW] = useState(6);
  const [dimH, setDimH] = useState(3);

  const [preview, setPreview] = useState({ count: 0, sample: [] });
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const fetchPreview = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (orderDate) params.set("order_date", orderDate);
      params.set("payment_type", paymentType);
      params.set("status", status);
      const { data } = await axios.get(`${API}/inventory/amazon-pickup/preview?${params.toString()}`);
      setPreview(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Preview failed");
      setPreview({ count: 0, sample: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPreview();
  }, [orderDate, paymentType, status]);

  const ddmmyyyy = useMemo(() => {
    if (!pickupDate) return "";
    const [y, m, d] = pickupDate.split("-");
    return `${d}-${m}-${y}`;
  }, [pickupDate]);

  const download = async () => {
    if (!preview.count) {
      toast.error("No orders match these filters");
      return;
    }
    setDownloading(true);
    try {
      const params = new URLSearchParams();
      if (orderDate) params.set("order_date", orderDate);
      params.set("payment_type", paymentType);
      params.set("status", status);
      params.set("pickup_date", ddmmyyyy);
      params.set("pickup_time", pickupTime);
      params.set("weight_kg", weightKg);
      params.set("length_cm", dimL);
      params.set("width_cm", dimW);
      params.set("height_cm", dimH);
      const resp = await axios.get(
        `${API}/inventory/amazon-pickup/export?${params.toString()}`,
        { responseType: "blob" }
      );
      const blob = new Blob([resp.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Amazon_Pickup_${orderDate || "all"}_${paymentType}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      const overCap = Number(resp.headers?.["x-over-cap-count"] || 0);
      const overCapIds = resp.headers?.["x-over-cap-ids"] || "";
      if (overCap > 0) {
        toast.warning(
          `${overCap} order${overCap > 1 ? "s" : ""} exceed ₹50,000 (Amazon's limit): ${overCapIds}. Consider splitting.`,
          { duration: 8000 }
        );
      }
      toast.success(`Downloaded ${preview.count} orders as Amazon pickup sheet`);
    } catch (e) {
      const msg = e.response?.data instanceof Blob
        ? "Download failed"
        : (e.response?.data?.detail || "Download failed");
      toast.error(msg);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="amazon-pickup-panel">
      {/* Header */}
      <div className="bg-white rounded-xl border border-[#E5E3DB] p-4">
        <div className="flex items-center gap-2 mb-1">
          <FileSpreadsheet className="w-5 h-5 text-[#3B5249]" />
          <h2 className="font-heading text-base font-medium text-[#2C3531]">
            Amazon Bulk Pickup Sheet
          </h2>
        </div>
        <p className="text-xs text-[#59615D]">
          Auto-fills Amazon&apos;s IN Schedule Pickup V2 template (44 columns) with
          your CRM orders. Weight, dimensions, and GST-inclusive pricing are
          pre-set so you just download &amp; upload to Amazon Seller Central.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-[#E5E3DB] p-4">
        <div className="flex items-center gap-2 mb-3 text-sm font-medium text-[#2C3531]">
          <Filter className="w-4 h-4 text-[#3B5249]" />
          Filter orders
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-[11px]">Order date</Label>
            <Input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              data-testid="amz-order-date"
            />
            <div className="flex gap-1 mt-1 flex-wrap">
              <button
                type="button"
                onClick={() => setOrderDate("")}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition ${orderDate === "" ? "bg-[#3B5249] text-white border-[#3B5249]" : "bg-white text-[#3B5249] border-[#E5E3DB] hover:bg-[#F9F8F6]"}`}
                data-testid="amz-preset-all"
              >All dates</button>
              <button
                type="button"
                onClick={() => setOrderDate(today)}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition ${orderDate === today ? "bg-[#3B5249] text-white border-[#3B5249]" : "bg-white text-[#3B5249] border-[#E5E3DB] hover:bg-[#F9F8F6]"}`}
                data-testid="amz-preset-today"
              >Today</button>
              <button
                type="button"
                onClick={() => setOrderDate(new Date(Date.now() - 86400_000).toISOString().slice(0, 10))}
                className="text-[10px] px-2 py-0.5 rounded-full border bg-white text-[#3B5249] border-[#E5E3DB] hover:bg-[#F9F8F6]"
                data-testid="amz-preset-yesterday"
              >Yesterday</button>
            </div>
          </div>
          <div>
            <Label className="text-[11px]">Payment mode</Label>
            <select
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value)}
              className="w-full h-10 rounded-md border border-[#E5E3DB] px-3 text-sm bg-white"
              data-testid="amz-payment-type"
            >
              <option value="all">All (COD + Prepaid)</option>
              <option value="cod">COD only</option>
              <option value="prepaid">Prepaid only (UPI / Razorpay)</option>
            </select>
          </div>
          <div>
            <Label className="text-[11px]">Order status</Label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full h-10 rounded-md border border-[#E5E3DB] px-3 text-sm bg-white"
              data-testid="amz-status"
            >
              <option value="all">All statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="pending,confirmed,processing">Ready to ship</option>
            </select>
          </div>
          <div className="flex items-end">
            <div className="bg-[#F9F8F6] rounded-lg px-3 py-2 w-full text-center">
              <div className="text-[9px] text-[#59615D] uppercase tracking-wide">Matches</div>
              <div className="text-2xl font-semibold text-[#2C3531]" data-testid="amz-match-count">
                {loading ? "..." : preview.count}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Package settings */}
      <div className="bg-white rounded-xl border border-[#E5E3DB] p-4">
        <div className="flex items-center gap-2 mb-3 text-sm font-medium text-[#2C3531]">
          <Package className="w-4 h-4 text-[#3B5249]" />
          Package &amp; pickup details
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div>
            <Label className="text-[11px]">Weight (KG)</Label>
            <Input
              type="number" step="0.01" min="0.01" max="18"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              data-testid="amz-weight"
            />
          </div>
          <div>
            <Label className="text-[11px]">Length (cm) <span className="text-[#59615D]">≤ 70</span></Label>
            <Input type="number" max="70" step="0.1" value={dimL} onChange={(e) => setDimL(e.target.value)} data-testid="amz-length" />
          </div>
          <div>
            <Label className="text-[11px]">Width (cm) <span className="text-[#59615D]">≤ 70</span></Label>
            <Input type="number" max="70" step="0.1" value={dimW} onChange={(e) => setDimW(e.target.value)} data-testid="amz-width" />
          </div>
          <div>
            <Label className="text-[11px]">Height (cm) <span className="text-[#59615D]">≤ 45</span></Label>
            <Input type="number" max="45" step="0.1" value={dimH} onChange={(e) => setDimH(e.target.value)} data-testid="amz-height" />
          </div>
          <div>
            <Label className="text-[11px]">
              <CalendarIcon className="w-3 h-3 inline mr-0.5" />
              Pickup date
            </Label>
            <Input
              type="date"
              value={pickupDate}
              onChange={(e) => setPickupDate(e.target.value)}
              data-testid="amz-pickup-date"
            />
          </div>
          <div>
            <Label className="text-[11px]">Pickup slot (HH:MM)</Label>
            <select
              value={pickupTime}
              onChange={(e) => setPickupTime(e.target.value)}
              className="w-full h-10 rounded-md border border-[#E5E3DB] px-3 text-sm bg-white"
              data-testid="amz-pickup-slot"
            >
              <option value="10:00">10:00</option>
              <option value="11:00">11:00</option>
              <option value="12:00">12:00</option>
              <option value="13:00">13:00</option>
              <option value="14:00">14:00</option>
              <option value="15:00">15:00</option>
              <option value="16:00">16:00</option>
            </select>
          </div>
        </div>
        <div className="mt-3 text-[11px] text-[#59615D] bg-[#F9F8F6] rounded-md px-3 py-2">
          Product Value = order total (GST-inclusive). CGST / SGST / IGST are kept at 0 to avoid double-tax on COD collection.
        </div>
      </div>

      {/* Preview + download */}
      <div className="bg-white rounded-xl border border-[#E5E3DB] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium text-[#2C3531]">
            Preview <span className="text-[#59615D] font-normal">({preview.sample?.length || 0} of {preview.count})</span>
          </div>
          <Button
            onClick={download}
            disabled={downloading || !preview.count}
            className="rounded-full bg-[#3B5249] hover:bg-[#2C3531] text-white"
            data-testid="amz-download-btn"
          >
            {downloading ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Building sheet...</>
            ) : (
              <><Download className="w-3.5 h-3.5 mr-1.5" />Download Amazon sheet ({preview.count})</>
            )}
          </Button>
        </div>
        {preview.sample?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="amz-preview-table">
              <thead>
                <tr className="text-left text-[#59615D] uppercase text-[10px] border-b border-[#E5E3DB]">
                  <th className="py-2 pr-3">Order ID</th>
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3">Phone</th>
                  <th className="py-2 pr-3">City</th>
                  <th className="py-2 pr-3">State</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2 pr-3">Payment</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.sample.map((o) => (
                  <tr key={o.id} className="border-b border-[#F3F1EB]">
                    <td className="py-1.5 pr-3 font-mono text-[10px]">{o.id}</td>
                    <td className="py-1.5 pr-3">{o.customer_name}</td>
                    <td className="py-1.5 pr-3">{o.customer_phone}</td>
                    <td className="py-1.5 pr-3">{o.customer_city}</td>
                    <td className="py-1.5 pr-3">{o.customer_state}</td>
                    <td className="py-1.5 pr-3 text-right">₹{o.total_amount}</td>
                    <td className="py-1.5 pr-3">
                      <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded-full ${
                        (o.payment_type || "").toLowerCase() === "cod"
                          ? "bg-amber-50 text-amber-800 border border-amber-200"
                          : "bg-green-50 text-green-800 border border-green-200"
                      }`}>
                        {(o.payment_type || "cod").toUpperCase()}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3">{o.status || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[#59615D] py-6 text-center">
            No orders match these filters. Try widening the date or payment mode.
          </p>
        )}
      </div>
    </div>
  );
}
