import { useState, useEffect } from "react";
import ProgressTracker from "./ProgressTracker";
import logo from "../assets/Logo.png";
import { useAppContext } from "../AppContext";
import { apiPost, apiGet } from "../api/client";
import ErrorBox from "./ui/ErrorBox";
const PAGE_SIZE = 50;

// ── Fit-tag visual styles ─────────────────────────────────────────────────────
const FIT = {
  "High Fit":   { bg: "#dcfce7", border: "#86efac", text: "#15803d" },
  "Medium Fit": { bg: "#fef9c3", border: "#fde047", text: "#a16207" },
  "Low Fit":    { bg: "#f3f4f6", border: "#d1d5db", text: "#6b7280" },
};

// ── Email masking helper ──────────────────────────────────────────────────────
const maskEmail = (email) => {
  if (!email) return "—";
  const atIdx = email.indexOf("@");
  if (atIdx < 0) return email;
  const local  = email.slice(0, atIdx);
  const domain = email.slice(atIdx);
  const visible = local.slice(0, Math.min(2, local.length));
  const stars   = "*".repeat(Math.max(2, Math.min(4, local.length - visible.length)));
  return `${visible}${stars}${domain}`;
};

// ── Lead card ─────────────────────────────────────────────────────────────────
const LeadCard = ({ lead, index, onSelect, showScore, isSelected, onToggleSelect }) => {
  // Use backend rank when available (global across all leads), else local page index
  const displayRank    = lead.rank ?? (index + 1);
  const hasScore       = lead.final_score !== undefined;
  const locScore       = lead.location_score ?? 0;
  const kwScore        = lead.keyword_score  ?? 0;
  const finalScore     = lead.final_score    ?? 0;

  // Score colour: green=high, amber=medium, grey=low
  const scoreColor = finalScore >= 5 ? "#15803d" : finalScore >= 2 ? "#a16207" : "#6b7280";
  const scoreBg    = finalScore >= 5 ? "#dcfce7" : finalScore >= 2 ? "#fef9c3" : "#f3f4f6";
  const scoreBdr   = finalScore >= 5 ? "#86efac" : finalScore >= 2 ? "#fde047" : "#d1d5db";

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md"
      style={{ borderColor: isSelected ? "#9b72d0" : "#e5e7eb", backgroundColor: isSelected ? "#faf5ff" : "#fff" }}
    >
      {/* Checkbox */}
      <div className="flex-shrink-0 pt-0.5">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(lead)}
          className="w-4 h-4 rounded accent-purple-600 cursor-pointer"
          title="Select for bulk email"
        />
      </div>

      {/* Rank bubble */}
      <div
        className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border mt-0.5"
        style={{
          backgroundColor: displayRank <= 10 ? "#fef9c3" : "#f9fafb",
          borderColor:     displayRank <= 10 ? "#fde047" : "#e5e7eb",
          color:           displayRank <= 10 ? "#a16207" : "#6b7280",
        }}
        title={`Rank #${displayRank}`}
      >
        {displayRank}
      </div>

      {/* Lead info */}
      <div className="flex-1 min-w-0 space-y-0.5">

        {/* Row 1: Name */}
        <p className="text-sm font-bold text-gray-900 truncate">{lead.name || "—"}</p>

        {/* Row 2: Role */}
        {lead.title && (
          <p className="text-xs text-gray-600 truncate">{lead.title}</p>
        )}

        {/* Row 3: Company */}
        {lead.company && (
          <p className="text-xs font-semibold text-indigo-700 truncate">{lead.company}</p>
        )}

        {/* Row 4: Industry · Location · Masked email */}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-0.5">
          {(lead.canonical_industry || lead.industry) && (
            <span className="text-[11px] text-gray-500 italic">
              {lead.canonical_industry || lead.industry}
            </span>
          )}
          {(lead.city || lead.country) && (
            <span className="text-[11px] text-gray-400">
              {[lead.city, lead.country].filter(Boolean).join(", ")}
            </span>
          )}
          {lead.email && (
            <span className="text-[11px] text-gray-500 font-mono" title="Email masked for privacy">
              {maskEmail(lead.email)}
            </span>
          )}
        </div>

        {/* Row 5: Score breakdown (only when scoring is active) */}
        {hasScore && (
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            {/* Final score badge */}
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
              style={{ backgroundColor: scoreBg, borderColor: scoreBdr, color: scoreColor }}
              title={`Score = Location (${locScore}/2) + Keywords (${kwScore})`}
            >
              Score: {finalScore}
            </span>

            {/* Location pill */}
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded border"
              style={{
                backgroundColor: locScore === 2 ? "#dcfce7" : locScore === 1 ? "#fef9c3" : "#f3f4f6",
                borderColor:     locScore === 2 ? "#86efac" : locScore === 1 ? "#fde047" : "#d1d5db",
                color:           locScore === 2 ? "#15803d" : locScore === 1 ? "#a16207" : "#6b7280",
              }}
              title={lead.location_reason || "Location score"}
            >
              📍 {locScore === 2 ? "City match" : locScore === 1 ? "Country match" : "No location match"}
            </span>

            {/* Keyword pill */}
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded border"
              style={{
                backgroundColor: kwScore >= 3 ? "#dcfce7" : kwScore >= 1 ? "#ede9fe" : "#f3f4f6",
                borderColor:     kwScore >= 3 ? "#86efac" : kwScore >= 1 ? "#c4b5fd" : "#d1d5db",
                color:           kwScore >= 3 ? "#15803d" : kwScore >= 1 ? "#6b21a8" : "#6b7280",
              }}
              title={`Matching keywords: ${(lead.keyword_matches || []).join(", ") || "none"}`}
            >
              {kwScore > 0 ? `${kwScore} keyword${kwScore > 1 ? "s" : ""}` : "No keywords"}
            </span>

            {/* Matched keyword chips (up to 4) */}
            {lead.keyword_matches?.slice(0, 4).map((kw, i) => (
              <span
                key={i}
                className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: "#ede9fe", color: "#6b21a8" }}
              >
                {kw}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Compose button — clicking auto-fills email + LinkedIn in Content Generation */}
      <button
        onClick={() => onSelect(lead)}
        className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold text-white border-2 border-[#4a8a4a] shadow-sm hover:brightness-105 active:scale-95 transition-all"
        style={{ backgroundColor: "#5a9e5a" }}
        title={`Compose email for ${lead.name}${lead.linkedin ? " · LinkedIn pre-filled" : ""}`}
      >
        Compose →
      </button>
    </div>
  );
};

// ── Intelligence badge ────────────────────────────────────────────────────────
const IntelBadge = ({ ciData, miData }) => {
  if (!ciData && !miData) return null;
  const parts = [];
  if (ciData) {
    const kws  = (ciData.keywords  || []).length;
    const icps = (ciData.icp       || []).length;
    parts.push(`CI: ${icps} ICP · ${kws} keywords`);
  }
  if (miData) {
    const clusters = (miData.keyword_clusters || []).length;
    const segs     = (miData.target_segments  || []).length;
    parts.push(`MI: ${clusters} clusters · ${segs} segments`);
  }
  return (
    <div
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs"
      style={{ backgroundColor: "#ede9fe", borderColor: "#c4b5fd" }}
    >
      <span className="text-lg">🧠</span>
      <div>
        <p className="font-bold text-indigo-800">Smart Scoring Active</p>
        <p className="text-indigo-600">{parts.join("  ·  ")}</p>
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
const LeadDiscoveryPage = ({ user, onSignOut, onSelectProspect }) => {
  const { ciData, miData, csvLeads, setCsvLeads, setSelectedProspect } = useAppContext();

  const [step,      setStep]      = useState(csvLeads ? "done" : "idle");
  const [leads,     setLeads]     = useState(csvLeads || []);
  const [fromCache, setFromCache] = useState(!!csvLeads);
  const [error,     setError]     = useState("");
  const [dynamicLoading, setDynamicLoading] = useState(false);
  const [sourcesUsed, setSourcesUsed] = useState([]);

  // ── Industry filter state ─────────────────────────────────────────────────
  const [industryList,    setIndustryList]    = useState([]);    // from API
  const [industryGroups,  setIndustryGroups]  = useState({});    // {name: count}
  const [selectedIndustry, setSelectedIndustry] = useState(""); // "" = all
  const [search,    setSearch]    = useState("");
  const [page,      setPage]      = useState(1);
  const [viewMode,  setViewMode]  = useState("recommended"); // "recommended" | "all"
  const [groupByIndustry, setGroupByIndustry] = useState(false);
  const [sortBy,    setSortBy]    = useState("score");       // "score" | "final_score" | "name"

  // ── Bulk email state ──────────────────────────────────────────────────────
  const [selectedLeads,  setSelectedLeads]  = useState(new Set()); // set of emails
  const [bulkPanel,      setBulkPanel]      = useState(false);
  const [bulkFrom,       setBulkFrom]       = useState("");
  const [bulkSubject,    setBulkSubject]    = useState("");
  const [bulkContent,    setBulkContent]    = useState("");
  const [bulkLoading,    setBulkLoading]    = useState(false);
  const [bulkResult,     setBulkResult]     = useState(null);
  const [bulkError,      setBulkError]      = useState("");

  const hasIntelligence = !!(ciData || miData);

  // Load on mount if not cached in context
  useEffect(() => {
    if (!csvLeads) {
      loadLeads(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadLeads = async (forceRefresh = false) => {
    setStep("loading");
    setError("");
    setPage(1);
    try {
      let data;
      if (ciData || miData) {
        // ── Use intelligence-based scoring endpoint ─────────────────────────
        data = await apiPost("/api/score-leads", {
          ci_data:       ciData  || null,
          mi_data:       miData  || null,
          force_refresh: forceRefresh,
        });
      } else {
        // ── Fallback: plain CSV list ─────────────────────────────────────────
        data = await apiGet(`/api/csv-leads${forceRefresh ? "?force_refresh=true" : ""}`);
      }
      setLeads(data.leads || []);
      setCsvLeads(data.leads || []);
      setFromCache(data.from_cache === true);
      if (data.industry_list)   setIndustryList(data.industry_list);
      if (data.industry_groups) setIndustryGroups(data.industry_groups);
      setSelectedIndustry("");   // reset filter on reload
      setStep("done");
    } catch (e) {
      setError(e.message);
      setStep("error");
    }
  };

  const loadDynamicLeads = async () => {
    if (!ciData) { setError("Run Company Intelligence first to define your target ICP."); return; }
    setDynamicLoading(true); setError(""); setPage(1);
    try {
      const data = await apiPost("/api/dynamic-leads", {
        target_customers: ciData.icp || [],
        buyer_industry:   ciData.industry || "",
        offerings:        ciData.services || [],
        source_company_url: ciData.company_url || "",
        use_csv_fallback: true,
      });

      // Score the dynamic leads if intelligence is available
      if (ciData || miData) {
        try {
          const scored = await apiPost("/api/score-leads", {
            ci_data: ciData || null, mi_data: miData || null, force_refresh: true,
          });
          // Merge dynamic leads with scoring data by email
          const scoreMap = Object.fromEntries((scored.leads || []).map(l => [l.email, l]));
          const merged = (data.leads || []).map(l => scoreMap[l.email] ? { ...l, ...scoreMap[l.email] } : l);
          setLeads(merged); setSourcesUsed(data.sources_used || []); setStep("done"); return;
        } catch (_) { /* scoring is best-effort — fall through to unscored results */ }
      }
      setLeads(data.leads || []);
      setSourcesUsed(data.sources_used || []);
      setStep("done");
    } catch (e) {
      setError(e.message);
      setStep("error");
    } finally {
      setDynamicLoading(false);
    }
  };

  const handleSelect = (lead) => {
    setSelectedProspect(lead);
    onSelectProspect(lead);
  };

  const handleToggleSelect = (lead) => {
    if (!lead.email) return;
    setSelectedLeads(prev => {
      const next = new Set(prev);
      next.has(lead.email) ? next.delete(lead.email) : next.add(lead.email);
      return next;
    });
  };

  const handleSelectAll = (visibleLeads) => {
    const emailsWithEmail = visibleLeads.filter(l => l.email).map(l => l.email);
    setSelectedLeads(prev => {
      const allSelected = emailsWithEmail.every(e => prev.has(e));
      const next = new Set(prev);
      if (allSelected) {
        emailsWithEmail.forEach(e => next.delete(e));
      } else {
        emailsWithEmail.forEach(e => next.add(e));
      }
      return next;
    });
  };

  const handleSendBulk = async () => {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(bulkFrom)) { setBulkError("Invalid sender email."); return; }
    if (!bulkSubject.trim())     { setBulkError("Subject is required."); return; }
    if (!bulkContent.trim())     { setBulkError("Email content is required."); return; }
    setBulkLoading(true); setBulkError(""); setBulkResult(null);
    const toEmails = [...selectedLeads];
    try {
      const data = await apiPost("/api/send-email", {
        from_email: bulkFrom,
        to_email:   toEmails[0],
        to_emails:  toEmails,
        subject:    bulkSubject,
        content:    bulkContent,
      });
      setBulkResult(data);
    } catch (e) { setBulkError(e.message); }
    finally { setBulkLoading(false); }
  };

  // ── Filtering ─────────────────────────────────────────────────────────────
  const matchesSearch = (lead) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (lead.name     || "").toLowerCase().includes(q) ||
      (lead.company  || "").toLowerCase().includes(q) ||
      (lead.email    || "").toLowerCase().includes(q) ||
      (lead.title    || "").toLowerCase().includes(q) ||
      (lead.industry || "").toLowerCase().includes(q) ||
      (lead.city     || "").toLowerCase().includes(q)
    );
  };

  // "Recommended" = High Fit or Medium Fit (percentile-based fit_tag, not absolute score).
  // Using score >= 40 was wrong: Medium Fit leads can have scores below 40 because
  // fit_tag is assigned by percentile bucket (top 70%), not by fixed score threshold.
  const isRecommended = (lead) =>
    !hasIntelligence || lead.fit_tag === "High Fit" || lead.fit_tag === "Medium Fit";

  const filtered = (() => {
    const base = leads.filter((lead) => {
      if (!matchesSearch(lead)) return false;
      if (viewMode === "recommended" && !isRecommended(lead)) return false;
      if (selectedIndustry) {
        const leadInd = lead.canonical_industry || lead.industry || "Other";
        if (leadInd !== selectedIndustry) return false;
      }
      return true;
    });

    // Client-side sort (backend already sorts by score; this handles UI toggles)
    if (sortBy === "final_score") {
      return [...base].sort((a, b) => (b.final_score ?? 0) - (a.final_score ?? 0));
    }
    if (sortBy === "name") {
      return [...base].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }
    // Default "score" — keep server order (sorted by 100-pt score desc)
    return base;
  })();

  // Use fit_tag for counts — consistent with Recommended filter and percentile bucketing.
  // score >= 70 / score >= 40 was wrong: fit_tag is percentile-based, not score-threshold.
  const highFitCount   = leads.filter(l => l.fit_tag === "High Fit").length;
  const mediumFitCount = leads.filter(l => l.fit_tag === "Medium Fit").length;
  const totalPages      = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated       = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const isLoading       = step === "loading";

  // ── Industry grouping ─────────────────────────────────────────────────────
  // Groups filtered leads by canonical_industry (ICP-derived, not hardcoded).
  // "Other" bucket always appears last. Groups sorted by avg score (desc).
  const groupedLeads = (() => {
    if (!groupByIndustry) return null;
    const groups = {};
    for (const lead of filtered) {
      const key = (lead.canonical_industry || lead.industry || "Other").trim();
      if (!groups[key]) groups[key] = [];
      groups[key].push(lead);
    }
    const sorted = Object.entries(groups).sort(([nameA, a], [nameB, b]) => {
      if (nameA === "Other") return 1;
      if (nameB === "Other") return -1;
      const avgA = a.reduce((s, l) => s + (l.score || 0), 0) / (a.length || 1);
      const avgB = b.reduce((s, l) => s + (l.score || 0), 0) / (b.length || 1);
      return avgB - avgA;
    });
    return sorted; // [ [industryName, [leads...]], ... ]
  })();

  // ── Progress tracker ──────────────────────────────────────────────────────
  const trackerStatuses = {
    ci: ciData ? "done" : "locked",
    mi: miData ? "done" : "locked",
    ld: isLoading ? "in_progress" : step === "done" ? "done" : "locked",
    cg: "locked",
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f8f9fa" }}>

      {/* Top bar */}
      <div
        className="border-b border-gray-200 px-8 h-14 flex items-center justify-between overflow-visible bg-white shadow-sm"
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-4 bg-gray-700 rounded-sm" />
          <span className="text-sm font-bold text-gray-800 tracking-tight">AI Growth Strategist</span>
        </div>
        <div className="flex items-center gap-4">
          {user && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600 font-medium">👤 {user}</span>
              <button
                onClick={onSignOut}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-gray-700 border border-gray-200 hover:bg-gray-100 active:scale-95 transition-all bg-white"
              >
                ⎋ Sign Out
              </button>
            </div>
          )}
          <img src={logo} alt="Logo" className="h-32 w-auto object-contain" />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-8 pt-5 pb-6 space-y-4">

        {/* Header */}
        <div className="flex items-end justify-between gap-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight leading-tight">Lead Discovery</h1>
            <p className="text-xs text-gray-600 mt-0.5">
              {hasIntelligence
                ? "Prospects ranked by relevance to your Company & Market Intelligence."
                : "Browse and select prospects from your Apollo leads database."}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={loadDynamicLeads}
              disabled={isLoading || dynamicLoading}
              title="Discover leads dynamically via Google Search + Hunter.io (requires API keys)"
              className="px-4 py-2 rounded-lg text-sm font-bold text-white border-0 shadow-md hover:shadow-lg hover:brightness-105 active:scale-95 transition-all whitespace-nowrap disabled:opacity-50"
              style={{ backgroundColor: "#9b72d0" }}
            >
              {dynamicLoading ? "Discovering…" : "⚡ Dynamic"}
            </button>
            <button
              onClick={() => loadLeads(true)}
              disabled={isLoading || dynamicLoading}
              className="px-4 py-2 rounded-lg text-sm font-bold text-white border-0 shadow-md hover:shadow-lg hover:brightness-105 active:scale-95 transition-all whitespace-nowrap disabled:opacity-50"
              style={{ backgroundColor: "#4f46e5" }}
            >
              {isLoading ? "Loading…" : "↺ Refresh"}
            </button>
          </div>
        </div>

        {/* Progress Tracker */}
        <ProgressTracker statuses={trackerStatuses} />

        {/* Intelligence badge */}
        {hasIntelligence && <IntelBadge ciData={ciData} miData={miData} />}

        {/* Dynamic sources badge */}
        {sourcesUsed.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs"
            style={{ backgroundColor: "#f0fdf4", borderColor: "#86efac" }}>
            <span className="text-lg">⚡</span>
            <div>
              <p className="font-bold text-green-800">Dynamic Mode Active</p>
              <p className="text-green-600">Sources: {sourcesUsed.join(", ") || "CSV fallback"}</p>
            </div>
          </div>
        )}

        {/* ── Loading ─────────────────────────────────────────────────────── */}
        {isLoading && (
          <div
            className="rounded-xl border border-gray-200 bg-white shadow-sm p-10 flex flex-col items-center gap-4"
          >
            <svg className="animate-spin h-8 w-8 text-gray-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <p className="text-sm font-semibold text-gray-700">
              {hasIntelligence ? "Scoring & ranking prospects using your intelligence…" : "Loading leads from database…"}
            </p>
            {hasIntelligence && (
              <div className="flex flex-col items-center gap-1 text-xs text-gray-500">
                <span>① Reading Apollo leads database</span>
                <span>② Matching ICP, keywords &amp; industry signals</span>
                <span>③ Ranking by relevance score</span>
              </div>
            )}
          </div>
        )}

        {/* ── Error ────────────────────────────────────────────────────────── */}
        {!isLoading && step === "error" && (
          <div className="space-y-2">
            <ErrorBox message={error} onDismiss={() => { setError(""); setStep("idle"); }} />
            <div className="flex justify-center">
              <button
                onClick={() => loadLeads(false)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-red-700 border border-red-300 hover:bg-red-100 transition-all"
              >
                ↺ Try again
              </button>
            </div>
          </div>
        )}

        {/* ── Results ──────────────────────────────────────────────────────── */}
        {!isLoading && step === "done" && (
          <>
            {/* Score summary cards (only when intelligence was used) */}
            {hasIntelligence && (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "High Fit",   count: highFitCount,   bg: "#dcfce7", border: "#86efac", text: "#15803d" },
                  { label: "Medium Fit", count: mediumFitCount, bg: "#fef9c3", border: "#fde047", text: "#a16207" },
                  { label: "Low Fit",    count: leads.length - highFitCount - mediumFitCount, bg: "#f3f4f6", border: "#d1d5db", text: "#6b7280" },
                ].map(({ label, count, bg, border, text }) => (
                  <div
                    key={label}
                    className="rounded-xl border px-4 py-3 text-center"
                    style={{ backgroundColor: bg, borderColor: border }}
                  >
                    <p className="text-lg font-bold" style={{ color: text }}>{count.toLocaleString()}</p>
                    <p className="text-xs font-semibold mt-0.5" style={{ color: text }}>{label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Controls row: search + view toggle + industry group toggle + stats */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Search */}
              <div className="flex-1 relative min-w-[200px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Search by name, company, title, industry…"
                  className="w-full pl-8 pr-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
                />
              </div>

              {/* View toggle (only shown when intelligence scoring is active) */}
              {hasIntelligence && (
                <div className="flex rounded-lg border border-gray-200 overflow-hidden shrink-0 bg-white">
                  {[
                    { key: "recommended", label: "Recommended" },
                    { key: "all",         label: "All Leads"   },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => { setViewMode(key); setPage(1); }}
                      className="px-3 py-1.5 text-xs font-semibold transition-all"
                      style={viewMode === key ? { backgroundColor: "#4f46e5", color: "#fff" } : { color: "#6b7280" }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {/* Industry filter dropdown — shown when industry list is available */}
              {industryList.length > 0 && (
                <select
                  value={selectedIndustry}
                  onChange={(e) => { setSelectedIndustry(e.target.value); setPage(1); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 shrink-0"
                  title="Filter by industry"
                >
                  <option value="">{ciData ? "All ICP Segments" : "All Industries"}</option>
                  {industryList.map(ind => (
                    <option key={ind} value={ind}>
                      {ind} {industryGroups[ind] ? `(${industryGroups[ind]})` : ""}
                    </option>
                  ))}
                </select>
              )}

              {/* Sort dropdown */}
              <select
                value={sortBy}
                onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 shrink-0"
                title="Sort leads by"
              >
                <option value="score">Sort: Fit Score</option>
                <option value="final_score">Sort: Location + Keywords</option>
                <option value="name">Sort: Name A–Z</option>
              </select>

              {/* Group by ICP segment toggle — hidden until grouping is stable */}
              {/* TODO: re-enable once ICP grouping crash is resolved */}

              {/* Stats + cache badge */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-semibold text-gray-700">
                  {filtered.length.toLocaleString()} of {leads.length.toLocaleString()} leads
                </span>
                {fromCache && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold text-indigo-700 border border-indigo-300" style={{ backgroundColor: "#ede9fe" }}>
                    ⚡ Cached
                  </span>
                )}
              </div>
            </div>

            {/* ── Bulk email bar ────────────────────────────────────────────── */}
            {selectedLeads.size > 0 && (
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-indigo-300 shadow-sm"
                style={{ backgroundColor: "#ede9fe" }}>
                <span className="text-xs font-bold text-indigo-800">
                  {selectedLeads.size} lead{selectedLeads.size > 1 ? "s" : ""} selected
                </span>
                <button
                  onClick={() => { setBulkPanel(p => !p); setBulkResult(null); setBulkError(""); }}
                  className="px-3 py-1 rounded-lg text-xs font-bold text-white border border-indigo-600 hover:brightness-105 active:scale-95 transition-all"
                  style={{ backgroundColor: "#4f46e5" }}
                >
                  📧 Send Bulk Email
                </button>
                <button
                  onClick={() => setSelectedLeads(new Set())}
                  className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors"
                >
                  Clear selection
                </button>
              </div>
            )}

            {/* ── Bulk email compose panel ──────────────────────────────────── */}
            {bulkPanel && selectedLeads.size > 0 && (
              <div className="rounded-xl border border-indigo-300 shadow-md overflow-hidden" style={{ backgroundColor: "#fafafe" }}>
                <div className="px-5 py-3 border-b border-indigo-200 flex items-center justify-between" style={{ backgroundColor: "#ede9fe" }}>
                  <p className="text-xs font-bold text-indigo-800 uppercase tracking-widest">
                    Bulk Email — {selectedLeads.size} recipient{selectedLeads.size > 1 ? "s" : ""}
                  </p>
                  <button onClick={() => setBulkPanel(false)} className="text-indigo-400 hover:text-indigo-700 text-xs font-bold">✕</button>
                </div>
                <div className="p-5 space-y-3">
                  <div className="flex flex-wrap gap-1.5 pb-2">
                    {[...selectedLeads].map(email => (
                      <span key={email} className="text-[10px] px-2 py-0.5 rounded-full border border-indigo-300 font-mono" style={{ backgroundColor: "#ede9fe", color: "#3730a3" }}>
                        {maskEmail(email)}
                      </span>
                    ))}
                  </div>
                  <input
                    type="email"
                    value={bulkFrom}
                    onChange={e => setBulkFrom(e.target.value)}
                    placeholder="Your email (From)"
                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
                  />
                  <input
                    type="text"
                    value={bulkSubject}
                    onChange={e => setBulkSubject(e.target.value)}
                    placeholder="Email subject"
                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
                  />
                  <textarea
                    value={bulkContent}
                    onChange={e => setBulkContent(e.target.value)}
                    placeholder="Email body content (paste generated content here or write directly)"
                    rows={6}
                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white resize-y"
                  />
                  {bulkError && <ErrorBox message={bulkError} onDismiss={() => setBulkError("")} />}
                  {bulkResult && (
                    <p className="text-xs text-green-700 font-semibold">
                      ✓ Sent to {bulkResult.count} recipient{bulkResult.count > 1 ? "s" : ""} successfully!
                    </p>
                  )}
                  <button
                    onClick={handleSendBulk}
                    disabled={bulkLoading}
                    className="w-full py-2 rounded-lg text-xs font-bold text-white border border-indigo-600 shadow hover:brightness-105 active:scale-95 transition-all disabled:opacity-50"
                    style={{ backgroundColor: "#4f46e5" }}
                  >
                    {bulkLoading ? "Sending…" : `Send to ${selectedLeads.size} Recipient${selectedLeads.size > 1 ? "s" : ""}`}
                  </button>
                </div>
              </div>
            )}

            {/* Section label */}
            {hasIntelligence && (
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest px-2">
                  {viewMode === "recommended" ? "Recommended Leads" : "All Leads"}
                </span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>
            )}

            {/* Lead list */}
            {filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 flex flex-col items-center gap-2 text-center">
                <span className="text-2xl">🔍</span>
                <p className="text-xs text-gray-500">
                  {viewMode === "recommended" && hasIntelligence
                    ? "No high/medium-fit leads found. Switch to 'All Leads' or refine your CI/MI."
                    : "No leads match your search."}
                </p>
                {viewMode === "recommended" && hasIntelligence && (
                  <button onClick={() => setViewMode("all")} className="mt-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-all">
                    Show All Leads
                  </button>
                )}
              </div>
            ) : groupByIndustry && groupedLeads && groupedLeads.length > 0 ? (
              /* ── Industry-grouped view (canonical_industry, ICP-driven) ─── */
              <div className="space-y-4">

                {/* Summary bar */}
                <div
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl border text-xs"
                  style={{ backgroundColor: "#eef2ff", borderColor: "#c7d2fe" }}
                >
                  <span className="text-base">🏭</span>
                  <div>
                    <p className="font-bold text-indigo-800">
                      {groupedLeads.length} {ciData ? "ICP segment" : "sector"}{groupedLeads.length !== 1 ? "s" : ""} found
                      {ciData ? " · ICP-driven segmentation" : " · raw industry grouping"}
                    </p>
                    <p className="text-indigo-500">
                      {filtered.length} leads across {groupedLeads.length} {ciData ? "ICP segments" : "sectors"}
                    </p>
                  </div>
                </div>

                {groupedLeads.map(([industryName, groupLeads], groupIdx) => {
                  const allEmails  = groupLeads.filter(l => l.email).map(l => l.email);
                  const allSelected = allEmails.length > 0 && allEmails.every(e => selectedLeads.has(e));
                  // Cycle through subtle accent colors for each group card
                  const accentColors = [
                    { bg: "#eef2ff", border: "#a5b4fc", hdr: "#e0e7ff", txt: "#3730a3" },
                    { bg: "#fdf4ff", border: "#e879f9", hdr: "#fae8ff", txt: "#7e22ce" },
                    { bg: "#ecfdf5", border: "#6ee7b7", hdr: "#d1fae5", txt: "#065f46" },
                    { bg: "#fff7ed", border: "#fdba74", hdr: "#ffedd5", txt: "#9a3412" },
                    { bg: "#eff6ff", border: "#93c5fd", hdr: "#dbeafe", txt: "#1e40af" },
                    { bg: "#fef9c3", border: "#fde047", hdr: "#fef08a", txt: "#854d0e" },
                  ];
                  const accent = accentColors[groupIdx % accentColors.length];
                  return (
                    <div
                      key={industryName}
                      className="rounded-xl border overflow-hidden shadow-sm"
                      style={{ backgroundColor: accent.bg, borderColor: accent.border }}
                    >
                      {/* Industry group header */}
                      <div
                        className="flex items-center justify-between px-4 py-2.5 border-b"
                        style={{ backgroundColor: accent.hdr, borderColor: accent.border }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-extrabold uppercase tracking-widest" style={{ color: accent.txt }}>
                            🏢 {industryName.toUpperCase()}
                          </span>
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                            style={{ backgroundColor: "#fff", borderColor: accent.border, color: accent.txt }}
                          >
                            {groupLeads.length} lead{groupLeads.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <button
                          onClick={() => handleSelectAll(groupLeads)}
                          className="text-[10px] font-semibold hover:underline transition-colors"
                          style={{ color: accent.txt }}
                        >
                          {allSelected ? "Deselect all" : "Select all"}
                        </button>
                      </div>

                      {/* Leads inside the group */}
                      <div className="p-3 space-y-2">
                        {groupLeads.map((lead, i) => (
                          <LeadCard
                            key={lead.email || `${industryName}-${i}`}
                            lead={lead}
                            index={i}
                            onSelect={handleSelect}
                            showScore={hasIntelligence}
                            isSelected={selectedLeads.has(lead.email)}
                            onToggleSelect={handleToggleSelect}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ── Flat list view ──────────────────────────────────────────── */
              <>
                {paginated.length > 0 && (
                  <div className="flex items-center justify-between mb-1">
                    <button
                      onClick={() => handleSelectAll(paginated)}
                      className="text-[10px] text-indigo-500 hover:text-indigo-700 font-semibold transition-colors"
                    >
                      {paginated.every(l => !l.email || selectedLeads.has(l.email)) ? "Deselect all on page" : "Select all on page"}
                    </button>
                  </div>
                )}
                <div className="space-y-2">
                  {paginated.map((lead, i) => (
                    <LeadCard
                      key={lead.email || i}
                      lead={lead}
                      index={(page - 1) * PAGE_SIZE + i}
                      onSelect={handleSelect}
                      showScore={hasIntelligence}
                      isSelected={selectedLeads.has(lead.email)}
                      onToggleSelect={handleToggleSelect}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Pagination — only in flat list view */}
            {!groupByIndustry && totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 border border-gray-200 bg-white disabled:opacity-40 hover:bg-gray-50 active:scale-95 transition-all"
                >
                  ← Prev
                </button>
                <span className="text-xs text-gray-600 font-semibold">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 border border-gray-200 bg-white disabled:opacity-40 hover:bg-gray-50 active:scale-95 transition-all"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
};

export default LeadDiscoveryPage;
