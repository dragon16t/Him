import React, { useEffect, useState } from "react";
import axios from "axios";
import { ArrowRightLeft, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Admin-only: transfer a telecaller from one Sales Manager to another.
 * Moves their leads + orders attribution. They disappear from the previous SM
 * dashboard automatically because every SM endpoint filters by `managed_by`.
 */
export default function TelecallerTransferPanel() {
  const [open, setOpen] = useState(false);
  const [tcs, setTcs] = useState([]);
  const [sms, setSms] = useState([]);
  const [tcId, setTcId] = useState("");
  const [newSmId, setNewSmId] = useState("");
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);

  const loadData = async () => {
    try {
      const [tcRes, smRes, histRes] = await Promise.all([
        axios.get(`${API}/admin/users?role=telecallers`).catch(() => ({ data: { users: [] } })),
        axios.get(`${API}/admin/users?role=sales_managers`).catch(() => ({ data: { users: [] } })),
        axios.get(`${API}/admin/telecaller-transfers`).catch(() => ({ data: { transfers: [] } })),
      ]);
      // Fallback if admin/users isn't shaped that way — use a generic list endpoint
      const tcList = tcRes.data?.users || tcRes.data?.telecallers || [];
      const smList = smRes.data?.users || smRes.data?.sales_managers || [];
      // If empty (different API shape), try fetching from all-users
      if (tcList.length === 0) {
        try {
          const { data } = await axios.get(`${API}/admin/all-users`);
          const all = data.users || [];
          setTcs(all.filter(u => u.role === "telecaller"));
          setSms(all.filter(u => u.role === "sales_manager"));
        } catch {
          setTcs([]); setSms([]);
        }
      } else {
        setTcs(tcList);
        setSms(smList);
      }
      setHistory(histRes.data?.transfers || []);
    } catch (e) {
      toast.error("Failed to load transfer data");
    }
  };

  useEffect(() => {
    if (open) loadData();
  }, [open]);

  const submit = async () => {
    if (!tcId || !newSmId) {
      toast.error("Select telecaller and new sales manager");
      return;
    }
    setBusy(true);
    try {
      await axios.post(`${API}/admin/transfer-telecaller`, {
        telecaller_id: tcId,
        new_sales_manager_id: newSmId,
        reason,
      });
      toast.success("Telecaller transferred — full data migrated");
      setTcId(""); setNewSmId(""); setReason("");
      loadData();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Transfer failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="rounded-full text-xs border-[#3B5249] text-[#3B5249]"
        onClick={() => setOpen(true)}
        data-testid="open-transfer-btn"
      >
        <ArrowRightLeft className="w-4 h-4 mr-1" />
        Transfer Telecaller
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-[#3B5249]" />
              Transfer Telecaller Between Sales Managers
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              All leads, orders & commission attribution will move with the telecaller. They
              will disappear from the previous SM&apos;s dashboard automatically.
            </div>
            <div>
              <Label className="text-xs">Telecaller</Label>
              <Select value={tcId} onValueChange={setTcId}>
                <SelectTrigger className="rounded-xl" data-testid="select-tc">
                  <SelectValue placeholder="Select telecaller…" />
                </SelectTrigger>
                <SelectContent>
                  {tcs.length === 0 ? (
                    <div className="px-2 py-2 text-xs text-[#59615D]">No telecallers found</div>
                  ) : (
                    tcs.map((tc) => (
                      <SelectItem key={tc.id} value={tc.id}>
                        {tc.name} {tc.managed_by_name ? `(under ${tc.managed_by_name})` : "(unassigned)"}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">New Sales Manager</Label>
              <Select value={newSmId} onValueChange={setNewSmId}>
                <SelectTrigger className="rounded-xl" data-testid="select-sm">
                  <SelectValue placeholder="Select new SM…" />
                </SelectTrigger>
                <SelectContent>
                  {sms.length === 0 ? (
                    <div className="px-2 py-2 text-xs text-[#59615D]">No sales managers found</div>
                  ) : (
                    sms.map((sm) => (
                      <SelectItem key={sm.id} value={sm.id}>
                        {sm.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Reason (optional)</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Regional realignment"
                className="rounded-xl"
                data-testid="transfer-reason"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-full bg-[#3B5249] text-white"
              disabled={busy}
              onClick={submit}
              data-testid="confirm-transfer-btn"
            >
              {busy ? "Transferring…" : "Transfer"}
            </Button>
          </DialogFooter>

          {history.length > 0 && (
            <div className="mt-4 border-t border-[#E5E3DB] pt-3">
              <h4 className="text-xs font-semibold flex items-center gap-1 mb-2 text-[#59615D]">
                <History className="w-3.5 h-3.5" /> Recent transfers
              </h4>
              <div className="space-y-1 max-h-40 overflow-y-auto text-[11px]">
                {history.slice(0, 8).map((h) => (
                  <div key={h.id} className="flex justify-between bg-[#F9F8F6] rounded px-2 py-1">
                    <span>
                      <b>{h.telecaller_name}</b> · {h.from_sm_name || "—"} →{" "}
                      <b>{h.to_sm_name}</b>
                    </span>
                    <span className="text-[#59615D]">
                      {new Date(h.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
