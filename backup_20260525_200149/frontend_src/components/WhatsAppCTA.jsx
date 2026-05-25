/**
 * WhatsAppCTA — one-click WhatsApp chat-link button.
 * Builds wa.me/<phone>?text=... deep-links. No API cost, no integration.
 *
 *   <WhatsAppCTA phone="9876543210" message="Hi Suresh, just checking in about your order." label="WhatsApp" />
 */
import { MessageCircle } from "lucide-react";

function normalizePhone(p) {
  const digits = String(p || "").replace(/\D/g, "");
  if (!digits) return "";
  // Default to India (+91) when 10-digit; otherwise assume already includes country code
  return digits.length === 10 ? "91" + digits : digits;
}

export default function WhatsAppCTA({ phone, message = "", label = "WhatsApp", className = "", compact = false }) {
  const num = normalizePhone(phone);
  if (!num) return null;
  const href = `https://wa.me/${num}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={`whatsapp-${num}`}
      aria-label={`Open WhatsApp chat with ${phone}`}
      className={`inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-200 transition-colors ${className}`}
    >
      <MessageCircle className="w-3 h-3" aria-hidden="true" />
      {!compact && label}
    </a>
  );
}
