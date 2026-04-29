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

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return toast.error("Please enter email and password");
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/auth/login`, { email, password });
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      toast.success(`Welcome, ${data.user.name || data.user.email}!`);
      navigate(ROLE_ROUTES[data.user.role] || "/login");
    } catch (err) { toast.error(err.response?.data?.detail || "Login failed"); }
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
          </form>
        </div>
      </div>
    </div>

  );
}
