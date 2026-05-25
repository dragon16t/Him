import { useState } from "react";
import axios from "axios";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

const API = "/api";

export default function GlobalSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState({ leads: [], orders: [] });
  const [open, setOpen] = useState(false);

  const search = async (val) => {
    setQ(val);
    if (val.length < 2) {
      setResults({ leads: [], orders: [] });
      setOpen(false);
      return;
    }
    try {
      const { data } = await axios.get(`${API}/customers/search?q=${encodeURIComponent(val)}`);
      setResults(data);
      setOpen(true);
    } catch {}
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative w-40 sm:w-56">
          <Search className="absolute left-2 top-2 w-3 h-3 text-[#59615D]" />
          <Input
            value={q}
            onChange={(e) => search(e.target.value)}
            onFocus={() => q.length >= 2 && setOpen(true)}
            placeholder="Search customer/phone..."
            data-testid="global-search-input"
            className="h-7 pl-6 text-xs rounded-full bg-white border-[#E5E3DB]"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end" data-testid="global-search-results">
        {results.leads.length === 0 && results.orders.length === 0 ? (
          <p className="text-center text-xs text-[#59615D] py-4">No matches</p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {results.leads.length > 0 && (
              <div>
                <p className="px-3 py-1.5 bg-[#F9F8F6] text-[9px] uppercase font-medium">Leads ({results.leads.length})</p>
                {results.leads.slice(0, 10).map((l) => (
                  <div key={l.id} className="p-2 border-b border-[#E5E3DB] text-xs">
                    <p className="font-medium">{l.name}</p>
                    <p className="text-[10px] text-[#59615D]">{l.phone_number} <Badge variant="outline" className="text-[8px] ml-1">{l.status}</Badge></p>
                  </div>
                ))}
              </div>
            )}
            {results.orders.length > 0 && (
              <div>
                <p className="px-3 py-1.5 bg-[#F9F8F6] text-[9px] uppercase font-medium">Orders ({results.orders.length})</p>
                {results.orders.slice(0, 10).map((o) => (
                  <div key={o.id} className="p-2 border-b border-[#E5E3DB] text-xs">
                    <p className="font-medium">{o.customer_name}</p>
                    <p className="text-[10px] text-[#59615D]">Rs.{o.total_amount} <Badge variant="outline" className="text-[8px] ml-1">{o.status}</Badge></p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
