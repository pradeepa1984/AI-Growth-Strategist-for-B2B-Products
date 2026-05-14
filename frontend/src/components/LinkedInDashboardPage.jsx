import { useState, useEffect, useCallback } from "react";
import { useAppContext } from "../AppContext";
import { apiPost, apiGet } from "../api/client";
import logo from "../assets/Logo.png";
import { logout } from "../auth/cognito";

const ComposeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
  </svg>
);

const PAGE_SIZE = 50;

const TABS = [
  { id: "apollo", label: "Apollo Leads",        count_key: "apollo", desc: "2,789 insurance & financial sector contacts" },
  { id: "ks",     label: "Linkedin Connections", count_key: "ks",     desc: "399 LinkedIn connections" },
];

const MatchBadge = ({ value }) => {
  const styles = {
    YES:   { bg: "#dcfce7", border: "#86efac", text: "#15803d", label: "YES" },
    NO:    { bg: "#f3f4f6", border: "#d1d5db", text: "#6b7280", label: "NO"  },
    "N/A": { bg: "#CCF2E8", border: "#5DD4B0", text: "#0B4F43", label: "N/A" },
  };
  const s = styles[value] || styles["N/A"];
  return (
    <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border"
      style={{ backgroundColor: s.bg, color: s.text, borderColor: s.border }}>
      {s.label}
    </span>
  );
};

const IndustryPill = ({ value }) => {
  if (!value) return <span className="text-xs" style={{ color: "#D4EDE6" }}>—</span>;
  return (
    <span className="inline-block text-[10px] px-2 py-0.5 rounded-full font-medium max-w-[160px] truncate"
      style={{ backgroundColor: "#CCF2E8", border: "1px solid #5DD4B0", color: "#0B4F43" }} title={value}>
      {value}
    </span>
  );
};

const LeadRow = ({ lead, index, globalIndex, onClick, isSelected, onCompose }) => (
  <tr
    onClick={() => onClick(lead)}
    className="cursor-pointer transition-colors"
    style={{ backgroundColor: isSelected ? "#CCF2E8" : "transparent", borderBottom: "1px solid #D4EDE6" }}
    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = "#E8F4F9"; }}
    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = "transparent"; }}
  >
    <td className="px-4 py-3 text-xs w-10" style={{ color: "#2E4057" }}>{globalIndex}</td>
    <td className="px-4 py-3">
      <p className="text-sm font-semibold leading-tight" style={{ color: "#1C2C3A" }}>{lead.name || "—"}</p>
      {lead.title && <p className="text-xs truncate max-w-[200px]" style={{ color: "#2E4057" }} title={lead.title}>{lead.title}</p>}
    </td>
    <td className="px-4 py-3 text-xs font-medium" style={{ color: "#0B4F43" }}>{lead.company || "—"}</td>
    <td className="px-4 py-3"><IndustryPill value={lead.industry} /></td>
    <td className="px-4 py-3 text-xs" style={{ color: "#2E4057" }}>{lead.location || lead.country || "—"}</td>
    <td className="px-4 py-3"><MatchBadge value={lead.keyword_match} /></td>
    <td className="px-4 py-3">
      {lead.linkedin_url ? (
        <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-[11px] font-medium hover:underline"
          style={{ color: "#0077b5" }}>
          View
        </a>
      ) : <span className="text-xs" style={{ color: "#D4EDE6" }}>—</span>}
    </td>
    <td className="px-4 py-3">
      <button onClick={e => { e.stopPropagation(); onCompose(lead); }}
        title="Compose email in Content Generation"
        className="inline-flex items-center gap-1 text-[11px] font-medium hover:underline"
        style={{ color: "#1A9E7A" }}>
        <ComposeIcon /> Compose
      </button>
    </td>
  </tr>
);

