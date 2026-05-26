import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Users, ChevronRight, IdCard, FileDown } from "lucide-react";
import EmployeeDetailDrawer from "./EmployeeDetailDrawer";
import EmployeeProfileDialog from "./EmployeeProfileDialog";
import EmployeeDocumentsDialog from "./EmployeeDocumentsDialog";

const API = "/api";

const ROLE_BADGES = {
  admin: "bg-purple-100 text-purple-800",
  sales_manager: "bg-blue-100 text-blue-800",
  district_manager: "bg-cyan-100 text-cyan-800",
  telecaller: "bg-emerald-100 text-emerald-800",
  agent: "bg-teal-100 text-teal-800",
  hr_manager: "bg-pink-100 text-pink-800",
  finance_manager: "bg-amber-100 text-amber-800",
  inventory_manager: "bg-indigo-100 text-indigo-800",
  social_media_manager: "bg-rose-100 text-rose-800",
  inhouse_telecaller: "bg-lime-100 text-lime-800",
};

/** Admin Employees panel — click any card opens 360° drawer. */
export default function AdminEmployeesPanel() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [profileId, setProfileId] = useState(null);
  const [docsEmployee, setDocsEmployee] = useState(null);

  useEffect(() => {
    axios.get(`${API}/admin/employees`)
      .then(r => setEmployees(r.data.employees))
      .catch(e => toast.error("Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = employees.filter(e => {
    if (roleFilter !== "all" && e.role !== roleFilter) return false;
    if (search && !`${e.name} ${e.role} ${e.phone} ${e.email}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const grouped = filtered.reduce((acc, e) => { (acc[e.role] = acc[e.role] || []).push(e); return acc; }, {});
  const roles = [...new Set(employees.map(e => e.role))];

  return (
    <div className="space-y-3" data-testid="admin-employees-panel">
      <div className="bg-white rounded-2xl border border-[#E5E3DB] p-4 flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-heading text-lg font-medium flex items-center gap-2"><Users className="w-5 h-5 text-[#3B5249]" />All Employees <span className="text-sm text-[#59615D]">· {filtered.length} of {employees.length}</span></h3>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="rounded-xl h-8 text-xs border border-[#E5E3DB] px-2" data-testid="emp-role-filter">
            <option value="all">All Roles</option>
            {roles.map(r => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
          </select>
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employees" className="rounded-xl h-8 text-xs w-56" data-testid="emp-search" />
        </div>
      </div>

      {loading ? <p className="text-center py-8 text-[#59615D]">Loading…</p> : (
        Object.entries(grouped).map(([role, items]) => (
          <div key={role}>
            <p className="font-heading text-xs text-[#59615D] uppercase tracking-wider mb-2 px-1">{role.replace(/_/g, " ")} ({items.length})</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map(e => (
                <div key={e.id} className="bg-white rounded-xl border border-[#E5E3DB] p-3 hover:shadow-md hover:border-[#3B5249] transition group" data-testid={`emp-card-${e.id}`}>
                  <button onClick={() => setSelected(e.id)} className="text-left w-full">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {e.profile_image ? (
                          <img src={e.profile_image} alt={e.name} className="w-9 h-9 rounded-full object-cover border border-[#E5E3DB] flex-shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#3B5249] to-[#A66E4E] flex items-center justify-center text-white font-heading text-sm flex-shrink-0">
                            {(e.name || "?").slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{e.name}</p>
                          <p className="text-[10px] text-[#59615D] truncate">{e.phone || e.email}</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#59615D] group-hover:text-[#3B5249] group-hover:translate-x-1 transition" />
                    </div>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span className={`text-[9px] px-2 py-0.5 rounded-full ${ROLE_BADGES[e.role] || "bg-gray-100 text-gray-800"}`}>{e.role.replace(/_/g, " ")}</span>
                      {e.salary > 0 && <span className="text-[10px] text-[#59615D]">Rs.{e.salary.toLocaleString()}/mo</span>}
                    </div>
                  </button>
                  <Button
                    size="sm" variant="outline"
                    onClick={(ev) => { ev.stopPropagation(); setProfileId(e.id); }}
                    className="rounded-full mt-2 w-full text-[10px] h-6 border-[#3B5249] text-[#3B5249] hover:bg-[#3B5249] hover:text-white"
                    data-testid={`view-profile-${e.id}`}
                  >
                    <IdCard className="w-3 h-3 mr-1" />Full Profile & PDF
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    onClick={(ev) => { ev.stopPropagation(); setDocsEmployee(e); }}
                    className="rounded-full mt-1 w-full text-[10px] h-6 border-[#A66E4E] text-[#A66E4E] hover:bg-[#A66E4E] hover:text-white"
                    data-testid={`view-docs-${e.id}`}
                  >
                    <FileDown className="w-3 h-3 mr-1" />Letters & Documents
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
      {selected && <EmployeeDetailDrawer employeeId={selected} onClose={() => setSelected(null)} />}
      <EmployeeProfileDialog
        open={!!profileId}
        onOpenChange={(o) => { if (!o) setProfileId(null); }}
        employeeId={profileId}
      />
      <EmployeeDocumentsDialog
        open={!!docsEmployee}
        onOpenChange={(o) => { if (!o) setDocsEmployee(null); }}
        employee={docsEmployee}
      />
    </div>
  );
}
