import React, { Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import axios from "axios";
import UniversalLogin from "@/pages/UniversalLogin";
import PhotoCapture from "@/pages/PhotoCapture";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { PageLoader } from "@/components/Skeletons";

// ===== Proxy-tab isolation (FIX: admin's tab no longer gets overwritten on impersonation) =====
// When a new tab opens via /login?proxy_token=..., we run in "isolated" mode where ALL
// localStorage reads/writes are transparently redirected to sessionStorage. This prevents
// the proxy session from corrupting the admin tab's localStorage (they share the same origin).
(function setupProxyIsolation() {
  if (typeof window === "undefined") return;
  const hasProxyParam = new URLSearchParams(window.location.search).has("proxy_token");
  const alreadyIsolated = sessionStorage.getItem("__cg_isolated") === "1";
  if (!hasProxyParam && !alreadyIsolated) return;
  sessionStorage.setItem("__cg_isolated", "1");
  // Patch localStorage to delegate to sessionStorage for THIS tab only
  const proxy = new Proxy(window.localStorage, {
    get(target, prop) {
      if (prop === "getItem") return (k) => window.sessionStorage.getItem(k);
      if (prop === "setItem") return (k, v) => window.sessionStorage.setItem(k, v);
      if (prop === "removeItem") return (k) => window.sessionStorage.removeItem(k);
      if (prop === "clear") return () => window.sessionStorage.clear();
      if (prop === "key") return (i) => window.sessionStorage.key(i);
      if (prop === "length") return window.sessionStorage.length;
      const v = target[prop];
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  try { Object.defineProperty(window, "localStorage", { value: proxy, configurable: true }); }
  catch (e) { console.warn("Could not isolate localStorage:", e); }
})();

const TelecallerDashboard = React.lazy(() => import("@/pages/TelecallerDashboard"));
const ManagerDashboard = React.lazy(() => import("@/pages/ManagerDashboard"));
const AgentPortal = React.lazy(() => import("@/pages/AgentPortal"));
const Storefront = React.lazy(() => import("@/pages/Storefront"));
const AdminCRMPanel = React.lazy(() => import("@/pages/AdminCRMPanel"));
const SalesManagerDashboard = React.lazy(() => import("@/pages/SalesManagerDashboard"));
const FinanceManagerDashboard = React.lazy(() => import("@/pages/FinanceManagerDashboard"));
const HRManagerDashboard = React.lazy(() => import("@/pages/HRManagerDashboard"));
const SocialMediaDashboard = React.lazy(() => import("@/pages/SocialMediaDashboard"));
const InHouseTelecallerDashboard = React.lazy(() => import("@/pages/InHouseTelecallerDashboard"));
const ContentStrategistDashboard = React.lazy(() => import("@/pages/ContentStrategistDashboard"));
const ContentDeveloperDashboard = React.lazy(() => import("@/pages/ContentDeveloperDashboard"));
const AssistantManagerDashboard = React.lazy(() => import("@/pages/AssistantManagerDashboard"));
const InventoryManagerDashboard = React.lazy(() => import("@/pages/InventoryManagerDashboard"));
const DigitalMarketingDashboard = React.lazy(() => import("@/pages/DigitalMarketingDashboard"));
const LiveOpsWall = React.lazy(() => import("@/pages/LiveOpsWall"));

axios.defaults.baseURL = process.env.REACT_APP_BACKEND_URL;
// Storefront paths use their own per-agent token (agent-token-<slug>). Never inject the
// admin/CRM token on those calls, and never overwrite an Authorization header that the
// caller has already set explicitly.
const _isStoreUrl = (url = "") =>
  url.includes("/api/store/") ||
  url.includes("/api/store-agent/") ||
  url.includes("/store/") && url.includes("/order");
axios.interceptors.request.use((config) => {
  const url = config.url || "";
  // Respect explicit Authorization header set by caller
  const hasExplicitAuth = !!(config.headers && (config.headers.Authorization || config.headers.authorization));
  if (_isStoreUrl(url) && !hasExplicitAuth) return config;
  if (hasExplicitAuth) return config;
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh access token on 401 using stored refresh_token. Falls back to logout.
let _refreshPromise = null;
async function _doRefresh() {
  const rt = localStorage.getItem("refresh_token");
  if (!rt) return null;
  try {
    const { data } = await axios.post("/api/auth/refresh", { refresh_token: rt }, {
      headers: { "X-Skip-Auth-Refresh": "1" },
    });
    if (data?.token) {
      localStorage.setItem("token", data.token);
      return data.token;
    }
  } catch (_) {}
  return null;
}
axios.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config || {};
    const status = error.response?.status;
    const url = original.url || "";
    // ─── AUTO-RETRY ON TRANSIENT UPSTREAM FAILURES (Cloudflare 520, K8s pod
    // restarts, 502/503/504, network errors). Silent, exponential backoff, max 3
    // extra attempts. This masks 90%+ of intermittent hiccups so users never see
    // the scary Cloudflare error page during normal work.
    const transient = (!status) || (status >= 500 && status < 600) || (status >= 520 && status <= 524);
    if (transient && !original._retryCount) original._retryCount = 0;
    if (transient && original._retryCount < 3 && original.method !== "delete") {
      original._retryCount += 1;
      await new Promise(r => setTimeout(r, 500 * original._retryCount * original._retryCount));
      try { return await axios(original); } catch (_) { /* fall through to normal handling */ }
    }
    // Storefront / agent-portal 401s must NOT clear admin localStorage or redirect to /login.
    // The storefront has its own auth flow (agent-token-<slug>).
    if (_isStoreUrl(url)) {
      return Promise.reject(error);
    }
    // Skip refresh attempts on auth endpoints + already-retried calls
    const isAuthCall = url.includes("/auth/login") || url.includes("/auth/refresh") || original.headers?.["X-Skip-Auth-Refresh"];
    if (status === 401 && !isAuthCall && !original._retried) {
      original._retried = true;
      _refreshPromise = _refreshPromise || _doRefresh().finally(() => { _refreshPromise = null; });
      const newToken = await _refreshPromise;
      if (newToken) {
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return axios(original);
      }
      // Refresh failed → logout
      localStorage.clear();
      window.location.href = "/login";
    } else if (status === 401) {
      localStorage.clear();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

function ProtectedRoute({ children, allowedRoles }) {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "null");
  if (!token || !user) return <Navigate to="/login" />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/login" />;
  return children;
}

function useHideBadge() {
  React.useEffect(() => {
    const hide = () => { const badge = document.getElementById('emergent-badge'); if (badge) badge.remove(); };
    hide(); const t = setInterval(hide, 500);
    const obs = new MutationObserver(hide);
    obs.observe(document.body, { childList: true });
    return () => { obs.disconnect(); clearInterval(t); };
  }, []);
}

function useDarkMode() {
  React.useEffect(() => {
    const t = localStorage.getItem("theme");
    if (t === "dark") document.documentElement.classList.add("dark");
  }, []);
}

// Top-level Error Boundary — prevents whole-app white-screen on render errors
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error("[ErrorBoundary]", error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#F9F8F6] p-6" role="alert">
          <div className="max-w-md w-full bg-white rounded-2xl border border-[#E5E3DB] p-6 text-center space-y-3" data-testid="error-boundary">
            <p className="font-heading text-lg font-semibold text-[#2C3531]">Something went wrong</p>
            <p className="text-sm text-[#59615D]">{this.state.error?.message || "Unexpected error in the app."}</p>
            <button
              className="px-4 py-2 rounded-full bg-[#3B5249] text-white text-sm hover:opacity-90"
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              data-testid="error-boundary-reload"
            >Reload app</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  useHideBadge();
  useDarkMode();
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <ConfirmProvider>
      <a href="#main-content" className="skip-link" data-testid="skip-to-content">Skip to main content</a>
      <ImpersonationBanner />
      <main id="main-content">
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<UniversalLogin />} />
        <Route path="/photo-capture/:token" element={<PhotoCapture />} />
        <Route path="/store/:slug/*" element={<Storefront />} />
        <Route path="/live" element={<ProtectedRoute allowedRoles={["admin","sales_manager","district_manager","hr_manager","finance_manager"]}><LiveOpsWall /></ProtectedRoute>} />
        <Route path="/telecaller" element={<ProtectedRoute allowedRoles={["telecaller"]}><TelecallerDashboard /></ProtectedRoute>} />
        <Route path="/manager" element={<ProtectedRoute allowedRoles={["district_manager"]}><ManagerDashboard /></ProtectedRoute>} />
        <Route path="/agent" element={<ProtectedRoute allowedRoles={["agent"]}><AgentPortal /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute allowedRoles={["admin"]}><AdminCRMPanel /></ProtectedRoute>} />
        <Route path="/admin-panel" element={<Navigate to="/dashboard" replace />} />
        <Route path="/sales-manager" element={<ProtectedRoute allowedRoles={["sales_manager"]}><SalesManagerDashboard /></ProtectedRoute>} />
        <Route path="/finance" element={<ProtectedRoute allowedRoles={["finance_manager"]}><FinanceManagerDashboard /></ProtectedRoute>} />
        <Route path="/hr-manager" element={<ProtectedRoute allowedRoles={["hr_manager"]}><HRManagerDashboard /></ProtectedRoute>} />
        <Route path="/social-media" element={<ProtectedRoute allowedRoles={["social_media_manager"]}><SocialMediaDashboard /></ProtectedRoute>} />
        <Route path="/influencer-outreach" element={<ProtectedRoute allowedRoles={["inhouse_telecaller"]}><InHouseTelecallerDashboard /></ProtectedRoute>} />
        <Route path="/content-strategist" element={<ProtectedRoute allowedRoles={["content_strategist"]}><ContentStrategistDashboard /></ProtectedRoute>} />
        <Route path="/content-developer" element={<ProtectedRoute allowedRoles={["content_developer"]}><ContentDeveloperDashboard /></ProtectedRoute>} />
        <Route path="/assistant-dm" element={<ProtectedRoute allowedRoles={["assistant_district_manager"]}><AssistantManagerDashboard type="district" /></ProtectedRoute>} />
        <Route path="/assistant-sm" element={<ProtectedRoute allowedRoles={["assistant_sales_manager"]}><AssistantManagerDashboard type="sales" /></ProtectedRoute>} />
        <Route path="/inventory" element={<ProtectedRoute allowedRoles={["inventory_manager"]}><InventoryManagerDashboard /></ProtectedRoute>} />
        <Route path="/digital-marketing" element={<ProtectedRoute allowedRoles={["digital_marketing_manager"]}><DigitalMarketingDashboard /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
      </Suspense>
      </main>
      <Toaster richColors position="top-right" closeButton aria-live="polite" />
      </ConfirmProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;