const DetailPanel = ({ lead, keywords, onClose, onCompose }) => {
  if (!lead) return null;

  const Field = ({ label, value }) => {
    if (!value) return null;
    return (
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: "#2E4057" }}>{label}</p>
        <p className="text-xs leading-relaxed break-words" style={{ color: "#1C2C3A" }}>{value}</p>
      </div>
    );
  };

  const matchedKws = keywords.filter(kw => {
    const text = [lead.title, lead.company, lead.industry, lead.about, lead.departments].join(" ").toLowerCase();
    return kw && text.includes(kw.toLowerCase());
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="h-full w-full max-w-md bg-white shadow-2xl overflow-y-auto flex flex-col"
        style={{ borderLeft: "1px solid #D4EDE6" }}
        onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 flex items-start justify-between gap-3" style={{ backgroundColor: "#E8F4F9", borderBottom: "1px solid #D4EDE6" }}>
          <div className="min-w-0">
            <p className="text-base font-bold leading-tight" style={{ color: "#1C2C3A" }}>{lead.name || "—"}</p>
            {lead.title   && <p className="text-xs mt-0.5 leading-tight" style={{ color: "#2E4057" }}>{lead.title}</p>}
            {lead.company && <p className="text-xs font-semibold mt-0.5" style={{ color: "#0B4F43" }}>{lead.company}</p>}
          </div>
          <button onClick={onClose} className="text-xl leading-none flex-shrink-0 mt-0.5" style={{ color: "#2E4057" }}>×</button>
        </div>

        <div className="flex-1 px-5 py-4 space-y-4">
          <div className="p-3 rounded-lg space-y-2"
            style={{ backgroundColor: lead.keyword_match === "YES" ? "#f0fdf4" : "#E8F4F9", border: `1px solid ${lead.keyword_match === "YES" ? "#86efac" : "#D4EDE6"}` }}>
            <div className="flex items-center gap-2">
              <MatchBadge value={lead.keyword_match} />
              <p className="text-xs font-semibold" style={{ color: "#1C2C3A" }}>
                {lead.keyword_match === "YES" ? "CI keyword match found" : lead.keyword_match === "N/A" ? "No CI keywords — run Company Intelligence first" : "No CI keyword match"}
              </p>
            </div>
            {lead.keyword_match === "YES" && matchedKws.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {matchedKws.slice(0, 6).map((kw, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: "#dcfce7", color: "#15803d", border: "1px solid #86efac" }}>{kw}</span>
                ))}
              </div>
            )}
            {lead.keyword_match === "NO" && keywords.length > 0 && (
              <p className="text-[10px]" style={{ color: "#2E4057" }}>None of the {keywords.length} CI keywords appear in this lead's profile text.</p>
            )}
          </div>

          {lead.source === "apollo" && lead.csv_keywords?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "#2E4057" }}>
                Apollo CSV Keywords <span className="font-normal normal-case" style={{ color: "#D4EDE6" }}>({lead.csv_keywords.length} total)</span>
              </p>
              <div className="flex flex-wrap gap-1">
                {lead.csv_keywords.map((kw, i) => {
                  const isMatched = keywords.some(ck => ck && kw && (ck.toLowerCase().includes(kw.toLowerCase()) || kw.toLowerCase().includes(ck.toLowerCase())));
                  return (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded border font-medium"
                      style={isMatched ? { backgroundColor: "#dcfce7", color: "#15803d", borderColor: "#86efac" } : { backgroundColor: "#f3f4f6", color: "#6b7280", borderColor: "#d1d5db" }}
                      title={isMatched ? "Matched a CI keyword" : "No CI keyword match"}>
                      {kw}
                    </span>
                  );
                })}
              </div>
              {keywords.length > 0 && <p className="text-[10px] mt-1.5" style={{ color: "#2E4057" }}>Green = matches a CI keyword · Gray = no match</p>}
            </div>
          )}

          {lead.source === "apollo" && (!lead.csv_keywords || lead.csv_keywords.length === 0) && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "#2E4057" }}>Apollo CSV Keywords</p>
              <p className="text-xs italic" style={{ color: "#2E4057" }}>No keywords in CSV for this lead.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Industry"  value={lead.industry} />
            <Field label="Location"  value={lead.location} />
            <Field label="Seniority" value={lead.seniority || lead.experience_level} />
            <Field label="Source"    value={lead.source === "apollo" ? "Apollo" : "KS Connections"} />
          </div>

          {lead.email && <Field label="Email" value={lead.email} />}

          {lead.source === "apollo" && (
            <>
              {lead.departments    && <Field label="Departments"    value={lead.departments} />}
              {lead.sub_departments && <Field label="Sub Departments" value={lead.sub_departments} />}
              {lead.employees      && <Field label="Employees"      value={Number(lead.employees).toLocaleString()} />}
              {lead.annual_revenue && <Field label="Annual Revenue" value={`$${Number(lead.annual_revenue).toLocaleString()}`} />}
              {lead.stage          && <Field label="Stage"          value={lead.stage} />}
              {lead.technologies   && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "#2E4057" }}>Technologies</p>
                  <div className="flex flex-wrap gap-1">
                    {lead.technologies.split(",").slice(0, 10).map((t, i) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "#E8F4F9", color: "#2E4057" }}>{t.trim()}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {lead.source === "ks" && (
            <>
              {lead.skills?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "#2E4057" }}>Skills</p>
                  <div className="flex flex-wrap gap-1">
                    {lead.skills.map((s, i) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "#CCF2E8", color: "#0B4F43", border: "1px solid #5DD4B0" }}>{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {lead.about        && <Field label="About"              value={lead.about.slice(0, 300) + (lead.about.length > 300 ? "…" : "")} />}
              {lead.geo_exposure && <Field label="Geo Exposure"       value={lead.geo_exposure} />}
              {lead.followers    && <Field label="LinkedIn Followers"  value={Number(lead.followers).toLocaleString()} />}
            </>
          )}
        </div>

        <div className="px-5 py-4 flex flex-col gap-2" style={{ borderTop: "1px solid #D4EDE6" }}>
          {lead.linkedin_url && (
            <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer"
              className="w-full text-center py-2.5 px-4 rounded-lg text-sm font-semibold text-white transition-colors"
              style={{ backgroundColor: "#0077b5" }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = "#005e93"}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = "#0077b5"}>
              View LinkedIn Profile
            </a>
          )}
          {lead.linkedin_url && (
            <a href={`https://www.linkedin.com/messaging/compose/?recipients=${encodeURIComponent(lead.linkedin_url)}`}
              target="_blank" rel="noopener noreferrer"
              className="w-full text-center py-2 px-4 rounded-lg text-sm font-semibold transition-colors hover:bg-blue-50"
              style={{ border: "1px solid #0077b5", color: "#0077b5" }}>
              Message on LinkedIn
            </a>
          )}
          <button onClick={() => { onCompose(lead); onClose(); }}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-semibold transition-colors"
            style={{ border: "1px solid #1A9E7A", color: "#0B4F43" }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#CCF2E8"; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; }}>
            <ComposeIcon /> Compose Email
          </button>
        </div>
      </div>
    </div>
  );
};

