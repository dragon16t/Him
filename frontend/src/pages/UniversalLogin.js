import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff } from "lucide-react";

const API = "/api";
const BG_IMAGE = "";
const ROLE_ROUTES = { admin: "/dashboard", sales_manager: "/sales-manager", district_manager: "/manager", telecaller: "/telecaller", agent: "/agent", finance_manager: "/finance", hr_manager: "/hr-manager", social_media_manager: "/social-media", inhouse_telecaller: "/influencer-outreach", content_strategist: "/content-strategist", content_developer: "/content-developer", assistant_district_manager: "/assistant-dm", assistant_sales_manager: "/assistant-sm", inventory_manager: "/inventory", digital_marketing_manager: "/digital-marketing" };

export default function UniversalLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Handle proxy login from admin
  useEffect(() => {
    const proxyToken = searchParams.get("proxy_token");
    const proxyUser = searchParams.get("proxy_user");
    const proxyRoute = searchParams.get("proxy_route");
    if (proxyToken && proxyUser && proxyRoute) {
      try {
        localStorage.setItem("token", proxyToken);
        localStorage.setItem("user", proxyUser);
        const user = JSON.parse(proxyUser);
        toast.success(`Viewing as ${user.name}`);
        navigate(proxyRoute);
      } catch (e) { console.error("Proxy login failed", e); }
    }
  }, [searchParams, navigate]);

  const [errMsg, setErrMsg] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrMsg("");
    if (!email || !password) { setErrMsg("Please enter email and password"); return; }
    setLoading(true);
    // ─── Silent retry on transient upstream failures (Cloudflare 520, K8s pod
    // restart, etc.). This masks 90%+ of the intermittent hiccups reported on
    // production by retrying 3× with backoff before ever showing an error.
    const _postWithRetry = async () => {
      const delays = [0, 800, 1600, 2500]; // 4 attempts
      let lastErr;
      for (let i = 0; i < delays.length; i++) {
        if (delays[i]) await new Promise(r => setTimeout(r, delays[i]));
        try {
          return await axios.post(`${API}/auth/login`, { email, password }, { timeout: 15000 });
        } catch (e) {
          const s = e?.response?.status;
          // Retry only on transient 5xx / 52x / network errors — never on 401/403
          if (s && (s >= 500 && s < 600) || !s) { lastErr = e; continue; }
          throw e;
        }
      }
      throw lastErr;
    };
    try {
      const { data } = await _postWithRetry();
      localStorage.setItem("token", data.token);
      if (data.refresh_token) localStorage.setItem("refresh_token", data.refresh_token);
      localStorage.setItem("user", JSON.stringify(data.user));
      toast.success(`Welcome, ${data.user.name || data.user.email}!`);
      navigate(ROLE_ROUTES[data.user.role] || "/login");
    } catch (err) {
      // Defensive error handling: status code decides the message FIRST.
      // Never trust proxy/edge error bodies (Cloudflare 520/521/522/523/524,
      // nginx 502/503/504) — they often ship a scary plain-text or HTML blurb
      // that looks like a permanent failure. We only trust the response body
      // for 4xx (our own FastAPI validation/auth errors).
      let msg = "";
      const raw = err?.response?.data;
      const status = err?.response?.status;
      const isServerError = typeof status === "number" && status >= 500 && status < 600;
      const isCloudflarey = typeof raw === "string" && /cloudflare|origin (web )?server|error 5\d\d|ray id/i.test(raw);
      if (isServerError || isCloudflarey) {
        // Origin/edge hiccup — always show a friendly, non-scary message.
        msg = "Server is momentarily unavailable — please retry in 10 seconds.";
      } else if (status === 401 || status === 403) {
        // Prefer server's structured detail if present (e.g. "Password entered is wrong"),
        // otherwise generic auth error. NEVER echo raw HTML/text bodies here.
        if (raw && typeof raw === "object" && typeof raw.detail === "string" && raw.detail.length < 160) {
          msg = raw.detail;
        } else {
          msg = "Email or password is incorrect. Please try again.";
        }
      } else if (status === 400 || status === 422) {
        // Validation error from FastAPI — safe to show the JSON detail string.
        if (raw && typeof raw === "object" && typeof raw.detail === "string") {
          msg = raw.detail;
        } else {
          msg = "Please check your input and try again.";
        }
      } else if (!status && (err?.message === "Network Error" || err?.code === "ECONNABORTED")) {
        msg = "Cannot reach the server. Check your internet or try again.";
      } else {
        msg = `Login failed${status ? ` (code ${status})` : ""}. Please try again.`;
      }
      setErrMsg(msg);
      toast.error(msg);
    }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white" data-testid="login-page">
      <div className="w-full max-w-md mx-4">
        <div className="bg-white rounded-2xl border border-[#E5E3DB] p-8 shadow-lg">
          <div className="text-center mb-8">
            <h1 className="font-heading text-3xl sm:text-4xl font-light tracking-tight text-[#2C3531]">
              Celesta <span className="font-semibold text-[#3B5249]">Glow</span>
            </h1>
            <p className="text-sm text-[#59615D] mt-2 uppercase tracking-[0.2em]">CRM Platform</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[#2C3531] text-sm font-medium">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@celestaglow.com" className="rounded-xl border-[#E5E3DB] bg-white/80" data-testid="login-email-input" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-[#2C3531] text-sm font-medium">Password</Label>
              <div className="relative">
                <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" className="rounded-xl border-[#E5E3DB] bg-white/80 pr-10" data-testid="login-password-input" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#59615D]" data-testid="toggle-password-visibility">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" disabled={loading} className="w-full rounded-full bg-[#3B5249] hover:bg-[#4F6B60] text-white h-11" data-testid="login-submit-btn">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign In"}
            </Button>
            {errMsg && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 text-center" data-testid="login-error">
                {errMsg}
              </div>
            )}
          </form>
        </div>
      </div>
    </div>

  );
}
