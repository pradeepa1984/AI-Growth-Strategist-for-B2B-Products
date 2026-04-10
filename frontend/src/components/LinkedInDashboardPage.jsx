import { useState, useEffect, useCallback } from "react";
import { useAppContext } from "../AppContext";
import { apiPost, apiGet } from "../api/client";
import logo from "../assets/Logo.png";
import { logout } from "../auth/cognito";

// Compose icon (envelope)
const ComposeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
  </svg>
);

// ── Constants ──────────────────────────────────────────────────────────────────
const PAGE_SIZE = 50;

const TABS = [
  { id: "apollo", label: "Apollo Leads",      count_key: "apollo", desc: "2,789 insurance & financial sector contacts" },
  { id: "ks",     label: "Linkedin Connections",    count_key: "ks",     desc: "399 LinkedIn connections" },
];

// ── Keyword match badge ────────────────────────────────────────────────────────
const MatchBadge = ({ value }) => {
  const styles = {
    YES: { bg: "#dcfce7", border: "#86efac", text: "#15803d", label: "YES" },
    NO:  { bg: "#f3f4f6", border: "#d1d5db", text: "#6b7280", label: "NO"  },
    "N/A": { bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8", label: "N/A" },
  };
  const s = styles[value] || styles["N/A"];
  return (
    <span
      className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border"
      style={{ backgroundColor: s.bg, color: s.text, borderColor: s.border }}
    >
      {s.label}
    </span>
  );
};

// ── Industry pill ──────────────────────────────────────────────────────────────
const IndustryPill = ({ value }) => {
  if (!value) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-purple-50 border border-purple-200 text-purple-700 font-medium max-w-[160px] truncate" title={value}>
      {value}
    </span>
  );
};

// ── Lead row ──────────────────────────────────────────────────────────────────
const LeadRow = ({ lead, index, globalIndex, onClick, isSelected, onCompose }) => (
  <tr
    onClick={() => onClick(lead)}
    className="border-b border-gray-100 cursor-pointer transition-colors"
    style={{ backgroundColor: isSelected ? "#faf5ff" : "transparent" }}
    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = "#f9f5ff"; }}
    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = "transparent"; }}
  >
    <td className="px-4 py-3 text-xs text-gray-400 w-10">{globalIndex}</td>
    <td className="px-4 py-3">
      <p className="text-sm font-semibold text-gray-900 leading-tight">{lead.name || "—"}</p>
      {lead.title && <p className="text-xs text-gray-500 truncate max-w-[200px]" title={lead.title}>{lead.title}</p>}
    </td>
    <td className="px-4 py-3 text-xs text-indigo-700 font-medium">{lead.company || "—"}</td>
    <td className="px-4 py-3"><IndustryPill value={lead.industry} /></td>
    <td className="px-4 py-3 text-xs text-gray-500">{lead.location || lead.country || "—"}</td>
    <td className="px-4 py-3"><MatchBadge value={lead.keyword_match} /></td>
    <td className="px-4 py-3">
      {lead.linkedin_url ? (
        <a
          href={lead.linkedin_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline"
        >
          View
        </a>
      ) : <span className="text-gray-300 text-xs">—</span>}
    </td>
    <td className="px-4 py-3">
      <button
        onClick={e => { e.stopPropagation(); onCompose(lead); }}
        title="Compose email in Content Generation"
        className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-600 hover:text-purple-800 hover:underline"
      >
        <ComposeIcon /> Compose
      </button>
    </td>
  </tr>
);

