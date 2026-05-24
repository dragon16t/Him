/**
 * Lightweight skeleton placeholders + standardised empty states.
 * Use instead of plain spinners for perceived-speed boost.
 */
import { Loader2 } from "lucide-react";

export function Skeleton({ className = "" }) {
  return <div className={`bg-[#E5E3DB] rounded animate-pulse ${className}`} aria-hidden="true" />;
}

export function SkeletonText({ lines = 3, className = "" }) {
  return (
    <div className={`space-y-2 ${className}`} aria-busy="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = "" }) {
  return (
    <div className={`bg-white rounded-2xl border border-[#E5E3DB] p-4 space-y-3 ${className}`} aria-busy="true">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-2/3" />
      <SkeletonText lines={2} />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <tr className="border-b border-[#E5E3DB]">
      {[1,2,3,4,5].map(i => <td key={i} className="p-2"><Skeleton className="h-3 w-full" /></td>)}
    </tr>
  );
}

export function PageLoader({ label = "Loading…" }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F9F8F6] gap-3" role="status">
      <Loader2 className="w-8 h-8 animate-spin text-[#3B5249]" />
      <p className="text-xs text-[#59615D] uppercase tracking-wider">{label}</p>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="text-center py-10 px-4" role="status">
      {Icon && <div className="mx-auto w-12 h-12 rounded-full bg-[#F9F8F6] border border-[#E5E3DB] flex items-center justify-center mb-3"><Icon className="w-5 h-5 text-[#A0A39E]" /></div>}
      {title && <p className="font-heading text-sm font-medium text-[#2C3531] mb-1">{title}</p>}
      {description && <p className="text-xs text-[#59615D] max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
