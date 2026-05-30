import { useState, useEffect } from "react";
import axios from "axios";
import { Clock } from "lucide-react";

const API = "/api";

/**
 * Attendance is HR-only. Employees see today's read-only summary marked by HR.
 */
export default function AttendanceCheckIn() {
  const [att, setAtt] = useState(null);
  const [date, setDate] = useState("");

  useEffect(() => {
    let mounted = true;
    axios.get(`${API}/attendance/today`)
      .then(({ data }) => { if (mounted) { setAtt(data.attendance); setDate(data.date); } })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  if (!att) {
    return (
      <div
        className="hidden md:flex items-center gap-1 text-[10px] text-[#A66E4E] px-2 py-1 rounded-full bg-[#F9F8F6] border border-[#E5E3DB]"
        data-testid="attendance-pending"
        title={`HR has not marked your attendance for ${date}`}
      >
        <Clock className="w-3 h-3" />
        <span>Awaiting HR</span>
      </div>
    );
  }

  const status = att.status || "—";
  const color = status === "present" ? "text-[#6B8E6B]"
    : status === "half_day" ? "text-[#D4A373]"
    : status === "leave" ? "text-blue-600"
    : status === "absent" ? "text-red-500"
    : "text-[#59615D]";

  return (
    <div
      className={`hidden md:flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-[#F9F8F6] border border-[#E5E3DB] ${color}`}
      data-testid="attendance-status"
    >
      <Clock className="w-3 h-3" />
      <span className="capitalize font-medium">{status.replace("_", " ")}</span>
      {att.login_time && <span className="text-[#59615D]">· {att.login_time}{att.logout_time ? `–${att.logout_time}` : ""}</span>}
      {att.hours_worked > 0 && <span className="text-[#59615D]">· {att.hours_worked}h</span>}
    </div>
  );
}
