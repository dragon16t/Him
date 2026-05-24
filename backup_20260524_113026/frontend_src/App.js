import React, { Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import axios from "axios";
import UniversalLogin from "@/pages/UniversalLogin";
import ImpersonationBanner from "@/components/ImpersonationBanner";

const TelecallerDashboard = React.lazy(() => import("@/pages/TelecallerDashboard"));
const ManagerDashboard = React.lazy(() => import("@/pages/ManagerDashboard"));
const AgentPortal = React.lazy(() => import("@/pages/AgentPortal"));
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

const Loader = () => <div className="min-h-screen flex items-center justify-center bg-[#F9F8F6]"><div className="w-8 h-8 border-2 border-[#3B5249] border-t-transparent rounded-full animate-spin"/></div>;

axios.defaults.baseURL = process.env.REACT_APP_BACKEND_URL;
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
axios.interceptors.response.use(r => r, error => {
  if (error.response?.status === 401) { localStorage.clear(); window.location.href = "/login"; }
  return Promise.reject(error);
});

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

function App() {
  useHideBadge();
  return (
    <BrowserRouter>
      <ImpersonationBanner />
      <Suspense fallback={<Loader />}>
      <Routes>
        <Route path="/login" element={<UniversalLogin />} />
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
      <Toaster richColors position="top-right" />
    </BrowserRouter>
  );
}

export default App;
