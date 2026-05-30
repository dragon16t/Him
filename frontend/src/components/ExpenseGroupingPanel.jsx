// ExpenseGroupingPanel — auto-groups all expenses for the chosen month into
// keyword-based baskets (Heads) and classifies each basket as fixed / variable
// / asset so the Finance Manager can see the burn structure at a glance.
import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, Pencil, RefreshCcw } from "lucide-react";

const API = "/api";
const TYPE_COLORS = {
  fixed:    "bg-blue-100 text-blue-800 border-blue-200",
  variable: "bg-amber-100 text-amber-800 border-amber-200",
  asset:    "bg-purple-100 text-purple-800 border-purple-200",
};
const TYPE_LABEL = { fixed: "Fixed", variable: "Variable", asset: "Asset" };

export default function ExpenseGroupingPanel({ month, year }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ groups: [], type_totals: {}, grand_total: 0 });
  const [filter, setFilter] = useState("all");
  const [openGroup, setOpenGroup] = useState(null);
  const [heads, setHeads] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (year) params.year = String(year);
      if (month && month !== "all") params.month = String(month);
      if (filter !== "all") params.expense_type = filter;
      const [g, h] = await Promise.all([
        axios.get(`${API}/expenses/grouped`, { params }),
        axios.get(`${API}/expense-heads`),
      ]);
      setData(g.data || { groups: [], type_totals: {}, grand_total: 0 });
      setHeads(h.data?.heads || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to load grouping");
    } finally { setLoading(false); }
  }, [month, year, filter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const changeHeadType = async (head, newType) => {
    const target = heads.find(h => h.name === head);
    if (!target) return toast.error("Head not found; create it under Expense Heads first.");
    try {
      await axios.put(`${API}/expense-heads/${target.id}`, { expense_type: newType });
      toast.success(`'${head}' marked as ${newType}`);
      fetchData();
    } catch (e) { toast.error("Failed to update"); }
  };

  const filteredGroups = data.groups || [];

  const typeSummary = useMemo(() => {
    const t = data.type_totals || {};
    const total = data.grand_total || 0;
    return [
      { key: "fixed",       label: "Fixed (Recurring)",  amount: t.fixed || 0,    color: "border-blue-300 bg-blue-50 text-blue-900" },
      { key: "variable",    label: "Variable (Operational)", amount: t.variable || 0, color: "border-amber-300 bg-amber-50 text-amber-900" },
      { key: "asset",       label: "Asset (Capital)",    amount: t.asset || 0,    color: "border-purple-300 bg-purple-50 text-purple-900" },
    ].map(b => ({ ...b, pct: total ? Math.round((b.amount / total) * 1000) / 10 : 0 }));
  }, [data]);

  return (
    <div className="space-y-4" data-testid="expense-grouping-panel">
      {/* Top summary cards: Fixed / Variable / Asset / Total */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {typeSummary.map(b => (
          <div key={b.key} className={`rounded-2xl border p-4 ${b.color}`}>
            <p className="text-[10px] uppercase tracking-wide font-medium opacity-70">{b.label}</p>
            <p className="font-heading text-2xl font-semibold mt-1">Rs.{b.amount.toLocaleString("en-IN")}</p>
            <p className="text-[11px] opacity-70 mt-1">{b.pct}% of total burn</p>
          </div>
        ))}
        <div className="rounded-2xl border border-[#3B5249] bg-[#3B5249] text-white p-4">
          <p className="text-[10px] uppercase tracking-wide font-medium opacity-80">Total Burn ({month && month !== "all" ? `${month}/${year}` : year})</p>
          <p className="font-heading text-2xl font-semibold mt-1">Rs.{(data.grand_total || 0).toLocaleString("en-IN")}</p>
          <p className="text-[11px] opacity-80 mt-1">{filteredGroups.length} baskets · {(data.groups || []).reduce((s, g) => s + g.count, 0)} entries</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-2xl border border-[#E5E3DB] p-3 flex items-center gap-3 flex-wrap">
        <span className="text-xs text-[#59615D]">Filter by type:</span>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="rounded-xl w-44 h-8 text-xs" data-testid="expense-type-filter"><SelectValue/></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="fixed">Fixed only</SelectItem>
            <SelectItem value="variable">Variable only</SelectItem>
            <SelectItem value="asset">Asset only</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="rounded-full h-8 text-xs" onClick={fetchData}>
          <RefreshCcw className="w-3 h-3 mr-1"/>Refresh
        </Button>
        <p className="text-[10px] text-[#59615D] ml-auto">
          Groups are auto-detected by keywords on the expense title.
          Click a basket to expand. Click the type badge to re-classify.
        </p>
      </div>

      {/* Groups list */}
      <div className="bg-white rounded-2xl border border-[#E5E3DB] divide-y divide-[#E5E3DB]">
        {loading && <p className="text-center py-8 text-sm text-[#59615D]">Loading groups…</p>}
        {!loading && filteredGroups.length === 0 && <p className="text-center py-10 text-sm text-[#59615D]">No expenses in this slice. Add one or change the filter.</p>}
        {filteredGroups.map(g => {
          const isOpen = openGroup === g.head;
          return (
            <div key={g.head} className="">
              <button
                className="w-full p-4 flex items-center gap-3 hover:bg-[#F9F8F6] text-left"
                onClick={() => setOpenGroup(isOpen ? null : g.head)}
                data-testid={`group-${g.head.replace(/\s+/g, "-").toLowerCase()}`}
              >
                {isOpen ? <ChevronDown className="w-4 h-4 text-[#59615D]"/> : <ChevronRight className="w-4 h-4 text-[#59615D]"/>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{g.head}</p>
                    <Badge className={`text-[9px] border ${TYPE_COLORS[g.expense_type] || ""}`}>{TYPE_LABEL[g.expense_type] || g.expense_type}</Badge>
                    <span className="text-[10px] text-[#59615D]">{g.count} {g.count === 1 ? "entry" : "entries"}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-heading text-base font-semibold text-[#3B5249]">Rs.{g.amount.toLocaleString("en-IN")}</p>
                  <p className="text-[10px] text-[#59615D]">{g.percentage}% of total</p>
                </div>
              </button>

              {isOpen && (
                <div className="bg-[#FAF9F5] px-4 pb-4">
                  <div className="flex items-center gap-2 py-2 mb-2 border-b border-[#E5E3DB]">
                    <Pencil className="w-3 h-3 text-[#59615D]"/>
                    <span className="text-[10px] text-[#59615D]">Re-classify this basket as:</span>
                    {["fixed", "variable", "asset"].map(t => (
                      <button
                        key={t}
                        onClick={() => changeHeadType(g.head, t)}
                        disabled={t === g.expense_type}
                        className={`text-[10px] px-3 py-1 rounded-full border ${t === g.expense_type ? "bg-[#3B5249] text-white border-[#3B5249]" : "bg-white text-[#3B5249] border-[#E5E3DB] hover:border-[#3B5249]"}`}
                        data-testid={`reclassify-${g.head.replace(/\s+/g, "-").toLowerCase()}-${t}`}
                      >
                        {TYPE_LABEL[t]}
                      </button>
                    ))}
                  </div>
                  <table className="w-full">
                    <thead>
                      <tr className="text-left border-b border-[#E5E3DB]">
                        <th className="p-2 text-[9px] uppercase text-[#59615D]">Date</th>
                        <th className="p-2 text-[9px] uppercase text-[#59615D]">Title</th>
                        <th className="p-2 text-[9px] uppercase text-[#59615D] text-right">Amount</th>
                        <th className="p-2 text-[9px] uppercase text-[#59615D]">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map(it => (
                        <tr key={it.id} className="border-b border-[#EFEEE9] last:border-0">
                          <td className="p-2 text-[11px]">{it.date}</td>
                          <td className="p-2 text-[12px] font-medium">{it.title || "—"}</td>
                          <td className="p-2 text-[12px] text-right font-semibold text-[#3B5249]">Rs.{it.amount.toLocaleString("en-IN")}</td>
                          <td className="p-2"><Badge variant="outline" className="text-[9px] capitalize">{it.status || "—"}</Badge></td>
                        </tr>
                      ))}
                      {g.items.length === 0 && <tr><td colSpan={4} className="p-3 text-center text-[11px] text-[#59615D]">No items</td></tr>}
                    </tbody>
                  </table>
                  {g.count > g.items.length && <p className="text-[10px] text-[#59615D] mt-2 text-center">Showing top {g.items.length} of {g.count} entries — see the Expenses tab for full list.</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
