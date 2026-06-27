/**
 * LeadDistributionPanel.jsx — Bulk-allocate phone numbers as leads across
 * the Sales Manager's telecallers.
 *
 * Three modes:
 *  • Equal (smart) — balances against today's existing lead-load
 *  • Round Robin   — plain rotation across the selected TCs
 *  • Name Mapped   — paste blocks like "👤 Yumna (25) <numbers>" — names auto-resolve
 *
 * Live preview chips show how many phones each TC would receive before commit.
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Users, Upload, Sparkles, RefreshCw, Tag, Check, AlertTriangle } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

const MODES = [
  { v: "equal", l: "⚖️ Equal (smart)", hint: "Load-balanced against each TC's existing leads today" },
  { v: "round_robin", l: "🔄 Round Robin", hint: "Simple rotation A,B,C,A,B,C..." },
  { v: "name_mapped", l: "🏷 Name-mapped", hint: "Paste blocks like '👤 Yumna' followed by numbers" },
];

// Parse a free-text block. Names ahead of phone numbers form groups.
function parseNameMapped(text) {
  const mapping = {};
  let current = null;
  const lines = (text || "").split(/\r?\n/);
  // Recognise a "name header" — has a name-like prefix and possibly an emoji / count
  // e.g. "👤 Yumna (25)" or "Yumna" or "👤 Yumna"
  const phoneOf = (line) => {
    const m = line.match(/(\+?\d[\d\s\-]{6,})/);
    return m ? m[1].replace(/[\s\-]/g, "") : null;
  };
  const isHeader = (line) => {
    if (phoneOf(line)) return false; // line containing a phone is never a header
    const stripped = line.replace(/[👤📞📱•\-*\d().]/g, "").trim();
    return stripped.length >= 2 && /[A-Za-z]/.test(stripped);
  };
  const headerName = (line) => {
    // Strip leading emoji + bullet, drop trailing "(NN)" counts
    let name = line.replace(/^[\s👤📞📱•\-*]+/, "");
    name = name.replace(/\s*\(\s*\d+\s*\)\s*$/, "");
    name = name.replace(/^\d+[.)]\s*/, "");
    return name.trim();
  };
  for (const raw of lines) {
    const line = (raw || "").trim();
    if (!line) continue;
    if (isHeader(line)) {
      const n = headerName(line);
      if (n && !/today.?s/i.test(n)) {
        current = n;
        if (!mapping[current]) mapping[current] = [];
      }
      continue;
    }
    const ph = phoneOf(line);
    if (ph && current) {
      mapping[current].push(ph);
    }
  }
  return mapping;
}

// Parse a flat list — pluck phone numbers ignoring everything else.
// Split by line/comma/semicolon first so each token is a single phone candidate.
function parseFlatPhones(text) {
  const phones = [];
  const tokens = (text || "").split(/[\r\n,;]+/);
  const re = /(\+?\d[\d \-]{6,}\d)/;
  for (const tok of tokens) {
    const m = tok.match(re);
    if (m) phones.push(m[1].replace(/[\s\-]/g, ""));
  }
  return phones;
}

