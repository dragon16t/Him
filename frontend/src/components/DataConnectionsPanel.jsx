import React, { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw, CheckCircle2, XCircle, Send, Activity, Link2 } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

// ─── Admin > Data Connections
// Shows Meta Conversions API health + lets admin fire a test event.
// Every lead / order created in the CRM automatically pushes to Meta so ads
// can optimize for real customers — no manual sync needed.
export default function DataConnectionsPanel() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [testForm, setTestForm] = useState({
    name: "Test Customer",
    phone: "9876543210",
    email: "test@celestaglow.com",
    amount: 999,
    test_event_code: "",
  });
  const [firing, setFiring] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/meta/status`);
      setStatus(data);
    } catch (e) {
      toast.error("Could not load Meta status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 30_000); // refresh every 30s
    return () => clearInterval(t);
  }, []);

  const fireTest = async () => {
    setFiring(true);
    try {
      const { data } = await axios.post(`${API}/meta/test`, testForm);
      const status = data?.result?.status;
      const evReceived = data?.result?.body?.events_received;
      if (status === 200 && evReceived >= 1) {
        toast.success(`Meta accepted the test event (fbtrace: ${data.result.body.fbtrace_id})`);
      } else {
        toast.error(`Meta rejected: ${JSON.stringify(data?.result?.body || {}).slice(0, 200)}`);
      }
      fetchStatus();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Test failed");
    } finally {
      setFiring(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="data-connections-panel">
      {/* Header */}
      <div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-[#3B5249]" />
            <h2 className="font-heading text-lg font-medium text-[#2C3531]">Data Connections</h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchStatus}
            disabled={loading}
            data-testid="refresh-meta-status-btn"
            className="rounded-full"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        <p className="text-sm text-[#59615D]">
          Send CRM data (leads + orders) to Meta so your Facebook &amp; Instagram ad campaigns
          can optimize for real, high-intent customers. Every new lead fires a{" "}
          <span className="font-mono text-xs bg-[#F9F8F6] px-1 py-0.5 rounded">Lead</span> event,
          and every new order fires a{" "}
          <span className="font-mono text-xs bg-[#F9F8F6] px-1 py-0.5 rounded">Purchase</span>{" "}
          event. Customer PII (email, phone, name, city, pincode) is SHA-256 hashed before being
          sent, per Meta&apos;s spec.
        </p>
      </div>

      {/* Meta CAPI Status Card */}
      <div className="bg-white rounded-xl border border-[#E5E3DB] p-5" data-testid="meta-status-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-base font-medium">Meta Conversions API</h3>
          {status?.configured ? (
            <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5" data-testid="meta-configured-badge">
              <CheckCircle2 className="w-3 h-3" /> Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5" data-testid="meta-not-configured-badge">
              <XCircle className="w-3 h-3" /> Not configured
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Metric label="Pixel ID" value={status?.pixel_id || "—"} testid="meta-pixel-id" />
          <Metric label="Graph API" value={status?.graph_version || "—"} testid="meta-graph-version" />
          <Metric label="Access Token" value={status?.token_masked || "—"} mono testid="meta-token-masked" />
          <Metric label="Mode" value={status?.test_mode ? "TEST" : "LIVE"} testid="meta-mode" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Events sent" value={status?.totals?.total ?? 0} testid="meta-total" />
          <Stat label="Accepted" value={status?.totals?.ok ?? 0} tone="green" testid="meta-ok" />
          <Stat label="Rejected" value={status?.totals?.failed ?? 0} tone="red" testid="meta-failed" />
        </div>
      </div>

      {/* Test event fire card */}
      <div className="bg-white rounded-xl border border-[#E5E3DB] p-5">
        <h3 className="font-heading text-base font-medium mb-1">Send a test Purchase event</h3>
        <p className="text-xs text-[#59615D] mb-4">
          Fire a synthetic Purchase event to verify the wire-up. Add a{" "}
          <span className="font-mono text-[11px]">test_event_code</span> from Events Manager →
          Test Events to receive it in the test panel only (won&apos;t affect ad targeting).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div>
            <Label className="text-xs">Customer Name</Label>
            <Input
              value={testForm.name}
              onChange={(e) => setTestForm({ ...testForm, name: e.target.value })}
              data-testid="meta-test-name"
            />
          </div>
          <div>
            <Label className="text-xs">Phone (10-digit)</Label>
            <Input
              value={testForm.phone}
              onChange={(e) => setTestForm({ ...testForm, phone: e.target.value })}
              data-testid="meta-test-phone"
            />
          </div>
          <div>
            <Label className="text-xs">Email</Label>
            <Input
              type="email"
              value={testForm.email}
              onChange={(e) => setTestForm({ ...testForm, email: e.target.value })}
              data-testid="meta-test-email"
            />
          </div>
          <div>
            <Label className="text-xs">Amount (INR)</Label>
            <Input
              type="number"
              value={testForm.amount}
              onChange={(e) => setTestForm({ ...testForm, amount: e.target.value })}
              data-testid="meta-test-amount"
            />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">
              Test Event Code <span className="text-[#59615D]">(optional — leave blank to send live)</span>
            </Label>
            <Input
              placeholder="e.g. TEST12345"
              value={testForm.test_event_code}
              onChange={(e) => setTestForm({ ...testForm, test_event_code: e.target.value })}
              data-testid="meta-test-code"
            />
          </div>
        </div>
        <Button
          onClick={fireTest}
          disabled={firing || !status?.configured}
          className="rounded-full bg-[#3B5249] hover:bg-[#2C3531] text-white"
          data-testid="meta-fire-test-btn"
        >
          <Send className={`w-3.5 h-3.5 mr-1.5 ${firing ? "animate-pulse" : ""}`} />
          {firing ? "Sending..." : "Send test event"}
        </Button>
      </div>

      {/* Recent events log */}
      <div className="bg-white rounded-xl border border-[#E5E3DB] p-5" data-testid="meta-events-log">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-[#3B5249]" />
          <h3 className="font-heading text-base font-medium">Recent events</h3>
        </div>
        {!status?.recent_events?.length ? (
          <p className="text-sm text-[#59615D] py-6 text-center">
            No events yet. Create a lead or order in the CRM and it will appear here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[#59615D] uppercase text-[10px] border-b border-[#E5E3DB]">
                  <th className="py-2 pr-3">Time</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Event ID</th>
                  <th className="py-2 pr-3">Meta Status</th>
                  <th className="py-2 pr-3">Result</th>
                </tr>
              </thead>
              <tbody>
                {status.recent_events.map((ev, i) => {
                  const okColor = ev.ok ? "text-green-700" : "text-red-700";
                  const okIcon = ev.ok ? <CheckCircle2 className="w-3 h-3 inline mr-1" /> : <XCircle className="w-3 h-3 inline mr-1" />;
                  const msg = ev.meta_response?.body?.messages?.length
                    ? JSON.stringify(ev.meta_response.body.messages[0]).slice(0, 80)
                    : ev.ok
                    ? `events_received: ${ev.meta_response?.body?.events_received ?? "?"}`
                    : JSON.stringify(ev.meta_response?.body || {}).slice(0, 80);
                  return (
                    <tr key={i} className="border-b border-[#F3F1EB]">
                      <td className="py-2 pr-3 whitespace-nowrap text-[#59615D]">
                        {ev.at ? new Date(ev.at).toLocaleString() : "—"}
                      </td>
                      <td className="py-2 pr-3">
                        <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                          ev.event_name === "Purchase"
                            ? "bg-green-50 text-green-800 border border-green-200"
                            : "bg-blue-50 text-blue-800 border border-blue-200"
                        }`}>
                          {ev.event_name}
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-mono text-[10px] text-[#59615D]">{ev.event_id?.slice(0, 32)}</td>
                      <td className={`py-2 pr-3 ${okColor}`}>{okIcon}{ev.meta_response?.status ?? "—"}</td>
                      <td className="py-2 pr-3 text-[#59615D]">{msg}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* How-it-works */}
      <div className="bg-[#F9F8F6] rounded-xl border border-[#E5E3DB] p-5 text-sm text-[#59615D]">
        <h4 className="font-heading text-sm font-medium text-[#2C3531] mb-2">How it works</h4>
        <ol className="list-decimal list-inside space-y-1.5">
          <li>Every time your team adds a lead in the CRM, a hashed <b>Lead</b> event is silently sent to Meta.</li>
          <li>Every time an order is created (COD or UPI), a hashed <b>Purchase</b> event is silently sent to Meta with the order value + product IDs.</li>
          <li>Meta uses these signals to <b>improve your ad campaigns</b> — cheaper leads, more purchases.</li>
          <li>Nothing is exposed to end customers. All PII is SHA-256 hashed before leaving the server.</li>
          <li>To rotate the access token, ask an admin to update <span className="font-mono text-[11px]">META_ACCESS_TOKEN</span> in the backend .env and redeploy.</li>
        </ol>
      </div>
    </div>
  );
}

const Metric = ({ label, value, mono, testid }) => (
  <div className="bg-[#F9F8F6] rounded-lg p-3">
    <p className="text-[9px] text-[#59615D] uppercase tracking-wide mb-1">{label}</p>
    <p className={`text-sm text-[#2C3531] ${mono ? "font-mono" : "font-medium"}`} data-testid={testid}>
      {value}
    </p>
  </div>
);

const Stat = ({ label, value, tone, testid }) => {
  const toneCls =
    tone === "green"
      ? "text-green-700"
      : tone === "red"
      ? "text-red-700"
      : "text-[#2C3531]";
  return (
    <div className="bg-[#F9F8F6] rounded-lg p-3">
      <p className="text-[9px] text-[#59615D] uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-xl font-semibold ${toneCls}`} data-testid={testid}>{value}</p>
    </div>
  );
};
