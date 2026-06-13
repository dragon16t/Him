import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Calendar as CalIcon, Plus, IndianRupee, AlertCircle, CheckCircle2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Smart Budgeting + Planned Payments calendar for Finance Manager.
 * - Set monthly budget per category (auto-tracks spent vs remaining from expenses)
 * - Schedule planned payments / recurring obligations
 * - Visual calendar showing what is due each day
 */
export default function BudgetingCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear().toString());
  const [month, setMonth] = useState((today.getMonth() + 1).toString());
  const [budgets, setBudgets] = useState([]);
  const [planned, setPlanned] = useState([]);
  const [expenseHeads, setExpenseHeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showBudget, setShowBudget] = useState(false);
  const [showPlanned, setShowPlanned] = useState(false);
  const [bForm, setBForm] = useState({ category: "", budget_amount: "", notes: "" });
  const [pForm, setPForm] = useState({ title: "", vendor: "", category: "", amount: "", due_date: "", recurring: "none", notes: "" });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const first = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      const last = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const [b, p, h] = await Promise.all([
        axios.get(`${API}/finance/budgets`, { params: { year, month } }),
        axios.get(`${API}/finance/planned-payments`, { params: { from_date: first, to_date: last } }),
        axios.get(`${API}/expense-heads`).catch(() => ({ data: { heads: [] } })),
      ]);
      setBudgets(b.data.budgets || []);
      setPlanned(p.data.items || []);
      setExpenseHeads(h.data.heads || []);
    } catch (e) {
      toast.error("Failed to load budget data");
    } finally {
      setLoading(false);
    }
  }, [year, month]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const saveBudget = async () => {
    const amt = parseFloat(bForm.budget_amount);
    if (!bForm.category.trim() || !amt || amt <= 0) {
      toast.error("Category & amount required"); return;
    }
    try {
      await axios.post(`${API}/finance/budgets`, { ...bForm, budget_amount: amt, year, month });
      toast.success("Budget saved");
      setShowBudget(false);
      setBForm({ category: "", budget_amount: "", notes: "" });
      fetchAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
  };

  const deleteBudget = async (bid) => {
    if (!window.confirm("Delete this budget?")) return;
    await axios.delete(`${API}/finance/budgets/${bid}`); fetchAll();
  };

  const savePlanned = async () => {
    if (!pForm.title.trim() || !pForm.due_date) {
      toast.error("Title & due date required"); return;
    }
    try {
      await axios.post(`${API}/finance/planned-payments`, { ...pForm, amount: parseFloat(pForm.amount) || 0 });
      toast.success("Payment scheduled");
      setShowPlanned(false);
      setPForm({ title: "", vendor: "", category: "", amount: "", due_date: "", recurring: "none", notes: "" });
      fetchAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
  };

  const markPaid = async (pid) => {
    if (!window.confirm("Mark as paid?")) return;
    await axios.put(`${API}/finance/planned-payments/${pid}/mark-paid`); fetchAll();
  };

  const deletePlanned = async (pid) => {
    if (!window.confirm("Delete this planned payment?")) return;
    await axios.delete(`${API}/finance/planned-payments/${pid}`); fetchAll();
  };

  // Build calendar grid
  const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
  const firstDay = new Date(parseInt(year), parseInt(month) - 1, 1).getDay();
  const calendarDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const paymentsByDay = planned.reduce((acc, p) => {
    const d = parseInt((p.due_date || "").slice(8, 10));
    if (!isNaN(d)) (acc[d] = acc[d] || []).push(p);
    return acc;
  }, {});
  const totalBudget = budgets.reduce((s, b) => s + (b.budget_amount || 0), 0);
  const totalSpent = budgets.reduce((s, b) => s + (b.spent || 0), 0);
  const totalRemaining = Math.max(0, totalBudget - totalSpent);

  return (
    <div className="bg-white rounded-xl border border-[#E5E3DB] p-4 sm:p-5 space-y-4" data-testid="budgeting-calendar">
      <div className="flex flex-col lg:flex-row justify-between gap-3">
        <div>
          <h3 className="font-heading text-lg font-medium flex items-center gap-2">
            <CalIcon className="w-5 h-5 text-[#3B5249]" /> Budgeting & Planned Payments
          </h3>
          <p className="text-xs text-[#59615D] mt-0.5">
            Set monthly budgets that auto-track against expenses. Schedule recurring payments.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-32 h-9 text-xs rounded-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m,i)=>(
                <SelectItem key={i} value={(i+1).toString()}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-24 h-9 text-xs rounded-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[2024, 2025, 2026, 2027].map((y) => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="rounded-full bg-[#3B5249] text-white text-xs h-9" onClick={() => setShowBudget(true)} data-testid="add-budget-btn">
            <Plus className="w-4 h-4 mr-1" /> Add Budget
          </Button>
          <Button size="sm" variant="outline" className="rounded-full text-xs h-9 border-[#3B5249] text-[#3B5249]" onClick={() => setShowPlanned(true)} data-testid="add-planned-btn">
            <Plus className="w-4 h-4 mr-1" /> Schedule Payment
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="border border-[#E5E3DB] rounded-xl p-3">
          <p className="text-[10px] text-[#59615D] uppercase">Total Budget</p>
          <p className="font-heading text-xl font-semibold text-[#3B5249]">Rs.{totalBudget.toLocaleString("en-IN")}</p>
        </div>
        <div className="border border-[#E5E3DB] rounded-xl p-3">
          <p className="text-[10px] text-[#59615D] uppercase">Spent</p>
          <p className="font-heading text-xl font-semibold text-[#A66E4E]">Rs.{totalSpent.toLocaleString("en-IN")}</p>
        </div>
        <div className="border border-[#E5E3DB] rounded-xl p-3">
          <p className="text-[10px] text-[#59615D] uppercase">Remaining</p>
          <p className="font-heading text-xl font-semibold text-[#6B8E6B]">Rs.{totalRemaining.toLocaleString("en-IN")}</p>
        </div>
      </div>

      {/* Budgets list */}
      {loading ? (
        <p className="text-center py-6 text-sm text-[#59615D]">Loading…</p>
      ) : budgets.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-[#59615D] uppercase mb-2">Category Budgets</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {budgets.map((b) => (
              <div key={b.id} className={`border rounded-xl p-3 ${b.over_budget ? "border-red-200 bg-red-50" : "border-[#E5E3DB] bg-white"}`} data-testid={`budget-${b.id}`}>
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{b.category}</p>
                    <p className="text-[10px] text-[#59615D]">
                      Rs.{(b.spent || 0).toLocaleString("en-IN")} / Rs.{b.budget_amount.toLocaleString("en-IN")}
                    </p>
                  </div>
                  <button onClick={() => deleteBudget(b.id)} className="text-red-400 hover:text-red-600 p-1">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="mt-2 h-1.5 bg-[#F9F8F6] rounded-full overflow-hidden">
                  <div className={`h-full ${b.over_budget ? "bg-red-500" : "bg-[#3B5249]"}`} style={{ width: `${Math.min(100, b.usage_pct || 0)}%` }} />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-[#59615D]">{b.usage_pct}% used</span>
                  {b.over_budget && (
                    <span className="text-[10px] text-red-600 flex items-center gap-0.5"><AlertCircle className="w-3 h-3" /> Over budget</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calendar */}
      <div>
        <h4 className="text-xs font-semibold text-[#59615D] uppercase mb-2">Payment Calendar</h4>
        <div className="grid grid-cols-7 gap-1 text-center">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
            <div key={d} className="text-[10px] font-semibold text-[#59615D] py-1">{d}</div>
          ))}
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {calendarDays.map((d) => {
            const dayPayments = paymentsByDay[d] || [];
            const total = dayPayments.reduce((s, p) => s + (p.amount || 0), 0);
            return (
              <div
                key={d}
                className={`border rounded-lg p-1.5 min-h-[60px] text-left ${
                  dayPayments.length > 0 ? "border-[#A66E4E] bg-[#FFF8F0]" : "border-[#E5E3DB] bg-white"
                }`}
                data-testid={`cal-day-${d}`}
              >
                <div className="text-[10px] font-semibold text-[#59615D]">{d}</div>
                {dayPayments.length > 0 && (
                  <>
                    <div className="text-[9px] text-[#A66E4E] font-medium">
                      <IndianRupee className="w-2.5 h-2.5 inline" />
                      {total.toLocaleString("en-IN")}
                    </div>
                    <div className="text-[8px] text-[#59615D] truncate">{dayPayments[0].title}</div>
                    {dayPayments.length > 1 && (
                      <div className="text-[8px] text-[#59615D]">+{dayPayments.length - 1} more</div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Planned list */}
      {planned.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-[#59615D] uppercase mb-2">Upcoming / Scheduled Payments</h4>
          <div className="space-y-1.5">
            {planned.map((p) => (
              <div key={p.id} className={`flex justify-between items-center border rounded-xl px-3 py-2 ${p.status === "paid" ? "bg-[#F9F8F6] opacity-70" : "border-[#E5E3DB]"}`} data-testid={`planned-${p.id}`}>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-xs truncate">{p.title}</p>
                  <p className="text-[10px] text-[#59615D] truncate">{p.vendor || "—"} · {p.category || "—"} · Due {p.due_date}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-heading font-semibold text-sm text-[#3B5249]">Rs.{(p.amount || 0).toLocaleString("en-IN")}</span>
                  {p.status !== "paid" && (
                    <Button size="sm" variant="outline" className="rounded-full text-[10px] h-7 border-[#6B8E6B] text-[#6B8E6B]" onClick={() => markPaid(p.id)} data-testid={`mark-paid-${p.id}`}>
                      <CheckCircle2 className="w-3 h-3 mr-0.5" /> Paid
                    </Button>
                  )}
                  {p.status === "paid" && (
                    <span className="text-[10px] text-[#6B8E6B] flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" /> Paid</span>
                  )}
                  <button onClick={() => deletePlanned(p.id)} className="text-red-400 hover:text-red-600 p-1">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Budget Dialog */}
      <Dialog open={showBudget} onOpenChange={setShowBudget}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set Monthly Budget</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Category *</Label>
              <div className="flex gap-2">
                <Select value={bForm.category && expenseHeads.some(h => h.name === bForm.category) ? bForm.category : ""} onValueChange={(v) => setBForm({ ...bForm, category: v })}>
                  <SelectTrigger className="rounded-xl flex-1" data-testid="budget-cat"><SelectValue placeholder="Pick an expense head…" /></SelectTrigger>
                  <SelectContent>
                    {expenseHeads.map(h => (
                      <SelectItem key={h.id} value={h.name}>{h.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-[10px] text-[#59615D] self-center">or</span>
              </div>
              <Input
                value={bForm.category}
                onChange={(e) => setBForm({ ...bForm, category: e.target.value })}
                placeholder="Or type a custom category (e.g. Diwali Promo)"
                className="rounded-xl mt-2 text-[12px]"
                data-testid="budget-cat-custom"
              />
              <p className="text-[10px] text-[#59615D] mt-1">Pick an Expense Head from the dropdown <b>or</b> type a one-off category for this budget cycle. Any expense logged with the same category name will reduce the remaining budget automatically.</p>
            </div>
            <div>
              <Label className="text-xs">Budget Amount (Rs.) *</Label>
              <Input type="number" value={bForm.budget_amount} onChange={(e) => setBForm({ ...bForm, budget_amount: e.target.value })} placeholder="20000" className="rounded-xl" data-testid="budget-amt" />
            </div>
            <p className="text-[10px] text-[#59615D]">Will track against expenses with this exact category for {month}/{year}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setShowBudget(false)}>Cancel</Button>
            <Button className="rounded-full bg-[#3B5249] text-white" onClick={saveBudget} data-testid="save-budget-btn">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Planned Payment Dialog */}
      <Dialog open={showPlanned} onOpenChange={setShowPlanned}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule a Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Title *</Label>
              <Input value={pForm.title} onChange={(e) => setPForm({ ...pForm, title: e.target.value })} placeholder="e.g. Office rent" className="rounded-xl" data-testid="planned-title" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Amount</Label>
                <Input type="number" value={pForm.amount} onChange={(e) => setPForm({ ...pForm, amount: e.target.value })} className="rounded-xl" data-testid="planned-amt" />
              </div>
              <div>
                <Label className="text-xs">Due Date *</Label>
                <Input type="date" value={pForm.due_date} onChange={(e) => setPForm({ ...pForm, due_date: e.target.value })} className="rounded-xl" data-testid="planned-due" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Vendor</Label>
                <Input value={pForm.vendor} onChange={(e) => setPForm({ ...pForm, vendor: e.target.value })} className="rounded-xl" />
              </div>
              <div>
                <Label className="text-xs">Category</Label>
                <Input value={pForm.category} onChange={(e) => setPForm({ ...pForm, category: e.target.value })} className="rounded-xl" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Recurring</Label>
              <Select value={pForm.recurring} onValueChange={(v) => setPForm({ ...pForm, recurring: v })}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">One-time</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setShowPlanned(false)}>Cancel</Button>
            <Button className="rounded-full bg-[#3B5249] text-white" onClick={savePlanned} data-testid="save-planned-btn">Schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
