/**
 * AnalyticsDashboard.jsx
 *
 * Two-tab analytics view (Apollo Leads | LinkedIn Connections).
 * Every section card shows: chart + raw data table + stat footer.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAppContext }  from '../AppContext';
import { apiPost }       from '../api/client';
import logo              from '../assets/Logo.png';
import ChartRenderer     from './ChartRenderer';
import DrilldownModal    from './DrilldownModal';
import {
  getIndustryDistribution,
  getSkillsDistribution,
  getKeywordsDistribution,
  getIndustryYesMatch,
  getKeywordMatchCounts,
  getKeywordLocationDrilldown,
} from '../utils/dataAggregator';

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);

const ChartSkeleton = () => (
  <div className="animate-pulse p-4 space-y-3">
    <div className="h-3 rounded-full w-1/3" style={{ backgroundColor: "#D4EDE6" }} />
    <div className="h-44 rounded-xl" style={{ backgroundColor: "#E8F4F9" }} />
    <div className="flex gap-2">
      {[40, 56, 32, 48].map((w, i) => (
        <div key={i} className="h-2.5 rounded-full" style={{ width: w, backgroundColor: "#D4EDE6" }} />
      ))}
    </div>
  </div>
);

const DataTable = ({ columns, rows }) => {
  if (!rows || rows.length === 0) return null;
  return (
    <div style={{ borderTop: "1px solid #D4EDE6", paddingTop: "8px", paddingBottom: "12px", paddingLeft: "16px", paddingRight: "16px" }}>
      <p className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "#2E4057" }}>Raw Data</p>
      <div className="overflow-y-auto rounded-lg" style={{ maxHeight: 168, border: "1px solid #D4EDE6", scrollbarWidth: 'thin', scrollbarColor: '#D4EDE6 #E8F4F9' }}>
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10" style={{ backgroundColor: '#E8F4F9' }}>
            <tr>
              {columns.map(col => (
                <th key={col.key} className={`px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                  style={{ color: "#2E4057", borderBottom: "1px solid #D4EDE6" }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="last:border-0 transition-colors"
                style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#E8F4F9', borderBottom: "1px solid #D4EDE6" }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#CCF2E8'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = i % 2 === 0 ? '#fff' : '#E8F4F9'; }}>
                {columns.map(col => (
                  <td key={col.key} className={`px-2.5 py-[5px] text-[10px] ${col.align === 'right' ? 'text-right font-mono tabular-nums' : ''} ${col.bold ? 'font-semibold' : ''}`}
                    style={{ color: col.bold ? "#1C2C3A" : "#2E4057" }}>
                    {col.truncate ? (
                      <span className="block max-w-[140px] truncate" title={String(row[col.key])}>{row[col.key]}</span>
                    ) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const StatLine = ({ total, unit, highlight, verb = 'is', label, color }) => {
  const p = pct(highlight, total);
  return (
    <div className="px-4 py-2.5" style={{ borderTop: "1px solid #D4EDE6", backgroundColor: "#E8F4F9" }}>
      <p className="text-[11px] leading-relaxed" style={{ color: "#2E4057" }}>
        Total:{' '}
        <span className="font-bold" style={{ color: "#1C2C3A" }}>{(total || 0).toLocaleString()}</span>{' '}
        {unit}, out of which{' '}
        <span className="font-bold" style={{ color }}>{(highlight || 0).toLocaleString()}</span>{' '}
        {verb}
        {label ? <>{' '}<span className="font-bold" style={{ color }}>"{label}"</span></> : null}
        {' · '}
        <span className="inline-block font-bold text-white text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: color }}>
          {p}%
        </span>
      </p>
    </div>
  );
};

const SectionCard = ({ title, subtitle, accent, badge, rawData, stat, children }) => (
  <div className="rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col overflow-hidden"
    style={{ backgroundColor: "#FFFFFF", border: "1px solid #D4EDE6" }}>
    <div className="h-[3px] flex-shrink-0" style={{ backgroundColor: accent }} />
    <div className="px-4 pt-3 pb-2.5" style={{ borderBottom: "1px solid #D4EDE6" }}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-bold leading-tight" style={{ color: "#1C2C3A" }}>{title}</p>
        {badge && (
          <span className="flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
            style={{ backgroundColor: accent + '1a', color: accent }}>
            {badge}
          </span>
        )}
      </div>
      {subtitle && <p className="text-[10px] mt-0.5" style={{ color: "#2E4057" }}>{subtitle}</p>}
    </div>
    <div className="px-1 pb-1">{children}</div>
    {rawData}
    {stat}
  </div>
);

const EmptyState = ({ icon, title, hint }) => (
  <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
    <div className="text-3xl mb-2">{icon}</div>
    <p className="text-sm font-semibold" style={{ color: "#2E4057" }}>{title}</p>
    {hint && <p className="text-[11px] mt-1 max-w-[240px] leading-relaxed" style={{ color: "#2E4057" }}>{hint}</p>}
  </div>
);

const StatCard = ({ label, value, color }) => (
  <div className="rounded-lg px-4 py-2.5 text-center min-w-[88px] shadow-sm" style={{ backgroundColor: "#FFFFFF", border: "1px solid #D4EDE6" }}>
    <p className="text-xl font-extrabold tabular-nums" style={{ color }}>{value}</p>
    <p className="text-[10px] uppercase tracking-wide mt-0.5 leading-tight" style={{ color: "#2E4057" }}>{label}</p>
  </div>
);

const CiBanner = ({ keywords }) =>
  keywords.length > 0 ? (
    <div className="px-4 py-2.5 rounded-lg flex flex-wrap items-center gap-2" style={{ border: "1px solid #5DD4B0", backgroundColor: "#CCF2E8" }}>
      <span className="text-sm font-bold" style={{ color: "#1A9E7A" }}>✓</span>
      <p className="text-xs" style={{ color: "#0B4F43" }}>
        <span className="font-semibold">{keywords.length} CI keywords</span> active — Sections E &amp; F update live.
      </p>
      <div className="flex flex-wrap gap-1">
        {keywords.slice(0, 8).map((kw, i) => (
          <span key={i} className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "#FFFFFF", color: "#0B4F43", border: "1px solid #5DD4B0" }}>{kw}</span>
        ))}
        {keywords.length > 8 && <span className="text-[10px]" style={{ color: "#0B4F43" }}>+{keywords.length - 8} more</span>}
      </div>
    </div>
  ) : (
    <div className="px-4 py-2.5 rounded-lg" style={{ border: "1px solid #fde047", backgroundColor: "#fef9c3" }}>
      <p className="text-xs" style={{ color: "#854d0e" }}>
        No CI keywords active — run <span className="font-semibold">Company Intelligence</span> to enable Sections E &amp; F.
      </p>
    </div>
  );

const INDUSTRY_COLS = [
  { key: 'name',  label: 'Industry', truncate: true },
  { key: 'count', label: 'Leads',    align: 'right', bold: true },
  { key: 'pct',   label: '% Total',  align: 'right' },
];
const KEYWORD_COLS = [
  { key: 'name',  label: 'Keyword',  truncate: true },
  { key: 'count', label: 'Leads',    align: 'right', bold: true },
  { key: 'pct',   label: '% Total',  align: 'right' },
];
const SKILLS_COLS = [
  { key: 'name',  label: 'Skill',       truncate: true },
  { key: 'count', label: 'Connections', align: 'right', bold: true },
  { key: 'pct',   label: '% Total',     align: 'right' },
];
const CI_MATCH_COLS = [
  { key: 'name',       label: 'Industry',  truncate: true },
  { key: 'yes',        label: 'YES',       align: 'right', bold: true },
  { key: 'no',         label: 'No Match',  align: 'right' },
  { key: 'total',      label: 'Total',     align: 'right' },
  { key: 'yesPercent', label: 'Match %',   align: 'right' },
];
const KW_MATCH_COLS = [
  { key: 'name',  label: 'CI Keyword', truncate: true },
  { key: 'count', label: 'Matches',    align: 'right', bold: true },
  { key: 'pct',   label: '% of Leads', align: 'right' },
];

const mkIndustryRows = (data, total)  => data.map(d => ({ name: d.name, count: d.count.toLocaleString(), pct: `${pct(d.count, total)}%` }));
const mkKeywordRows  = (data, total)  => data.map(d => ({ name: d.name, count: d.count.toLocaleString(), pct: `${pct(d.count, total)}%` }));
const mkSkillRows    = (data, total)  => data.map(d => ({ name: d.name, count: d.count.toLocaleString(), pct: `${pct(d.count, total)}%` }));
const mkCIMatchRows  = (data)         => data.map(d => ({ name: d.name, yes: d.yes.toLocaleString(), no: d.no.toLocaleString(), total: d.total.toLocaleString(), yesPercent: `${d.yesPercent}%` }));
const mkKwMatchRows  = (data, total)  => data.map(d => ({ name: d.name, count: d.count.toLocaleString(), pct: `${pct(d.count, total)}%` }));

const AnalyticsDashboard = ({ user, onSignOut }) => {
  const { ciData } = useAppContext();
  const ciKeywords = useMemo(() => ciData?.keywords || [], [ciData]);
  const ciCompany  = ciData?.company || ciData?.url || null;

  const [apolloLeads, setApolloLeads] = useState([]);
  const [ksLeads,     setKsLeads]     = useState([]);
  const [loadingA,    setLoadingA]    = useState(true);
  const [loadingK,    setLoadingK]    = useState(true);
  const [errorA,      setErrorA]      = useState(null);
  const [errorK,      setErrorK]      = useState(null);
  const [activeTab,   setActiveTab]   = useState('apollo');
  const [selectedKw,  setSelectedKw]  = useState(null);

  useEffect(() => {
    setLoadingA(true); setErrorA(null);
    apiPost('/api/linkedin-dashboard/leads', { source: 'apollo', keywords: [], page: 1, limit: 5000, filter: 'all', search: '', industry_filter: '', company_filter: '' })
      .then(d  => setApolloLeads(d.leads || []))
      .catch(e => setErrorA(e.message || 'Failed to load Apollo leads'))
      .finally(() => setLoadingA(false));
  }, []);

  useEffect(() => {
    setLoadingK(true); setErrorK(null);
    apiPost('/api/linkedin-dashboard/leads', { source: 'ks', keywords: [], page: 1, limit: 5000, filter: 'all', search: '', industry_filter: '', company_filter: '' })
      .then(d  => setKsLeads(d.leads || []))
      .catch(e => setErrorK(e.message || 'Failed to load LinkedIn connections'))
      .finally(() => setLoadingK(false));
  }, []);

  const apolloIndustryData      = useMemo(() => getIndustryDistribution(apolloLeads),          [apolloLeads]);
  const apolloCsvKeywordsData   = useMemo(() => getKeywordsDistribution(apolloLeads, 20),      [apolloLeads]);
  const apolloIndustryMatchData = useMemo(() => getIndustryYesMatch(apolloLeads, ciKeywords),  [apolloLeads, ciKeywords]);
  const apolloKeywordMatchData  = useMemo(() => getKeywordMatchCounts(apolloLeads, ciKeywords),[apolloLeads, ciKeywords]);
  const apolloTotalYes          = useMemo(() => apolloIndustryMatchData.reduce((s, d) => s + d.yes, 0), [apolloIndustryMatchData]);

  const ksIndustryData          = useMemo(() => getIndustryDistribution(ksLeads),              [ksLeads]);
  const ksSkillsData            = useMemo(() => getSkillsDistribution(ksLeads),               [ksLeads]);
  const ksIndustryMatchData     = useMemo(() => getIndustryYesMatch(ksLeads, ciKeywords),     [ksLeads, ciKeywords]);
  const ksKeywordMatchData      = useMemo(() => getKeywordMatchCounts(ksLeads, ciKeywords),   [ksLeads, ciKeywords]);
  const ksTotalYes              = useMemo(() => ksIndustryMatchData.reduce((s, d) => s + d.yes, 0), [ksIndustryMatchData]);

  const drilldownData = useMemo(() => {
    const leads = activeTab === 'apollo' ? apolloLeads : ksLeads;
    return getKeywordLocationDrilldown(leads, selectedKw);
  }, [activeTab, apolloLeads, ksLeads, selectedKw]);

  const handleKwClick = useCallback(entry => { if (entry?.name) setSelectedKw(entry.name); }, []);

  const renderIndustryCIMatch = (leads, matchData, totalYes, loading, accent) => {
    const totalLeads = leads.length;
    const unit       = activeTab === 'apollo' ? 'Apollo leads' : 'LinkedIn connections';
    const hasData    = !loading && matchData.filter(d => d.yes > 0).length > 0;
    return (
      <SectionCard
        title="Industry vs Company Intelligence Match"
        subtitle="Updates live when Company Intelligence changes"
        accent={accent}
        badge={ciKeywords.length > 0 && hasData ? `${matchData.filter(d => d.yes > 0).length} industries with matches` : ciKeywords.length === 0 ? 'Needs CI' : undefined}
        rawData={hasData && ciKeywords.length > 0 ? <DataTable columns={CI_MATCH_COLS} rows={mkCIMatchRows(matchData)} /> : null}
        stat={hasData && ciKeywords.length > 0 && totalLeads > 0 ? <StatLine total={totalLeads} unit={unit} highlight={totalYes} verb="are" label="CI-matched" color={accent} /> : null}
      >
        {loading ? <ChartSkeleton /> : ciKeywords.length === 0 ? (
          <EmptyState icon="🎯" title="Company Intelligence required" hint="Run Company Intelligence to see how each industry maps to CI keyword matches." />
        ) : matchData.filter(d => d.yes > 0).length === 0 ? (
          <EmptyState icon="📊" title="No CI matches found" hint="None of the CI keywords matched any lead. Try broader keywords in Company Intelligence." />
        ) : <ChartRenderer data={matchData} variant="industry-match" />}
      </SectionCard>
    );
  };

  const renderKeywordMatch = (leads, matchData, loading, accent) => {
    const totalLeads = leads.length;
    const topKw      = matchData[0];
    const unit       = activeTab === 'apollo' ? 'Apollo leads' : 'LinkedIn connections';
    const hasData    = !loading && ciKeywords.length > 0 && matchData.length > 0;
    return (
      <SectionCard
        title="Keyword Match + Location Drilldown"
        subtitle="Click a keyword to drill into location distribution"
        accent={accent}
        badge={ciKeywords.length > 0 && !loading ? `${ciKeywords.length} CI keyword${ciKeywords.length !== 1 ? 's' : ''}` : ciKeywords.length === 0 ? 'Needs CI' : undefined}
        rawData={hasData ? <DataTable columns={KW_MATCH_COLS} rows={mkKwMatchRows(matchData, totalLeads)} /> : null}
        stat={hasData && topKw && totalLeads > 0 ? <StatLine total={totalLeads} unit={unit} highlight={topKw.count} verb="match" label={topKw.name} color={accent} /> : null}
      >
        {loading ? <ChartSkeleton /> : ciKeywords.length === 0 ? (
          <EmptyState icon="🔍" title="Company Intelligence required" hint="Run Company Intelligence to see how each keyword maps across leads." />
        ) : matchData.length === 0 ? (
          <EmptyState icon="📭" title="No keyword matches" hint="None of the CI keywords produced matches in this dataset." />
        ) : (
          <>
            <p className="text-[10px] px-3 pt-2 mb-1" style={{ color: "#2E4057" }}>
              {matchData.length <= 10 ? 'Click any bar to drill down' : 'Scroll · Click any bar to drill down'}
            </p>
            <ChartRenderer data={matchData} variant="keyword-match" onItemClick={handleKwClick} />
          </>
        )}
      </SectionCard>
    );
  };

  return (
    <div className="flex-1 min-h-screen flex flex-col" style={{ backgroundColor: '#E8F4F9' }}>

      {/* Top bar */}
      <div className="h-14 px-6 flex items-center justify-between flex-shrink-0"
        style={{ backgroundColor: "#FFFFFF", borderBottom: "1px solid #D4EDE6" }}>
        <div className="flex items-center gap-3">
          <img src={logo} alt="logo" className="h-7 w-auto" />
          <span className="text-sm font-semibold" style={{ color: "#0B4F43" }}>Analytics Dashboard</span>
          {ciCompany && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium truncate max-w-[200px]"
              style={{ backgroundColor: "#CCF2E8", color: "#0B4F43", border: "1px solid #5DD4B0" }}>
              {ciCompany}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: "#2E4057" }}>{user}</span>
          <button onClick={() => onSignOut && onSignOut()} className="text-xs font-medium" style={{ color: "#E8A87C" }}
            onMouseEnter={e => e.currentTarget.style.color = "#c4835a"}
            onMouseLeave={e => e.currentTarget.style.color = "#E8A87C"}>
            Sign out
          </button>
        </div>
      </div>

      <div className="flex-1 px-6 py-5 space-y-5 overflow-auto">

        <CiBanner keywords={ciKeywords} />

        {/* Summary strip */}
        <div className="flex flex-wrap gap-3 items-center">
          <StatCard label="Apollo Leads"   value={apolloLeads.length.toLocaleString()} color="#1A9E7A" />
          <StatCard label="LI Connections" value={ksLeads.length.toLocaleString()}     color="#15803d" />
          {ciKeywords.length > 0 && (
            <StatCard label="CI Keywords"  value={ciKeywords.length}                   color="#E8A87C" />
          )}
          {ciKeywords.length > 0 && activeTab === 'apollo' && !loadingA && (
            <StatCard label="Apollo YES"   value={apolloTotalYes.toLocaleString()}     color="#15803d" />
          )}
          {ciKeywords.length > 0 && activeTab === 'ks' && !loadingK && (
            <StatCard label="LI YES"       value={ksTotalYes.toLocaleString()}         color="#15803d" />
          )}
          {(errorA || errorK) && (
            <p className="text-xs font-medium" style={{ color: "#E8A87C" }}>⚠ {errorA || errorK}</p>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1" style={{ borderBottom: "1px solid #D4EDE6" }}>
          {[
            { id: 'apollo', label: 'Apollo Leads',         count: apolloLeads.length },
            { id: 'ks',     label: 'LinkedIn Connections', count: ksLeads.length     },
          ].map(tab => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSelectedKw(null); }}
              className="px-5 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px flex items-center gap-2"
              style={activeTab === tab.id
                ? { borderColor: "#1A9E7A", color: "#0B4F43", backgroundColor: "#FFFFFF" }
                : { borderColor: "transparent", color: "#2E4057", backgroundColor: "transparent" }}>
              {tab.label}
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                style={{
                  backgroundColor: activeTab === tab.id ? '#CCF2E8' : '#E8F4F9',
                  color:           activeTab === tab.id ? '#0B4F43' : '#2E4057',
                }}>
                {(loadingA || loadingK) ? '…' : tab.count.toLocaleString()}
              </span>
            </button>
          ))}
        </div>

        {/* ════════════════  APOLLO TAB  ════════════════ */}
        {activeTab === 'apollo' && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <SectionCard title="Industry Distribution" subtitle="Source: Apollo CSV" accent="#1A9E7A"
                badge={!loadingA && apolloIndustryData.length > 0 ? `${apolloIndustryData.length} industries` : undefined}
                rawData={!loadingA && apolloIndustryData.length > 0 ? <DataTable columns={INDUSTRY_COLS} rows={mkIndustryRows(apolloIndustryData, apolloLeads.length)} /> : null}
                stat={!loadingA && apolloIndustryData[0] ? <StatLine total={apolloLeads.length} unit="Apollo leads" highlight={apolloIndustryData[0].count} verb="are" label={apolloIndustryData[0].name} color="#1A9E7A" /> : null}>
                {loadingA ? <ChartSkeleton /> : apolloIndustryData.length === 0 ? <EmptyState icon="🏭" title="No industry data" hint="Industry fields may be empty in the Apollo CSV" /> : <ChartRenderer data={apolloIndustryData} variant="industry" />}
              </SectionCard>

              <SectionCard title="Keywords Distribution" subtitle="Source: Apollo CSV keyword fields — Top 20" accent="#E8A87C"
                badge={!loadingA && apolloCsvKeywordsData.length > 0 ? `top ${apolloCsvKeywordsData.length}` : undefined}
                rawData={!loadingA && apolloCsvKeywordsData.length > 0 ? <DataTable columns={KEYWORD_COLS} rows={mkKeywordRows(apolloCsvKeywordsData, apolloLeads.length)} /> : null}
                stat={!loadingA && apolloCsvKeywordsData[0] ? <StatLine total={apolloLeads.length} unit="Apollo leads" highlight={apolloCsvKeywordsData[0].count} verb="have" label={apolloCsvKeywordsData[0].name} color="#E8A87C" /> : null}>
                {loadingA ? <ChartSkeleton /> : apolloCsvKeywordsData.length === 0 ? <EmptyState icon="🔑" title="No keywords found" hint="Apollo CSV keyword fields appear empty" /> : <ChartRenderer data={apolloCsvKeywordsData} variant="keywords" />}
              </SectionCard>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {renderIndustryCIMatch(apolloLeads, apolloIndustryMatchData, apolloTotalYes, loadingA, '#1A9E7A')}
              {renderKeywordMatch(apolloLeads, apolloKeywordMatchData, loadingA, '#E8A87C')}
            </div>
          </>
        )}

        {/* ════════════════  LINKEDIN TAB  ════════════════ */}
        {activeTab === 'ks' && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <SectionCard title="Industry Distribution" subtitle="Source: LinkedIn Connections CSV" accent="#1A9E7A"
                badge={!loadingK && ksIndustryData.length > 0 ? `${ksIndustryData.length} industries` : undefined}
                rawData={!loadingK && ksIndustryData.length > 0 ? <DataTable columns={INDUSTRY_COLS} rows={mkIndustryRows(ksIndustryData, ksLeads.length)} /> : null}
                stat={!loadingK && ksIndustryData[0] ? <StatLine total={ksLeads.length} unit="LinkedIn connections" highlight={ksIndustryData[0].count} verb="are" label={ksIndustryData[0].name} color="#1A9E7A" /> : null}>
                {loadingK ? <ChartSkeleton /> : ksIndustryData.length === 0 ? <EmptyState icon="🏭" title="No industry data" hint="Industry fields may be empty in the LinkedIn connections CSV" /> : <ChartRenderer data={ksIndustryData} variant="industry" />}
              </SectionCard>

              <SectionCard title="Skills Distribution" subtitle="Source: LinkedIn Connections — Top 10 skills" accent="#5DD4B0"
                badge={!loadingK && ksLeads.length > 0 ? `${ksLeads.length} connections` : undefined}
                rawData={!loadingK && ksSkillsData.length > 0 ? <DataTable columns={SKILLS_COLS} rows={mkSkillRows(ksSkillsData, ksLeads.length)} /> : null}
                stat={!loadingK && ksSkillsData[0] ? <StatLine total={ksLeads.length} unit="LinkedIn connections" highlight={ksSkillsData[0].count} verb="have" label={ksSkillsData[0].name} color="#5DD4B0" /> : null}>
                {loadingK ? <ChartSkeleton /> : ksSkillsData.length === 0 ? <EmptyState icon="💼" title="No skills data" hint="Skills fields may be empty in the LinkedIn connections CSV" /> : <ChartRenderer data={ksSkillsData} variant="skills" />}
              </SectionCard>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {renderIndustryCIMatch(ksLeads, ksIndustryMatchData, ksTotalYes, loadingK, '#1A9E7A')}
              {renderKeywordMatch(ksLeads, ksKeywordMatchData, loadingK, '#E8A87C')}
            </div>
          </>
        )}

        <div className="h-4" />
      </div>

      {selectedKw && (
        <DrilldownModal keyword={selectedKw} data={drilldownData} onClose={() => setSelectedKw(null)} />
      )}
    </div>
  );
};

export default AnalyticsDashboard;
