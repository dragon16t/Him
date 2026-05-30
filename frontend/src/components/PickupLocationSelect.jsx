import React, { useEffect, useState } from "react";
import axios from "axios";
import { MapPin } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Re-usable pickup location dropdown. Options are read from the
 * admin-managed list at /api/pickup-locations. Admin is the single source
 * of truth — whatever admin sets there shows up here on every order form
 * (telecaller / SM / agent). HR never sees this since HR doesn't create orders.
 */
export default function PickupLocationSelect({ value, onChange, defaultToAdminDefault = true, label = "Pickup Location", testId = "pickup-select" }) {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const { data } = await axios.get(`${API}/pickup-locations`);
        if (!mounted) return;
        const locs = data.locations || [];
        setLocations(locs);
        // Auto-apply admin's default if no value yet
        if (defaultToAdminDefault && !value && locs.length) {
          const def = locs.find((l) => l.is_default) || locs[0];
          onChange?.(def.name);
        }
      } catch (e) {
        // silently ignore — order form still usable without preset
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <Label className="text-xs font-medium flex items-center gap-1">
        <MapPin className="w-3 h-3 text-[#3B5249]" /> {label}
      </Label>
      <Select value={value || ""} onValueChange={onChange}>
        <SelectTrigger className="rounded-xl h-9 text-xs" data-testid={testId}>
          <SelectValue placeholder={loading ? "Loading…" : "Select pickup location"} />
        </SelectTrigger>
        <SelectContent>
          {locations.length === 0 ? (
            <div className="px-2 py-2 text-xs text-[#59615D]">No pickup locations configured</div>
          ) : (
            locations.map((l) => (
              <SelectItem key={l.id} value={l.name}>
                {l.name}
                {l.is_default && <span className="ml-2 text-[10px] text-[#A66E4E]">· Default</span>}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      {value && locations.find((l) => l.name === value)?.address && (
        <p className="text-[10px] text-[#59615D] mt-1 leading-snug">
          {locations.find((l) => l.name === value)?.address}
        </p>
      )}
    </div>
  );
}