export default function LeadDistributionPanel({ smId, telecallers: parentTelecallers, salesManagers = [] }) {
  const [mode, setMode] = useState("equal");
  const [text, setText] = useState("");
  const [selectedTcs, setSelectedTcs] = useState([]);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [adminSmId, setAdminSmId] = useState(smId || "");
  const [team, setTeam] = useState(parentTelecallers || []);

  const activeSm = smId || adminSmId;

  // Auto-load TC list when no parent provided (used in Admin path)
  useEffect(() => {
    if (parentTelecallers) { setTeam(parentTelecallers); return; }
    if (!activeSm) { setTeam([]); return; }
    axios.get(`${API}/telecallers`).then(r => {
      const list = (r.data?.telecallers || r.data || []).filter(t => t.managed_by === activeSm);
      setTeam(list);
    }).catch(() => setTeam([]));
  }, [activeSm, parentTelecallers]);

  // Auto-select all TCs by default
  useEffect(() => { setSelectedTcs(team.map(t => t.id)); }, [team]);

  const parsedPhones = useMemo(() => mode === "name_mapped" ? [] : parseFlatPhones(text), [text, mode]);
  const parsedMapping = useMemo(() => mode === "name_mapped" ? parseNameMapped(text) : {}, [text, mode]);
  const mappingTotal = Object.values(parsedMapping).reduce((s, ar) => s + (ar?.length || 0), 0);

  const toggleTc = (id) => setSelectedTcs(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const allTc = () => setSelectedTcs(team.map(t => t.id));
  const noTc = () => setSelectedTcs([]);

  const buildPayload = useCallback(() => {
    const payload = { mode, source: "manual_bulk" };
    if (!smId && adminSmId) payload.sales_manager_id = adminSmId;
    if (mode === "name_mapped") {
      payload.mapping = parsedMapping;
    } else {
      payload.phone_numbers = parsedPhones;
      if (selectedTcs.length && selectedTcs.length !== team.length) payload.telecaller_ids = selectedTcs;
    }
    return payload;
  }, [mode, parsedPhones, parsedMapping, selectedTcs, team.length, smId, adminSmId]);

  const doPreview = async () => {
    setPreviewing(true); setResult(null);
    try {
      const { data } = await axios.post(`${API}/leads/preview-distribute`, buildPayload());
      setPreview(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Preview failed");
    } finally { setPreviewing(false); }
  };

  const doCommit = async () => {
    if (mode === "name_mapped") {
      if (mappingTotal === 0) return toast.error("Paste at least one name with phone numbers below it");
    } else {
      if (parsedPhones.length === 0) return toast.error("Paste at least one phone number");
      if (selectedTcs.length === 0) return toast.error("Select at least one telecaller");
    }
    setCommitting(true);
    try {
      const { data } = await axios.post(`${API}/leads/bulk-distribute`, buildPayload());
      setResult(data);
      toast.success(`${data.created} leads created · ${data.skipped_duplicates} dupes skipped${data.unmatched_names ? ` · ${data.unmatched_names} unmatched names` : ""}`);
      setPreview(null);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Distribution failed");
    } finally { setCommitting(false); }
  };

  const inputSize = mode === "name_mapped" ? mappingTotal : parsedPhones.length;

  return (
    <div className="space-y-4" data-testid="lead-distribution-panel">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-heading text-[16px] flex items-center gap-2 text-[#2C3531]"><Sparkles className="w-4 h-4 text-[#A66E4E]"/>Daily Lead Allocation</h3>
          <p className="text-[10px] text-[#7B6D5A]">Paste today&apos;s phone list — leads spread equally across the selected telecallers (or per the names you specify).</p>
        </div>
        {!smId && (
          <div className="flex items-center gap-2 bg-white border border-[#E5E3DB] rounded-2xl px-3 py-2">
            <Label className="text-[10px] uppercase tracking-wider text-[#7B6D5A]">Sales Manager</Label>
            <select value={adminSmId} onChange={e => setAdminSmId(e.target.value)} className="bg-transparent text-xs h-7 outline-none" data-testid="ld-admin-sm-select">
              <option value="">— pick —</option>
              {salesManagers.map(sm => <option key={sm.id} value={sm.id}>{sm.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Mode chips */}
      <div className="flex flex-wrap gap-1.5" data-testid="ld-mode-chips">
        {MODES.map(m => (
          <button key={m.v} onClick={() => { setMode(m.v); setPreview(null); }} className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition ${mode === m.v ? "bg-[#3B5249] text-white" : "bg-white border border-[#E5E3DB] text-[#59615D] hover:border-[#3B5249]"}`} data-testid={`ld-mode-${m.v}`} title={m.hint}>
            {m.l}
          </button>
        ))}
      </div>

      {/* Layout: paste box + team picker */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 bg-white border border-[#E5E3DB] rounded-2xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">
              {mode === "name_mapped" ? "Paste daily-allocation block (with TC names + phones)" : "Paste phone numbers (one per line, +91 prefix optional)"}
            </Label>
            <Badge variant="outline" className="text-[10px]" data-testid="ld-count-badge">
              {mode === "name_mapped"
                ? `${Object.keys(parsedMapping).length} TCs · ${mappingTotal} numbers detected`
                : `${parsedPhones.length} numbers detected`}
            </Badge>
          </div>
          <textarea
            value={text}
            onChange={e => { setText(e.target.value); setPreview(null); }}
            placeholder={mode === "name_mapped"
              ? "👤 Yumna (25)\n1. +91 94475 58409\n2. +91 81380 71494\n...\n\n👤 Amina Rifa (21)\n+91 90743 60092\n..."
              : "+91 94475 58409\n+91 81380 71494\n+91 90483 86854\n..."}
            rows={mode === "name_mapped" ? 14 : 10}
            className="w-full font-mono text-[11px] border border-[#E5E3DB] rounded-xl p-2 outline-none focus:border-[#3B5249] bg-[#F9F8F6]"
            data-testid="ld-textarea"
          />
        </div>

        <div className="bg-white border border-[#E5E3DB] rounded-2xl p-3 space-y-2">
          {mode === "name_mapped" ? (
            <>
              <Label className="text-xs flex items-center gap-1"><Tag className="w-3 h-3"/>Detected TC names</Label>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {Object.entries(parsedMapping).length === 0
                  ? <p className="text-[10px] text-[#7B6D5A] italic">No names detected yet.</p>
                  : Object.entries(parsedMapping).map(([name, phs]) => {
                    const match = team.find(t => (t.name || "").toLowerCase().replace(/\s+/g, "").includes(name.toLowerCase().replace(/\s+/g, "")) || name.toLowerCase().replace(/\s+/g, "").includes((t.name || "").toLowerCase().replace(/\s+/g, "")));
                    return (
                      <div key={name} className={`text-[11px] flex items-center justify-between px-2 py-1 rounded-lg ${match ? "bg-emerald-50 border border-emerald-200" : "bg-amber-50 border border-amber-200"}`} data-testid={`ld-name-${name}`}>
                        <span className="truncate flex items-center gap-1">
                          {match ? <Check className="w-3 h-3 text-emerald-600"/> : <AlertTriangle className="w-3 h-3 text-amber-600"/>}
                          <b>{name}</b>
                          {match && <span className="text-[#7B6D5A]">→ {match.name}</span>}
                        </span>
                        <Badge variant="outline" className="text-[9px]">{(phs || []).length}</Badge>
                      </div>
                    );
                  })}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1"><Users className="w-3 h-3"/>Telecallers ({selectedTcs.length}/{team.length})</Label>
                <div className="flex gap-1">
                  <button onClick={allTc} className="text-[9px] underline text-[#3B5249]" data-testid="ld-select-all">All</button>
                  <button onClick={noTc} className="text-[9px] underline text-[#A66E4E]">None</button>
                </div>
              </div>
              {team.length === 0 ? (
                <p className="text-[10px] text-[#7B6D5A] italic">{activeSm ? "No telecallers under this Sales Manager." : "Pick a Sales Manager first."}</p>
              ) : (
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {team.map(t => (
                    <label key={t.id} className={`flex items-center gap-2 text-[11px] p-1.5 rounded-lg cursor-pointer ${selectedTcs.includes(t.id) ? "bg-[#3B5249]/10" : "hover:bg-[#F9F8F6]"}`} data-testid={`ld-tc-${t.id}`}>
                      <input type="checkbox" checked={selectedTcs.includes(t.id)} onChange={() => toggleTc(t.id)} className="rounded"/>
                      <span className="flex-1">{t.name}</span>
                      <span className="text-[#7B6D5A] text-[10px]">{t.phone || ""}</span>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Action row */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button onClick={doPreview} disabled={previewing || inputSize === 0} variant="outline" className="rounded-full text-xs" data-testid="ld-preview-btn">
          {previewing ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin"/> : <Sparkles className="w-3.5 h-3.5 mr-1"/>}
          Preview Distribution
        </Button>
        <Button onClick={doCommit} disabled={committing || inputSize === 0} className="rounded-full bg-[#3B5249] hover:bg-[#2C3531] text-white text-xs" data-testid="ld-commit-btn">
          {committing ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin"/> : <Upload className="w-3.5 h-3.5 mr-1"/>}
          Create {inputSize} Leads
        </Button>
        {inputSize === 0 && <span className="text-[10px] text-[#A66E4E]">Paste numbers to enable.</span>}
      </div>

      {/* Preview result */}
      {preview && (
        <div className="bg-[#F9F8F6] border border-[#E5E3DB] rounded-2xl p-3" data-testid="ld-preview-summary">
          <p className="text-[11px] font-medium mb-2"><Sparkles className="w-3 h-3 inline mr-1"/>Distribution preview · {preview.total} leads</p>
          <div className="flex flex-wrap gap-1.5">
            {preview.summary.map(s => (
              <Badge key={s.telecaller_id || "_un"} className={`text-[10px] ${s.telecaller_id ? "bg-[#3B5249] text-white" : "bg-amber-100 text-amber-800 border border-amber-300"}`} data-testid={`ld-preview-tc-${s.telecaller_id || "unmatched"}`}>
                {s.telecaller_name || "—"}: <b className="ml-1">{s.count}</b>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Commit result */}
      {result && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3" data-testid="ld-commit-summary">
          <p className="text-[11px] font-medium mb-2 text-emerald-900">
            ✅ Created <b>{result.created}</b> leads · skipped <b>{result.skipped_duplicates}</b> duplicates
            {result.unmatched_names > 0 && <> · <b>{result.unmatched_names}</b> unmatched names</>}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {result.summary.map(s => (
              <Badge key={s.telecaller_id} className="text-[10px] bg-emerald-600 text-white" data-testid={`ld-result-tc-${s.telecaller_id}`}>
                {s.telecaller_name}: <b className="ml-1">+{s.count}</b>
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
