import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  Upload, FileText, Image as ImageIcon, Download, Trash2,
  Eye, ZoomIn, Group, Receipt, FileDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Finance Manager: payment-proof upload + preview + grouping + download.
 * - Upload screenshots / bills / PDFs
 * - Preview image / open PDF
 * - Group by date / vendor / payment_type / department / category
 * - Bulk download as zip-style ad-hoc (links open in new tab)
 *
 * Does NOT change historical data — only organizes & groups via metadata.
 */
export default function FinanceProofsPanel() {
  const [proofs, setProofs] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [groupBy, setGroupBy] = useState("month");
  const [month, setMonth] = useState("all");
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [showAdd, setShowAdd] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const inputRef = useRef(null);

  function emptyForm() {
    return {
      title: "", vendor: "", payment_type: "expense", department: "",
      category: "", amount: "", payment_date: new Date().toISOString().slice(0, 10),
      payment_method: "bank", notes: "",
      file_url: "", filename: "",
    };
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { group_by: groupBy, year };
      if (month !== "all") params.month = month;
      const { data } = await axios.get(`${API}/finance/proofs`, { params });
      if (data.groups) {
        setGroups(data.groups);
        setProofs([]);
      } else {
        setProofs(data.proofs || []);
        setGroups([]);
      }
    } catch (e) {
      toast.error("Failed to load proofs");
    } finally {
      setLoading(false);
    }
  }, [groupBy, month, year]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const totalAmount = useMemo(() => {
    if (groups.length) return groups.reduce((s, g) => s + g.total, 0);
    return proofs.reduce((s, p) => s + (p.amount || 0), 0);
  }, [proofs, groups]);

  const uploadAndSave = async () => {
    if (!form.title.trim()) { toast.error("Title required"); return; }
    if (!form.file_url) { toast.error("Please attach a file first"); return; }
    try {
      await axios.post(`${API}/finance/proofs`, {
        ...form,
        amount: parseFloat(form.amount) || 0,
      });
      toast.success("Proof saved");
      setShowAdd(false);
      setForm(emptyForm());
      fetchData();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    }
  };

  const handleFileUpload = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await axios.post(`${API}/finance/proofs/upload`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setForm((f) => ({ ...f, file_url: data.url, filename: data.filename || file.name }));
      toast.success("File uploaded — fill in details below and save");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    }
  };

  const handleDelete = async (pid, title) => {
    if (!window.confirm(`Delete proof "${title}"?`)) return;
    try {
      await axios.delete(`${API}/finance/proofs/${pid}`);
      toast.success("Deleted");
      fetchData();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
  };

  const resolveUrl = (u) =>
    u?.startsWith("http") ? u : `${process.env.REACT_APP_BACKEND_URL}${u || ""}`;

  const downloadGroup = (g) => {
    // Sequential opens — browser handles, simulating bulk download
    g.items.forEach((p, i) => {
      if (!p.file_url) return;
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = resolveUrl(p.file_url);
        a.target = "_blank";
        a.rel = "noopener";
        a.download = p.filename || "proof";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 200);
    });
    toast.info(`Opening ${g.items.length} file(s)…`);
  };

  const isImage = (url) =>
    /\.(jpe?g|png|webp|gif)$/i.test(url || "");

  return (
    <div className="bg-white rounded-xl border border-[#E5E3DB] p-4 sm:p-5" data-testid="finance-proofs-panel">
      <div className="flex flex-col lg:flex-row justify-between gap-3 mb-4">
        <div>
          <h3 className="font-heading text-lg font-medium flex items-center gap-2">
            <Receipt className="w-5 h-5 text-[#3B5249]" />
            Payment Proofs & Bills
            <span className="text-sm text-[#59615D] font-normal">
              · Total: Rs.{totalAmount.toLocaleString("en-IN")}
            </span>
          </h3>
          <p className="text-xs text-[#59615D] mt-0.5">
            Upload screenshots, bills & receipts. Group by date / vendor / type / department.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Select value={groupBy} onValueChange={setGroupBy}>
            <SelectTrigger className="w-40 h-9 text-xs rounded-full" data-testid="group-by-select">
              <Group className="w-3.5 h-3.5 mr-1 text-[#3B5249]" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Group by Month</SelectItem>
              <SelectItem value="date">Group by Day</SelectItem>
              <SelectItem value="vendor">Group by Vendor</SelectItem>
              <SelectItem value="payment_type">Group by Payment Type</SelectItem>
              <SelectItem value="category">Group by Category</SelectItem>
              <SelectItem value="department">Group by Department</SelectItem>
            </SelectContent>
          </Select>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-32 h-9 text-xs rounded-full" data-testid="proof-month">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m,i)=>(
                <SelectItem key={i} value={(i+1).toString()}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-24 h-9 text-xs rounded-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[2024, 2025, 2026, 2027].map((y) => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="rounded-full bg-[#3B5249] text-white text-xs h-9"
            onClick={() => setShowAdd(true)}
            data-testid="upload-proof-btn"
          >
            <Upload className="w-4 h-4 mr-1" />
            Upload Proof
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-center py-10 text-sm text-[#59615D]">Loading…</p>
      ) : groups.length === 0 && proofs.length === 0 ? (
        <p className="text-center py-10 text-sm text-[#59615D]">
          No proofs uploaded yet. Click <b>Upload Proof</b> to add your first one.
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.key} className="border border-[#E5E3DB] rounded-xl overflow-hidden">
              <div className="bg-[#F9F8F6] px-3 py-2 flex justify-between items-center">
                <div>
                  <span className="font-heading font-semibold text-sm text-[#2C3531]">{g.key}</span>
                  <span className="text-[10px] text-[#59615D] ml-2">· {g.count} proof(s)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-heading font-semibold text-sm text-[#3B5249]">
                    Rs.{g.total.toLocaleString("en-IN")}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full text-[10px] h-7 border-[#3B5249] text-[#3B5249]"
                    onClick={() => downloadGroup(g)}
                    data-testid={`download-group-${g.key}`}
                  >
                    <FileDown className="w-3 h-3 mr-1" /> Download all
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-3">
                {g.items.map((p) => (
                  <ProofCard
                    key={p.id}
                    p={p}
                    resolveUrl={resolveUrl}
                    isImage={isImage}
                    onPreview={setPreviewUrl}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Payment Proof</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto pr-1">
            {!form.file_url ? (
              <div
                className="border-2 border-dashed border-[#E5E3DB] rounded-xl p-6 text-center"
              >
                <ImageIcon className="w-8 h-8 mx-auto text-[#3B5249] mb-2" />
                <p className="text-xs text-[#59615D] mb-2">
                  JPG / PNG / WEBP / PDF · max 10 MB
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full text-xs border-[#3B5249] text-[#3B5249]"
                  onClick={() => inputRef.current?.click()}
                >
                  <Upload className="w-3.5 h-3.5 mr-1" /> Choose file
                </Button>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  onChange={(e) => handleFileUpload(e.target.files?.[0])}
                />
              </div>
            ) : (
              <div className="bg-[#F9F8F6] rounded-xl p-3 flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#3B5249]" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{form.filename}</p>
                  <p className="text-[10px] text-[#59615D]">Uploaded ✓</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full text-[10px] h-7"
                  onClick={() => setForm((f) => ({ ...f, file_url: "", filename: "" }))}
                >
                  Replace
                </Button>
              </div>
            )}
            <div>
              <Label className="text-xs">Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Office rent — May"
                className="rounded-xl"
                data-testid="proof-title"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Amount</Label>
                <Input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="25000"
                  className="rounded-xl"
                  data-testid="proof-amount"
                />
              </div>
              <div>
                <Label className="text-xs">Payment Date</Label>
                <Input
                  type="date"
                  value={form.payment_date}
                  onChange={(e) => setForm((f) => ({ ...f, payment_date: e.target.value }))}
                  className="rounded-xl"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Payment Type</Label>
                <Select value={form.payment_type} onValueChange={(v) => setForm((f) => ({ ...f, payment_type: v }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Expense</SelectItem>
                    <SelectItem value="bill">Bill</SelectItem>
                    <SelectItem value="refund">Refund</SelectItem>
                    <SelectItem value="advance">Advance</SelectItem>
                    <SelectItem value="salary">Salary</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Payment Method</Label>
                <Select value={form.payment_method} onValueChange={(v) => setForm((f) => ({ ...f, payment_method: v }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank">Bank Transfer</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Vendor</Label>
                <Input
                  value={form.vendor}
                  onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
                  placeholder="e.g. KSEB"
                  className="rounded-xl"
                />
              </div>
              <div>
                <Label className="text-xs">Category</Label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="e.g. Utilities"
                  className="rounded-xl"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Department</Label>
              <Input
                value={form.department}
                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                placeholder="e.g. Operations"
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Any context…"
                className="rounded-xl"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-full bg-[#3B5249] text-white"
              onClick={uploadAndSave}
              data-testid="save-proof-btn"
            >
              Save Proof
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={!!previewUrl} onOpenChange={(v) => !v && setPreviewUrl(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Preview</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            isImage(previewUrl) ? (
              <img src={previewUrl} alt="Document" className="w-full max-h-[70vh] object-contain" />
            ) : (
              <iframe src={previewUrl} title="proof" className="w-full h-[70vh]" />
            )
          )}
          <DialogFooter>
            <Button asChild variant="outline" className="rounded-full">
              <a href={previewUrl} target="_blank" rel="noopener noreferrer" download>
                <Download className="w-4 h-4 mr-1" /> Download
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProofCard({ p, resolveUrl, isImage, onPreview, onDelete }) {
  const url = resolveUrl(p.file_url);
  return (
    <div className="border border-[#E5E3DB] rounded-lg overflow-hidden bg-white hover:shadow-sm transition" data-testid={`proof-card-${p.id}`}>
      <div className="relative bg-[#F9F8F6] h-32 flex items-center justify-center">
        {isImage(p.file_url) ? (
          <img src={url} alt={p.title} className="w-full h-full object-cover" />
        ) : (
          <FileText className="w-10 h-10 text-[#3B5249]" />
        )}
        <button
          onClick={() => onPreview(url)}
          className="absolute top-1 right-1 bg-white/90 rounded-full p-1 text-[#3B5249] hover:bg-white"
          title="Preview"
          data-testid={`preview-${p.id}`}
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-2.5">
        <p className="font-medium text-xs truncate" title={p.title}>{p.title}</p>
        <p className="text-[10px] text-[#59615D] truncate">
          {p.vendor || "—"} · {p.category || "—"}
        </p>
        <div className="flex justify-between items-center mt-1.5">
          <span className="font-heading font-semibold text-sm text-[#3B5249]">
            Rs.{(p.amount || 0).toLocaleString("en-IN")}
          </span>
          <span className="text-[10px] text-[#59615D]">{p.payment_date}</span>
        </div>
        <div className="flex gap-1 mt-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="flex-1 text-[10px] text-[#3B5249] hover:underline flex items-center justify-center gap-1 border border-[#E5E3DB] rounded-full py-1"
          >
            <Download className="w-3 h-3" /> Download
          </a>
          <button
            onClick={() => onDelete(p.id, p.title)}
            className="text-red-500 hover:bg-red-50 rounded-full p-1.5"
            title="Delete"
            data-testid={`delete-proof-${p.id}`}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
