import { useState, useEffect } from "react";
import ProgressTracker from "./ProgressTracker";
import logo from "../assets/Logo.png";
import { useAppContext } from "../AppContext";
import { apiPost, apiGet } from "../api/client";
import ErrorBox from "./ui/ErrorBox";
const PAGE_SIZE = 50;

const FIT = {
  "High Fit":   { bg: "#dcfce7", border: "#86efac", text: "#15803d" },
  "Medium Fit": { bg: "#fef9c3", border: "#fde047", text: "#a16207" },
  "Low Fit":    { bg: "#f3f4f6", border: "#d1d5db", text: "#6b7280" },
};

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

const LeadCard = ({ lead, index, onSelect, showScore, isSelected, onToggleSelect }) => {
  const displayRank = lead.rank ?? (index + 1);
  const hasScore    = lead.final_score !== undefined;
  const locScore    = lead.location_score ?? 0;
  const kwScore     = lead.keyword_score  ?? 0;
  const finalScore  = lead.final_score    ?? 0;

  const scoreColor = finalScore >= 5 ? "#15803d" : finalScore >= 2 ? "#a16207" : "#6b7280";
  const scoreBg    = finalScore >= 5 ? "#dcfce7" : finalScore >= 2 ? "#fef9c3" : "#f3f4f6";
  const scoreBdr   = finalScore >= 5 ? "#86efac" : finalScore >= 2 ? "#fde047" : "#d1d5db";

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-xl shadow-sm transition-shadow hover:shadow-md"
      style={{ border: `1px solid ${isSelected ? "#1A9E7A" : "#D4EDE6"}`, backgroundColor: isSelected ? "#CCF2E8" : "#FFFFFF" }}
    >
      <div className="flex-shrink-0 pt-0.5">
        <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(lead)}
          className="w-4 h-4 rounded cursor-pointer accent-[#1A9E7A]" title="Select for bulk email" />
      </div>

      <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
        style={{
          backgroundColor: displayRank <= 10 ? "#fef9c3" : "#E8F4F9",
          border: `1px solid ${displayRank <= 10 ? "#fde047" : "#D4EDE6"}`,
          color:           displayRank <= 10 ? "#a16207" : "#2E4057",
        }}
        title={`Rank #${displayRank}`}
      >
        {displayRank}
      </div>

      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm font-bold truncate" style={{ color: "#1C2C3A" }}>{lead.name || "—"}</p>
        {lead.title   && <p className="text-xs truncate" style={{ color: "#2E4057" }}>{lead.title}</p>}
        {lead.company && <p className="text-xs font-semibold truncate" style={{ color: "#0B4F43" }}>{lead.company}</p>}

        <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-0.5">
          {(lead.canonical_industry || lead.industry) && (
            <span className="text-[11px] italic" style={{ color: "#2E4057" }}>{lead.canonical_industry || lead.industry}</span>
          )}
          {(lead.city || lead.country) && (
            <span className="text-[11px]" style={{ color: "#2E4057" }}>{[lead.city, lead.country].filter(Boolean).join(", ")}</span>
          )}
          {lead.email && (
            <span className="text-[11px] font-mono" style={{ color: "#2E4057" }} title="Email masked for privacy">{maskEmail(lead.email)}</span>
          )}
        </div>

        {hasScore && (
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
              style={{ backgroundColor: scoreBg, borderColor: scoreBdr, color: scoreColor }}
              title={`Score = Location (${locScore}/2) + Keywords (${kwScore})`}>
              Score: {finalScore}
            </span>
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border"
              style={{ backgroundColor: locScore === 2 ? "#dcfce7" : locScore === 1 ? "#fef9c3" : "#f3f4f6", borderColor: locScore === 2 ? "#86efac" : locScore === 1 ? "#fde047" : "#d1d5db", color: locScore === 2 ? "#15803d" : locScore === 1 ? "#a16207" : "#6b7280" }}
              title={lead.location_reason || "Location score"}>
              📍 {locScore === 2 ? "City match" : locScore === 1 ? "Country match" : "No location match"}
            </span>
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border"
              style={{ backgroundColor: kwScore >= 3 ? "#dcfce7" : kwScore >= 1 ? "#CCF2E8" : "#f3f4f6", borderColor: kwScore >= 3 ? "#86efac" : kwScore >= 1 ? "#5DD4B0" : "#d1d5db", color: kwScore >= 3 ? "#15803d" : kwScore >= 1 ? "#0B4F43" : "#6b7280" }}
              title={`Matching keywords: ${(lead.keyword_matches || []).join(", ") || "none"}`}>
              {kwScore > 0 ? `${kwScore} keyword${kwScore > 1 ? "s" : ""}` : "No keywords"}
            </span>
            {lead.keyword_matches?.slice(0, 4).map((kw, i) => (
              <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#CCF2E8", color: "#0B4F43" }}>{kw}</span>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => onSelect(lead)}
        className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm hover:brightness-105 active:scale-95 transition-all"
        style={{ backgroundColor: "#1A9E7A" }}
        title={`Compose email for ${lead.name}${lead.linkedin ? " · LinkedIn pre-filled" : ""}`}
      >
        Compose →
      </button>
    </div>
  );
};

const IntelBadge = ({ ciData, miData }) => {
  if (!ciData && !miData) return null;
  const parts = [];
  if (ciData) { const kws = (ciData.keywords || []).length; const icps = (ciData.icp || []).length; parts.push(`CI: ${icps} ICP · ${kws} keywords`); }
  if (miData) { const clusters = (miData.keyword_clusters || []).length; const segs = (miData.target_segments || []).length; parts.push(`MI: ${clusters} clusters · ${segs} segments`); }
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs" style={{ backgroundColor: "#CCF2E8", border: "1px solid #5DD4B0" }}>
      <span className="text-lg">🧠</span>
      <div>
        <p className="font-bold" style={{ color: "#0B4F43" }}>Smart Scoring Active</p>
        <p style={{ color: "#1A9E7A" }}>{parts.join("  ·  ")}</p>
      </div>
    </div>
  );
};

const LeadDiscoveryPage = ({ user, onSignOut, onSelectProspect }) => {
  const { ciData, miData, csvLeads, setCsvLeads, setSelectedProspect } = useAppContext();

  const [step,      setStep]      = useState(csvLeads ? "done" : "idle");
  const [leads,     setLeads]     = useState(csvLeads || []);
  const [fromCache, setFromCache] = useState(!!csvLeads);
  const [error,     setError]     = useState("");
  const [dynamicLoading, setDynamicLoading] = useState(false);
  const [sourcesUsed, setSourcesUsed] = useState([]);

  const [industryList,     setIndustryList]     = useState([]);
  const [industryGroups,   setIndustryGroups]   = useState({});
  const [selectedIndustry, setSelectedIndustry] = useState("");
  const [search,    setSearch]    = useState("");
  const [page,      setPage]      = useState(1);
  const [viewMode,  setViewMode]  = useState("recommended");
  const [groupByIndustry, setGroupByIndustry] = useState(false);
  const [sortBy,    setSortBy]    = useState("score");

  const [selectedLeads, setSelectedLeads] = useState(new Set());
  const [bulkPanel,     setBulkPanel]     = useState(false);
  const [bulkFrom,      setBulkFrom]      = useState("");
  const [bulkSubject,   setBulkSubject]   = useState("");
  const [bulkContent,   setBulkContent]   = useState("");
  const [bulkLoading,   setBulkLoading]   = useState(false);
  const [bulkResult,    setBulkResult]    = useState(null);
  const [bulkError,     setBulkError]     = useState("");

  const hasIntelligence = !!(ciData || miData);

  useEffect(() => {
    if (!csvLeads) loadLeads(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadLeads = async (forceRefresh = false) => {
    setStep("loading"); setError(""); setPage(1);
    try {
      let data;
      if (ciData || miData) {
        data = await apiPost("/api/score-leads", { ci_data: ciData || null, mi_data: miData || null, force_refresh: forceRefresh });
      } else {
        data = await apiGet(`/api/csv-leads${forceRefresh ? "?force_refresh=true" : ""}`);
      }
      setLeads(data.leads || []);
      setCsvLeads(data.leads || []);
      setFromCache(data.from_cache === true);
      if (data.industry_list)   setIndustryList(data.industry_list);
      if (data.industry_groups) setIndustryGroups(data.industry_groups);
      setSelectedIndustry("");
      setStep("done");
    } catch (e) { setError(e.message); setStep("error"); }
  };

  const loadDynamicLeads = async () => {
    if (!ciData) { setError("Run Company Intelligence first to define your target ICP."); return; }
    setDynamicLoading(true); setError(""); setPage(1);
    try {
      const data = await apiPost("/api/dynamic-leads", {
        target_customers: ciData.icp || [], buyer_industry: ciData.industry || "",
        offerings: ciData.services || [], source_company_url: ciData.company_url || "", use_csv_fallback: true,
      });
      if (ciData || miData) {
        try {
          const scored = await apiPost("/api/score-leads", { ci_data: ciData || null, mi_data: miData || null, force_refresh: true });
          const scoreMap = Object.fromEntries((scored.leads || []).map(l => [l.email, l]));
          const merged = (data.leads || []).map(l => scoreMap[l.email] ? { ...l, ...scoreMap[l.email] } : l);
          setLeads(merged); setSourcesUsed(data.sources_used || []); setStep("done"); return;
        } catch (_) {}
      }
      setLeads(data.leads || []);
      setSourcesUsed(data.sources_used || []);
      setStep("done");
    } catch (e) { setError(e.message); setStep("error"); }
    finally { setDynamicLoading(false); }
  };

  const handleSelect = (lead) => { setSelectedProspect(lead); onSelectProspect(lead); };
  const handleToggleSelect = (lead) => {
    if (!lead.email) return;
    setSelectedLeads(prev => { const next = new Set(prev); next.has(lead.email) ? next.delete(lead.email) : next.add(lead.email); return next; });
  };
  const handleSelectAll = (visibleLeads) => {
    const emailsWithEmail = visibleLeads.filter(l => l.email).map(l => l.email);
    setSelectedLeads(prev => {
      const allSelected = emailsWithEmail.every(e => prev.has(e));
      const next = new Set(prev);
      if (allSelected) emailsWithEmail.forEach(e => next.delete(e));
      else             emailsWithEmail.forEach(e => next.add(e));
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
      const data = await apiPost("/api/send-email", { from_email: bulkFrom, to_email: toEmails[0], to_emails: toEmails, subject: bulkSubject, content: bulkContent });
      setBulkResult(data);
    } catch (e) { setBulkError(e.message); }
    finally { setBulkLoading(false); }
  };

  const matchesSearch = (lead) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (lead.name || "").toLowerCase().includes(q) || (lead.company || "").toLowerCase().includes(q) ||
      (lead.email || "").toLowerCase().includes(q) || (lead.title || "").toLowerCase().includes(q) ||
      (lead.industry || "").toLowerCase().includes(q) || (lead.city || "").toLowerCase().includes(q);
  };

  const isRecommended = (lead) => !hasIntelligence || lead.fit_tag === "High Fit" || lead.fit_tag === "Medium Fit";

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
    if (sortBy === "final_score") return [...base].sort((a, b) => (b.final_score ?? 0) - (a.final_score ?? 0));
    if (sortBy === "name")        return [...base].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return base;
  })();

  const highFitCount   = leads.filter(l => l.fit_tag === "High Fit").length;
  const mediumFitCount = leads.filter(l => l.fit_tag === "Medium Fit").length;
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const isLoading  = step === "loading";

  const groupedLeads = (() => {
    if (!groupByIndustry) return null;
    const groups = {};
    for (const lead of filtered) {
      const key = (lead.canonical_industry || lead.industry || "Other").trim();
      if (!groups[key]) groups[key] = [];
      groups[key].push(lead);
    }
    const sorted = Object.entries(groups).sort(([nameA, a], [nameB, b]) => {
      if (nameA === "Other") return 1; if (nameB === "Other") return -1;
      const avgA = a.reduce((s, l) => s + (l.score || 0), 0) / (a.length || 1);
      const avgB = b.reduce((s, l) => s + (l.score || 0), 0) / (b.length || 1);
      return avgB - avgA;
    });
    return sorted;
  })();

  const trackerStatuses = {
    ci: ciData ? "done" : "locked",
    mi: miData ? "done" : "locked",
    ld: isLoading ? "in_progress" : step === "done" ? "done" : "locked",
    cg: "locked",
  };

  const inputStyle = { backgroundColor: "#FFFFFF", border: "1px solid #D4EDE6", borderRadius: "8px", color: "#1C2C3A" };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#E8F4F9" }}>

      {/* Top bar */}
      <div className="px-8 h-14 flex items-center justify-between overflow-visible"
        style={{ backgroundColor: "#FFFFFF", borderBottom: "1px solid #D4EDE6" }}>
        <div className="flex items-center gap-3">
          <div className="w-2 h-4 rounded-sm" style={{ backgroundColor: "#1A9E7A" }} />
          <span className="text-sm font-bold tracking-tight" style={{ color: "#0B4F43" }}>AI Growth Strategist</span>
        </div>
        <div className="flex items-center gap-4">
          {user && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium" style={{ color: "#2E4057" }}>👤 {user}</span>
              <button onClick={onSignOut}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold active:scale-95 transition-all"
                style={{ backgroundColor: "#E8F4F9", border: "1px solid #D4EDE6", color: "#2E4057" }}>
                ⎋ Sign Out
              </button>
            </div>
          )}
          <img src={logo} alt="Logo" className="h-32 w-auto object-contain" />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-8 pt-5 pb-6 space-y-4">

        <div className="flex items-end justify-between gap-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-tight" style={{ color: "#0B4F43" }}>Lead Discovery</h1>
            <p className="text-xs mt-0.5" style={{ color: "#2E4057" }}>
              {hasIntelligence ? "Prospects ranked by relevance to your Company & Market Intelligence." : "Browse and select prospects from your Apollo leads database."}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={loadDynamicLeads} disabled={isLoading || dynamicLoading}
              className="px-4 py-2 rounded-lg text-sm font-bold text-white shadow-md hover:shadow-lg active:scale-95 transition-all whitespace-nowrap disabled:opacity-50"
              style={{ backgroundColor: "#1A9E7A", boxShadow: "0 4px 12px rgba(26,158,122,0.30)" }}>
              {dynamicLoading ? "Discovering…" : "⚡ Dynamic"}
            </button>
            <button onClick={() => loadLeads(true)} disabled={isLoading || dynamicLoading}
              className="px-4 py-2 rounded-lg text-sm font-bold text-white shadow-md hover:shadow-lg active:scale-95 transition-all whitespace-nowrap disabled:opacity-50"
              style={{ backgroundColor: "#0B4F43" }}>
              {isLoading ? "Loading…" : "↺ Refresh"}
            </button>
          </div>
        </div>

        <ProgressTracker statuses={trackerStatuses} />
        {hasIntelligence && <IntelBadge ciData={ciData} miData={miData} />}

        {sourcesUsed.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs" style={{ backgroundColor: "#f0fdf4", border: "1px solid #86efac" }}>
            <span className="text-lg">⚡</span>
            <div>
              <p className="font-bold text-green-800">Dynamic Mode Active</p>
              <p className="text-green-600">Sources: {sourcesUsed.join(", ") || "CSV fallback"}</p>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="rounded-xl p-10 flex flex-col items-center gap-4" style={{ backgroundColor: "#FFFFFF", border: "1px solid #D4EDE6" }}>
            <svg className="animate-spin h-8 w-8" style={{ color: "#1A9E7A" }} fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <p className="text-sm font-semibold" style={{ color: "#1C2C3A" }}>
              {hasIntelligence ? "Scoring & ranking prospects using your intelligence…" : "Loading leads from database…"}
            </p>
            {hasIntelligence && (
              <div className="flex flex-col items-center gap-1 text-xs" style={{ color: "#2E4057" }}>
                <span>① Reading Apollo leads database</span>
                <span>② Matching ICP, keywords &amp; industry signals</span>
                <span>③ Ranking by relevance score</span>
              </div>
            )}
          </div>
        )}

        {!isLoading && step === "error" && (
          <div className="space-y-2">
            <ErrorBox message={error} onDismiss={() => { setError(""); setStep("idle"); }} />
            <div className="flex justify-center">
              <button onClick={() => loadLeads(false)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{ color: "#E8A87C", border: "1px solid #E8A87C", backgroundColor: "#FFFFFF" }}>
                ↺ Try again
              </button>
            </div>
          </div>
        )}

        {!isLoading && step === "done" && (
          <>
            {hasIntelligence && (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "High Fit",   count: highFitCount,   bg: "#dcfce7", border: "#86efac", text: "#15803d" },
                  { label: "Medium Fit", count: mediumFitCount, bg: "#fef9c3", border: "#fde047", text: "#a16207" },
                  { label: "Low Fit",    count: leads.length - highFitCount - mediumFitCount, bg: "#f3f4f6", border: "#d1d5db", text: "#6b7280" },
                ].map(({ label, count, bg, border, text }) => (
                  <div key={label} className="rounded-xl px-4 py-3 text-center" style={{ backgroundColor: bg, border: `1px solid ${border}` }}>
                    <p className="text-lg font-bold" style={{ color: text }}>{count.toLocaleString()}</p>
                    <p className="text-xs font-semibold mt-0.5" style={{ color: text }}>{label}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 relative min-w-[200px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "#2E4057" }}>🔍</span>
                <input
                  type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Search by name, company, title, industry…"
                  className="w-full pl-8 pr-4 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#5DD4B0]"
                  style={inputStyle}
                />
              </div>

              {hasIntelligence && (
                <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: "1px solid #D4EDE6" }}>
                  {[{ key: "recommended", label: "Recommended" }, { key: "all", label: "All Leads" }].map(({ key, label }) => (
                    <button key={key} onClick={() => { setViewMode(key); setPage(1); }}
                      className="px-3 py-1.5 text-xs font-semibold transition-all"
                      style={viewMode === key ? { backgroundColor: "#0B4F43", color: "#fff" } : { color: "#2E4057", backgroundColor: "#FFFFFF" }}>
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {industryList.length > 0 && (
                <select value={selectedIndustry} onChange={(e) => { setSelectedIndustry(e.target.value); setPage(1); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#5DD4B0] shrink-0"
                  style={inputStyle}>
                  <option value="">{ciData ? "All ICP Segments" : "All Industries"}</option>
                  {industryList.map(ind => <option key={ind} value={ind}>{ind} {industryGroups[ind] ? `(${industryGroups[ind]})` : ""}</option>)}
                </select>
              )}

              <select value={sortBy} onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#5DD4B0] shrink-0"
                style={inputStyle}>
                <option value="score">Sort: Fit Score</option>
                <option value="final_score">Sort: Location + Keywords</option>
                <option value="name">Sort: Name A–Z</option>
              </select>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-semibold" style={{ color: "#1C2C3A" }}>
                  {filtered.length.toLocaleString()} of {leads.length.toLocaleString()} leads
                </span>
                {fromCache && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: "#CCF2E8", color: "#0B4F43", border: "1px solid #5DD4B0" }}>
                    ⚡ Cached
                  </span>
                )}
              </div>
            </div>

            {selectedLeads.size > 0 && (
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-sm" style={{ backgroundColor: "#CCF2E8", border: "1px solid #5DD4B0" }}>
                <span className="text-xs font-bold" style={{ color: "#0B4F43" }}>
                  {selectedLeads.size} lead{selectedLeads.size > 1 ? "s" : ""} selected
                </span>
                <button onClick={() => { setBulkPanel(p => !p); setBulkResult(null); setBulkError(""); }}
                  className="px-3 py-1 rounded-lg text-xs font-bold text-white active:scale-95 transition-all"
                  style={{ backgroundColor: "#0B4F43" }}>
                  📧 Send Bulk Email
                </button>
                <button onClick={() => setSelectedLeads(new Set())} className="text-xs transition-colors" style={{ color: "#0B4F43" }}>
                  Clear selection
                </button>
              </div>
            )}

            {bulkPanel && selectedLeads.size > 0 && (
              <div className="rounded-xl overflow-hidden shadow-md" style={{ backgroundColor: "#FFFFFF", border: "1px solid #D4EDE6" }}>
                <div className="px-5 py-3 flex items-center justify-between" style={{ backgroundColor: "#CCF2E8", borderBottom: "1px solid #D4EDE6" }}>
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#0B4F43" }}>
                    Bulk Email — {selectedLeads.size} recipient{selectedLeads.size > 1 ? "s" : ""}
                  </p>
                  <button onClick={() => setBulkPanel(false)} className="text-xs font-bold" style={{ color: "#0B4F43" }}>✕</button>
                </div>
                <div className="p-5 space-y-3">
                  <div className="flex flex-wrap gap-1.5 pb-2">
                    {[...selectedLeads].map(email => (
                      <span key={email} className="text-[10px] px-2 py-0.5 rounded-full font-mono" style={{ backgroundColor: "#CCF2E8", color: "#0B4F43", border: "1px solid #5DD4B0" }}>
                        {maskEmail(email)}
                      </span>
                    ))}
                  </div>
                  {[{ ph: "Your email (From)", val: bulkFrom, setter: setBulkFrom, type: "email" },
                    { ph: "Email subject",    val: bulkSubject, setter: setBulkSubject, type: "text" }].map(({ ph, val, setter, type }) => (
                    <input key={ph} type={type} value={val} onChange={e => setter(e.target.value)} placeholder={ph}
                      className="w-full text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#5DD4B0]"
                      style={{ backgroundColor: "#FFFFFF", border: "1px solid #D4EDE6", color: "#1C2C3A" }} />
                  ))}
                  <textarea value={bulkContent} onChange={e => setBulkContent(e.target.value)}
                    placeholder="Email body content" rows={6}
                    className="w-full text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#5DD4B0] resize-y"
                    style={{ backgroundColor: "#FFFFFF", border: "1px solid #D4EDE6", color: "#1C2C3A" }} />
                  {bulkError && <ErrorBox message={bulkError} onDismiss={() => setBulkError("")} />}
                  {bulkResult && (
                    <p className="text-xs font-semibold" style={{ color: "#15803d" }}>
                      ✓ Sent to {bulkResult.count} recipient{bulkResult.count > 1 ? "s" : ""} successfully!
                    </p>
                  )}
                  <button onClick={handleSendBulk} disabled={bulkLoading}
                    className="w-full py-2 rounded-lg text-xs font-bold text-white shadow hover:brightness-105 active:scale-95 transition-all disabled:opacity-50"
                    style={{ backgroundColor: "#1A9E7A" }}>
                    {bulkLoading ? "Sending…" : `Send to ${selectedLeads.size} Recipient${selectedLeads.size > 1 ? "s" : ""}`}
                  </button>
                </div>
              </div>
            )}

            {hasIntelligence && (
              <div className="flex items-center gap-2">
                <div className="h-px flex-1" style={{ backgroundColor: "#D4EDE6" }} />
                <span className="text-xs font-bold uppercase tracking-widest px-2" style={{ color: "#2E4057" }}>
                  {viewMode === "recommended" ? "Recommended Leads" : "All Leads"}
                </span>
                <div className="h-px flex-1" style={{ backgroundColor: "#D4EDE6" }} />
              </div>
            )}

            {filtered.length === 0 ? (
              <div className="rounded-xl p-10 flex flex-col items-center gap-2 text-center" style={{ backgroundColor: "#FFFFFF", border: "1px solid #D4EDE6" }}>
                <span className="text-2xl">🔍</span>
                <p className="text-xs" style={{ color: "#2E4057" }}>
                  {viewMode === "recommended" && hasIntelligence ? "No high/medium-fit leads found. Switch to 'All Leads' or refine your CI/MI." : "No leads match your search."}
                </p>
                {viewMode === "recommended" && hasIntelligence && (
                  <button onClick={() => setViewMode("all")} className="mt-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all"
                    style={{ backgroundColor: "#FFFFFF", border: "1px solid #D4EDE6", color: "#2E4057" }}>
                    Show All Leads
                  </button>
                )}
              </div>
            ) : groupByIndustry && groupedLeads && groupedLeads.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs" style={{ backgroundColor: "#CCF2E8", border: "1px solid #5DD4B0" }}>
                  <span className="text-base">🏭</span>
                  <div>
                    <p className="font-bold" style={{ color: "#0B4F43" }}>
                      {groupedLeads.length} {ciData ? "ICP segment" : "sector"}{groupedLeads.length !== 1 ? "s" : ""} found
                    </p>
                    <p style={{ color: "#1A9E7A" }}>{filtered.length} leads across {groupedLeads.length} {ciData ? "ICP segments" : "sectors"}</p>
                  </div>
                </div>
                {groupedLeads.map(([industryName, groupLeads], groupIdx) => {
                  const allEmails  = groupLeads.filter(l => l.email).map(l => l.email);
                  const allSelected = allEmails.length > 0 && allEmails.every(e => selectedLeads.has(e));
                  const accentColors = [
                    { bg: "#E8F4F9", border: "#5DD4B0", hdr: "#CCF2E8", txt: "#0B4F43" },
                    { bg: "#E8F4F9", border: "#5DD4B0", hdr: "#CCF2E8", txt: "#0B4F43" },
                    { bg: "#f0fdf4", border: "#86efac", hdr: "#dcfce7", txt: "#15803d" },
                    { bg: "#fff7ed", border: "#fdba74", hdr: "#ffedd5", txt: "#9a3412" },
                    { bg: "#eff6ff", border: "#93c5fd", hdr: "#dbeafe", txt: "#1e40af" },
                    { bg: "#fef9c3", border: "#fde047", hdr: "#fef08a", txt: "#854d0e" },
                  ];
                  const accent = accentColors[groupIdx % accentColors.length];
                  return (
                    <div key={industryName} className="rounded-xl overflow-hidden shadow-sm" style={{ backgroundColor: accent.bg, border: `1px solid ${accent.border}` }}>
                      <div className="flex items-center justify-between px-4 py-2.5" style={{ backgroundColor: accent.hdr, borderBottom: `1px solid ${accent.border}` }}>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-extrabold uppercase tracking-widest" style={{ color: accent.txt }}>🏢 {industryName.toUpperCase()}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#fff", border: `1px solid ${accent.border}`, color: accent.txt }}>
                            {groupLeads.length} lead{groupLeads.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <button onClick={() => handleSelectAll(groupLeads)} className="text-[10px] font-semibold hover:underline" style={{ color: accent.txt }}>
                          {allSelected ? "Deselect all" : "Select all"}
                        </button>
                      </div>
                      <div className="p-3 space-y-2">
                        {groupLeads.map((lead, i) => (
                          <LeadCard key={lead.email || `${industryName}-${i}`} lead={lead} index={i} onSelect={handleSelect} showScore={hasIntelligence} isSelected={selectedLeads.has(lead.email)} onToggleSelect={handleToggleSelect} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <>
                {paginated.length > 0 && (
                  <div className="flex items-center justify-between mb-1">
                    <button onClick={() => handleSelectAll(paginated)} className="text-[10px] font-semibold transition-colors" style={{ color: "#1A9E7A" }}>
                      {paginated.every(l => !l.email || selectedLeads.has(l.email)) ? "Deselect all on page" : "Select all on page"}
                    </button>
                  </div>
                )}
                <div className="space-y-2">
                  {paginated.map((lead, i) => (
                    <LeadCard key={lead.email || i} lead={lead} index={(page - 1) * PAGE_SIZE + i} onSelect={handleSelect} showScore={hasIntelligence} isSelected={selectedLeads.has(lead.email)} onToggleSelect={handleToggleSelect} />
                  ))}
                </div>
              </>
            )}

            {!groupByIndustry && totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40 active:scale-95 transition-all"
                  style={{ backgroundColor: "#FFFFFF", border: "1px solid #D4EDE6", color: "#2E4057" }}>
                  ← Prev
                </button>
                <span className="text-xs font-semibold" style={{ color: "#2E4057" }}>Page {page} of {totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40 active:scale-95 transition-all"
                  style={{ backgroundColor: "#FFFFFF", border: "1px solid #D4EDE6", color: "#2E4057" }}>
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
