import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MONTHS = [
  {v:"1",l:"Jan"},{v:"2",l:"Feb"},{v:"3",l:"Mar"},{v:"4",l:"Apr"},
  {v:"5",l:"May"},{v:"6",l:"Jun"},{v:"7",l:"Jul"},{v:"8",l:"Aug"},
  {v:"9",l:"Sep"},{v:"10",l:"Oct"},{v:"11",l:"Nov"},{v:"12",l:"Dec"}
];

export default function MonthFilter({ month, year, day = "all", onMonthChange, onYearChange, onDayChange, showAll = true, showDay = true, className = "" }) {
  // Build day options based on selected month/year (max 31)
  const daysInMonth = (() => {
    if (month === "all" || !year) return 31;
    try { return new Date(parseInt(year), parseInt(month), 0).getDate(); } catch { return 31; }
  })();
  const days = Array.from({length: daysInMonth}, (_, i) => i + 1);

  return (
    <div className={`flex gap-1 mb-3 flex-wrap items-center ${className}`} data-testid="month-filter">
      <span className="text-[10px] text-[#59615D] font-medium mr-1 uppercase">Month:</span>
      {MONTHS.map(m => (
        <button
          key={m.v}
          onClick={() => { onMonthChange(m.v); if (onDayChange) onDayChange("all"); }}
          data-testid={`month-${m.v}`}
          className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
            month === m.v
              ? "bg-[#3B5249] text-white"
              : "bg-white border border-[#E5E3DB] text-[#59615D] hover:bg-[#F9F8F6]"
          }`}
        >
          {m.l}
        </button>
      ))}
      {showAll && (
        <button
          onClick={() => { onMonthChange("all"); if (onDayChange) onDayChange("all"); }}
          data-testid="month-all"
          className={`px-2.5 py-1 rounded-full text-[10px] font-medium ${
            month === "all"
              ? "bg-[#3B5249] text-white"
              : "bg-white border border-[#E5E3DB] text-[#59615D]"
          }`}
        >
          All
        </button>
      )}
      <Select value={year} onValueChange={(v)=>{onYearChange(v); if(onDayChange)onDayChange("all");}}>
        <SelectTrigger className="w-20 h-7 text-[10px] rounded-full ml-1" data-testid="year-select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {["2024","2025","2026","2027"].map(y => (
            <SelectItem key={y} value={y}>{y}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {showDay && onDayChange && month !== "all" && (
        <>
          <span className="text-[10px] text-[#59615D] font-medium ml-2 mr-1 uppercase">Day:</span>
          <Select value={day} onValueChange={onDayChange}>
            <SelectTrigger className="w-16 h-7 text-[10px] rounded-full" data-testid="day-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">All</SelectItem>
              {days.map(d => (
                <SelectItem key={d} value={String(d)}>{String(d).padStart(2,"0")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}
    </div>
  );
}

export const filterByMonth = (items, month, year, dateField = "created_at", day = "all") => {
  if (!items) return [];
  if (month === "all" && !year && (day === "all" || !day)) return items;
  return items.filter(item => {
    const d = item[dateField];
    if (!d) return false;
    const y = d.slice(0,4);
    const m = d.slice(5,7).replace(/^0/,"");
    const dd = d.slice(8,10).replace(/^0/,"");
    if (month !== "all" && m !== month) return false;
    if (year && y !== year) return false;
    if (day && day !== "all" && dd !== day) return false;
    return true;
  });
};
