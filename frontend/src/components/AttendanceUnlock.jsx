import React, { useEffect, useState } from "react";
import axios from "axios";
import { Unlock, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * 5:30 PM attendance unlock button — Admin & HR only.
 * Lets the admin/HR manually allow an employee to check-out after the standard
 * 5:30 PM cutoff (default working hours are 9 AM – 6 PM, with the 5:30 PM
 * unlock as an admin override).
 */
export default function AttendanceUnlock({ employees = [] }) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const [unlocksToday, setUnlocksToday] = useState([]);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const loadUnlocks = async () => {
    try {
      const { data } = await axios.get(`${API}/attendance/unlocks/today`);
      setUnlocksToday(data.unlocks || []);
    } catch {}
  };
  useEffect(() => { if (open) loadUnlocks(); }, [open]);

  const hour = now.getHours() + now.getMinutes() / 60;
  const isAfter530 = hour >= 17.5;

  const submit = async () => {
    if (!userId) { toast.error("Select an employee"); return; }
    setBusy(true);
    try {
      await axios.post(`${API}/attendance/unlock`, { user_id: userId, reason });
      toast.success("Attendance unlocked for 5:30 PM check-out");
      setUserId(""); setReason("");
      loadUnlocks();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className={`rounded-full text-xs ${
          isAfter530
            ? "border-[#A66E4E] text-[#A66E4E] bg-[#FFF8F0]"
            : "border-[#E5E3DB] text-[#59615D]"
        }`}
        onClick={() => setOpen(true)}
        data-testid="attendance-unlock-btn"
      >
        <Unlock className="w-3.5 h-3.5 mr-1" />
        5:30 Unlock {unlocksToday.length > 0 && <span className="ml-1 bg-[#A66E4E] text-white rounded-full px-1.5 text-[9px]">{unlocksToday.length}</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Unlock className="w-5 h-5 text-[#3B5249]" />
              5:30 PM Attendance Unlock
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-800 flex items-start gap-2">
              <Clock className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                Standard work hours: <b>9:00 AM – 6:00 PM</b>. After <b>5:30 PM</b>, employees
                need an admin/HR unlock to register their check-out. Now: {now.toLocaleTimeString()}
              </span>
            </div>
            <div>
              <Label className="text-xs">Employee</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger className="rounded-xl" data-testid="unlock-emp-select">
                  <SelectValue placeholder="Select employee…" />
                </SelectTrigger>
                <SelectContent>
                  {employees.length === 0 ? (
                    <div className="px-2 py-2 text-xs text-[#59615D]">No employees loaded</div>
                  ) : (
                    employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name} <span className="text-[#59615D]">· {e.role_title || e.role || ""}</span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Reason</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Late field visit"
                className="rounded-xl"
                data-testid="unlock-reason"
              />
            </div>
            {unlocksToday.length > 0 && (
              <div className="border-t border-[#E5E3DB] pt-2">
                <p className="text-[10px] text-[#59615D] uppercase font-medium mb-1">Today’s unlocks</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {unlocksToday.map((u) => (
                    <div key={u.id} className="text-[11px] bg-[#F9F8F6] rounded px-2 py-1">
                      <span className="font-medium">{u.user_id}</span> · {u.reason || "—"}{" "}
                      <span className="text-[#59615D]">{new Date(u.unlocked_at).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-full bg-[#3B5249] text-white"
              disabled={busy}
              onClick={submit}
              data-testid="confirm-unlock-btn"
            >
              {busy ? "Unlocking…" : "Unlock Check-out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
