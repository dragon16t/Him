/**
 * Pagination — accessible page-number bar.
 *
 *   <Pagination page={1} pageSize={25} total={120} onChange={setPage} />
 */
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function Pagination({ page = 1, pageSize = 25, total = 0, onChange, className = "" }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  const goto = (p) => onChange?.(Math.max(1, Math.min(totalPages, p)));
  // Compact page list: 1, ..., page-1, page, page+1, ..., last
  const pages = [];
  const add = (p) => { if (!pages.includes(p)) pages.push(p); };
  add(1);
  if (page - 1 > 2) add("…l");
  for (let p = Math.max(2, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) add(p);
  if (page + 1 < totalPages - 1) add("…r");
  if (totalPages > 1) add(totalPages);

  return (
    <nav aria-label="Pagination" className={`flex items-center gap-1 ${className}`} data-testid="pagination">
      <button
        type="button"
        onClick={() => goto(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
        data-testid="pagination-prev"
        className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-[#E5E3DB] dark:border-[#2d3530] text-[#2C3531] dark:text-[#e8e6df] hover:bg-[#F9F8F6] dark:hover:bg-[#262f2c] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ChevronLeft className="w-4 h-4" aria-hidden="true" />
      </button>
      {pages.map((p, i) =>
        typeof p === "string" ? (
          <span key={p + i} aria-hidden="true" className="px-1 text-[#A0A39E]">…</span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => goto(p)}
            aria-current={p === page ? "page" : undefined}
            data-testid={`pagination-page-${p}`}
            className={`h-8 min-w-[2rem] px-2 rounded-full border text-[11px] font-medium transition-colors ${
              p === page
                ? "bg-[#3B5249] text-white border-[#3B5249]"
                : "border-[#E5E3DB] dark:border-[#2d3530] text-[#2C3531] dark:text-[#e8e6df] hover:bg-[#F9F8F6] dark:hover:bg-[#262f2c]"
            }`}
          >
            {p}
          </button>
        )
      )}
      <button
        type="button"
        onClick={() => goto(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
        data-testid="pagination-next"
        className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-[#E5E3DB] dark:border-[#2d3530] text-[#2C3531] dark:text-[#e8e6df] hover:bg-[#F9F8F6] dark:hover:bg-[#262f2c] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ChevronRight className="w-4 h-4" aria-hidden="true" />
      </button>
      <span className="ml-2 text-[10px] text-[#59615D] dark:text-[#a6a89f]">
        Showing {Math.min((page - 1) * pageSize + 1, total)}-{Math.min(page * pageSize, total)} of {total}
      </span>
    </nav>
  );
}
