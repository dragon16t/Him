import React, { useEffect, useState } from "react";
import axios from "axios";
import { Briefcase, Plus, Users2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Hiring Positions widget — shown on Admin & HR dashboards.
 * Displays open vacancies + live pipeline (auto-computed from candidate status).
 * Default positions (auto-seeded): Digital Marketing Intern × 4, HR × 1,
 * Executive Sales (Part-time) × 2, Telecalling × 2.
 */
export default function HiringPositionsPanel({ embedded = false }) {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newPos, setNewPos] = useState({ title: "", department: "", vacancies: 1 });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/hiring/positions`);
      setPositions(data.positions || []);
    } catch {
      toast.error("Failed to load positions");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const addPos = async () => {
    if (!newPos.title.trim()) { toast.error("Title required"); return; }
    try {
      await axios.post(`${API}/hiring/positions`, newPos);
      toast.success("Position added");
      setShowAdd(false);
      setNewPos({ title: "", department: "", vacancies: 1 });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
  };

  const archivePos = async (pid, title) => {
    if (!window.confirm(`Archive position "${title}"?`)) return;
    try {
      await axios.delete(`${API}/hiring/positions/${pid}`);
      toast.success("Archived");
      load();
    } catch {
      toast.error("Failed");
    }
  };

  return (
    <div className={embedded ? "" : "bg-white rounded-xl border border-[#E5E3DB] p-4 sm:p-5"} data-testid="hiring-positions-panel">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="font-heading text-lg font-medium flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-[#3B5249]" />
            Open Positions
          </h3>
          <p className="text-xs text-[#59615D] mt-0.5">
            Live hiring targets & pipeline (synced with candidates)
          </p>
        </div>
        <Button
          size="sm"
          className="rounded-full bg-[#3B5249] text-white text-xs"
          onClick={() => setShowAdd(true)}
          data-testid="add-position-btn"
        >
          <Plus className="w-4 h-4 mr-1" />
          New Position
        </Button>
      </div>

      {loading ? (
        <p className="text-center py-6 text-sm text-[#59615D]">Loading…</p>
      ) : positions.length === 0 ? (
        <p className="text-center py-6 text-sm text-[#59615D]">No open positions</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {positions.map((p) => {
            const filled = p.filled_live || 0;
            const remaining = Math.max(0, (p.vacancies || 0) - filled);
            const progress = p.vacancies ? Math.min(100, (filled / p.vacancies) * 100) : 0;
            return (
              <div
                key={p.id}
                className={`border border-[#E5E3DB] rounded-xl p-3 bg-white hover:shadow-md hover:border-[#3B5249] transition ${onSelectPosition ? 'cursor-pointer' : ''}`}
                onClick={onSelectPosition ? () => onSelectPosition(p.title) : undefined}
                role={onSelectPosition ? 'button' : undefined}
                title={onSelectPosition ? `Show candidates for ${p.title}` : undefined}
                data-testid={`position-card-${p.id}`}
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-heading text-sm font-semibold text-[#2C3531] truncate">{p.title}</h4>
                    <p className="text-[10px] text-[#59615D] uppercase tracking-wider">{p.department || "—"}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); archivePos(p.id, p.title); }}
                    className="text-red-400 hover:text-red-600 p-1"
                    title="Archive"
                    data-testid={`archive-pos-${p.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="font-heading text-2xl font-semibold text-[#3B5249]">{remaining}</span>
                  <span className="text-[10px] text-[#59615D]">/ {p.vacancies} open</span>
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-[#59615D]">
                  <span className="flex items-center gap-1">
                    <Users2 className="w-3 h-3" />
                    {p.in_pipeline || 0} in pipeline
                  </span>
                  <span>{filled} hired</span>
                </div>
                <div className="mt-2 h-1.5 bg-[#F9F8F6] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#3B5249] transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Open Position</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Position Title</Label>
              <Input
                value={newPos.title}
                onChange={(e) => setNewPos({ ...newPos, title: e.target.value })}
                placeholder="e.g. Content Writer"
                className="rounded-xl"
                data-testid="new-pos-title"
              />
            </div>
            <div>
              <Label className="text-xs">Department</Label>
              <Input
                value={newPos.department}
                onChange={(e) => setNewPos({ ...newPos, department: e.target.value })}
                placeholder="e.g. Marketing"
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="text-xs">Vacancies</Label>
              <Input
                type="number"
                min="1"
                value={newPos.vacancies}
                onChange={(e) => setNewPos({ ...newPos, vacancies: parseInt(e.target.value) || 1 })}
                className="rounded-xl"
                data-testid="new-pos-vacancies"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button className="rounded-full bg-[#3B5249] text-white" onClick={addPos} data-testid="save-pos-btn">
              Add Position
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
