/**
 * Generic bulk-action toolbar that appears when items are selected.
 * Use across order, lead, candidate, expense lists.
 *
 *   const [sel, setSel] = useState(new Set());
 *   ...
 *   <BulkActionToolbar
 *     selectedCount={sel.size}
 *     total={items.length}
 *     onClear={()=>setSel(new Set())}
 *     actions={[
 *       { label:"Approve", onClick: approveBulk, variant:"default" },
 *       { label:"Reject",  onClick: rejectBulk,  variant:"outline" },
 *       { label:"Delete",  onClick: deleteBulk,  variant:"destructive" },
 *     ]}
 *   />
 */
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export default function BulkActionToolbar({ selectedCount, total, onClear, actions = [] }) {
  if (!selectedCount) return null;
  return (
    <div
      className="sticky top-2 z-30 flex items-center gap-3 bg-[#3B5249] text-white rounded-full px-4 py-2 shadow-lg mb-3 flex-wrap"
      role="toolbar"
      aria-label="Bulk actions"
      data-testid="bulk-action-toolbar"
    >
      <span className="text-xs font-medium">
        {selectedCount} of {total} selected
      </span>
      <div className="flex gap-1 flex-wrap ml-auto">
        {actions.map(a => (
          <Button
            key={a.label}
            size="sm"
            variant={a.variant === "destructive" ? "destructive" : "secondary"}
            className={`rounded-full h-7 text-xs ${a.variant === "destructive" ? "bg-red-600 hover:bg-red-700 text-white" : "bg-white text-[#3B5249] hover:bg-[#F9F8F6]"}`}
            onClick={a.onClick}
            disabled={a.disabled}
            data-testid={`bulk-${a.label.toLowerCase().replace(/\s+/g,"-")}`}
          >
            {a.icon ? <a.icon className="w-3 h-3 mr-1" /> : null}
            {a.label}
          </Button>
        ))}
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onClear}
        className="h-7 w-7 rounded-full text-white hover:bg-white/20"
        aria-label="Clear selection"
        data-testid="bulk-clear"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
