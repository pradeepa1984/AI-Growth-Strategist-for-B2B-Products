import { useState, useEffect } from "react";
import SectionCard from "./SectionCard";
import TagList from "./TagList";
import ProgressTracker from "./ProgressTracker";
import logo from "../assets/Logo.png";
import { useAppContext } from "../AppContext";
import { apiPost } from "../api/client";

const ConfidencePill = ({ value }) => {
  const percent = Math.round(value * 100);
  const color =
    percent >= 80
      ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
      : percent >= 60
      ? "bg-amber-100 text-amber-800 border border-amber-300"
      : "bg-red-100 text-red-700 border border-red-300";

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold ${color}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {percent}% Confidence
    </span>
  );
};

const normalizeUrl = (input) => {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const WebsiteIntelligencePage = ({ user, onSignOut, initialUrl = "" }) => {
  // Pull shared state from context so data survives navigation away and back.
  const { ciData, setCiData, ciUrl, setCiUrl, ciSubmitted, setCiSubmitted } = useAppContext();

  // Seed local state from context (restores data when user navigates back).
  // initialUrl takes priority when a redirect arrives from Market Intelligence.
  const [companyInput, setCompanyInput] = useState(initialUrl || ciUrl);

  useEffect(() => {
    if (initialUrl) setCompanyInput(initialUrl);
  }, [initialUrl]);
  const [submitted, setSubmitted]     = useState(ciSubmitted);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [data, setData]               = useState(ciData);
  const [isEditing, setIsEditing]     = useState(false);
  const [editForm, setEditForm]       = useState({});
  const [saving, setSaving]           = useState(false);
  // Show tracker immediately if we already have data (restored from context).
  const [showTracker, setShowTracker] = useState(!!ciData);

  const fetchIntelligence = async (url, forceRefresh = false) => {
    setLoading(true);
    setError("");
    try {
      const result = await apiPost("/api/website-intelligence", { url, force_refresh: forceRefresh });
      setData(result);
      setSubmitted(true);
      // Persist to context so Market Intelligence (and navigation back) can use it.
      setCiData(result);
      setCiUrl(url);
      setCiSubmitted(true);
    } catch (e) {
      setError(e.message);
      setData(null);
      setSubmitted(false);
      setCiData(null);
      setCiSubmitted(false);
    } finally {
      setLoading(false);
    }
  };

  const trackerStatuses = {
    ci: loading ? "in_progress" : submitted && data ? "done" : "locked",
    mi: submitted && data && !loading ? "in_progress" : "locked",
    ld: "locked",
    cg: "locked",
  };

  const handleSubmit = () => {
    if (!companyInput.trim()) return;
    setShowTracker(true);
    fetchIntelligence(normalizeUrl(companyInput));
  };

  const handleReRun = async () => {
    if (!companyInput.trim()) return;
    const url = normalizeUrl(companyInput);
    try {
      const { exists } = await apiPost("/api/check-record", { url });
      if (!exists) {
        setError("No existing analysis found for this URL. Please run Analyse first.");
        return;
      }
      fetchIntelligence(url, true);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleReset = () => {
    setCompanyInput("");
    setSubmitted(false);
    setData(null);
    setError("");
    setShowTracker(false);
    // Also clear global context so Market Intelligence knows CI was reset.
    setCiData(null);
    setCiUrl("");
    setCiSubmitted(false);
  };

  const handleEdit = () => {
    setEditForm({
      company_summary:  data.company_summary  || "",
      industry:         data.industry         || "",
      company_location: data.company_location || "",
      icp:              (data.icp      || []).join(", "),
      services:         (data.services || []).join(", "),
      keywords:         (data.keywords || []).join(", "),
    });
    setIsEditing(true);
  };

  const handleCancelEdit = () => setIsEditing(false);

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const payload = {
        company_url:      data.company_url,
        analysed_at:      data.analysed_at,
        company_summary:  editForm.company_summary,
        industry:         editForm.industry,
        company_location: editForm.company_location,
        icp:      editForm.icp.split(",").map(s => s.trim()).filter(Boolean),
        services: editForm.services.split(",").map(s => s.trim()).filter(Boolean),
        keywords: editForm.keywords.split(",").map(s => s.trim()).filter(Boolean),
      };
      await apiPost("/api/update-intelligence", payload);
      setData(prev => ({ ...prev, ...payload }));
      setCiData(prev => ({ ...prev, ...payload }));
      setIsEditing(false);
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!data?.company_url || !data?.analysed_at) return;
    try {
      await apiPost("/api/approve", { company_url: data.company_url, analysed_at: data.analysed_at });
      setData((prev) => ({ ...prev, human_approved_ind: "Y" }));
      setCiData((prev) => ({ ...prev, human_approved_ind: "Y" }));
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F6E5FF" }}>

      {/* Top bar */}
      <div className="border-b border-[#b8a898] px-8 h-14 flex items-center justify-between overflow-visible" style={{ backgroundColor: "#F2DFFF" }}>
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
                title="Sign Out"
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

        {/* Page Header + Search inline */}
        <div className="flex items-end justify-between gap-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight leading-tight">
              Company Intelligence
            </h1>
            <p className="text-xs text-gray-600 mt-0.5">
              Enter a company website URL to generate an AI-powered profile.
            </p>
          </div>

          {/* Search Bar */}
          <div className="flex gap-2 w-[480px] shrink-0">
            <input
              type="text"
              value={companyInput}
              onChange={(e) => setCompanyInput(e.target.value)}
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
              {loading ? "Analysing…" : "Analyse"}
            </button>
          </div>
        </div>

        {/* Progress Tracker */}
        {showTracker && <ProgressTracker statuses={trackerStatuses} />}

        {/* Loading state */}
        {loading && (
          <div className="rounded-xl border border-[#b8a898] shadow-sm p-10 flex flex-col items-center gap-4" style={{ backgroundColor: "#F2DFFF" }}>
            <svg className="animate-spin h-8 w-8 text-gray-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <p className="text-sm font-semibold text-gray-700">Analysing website…</p>
            <div className="flex flex-col items-center gap-1 text-xs text-gray-500">
              <span>① Crawling key pages (homepage, about, services)</span>
              <span>② Extracting intelligence with AI</span>
              <span>③ Evaluating confidence &amp; refining if needed</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">This usually takes 15–30 seconds</p>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="rounded-xl border border-red-300 shadow-sm p-6 flex flex-col items-center gap-3" style={{ backgroundColor: "#fff5f5" }}>
            <span className="text-2xl">⚠️</span>
            <p className="text-sm font-semibold text-red-700">Analysis failed</p>
            <p className="text-xs text-red-600 text-center max-w-md">{error}</p>
            <button
              onClick={handleSubmit}
              className="mt-1 px-4 py-1.5 rounded-lg text-xs font-semibold text-red-700 border border-red-300 hover:bg-red-100 transition-all"
            >
              ↺ Try again
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && !submitted && (
          <div className="rounded-xl border border-dashed border-[#b8a898] p-12 flex flex-col items-center gap-3 text-center">
            <span className="text-3xl">🔍</span>
            <p className="text-sm font-semibold text-gray-600">No results yet</p>
            <p className="text-xs text-gray-400 max-w-sm">
              Enter a company website URL above and click <strong>Analyse</strong> to generate an AI-powered company intelligence profile.
            </p>
          </div>
        )}

        {/* Results */}
        {!loading && submitted && data && (
          <>
            {/* Meta row */}
            <div className="flex items-center justify-between border-b border-[#b8a898] pb-2">
              <div className="flex items-center gap-3">
                <p className="text-sm font-bold text-gray-900">{companyInput}</p>
                <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">— AI Profile</span>
                {data.from_cache && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200">
                    ⚡ Loaded from cache
                  </span>
                )}
              </div>
              <ConfidencePill value={data.confidence_score} />
            </div>

            {/* Two-column grid — sections paired in rows so hr lines align */}
            <div className="rounded-xl border border-[#b8a898] shadow-sm overflow-hidden" style={{ backgroundColor: "#ffffff" }}>
              <div className="grid grid-cols-2 divide-x divide-[#b8a898]">

                {/* Row 1 */}
                <div className="p-4">
                  <SectionCard title="Company Summary">
                    {isEditing ? (
                      <textarea rows={5} value={editForm.company_summary}
                        onChange={e => setEditForm(f => ({ ...f, company_summary: e.target.value }))}
                        className="w-full text-xs text-gray-800 rounded-lg px-3 py-2 border border-[#b8a898] focus:outline-none focus:ring-2 focus:ring-[#b8a898] resize-none"
                        style={{ backgroundColor: "#f5f0eb" }} />
                    ) : (
                      <p className="text-gray-800 text-xs leading-5">{data.company_summary}</p>
                    )}
                  </SectionCard>
                </div>
                <div className="p-4">
                  <SectionCard title="Services / Offerings">
                    {isEditing ? (
                      <input type="text" value={editForm.services}
                        onChange={e => setEditForm(f => ({ ...f, services: e.target.value }))}
                        placeholder="Comma-separated values"
                        className="w-full text-xs text-gray-800 rounded-lg px-3 py-2 border border-[#b8a898] focus:outline-none focus:ring-2 focus:ring-[#b8a898]"
                        style={{ backgroundColor: "#f5f0eb" }} />
                    ) : (
                      <TagList tags={data.services} variant="cool" />
                    )}
                  </SectionCard>
                </div>

                {/* Row 2 */}
                <div className="p-4 border-t border-[#b8a898]">
                  <SectionCard title="Industry">
                    {isEditing ? (
                      <input type="text" value={editForm.industry}
                        onChange={e => setEditForm(f => ({ ...f, industry: e.target.value }))}
                        className="w-full text-sm text-gray-800 rounded-lg px-3 py-2 border border-[#b8a898] focus:outline-none focus:ring-2 focus:ring-[#b8a898]"
                        style={{ backgroundColor: "#f5f0eb" }} />
                    ) : (
                      <p className="text-gray-900 font-semibold text-sm">{data.industry}</p>
                    )}
                  </SectionCard>
                </div>
                <div className="p-4 border-t border-[#b8a898]">
                  <SectionCard title="Company Location (HQ)">
                    {isEditing ? (
                      <input type="text" value={editForm.company_location}
                        onChange={e => setEditForm(f => ({ ...f, company_location: e.target.value }))}
                        placeholder="e.g. Mumbai, India"
                        className="w-full text-sm text-gray-800 rounded-lg px-3 py-2 border border-[#b8a898] focus:outline-none focus:ring-2 focus:ring-[#b8a898]"
                        style={{ backgroundColor: "#f5f0eb" }} />
                    ) : (
                      <p className="text-gray-900 font-semibold text-sm">
                        {data.company_location || <span className="text-gray-400 font-normal italic text-xs">Not extracted — re-run CI or edit manually</span>}
                      </p>
                    )}
                  </SectionCard>
                </div>
                <div className="p-4 border-t border-[#b8a898]">
                  <SectionCard title="Keywords">
                    {isEditing ? (
                      <input type="text" value={editForm.keywords}
                        onChange={e => setEditForm(f => ({ ...f, keywords: e.target.value }))}
                        placeholder="Comma-separated values"
                        className="w-full text-xs text-gray-800 rounded-lg px-3 py-2 border border-[#b8a898] focus:outline-none focus:ring-2 focus:ring-[#b8a898]"
                        style={{ backgroundColor: "#f5f0eb" }} />
                    ) : (
                      <TagList tags={data.keywords} variant="neutral" />
                    )}
                  </SectionCard>
                </div>

                {/* Row 3 */}
                <div className="p-4 border-t border-[#b8a898]">
                  <SectionCard title="ICP / Target Customers">
                    {isEditing ? (
                      <input type="text" value={editForm.icp}
                        onChange={e => setEditForm(f => ({ ...f, icp: e.target.value }))}
                        placeholder="Comma-separated values"
                        className="w-full text-xs text-gray-800 rounded-lg px-3 py-2 border border-[#b8a898] focus:outline-none focus:ring-2 focus:ring-[#b8a898]"
                        style={{ backgroundColor: "#f5f0eb" }} />
                    ) : (
                      <TagList tags={data.icp} variant="warm" />
                    )}
                  </SectionCard>
                </div>
                <div className="p-4 border-t border-[#b8a898]" />

              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-1">
              {isEditing ? (
                <>
                  <button
                    onClick={handleSaveEdit}
                    disabled={saving}
                    className="flex-[2] py-2.5 rounded-xl text-sm font-extrabold text-white border-2 border-[#4a8a4a] shadow-lg hover:shadow-xl hover:brightness-105 active:scale-95 transition-all tracking-wide disabled:opacity-50"
                    style={{ backgroundColor: "#5a9e5a" }}
                  >
                    {saving ? "Saving…" : "💾 Save"}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    disabled={saving}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-700 border border-[#b8a898] shadow-sm hover:shadow-md hover:brightness-105 active:scale-95 transition-all"
                    style={{ backgroundColor: "#F2DFFF" }}
                  >
                    ✕ Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleApprove}
                    disabled={data?.human_approved_ind === "Y"}
                    className="flex-[2] py-2.5 rounded-xl text-sm font-extrabold text-white border-2 border-[#4a8a4a] shadow-lg hover:shadow-xl hover:brightness-105 active:scale-95 active:shadow-sm transition-all tracking-wide disabled:opacity-70 disabled:cursor-not-allowed"
                    style={{ backgroundColor: data?.human_approved_ind === "Y" ? "#3a7a3a" : "#5a9e5a" }}
                  >
                    {data?.human_approved_ind === "Y" ? "✓ Approved" : "✓ Approve"}
                  </button>
                  <button
                    onClick={handleReRun}
                    disabled={loading}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-700 border border-[#8898c8] shadow-sm hover:shadow-md hover:brightness-105 active:scale-95 transition-all disabled:opacity-50"
                    style={{ backgroundColor: "#C8D4F0" }}
                  >
                    ↺ Re-Run
                  </button>
                  <button
                    onClick={handleEdit}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-700 border border-[#c8a070] shadow-sm hover:shadow-md hover:brightness-105 active:scale-95 transition-all"
                    style={{ backgroundColor: "#F0DCC8" }}
                  >
                    ✎ Edit
                  </button>
                  <button
                    onClick={handleReset}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-700 border border-[#b8a898] shadow-sm hover:shadow-md hover:brightness-105 active:scale-95 transition-all"
                    style={{ backgroundColor: "#F2DFFF" }}
                  >
                    ⟳ Reset
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default WebsiteIntelligencePage;
