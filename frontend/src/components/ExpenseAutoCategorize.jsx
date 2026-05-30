import React, { useEffect, useState } from "react";
import axios from "axios";
import { Sparkles, Check } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Inline AI auto-suggest for expense category based on title + notes.
 * Calls /api/expenses/categorize (rule-based keyword matching, no API key needed).
 * Displays a subtle pill that the user can click to accept the suggestion.
 *
 * Props:
 *   title    : current expense title
 *   notes    : optional notes
 *   category : currently selected category (so we don't re-suggest the same)
 *   onApply  : (suggestedCategory) => void
 */
export default function ExpenseAutoCategorize({ title, notes, category, onApply }) {
  const [suggestion, setSuggestion] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!title || title.trim().length < 3) { setSuggestion(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await axios.post(`${API}/expenses/categorize`, { title, notes });
        if (!cancelled) setSuggestion(data.suggestion || null);
      } catch {
        if (!cancelled) setSuggestion(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 450);
    return () => { cancelled = true; clearTimeout(t); };
  }, [title, notes]);

  if (!suggestion || !suggestion.category || suggestion.category === "Uncategorized") return null;
  const alreadyApplied = (category || "").toLowerCase() === suggestion.category.toLowerCase();
  if (alreadyApplied) {
    return (
      <div className="flex items-center gap-1 text-[10px] text-[#6B8E6B] mt-1">
        <Check className="w-3 h-3" /> Smart-matched
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onApply?.(suggestion.category)}
      className="mt-1 inline-flex items-center gap-1 text-[10px] bg-[#FFF8F0] text-[#A66E4E] border border-[#E5E3DB] rounded-full px-2 py-0.5 hover:bg-[#FFEFE0] transition"
      data-testid="expense-suggestion-pill"
      title={`Matched keyword: "${suggestion.matched_keyword}"`}
    >
      <Sparkles className="w-3 h-3" />
      {loading ? "Thinking…" : `Suggest: ${suggestion.category}`}
    </button>
  );
}
