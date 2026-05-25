import React from "react";
import { Button } from "../components/ui/button";
import { ArrowLeft } from "lucide-react";

// Shows a sticky banner whenever the current session was started via Head-of-Sales / admin proxy-login.
// Clicking "Return" pops the impersonation stack and restores the original session.
export default function ImpersonationBanner() {
  let stack = [];
  try { stack = JSON.parse(localStorage.getItem("impersonation_stack") || "[]"); } catch { stack = []; }
  if (!stack.length) return null;
  const last = stack[stack.length - 1];
  const me = JSON.parse(localStorage.getItem("user") || "null");

  const returnBack = () => {
    const newStack = stack.slice(0, -1);
    localStorage.setItem("token", last.token);
    localStorage.setItem("user", JSON.stringify(last.user));
    if (newStack.length) localStorage.setItem("impersonation_stack", JSON.stringify(newStack));
    else localStorage.removeItem("impersonation_stack");
    // route back to original user's dashboard
    const route = {
      admin: "/dashboard", sales_manager: "/sales-manager", district_manager: "/manager",
      telecaller: "/telecaller", agent: "/agent", finance_manager: "/finance",
      hr_manager: "/hr-manager", social_media_manager: "/social-media",
      assistant_sales_manager: "/assistant-sm", assistant_district_manager: "/assistant-dm",
      inhouse_telecaller: "/influencer-outreach", content_strategist: "/content-strategist",
      content_developer: "/content-developer", inventory_manager: "/inventory",
      digital_marketing_manager: "/digital-marketing",
    }[last.user.role] || "/login";
    window.location.href = route;
  };

  return (
    <div className="sticky top-0 z-50 bg-[#A66E4E] text-white px-3 py-1.5 text-xs flex items-center justify-between" data-testid="impersonation-banner">
      <span>👑 You are viewing as <b>{me?.name || me?.email}</b> · Original session: <b>{last.user.name || last.user.email}</b></span>
      <Button size="sm" variant="ghost" className="text-white hover:bg-white/20 h-6 rounded-full text-[11px]" onClick={returnBack} data-testid="impersonation-return">
        <ArrowLeft className="w-3 h-3 mr-1"/> Return to my dashboard
      </Button>
    </div>
  );
}
