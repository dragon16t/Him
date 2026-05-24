/**
 * LeadScoreBadge — fetches /api/leads/:id/score and displays a colored badge
 * (hot / warm / cold). Click to view scoring reasons.
 */
import { useState } from "react";
import axios from "axios";
import { Flame, ThermometerSun, Snowflake, Loader2 } from "lucide-react";

const BAND_STYLES = {
  hot: { bg: "bg-rose-50 dark:bg-rose-900/40", text: "text-rose-700 dark:text-rose-200", border: "border-rose-200 dark:border-rose-700", Icon: Flame, label: "Hot" },
  warm: { bg: "bg-amber-50 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-200", border: "border-amber-200 dark:border-amber-700", Icon: ThermometerSun, label: "Warm" },
  cold: { bg: "bg-sky-50 dark:bg-sky-900/40", text: "text-sky-700 dark:text-sky-200", border: "border-sky-200 dark:border-sky-700", Icon: Snowflake, label: "Cold" },
};

export default function LeadScoreBadge({ leadId, compact = false }) {
  const [score, setScore] = useState(null);
  const [reasons, setReasons] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchScore = async () => {
    if (score !== null || loading) return;
    setLoading(true);
    try {
      const { data } = await axios.get(`/api/leads/${leadId}/score`);
      setScore({ score: data.score, band: data.band });
      setReasons(data.reasons || []);
    } catch (e) {
      setScore({ score: 0, band: "cold" });
      setReasons([e?.response?.data?.detail || "Score unavailable"]);
    } finally { setLoading(false); }
  };

  const toggle = async (e) => {
    e?.stopPropagation();
    await fetchScore();
    setOpen((o) => !o);
  };

  const style = score ? BAND_STYLES[score.band] : BAND_STYLES.cold;
  const Icon = style.Icon;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={toggle}
        aria-label={`Lead score${score ? `: ${score.score}, ${style.label}` : ", click to load"}`}
        data-testid={`lead-score-${leadId}`}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${style.bg} ${style.text} ${style.border} hover:opacity-80 transition-opacity`}
      >
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" />}
        {score ? (compact ? score.score : `${score.score} · ${style.label}`) : "Score"}
      </button>
      {open && score && (
        <div className="absolute z-50 mt-1 w-56 bg-white dark:bg-[#1e2825] border border-[#E5E3DB] dark:border-[#2d3530] rounded-lg shadow-lg p-3 text-[11px] text-[#2C3531] dark:text-[#e8e6df] space-y-1" role="dialog">
          <p className="font-semibold">Score breakdown</p>
          {reasons.length === 0 ? <p className="text-[#59615D]">No factors recorded.</p> : reasons.map((r) => <p key={r} className="text-[#59615D] dark:text-[#a6a89f]">{r}</p>)}
        </div>
      )}
    </div>
  );
}
