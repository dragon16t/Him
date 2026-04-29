import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MONTHS = [
  {v:"1",l:"Jan"},{v:"2",l:"Feb"},{v:"3",l:"Mar"},{v:"4",l:"Apr"},
  {v:"5",l:"May"},{v:"6",l:"Jun"},{v:"7",l:"Jul"},{v:"8",l:"Aug"},
  {v:"9",l:"Sep"},{v:"10",l:"Oct"},{v:"11",l:"Nov"},{v:"12",l:"Dec"}
];

export default function MonthFilter({ month, year, onMonthChange, onYearChange, showAll = true, className = "" }) {
  return (
    <div className={`flex gap-1 mb-3 flex-wrap items-center ${className}`} data-testid="month-filter">
      <span className="text-[10px] text-[#59615D] font-medium mr-1 uppercase">Filter:</span>
      {MONTHS.map(m => (
        <button
          key={m.v}
          onClick={() => onMonthChange(m.v)}
          data-testid={`month-${m.v}`}
          className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
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
          onClick={() => onMonthChange("all")}
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
      <Select value={year} onValueChange={onYearChange}>
        <SelectTrigger className="w-20 h-7 text-[10px] rounded-full ml-1" data-testid="year-select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {["2024","2025","2026","2027"].map(y => (
            <SelectItem key={y} value={y}>{y}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export const filterByMonth = (items, month, year, dateField = "created_at") => {
  if (!items) return [];
  if (month === "all" && !year) return items;
  return items.filter(item => {
    const d = item[dateField];
    if (!d) return false;
    const m = d.slice(5,7).replace(/^0/,"");
    const y = d.slice(0,4);
    if (month !== "all" && m !== month) return false;
    if (year && y !== year) return false;
    return true;
  });
};
