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

const MarketIntelligencePage = ({ user, onSignOut, onRedirectToCI, onNavigateToContentGeneration }) => {
  // Read CI state from context — pre-fills the URL and drives the progress tracker.
  const { ciData, ciSubmitted, ciUrl, miData, setMiData } = useAppContext();

  // Pre-populate the URL field with the one already analysed in Company Intelligence.
  const [urlInput, setUrlInput]       = useState(ciUrl || "");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [redirectMsg, setRedirectMsg] = useState("");
  // Restore from context so navigating away and back keeps results.
  const [data, setData]               = useState(miData || null);

  // ── Edit mode state ────────────────────────────────────────────────────────
  const [editMode,       setEditMode]       = useState(false);
  const [editClusters,   setEditClusters]   = useState([]);
  const [editSegments,   setEditSegments]   = useState([]);
  const [editCompetitors,setEditCompetitors]= useState([]);
  const [saving,         setSaving]         = useState(false);
  const [saveError,      setSaveError]      = useState("");

  // Progress tracker statuses — driven by context (CI) and local state (MI).
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
      const result = await apiPost("/api/market-intelligence", {
        company_url: normalizeUrl(urlInput),
      });
      setData(result);
      setMiData(result);   // persist to global context
    } catch (err) {
      // ci_not_found / ci_not_approved → show inline redirect prompt
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
      // Detect whether keyword clusters changed (triggers topic refresh)
      const prevClusters = JSON.stringify(data?.keyword_clusters || []);
      const nextClusters = JSON.stringify(editClusters);
      const clustersChanged = prevClusters !== nextClusters;

      // Step 1: save editable fields (clusters, segments, competitors)
      let updated = await apiPost("/api/update-market-intelligence", {
        company_url:       normalizeUrl(urlInput),
        keyword_clusters:  editClusters,
        target_segments:   editSegments,
        top_competitors:   editCompetitors,
      });

      // Step 2: if clusters changed, auto-refresh content topics
      if (clustersChanged) {
        try {
          const refreshed = await apiPost("/api/refresh-content-topics", {
            company_url:      normalizeUrl(urlInput),
            keyword_clusters: editClusters,
          });
          updated = refreshed;   // use updated MI with fresh topics
          // Non-fatal: if refresh fails, we still have the saved clusters
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

  // ── Cluster keyword helpers ────────────────────────────────────────────────
  const updateClusterName = (i, val) =>
    setEditClusters(prev => prev.map((c, idx) => idx === i ? { ...c, cluster_name: val } : c));
  const updateClusterKeywords = (i, val) =>
    setEditClusters(prev => prev.map((c, idx) => idx === i ? { ...c, keywords: val.split(",").map(s => s.trim()).filter(Boolean) } : c));
  const addCluster = () =>
    setEditClusters(prev => [...prev, { cluster_name: "New Cluster", keywords: [] }]);
  const removeCluster = (i) =>
    setEditClusters(prev => prev.filter((_, idx) => idx !== i));

  // ── Segment helpers ────────────────────────────────────────────────────────
  const updateSegment = (i, field, val) =>
    setEditSegments(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));
  const addSegment = () =>
    setEditSegments(prev => [...prev, { segment: "New Segment", pain_point: "", message: "" }]);
  const removeSegment = (i) =>
    setEditSegments(prev => prev.filter((_, idx) => idx !== i));

  // ── Competitor helpers ─────────────────────────────────────────────────────
  const updateCompetitor = (i, field, val) =>
    setEditCompetitors(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: val } : c));
  const addCompetitor = () =>
    setEditCompetitors(prev => [...prev, { name: "", differentiator: "" }]);
  const removeCompetitor = (i) =>
    setEditCompetitors(prev => prev.filter((_, idx) => idx !== i));

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F6E5FF" }}>

      {/* Top bar — identical structure to WebsiteIntelligencePage */}
      <div
        className="border-b border-[#b8a898] px-8 h-14 flex items-center justify-between overflow-visible"
        style={{ backgroundColor: "#F2DFFF" }}
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
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-gray-700 border border-[#b8a898] hover:bg-[#d4c4b4] active:scale-95 transition-all"
                style={{ backgroundColor: "#F2DFFF" }}
              >
                ⎋ Sign Out
              </button>
            </div>
          )}
          <img src={logo} alt="Logo" className="h-32 w-auto object-contain" />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-8 pt-5 pb-6 space-y-3">

        {/* Page header + search bar */}
        <div className="flex items-end justify-between gap-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight leading-tight">
              Market Intelligence
            </h1>
            <p className="text-xs text-gray-600 mt-0.5">
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
              className="flex-1 border border-[#b8a898] rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#b8a898]"
              style={{ backgroundColor: "#F2DFFF" }}
              disabled={loading}
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-sm font-bold text-gray-800 border-2 border-[#7aaa7a] shadow-md hover:shadow-lg hover:brightness-105 active:scale-95 active:shadow-sm transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#BFD8B8" }}
            >
              {loading ? <Spinner label="Analysing…" /> : "Analyse"}
            </button>
          </div>
        </div>

        {/* Progress Tracker — always visible so user can see where they are */}
        <ProgressTracker statuses={trackerStatuses} />

        {/* Redirect banner — shown when CI is missing or not approved */}
        {redirectMsg && (
          <div
            className="rounded-xl border border-amber-300 p-5 flex flex-col items-center gap-3"
            style={{ backgroundColor: "#fffbeb" }}
          >
            <span className="text-2xl">⚠️</span>
            <p className="text-sm font-semibold text-amber-800">Company Intelligence required</p>
            <p className="text-xs text-amber-700 text-center max-w-md">{redirectMsg}</p>
            <button
              onClick={() => onRedirectToCI(normalizeUrl(urlInput))}
              className="mt-1 px-5 py-2 rounded-lg text-xs font-semibold text-white border border-[#4a8a4a] shadow-md hover:shadow-lg hover:brightness-105 active:scale-95 transition-all"
              style={{ backgroundColor: "#5a9e5a" }}
            >
              → Go to Company Intelligence
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div
            className="rounded-xl border border-[#b8a898] shadow-sm p-10 flex flex-col items-center gap-4"
            style={{ backgroundColor: "#F2DFFF" }}
          >
            <Spinner size={32} color="#9b72d0" />
            <p className="text-sm font-semibold text-gray-700">Generating market intelligence…</p>
            <p className="text-xs text-gray-400 mt-1">Using Claude to analyse market positioning</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="space-y-2">
            <ErrorBox message={error} onDismiss={() => setError("")} />
            <div className="flex justify-center">
              <button
                onClick={handleSubmit}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-red-700 border border-red-300 hover:bg-red-100 transition-all"
              >
                ↺ Try again
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && !redirectMsg && !data && (
          <div className="rounded-xl border border-dashed border-[#b8a898] p-12 flex flex-col items-center gap-3 text-center">
            <span className="text-3xl">📊</span>
            <p className="text-sm font-semibold text-gray-600">No results yet</p>
            <p className="text-xs text-gray-400 max-w-sm">
              Enter a company website URL above and click <strong>Analyse</strong> to generate market intelligence.
            </p>
            <p className="text-xs text-amber-600 max-w-sm mt-1">
              Company Intelligence must be completed and approved first.
            </p>
          </div>
        )}

        {/* Results */}
        {!loading && data && (
          <>
            {/* Meta row */}
            <div className="flex items-center justify-between border-b border-[#b8a898] pb-2">
              <div className="flex items-center gap-3">
                <p className="text-sm font-bold text-gray-900">{urlInput}</p>
                <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">— Market Profile</span>
                {data.from_cache && (
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                    style={{ backgroundColor: "#e0f2fe", borderColor: "#7dd3fc", color: "#0369a1" }}
                  >
                    ⚡ Loaded from cache
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleEditOpen}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 border border-[#b8a898] hover:bg-[#e8d8f8] active:scale-95 transition-all"
                  style={{ backgroundColor: "#F2DFFF" }}
                >
                  ✏️ Edit
                </button>
                {onNavigateToContentGeneration && (
                  <button
                    onClick={onNavigateToContentGeneration}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white border border-[#7a5fa0] shadow-md hover:shadow-lg hover:brightness-105 active:scale-95 transition-all"
                    style={{ backgroundColor: "#9b72d0" }}
                  >
                    ✍️ Create Content
                  </button>
                )}
              </div>
            </div>

            {/* ── Edit panel ──────────────────────────────────────────────── */}
            {editMode && (
              <div
                className="rounded-xl border border-[#9b72d0] shadow-md overflow-hidden"
                style={{ backgroundColor: "#faf5ff" }}
              >
                <div className="px-5 py-3 border-b border-[#c9a8e8] flex items-center justify-between"
                  style={{ backgroundColor: "#f3eeff" }}>
                  <p className="text-xs font-bold text-purple-800 uppercase tracking-widest">Edit Market Intelligence</p>
                  <div className="flex items-center gap-2">
                    <button onClick={handleEditCancel}
                      className="px-3 py-1 rounded-lg text-xs font-medium text-gray-600 border border-gray-300 hover:bg-gray-100 transition-all">
                      Cancel
                    </button>
                    <button onClick={handleEditSave} disabled={saving}
                      className="px-4 py-1 rounded-lg text-xs font-bold text-white border border-[#7a5fa0] shadow hover:brightness-105 active:scale-95 transition-all disabled:opacity-50"
                      style={{ backgroundColor: "#9b72d0" }}>
                      {saving ? "Saving…" : "Save Changes"}
                    </button>
                  </div>
                </div>

                {saveError && (
                  <div className="mx-5 mt-3">
                    <ErrorBox message={saveError} onDismiss={() => setSaveError("")} />
                  </div>
                )}

                <div className="p-5 space-y-6">

                  {/* Keyword Clusters */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Keyword Clusters</p>
                      <button onClick={addCluster}
                        className="text-[10px] px-2 py-0.5 rounded border border-[#9b72d0] text-purple-700 hover:bg-purple-50 transition-all">
                        + Add Cluster
                      </button>
                    </div>
                    <div className="space-y-3">
                      {editClusters.map((cluster, i) => (
                        <div key={i} className="rounded-lg border border-[#d8c4f0] p-3 space-y-1.5" style={{ backgroundColor: "#fff" }}>
                          <div className="flex items-center gap-2">
                            <input
                              value={cluster.cluster_name}
                              onChange={e => updateClusterName(i, e.target.value)}
                              className="flex-1 text-xs font-semibold text-gray-800 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-300"
                              placeholder="Cluster name"
                            />
                            <button onClick={() => removeCluster(i)}
                              className="text-red-400 hover:text-red-600 text-xs font-bold px-1">✕</button>
                          </div>
                          <input
                            value={cluster.keywords.join(", ")}
                            onChange={e => updateClusterKeywords(i, e.target.value)}
                            className="w-full text-xs text-gray-600 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-300"
                            placeholder="keyword1, keyword2, keyword3"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Target Segments */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Target Segments</p>
                      <button onClick={addSegment}
                        className="text-[10px] px-2 py-0.5 rounded border border-[#9b72d0] text-purple-700 hover:bg-purple-50 transition-all">
                        + Add Segment
                      </button>
                    </div>
                    <div className="space-y-3">
                      {editSegments.map((seg, i) => (
                        <div key={i} className="rounded-lg border border-[#d8c4f0] p-3 space-y-1.5" style={{ backgroundColor: "#fff" }}>
                          <div className="flex items-center gap-2">
                            <input
                              value={seg.segment}
                              onChange={e => updateSegment(i, "segment", e.target.value)}
                              className="flex-1 text-xs font-semibold text-gray-800 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-300"
                              placeholder="Segment name"
                            />
                            <button onClick={() => removeSegment(i)}
                              className="text-red-400 hover:text-red-600 text-xs font-bold px-1">✕</button>
                          </div>
                          <input
                            value={seg.pain_point}
                            onChange={e => updateSegment(i, "pain_point", e.target.value)}
                            className="w-full text-xs text-gray-600 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-300"
                            placeholder="Pain point"
                          />
                          <input
                            value={seg.message}
                            onChange={e => updateSegment(i, "message", e.target.value)}
                            className="w-full text-xs text-gray-600 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-300"
                            placeholder="Positioning message"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Competitors */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Top Competitors</p>
                      <button onClick={addCompetitor}
                        className="text-[10px] px-2 py-0.5 rounded border border-[#9b72d0] text-purple-700 hover:bg-purple-50 transition-all">
                        + Add Competitor
                      </button>
                    </div>
                    <div className="space-y-2">
                      {editCompetitors.map((comp, i) => (
                        <div key={i} className="flex items-start gap-2 rounded-lg border border-[#d8c4f0] p-2.5" style={{ backgroundColor: "#fff" }}>
                          <div className="flex-1 space-y-1">
                            <input
                              value={comp.name}
                              onChange={e => updateCompetitor(i, "name", e.target.value)}
                              className="w-full text-xs font-semibold text-gray-800 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-300"
                              placeholder="Competitor name"
                            />
                            <input
                              value={comp.differentiator}
                              onChange={e => updateCompetitor(i, "differentiator", e.target.value)}
                              className="w-full text-xs text-gray-600 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-300"
                              placeholder="How you differ"
                            />
                          </div>
                          <button onClick={() => removeCompetitor(i)}
                            className="text-red-400 hover:text-red-600 text-xs font-bold px-1 mt-1">✕</button>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* 2-column results grid — mirrors Company Intelligence layout */}
            <div
              className="rounded-xl border border-[#b8a898] shadow-sm overflow-hidden"
              style={{ backgroundColor: "#ffffff" }}
            >
              <div className="grid grid-cols-2 divide-x divide-[#b8a898]">

                {/* Row 1 left — Keyword Clusters */}
                <div className="p-4">
                  <SectionCard title="Keyword Clusters">
                    <div className="space-y-3">
                      {(data.keyword_clusters || []).map((cluster, i) => (
                        <div key={i}>
                          <p className="text-xs font-semibold text-gray-600 mb-1.5">{cluster.cluster_name}</p>
                          <TagList tags={cluster.keywords} variant="cool" />
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                </div>

                {/* Row 1 right — Content Topics */}
                <div className="p-4">
                  <SectionCard title="Content Topics">
                    <ul className="space-y-3">
                      {(data.content_topics || []).map((topic, i) => (
                        <li key={i} className="border-l-2 border-[#b8a898] pl-3">
                          <p className="text-xs font-semibold text-gray-800">{topic.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{topic.angle}</p>
                        </li>
                      ))}
                    </ul>
                  </SectionCard>
                </div>

                {/* Row 2 left — Target Segments */}
                <div className="p-4 border-t border-[#b8a898]">
                  <SectionCard title="Target Segments">
                    <div className="space-y-2.5">
                      {(data.target_segments || []).map((seg, i) => (
                        <div
                          key={i}
                          className="rounded-lg p-2.5 border border-[#b8a898]"
                          style={{ backgroundColor: "#f5f0eb" }}
                        >
                          <p className="text-xs font-bold text-gray-800">{seg.segment}</p>
                          <p className="text-xs text-gray-600 mt-0.5">
                            <span className="font-semibold">Pain:</span> {seg.pain_point}
                          </p>
                          <p className="text-xs text-gray-600 mt-0.5">
                            <span className="font-semibold">Message:</span> {seg.message}
                          </p>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                </div>

                {/* Row 2 right — Relevant Competitors (scale-filtered & ranked) */}
                <div className="p-4 border-t border-[#b8a898]">
                  <SectionCard title={
                    data.company_scale
                      ? `Relevant Competitors — ${data.company_scale} Scale`
                      : "Top Competitors"
                  }>
                    {/* Company scale badge */}
                    {data.company_scale && (
                      <div className="mb-3 flex items-center gap-2">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Your scale:</span>
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: data.company_scale === "Enterprise" ? "#dbeafe" : data.company_scale === "Mid-size" ? "#fef9c3" : "#dcfce7",
                            color:           data.company_scale === "Enterprise" ? "#1e40af" : data.company_scale === "Mid-size" ? "#854d0e" : "#166534",
                          }}
                        >
                          {data.company_scale}
                          {data.company_scale_confidence === "low" ? " ·?" : ""}
                        </span>
                        <span className="text-[10px] text-gray-400">Showing same/adjacent scale only</span>
                      </div>
                    )}

                    <div className="space-y-2.5">
                      {(data.top_competitors || []).map((comp, i) => {
                        const scaleBg    = comp.scale === "Enterprise" ? "#dbeafe" : comp.scale === "Mid-size" ? "#fef9c3" : comp.scale === "Startup" ? "#dcfce7" : "#f3f4f6";
                        const scaleColor = comp.scale === "Enterprise" ? "#1e40af" : comp.scale === "Mid-size" ? "#854d0e" : comp.scale === "Startup" ? "#166534" : "#6b7280";
                        return (
                          <div key={i} className="flex items-start gap-2">
                            <span className="text-xs font-bold text-gray-400 w-4 shrink-0 mt-0.5">{i + 1}.</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-xs font-bold text-gray-800">{comp.name}</p>
                                {comp.scale && comp.scale !== "Unknown" && (
                                  <span
                                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                    style={{ backgroundColor: scaleBg, color: scaleColor }}
                                    title={comp.scale_reason || comp.scale}
                                  >
                                    {comp.scale}
                                  </span>
                                )}
                                {comp.relevance_score != null && (
                                  <span className="text-[9px] text-gray-400 font-mono">
                                    {comp.relevance_score}% match
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">{comp.differentiator}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </SectionCard>
                </div>

              </div>
            </div>

            {/* Market Expansion Strategy */}
            {data.market_strategy && (() => {
              const ms = data.market_strategy;
              const bestFit = ms.best_fit_scale;

              const scales = [
                {
                  key: "large_scale",
                  emoji: "🌍",
                  label: "Large Scale",
                  sub: "Enterprise / Global Expansion",
                  tag: "Enterprise Ready",
                  tagStyle: { backgroundColor: "#dbeafe", color: "#1d4ed8", border: "1px solid #93c5fd" },
                  cardBg: "#ede8f5",
                  bestBg: "#e0d8f0",
                },
                {
                  key: "mid_scale",
                  emoji: "🌏",
                  label: "Mid Scale",
                  sub: "Regional Growth Markets",
                  tag: "High Growth",
                  tagStyle: { backgroundColor: "#dcfce7", color: "#15803d", border: "1px solid #86efac" },
                  cardBg: "#e8f0e8",
                  bestBg: "#d4ecd4",
                },
                {
                  key: "small_scale",
                  emoji: "🌎",
                  label: "Small Scale",
                  sub: "Niche / Startup Markets",
                  tag: "Emerging Market",
                  tagStyle: { backgroundColor: "#fef3c7", color: "#b45309", border: "1px solid #fcd34d" },
                  cardBg: "#f5ede8",
                  bestBg: "#eeddd4",
                },
              ];

              return (
                <div
                  className="rounded-xl border border-[#b8a898] shadow-sm overflow-hidden"
                  style={{ backgroundColor: "#ffffff" }}
                >
                  {/* Section header */}
                  <div className="px-4 pt-4 pb-2 border-b border-[#b8a898] flex items-center justify-between">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                      Market Expansion Strategy
                    </p>
                    {bestFit && (
                      <p className="text-[10px] text-gray-400">
                        ★ Best fit highlighted
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-3 divide-x divide-[#b8a898]">
                    {scales.map(({ key, emoji, label, sub, tag, tagStyle, cardBg, bestBg }) => {
                      const scaleData = ms[key];
                      const isBest = bestFit === key;
                      return (
                        <div
                          key={key}
                          className="p-4 space-y-3"
                          style={isBest ? { backgroundColor: "#f3eeff", borderTop: "3px solid #9b72d0" } : {}}
                        >
                          {/* Column header */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-base">{emoji}</span>
                              <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">{label}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              {isBest && (
                                <span
                                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                  style={{ backgroundColor: "#9b72d0", color: "#fff" }}
                                >
                                  ★ Best Fit
                                </span>
                              )}
                              <span
                                className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                                style={tagStyle}
                              >
                                {tag}
                              </span>
                            </div>
                          </div>
                          <p className="text-[10px] text-gray-400 -mt-1 leading-snug">{sub}</p>

                          {/* Global regions */}
                          <div>
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                              🌐 Global
                            </p>
                            <div className="space-y-1.5">
                              {(scaleData?.global || []).map((item, i) => (
                                <div
                                  key={i}
                                  className="rounded-lg p-2 border border-[#b8a898]"
                                  style={{ backgroundColor: isBest ? bestBg : cardBg }}
                                >
                                  <p className="text-xs font-bold text-gray-800">{item.region}</p>
                                  <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{item.reason}</p>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* India regions */}
                          <div>
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                              🇮🇳 India
                            </p>
                            <div className="space-y-1.5">
                              {(scaleData?.india || []).map((item, i) => (
                                <div
                                  key={i}
                                  className="rounded-lg p-2 border border-[#b8a898]"
                                  style={{ backgroundColor: isBest ? bestBg : cardBg }}
                                >
                                  <div className="flex flex-wrap gap-1 mb-1">
                                    {(item.sub_regions || []).map((city, j) => (
                                      <span
                                        key={j}
                                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border"
                                        style={{ backgroundColor: "#F2DFFF", borderColor: "#b8a898", color: "#374151" }}
                                      >
                                        {city}
                                      </span>
                                    ))}
                                  </div>
                                  <p className="text-[11px] text-gray-500 leading-snug">{item.reason}</p>
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
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-700 border border-[#b8a898] shadow-sm hover:shadow-md hover:brightness-105 active:scale-95 transition-all"
                style={{ backgroundColor: "#F2DFFF" }}
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
