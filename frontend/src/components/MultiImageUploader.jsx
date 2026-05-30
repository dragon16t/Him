import React, { useRef, useState } from "react";
import axios from "axios";
import { Upload, X, GripVertical, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Multi-image uploader with drag-drop, preview, reorder & delete.
 * Used on product / combo creation forms in agent store.
 * Props:
 *   value     : Array<string>  (existing image URLs)
 *   onChange  : (urls: string[]) => void
 *   max       : default 10
 */
export default function MultiImageUploader({ value = [], onChange, max = 10 }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);

  const upload = async (files) => {
    if (!files || files.length === 0) return;
    if (value.length + files.length > max) {
      toast.error(`Max ${max} images. ${value.length} already uploaded.`);
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("files", f));
      const { data } = await axios.post(`${API}/products/upload-images`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const newUrls = (data.uploaded || []).map((u) => u.url);
      const skipped = files.length - newUrls.length;
      if (skipped > 0) toast.warning(`${skipped} file(s) skipped (size/type)`);
      onChange?.([...value, ...newUrls]);
      toast.success(`${newUrls.length} image(s) uploaded`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    upload(e.dataTransfer.files);
  };

  const removeAt = (idx) => onChange?.(value.filter((_, i) => i !== idx));

  const onDragStart = (i) => setDragIdx(i);
  const onDragOver = (e, i) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === i) return;
    const next = [...value];
    const [m] = next.splice(dragIdx, 1);
    next.splice(i, 0, m);
    setDragIdx(i);
    onChange?.(next);
  };

  const resolveUrl = (u) =>
    u?.startsWith("http") ? u : `${process.env.REACT_APP_BACKEND_URL}${u || ""}`;

  return (
    <div className="space-y-2" data-testid="multi-image-uploader">
      <div
        className={`border-2 border-dashed rounded-xl p-4 text-center transition ${
          dragging ? "border-[#3B5249] bg-[#F9F8F6]" : "border-[#E5E3DB] bg-white"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <ImageIcon className="w-6 h-6 mx-auto text-[#3B5249] mb-1" />
        <p className="text-xs text-[#59615D]">
          Drag &amp; drop images here, or
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-full mt-2 text-xs h-8 border-[#3B5249] text-[#3B5249]"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          data-testid="upload-images-btn"
        >
          <Upload className="w-3.5 h-3.5 mr-1" />
          {busy ? "Uploading…" : "Browse files"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => upload(e.target.files)}
        />
        <p className="text-[10px] text-[#59615D] mt-1">
          JPG / PNG / WEBP · max 5 MB each · {value.length}/{max} used
        </p>
      </div>

      {value.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {value.map((url, i) => (
            <div
              key={`${url}-${i}`}
              draggable
              onDragStart={() => onDragStart(i)}
              onDragOver={(e) => onDragOver(e, i)}
              onDragEnd={() => setDragIdx(null)}
              className="relative group border border-[#E5E3DB] rounded-lg overflow-hidden bg-white cursor-move"
              data-testid={`img-card-${i}`}
            >
              <img src={resolveUrl(url)} alt={`Slot ${i + 1}`} className="w-full h-24 object-cover" />
              {i === 0 && (
                <div className="absolute top-1 left-1 bg-[#A66E4E] text-white text-[9px] px-1.5 py-0.5 rounded-full">Primary</div>
              )}
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="absolute top-1 right-1 bg-white/90 text-red-600 rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                data-testid={`remove-img-${i}`}
                title="Remove"
              >
                <X className="w-3 h-3" />
              </button>
              <div className="absolute bottom-1 left-1 bg-black/40 text-white rounded-full p-0.5 opacity-60">
                <GripVertical className="w-3 h-3" />
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-[#59615D]">
        Drag the cards to reorder. First image is shown as primary on the storefront.
      </p>
    </div>
  );
}
