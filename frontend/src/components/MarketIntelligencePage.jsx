import { useState } from "react";
import SectionCard from "./SectionCard";
import TagList from "./TagList";
import ProgressTracker from "./ProgressTracker";
import logo from "../assets/Logo.png";
import { useAppContext } from "../AppContext";
import { apiPost } from "../api/client";
import ErrorBox from "./ui/ErrorBox";
import Spinner from "./ui/Spinner";

const normalizeUrl = (input) => {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const softCard = {
  borderRadius: "16px",
  boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
  backgroundColor: "#FFFFFF",
  padding: "20px",
};

const MarketIntelligencePage = ({ user, onSignOut, onRedirectToCI, onNavigateToContentGeneration }) => {
  const { ciData, ciSubmitted, ciUrl, miData, setMiData } = useAppContext();

  const [urlInput, setUrlInput]       = useState(ciUrl || "");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [redirectMsg, setRedirectMsg] = useState("");
  const [data, setData]               = useState(miData || null);

  const [editMode,        setEditMode]        = useState(false);
  const [editClusters,    setEditClusters]    = useState([]);
  const [editSegments,    setEditSegments]    = useState([]);
  const [editCompetitors, setEditCompetitors] = useState([]);
  const [saving,          setSaving]          = useState(false);
  const [saveError,       setSaveError]       = useState("");

  const trackerStatuses = {
    ci: ciSubmitted && ciData ? "done" : "locked",
    mi: loading
          ? "in_progress"
          : data
            ? "done"
            : ciSubmitted && ciData
              ? "in_progress"
              : "locked",
    ld: data ? "in_progress" : "locked",
    cg: "locked",
  };

  const handleSubmit = async () => {
    if (!urlInput.trim()) return;
    setLoading(true);
    setError("");
    setRedirectMsg("");
    setData(null);

    try {
      let result = await apiPost("/api/market-intelligence", {
        company_url: normalizeUrl(urlInput),
      });

      const isEmpty =
        result.from_cache &&
        !result.keyword_clusters?.length &&
        !result.content_topics?.length &&
        !result.target_segments?.length &&
        !result.top_competitors?.length;
      if (isEmpty) {
        result = await apiPost("/api/market-intelligence", {
          company_url: normalizeUrl(urlInput),
          force_refresh: true,
        });
      }

      setData(result);
      setMiData(result);
    } catch (err) {
      if (err.code === "ci_not_found" || err.code === "ci_not_approved") {
        setRedirectMsg(err.message);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setData(null);
    setMiData(null);
    setUrlInput("");
    setError("");
    setRedirectMsg("");
    setEditMode(false);
  };

  const handleEditOpen = () => {
    if (!data) return;
    setEditClusters(JSON.parse(JSON.stringify(data.keyword_clusters || [])));
    setEditSegments(JSON.parse(JSON.stringify(data.target_segments  || [])));
    setEditCompetitors(JSON.parse(JSON.stringify(data.top_competitors || [])));
    setSaveError("");
    setEditMode(true);
  };

  const handleEditCancel = () => {
    setEditMode(false);
    setSaveError("");
  };

  const handleEditSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const prevClusters = JSON.stringify(data?.keyword_clusters || []);
      const nextClusters = JSON.stringify(editClusters);
      const clustersChanged = prevClusters !== nextClusters;

      let updated = await apiPost("/api/update-market-intelligence", {
        company_url:      normalizeUrl(urlInput),
        keyword_clusters: editClusters,
        target_segments:  editSegments,
        top_competitors:  editCompetitors,
      });

      if (clustersChanged) {
        try {
          const refreshed = await apiPost("/api/refresh-content-topics", {
            company_url:      normalizeUrl(urlInput),
            keyword_clusters: editClusters,
          });
          updated = refreshed;
        } catch (_) { /* topic refresh is best-effort */ }
      }

      setData(updated);
      setMiData(updated);
      setEditMode(false);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const updateClusterName     = (i, val) => setEditClusters(prev => prev.map((c, idx) => idx === i ? { ...c, cluster_name: val } : c));
  const updateClusterKeywords = (i, val) => setEditClusters(prev => prev.map((c, idx) => idx === i ? { ...c, keywords: val.split(",").map(s => s.trim()).filter(Boolean) } : c));
  const addCluster    = () => setEditClusters(prev => [...prev, { cluster_name: "New Cluster", keywords: [] }]);
  const removeCluster = (i) => setEditClusters(prev => prev.filter((_, idx) => idx !== i));

  const updateSegment = (i, field, val) => setEditSegments(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));
  const addSegment    = () => setEditSegments(prev => [...prev, { segment: "New Segment", pain_point: "", message: "" }]);
  const removeSegment = (i) => setEditSegments(prev => prev.filter((_, idx) => idx !== i));

  const updateCompetitor = (i, field, val) => setEditCompetitors(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: val } : c));
  const addCompetitor    = () => setEditCompetitors(prev => [...prev, { name: "", differentiator: "" }]);
  const removeCompetitor = (i) => setEditCompetitors(prev => prev.filter((_, idx) => idx !== i));

  const editInputStyle = { borderRadius: "6px", backgroundColor: "#FFFFFF", border: "1px solid #D4EDE6", color: "#1C2C3A" };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#E8F4F9" }}>

      {/* Top bar */}
      <div
        className="px-8 h-14 flex items-center justify-between overflow-visible"
        style={{ backgroundColor: "#FFFFFF", borderBottom: "1px solid #D4EDE6" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-4 rounded-sm" style={{ backgroundColor: "#1A9E7A" }} />
          <span className="text-sm font-bold tracking-tight" style={{ color: "#0B4F43" }}>AI Growth Strategist</span>
        </div>
        <div className="flex items-center gap-4">
          {user && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium" style={{ color: "#2E4057" }}>👤 {user}</span>
              <button
                onClick={onSignOut}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold active:scale-95 transition-all"
                style={{ backgroundColor: "#E8F4F9", borderRadius: "8px", border: "1px solid #D4EDE6", color: "#2E4057" }}
              >
                ⎋ Sign Out
              </button>
            </div>
          )}
          <img src={logo} alt="Logo" className="h-32 w-auto object-contain" />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-8 pt-6 pb-8 space-y-5">

        {/* Page header + search bar */}
        <div className="flex items-end justify-between gap-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-tight" style={{ color: "#0B4F43" }}>
              Market Intelligence
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "#2E4057" }}>
              Enter a company URL to generate keyword clusters, content topics, target segments, and competitors.
            </p>
          </div>

          <div className="flex gap-2 w-[480px] shrink-0">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="e.g. inubesolutions.com"
              className="flex-1 px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#5DD4B0]"
              style={{ backgroundColor: "#FFFFFF", borderRadius: "10px", border: "1px solid #D4EDE6", color: "#1C2C3A" }}
              disabled={loading}
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="px-5 py-2 text-sm font-bold text-white shadow-md hover:shadow-lg active:scale-95 transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#1A9E7A", borderRadius: "10px", boxShadow: "0 4px 12px rgba(26,158,122,0.30)" }}
            >
              {loading ? <Spinner label="Analysing…" /> : "Analyse"}
            </button>
          </div>
        </div>

        <ProgressTracker statuses={trackerStatuses} />

        {/* Redirect banner */}
        {redirectMsg && (
          <div className="p-6 flex flex-col items-center gap-3 text-center" style={{ ...softCard, backgroundColor: "#fffbeb" }}>
            <span className="text-2xl">⚠️</span>
            <p className="text-sm font-semibold" style={{ color: "#1C2C3A" }}>Company Intelligence required</p>
            <p className="text-xs max-w-md" style={{ color: "#2E4057" }}>{redirectMsg}</p>
            <button
              onClick={() => onRedirectToCI(normalizeUrl(urlInput))}
              className="mt-1 px-5 py-2 text-xs font-semibold text-white active:scale-95 transition-all"
              style={{ backgroundColor: "#1A9E7A", borderRadius: "10px", boxShadow: "0 4px 12px rgba(26,158,122,0.30)" }}
            >
              → Go to Company Intelligence
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="p-10 flex flex-col items-center gap-4" style={softCard}>
            <Spinner size={32} color="#1A9E7A" />
            <p className="text-sm font-semibold" style={{ color: "#1C2C3A" }}>Generating market intelligence…</p>
            <p className="text-xs mt-1" style={{ color: "#2E4057" }}>Using Claude to analyse market positioning</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="space-y-2">
            <ErrorBox message={error} onDismiss={() => setError("")} />
            <div className="flex justify-center">
              <button
                onClick={handleSubmit}
                className="px-4 py-1.5 text-xs font-semibold transition-all"
                style={{ borderRadius: "8px", color: "#E8A87C", border: "1px solid #E8A87C", backgroundColor: "#FFFFFF" }}
              >
                ↺ Try again
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && !redirectMsg && !data && (
          <div className="p-12 flex flex-col items-center gap-3 text-center" style={softCard}>
            <span className="text-3xl">📊</span>
            <p className="text-sm font-semibold" style={{ color: "#0B4F43" }}>No results yet</p>
            <p className="text-xs max-w-sm" style={{ color: "#2E4057" }}>
              Enter a company website URL above and click <strong>Analyse</strong> to generate market intelligence.
            </p>
            <p className="text-xs max-w-sm mt-1" style={{ color: "#E8A87C" }}>
              Company Intelligence must be completed and approved first.
            </p>
          </div>
        )}

        {/* Results */}
        {!loading && data && (
          <>
            {/* ── PRIMARY GRADIENT PANEL ── */}
            <div
              style={{
                background: "linear-gradient(135deg, #0B4F43, #1A9E7A)",
                color: "white",
                borderRadius: "16px",
                padding: "24px",
              }}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-base font-bold">{urlInput}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#CCF2E8" }}>Market Intelligence Profile</p>
                  {data.from_cache && (
                    <span
                      className="inline-block mt-2 text-[10px] font-semibold px-2 py-0.5"
                      style={{ backgroundColor: "rgba(255,255,255,0.20)", borderRadius: "999px", color: "#fff" }}
                    >
                      ⚡ Loaded from cache
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleEditOpen}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold active:scale-95 transition-all"
                    style={{ backgroundColor: "rgba(255,255,255,0.15)", borderRadius: "10px", color: "#fff" }}
                  >
                    ✏️ Edit
                  </button>
                  {onNavigateToContentGeneration && (
                    <button
                      onClick={onNavigateToContentGeneration}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold active:scale-95 transition-all"
                      style={{ backgroundColor: "#fff", color: "#0B4F43", borderRadius: "10px", boxShadow: "0 4px 12px rgba(0,0,0,0.12)" }}
                    >
                      ✍️ Create Content
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* ── Edit panel ── */}
            {editMode && (
              <div style={{ ...softCard, borderTop: "3px solid #1A9E7A" }}>
                <div className="flex items-center justify-between mb-5">
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#0B4F43" }}>Edit Market Intelligence</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleEditCancel}
                      className="px-3 py-1.5 text-xs font-medium hover:bg-gray-100 transition-all"
                      style={{ borderRadius: "8px", border: "1px solid #D4EDE6", color: "#2E4057" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleEditSave}
                      disabled={saving}
                      className="px-4 py-1.5 text-xs font-bold text-white active:scale-95 transition-all disabled:opacity-50"
                      style={{ backgroundColor: "#1A9E7A", borderRadius: "10px", boxShadow: "0 4px 12px rgba(26,158,122,0.30)" }}
                    >
                      {saving ? "Saving…" : "Save Changes"}
                    </button>
                  </div>
                </div>

                {saveError && (
                  <div className="mb-4">
                    <ErrorBox message={saveError} onDismiss={() => setSaveError("")} />
                  </div>
                )}

                <div className="space-y-6">
                  {/* Keyword Clusters */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#1C2C3A" }}>Keyword Clusters</p>
                      <button onClick={addCluster} className="text-[10px] px-2 py-0.5 hover:bg-[#CCF2E8] transition-all" style={{ color: "#0B4F43", borderRadius: "6px", border: "1px solid #D4EDE6" }}>
                        + Add Cluster
                      </button>
                    </div>
                    <div className="space-y-3">
                      {editClusters.map((cluster, i) => (
                        <div key={i} className="p-3 space-y-1.5" style={{ borderRadius: "12px", backgroundColor: "#CCF2E8" }}>
                          <div className="flex items-center gap-2">
                            <input value={cluster.cluster_name} onChange={e => updateClusterName(i, e.target.value)}
                              className="flex-1 text-xs font-semibold px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#5DD4B0]" style={editInputStyle} placeholder="Cluster name" />
                            <button onClick={() => removeCluster(i)} className="text-red-400 hover:text-red-600 text-xs font-bold px-1">✕</button>
                          </div>
                          <input value={cluster.keywords.join(", ")} onChange={e => updateClusterKeywords(i, e.target.value)}
                            className="w-full text-xs px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#5DD4B0]" style={editInputStyle} placeholder="keyword1, keyword2, keyword3" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Target Segments */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#1C2C3A" }}>Target Segments</p>
                      <button onClick={addSegment} className="text-[10px] px-2 py-0.5 hover:bg-[#CCF2E8] transition-all" style={{ color: "#0B4F43", borderRadius: "6px", border: "1px solid #D4EDE6" }}>
                        + Add Segment
                      </button>
                    </div>
                    <div className="space-y-3">
                      {editSegments.map((seg, i) => (
                        <div key={i} className="p-3 space-y-1.5" style={{ borderRadius: "12px", backgroundColor: "#CCF2E8" }}>
                          <div className="flex items-center gap-2">
                            <input value={seg.segment} onChange={e => updateSegment(i, "segment", e.target.value)}
                              className="flex-1 text-xs font-semibold px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#5DD4B0]" style={editInputStyle} placeholder="Segment name" />
                            <button onClick={() => removeSegment(i)} className="text-red-400 hover:text-red-600 text-xs font-bold px-1">✕</button>
                          </div>
                          <input value={seg.pain_point} onChange={e => updateSegment(i, "pain_point", e.target.value)}
                            className="w-full text-xs px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#5DD4B0]" style={editInputStyle} placeholder="Pain point" />
                          <input value={seg.message} onChange={e => updateSegment(i, "message", e.target.value)}
                            className="w-full text-xs px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#5DD4B0]" style={editInputStyle} placeholder="Positioning message" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Competitors */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#1C2C3A" }}>Top Competitors</p>
                      <button onClick={addCompetitor} className="text-[10px] px-2 py-0.5 hover:bg-[#CCF2E8] transition-all" style={{ color: "#0B4F43", borderRadius: "6px", border: "1px solid #D4EDE6" }}>
                        + Add Competitor
                      </button>
                    </div>
                    <div className="space-y-2">
                      {editCompetitors.map((comp, i) => (
                        <div key={i} className="flex items-start gap-2 p-2.5" style={{ borderRadius: "12px", backgroundColor: "#CCF2E8" }}>
                          <div className="flex-1 space-y-1">
                            <input value={comp.name} onChange={e => updateCompetitor(i, "name", e.target.value)}
                              className="w-full text-xs font-semibold px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#5DD4B0]" style={editInputStyle} placeholder="Competitor name" />
                            <input value={comp.differentiator} onChange={e => updateCompetitor(i, "differentiator", e.target.value)}
                              className="w-full text-xs px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#5DD4B0]" style={editInputStyle} placeholder="How you differ" />
                          </div>
                          <button onClick={() => removeCompetitor(i)} className="text-red-400 hover:text-red-600 text-xs font-bold px-1 mt-1">✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── 2-column results grid ── */}
            <div className="grid grid-cols-2 gap-5">

              <div style={softCard}>
                <SectionCard title="Keyword Clusters">
                  <div className="space-y-3">
                    {(data.keyword_clusters || []).map((cluster, i) => (
                      <div key={i}>
                        <p className="text-xs font-semibold mb-1.5" style={{ color: "#0B4F43" }}>{cluster.cluster_name}</p>
                        <TagList tags={cluster.keywords} variant="cool" />
                      </div>
                    ))}
                  </div>
                </SectionCard>
              </div>

              <div style={softCard}>
                <SectionCard title="Content Topics">
                  <ul className="space-y-3">
                    {(data.content_topics || []).map((topic, i) => (
                      <li key={i} className="pl-3" style={{ borderLeft: "2px solid #1A9E7A" }}>
                        <p className="text-xs font-semibold" style={{ color: "#1C2C3A" }}>{topic.title}</p>
                        <p className="text-xs mt-0.5" style={{ color: "#2E4057" }}>{topic.angle}</p>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              </div>

              <div style={softCard}>
                <SectionCard title="Target Segments">
                  <div className="space-y-2.5">
                    {(data.target_segments || []).map((seg, i) => (
                      <div key={i} className="p-2.5" style={{ borderRadius: "10px", backgroundColor: "#CCF2E8" }}>
                        <p className="text-xs font-bold" style={{ color: "#0B4F43" }}>{seg.segment}</p>
                        <p className="text-xs mt-0.5" style={{ color: "#1C2C3A" }}>
                          <span className="font-semibold">Pain:</span> {seg.pain_point}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: "#1C2C3A" }}>
                          <span className="font-semibold">Message:</span> {seg.message}
                        </p>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              </div>

              <div style={softCard}>
                <SectionCard title={data.company_scale ? `Relevant Competitors — ${data.company_scale} Scale` : "Top Competitors"}>
                  {data.company_scale && (
                    <div className="mb-3 flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#2E4057" }}>Your scale:</span>
                      <span className="text-[10px] font-bold px-2 py-0.5" style={{
                        borderRadius: "999px",
                        backgroundColor: data.company_scale === "Enterprise" ? "#dbeafe" : data.company_scale === "Mid-size" ? "#fef9c3" : "#CCF2E8",
                        color:           data.company_scale === "Enterprise" ? "#1e40af" : data.company_scale === "Mid-size" ? "#854d0e" : "#0B4F43",
                      }}>
                        {data.company_scale}{data.company_scale_confidence === "low" ? " ·?" : ""}
                      </span>
                      <span className="text-[10px]" style={{ color: "#2E4057" }}>Showing same/adjacent scale only</span>
                    </div>
                  )}
                  <div className="space-y-2.5">
                    {(data.top_competitors || []).map((comp, i) => {
                      const scaleBg    = comp.scale === "Enterprise" ? "#dbeafe" : comp.scale === "Mid-size" ? "#fef9c3" : comp.scale === "Startup" ? "#CCF2E8" : "#f3f4f6";
                      const scaleColor = comp.scale === "Enterprise" ? "#1e40af" : comp.scale === "Mid-size" ? "#854d0e" : comp.scale === "Startup" ? "#0B4F43" : "#6b7280";
                      return (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-xs font-bold w-4 shrink-0 mt-0.5" style={{ color: "#2E4057" }}>{i + 1}.</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-xs font-bold" style={{ color: "#1C2C3A" }}>{comp.name}</p>
                              {comp.scale && comp.scale !== "Unknown" && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5" style={{ borderRadius: "999px", backgroundColor: scaleBg, color: scaleColor }} title={comp.scale_reason || comp.scale}>
                                  {comp.scale}
                                </span>
                              )}
                              {comp.relevance_score != null && (
                                <span className="text-[9px] font-mono" style={{ color: "#2E4057" }}>{comp.relevance_score}% match</span>
                              )}
                            </div>
                            <p className="text-xs mt-0.5" style={{ color: "#2E4057" }}>{comp.differentiator}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>
              </div>
            </div>

            {/* Market Expansion Strategy */}
            {data.market_strategy && (() => {
              const ms = data.market_strategy;
              const bestFit = ms.best_fit_scale;

              const scales = [
                { key: "large_scale", emoji: "🌍", label: "Large Scale",  sub: "Enterprise / Global Expansion",  tag: "Enterprise Ready",  tagStyle: { backgroundColor: "#dbeafe", color: "#1d4ed8" }, cardBg: "#E8F4F9", bestBg: "#CCF2E8" },
                { key: "mid_scale",   emoji: "🌏", label: "Mid Scale",    sub: "Regional Growth Markets",         tag: "High Growth",       tagStyle: { backgroundColor: "#dcfce7", color: "#15803d" }, cardBg: "#E8F4F9", bestBg: "#CCF2E8" },
                { key: "small_scale", emoji: "🌎", label: "Small Scale",  sub: "Niche / Startup Markets",         tag: "Emerging Market",   tagStyle: { backgroundColor: "#fef3c7", color: "#b45309" }, cardBg: "#E8F4F9", bestBg: "#CCF2E8" },
              ];

              return (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#0B4F43" }}>Market Expansion Strategy</p>
                    {bestFit && <p className="text-[10px]" style={{ color: "#2E4057" }}>★ Best fit highlighted</p>}
                  </div>

                  <div className="grid grid-cols-3 gap-5">
                    {scales.map(({ key, emoji, label, sub, tag, tagStyle, cardBg, bestBg }) => {
                      const scaleData = ms[key];
                      const isBest = bestFit === key;
                      return (
                        <div
                          key={key}
                          className="space-y-3"
                          style={{
                            borderRadius: "16px",
                            boxShadow: isBest ? "0 8px 24px rgba(26,158,122,0.16)" : "0 8px 24px rgba(0,0,0,0.06)",
                            backgroundColor: isBest ? "#CCF2E8" : "#FFFFFF",
                            padding: "20px",
                            borderTop: isBest ? "3px solid #1A9E7A" : "none",
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-base">{emoji}</span>
                              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#0B4F43" }}>{label}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              {isBest && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5" style={{ backgroundColor: "#1A9E7A", color: "#fff", borderRadius: "999px" }}>
                                  ★ Best Fit
                                </span>
                              )}
                              <span className="text-[9px] font-semibold px-1.5 py-0.5" style={{ ...tagStyle, borderRadius: "999px" }}>
                                {tag}
                              </span>
                            </div>
                          </div>
                          <p className="text-[10px] -mt-1 leading-snug" style={{ color: "#2E4057" }}>{sub}</p>

                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "#2E4057" }}>🌐 Global</p>
                            <div className="space-y-1.5">
                              {(scaleData?.global || []).map((item, i) => (
                                <div key={i} className="p-2" style={{ borderRadius: "10px", backgroundColor: isBest ? bestBg : cardBg }}>
                                  <p className="text-xs font-bold" style={{ color: "#1C2C3A" }}>{item.region}</p>
                                  <p className="text-[11px] mt-0.5 leading-snug" style={{ color: "#2E4057" }}>{item.reason}</p>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "#2E4057" }}>🇮🇳 India</p>
                            <div className="space-y-1.5">
                              {(scaleData?.india || []).map((item, i) => (
                                <div key={i} className="p-2" style={{ borderRadius: "10px", backgroundColor: isBest ? bestBg : cardBg }}>
                                  <div className="flex flex-wrap gap-1 mb-1">
                                    {(item.sub_regions || []).map((city, j) => (
                                      <span key={j} className="text-[10px] font-semibold px-1.5 py-0.5" style={{ backgroundColor: "#CCF2E8", color: "#0B4F43", borderRadius: "999px" }}>
                                        {city}
                                      </span>
                                    ))}
                                  </div>
                                  <p className="text-[11px] leading-snug" style={{ color: "#2E4057" }}>{item.reason}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Reset */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={handleReset}
                className="flex-1 py-2.5 text-sm font-medium hover:brightness-105 active:scale-95 transition-all"
                style={{ borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.06)", backgroundColor: "#FFFFFF", color: "#2E4057", border: "1px solid #D4EDE6" }}
              >
                ⟳ Reset
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
};

export default MarketIntelligencePage;
