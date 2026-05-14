/**
 * ReportGeneratorPanel.jsx
 *
 * Async B2B AI Growth Strategy Report generator.
 *
 * Flow:
 *   1. POST /api/generate-report  → waits 10 s server-side
 *   2a. If done:       show full 13-section report
 *   2b. If processing: show "wait" or "email" options
 *       - Wait:  poll /api/report-status every 5 s until done
 *       - Email: POST /api/report-email/{job_id}
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppContext } from '../AppContext';
import { apiPost, apiGet } from '../api/client';

const ACCENT = '#1A9E7A';

// ── tiny UI atoms ──────────────────────────────────────────────────────────────

const Tag = ({ label, color = '#14B8A6' }) => (
  <span
    className="text-[10px] font-semibold px-2 py-0.5"
    style={{ backgroundColor: color + '18', color, borderRadius: '999px' }}
  >
    {label}
  </span>
);

const Badge = ({ text, ok }) => (
  <span className={`text-[10px] font-bold px-1.5 py-0.5 ${
    ok ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
  }`} style={{ borderRadius: '999px' }}>
    {ok ? '✓' : '○'} {text}
  </span>
);

const SectionHeader = ({ icon, title, count }) => (
  <div className="flex items-center gap-2 mb-3">
    <span className="text-base">{icon}</span>
    <p className="text-sm font-bold text-gray-800">{title}</p>
    {count != null && (
      <span className="ml-auto text-[10px] text-gray-400">{count} items</span>
    )}
  </div>
);

const Card = ({ children, className = '' }) => (
  <div
    className={`p-4 ${className}`}
    style={{ borderRadius: '16px', boxShadow: '0 4px 16px rgba(0,0,0,0.06)', backgroundColor: '#FFFFFF' }}
  >
    {children}
  </div>
);

const KV = ({ label, value }) => value ? (
  <div className="mb-1.5">
    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label} </span>
    <span className="text-xs text-gray-800">{value}</span>
  </div>
) : null;

// ── Progress bar ───────────────────────────────────────────────────────────────

const ProgressBar = ({ pct, label }) => (
  <div className="space-y-1">
    <div className="flex justify-between text-xs text-gray-500">
      <span>{label}</span><span>{pct}%</span>
    </div>
    <div className="h-2 overflow-hidden" style={{ borderRadius: '999px', backgroundColor: '#D4EDE6' }}>
      <div
        className="h-full transition-all duration-700"
        style={{ width: `${pct}%`, backgroundColor: ACCENT, borderRadius: '999px' }}
      />
    </div>
  </div>
);

// ── Section renderers ──────────────────────────────────────────────────────────

const MarketSizingSection = ({ data }) => {
  if (!data || data._error) return <p className="text-xs text-red-500">{data?._error || 'Unavailable'}</p>;
  const renderSide = (label, side) => (
    <div>
      <p className="text-xs font-bold text-gray-600 mb-2">{label}</p>
      {['tam','sam','som'].map(k => (
        <div key={k} className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold uppercase text-gray-400 w-7">{k}</span>
          <span className="text-xs font-bold text-gray-800">{side?.[k]?.value || '—'}</span>
          <span className="text-[10px] text-gray-400">{side?.[k]?.volume}</span>
        </div>
      ))}
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {renderSide('🇮🇳 India', data.india)}
        {renderSide('🇺🇸 United States', data.us)}
      </div>
      {data.industry_breakdown?.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Industry Breakdown</p>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-[10px] text-gray-400 uppercase">
                <th className="pb-1 pr-3">Industry</th><th className="pb-1 pr-3">Market Value</th>
                <th className="pb-1 pr-3">Growth</th><th className="pb-1">Key Driver</th>
              </tr></thead>
              <tbody>{data.industry_breakdown.map((r, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-1 pr-3 font-medium">{r.industry}</td>
                  <td className="py-1 pr-3 font-bold" style={{ color: "#0B4F43" }}>{r.market_value}</td>
                  <td className="py-1 pr-3 text-green-600">{r.growth_rate}</td>
                  <td className="py-1 text-gray-500">{r.key_driver}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
      {data.key_insight && (
        <p className="text-xs text-gray-600 italic pl-3" style={{ borderLeft: "2px solid #2DD4BF" }}>{data.key_insight}</p>
      )}
      {data.disclaimer && (
        <p className="text-[10px] text-gray-400 italic">{data.disclaimer}</p>
      )}
    </div>
  );
};

const CompanyOverviewSection = ({ data }) => {
  if (!data || data._error) return <p className="text-xs text-red-500">{data?._error || 'Unavailable'}</p>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-700 leading-relaxed">{data.overview}</p>
      <KV label="Value Proposition" value={data.value_proposition} />
      {data.differentiation?.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Differentiation</p>
          <ul className="space-y-1">{data.differentiation.map((d,i) => (
            <li key={i} className="text-xs text-gray-700 flex gap-2"><span style={{ color: "#2DD4BF" }}>▸</span>{d}</li>
          ))}</ul>
        </div>
      )}
      {data.usp && (
        <div className="grid grid-cols-2 gap-3">
          <div className="p-2.5" style={{ borderRadius: '12px', backgroundColor: '#fff7ed' }}>
            <p className="text-[10px] font-bold text-orange-600 mb-1">🇮🇳 India USP</p>
            <p className="text-xs text-gray-700">{data.usp.india}</p>
          </div>
          <div className="p-2.5" style={{ borderRadius: '12px', backgroundColor: '#eff6ff' }}>
            <p className="text-[10px] font-bold text-blue-600 mb-1">🇺🇸 US USP</p>
            <p className="text-xs text-gray-700">{data.usp.us}</p>
          </div>
        </div>
      )}
      {data.brand_positioning && (
        <div className="p-3" style={{ borderRadius: '12px', backgroundColor: '#CCF2E8' }}>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#0B4F43" }}>Brand Positioning</p>
          <p className="text-xs font-semibold text-gray-800 mb-1">{data.brand_positioning.statement}</p>
          <p className="text-[10px] text-gray-500">Tone: {data.brand_positioning.tone} · Moat: {data.brand_positioning.competitive_moat}</p>
        </div>
      )}
      {data.service_portfolio?.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Service Portfolio</p>
          <div className="space-y-1.5">{data.service_portfolio.map((s,i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-[10px] font-bold mt-0.5 w-4" style={{ color: "#2DD4BF" }}>{i+1}.</span>
              <div><p className="text-xs font-semibold text-gray-800">{s.name}</p>
              <p className="text-[10px] text-gray-500">{s.description} · {s.target_buyer}</p></div>
            </div>
          ))}</div>
        </div>
      )}
    </div>
  );
};

const CustomerGeoSection = ({ data }) => {
  if (!data || data._error) return <p className="text-xs text-red-500">{data?._error || 'Unavailable'}</p>;
  return (
    <div className="space-y-3">
      {data.primary_markets?.map((m, i) => (
        <div key={i} className="p-3 bg-white" style={{ borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <p className="text-xs font-bold text-gray-800 mb-2">{m.country === 'India' ? '🇮🇳' : '🇺🇸'} {m.country}</p>
          <div className="flex gap-4 mb-2">
            {['tam','sam','som'].map(k => (
              <div key={k} className="text-center">
                <p className="text-[10px] font-bold text-gray-400 uppercase">{k}</p>
                <p className="text-xs font-bold" style={{ color: "#0B4F43" }}>{m[k] || '—'}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1 mb-1.5">
            {(m.focus_cities || m.focus_states || []).map((c,j) => <Tag key={j} label={c} color="#0B4F43" />)}
          </div>
          <p className="text-[10px] text-gray-500">{m.entry_rationale}</p>
        </div>
      ))}
      {data.expansion_sequence?.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Expansion Sequence</p>
          <div className="flex gap-2">{data.expansion_sequence.map((s,i) => (
            <div key={i} className="flex-1 p-2 text-center" style={{ borderRadius: '10px', backgroundColor: "#CCF2E8" }}>
              <p className="text-[10px] font-bold" style={{ color: "#0B4F43" }}>Phase {s.phase || i+1}</p>
              <p className="text-xs font-semibold text-gray-800">{s.market || s}</p>
              {s.timeline && <p className="text-[10px] text-gray-400">{s.timeline}</p>}
            </div>
          ))}</div>
        </div>
      )}
    </div>
  );
};

const MarketInsightsSection = ({ data }) => {
  if (!data || data._error) return <p className="text-xs text-red-500">{data?._error || 'Unavailable'}</p>;
  const insights = data.insights || [];
  return (
    <div className="grid grid-cols-2 gap-3">
      {insights.map((ins, i) => (
        <div key={i} className="p-3 bg-white" style={{ borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div className="flex items-center gap-2 mb-1.5">
            <Tag label={ins.geo} color={ins.geo === 'India' ? '#d97706' : ins.geo === 'US' ? '#2563eb' : '#6b7280'} />
          </div>
          <p className="text-xs font-bold text-gray-800 mb-1">{ins.title}</p>
          <p className="text-[11px] text-gray-600 mb-1.5">{ins.body}</p>
          {ins.implication && (
            <p className="text-[10px] italic" style={{ color: "#0B4F43" }}>→ {ins.implication}</p>
          )}
        </div>
      ))}
    </div>
  );
};

const ICPSection = ({ data }) => {
  if (!data || data._error) return <p className="text-xs text-red-500">{data?._error || 'Unavailable'}</p>;
  return (
    <div className="space-y-4">
      {data.profiles?.map((p, i) => (
        <div key={i} className="p-3 bg-white" style={{ borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-5 h-5 flex items-center justify-center text-[10px] font-bold text-white" style={{ borderRadius: '50%', backgroundColor: ACCENT }}>{p.id}</span>
            <p className="text-xs font-bold text-gray-800">{p.segment}</p>
            <Tag label={p.industry} />
          </div>
          <div className="flex gap-4 mb-2 text-[10px] text-gray-500">
            <span>👥 {p.company_size}</span>
            <span>💰 {p.revenue_band}</span>
            <span>🌍 {(p.geographies || []).join(', ')}</span>
          </div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Pain Points</p>
          <ul className="space-y-0.5">
            {(p.pain_points || []).map((pp, j) => (
              <li key={j} className="text-[11px] text-gray-600 flex gap-1.5">
                <span className="text-red-300 mt-0.5">•</span>{pp}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {data.company_size_table?.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Company Size Fit</p>
          <table className="w-full text-xs">
            <thead><tr className="text-[10px] text-gray-400 uppercase text-left">
              <th className="pb-1 pr-2">Segment</th><th className="pb-1 pr-2">Employees</th>
              <th className="pb-1 pr-2">Revenue</th><th className="pb-1">Fit</th>
            </tr></thead>
            <tbody>{data.company_size_table.map((r,i) => (
              <tr key={i} className="border-b border-gray-50">
                <td className="py-1 pr-2 font-medium">{r.size}</td>
                <td className="py-1 pr-2 text-gray-500">{r.employees}</td>
                <td className="py-1 pr-2 text-gray-500">{r.revenue}</td>
                <td className="py-1">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 ${
                    r.fit==='High' ? 'bg-green-100 text-green-700' :
                    r.fit==='Medium' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-500'}`} style={{ borderRadius: '999px' }}>{r.fit}</span>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const MarketIntelSection = ({ data }) => {
  if (!data || data._error) return <p className="text-xs text-red-500">{data?._error || 'Unavailable'}</p>;
  return (
    <div className="space-y-4">
      {data.seo_clusters?.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">SEO / AEO / GEO Clusters</p>
          <div className="space-y-2">{data.seo_clusters.map((c,i) => (
            <div key={i} className="p-2.5 bg-white" style={{ borderRadius: '10px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
              <div className="flex items-center gap-2 mb-1.5">
                <p className="text-xs font-bold text-gray-800">{c.cluster_name}</p>
                <Tag label={c.country} color="#2563eb" />
                <Tag label={c.search_intent} color={ACCENT} />
              </div>
              <div className="flex flex-wrap gap-1">
                {(c.keywords||[]).map((kw,j) => <Tag key={j} label={kw} color="#6b7280" />)}
              </div>
            </div>
          ))}</div>
        </div>
      )}
      {data.content_topics?.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Content Topics</p>
          <div className="space-y-1.5">{data.content_topics.map((t,i) => (
            <div key={i} className="flex items-start gap-2 p-2 bg-white" style={{ borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <Tag label={t.format || 'blog'} color={ACCENT} />
              <div><p className="text-xs font-semibold text-gray-800">{t.title}</p>
              <p className="text-[10px] text-gray-500">{t.angle}</p></div>
            </div>
          ))}</div>
        </div>
      )}
    </div>
  );
};

const CompetitiveSection = ({ data }) => {
  if (!data || data._error) return <p className="text-xs text-red-500">{data?._error || 'Unavailable'}</p>;
  return (
    <div className="space-y-3">
      {data.competitive_summary && (
        <p className="text-xs text-gray-600 italic pl-3" style={{ borderLeft: "2px solid #2DD4BF" }}>{data.competitive_summary}</p>
      )}
      {data.competitors?.map((c,i) => (
        <div key={i} className="p-3 bg-white" style={{ borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-gray-400 w-4">{i+1}.</span>
            <p className="text-xs font-bold text-gray-800">{c.name}</p>
            <Tag label={c.ai_capability || 'N/A'} color={c.ai_capability==='advanced' ? '#16a34a' : c.ai_capability==='intermediate' ? '#d97706' : '#6b7280'} />
            <Tag label={`Threat: ${c.threat_level}`} color={c.threat_level==='high' ? '#dc2626' : c.threat_level==='medium' ? '#d97706' : '#6b7280'} />
          </div>
          <p className="text-[10px] text-gray-500 mb-1.5">Tech: {c.tech_maturity} · Pricing: {c.pricing_model}</p>
          <div className="grid grid-cols-2 gap-2 mb-1.5">
            <div><p className="text-[10px] font-bold text-green-600 mb-0.5">Pros</p>
              {(c.pros||[]).map((p,j) => <p key={j} className="text-[11px] text-gray-600">+ {p}</p>)}</div>
            <div><p className="text-[10px] font-bold text-red-500 mb-0.5">Cons</p>
              {(c.cons||[]).map((p,j) => <p key={j} className="text-[11px] text-gray-600">- {p}</p>)}</div>
          </div>
          {c.recent_signal && (
            <p className="text-[10px] text-blue-600 italic">📰 {c.recent_signal}</p>
          )}
        </div>
      ))}
    </div>
  );
};

const ExecutiveSection = ({ data }) => {
  if (!data || data._error) return <p className="text-xs text-red-500">{data?._error || 'Unavailable'}</p>;
  return (
    <div className="space-y-4">
      {data.executive_summary && (
        <p className="text-sm text-gray-700 leading-relaxed">{data.executive_summary}</p>
      )}
      {data.top_recommendations?.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Top 3 Recommendations</p>
          <div className="space-y-2">{data.top_recommendations.map((r,i) => (
            <div key={i} className="p-3" style={{ borderRadius: '12px', backgroundColor: "#CCF2E8" }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-5 h-5 flex items-center justify-center text-[10px] font-bold text-white" style={{ borderRadius: '50%', backgroundColor: ACCENT }}>{r.rank}</span>
                <p className="text-xs font-bold text-gray-800">{r.recommendation}</p>
                <Tag label={r.timeline} color="#6b7280" />
                {r.impact && <Tag label={r.impact} color={r.impact==='High' ? '#16a34a' : '#d97706'} />}
              </div>
              <p className="text-[11px] text-gray-600 pl-7">{r.rationale}</p>
            </div>
          ))}</div>
        </div>
      )}
      {data.competitive_imperatives?.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Top 3 Competitive Imperatives</p>
          <div className="space-y-2">{data.competitive_imperatives.map((c,i) => (
            <div key={i} className="p-3" style={{ borderRadius: '12px', backgroundColor: '#fff7ed' }}>
              <p className="text-xs font-bold text-gray-800 mb-1">{c.imperative}</p>
              <p className="text-[11px] text-gray-600 mb-1">{c.why_critical}</p>
              <p className="text-[10px] text-orange-600">KPI: {c.kpi}</p>
            </div>
          ))}</div>
        </div>
      )}
    </div>
  );
};

const ExpansionSection = ({ data }) => {
  if (!data || data._error) return <p className="text-xs text-red-500">{data?._error || 'Unavailable'}</p>;
  return (
    <div className="space-y-4">
      {data.pmf_analysis?.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">PMF Analysis</p>
          <div className="grid grid-cols-3 gap-2">{data.pmf_analysis.map((m,i) => (
            <div key={i} className="p-2.5 bg-white text-center" style={{ borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <p className="text-xs font-bold text-gray-800">{m.market}</p>
              <p className="text-[10px] font-semibold my-1" style={{ color: "#0B4F43" }}>{m.pmf_stage}</p>
              <p className="text-[10px] font-bold text-gray-700">Score: {m.readiness_score}/10</p>
              <p className="text-[10px] text-gray-400 mt-1">{m.evidence}</p>
            </div>
          ))}</div>
        </div>
      )}
      {data.expansion_plan?.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Expansion Plan</p>
          <div className="space-y-2">{data.expansion_plan.map((p,i) => (
            <div key={i} className="p-3 bg-white" style={{ borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div className="flex items-center gap-2 mb-1">
                <Tag label={p.phase} color={ACCENT} />
                <p className="text-xs font-bold text-gray-800">{p.market}</p>
                <span className="text-[10px] text-gray-400 ml-auto">{p.timeline}</span>
              </div>
              <p className="text-[11px] text-gray-600">{p.entry_strategy}</p>
              <p className="text-[10px] text-gray-400 mt-1">Target: {p.target_segment} · KPI: {p.success_metric}</p>
            </div>
          ))}</div>
        </div>
      )}
    </div>
  );
};

const SalesSection = ({ data }) => {
  if (!data || data._error) return <p className="text-xs text-red-500">{data?._error || 'Unavailable'}</p>;
  return (
    <div className="space-y-4">
      {data.sales_cycle_matrix?.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Sales Cycle Matrix</p>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-[10px] text-gray-400 uppercase text-left">
                <th className="pb-1 pr-2">Industry</th><th className="pb-1 pr-2">Country</th>
                <th className="pb-1 pr-2">Cycle</th><th className="pb-1 pr-2">Deal Size</th>
                <th className="pb-1">Priority</th>
              </tr></thead>
              <tbody>{data.sales_cycle_matrix.map((r,i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-1 pr-2 font-medium">{r.industry}</td>
                  <td className="py-1 pr-2">{r.country}</td>
                  <td className="py-1 pr-2 text-gray-500">{r.avg_cycle_days}</td>
                  <td className="py-1 pr-2 font-bold" style={{ color: "#0B4F43" }}>{r.avg_deal_size}</td>
                  <td className="py-1">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 ${
                      r.priority==='P1' ? 'bg-red-100 text-red-700' :
                      r.priority==='P2' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-500'}`} style={{ borderRadius: '999px' }}>{r.priority}</span>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
      {data.deal_size_analysis && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Deal Size by Segment</p>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(data.deal_size_analysis).map(([seg, info]) => (
              <div key={seg} className="p-2.5 bg-white" style={{ borderRadius: '10px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
                <p className="text-[10px] font-bold text-gray-500 uppercase">{seg.replace('_', ' ')}</p>
                <p className="text-xs font-bold my-0.5" style={{ color: "#0B4F43" }}>{info.range}</p>
                <p className="text-[10px] text-gray-400">{info.avg_cycle}</p>
                <Tag label={info.volume_potential} color={info.volume_potential==='high' ? '#16a34a' : info.volume_potential==='medium' ? '#d97706' : '#6b7280'} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const CompetitionStratSection = ({ data }) => {
  if (!data || data._error) return <p className="text-xs text-red-500">{data?._error || 'Unavailable'}</p>;
  return (
    <div className="space-y-4">
      {data.investment_areas && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Investment Areas</p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(data.investment_areas).map(([area, info]) => (
              <div key={area} className="p-2.5 bg-white" style={{ borderRadius: '10px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs font-bold text-gray-800 capitalize">{area.replace(/_/g,' ')}</p>
                  <Tag label={info.priority} color={info.priority==='High' ? '#dc2626' : info.priority==='Medium' ? '#d97706' : '#6b7280'} />
                  <span className="ml-auto text-[10px] font-bold" style={{ color: "#0B4F43" }}>{info.budget_split}</span>
                </div>
                {info.tactics?.map((t,i) => <p key={i} className="text-[10px] text-gray-500">• {t}</p>)}
              </div>
            ))}
          </div>
        </div>
      )}
      {data.takeout_strategy?.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Take-out Strategy</p>
          <div className="space-y-2">{data.takeout_strategy.map((t,i) => (
            <div key={i} className="p-2.5 bg-white" style={{ borderRadius: '10px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs font-bold text-gray-800">{t.competitor}</p>
                <Tag label={t.timeline} color="#6b7280" />
              </div>
              <p className="text-[11px] text-gray-600">{t.displacement_tactic}</p>
              <p className="text-[10px] text-green-600 mt-0.5">✓ {t.win_condition}</p>
            </div>
          ))}</div>
        </div>
      )}
    </div>
  );
};

const InvestmentTriggersSection = ({ data }) => {
  if (!data || data._error) return <p className="text-xs text-red-500">{data?._error || 'Unavailable'}</p>;
  const CAT_COLOR = {
    'Funding': '#16a34a', 'Technology Upgrade': '#2563eb',
    'Data Infrastructure': '#0D9488', 'Market Shift': '#d97706', 'Regulation': '#dc2626',
  };
  return (
    <div className="space-y-2">
      {(data.triggers || []).map((t,i) => (
        <div key={i} className="p-3 bg-white" style={{ borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div className="flex items-start gap-3">
            <span className="text-xs font-bold text-gray-300 w-5 shrink-0 mt-0.5">{t.id}.</span>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Tag label={t.category} color={CAT_COLOR[t.category] || '#6b7280'} />
                <Tag label={t.urgency} color={t.urgency==='immediate' ? '#dc2626' : t.urgency==='watch' ? '#d97706' : '#6b7280'} />
              </div>
              <p className="text-xs font-semibold text-gray-800 mb-1">{t.trigger}</p>
              <p className="text-[10px] text-gray-500 mb-0.5">{t.what_it_means}</p>
              <p className="text-[10px]" style={{ color: "#0B4F43" }}>→ {t.recommended_action}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Full report display ────────────────────────────────────────────────────────

const SECTIONS = [
  { key: 'market_sizing',            icon: '📊', title: '1. Market Sizing',                  Comp: MarketSizingSection },
  { key: 'company_overview',         icon: '🏢', title: '2. Company Overview & Brand',        Comp: CompanyOverviewSection },
  { key: 'customer_geography',       icon: '🌍', title: '3. Customer Geography',               Comp: CustomerGeoSection },
  { key: 'market_insights',          icon: '💡', title: '4. Market Insights',                 Comp: MarketInsightsSection },
  { key: 'icp',                      icon: '🎯', title: '5. Ideal Customer Profile',          Comp: ICPSection },
  { key: 'market_intelligence',      icon: '🔍', title: '6. Market Intelligence (SEO/AEO)',   Comp: MarketIntelSection },
  { key: 'competitive_intelligence', icon: '⚔️',  title: '7. Competitive Intelligence',       Comp: CompetitiveSection },
  { key: 'executive_strategy',       icon: '👔', title: '8. Executive Strategy',              Comp: ExecutiveSection },
  { key: 'expansion_strategy',       icon: '🚀', title: '9. Market Expansion Strategy',       Comp: ExpansionSection },
  { key: 'sales_strategy',           icon: '💼', title: '10. Sales Strategy',                 Comp: SalesSection },
  { key: 'competition_strategy',     icon: '🛡️',  title: '11. Competition Strategy',          Comp: CompetitionStratSection },
  { key: 'investment_triggers',      icon: '⚡', title: '12. Investment Triggers',            Comp: InvestmentTriggersSection },
];

const ReportDisplay = ({ report }) => {
  const [open, setOpen] = useState(() => new Set(['executive_strategy']));
  const meta = report._meta || {};

  const toggle = (key) => setOpen(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  return (
    <div className="space-y-4">
      {/* ── PRIMARY GRADIENT PANEL — report header ── */}
      <div
        style={{
          background: "linear-gradient(135deg, #0B4F43, #1A9E7A)",
          color: "white",
          borderRadius: "16px",
          padding: "24px",
        }}
      >
        <p className="text-base font-bold">{meta.company} — AI Growth Strategy Report</p>
        <p className="text-xs mt-0.5" style={{ color: "#CCFBF1" }}>Industry: {meta.industry} · Generated: {meta.generated_at?.slice(0,10)}</p>
        <p className="text-[10px] mt-1" style={{ color: "#A7F3D0" }}>{SECTIONS.length} sections · AI-powered via {meta.model}</p>
      </div>

      {/* Section accordion — shadow cards, no borders */}
      {SECTIONS.map(({ key, icon, title, Comp }) => {
        const data = report[key];
        const isOpen = open.has(key);
        const hasError = data?._error;
        return (
          <div
            key={key}
            style={{
              borderRadius: "16px",
              overflow: "hidden",
              boxShadow: isOpen ? "0 8px 24px rgba(0,0,0,0.08)" : "0 4px 12px rgba(0,0,0,0.05)",
            }}
          >
            <button
              className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
              style={{ backgroundColor: isOpen ? '#CCF2E8' : '#FFFFFF' }}
              onMouseEnter={e => { if (!isOpen) e.currentTarget.style.backgroundColor = '#CCF2E8'; }}
              onMouseLeave={e => { if (!isOpen) e.currentTarget.style.backgroundColor = '#FFFFFF'; }}
              onClick={() => toggle(key)}
            >
              <span className="text-base">{icon}</span>
              <span className="text-sm font-semibold text-gray-800 flex-1">{title}</span>
              {hasError && <Tag label="error" color="#dc2626" />}
              <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && (
              <div className="px-4 pb-4 pt-3" style={{ backgroundColor: '#FFFFFF' }}>
                <Comp data={data} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ── Main panel ─────────────────────────────────────────────────────────────────

const ReportGeneratorPanel = ({ financialData = null }) => {
  const { ciData, ciUrl, miData } = useAppContext();

  const [phase, setPhase]         = useState('idle');
  const [progress, setProgress]   = useState(0);
  const [jobId, setJobId]         = useState(null);
  const [report, setReport]       = useState(null);
  const [error, setError]         = useState('');
  const [email, setEmail]         = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [waitChosen, setWaitChosen] = useState(false);
  const pollRef = useRef(null);

  const hasCI = !!ciData;
  const hasMI = !!miData;
  const canGen = hasCI;

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => () => stopPoll(), [stopPoll]);

  const startPolling = useCallback((jid) => {
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const job = await apiGet(`/api/report-status/${jid}`);
        setProgress(job.progress || 0);
        if (job.status === 'done') {
          stopPoll();
          setReport(job.result);
          setPhase('done');
        } else if (job.status === 'error') {
          stopPoll();
          setError(job.error || 'Report generation failed.');
          setPhase('error');
        }
      } catch {
        // keep polling
      }
    }, 5000);
  }, [stopPoll]);

  const handleGenerate = async () => {
    if (!canGen) return;
    setPhase('generating');
    setProgress(0);
    setError('');
    setReport(null);
    setJobId(null);
    setEmailSent(false);
    setWaitChosen(false);

    try {
      const res = await apiPost('/api/generate-report', {
        company_url: ciUrl || ciData?.company_url || '',
      });

      if (res.status === 'done') {
        setReport(res.result);
        setPhase('done');
      } else if (res.status === 'processing') {
        setJobId(res.job_id);
        setProgress(res.progress || 0);
        setPhase('processing');
      } else {
        setError('Unexpected response from server.');
        setPhase('error');
      }
    } catch (e) {
      setError(e.message || 'Failed to start report generation.');
      setPhase('error');
    }
  };

  const handleWait = () => {
    setWaitChosen(true);
    if (jobId) startPolling(jobId);
  };

  const handleEmailSubmit = async () => {
    if (!email || !jobId) return;
    try {
      await apiPost(`/api/report-email/${jobId}`, { email });
      setEmailSent(true);
    } catch (e) {
      setError(e.message || 'Failed to register email.');
    }
  };

  const handleReset = () => {
    stopPoll();
    setPhase('idle');
    setProgress(0);
    setJobId(null);
    setReport(null);
    setError('');
    setEmail('');
    setEmailSent(false);
    setWaitChosen(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (phase === 'done' && report) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-green-600 font-bold">✓</span>
            <span className="text-sm font-semibold text-gray-800">Report Generated</span>
          </div>
          <button
            onClick={handleReset}
            className="text-xs px-3 py-1.5 transition-all"
            style={{ borderRadius: "10px", color: "#475569", backgroundColor: "#F8FAFC", boxShadow: "0 2px 6px rgba(0,0,0,0.08)" }}
          >
            ↺ Regenerate
          </button>
        </div>
        <ReportDisplay report={report} />
      </div>
    );
  }

  return (
    <div style={{ borderRadius: "16px", overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }}>

      {/* Header — gradient panel */}
      <div
        className="px-5 py-4 flex items-center gap-3"
        style={{ background: `linear-gradient(135deg, #0F766E 0%, #14B8A6 100%)` }}
      >
        <span className="text-2xl">📄</span>
        <div>
          <p className="text-sm font-bold text-white">Generate AI Growth Strategy Report</p>
          <p className="text-[11px] mt-0.5" style={{ color: "#CCFBF1" }}>13-section B2B report · 3-wave parallel generation</p>
        </div>
        <span className="ml-auto text-[10px] font-semibold px-2 py-1 text-white" style={{ backgroundColor: "rgba(255,255,255,0.20)", borderRadius: "999px" }}>
          AI Growth Strategist
        </span>
      </div>

      <div className="bg-white px-5 py-5 space-y-5">

        {/* Data status */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Data Status</p>
          <div className="flex gap-4">
            <Badge ok={hasCI} text={`Company Intelligence${hasCI ? ` — ${ciData?.industry || 'Loaded'}` : ' — not loaded'}`} />
            <Badge ok={hasMI} text={`Market Intelligence${hasMI ? ' — Loaded' : ' — not loaded'}`} />
          </div>
        </div>

        {/* CI required warning */}
        {!hasCI && (
          <div className="px-3.5 py-2.5" style={{ borderRadius: "12px", backgroundColor: "#fffbeb" }}>
            <p className="text-xs text-amber-800 font-medium">
              Company Intelligence is required. Please run Company Intelligence first.
            </p>
          </div>
        )}

        {/* Error */}
        {phase === 'error' && error && (
          <div className="px-3.5 py-2.5" style={{ borderRadius: "12px", backgroundColor: "#fef2f2" }}>
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {/* Generating spinner */}
        {phase === 'generating' && (
          <div className="py-4 space-y-3">
            <ProgressBar pct={5} label="Starting report generation…" />
            <p className="text-xs text-gray-500 text-center">Waiting up to 10 seconds for fast completion…</p>
          </div>
        )}

        {/* Processing — show options */}
        {phase === 'processing' && !waitChosen && !emailSent && (
          <div className="p-4 space-y-3" style={{ borderRadius: "16px", backgroundColor: "#CCF2E8", boxShadow: "0 4px 12px rgba(20,184,166,0.10)" }}>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 animate-pulse" style={{ borderRadius: "50%", backgroundColor: ACCENT }} />
              <p className="text-sm font-semibold" style={{ color: "#0B4F43" }}>
                Your report is being generated. This may take 10–20 minutes.
              </p>
            </div>
            <ProgressBar pct={progress || 5} label="Generating 12 sections in parallel waves…" />
            <p className="text-xs text-gray-500">
              3-wave parallel execution: independent sections run simultaneously, dependent sections use prior results.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleWait}
                className="py-2.5 text-sm font-bold text-white hover:brightness-105 active:scale-95 transition-all"
                style={{ backgroundColor: ACCENT, borderRadius: "10px", boxShadow: "0 4px 12px rgba(20,184,166,0.30)" }}
              >
                1. Wait &amp; Poll
              </button>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="flex-1 text-xs px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-teal-300"
                    style={{ borderRadius: "8px", backgroundColor: "#F8FAFC", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}
                  />
                  <button
                    onClick={handleEmailSubmit}
                    disabled={!email}
                    className="px-3 py-2 text-xs font-bold transition-all disabled:opacity-40"
                    style={{ color: ACCENT, backgroundColor: '#E0F7F4', borderRadius: "8px", boxShadow: "0 2px 6px rgba(20,184,166,0.15)" }}
                  >
                    2. Notify
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Waiting with live progress bar */}
        {phase === 'processing' && waitChosen && (
          <div className="py-3 space-y-3">
            <ProgressBar pct={progress} label="Generating report…" />
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'Wave 1', desc: 'Market sizing, CI, Competitive', done: progress >= 35 },
                { label: 'Wave 2', desc: 'ICP, Geography, SEO, Executive', done: progress >= 70 },
                { label: 'Wave 3', desc: 'Expansion, Sales strategy',       done: progress >= 100 },
              ].map((w,i) => (
                <div key={i} className="p-2 text-center" style={{
                  borderRadius: "10px",
                  backgroundColor: w.done ? '#f0fdf4' : '#f9fafb',
                  boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
                }}>
                  <p className={`text-[10px] font-bold ${w.done ? 'text-green-600' : 'text-gray-400'}`}>{w.done ? '✓' : '⏳'} {w.label}</p>
                  <p className="text-[9px] text-gray-400 mt-0.5">{w.desc}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 text-center">Polling every 5 seconds…</p>
          </div>
        )}

        {/* Email registered confirmation */}
        {emailSent && (
          <div className="px-3.5 py-2.5" style={{ borderRadius: "12px", backgroundColor: "#f0fdf4" }}>
            <p className="text-xs text-green-700 font-medium">
              ✓ We'll email <strong>{email}</strong> when your report is ready. You can close this window.
            </p>
          </div>
        )}

        {/* Generate button */}
        {(phase === 'idle' || phase === 'error') && (
          <button
            onClick={handleGenerate}
            disabled={!canGen}
            className="w-full flex items-center justify-center gap-2 py-3 text-sm font-bold text-white hover:brightness-105 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              backgroundColor: canGen ? ACCENT : '#9ca3af',
              borderRadius: "10px",
              boxShadow: canGen ? "0 4px 12px rgba(20,184,166,0.30)" : "none",
            }}
          >
            <span className="text-base">📄</span>
            Generate AI Growth Strategy Report
          </button>
        )}

        {/* Reset when processing */}
        {phase === 'processing' && (
          <button
            onClick={handleReset}
            className="w-full py-2 text-xs font-medium text-gray-500 transition-all"
            style={{ borderRadius: "10px", backgroundColor: "#F8FAFC", boxShadow: "0 2px 6px rgba(0,0,0,0.06)" }}
          >
            Cancel
          </button>
        )}

        {/* Sections preview */}
        {phase === 'idle' && (
          <div className="pt-3" style={{ borderTop: "1px solid #F1F5F9" }}>
            <p className="text-[9px] font-bold text-gray-300 uppercase tracking-widest mb-2">13 Sections Generated</p>
            <div className="flex flex-wrap gap-1.5">
              {[
                'Market Sizing', 'Company Overview', 'Brand Positioning',
                'Customer Geography', 'Market Insights', 'ICP',
                'Market Intelligence', 'Competitive Intel', 'Executive Strategy',
                'Expansion Strategy', 'Sales Strategy', 'Competition Strategy',
                'Investment Triggers',
              ].map(s => (
                <span key={s} className="text-[9px] px-2 py-0.5 font-medium"
                  style={{ backgroundColor: '#E0F7F4', color: ACCENT, borderRadius: '999px' }}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default ReportGeneratorPanel;
