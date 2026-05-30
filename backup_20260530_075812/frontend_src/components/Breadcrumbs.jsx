/**
 * Breadcrumbs — keyboard-accessible breadcrumb trail.
 *
 *   <Breadcrumbs items={[{label:"Dashboard", href:"/dashboard"}, {label:"Orders"}]} />
 */
import { ChevronRight, Home } from "lucide-react";

export default function Breadcrumbs({ items = [], className = "" }) {
  if (!items || items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className={className} data-testid="breadcrumbs">
      <ol className="flex items-center gap-1 text-[11px] text-[#59615D] dark:text-[#a6a89f]">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <li key={item.label + idx} className="flex items-center gap-1">
              {idx > 0 && <ChevronRight className="w-3 h-3 text-[#A0A39E]" aria-hidden="true" />}
              {idx === 0 && <Home className="w-3 h-3 mr-0.5" aria-hidden="true" />}
              {isLast || !item.href ? (
                <span aria-current={isLast ? "page" : undefined} className={isLast ? "font-medium text-[#2C3531] dark:text-[#e8e6df]" : ""}>
                  {item.label}
                </span>
              ) : (
                <a href={item.href} className="hover:underline focus:underline">{item.label}</a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