const LinkedInDashboardPage = ({ user, onSignOut, onSelectProspect }) => {
  const { ciData, setSelectedProspect } = useAppContext();
  const keywords = ciData?.keywords || [];

  const [activeTab,      setActiveTab]      = useState("apollo");
  const [leads,          setLeads]          = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState(null);
  const [page,           setPage]           = useState(1);
  const [pages,          setPages]          = useState(1);
  const [total,          setTotal]          = useState(0);
  const [matched,        setMatched]        = useState(0);
  const [filterMatch,    setFilterMatch]    = useState("all");
  const [search,         setSearch]         = useState("");
  const [searchInput,    setSearchInput]    = useState("");
  const [selectedLead,   setSelectedLead]   = useState(null);
  const [industryFilter, setIndustryFilter] = useState("");
  const [companyFilter,  setCompanyFilter]  = useState("");
  const [industries,     setIndustries]     = useState([]);
  const [companies,      setCompanies]      = useState([]);

  useEffect(() => {
    apiGet(`/api/linkedin-dashboard/filters?source=${activeTab}`)
      .then(data => { setIndustries(data.industries || []); setCompanies(data.companies || []); setIndustryFilter(""); setCompanyFilter(""); })
      .catch(() => {});
  }, [activeTab]);

  const fetchLeads = useCallback(async (tab, pg, filter, srch, indFilter, coFilter) => {
    setLoading(true); setError(null);
    try {
      const data = await apiPost("/api/linkedin-dashboard/leads", {
        source: tab, keywords, page: pg, limit: PAGE_SIZE, filter, search: srch, industry_filter: indFilter, company_filter: coFilter,
      });
      setLeads(data.leads || []); setTotal(data.total || 0); setMatched(data.matched || 0); setPages(data.pages || 1);
    } catch (err) { setError(err.message || "Failed to load leads"); }
    finally { setLoading(false); }
  }, [keywords]);

  useEffect(() => {
    fetchLeads(activeTab, page, filterMatch, search, industryFilter, companyFilter);
  }, [activeTab, page, filterMatch, search, industryFilter, companyFilter, fetchLeads]);

  const handleTabChange    = (tab) => { setActiveTab(tab); setPage(1); setSelectedLead(null); };
  const handleFilterChange = (f)   => { setFilterMatch(f); setPage(1); };
  const handleSearch       = (e)   => { e.preventDefault(); setSearch(searchInput.trim()); setPage(1); };
  const clearSearch        = ()    => { setSearchInput(""); setSearch(""); setPage(1); };
  const handleIndustryChange = (v) => { setIndustryFilter(v); setPage(1); };
  const handleCompanyChange  = (v) => { setCompanyFilter(v);  setPage(1); };

  const handleCompose = (lead) => {
    setSelectedProspect({ name: lead.name, email: lead.email, linkedin_url: lead.linkedin_url, company: lead.company, title: lead.title });
    if (onSelectProspect) onSelectProspect();
  };

  const startIdx = (page - 1) * PAGE_SIZE + 1;
  const selectStyle = { backgroundColor: "#FFFFFF", border: "1px solid #D4EDE6", borderRadius: "8px", color: "#1C2C3A" };

  return (
    <div className="flex-1 min-h-screen flex flex-col" style={{ backgroundColor: "#E8F4F9" }}>
      {/* Top bar */}
      <div className="h-14 px-6 flex items-center justify-between flex-shrink-0"
        style={{ backgroundColor: "#FFFFFF", borderBottom: "1px solid #D4EDE6" }}>
        <div className="flex items-center gap-3">
          <img src={logo} alt="logo" className="h-7 w-auto" />
          <span className="text-sm font-semibold" style={{ color: "#0B4F43" }}>Lead Dashboard</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: "#2E4057" }}>{user}</span>
          <button onClick={onSignOut} className="text-xs font-medium" style={{ color: "#E8A87C" }}
            onMouseEnter={e => e.currentTarget.style.color = "#c4835a"}
            onMouseLeave={e => e.currentTarget.style.color = "#E8A87C"}>
            Sign out
          </button>
        </div>
      </div>

      <div className="flex-1 px-6 py-5 overflow-auto">

        {/* CI keyword status */}
        {keywords.length > 0 ? (
          <div className="mb-4 px-4 py-2.5 rounded-lg flex items-center gap-2" style={{ border: "1px solid #5DD4B0", backgroundColor: "#CCF2E8" }}>
            <span className="text-sm" style={{ color: "#1A9E7A" }}>✓</span>
            <p className="text-xs" style={{ color: "#0B4F43" }}>
              <span className="font-semibold">{keywords.length} CI keywords</span> active — keyword matching is live.
            </p>
            <div className="ml-2 flex flex-wrap gap-1">
              {keywords.slice(0, 6).map((kw, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "#FFFFFF", color: "#0B4F43", border: "1px solid #5DD4B0" }}>{kw}</span>
              ))}
              {keywords.length > 6 && <span className="text-[10px]" style={{ color: "#0B4F43" }}>+{keywords.length - 6} more</span>}
            </div>
          </div>
        ) : (
          <div className="mb-4 px-4 py-2.5 rounded-lg" style={{ border: "1px solid #fde047", backgroundColor: "#fef9c3" }}>
            <p className="text-xs" style={{ color: "#854d0e" }}>
              No CI keywords active. Run <span className="font-semibold">Company Intelligence</span> first to enable keyword matching.
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-4" style={{ borderBottom: "1px solid #D4EDE6" }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => handleTabChange(tab.id)}
              className="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px"
              style={activeTab === tab.id
                ? { borderColor: "#1A9E7A", color: "#0B4F43", backgroundColor: "#FFFFFF" }
                : { borderColor: "transparent", color: "#2E4057", backgroundColor: "transparent" }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Stats bar */}
        <div className="flex flex-wrap gap-4 mb-4">
          {[
            { label: "Total",         value: total,   color: "#1A9E7A", border: "#D4EDE6" },
            { label: "Keyword Match", value: matched, color: "#15803d", border: "#86efac" },
            { label: "No Match",      value: total - matched, color: "#6b7280", border: "#D4EDE6" },
          ].map(({ label, value, color, border }) => (
            <div key={label} className="rounded-lg px-4 py-2 text-center" style={{ backgroundColor: "#FFFFFF", border: `1px solid ${border}` }}>
              <p className="text-lg font-bold tabular-nums" style={{ color }}>{value.toLocaleString()}</p>
              <p className="text-[10px] uppercase tracking-wide mt-0.5" style={{ color: "#2E4057" }}>{label}</p>
            </div>
          ))}
          {total > 0 && keywords.length > 0 && (
            <div className="rounded-lg px-4 py-2 text-center" style={{ backgroundColor: "#FFFFFF", border: "1px solid #D4EDE6" }}>
              <p className="text-lg font-bold tabular-nums" style={{ color: "#E8A87C" }}>{Math.round(matched / total * 100)}%</p>
              <p className="text-[10px] uppercase tracking-wide mt-0.5" style={{ color: "#2E4057" }}>Match Rate</p>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-2 mb-4 items-center">
          <form onSubmit={handleSearch} className="flex gap-1">
            <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
              placeholder="Search name, company, title..."
              className="text-sm px-3 py-1.5 w-56 focus:outline-none focus:ring-2 focus:ring-[#5DD4B0]"
              style={selectStyle} />
            <button type="submit" className="px-3 py-1.5 text-sm rounded-lg text-white" style={{ backgroundColor: "#1A9E7A" }}>Search</button>
            {search && <button type="button" onClick={clearSearch} className="px-2 py-1.5 text-sm" style={{ color: "#2E4057" }}>✕</button>}
          </form>

          <select value={industryFilter} onChange={e => handleIndustryChange(e.target.value)}
            className="text-sm px-3 py-1.5 max-w-[200px] focus:outline-none focus:ring-2 focus:ring-[#5DD4B0]" style={selectStyle}>
            <option value="">All Industries</option>
            {industries.map(ind => <option key={ind} value={ind}>{ind}</option>)}
          </select>

          <select value={companyFilter} onChange={e => handleCompanyChange(e.target.value)}
            className="text-sm px-3 py-1.5 max-w-[200px] focus:outline-none focus:ring-2 focus:ring-[#5DD4B0]" style={selectStyle}>
            <option value="">All Companies</option>
            {companies.map(co => <option key={co} value={co}>{co}</option>)}
          </select>

          <div className="flex gap-1 ml-auto">
            {["all", "yes", "no"].map(f => (
              <button key={f} onClick={() => handleFilterChange(f)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors"
                style={filterMatch === f
                  ? { backgroundColor: "#0B4F43", color: "#fff", border: "1px solid #0B4F43" }
                  : { backgroundColor: "#FFFFFF", color: "#2E4057", border: "1px solid #D4EDE6" }}>
                {f === "all" ? "All" : f === "yes" ? "Match: YES" : "Match: NO"}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl overflow-hidden shadow-sm" style={{ backgroundColor: "#FFFFFF", border: "1px solid #D4EDE6" }}>
          {loading ? (
            <div className="flex items-center justify-center py-20 text-sm" style={{ color: "#2E4057" }}>Loading leads...</div>
          ) : error ? (
            <div className="flex items-center justify-center py-20 text-sm" style={{ color: "#E8A87C" }}>{error}</div>
          ) : leads.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-sm" style={{ color: "#2E4057" }}>No leads found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr style={{ borderBottom: "1px solid #D4EDE6", backgroundColor: "#E8F4F9" }}>
                    {["#", "Name / Title", "Company", "Industry", "Location", "Keyword Match", "LinkedIn", "Action"].map(h => (
                      <th key={h} className="px-4 py-2.5 text-[10px] font-bold uppercase" style={{ color: "#2E4057" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead, i) => (
                    <LeadRow key={lead.id} lead={lead} index={i} globalIndex={startIdx + i}
                      onClick={setSelectedLead} isSelected={selectedLead?.id === lead.id} onCompose={handleCompose} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs" style={{ color: "#2E4057" }}>
              Showing {startIdx}–{Math.min(startIdx + PAGE_SIZE - 1, total)} of {total.toLocaleString()} leads
            </p>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 text-xs rounded-lg disabled:opacity-40"
                style={{ border: "1px solid #D4EDE6", backgroundColor: "#FFFFFF", color: "#2E4057" }}>
                ← Prev
              </button>
              {Array.from({ length: pages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === pages || Math.abs(p - page) <= 2)
                .reduce((acc, p, i, arr) => { if (i > 0 && p - arr[i - 1] > 1) acc.push("..."); acc.push(p); return acc; }, [])
                .map((p, i) =>
                  p === "..." ? (
                    <span key={`ellipsis-${i}`} className="px-2 py-1.5 text-xs" style={{ color: "#2E4057" }}>…</span>
                  ) : (
                    <button key={p} onClick={() => setPage(p)}
                      className="px-3 py-1.5 text-xs rounded-lg transition-colors"
                      style={page === p
                        ? { backgroundColor: "#0B4F43", color: "#fff", border: "1px solid #0B4F43" }
                        : { border: "1px solid #D4EDE6", backgroundColor: "#FFFFFF", color: "#2E4057" }}>
                      {p}
                    </button>
                  )
                )}
              <button disabled={page >= pages} onClick={() => setPage(p => Math.min(pages, p + 1))}
                className="px-3 py-1.5 text-xs rounded-lg disabled:opacity-40"
                style={{ border: "1px solid #D4EDE6", backgroundColor: "#FFFFFF", color: "#2E4057" }}>
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedLead && (
        <DetailPanel lead={selectedLead} keywords={keywords} onClose={() => setSelectedLead(null)} onCompose={handleCompose} />
      )}
    </div>
  );
};

export default LinkedInDashboardPage;
