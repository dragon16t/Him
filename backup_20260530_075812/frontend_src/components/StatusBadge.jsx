/**
 * StatusBadge — accessible status pill with icon (not color-only).
 * Solves the audit's "color-blind-safe status badges" item.
 *
 *   <StatusBadge status="delivered" />
 *   <StatusBadge status="pending" label="In Review" />
 */
import {
  CheckCircle2, Clock, Truck, Package, XCircle, AlertCircle,
  Phone, PhoneOff, ThumbsDown, ThumbsUp, Sparkles, IndianRupee,
} from "lucide-react";

const MAP = {
  // Order lifecycle
  pending:        { Icon: Clock,         color: "bg-amber-50 text-amber-800 border-amber-200" },
  confirmed:      { Icon: CheckCircle2,  color: "bg-blue-50 text-blue-800 border-blue-200" },
  approved:       { Icon: CheckCircle2,  color: "bg-blue-50 text-blue-800 border-blue-200" },
  shipped:        { Icon: Truck,         color: "bg-violet-50 text-violet-800 border-violet-200" },
  delivered:      { Icon: Package,       color: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  cancelled:      { Icon: XCircle,       color: "bg-rose-50 text-rose-800 border-rose-200" },
  // Lead pipeline
  new:            { Icon: Sparkles,      color: "bg-sky-50 text-sky-800 border-sky-200" },
  interested:     { Icon: ThumbsUp,      color: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  follow_up:      { Icon: Phone,         color: "bg-amber-50 text-amber-800 border-amber-200" },
  callback:       { Icon: Phone,         color: "bg-cyan-50 text-cyan-800 border-cyan-200" },
  no_response:    { Icon: PhoneOff,      color: "bg-orange-50 text-orange-800 border-orange-200" },
  busy:           { Icon: AlertCircle,   color: "bg-amber-50 text-amber-800 border-amber-200" },
  not_interested: { Icon: ThumbsDown,    color: "bg-rose-50 text-rose-800 border-rose-200" },
  ordered:        { Icon: Package,       color: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  order_created:  { Icon: Package,       color: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  converted:      { Icon: CheckCircle2,  color: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  routed_to_collab:{Icon: Sparkles,     color: "bg-violet-50 text-violet-800 border-violet-200" },
  // Commission/payment
  paid:           { Icon: IndianRupee,   color: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  to_be_paid:     { Icon: Clock,         color: "bg-amber-50 text-amber-800 border-amber-200" },
};

const DEFAULT = { Icon: AlertCircle, color: "bg-gray-50 text-gray-700 border-gray-200" };

export default function StatusBadge({ status, label, className = "" }) {
  const key = String(status || "").toLowerCase();
  const { Icon, color } = MAP[key] || DEFAULT;
  const text = label || key.replace(/_/g, " ");
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${color} ${className}`}
      data-testid={`status-badge-${key}`}
      role="status"
      aria-label={`Status: ${text}`}
    >
      <Icon className="w-3 h-3" aria-hidden="true" />
      {text}
    </span>
  );
}
