/**
 * dataAggregator.js
 * Client-side aggregation utilities for the Analytics Dashboard.
 *
 * Data sources:
 *   apolloLeads  — from /api/linkedin-dashboard/leads (source="apollo")
 *   ksLeads      — from /api/linkedin-dashboard/leads (source="ks")
 *   ciKeywords   — from AppContext ciData.keywords
 */

// ── Internal helpers ──────────────────────────────────────────────────────────

function titleCase(str) {
  if (!str) return str;
  return String(str).replace(/\b\w/g, c => c.toUpperCase());
}

/** Extract a city-level label from a lead for the location drilldown.
 *  Prefers the company's city/country from the CSV (more meaningful than
 *  the lead's personal location, which shows nearly everyone in "India").
 */
function getLeadLocation(lead) {
  // Apollo leads: use company city + company country from CSV columns
  if (lead.company_city && lead.company_city.trim()) {
    const city    = lead.company_city.trim();
    const country = (lead.company_country || '').trim();
    return country ? `${city}, ${country}` : city;
  }

  // Apollo fallback: company_country alone
  if (lead.company_country && lead.company_country.trim()) {
    return lead.company_country.trim();
  }

  // KS leads: location is a string like "Mumbai, Maharashtra, India"
  // Use the city (first segment) + last segment (country) for clarity
  if (lead.location) {
    const parts = lead.location.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}, ${parts[parts.length - 1]}`;
    if (parts.length === 1) return parts[0];
  }

  return 'Unknown';
}

/** Extract a canonical industry label from a lead. */
function getLeadIndustry(lead) {
  return (lead.canonical_industry || lead.industry || 'Unknown').trim();
}

/**
 * Generic frequency counter.
 * keyFn(item) → string | string[]
 * Returns [{name, count}] sorted descending.
 */
function countBy(items, keyFn) {
  const counts = {};
  items.forEach(item => {
    const raw = keyFn(item);
    const keys = Array.isArray(raw) ? raw : [raw];
    keys.forEach(k => {
      if (k == null) return;
      const s = String(k).trim();
      if (s) counts[s] = (counts[s] || 0) + 1;
    });
  });
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/** Build a single text blob for a lead (used for keyword matching).
 *  Intentionally excludes csv_keywords (Apollo's 100+ keyword dump per lead)
 *  and skills, because including them inflates match rates to 100% for any
 *  generic industry term (e.g. "insurance"). Matching only against the lead's
 *  actual role context gives meaningful signal.
 */
function buildLeadText(lead) {
  return [
    lead.title,
    lead.company,
    lead.industry,
    lead.about,
    lead.departments,
    lead.sub_departments,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

// ── Client-side keyword matching ──────────────────────────────────────────────

/**
 * Returns true when ANY of the given CI keywords appear in the lead's text.
 * Used for dynamic Section E / F computation when ciData changes.
 */
export function isKeywordMatch(lead, ciKeywords) {
  if (!ciKeywords || ciKeywords.length === 0) return false;
  const text = buildLeadText(lead);
  return ciKeywords.some(kw => kw && text.includes(kw.trim().toLowerCase()));
}

// ── Section A ─────────────────────────────────────────────────────────────────

/**
 * Industry distribution from Apollo (or any) leads.
 * Returns [{name, count}] sorted descending.
 */
export function getIndustryDistribution(leads) {
  return countBy(leads, lead => titleCase(getLeadIndustry(lead)));
}

// ── Section B ─────────────────────────────────────────────────────────────────

/**
 * Top-10 skills from KS LinkedIn leads, sorted by frequency.
 * Returns [{name, count}].
 */
export function getSkillsDistribution(ksLeads) {
  const STOPWORDS = new Set(['and', 'the', 'of', 'in', 'to', 'for', 'a', 'an']);
  const all = countBy(ksLeads, lead => {
    if (!Array.isArray(lead.skills)) return [];
    // Deduplicate within this lead so one lead contributes at most 1 count per skill
    const seen = new Set();
    return lead.skills
      .map(s => titleCase(s?.trim()))
      .filter(s => {
        if (!s || s.length <= 2 || STOPWORDS.has(s.toLowerCase())) return false;
        if (seen.has(s)) return false;
        seen.add(s);
        return true;
      });
  });
  return all.slice(0, 10);
}

// ── Section C ─────────────────────────────────────────────────────────────────

/**
 * Top-N keywords from Apollo CSV keyword fields, sorted by frequency.
 * Strips generic short words. Returns [{name, count}].
 */
export function getKeywordsDistribution(apolloLeads, topN = 20) {
  const STOPWORDS = new Set([
    'and', 'the', 'for', 'with', 'this', 'that', 'from', 'are', 'not',
    'have', 'has', 'its', 'our', 'your', 'their', 'been', 'was', 'will',
  ]);
  const all = countBy(apolloLeads, lead => {
    if (!Array.isArray(lead.csv_keywords)) return [];
    // Deduplicate within this lead so one lead contributes at most 1 count per keyword.
    // Without this, case variants like "health" / "Health" / "HEALTH" in the same lead's
    // keyword list all collapse to "Health" after titleCase, inflating the count above
    // the total number of leads and producing percentages > 100%.
    const seen = new Set();
    return lead.csv_keywords
      .map(k => titleCase(k?.trim()))
      .filter(k => {
        if (!k || k.length <= 3 || STOPWORDS.has(k.toLowerCase())) return false;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  });
  return all.slice(0, topN);
}

// ── Section E ─────────────────────────────────────────────────────────────────

/**
 * Per-industry YES / NO keyword match breakdown.
 * Uses client-side matching so Section E re-renders whenever ciKeywords changes.
 *
 * Returns [{name, yes, no, total, yesPercent}] sorted by YES count descending.
 */
export function getIndustryYesMatch(leads, ciKeywords) {
  const map = {};
  leads.forEach(lead => {
    const industry = titleCase(getLeadIndustry(lead));
    if (!map[industry]) map[industry] = { yes: 0, no: 0 };
    if (isKeywordMatch(lead, ciKeywords)) map[industry].yes += 1;
    else map[industry].no += 1;
  });

  return Object.entries(map)
    .filter(([, v]) => v.yes + v.no > 0)
    .map(([name, { yes, no }]) => ({
      name,
      yes,
      no,
      total: yes + no,
      yesPercent: Math.round((yes / (yes + no)) * 100),
    }))
    .sort((a, b) => b.yes - a.yes);
}

// ── Section F — Part 1 ───────────────────────────────────────────────────────

/**
 * For each CI keyword, count how many leads match it.
 * Returns [{name, count}] sorted descending.
 */
export function getKeywordMatchCounts(leads, ciKeywords) {
  if (!ciKeywords || ciKeywords.length === 0) return [];
  return ciKeywords
    .map(keyword => {
      const kLower = keyword.trim().toLowerCase();
      const count = leads.filter(lead => buildLeadText(lead).includes(kLower)).length;
      return { name: keyword, count };
    })
    .sort((a, b) => b.count - a.count);
}

// ── Section F — Part 2 (Drilldown) ───────────────────────────────────────────

/**
 * Location distribution of leads that match a specific CI keyword.
 * Returns [{name, count}] sorted descending.
 */
export function getKeywordLocationDrilldown(leads, keyword) {
  if (!keyword) return [];
  const kLower = keyword.trim().toLowerCase();
  const matched = leads.filter(lead => buildLeadText(lead).includes(kLower));
  return countBy(matched, lead => getLeadLocation(lead));
}
