import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle } from "lucide-react";

const API = "/api";

/** Bulk lead CSV import (P2 #17). CSV columns: name, phone, source, product_interest, remarks. */
export default function BulkLeadImportButton({ onImported }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const upload = async () => {
    if (!file) return toast.error("Select a CSV file");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await axios.post(`${API}/leads/bulk-import`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setResult(data);
      toast.success(`Imported ${data.created} leads · ${data.duplicates_skipped} duplicates skipped`);
      onImported && onImported();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Import failed");
    } finally { setBusy(false); }
  };

  return (
    <>
      <Button size="sm" onClick={() => { setResult(null); setFile(null); setOpen(true); }}
        className="rounded-full bg-[#A66E4E] text-white text-xs h-8" data-testid="bulk-import-btn">
        <Upload className="w-3.5 h-3.5 mr-1"/>Bulk Import
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader><DialogTitle className="font-heading flex items-center gap-2"><FileSpreadsheet className="w-5 h-5"/>Bulk Lead Import</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl bg-[#F9F8F6] border border-[#E5E3DB] p-3 text-xs">
              <p className="font-semibold mb-1">CSV columns (header row required):</p>
              <code className="text-[10px] block bg-white border border-[#E5E3DB] rounded p-2">name, phone, source, product_interest, remarks</code>
              <p className="text-[#59615D] mt-2">Phone is auto-normalized. Duplicates skipped. Active telecallers get round-robin assignment.</p>
            </div>
            <input type="file" accept=".csv" onChange={e => setFile(e.target.files?.[0])}
              className="block w-full text-xs file:mr-2 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:bg-[#3B5249] file:text-white hover:file:bg-[#2C3531]"
              data-testid="bulk-import-file"/>
            {result && (
              <div className="rounded-xl bg-white border border-[#E5E3DB] p-3 space-y-1 text-xs">
                <p className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-600"/>Created: <b>{result.created}</b></p>
                <p className="flex items-center gap-2"><AlertCircle className="w-3.5 h-3.5 text-amber-600"/>Duplicates skipped: <b>{result.duplicates_skipped}</b></p>
                {result.errors?.length > 0 && <div><p className="text-red-600 mt-1">Errors:</p><ul className="text-[10px] text-red-600 list-disc pl-4">{result.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
              </div>
            )}
            <Button onClick={upload} disabled={busy || !file} className="w-full rounded-full bg-[#3B5249] text-white" data-testid="bulk-import-submit">
              {busy ? "Importing…" : "Upload & Import"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
