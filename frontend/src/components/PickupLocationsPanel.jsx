import React, { useEffect, useState } from "react";
import axios from "axios";
import { Plus, MapPin, Star, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Admin-only pickup-location management.
 * The 3 default locations (Parakkal, Office, Kochi) are auto-seeded.
 * Whatever is set here drives the dropdown that appears on the Order Create
 * form across every dashboard (telecaller / SM / agent). HR never sees orders,
 * so HR is not touched.
 */
export default function PickupLocationsPanel() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newLoc, setNewLoc] = useState({ name: "", address: "", is_default: false });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/pickup-locations`);
      setLocations(data.locations || []);
    } catch (e) {
      toast.error("Failed to load pickup locations");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!newLoc.name.trim()) { toast.error("Name required"); return; }
    try {
      await axios.post(`${API}/pickup-locations`, newLoc);
      toast.success("Pickup location added");
      setShowAdd(false);
      setNewLoc({ name: "", address: "", is_default: false });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to add");
    }
  };

  const setDefault = async (id) => {
    try {
      await axios.put(`${API}/pickup-locations/${id}/default`);
      toast.success("Default pickup updated");
      load();
    } catch {
      toast.error("Failed to update default");
    }
  };

  const archive = async (id, name) => {
    if (!window.confirm(`Archive pickup location "${name}"?`)) return;
    try {
      await axios.delete(`${API}/pickup-locations/${id}`);
      toast.success("Archived");
      load();
    } catch {
      toast.error("Failed to archive");
    }
  };

  return (
    <div className="bg-white rounded-xl border border-[#E5E3DB] p-4 sm:p-5" data-testid="pickup-locations-panel">
      <div className="flex flex-col sm:flex-row justify-between gap-3 mb-4">
        <div>
          <h3 className="font-heading text-lg font-medium flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[#3B5249]" />
            Pickup Locations
          </h3>
          <p className="text-xs text-[#59615D] mt-1">
            These drive the pickup dropdown shown on every Order-Create form (telecaller / SM / agent).
          </p>
        </div>
        <Button
          size="sm"
          className="rounded-full bg-[#3B5249] text-white text-xs h-9"
          onClick={() => setShowAdd(true)}
          data-testid="add-pickup-btn"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Location
        </Button>
      </div>

      {loading ? (
        <p className="text-center py-8 text-sm text-[#59615D]">Loading…</p>
      ) : locations.length === 0 ? (
        <p className="text-center py-8 text-sm text-[#59615D]">No pickup locations configured.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {locations.map((loc) => (
            <div
              key={loc.id}
              className={`relative border rounded-xl p-4 transition ${
                loc.is_default
                  ? "border-[#A66E4E] bg-[#FFF8F0] shadow-sm"
                  : "border-[#E5E3DB] bg-white hover:border-[#3B5249]"
              }`}
              data-testid={`pickup-card-${loc.id}`}
            >
              {loc.is_default && (
                <div className="absolute top-2 right-2 bg-[#A66E4E] text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Star className="w-3 h-3" /> Default
                </div>
              )}
              <h4 className="font-heading text-base font-semibold text-[#2C3531]">{loc.name}</h4>
              <p className="text-xs text-[#59615D] mt-1 leading-relaxed min-h-[32px]">{loc.address || "—"}</p>
              <div className="mt-3 flex gap-2">
                {!loc.is_default && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full text-[11px] h-8 flex-1 border-[#3B5249] text-[#3B5249]"
                    onClick={() => setDefault(loc.id)}
                    data-testid={`set-default-${loc.id}`}
                  >
                    <Check className="w-3 h-3 mr-1" /> Set Default
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full text-[11px] h-8 border-red-200 text-red-600 hover:bg-red-50"
                  onClick={() => archive(loc.id, loc.name)}
                  data-testid={`archive-pickup-${loc.id}`}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Pickup Location</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                value={newLoc.name}
                onChange={(e) => setNewLoc({ ...newLoc, name: e.target.value })}
                placeholder="e.g. Thrissur Warehouse"
                className="rounded-xl"
                data-testid="new-pickup-name"
              />
            </div>
            <div>
              <Label className="text-xs">Address</Label>
              <Input
                value={newLoc.address}
                onChange={(e) => setNewLoc({ ...newLoc, address: e.target.value })}
                placeholder="Full address"
                className="rounded-xl"
                data-testid="new-pickup-address"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-[#59615D] cursor-pointer">
              <input
                type="checkbox"
                checked={newLoc.is_default}
                onChange={(e) => setNewLoc({ ...newLoc, is_default: e.target.checked })}
              />
              Set as default pickup
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button className="rounded-full bg-[#3B5249] text-white" onClick={handleAdd} data-testid="save-pickup-btn">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
