import { useState, useEffect } from "react";
import SectionCard from "./SectionCard";
import TagList from "./TagList";
import ProgressTracker from "./ProgressTracker";
import logo from "../assets/Logo.png";
import { useAppContext } from "../AppContext";
import { apiPost } from "../api/client";

const ConfidencePill = ({ value }) => {
  const percent = Math.round(value * 100);
  // High ≥80%: teal; Medium ≥60%: amber-gold; Low: red
  const style =
    percent >= 80
      ? { backgroundColor: "#CCF2E8", color: "#0B4F43", border: "1px solid #5DD4B0" }
      : percent >= 60
      ? { backgroundColor: "#FEF3E8", color: "#E8A87C", border: "1px solid #E8A87C" }
      : { backgroundColor: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5" };

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold"
      style={style}
    >
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
  const { ciData, setCiData, ciUrl, setCiUrl, ciSubmitted, setCiSubmitted } = useAppContext();

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
  const [showTracker, setShowTracker] = useState(!!ciData);

  const fetchIntelligence = async (url, forceRefresh = false) => {
    setLoading(true);
    setError("");
    try {
      const result = await apiPost("/api/website-intelligence", { url, force_refresh: forceRefresh });
      setData(result);
      setSubmitted(true);
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

  const inputStyle = {
    backgroundColor: "#FFFFFF",
    border: "1px solid #D4EDE6",
    borderRadius: "8px",
    color: "#1C2C3A",
  };

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
                title="Sign Out"
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold active:scale-95 transition-all"
                style={{ backgroundColor: "#E8F4F9", border: "1px solid #D4EDE6", color: "#2E4057" }}
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
            <h1 className="text-xl font-bold tracking-tight leading-tight" style={{ color: "#0B4F43" }}>
              Company Intelligence
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "#2E4057" }}>
              Enter a company website URL to generate an AI-powered profile.
            </p>
          </div>

          <div className="flex gap-2 w-[480px] shrink-0">
            <input
              type="text"
              value={companyInput}
              onChange={(e) => setCompanyInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="e.g. inubesolutions.com"
              className="flex-1 px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#5DD4B0]"
              style={inputStyle}
              disabled={loading}
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="px-4 py-2 text-sm font-bold text-white shadow-md hover:shadow-lg active:scale-95 transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#1A9E7A", borderRadius: "8px", boxShadow: "0 4px 12px rgba(26,158,122,0.30)" }}
            >
              {loading ? "Analysing…" : "Analyse"}
            </button>
          </div>
        </div>

        {showTracker && <ProgressTracker statuses={trackerStatuses} />}

        {/* Loading state */}
        {loading && (
          <div className="rounded-xl shadow-sm p-10 flex flex-col items-center gap-4" style={{ backgroundColor: "#FFFFFF", border: "1px solid #D4EDE6" }}>
            <svg className="animate-spin h-8 w-8" style={{ color: "#1A9E7A" }} fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <p className="text-sm font-semibold" style={{ color: "#1C2C3A" }}>Analysing website…</p>
            <div className="flex flex-col items-center gap-1 text-xs" style={{ color: "#2E4057" }}>
              <span>① Crawling key pages (homepage, about, services)</span>
              <span>② Extracting intelligence with AI</span>
              <span>③ Evaluating confidence &amp; refining if needed</span>
            </div>
            <p className="text-xs mt-1" style={{ color: "#2E4057" }}>This usually takes 15–30 seconds</p>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="rounded-xl shadow-sm p-6 flex flex-col items-center gap-3" style={{ backgroundColor: "#FEF3E8", border: "1px solid #E8A87C" }}>
            <span className="text-2xl">⚠️</span>
            <p className="text-sm font-semibold" style={{ color: "#1C2C3A" }}>Analysis failed</p>
            <p className="text-xs text-center max-w-md" style={{ color: "#2E4057" }}>{error}</p>
            <button
              onClick={handleSubmit}
              className="mt-1 px-4 py-1.5 text-xs font-semibold transition-all"
              style={{ borderRadius: "8px", color: "#E8A87C", border: "1px solid #E8A87C", backgroundColor: "#FFFFFF" }}
            >
              ↺ Try again
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && !submitted && (
          <div className="rounded-xl p-12 flex flex-col items-center gap-3 text-center" style={{ backgroundColor: "#FFFFFF", border: "1px solid #D4EDE6", boxShadow: "0 4px 16px rgba(0,0,0,0.05)" }}>
            <span className="text-3xl">🔍</span>
            <p className="text-sm font-semibold" style={{ color: "#0B4F43" }}>No results yet</p>
            <p className="text-xs max-w-sm" style={{ color: "#2E4057" }}>
              Enter a company website URL above and click <strong>Analyse</strong> to generate an AI-powered company intelligence profile.
            </p>
          </div>
        )}

        {/* Results */}
        {!loading && submitted && data && (
          <>
            {/* Meta row */}
            <div className="flex items-center justify-between pb-2" style={{ borderBottom: "1px solid #D4EDE6" }}>
              <div className="flex items-center gap-3">
                <p className="text-sm font-bold" style={{ color: "#1C2C3A" }}>{companyInput}</p>
                <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "#2E4057" }}>— AI Profile</span>
                {data.from_cache && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: "#CCF2E8", color: "#0B4F43", borderRadius: "6px" }}>
                    ⚡ Loaded from cache
                  </span>
                )}
              </div>
              <ConfidencePill value={data.confidence_score} />
            </div>

            {/* Two-column grid */}
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#FFFFFF", border: "1px solid #D4EDE6", boxShadow: "0 4px 16px rgba(0,0,0,0.05)" }}>
              <div className="grid grid-cols-2 divide-x" style={{ borderColor: "#D4EDE6" }}>

                <div className="p-4">
                  <SectionCard title="Company Summary">
                    {isEditing ? (
                      <textarea rows={5} value={editForm.company_summary}
                        onChange={e => setEditForm(f => ({ ...f, company_summary: e.target.value }))}
                        className="w-full text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#5DD4B0] resize-none"
                        style={{ backgroundColor: "#E8F4F9", border: "1px solid #D4EDE6", color: "#1C2C3A" }} />
                    ) : (
                      <p className="text-xs leading-5" style={{ color: "#1C2C3A" }}>{data.company_summary}</p>
                    )}
                  </SectionCard>
                </div>
                <div className="p-4">
                  <SectionCard title="Services / Offerings">
                    {isEditing ? (
                      <input type="text" value={editForm.services}
                        onChange={e => setEditForm(f => ({ ...f, services: e.target.value }))}
                        placeholder="Comma-separated values"
                        className="w-full text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#5DD4B0]"
                        style={{ backgroundColor: "#E8F4F9", border: "1px solid #D4EDE6", color: "#1C2C3A" }} />
                    ) : (
                      <TagList tags={data.services} variant="cool" />
                    )}
                  </SectionCard>
                </div>

                <div className="p-4" style={{ borderTop: "1px solid #D4EDE6" }}>
                  <SectionCard title="Industry">
                    {isEditing ? (
                      <input type="text" value={editForm.industry}
                        onChange={e => setEditForm(f => ({ ...f, industry: e.target.value }))}
                        className="w-full text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#5DD4B0]"
                        style={{ backgroundColor: "#E8F4F9", border: "1px solid #D4EDE6", color: "#1C2C3A" }} />
                    ) : (
                      <p className="font-semibold text-sm" style={{ color: "#1C2C3A" }}>{data.industry}</p>
                    )}
                  </SectionCard>
                </div>
                <div className="p-4" style={{ borderTop: "1px solid #D4EDE6" }}>
                  <SectionCard title="Company Location (HQ)">
                    {isEditing ? (
                      <input type="text" value={editForm.company_location}
                        onChange={e => setEditForm(f => ({ ...f, company_location: e.target.value }))}
                        placeholder="e.g. Mumbai, India"
                        className="w-full text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#5DD4B0]"
                        style={{ backgroundColor: "#E8F4F9", border: "1px solid #D4EDE6", color: "#1C2C3A" }} />
                    ) : (
                      <p className="font-semibold text-sm" style={{ color: "#1C2C3A" }}>
                        {data.company_location || <span className="font-normal italic text-xs" style={{ color: "#2E4057" }}>Not extracted — re-run CI or edit manually</span>}
                      </p>
                    )}
                  </SectionCard>
                </div>
                <div className="p-4" style={{ borderTop: "1px solid #D4EDE6" }}>
                  <SectionCard title="Keywords">
                    {isEditing ? (
                      <input type="text" value={editForm.keywords}
                        onChange={e => setEditForm(f => ({ ...f, keywords: e.target.value }))}
                        placeholder="Comma-separated values"
                        className="w-full text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#5DD4B0]"
                        style={{ backgroundColor: "#E8F4F9", border: "1px solid #D4EDE6", color: "#1C2C3A" }} />
                    ) : (
                      <TagList tags={data.keywords} variant="neutral" />
                    )}
                  </SectionCard>
                </div>

                <div className="p-4" style={{ borderTop: "1px solid #D4EDE6" }}>
                  <SectionCard title="ICP / Target Customers">
                    {isEditing ? (
                      <input type="text" value={editForm.icp}
                        onChange={e => setEditForm(f => ({ ...f, icp: e.target.value }))}
                        placeholder="Comma-separated values"
                        className="w-full text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#5DD4B0]"
                        style={{ backgroundColor: "#E8F4F9", border: "1px solid #D4EDE6", color: "#1C2C3A" }} />
                    ) : (
                      <TagList tags={data.icp} variant="warm" />
                    )}
                  </SectionCard>
                </div>
                <div className="p-4" style={{ borderTop: "1px solid #D4EDE6" }} />

              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-1">
              {isEditing ? (
                <>
                  <button
                    onClick={handleSaveEdit}
                    disabled={saving}
                    className="flex-[2] py-2.5 rounded-xl text-sm font-extrabold text-white shadow-lg hover:shadow-xl active:scale-95 transition-all tracking-wide disabled:opacity-50"
                    style={{ backgroundColor: "#1A9E7A", boxShadow: "0 4px 12px rgba(26,158,122,0.30)" }}
                  >
                    {saving ? "Saving…" : "💾 Save"}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    disabled={saving}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium shadow-sm hover:shadow-md active:scale-95 transition-all"
                    style={{ backgroundColor: "#E8F4F9", border: "1px solid #D4EDE6", color: "#2E4057" }}
                  >
                    ✕ Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleApprove}
                    disabled={data?.human_approved_ind === "Y"}
                    className="flex-[2] py-2.5 rounded-xl text-sm font-extrabold text-white shadow-lg hover:shadow-xl active:scale-95 transition-all tracking-wide disabled:opacity-70 disabled:cursor-not-allowed"
                    style={{ backgroundColor: data?.human_approved_ind === "Y" ? "#0B4F43" : "#1A9E7A", boxShadow: "0 4px 12px rgba(26,158,122,0.30)" }}
                  >
                    {data?.human_approved_ind === "Y" ? "✓ Approved" : "✓ Approve"}
                  </button>
                  <button
                    onClick={handleReRun}
                    disabled={loading}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium shadow-sm hover:shadow-md active:scale-95 transition-all disabled:opacity-50"
                    style={{ backgroundColor: "#CCF2E8", border: "1px solid #5DD4B0", color: "#0B4F43" }}
                  >
                    ↺ Re-Run
                  </button>
                  <button
                    onClick={handleEdit}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium shadow-sm hover:shadow-md active:scale-95 transition-all"
                    style={{ backgroundColor: "#FEF3E8", border: "1px solid #E8A87C", color: "#1C2C3A" }}
                  >
                    ✎ Edit
                  </button>
                  <button
                    onClick={handleReset}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium shadow-sm hover:shadow-md active:scale-95 transition-all"
                    style={{ backgroundColor: "#E8F4F9", border: "1px solid #D4EDE6", color: "#2E4057" }}
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
