import React, { useEffect, useMemo, useState } from "react";
import { Calendar as CalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Reusable date-range filter with quick presets.
 * Presets: Today, Yesterday, This Week, Last Week, This Month, Last Month, This Year, Custom, All.
 * Emits { preset, from, to } via onChange(range).
 */
export default function DateRangeFilter({ value, onChange, label = "Date", compact = false }) {
  const [preset, setPreset] = useState(value?.preset || "all");
  const [from, setFrom] = useState(value?.from || "");
  const [to, setTo] = useState(value?.to || "");

  const presets = useMemo(() => {
    const today = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    const startOfWeek = (d) => { const x = new Date(d); const day = x.getDay() || 7; x.setDate(x.getDate() - day + 1); return x; };
    const sow = startOfWeek(today);
    const lwStart = new Date(sow); lwStart.setDate(lwStart.getDate() - 7);
    const lwEnd = new Date(sow); lwEnd.setDate(lwEnd.getDate() - 1);
    const som = new Date(today.getFullYear(), today.getMonth(), 1);
    const lmStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lmEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    const soy = new Date(today.getFullYear(), 0, 1);
    const yest = new Date(today); yest.setDate(yest.getDate() - 1);
    return {
      today:      { from: iso(today),   to: iso(today)   },
      yesterday:  { from: iso(yest),    to: iso(yest)    },
      this_week:  { from: iso(sow),     to: iso(today)   },
      last_week:  { from: iso(lwStart), to: iso(lwEnd)   },
      this_month: { from: iso(som),     to: iso(today)   },
      last_month: { from: iso(lmStart), to: iso(lmEnd)   },
      this_year:  { from: iso(soy),     to: iso(today)   },
      all:        { from: "",           to: ""           },
    };
  }, []);

  const applyPreset = (p) => {
    setPreset(p);
    if (p !== "custom") {
      const r = presets[p] || { from: "", to: "" };
      setFrom(r.from); setTo(r.to);
      onChange?.({ preset: p, ...r });
    }
  };

  const applyCustom = () => {
    onChange?.({ preset: "custom", from, to });
  };

  useEffect(() => {
    if (preset === "custom") applyCustom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const items = [
    { v: "all",        l: "All" },
    { v: "today",      l: "Today" },
    { v: "yesterday",  l: "Yesterday" },
    { v: "this_week",  l: "This Week" },
    { v: "last_week",  l: "Last Week" },
    { v: "this_month", l: "This Month" },
    { v: "last_month", l: "Last Month" },
    { v: "this_year",  l: "This Year" },
    { v: "custom",     l: "Custom" },
  ];

  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${compact ? "text-[10px]" : "text-xs"}`} data-testid="date-range-filter">
      {!compact && (
        <span className="text-[10px] text-[#59615D] font-medium uppercase flex items-center gap-1">
          <CalIcon className="w-3 h-3" /> {label}:
        </span>
      )}
      {items.map((i) => (
        <button
          key={i.v}
          onClick={() => applyPreset(i.v)}
          className={`px-2 py-0.5 rounded-full border transition ${
            preset === i.v
              ? "bg-[#3B5249] text-white border-[#3B5249]"
              : "bg-white text-[#59615D] border-[#E5E3DB] hover:border-[#3B5249]"
          }`}
          data-testid={`dr-${i.v}`}
        >
          {i.l}
        </button>
      ))}
      {preset === "custom" && (
        <>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-full h-7 text-[11px] w-32" data-testid="dr-from" />
          <span className="text-[10px] text-[#59615D]">→</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-full h-7 text-[11px] w-32" data-testid="dr-to" />
        </>
      )}
    </div>
  );
}

/** Helper to check if a YYYY-MM-DD date string falls in the range. */
export function isInRange(dateStr, range) {
  if (!range || range.preset === "all" || (!range.from && !range.to)) return true;
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  if (range.from && d < range.from) return false;
  if (range.to && d > range.to) return false;
  return true;
}