// ── Detail panel ──────────────────────────────────────────────────────────────
const DetailPanel = ({ lead, keywords, onClose, onCompose }) => {
  if (!lead) return null;

  const Field = ({ label, value }) => {
    if (!value) return null;
    return (
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
        <p className="text-xs text-gray-800 leading-relaxed break-words">{value}</p>
      </div>
    );
  };

  const matchedKws = keywords.filter(kw => {
    const text = [lead.title, lead.company, lead.industry, lead.about, lead.departments].join(" ").toLowerCase();
    return kw && text.includes(kw.toLowerCase());
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div
        className="h-full w-full max-w-md bg-white shadow-2xl border-l border-gray-200 overflow-y-auto flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3" style={{ backgroundColor: "#F6E5FF" }}>
          <div className="min-w-0">
            <p className="text-base font-bold text-gray-900 leading-tight">{lead.name || "—"}</p>
            {lead.title   && <p className="text-xs text-gray-600 mt-0.5 leading-tight">{lead.title}</p>}
            {lead.company && <p className="text-xs font-semibold text-indigo-700 mt-0.5">{lead.company}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none flex-shrink-0 mt-0.5">×</button>
        </div>

        <div className="flex-1 px-5 py-4 space-y-4">
          {/* Keyword match explanation */}
          <div className="p-3 rounded-lg border space-y-2" style={{ backgroundColor: lead.keyword_match === "YES" ? "#f0fdf4" : "#f9fafb", borderColor: lead.keyword_match === "YES" ? "#86efac" : "#e5e7eb" }}>
            <div className="flex items-center gap-2">
              <MatchBadge value={lead.keyword_match} />
              <p className="text-xs font-semibold text-gray-700">
                {lead.keyword_match === "YES" ? "CI keyword match found" : lead.keyword_match === "N/A" ? "No CI keywords — run Company Intelligence first" : "No CI keyword match"}
              </p>
            </div>
            {lead.keyword_match === "YES" && matchedKws.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {matchedKws.slice(0, 6).map((kw, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 border border-green-200 rounded font-medium">{kw}</span>
                ))}
              </div>
            )}
            {lead.keyword_match === "NO" && keywords.length > 0 && (
              <p className="text-[10px] text-gray-500">
                None of the {keywords.length} CI keywords appear in this lead's profile text.
              </p>
            )}
          </div>

          {/* Apollo CSV Keywords */}
          {lead.source === "apollo" && lead.csv_keywords?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">
                Apollo CSV Keywords <span className="font-normal normal-case text-gray-300">({lead.csv_keywords.length} total)</span>
              </p>
              <div className="flex flex-wrap gap-1">
                {lead.csv_keywords.map((kw, i) => {
                  const isMatched = keywords.some(ck => ck && kw && (ck.toLowerCase().includes(kw.toLowerCase()) || kw.toLowerCase().includes(ck.toLowerCase())));
                  return (
                    <span
                      key={i}
                      className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                        isMatched
                          ? "bg-green-100 text-green-700 border-green-300"
                          : "bg-gray-100 text-gray-500 border-gray-200"
                      }`}
                      title={isMatched ? "Matched a CI keyword" : "No CI keyword match"}
                    >
                      {kw}
                    </span>
                  );
                })}
              </div>
              {keywords.length > 0 && (
                <p className="text-[10px] text-gray-400 mt-1.5">
                  Green = matches a CI keyword · Gray = no match
                </p>
              )}
            </div>
          )}

          {lead.source === "apollo" && (!lead.csv_keywords || lead.csv_keywords.length === 0) && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Apollo CSV Keywords</p>
              <p className="text-xs text-gray-400 italic">No keywords in CSV for this lead.</p>
            </div>
          )}

          {/* Core fields */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Industry"  value={lead.industry} />
            <Field label="Location"  value={lead.location} />
            <Field label="Seniority" value={lead.seniority || lead.experience_level} />
            <Field label="Source"    value={lead.source === "apollo" ? "Apollo" : "KS Connections"} />
          </div>

          {lead.email && (
            <Field label="Email" value={lead.email} />
          )}

          {/* Apollo-specific */}
          {lead.source === "apollo" && (
            <>
              {lead.departments    && <Field label="Departments"    value={lead.departments} />}
              {lead.sub_departments && <Field label="Sub Departments" value={lead.sub_departments} />}
              {lead.employees      && <Field label="Employees"      value={Number(lead.employees).toLocaleString()} />}
              {lead.annual_revenue && <Field label="Annual Revenue" value={`$${Number(lead.annual_revenue).toLocaleString()}`} />}
              {lead.stage          && <Field label="Stage"          value={lead.stage} />}
              {lead.technologies   && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Technologies</p>
                  <div className="flex flex-wrap gap-1">
                    {lead.technologies.split(",").slice(0, 10).map((t, i) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{t.trim()}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* KS-specific */}
          {lead.source === "ks" && (
            <>
              {lead.skills?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Skills</p>
                  <div className="flex flex-wrap gap-1">
                    {lead.skills.map((s, i) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {lead.about      && <Field label="About" value={lead.about.slice(0, 300) + (lead.about.length > 300 ? "…" : "")} />}
              {lead.geo_exposure && <Field label="Geo Exposure" value={lead.geo_exposure} />}
              {lead.followers  && <Field label="LinkedIn Followers" value={Number(lead.followers).toLocaleString()} />}
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t border-gray-100 flex flex-col gap-2">
          {lead.linkedin_url && (
            <a
              href={lead.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full text-center py-2.5 px-4 rounded-lg text-sm font-semibold text-white transition-colors"
              style={{ backgroundColor: "#0077b5" }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = "#005e93"}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = "#0077b5"}
            >
              View LinkedIn Profile
            </a>
          )}
          {lead.linkedin_url && (
            <a
              href={`https://www.linkedin.com/messaging/compose/?recipients=${encodeURIComponent(lead.linkedin_url)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full text-center py-2 px-4 rounded-lg text-sm font-semibold border border-[#0077b5] text-[#0077b5] transition-colors hover:bg-blue-50"
            >
              Message on LinkedIn
            </a>
          )}
          <button
            onClick={() => { onCompose(lead); onClose(); }}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-semibold border border-purple-500 text-purple-600 hover:bg-purple-50 transition-colors"
          >
            <ComposeIcon /> Compose Email
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
const LinkedInDashboardPage = ({ user, onSignOut, onSelectProspect }) => {
  const { ciData, setSelectedProspect } = useAppContext();
  const keywords = ciData?.keywords || [];

  const [activeTab,       setActiveTab]       = useState("apollo");
  const [leads,           setLeads]           = useState([]);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState(null);
  const [page,            setPage]            = useState(1);
  const [pages,           setPages]           = useState(1);
  const [total,           setTotal]           = useState(0);
  const [matched,         setMatched]         = useState(0);
  const [filterMatch,     setFilterMatch]     = useState("all");
  const [search,          setSearch]          = useState("");
  const [searchInput,     setSearchInput]     = useState("");
  const [selectedLead,    setSelectedLead]    = useState(null);
  const [industryFilter,  setIndustryFilter]  = useState("");
  const [companyFilter,   setCompanyFilter]   = useState("");
  const [industries,      setIndustries]      = useState([]);
  const [companies,       setCompanies]       = useState([]);

  // ── Fetch filter options (industry & company dropdowns) ─────────────────────
  useEffect(() => {
    apiGet(`/api/linkedin-dashboard/filters?source=${activeTab}`)
      .then(data => {
        setIndustries(data.industries || []);
        setCompanies(data.companies || []);
        // Reset dropdown selections when tab changes
        setIndustryFilter("");
        setCompanyFilter("");
      })
      .catch(() => {});
  }, [activeTab]);

  // ── Fetch leads ─────────────────────────────────────────────────────────────
  const fetchLeads = useCallback(async (tab, pg, filter, srch, indFilter, coFilter) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiPost("/api/linkedin-dashboard/leads", {
        source:          tab,
        keywords:        keywords,
        page:            pg,
        limit:           PAGE_SIZE,
        filter:          filter,
        search:          srch,
        industry_filter: indFilter,
        company_filter:  coFilter,
      });
      setLeads(data.leads || []);
      setTotal(data.total || 0);
      setMatched(data.matched || 0);
      setPages(data.pages || 1);
    } catch (err) {
      setError(err.message || "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, [keywords]);

  // Reload when tab / page / filter / search / dropdowns / keywords change
  useEffect(() => {
    fetchLeads(activeTab, page, filterMatch, search, industryFilter, companyFilter);
  }, [activeTab, page, filterMatch, search, industryFilter, companyFilter, fetchLeads]);

  // Reset to page 1 when tab/filter/search changes
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setPage(1);
    setSelectedLead(null);
  };
  const handleFilterChange = (f) => { setFilterMatch(f); setPage(1); };
  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };
  const clearSearch = () => { setSearchInput(""); setSearch(""); setPage(1); };
  const handleIndustryChange = (v) => { setIndustryFilter(v); setPage(1); };
  const handleCompanyChange  = (v) => { setCompanyFilter(v);  setPage(1); };

  // ── Compose: set prospect in context and navigate to Content Generation ──────
  const handleCompose = (lead) => {
    setSelectedProspect({
      name:         lead.name,
      email:        lead.email,
      linkedin_url: lead.linkedin_url,
      company:      lead.company,
      title:        lead.title,
    });
    if (onSelectProspect) onSelectProspect();
  };

  const activeTabObj = TABS.find(t => t.id === activeTab);
  const startIdx = (page - 1) * PAGE_SIZE + 1;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 min-h-screen flex flex-col" style={{ backgroundColor: "#F6E5FF" }}>
      {/* Top bar */}
      <div className="h-14 px-6 flex items-center justify-between border-b border-[#d8c8e8] bg-white/60 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <img src={logo} alt="logo" className="h-7 w-auto" />
          <span className="text-sm font-semibold text-gray-700">Lead Dashboard</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{user}</span>
          <button onClick={onSignOut} className="text-xs text-red-500 hover:text-red-700 font-medium">Sign out</button>
        </div>
      </div>

      <div className="flex-1 px-6 py-5 overflow-auto">

        {/* CI keyword status */}
        {keywords.length > 0 ? (
          <div className="mb-4 px-4 py-2.5 rounded-lg border border-green-200 bg-green-50 flex items-center gap-2">
            <span className="text-green-600 text-sm">✓</span>
            <p className="text-xs text-green-700">
              <span className="font-semibold">{keywords.length} CI keywords</span> active — keyword matching is live.
            </p>
            <div className="ml-2 flex flex-wrap gap-1">
              {keywords.slice(0, 6).map((kw, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded border border-green-200">{kw}</span>
              ))}
              {keywords.length > 6 && <span className="text-[10px] text-green-600">+{keywords.length - 6} more</span>}
            </div>
          </div>
        ) : (
          <div className="mb-4 px-4 py-2.5 rounded-lg border border-yellow-200 bg-yellow-50">
            <p className="text-xs text-yellow-700">
              No CI keywords active. Run <span className="font-semibold">Company Intelligence</span> first to enable keyword matching.
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-[#d8c8e8]">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? "border-purple-600 text-purple-700 bg-white"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-white/50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Stats bar */}
        <div className="flex flex-wrap gap-4 mb-4">
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-2 text-center">
            <p className="text-lg font-bold text-gray-900">{total.toLocaleString()}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Total</p>
          </div>
          <div className="bg-white rounded-lg border border-green-200 px-4 py-2 text-center">
            <p className="text-lg font-bold text-green-700">{matched.toLocaleString()}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Keyword Match</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-2 text-center">
            <p className="text-lg font-bold text-gray-500">{(total - matched).toLocaleString()}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">No Match</p>
          </div>
          {total > 0 && keywords.length > 0 && (
            <div className="bg-white rounded-lg border border-purple-200 px-4 py-2 text-center">
              <p className="text-lg font-bold text-purple-700">{Math.round(matched / total * 100)}%</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Match Rate</p>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-2 mb-4 items-center">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex gap-1">
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search name, company, title..."
              className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-white w-56 focus:outline-none focus:ring-2 focus:ring-purple-300"
            />
            <button type="submit" className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700">Search</button>
            {search && <button type="button" onClick={clearSearch} className="px-2 py-1.5 text-gray-400 hover:text-gray-600 text-sm">✕</button>}
          </form>

          {/* Industry dropdown */}
          <select
            value={industryFilter}
            onChange={e => handleIndustryChange(e.target.value)}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-white max-w-[200px] focus:outline-none focus:ring-2 focus:ring-purple-300"
          >
            <option value="">All Industries</option>
            {industries.map(ind => (
              <option key={ind} value={ind}>{ind}</option>
            ))}
          </select>

          {/* Company dropdown */}
          <select
            value={companyFilter}
            onChange={e => handleCompanyChange(e.target.value)}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-white max-w-[200px] focus:outline-none focus:ring-2 focus:ring-purple-300"
          >
            <option value="">All Companies</option>
            {companies.map(co => (
              <option key={co} value={co}>{co}</option>
            ))}
          </select>

          {/* Keyword match filter */}
          <div className="flex gap-1 ml-auto">
            {["all", "yes", "no"].map(f => (
              <button
                key={f}
                onClick={() => handleFilterChange(f)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                  filterMatch === f
                    ? "bg-purple-600 text-white border-purple-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-purple-300"
                }`}
              >
                {f === "all" ? "All" : f === "yes" ? "Match: YES" : "Match: NO"}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-sm text-gray-400">Loading leads...</div>
          ) : error ? (
            <div className="flex items-center justify-center py-20 text-sm text-red-500">{error}</div>
          ) : leads.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-sm text-gray-400">No leads found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100" style={{ backgroundColor: "#f8f4ff" }}>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase w-10">#</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase">Name / Title</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase">Company</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase">Industry</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase">Location</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase">Keyword Match</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase">LinkedIn</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead, i) => (
                    <LeadRow
                      key={lead.id}
                      lead={lead}
                      index={i}
                      globalIndex={startIdx + i}
                      onClick={setSelectedLead}
                      isSelected={selectedLead?.id === lead.id}
                      onCompose={handleCompose}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-gray-500">
              Showing {startIdx}–{Math.min(startIdx + PAGE_SIZE - 1, total)} of {total.toLocaleString()} leads
            </p>
            <div className="flex gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-600 disabled:opacity-40 hover:border-purple-300"
              >
                ← Prev
              </button>
              {/* Page number pills — show up to 5 around current */}
              {Array.from({ length: pages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === pages || Math.abs(p - page) <= 2)
                .reduce((acc, p, i, arr) => {
                  if (i > 0 && p - arr[i - 1] > 1) acc.push("...");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "..." ? (
                    <span key={`ellipsis-${i}`} className="px-2 py-1.5 text-xs text-gray-400">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                        page === p
                          ? "bg-purple-600 text-white border-purple-600"
                          : "border-gray-200 bg-white text-gray-600 hover:border-purple-300"
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
              <button
                disabled={page >= pages}
                onClick={() => setPage(p => Math.min(pages, p + 1))}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-600 disabled:opacity-40 hover:border-purple-300"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selectedLead && (
        <DetailPanel
          lead={selectedLead}
          keywords={keywords}
          onClose={() => setSelectedLead(null)}
          onCompose={handleCompose}
        />
      )}
    </div>
  );
};

export default LinkedInDashboardPage;
