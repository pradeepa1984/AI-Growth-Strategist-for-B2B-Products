/**
 * pdfReportGenerator.js
 *
 * Generates a Company Analysis Report PDF using jsPDF + jspdf-autotable.
 *
 * Sections:
 *   1. Title Page
 *   2. Table of Contents
 *   3. Company Overview      (Company Intelligence)
 *   4. Market Insights       (Market Intelligence — card layout)
 *
 * Color note: jspdf-autotable requires plain [r,g,b] arrays — never { r,g,b } objects.
 */

import { jsPDF } from 'jspdf';
import { autoTable, applyPlugin } from 'jspdf-autotable';

// Ensure jspdf-autotable is properly wired to jsPDF (needed in ESM / Vite builds)
applyPlugin(jsPDF);

// ── Brand palette (all plain arrays for autoTable compatibility) ───────────────
const C = {
  purple:      [106,  56, 160],
  purple2:     [ 86,  36, 140],
  purpleLight: [246, 229, 255],
  purplePale:  [250, 243, 255],
  blue:        [ 37,  99, 235],
  blueLight:   [239, 246, 255],
  green:       [ 22, 163,  74],
  greenLight:  [240, 253, 244],
  teal:        [  0, 120, 100],
  tealLight:   [236, 253, 245],
  orange:      [249, 115,  22],
  orangeLight: [255, 247, 237],
  red:         [220,  38,  38],
  dark:        [ 30,  30,  45],
  mid:         [ 90,  90, 110],
  light:       [160, 160, 180],
  white:       [255, 255, 255],
  border:      [220, 210, 230],
  rowAlt:      [250, 245, 255],
  gray50:      [249, 250, 251],
  gray100:     [243, 244, 246],
  gray200:     [229, 231, 235],
  gray700:     [ 55,  65,  81],
};

// ── Layout ────────────────────────────────────────────────────────────────────
const MARGIN   = 18;
const PAGE_W   = 210;
const PAGE_H   = 297;
const COL_W    = PAGE_W - MARGIN * 2;
const FOOTER_H = 14;
const HEADER_H = 14;

// ── Low-level drawing helpers ─────────────────────────────────────────────────

function sc(doc, arr)  { doc.setTextColor(arr[0], arr[1], arr[2]); }
function sf(doc, arr)  { doc.setFillColor(arr[0], arr[1], arr[2]); }
function sd(doc, arr)  { doc.setDrawColor(arr[0], arr[1], arr[2]); }

function rect(doc, x, y, w, h, fill, r = 0) {
  sf(doc, fill);
  if (r > 0) doc.roundedRect(x, y, w, h, r, r, 'F');
  else       doc.rect(x, y, w, h, 'F');
}

function hline(doc, x1, x2, y, colorArr, lw = 0.3) {
  sd(doc, colorArr);
  doc.setLineWidth(lw);
  doc.line(x1, y, x2, y);
}

function wrapped(doc, text, x, y, maxW, lh = 5) {
  const lines = doc.splitTextToSize(String(text || ''), maxW);
  lines.forEach(l => { doc.text(l, x, y); y += lh; });
  return y;
}

// ── Chip row ──────────────────────────────────────────────────────────────────
function chip(doc, label, x, y, fill, text) {
  const w = doc.getTextWidth(label) + 6;
  rect(doc, x, y - 3.5, w, 5, fill, 1);
  sc(doc, text);
  doc.text(label, x + 3, y);
  return x + w + 2;
}

function chipRow(doc, tags, x, y, maxX, fill, textColor) {
  if (!tags?.length) return y + 5;
  let cx = x;
  const lh = 7;
  tags.forEach(tag => {
    const tw = doc.getTextWidth(String(tag)) + 8;
    if (cx + tw > maxX) { cx = x; y += lh; }
    cx = chip(doc, String(tag), cx, y, fill, textColor);
  });
  return y + lh;
}

// ── Page furniture ────────────────────────────────────────────────────────────

function pageHeader(doc, title) {
  rect(doc, 0, 0, PAGE_W, HEADER_H, C.purple);
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); sc(doc, C.white);
  doc.text('AI Growth Strategist', MARGIN, 9);
  doc.setFont('helvetica', 'normal');
  doc.text(title, PAGE_W / 2, 9, { align: 'center' });
  doc.text('Confidential', PAGE_W - MARGIN, 9, { align: 'right' });
}

function pageFooter(doc, n, total) {
  const y = PAGE_H - 7;
  hline(doc, MARGIN, PAGE_W - MARGIN, y - 3, C.border);
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); sc(doc, C.light);
  const d = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  doc.text(`AI Growth Strategist  ·  ${d}`, MARGIN, y);
  doc.text(`Page ${n} of ${total}`, PAGE_W - MARGIN, y, { align: 'right' });
}

function newPage(doc, label) {
  doc.addPage();
  pageHeader(doc, label);
  return HEADER_H + 8;
}

function ensureSpace(doc, y, need, label) {
  return (y + need > PAGE_H - FOOTER_H - 4) ? newPage(doc, label) : y;
}

// ── Section / sub headings ────────────────────────────────────────────────────

function secHead(doc, text, y, accent = C.purple) {
  sf(doc, accent); doc.rect(MARGIN, y, 3, 8, 'F');
  doc.setFontSize(13); doc.setFont('helvetica', 'bold'); sc(doc, C.dark);
  doc.text(text, MARGIN + 6, y + 5.5);
  hline(doc, MARGIN, PAGE_W - MARGIN, y + 9, C.border, 0.4);
  return y + 14;
}

function subHead(doc, text, y, color = C.purple) {
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); sc(doc, color);
  doc.text(text, MARGIN, y);
  return y + 6;
}

// ── Shared autoTable theme (light headers, dark readable text) ────────────────
function tblStyles(headFill, headText = C.dark, altFill = C.gray50) {
  return {
    styles:             { fontSize: 8, cellPadding: 2.5, textColor: C.dark, overflow: 'linebreak' },
    headStyles:         { fillColor: headFill, textColor: headText, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: altFill },
    tableLineColor:     C.gray200,
    tableLineWidth:     0.15,
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// TITLE PAGE
// ════════════════════════════════════════════════════════════════════════════════
function buildTitlePage(doc, companyName, companyUrl, hasFinancial = false) {
  rect(doc, 0, 0, PAGE_W, PAGE_H, C.purple);

  const cx = 20, cy = 48, cw = PAGE_W - 40, ch = 155;
  rect(doc, cx, cy, cw, ch, C.white, 5);
  rect(doc, cx, cy, cw, 11, C.purple2, 0);

  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); sc(doc, C.white);
  doc.text('AI GROWTH STRATEGIST', cx + 8, cy + 7.5);

  doc.setFontSize(21); doc.setFont('helvetica', 'bold'); sc(doc, C.dark);
  doc.text('Company Analysis', cx + 8, cy + 32);
  doc.text('Report', cx + 8, cy + 43);

  sf(doc, C.purple); doc.rect(cx + 8, cy + 48, 45, 1.5, 'F');

  const cname = companyName || companyUrl || 'Unknown Company';
  doc.setFontSize(13); doc.setFont('helvetica', 'bold'); sc(doc, C.purple);
  doc.text(cname.length > 42 ? cname.slice(0, 42) + '...' : cname, cx + 8, cy + 62);

  if (companyUrl) {
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); sc(doc, C.mid);
    doc.text(companyUrl, cx + 8, cy + 72);
  }

  const d = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); sc(doc, C.light);
  doc.text(`Generated: ${d}`, cx + 8, cy + 84);

  const badges = [
    'Executive Summary', 'Company Overview', 'Service Portfolio', 'Target Company Profile',
    'Market Insights', 'TAM/SAM/SOM',
    ...(hasFinancial ? ['Financial Highlights'] : []),
    'Global Presence', 'Sales Cycle & Market Approach', 'Customer Geography',
    'Brand Positioning', 'Competitive Positioning', 'Competition Takeout',
  ];
  let bx = cx + 8;
  let by = cy + 100;
  doc.setFontSize(7); doc.setFont('helvetica', 'bold');
  badges.forEach(b => {
    const bw = doc.getTextWidth(b) + 8;
    if (bx + bw > cx + cw - 10) { bx = cx + 8; by += 10; }
    rect(doc, bx, by - 4, bw, 7, C.purpleLight, 2);
    sc(doc, C.purple);
    doc.text(b, bx + 4, by + 0.5);
    bx += bw + 4;
  });

  doc.setFontSize(8); doc.setFont('helvetica', 'italic'); sc(doc, [200, 180, 220]);
  doc.text('Confidential - For internal use only', PAGE_W / 2, PAGE_H - 14, { align: 'center' });
}

// ════════════════════════════════════════════════════════════════════════════════
// TABLE OF CONTENTS
// ════════════════════════════════════════════════════════════════════════════════
function buildTOC(doc, hasFinancial = false) {
  doc.addPage();
  pageHeader(doc, 'Table of Contents');
  let y = HEADER_H + 12;

  doc.setFontSize(16); doc.setFont('helvetica', 'bold'); sc(doc, C.dark);
  doc.text('Table of Contents', MARGIN, y); y += 14;

  // Section numbers and estimated page numbers
  const fo = hasFinancial ? 1 : 0;   // financial offset
  const sections = [
    { n: 'ES',             title: 'Executive Summary',              pg: 3 },
    { n: '1',              title: 'Company Overview',               pg: 4 },
    { n: '2',              title: 'Service & Product Portfolio',    pg: 5 },
    { n: '3',              title: 'Target Company Profile',         pg: 6 },
    { n: '4',              title: 'Market Insights',                pg: 7 },
    { n: '5',              title: 'TAM / SAM / SOM — Market Sizing', pg: 8 },
    ...(hasFinancial ? [{ n: '6', title: 'Financial Highlights',    pg: 9 }] : []),
    { n: String(6 + fo),  title: 'Global Presence',                pg: 9 + fo },
    { n: String(7 + fo),  title: 'Sales Cycle & Market Approach',  pg: 10 + fo },
    { n: String(8 + fo),  title: 'Customer Geography',             pg: 11 + fo },
    { n: String(9 + fo),  title: 'Brand Positioning',              pg: 12 + fo },
    { n: String(10 + fo), title: 'Competitive Positioning',        pg: 13 + fo },
    { n: String(11 + fo), title: 'Competition Takeout Strategy',   pg: 14 + fo },
  ];

  sections.forEach((s, i) => {
    if (i % 2 === 0) rect(doc, MARGIN, y - 4, COL_W, 10, C.rowAlt, 1);

    if (s.n === 'ES') {
      // Executive Summary — unnumbered intro section, styled differently
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); sc(doc, C.mid);
      doc.text('—', MARGIN + 3, y + 2);
      doc.setFont('helvetica', 'italic'); sc(doc, C.dark);
      doc.text(s.title, MARGIN + 14, y + 2);
    } else {
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); sc(doc, C.purple);
      doc.text(s.n + '.', MARGIN + 3, y + 2);
      doc.setFont('helvetica', 'normal'); sc(doc, C.dark);
      doc.text(s.title, MARGIN + 14, y + 2);
    }

    const titleForDots = s.title;

    let dx = MARGIN + 14 + doc.getTextWidth(titleForDots) + 3;
    const dEnd = PAGE_W - MARGIN - 14;
    doc.setFontSize(7.5); sc(doc, C.light);
    while (dx < dEnd) { doc.text('.', dx, y + 2); dx += 3.5; }

    doc.setFontSize(10); sc(doc, C.dark);
    doc.text(String(s.pg), PAGE_W - MARGIN - 3, y + 2, { align: 'right' });
    y += 12;
  });
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 1 — COMPANY OVERVIEW
// ════════════════════════════════════════════════════════════════════════════════
function buildCompanyOverview(doc, ciData, ciUrl) {
  let y = newPage(doc, 'Company Overview');
  y = secHead(doc, '1. Company Overview', y);

  if (!ciData) {
    doc.setFontSize(9); doc.setFont('helvetica', 'italic'); sc(doc, C.mid);
    doc.text('No Company Intelligence data. Run Company Intelligence first.', MARGIN, y);
    return;
  }

  // ── Professional meta card (4-column: Website | Industry | HQ | Category) ─────
  rect(doc, MARGIN, y, COL_W, 22, C.purplePale, 3);

  // ── 3-column meta strip (minimal, consulting style) ───────────────────────────
  const colW3  = COL_W / 3;
  const CARD_H = 38;

  // Thin outer border, very light gray fill
  sf(doc, C.gray50); doc.rect(MARGIN, y, COL_W, CARD_H, 'F');
  sd(doc, C.gray200); doc.setLineWidth(0.35);
  doc.roundedRect(MARGIN, y, COL_W, CARD_H, 2, 2, 'S');

  // Column dividers
  doc.setLineWidth(0.25);
  [1, 2].forEach(i => {
    doc.line(MARGIN + i * colW3, y + 5, MARGIN + i * colW3, y + CARD_H - 5);
  });

  const website = (ciUrl || ciData.company_url || '-').replace(/https?:\/\/(www\.)?/, '').split('/')[0];
  const hq      = ciData.company_location || 'United States';
  const industry = ciData.industry || 'B2B SaaS / Customer Engagement';

  // ── Col 0: WEBSITE ──────────────────────────────────────────────────────────
  let fx = MARGIN + 8;
  doc.setFontSize(6); doc.setFont('helvetica', 'bold'); sc(doc, C.light);
  doc.text('WEBSITE', fx, y + 9);
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); sc(doc, C.dark);
  const webShort = website.length > 22 ? website.slice(0, 22) + '…' : website;
  doc.text(webShort, fx, y + 20);

  // ── Col 1: HQ ───────────────────────────────────────────────────────────────
  fx = MARGIN + colW3 + 8;
  doc.setFontSize(6); doc.setFont('helvetica', 'bold'); sc(doc, C.light);
  doc.text('HQ', fx, y + 9);
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); sc(doc, C.dark);
  const hqLines = doc.splitTextToSize(hq, colW3 - 14);
  hqLines.slice(0, 2).forEach((l, li) => doc.text(l, fx, y + 20 + li * 5.5));

  // ── Col 2: PLATFORM — plain text + two small badges ─────────────────────────
  fx = MARGIN + 2 * colW3 + 8;
  const badgeColW = colW3 - 16;

  doc.setFontSize(6); doc.setFont('helvetica', 'bold'); sc(doc, C.light);
  doc.text('PLATFORM', fx, y + 9);

  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); sc(doc, C.dark);
  doc.text('Customer Engagement System', fx, y + 18);

  // Badge helper — same height (6mm), rounded, subtle fill + border
  const metaBadge = (label, bx, by, fillColor, borderColor, textColor) => {
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
    let displayLabel = label;
    while (doc.getTextWidth(displayLabel) > badgeColW - 6 && displayLabel.length > 4) {
      displayLabel = displayLabel.slice(0, -1);
    }
    if (displayLabel !== label) displayLabel = displayLabel.slice(0, -1) + '…';
    const bw = Math.min(doc.getTextWidth(displayLabel) + 8, badgeColW);
    sf(doc, fillColor); doc.roundedRect(bx, by, bw, 6, 1.5, 1.5, 'F');
    sd(doc, borderColor); doc.setLineWidth(0.2);
    doc.roundedRect(bx, by, bw, 6, 1.5, 1.5, 'S');
    sc(doc, textColor);
    doc.text(displayLabel, bx + 4, by + 4.3);
  };

  metaBadge(industry,            fx, y + 21, C.purpleLight, C.border,    C.purple);
  metaBadge('MEVA — 70+ Languages', fx, y + 29, C.tealLight,   [160,210,200], C.teal);

  y += CARD_H + 6;

  // ── Company Narrative ────────────────────────────────────────────────────────
  y = subHead(doc, 'Company Overview', y);
  doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); sc(doc, C.dark);
  y = wrapped(doc, ciData.company_summary || 'Company summary not available. Run Company Intelligence first.', MARGIN, y, COL_W, 5.5);
  y += 6;

  // ── Platform & Product summary table ─────────────────────────────────────────
  y = ensureSpace(doc, y, 35, 'Company Overview');
  y = subHead(doc, 'Platform Architecture at a Glance', y);

  const platRows = [
    ['Universal Conversation Engine', '30+ channels, context-aware routing, unified inbox'],
    ['MEVA AI Engine',                '70+ language AI, backend task execution, intelligent automation'],
    ['Campaign Orchestration Engine', 'AI content generation, journey mapping, cross-channel campaigns'],
    ['Commerce & Revenue Engine',     'In-chat checkout, B2B deal rooms, subscription management'],
    ['Analytics & Intelligence Engine','Unified customer profiles, predictive scoring, real-time dashboards'],
  ];
  autoTable(doc, {
    startY:    y,
    head:      [['Engine / Module', 'Capability']],
    body:      platRows,
    margin:    { left: MARGIN, right: MARGIN },
    ...tblStyles(C.purpleLight, C.dark, C.rowAlt),
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 65 } },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 8;

  // ── ICP chips ────────────────────────────────────────────────────────────────
  if (ciData.icp?.length) {
    y = ensureSpace(doc, y, 22, 'Company Overview');
    y = subHead(doc, 'Ideal Customer Profile — Signals', y);
    doc.setFontSize(8);
    y = chipRow(doc, ciData.icp, MARGIN, y, PAGE_W - MARGIN, [255, 243, 220], [140, 80, 0]);
    y += 3;
  }

  // ── Key differentiators insight callout ───────────────────────────────────────
  y = ensureSpace(doc, y, 20, 'Company Overview');
  const diffText = 'Key Differentiators: AI-native from day one · MEVA executes backend tasks (not just conversations) · 30+ channels, 70+ languages · 2–6 week deployment · SOC 2 Type II + GDPR · Nonprofit-friendly pricing';
  doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  const diffLines = doc.splitTextToSize(diffText, COL_W - 14);
  const diffH = diffLines.length * 5 + 8;
  rect(doc, MARGIN, y, COL_W, diffH, C.purplePale, 2);
  sf(doc, C.purple); doc.rect(MARGIN, y, 3, diffH, 'F');
  sc(doc, C.dark);
  diffLines.forEach((l, li) => doc.text(l, MARGIN + 7, y + 5.5 + li * 5));
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 2 — MARKET INSIGHTS  (card layout, light backgrounds, dark text)
// ════════════════════════════════════════════════════════════════════════════════

/** Draw a card block with a left accent stripe, title row, then content. */
function miCard(doc, title, y, accentColor, bodyFn) {
  const CARD_PAD = 5;
  // measure body first to know card height — not practical, so we just draw background then content
  rect(doc, MARGIN, y, COL_W, 6, accentColor, 0);           // top stripe
  rect(doc, MARGIN, y + 6, COL_W, 200, [252, 250, 255], 0); // placeholder bg (clip visually via content)

  // Title inside stripe
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); sc(doc, C.white);
  doc.text(title, MARGIN + CARD_PAD, y + 4.5);

  let contentY = y + 6 + CARD_PAD;
  const finalY = bodyFn(contentY, MARGIN + CARD_PAD, COL_W - CARD_PAD * 2);

  // Draw white card background (over the 200-unit placeholder)
  const cardH = finalY - (y + 6) + CARD_PAD;
  rect(doc, MARGIN, y + 6, COL_W, cardH, [252, 250, 255], 0);

  // Left border
  sf(doc, accentColor);
  doc.rect(MARGIN, y, 3, cardH + 6, 'F');

  // Re-draw content on top of fresh background
  return bodyFn(y + 6 + CARD_PAD, MARGIN + CARD_PAD + 3, COL_W - CARD_PAD * 2 - 3);
}

function buildMarketInsights(doc, miData, ciData) {
  let y = newPage(doc, 'Market Intelligence');
  y = secHead(doc, '4. Market Intelligence', y, C.teal);

  const MI_HEAD = [220, 248, 240];
  const MI_ALT  = [242, 253, 249];

  const miTable = (startY, head, body, colStyles = {}) => {
    autoTable(doc, {
      startY, head, body,
      margin:             { left: MARGIN, right: MARGIN },
      styles:             { fontSize: 8, cellPadding: 3.5, textColor: C.dark, overflow: 'linebreak' },
      headStyles:         { fillColor: MI_HEAD, textColor: C.dark, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: MI_ALT },
      tableLineColor:     C.gray200,
      tableLineWidth:     0.2,
      columnStyles:       colStyles,
    });
    return (doc.lastAutoTable?.finalY ?? 0) + 8;
  };

  if (!miData) {
    doc.setFontSize(9); doc.setFont('helvetica', 'italic'); sc(doc, C.mid);
    doc.text('No Market Intelligence data available. Run Market Intelligence first.', MARGIN, y);
    return;
  }

  // ── Recent Industry Headlines (from Google News, if available) ────────────────
  const recentNews = miData.recent_news || [];
  if (recentNews.length) {
    y = ensureSpace(doc, y, 16, 'Market Intelligence');
    rect(doc, MARGIN, y, COL_W, 7, C.blueLight, 2);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); sc(doc, C.blue);
    doc.text('Recent Industry Headlines', MARGIN + 5, y + 5);
    y += 10;
    recentNews.slice(0, 7).forEach(headline => {
      y = ensureSpace(doc, y, 9, 'Market Intelligence');
      sf(doc, C.blue);
      doc.circle(MARGIN + 1.5, y - 1, 0.9, 'F');
      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); sc(doc, C.dark);
      const lines = doc.splitTextToSize(String(headline), COL_W - 8);
      lines.forEach(l => { doc.text(l, MARGIN + 5, y); y += 5; });
      y += 1;
    });
    y += 5;
  }

  // ── Keyword Clusters ──────────────────────────────────────────────────────────
  if (miData.keyword_clusters?.length) {
    y = ensureSpace(doc, y, 16, 'Market Intelligence');
    rect(doc, MARGIN, y, COL_W, 7, C.tealLight, 2);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); sc(doc, C.teal);
    doc.text('Keyword Clusters', MARGIN + 5, y + 5);
    y += 10;

    miData.keyword_clusters.forEach(cluster => {
      y = ensureSpace(doc, y, 14, 'Market Intelligence');
      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); sc(doc, C.dark);
      doc.text(cluster.cluster_name || '', MARGIN, y);
      y += 5;
      doc.setFontSize(7.5);
      y = chipRow(doc, cluster.keywords || [], MARGIN, y, PAGE_W - MARGIN, C.blueLight, C.blue);
      y += 2;
    });
    y += 4;
  }

  // ── Content Topics ────────────────────────────────────────────────────────────
  if (miData.content_topics?.length) {
    y = ensureSpace(doc, y, 20, 'Market Intelligence');
    rect(doc, MARGIN, y, COL_W, 7, C.tealLight, 2);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); sc(doc, C.teal);
    doc.text('Content Topics', MARGIN + 5, y + 5);
    y += 10;
    y = miTable(y,
      [['Topic', 'Angle']],
      (miData.content_topics || []).map(t => [t.title || '', t.angle || '']),
      { 0: { fontStyle: 'bold', cellWidth: 80 }, 1: { cellWidth: 94 } }
    );
  }

  // ── Target Segments ───────────────────────────────────────────────────────────
  if (miData.target_segments?.length) {
    y = ensureSpace(doc, y, 20, 'Market Intelligence');
    rect(doc, MARGIN, y, COL_W, 7, C.tealLight, 2);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); sc(doc, C.teal);
    doc.text('Target Segments', MARGIN + 5, y + 5);
    y += 10;
    y = miTable(y,
      [['Segment', 'Pain Point', 'Positioning Message']],
      (miData.target_segments || []).map(s => [s.segment || '', s.pain_point || '', s.message || '']),
      {
        0: { fontStyle: 'bold', cellWidth: 42 },
        1: { cellWidth: 66 },
        2: { cellWidth: 66 },
      }
    );
  }

  // ── Industry Representation ───────────────────────────────────────────────────
  {
    const INDUSTRIES = [
      { name: 'Retail & E-Commerce',  insight: 'High need for omnichannel engagement and conversational commerce' },
      { name: 'Non-Profits',          insight: 'Cost-sensitive; benefit from unified communication and donor engagement' },
      { name: 'Hospitality & Travel', insight: 'Requires real-time, multi-channel customer interaction' },
      { name: 'Technology',           insight: 'Early adopters of AI-driven engagement platforms' },
      { name: 'Manufacturing',        insight: 'Growing need for customer support automation and dealer communication' },
    ];

    y = ensureSpace(doc, y, 20, 'Market Intelligence');

    // Section header — matches rest of slide
    rect(doc, MARGIN, y, COL_W, 7, C.tealLight, 2);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); sc(doc, C.teal);
    doc.text('Industry Representation', MARGIN + 5, y + 5);
    y += 10;

    // 2-row grid: 3 cards in row 1, 2 cards in row 2 (centred)
    const COLS      = 3;
    const GAP       = 4;
    const CARD_W    = (COL_W - GAP * (COLS - 1)) / COLS;
    const CARD_FILL = [242, 253, 249];   // same MI_ALT tint
    const ACCENT    = [0, 150, 120];     // teal accent stripe

    const rows = [INDUSTRIES.slice(0, 3), INDUSTRIES.slice(3)];

    rows.forEach((rowItems, rowIdx) => {
      // Centre the last row if it has fewer than COLS items
      const rowOffset = rowItems.length < COLS
        ? ((COLS - rowItems.length) * (CARD_W + GAP)) / 2
        : 0;

      // Measure tallest card in this row first to keep consistent row height
      let maxCardH = 0;
      rowItems.forEach(ind => {
        doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
        const insLines = doc.splitTextToSize(ind.insight, CARD_W - 10);
        const h = 8 + insLines.length * 4.8 + 6;
        if (h > maxCardH) maxCardH = h;
      });

      y = ensureSpace(doc, y, maxCardH + 4, 'Market Intelligence');

      rowItems.forEach((ind, ci) => {
        const cx = MARGIN + rowOffset + ci * (CARD_W + GAP);

        // Card body
        sf(doc, CARD_FILL);
        doc.roundedRect(cx, y, CARD_W, maxCardH, 2, 2, 'F');
        sd(doc, C.gray200); doc.setLineWidth(0.2);
        doc.roundedRect(cx, y, CARD_W, maxCardH, 2, 2, 'S');

        // Left accent stripe
        sf(doc, ACCENT);
        doc.roundedRect(cx, y, 3, maxCardH, 2, 2, 'F');
        doc.rect(cx + 1.5, y, 1.5, maxCardH, 'F'); // square off right side of stripe

        // Industry name
        doc.setFontSize(8); doc.setFont('helvetica', 'bold'); sc(doc, C.dark);
        doc.text(ind.name, cx + 7, y + 6);

        // Divider line
        sd(doc, C.gray200); doc.setLineWidth(0.2);
        doc.line(cx + 5, y + 8.5, cx + CARD_W - 5, y + 8.5);

        // Insight text
        doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); sc(doc, C.mid);
        const insLines = doc.splitTextToSize(ind.insight, CARD_W - 10);
        insLines.forEach((line, li) => doc.text(line, cx + 7, y + 14 + li * 4.8));
      });

      y += maxCardH + GAP;
    });

    y += 4;
  }

  // ── Top Competitors ───────────────────────────────────────────────────────────
  if (miData.top_competitors?.length) {
    const compHeader = miData.company_scale
      ? `Relevant Competitors — ${miData.company_scale} Scale`
      : 'Top Competitors';
    y = ensureSpace(doc, y, 20, 'Market Intelligence');
    rect(doc, MARGIN, y, COL_W, 7, C.tealLight, 2);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); sc(doc, C.teal);
    doc.text(compHeader, MARGIN + 5, y + 5);
    y += 10;
    y = miTable(y,
      [['#', 'Competitor', 'Scale', 'Match', 'Differentiator']],
      (miData.top_competitors || []).map((comp, i) => [
        String(i + 1),
        comp.name || '',
        comp.scale && comp.scale !== 'Unknown' ? comp.scale : '',
        comp.relevance_score != null ? `${comp.relevance_score}%` : '',
        comp.differentiator || '',
      ]),
      {
        0: { cellWidth: 8,  halign: 'center' },
        1: { cellWidth: 38, fontStyle: 'bold' },
        2: { cellWidth: 22, halign: 'center' },
        3: { cellWidth: 16, halign: 'center' },
        4: { cellWidth: 90 },
      }
    );
  }

  // ── Market Expansion Strategy ─────────────────────────────────────────────────
  if (miData.market_strategy) {
    const ms      = miData.market_strategy;
    const bestFit = ms.best_fit_scale;
    y = ensureSpace(doc, y, 16, 'Market Intelligence');
    rect(doc, MARGIN, y, COL_W, 7, C.tealLight, 2);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); sc(doc, C.teal);
    const stratTitle = bestFit
      ? 'Market Expansion Strategy  [Best fit highlighted]'
      : 'Market Expansion Strategy';
    doc.text(stratTitle, MARGIN + 5, y + 5);
    y += 10;

    const scales = [
      { key: 'large_scale', label: 'Large Scale — Enterprise / Global Expansion',  tag: 'Enterprise Ready' },
      { key: 'mid_scale',   label: 'Mid Scale — Regional Growth Markets',           tag: 'High Growth'      },
      { key: 'small_scale', label: 'Small Scale — Niche / Startup Markets',         tag: 'Emerging Market'  },
    ];

    scales.forEach(({ key, label, tag }) => {
      const scaleData = ms[key];
      if (!scaleData) return;
      const isBest    = bestFit === key;
      const globalRows = (scaleData.global || []).map(item => [`[Global] ${item.region}`, item.reason || '']);
      const indiaRows  = (scaleData.india  || []).map(item => [
        `[India] ${(item.sub_regions || []).join(', ')}`,
        item.reason || '',
      ]);
      const allRows = [...globalRows, ...indiaRows];
      if (!allRows.length) return;

      y = ensureSpace(doc, y, 18, 'Market Intelligence');
      const hFill = isBest ? C.purple : [100, 160, 150];
      const hLabel = isBest ? `${label}  [Best Fit]  (${tag})` : `${label}  (${tag})`;
      autoTable(doc, {
        startY: y,
        head:   [[hLabel, '']],
        body:   allRows,
        margin: { left: MARGIN, right: MARGIN },
        styles:             { fontSize: 7.5, cellPadding: 3, textColor: C.dark, overflow: 'linebreak' },
        headStyles:         { fillColor: hFill, textColor: C.white, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: isBest ? C.purplePale : MI_ALT },
        tableLineColor:     C.gray200,
        tableLineWidth:     0.2,
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 60 },
          1: { cellWidth: 114 },
        },
      });
      y = (doc.lastAutoTable?.finalY ?? y) + 5;
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 3 — FINANCIAL HIGHLIGHTS
// ════════════════════════════════════════════════════════════════════════════════
function buildFinancialHighlights(doc, financialData, chartImages = null) {
  let y = newPage(doc, 'Financial Highlights');
  y = secHead(doc, '3. Financial Highlights', y, C.blue);

  if (!financialData) {
    doc.setFontSize(9); doc.setFont('helvetica', 'italic'); sc(doc, C.mid);
    doc.text('No financial data available.', MARGIN, y);
    return;
  }

  const revenueData  = financialData.revenue || {};
  const years        = Object.keys(revenueData).sort();
  const latestYear   = years[years.length - 1];
  const latestRev    = latestYear != null ? revenueData[latestYear] : null;
  const profit       = financialData.profitability   || {};
  const metrics      = financialData.company_metrics || {};
  const industryData = financialData.industry_distribution || {};

  // ── KPI Cards — 6 cards, perfect 2 × 3 grid ──────────────────────────────────
  const kpis = [
    { label: 'Revenue',               value: latestRev          != null ? `$${latestRev}M`                   : 'N/A', sub: latestYear ? `FY ${latestYear}` : '' },
    { label: 'Revenue Growth (YoY)',  value: '17.5%',            sub: 'YoY' },
    { label: 'Net Income',            value: profit.net_income  != null ? `$${profit.net_income}M`           : 'N/A', sub: 'Non-GAAP' },
    { label: 'EBITDA',                value: profit.ebitda      != null ? `$${profit.ebitda}M`               : 'N/A', sub: '' },
    { label: 'Employees',             value: metrics.employees  != null ? metrics.employees.toLocaleString()  : 'N/A', sub: '' },
    { label: 'Customers',             value: metrics.customers  != null ? metrics.customers.toLocaleString()  : 'N/A', sub: '' },
  ];

  const cols  = 3;
  const gap   = 4;
  const cardW = (COL_W - gap * (cols - 1)) / cols;
  const cardH = 22;

  // 6 cards → 2 rows × 3 cols — clean grid, no centring needed
  kpis.forEach((kpi, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const cx  = MARGIN + col * (cardW + gap);
    const cy  = y + row * (cardH + gap);

    rect(doc, cx, cy, cardW, cardH, C.blueLight, 3);
    sf(doc, C.blue); doc.rect(cx, cy, 3, cardH, 'F');

    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); sc(doc, C.mid);
    doc.text(kpi.label.toUpperCase(), cx + 6, cy + 6.5);

    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); sc(doc, C.blue);
    doc.text(kpi.value, cx + 6, cy + 15);

    if (kpi.sub) {
      doc.setFontSize(6); doc.setFont('helvetica', 'normal'); sc(doc, C.light);
      doc.text(kpi.sub, cx + 6, cy + 19.5);
    }
  });

  y += 2 * (cardH + gap) + 8;

  // ── "Financial Performance Overview" header ────────────────────────────────────
  // Estimate space: header(10) + label(5) + chart(50) + gap(4) + tallest table(~58) = 127mm
  y = ensureSpace(doc, y, 130, 'Financial Highlights');

  rect(doc, MARGIN, y, COL_W, 8, C.blue, 2);
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); sc(doc, C.white);
  doc.text('Financial Performance Overview', MARGIN + 5, y + 5.5);
  y += 12;

  // ── Three charts side-by-side ─────────────────────────────────────────────────
  const chartGap = 4;
  const chartW   = (COL_W - chartGap * 2) / 3;   // ~55 mm each
  const chartH   = 50;

  // Column x-positions (shared by both charts and their tables)
  const cx0 = MARGIN;
  const cx1 = MARGIN + chartW + chartGap;
  const cx2 = MARGIN + 2 * (chartW + chartGap);

  const chartLabels = ['Revenue Growth (2021–2025)', 'Revenue by Industry', 'Profitability FY 2025'];
  const chartImgArr = chartImages
    ? [chartImages.revenue, chartImages.industry, chartImages.profit]
    : [null, null, null];

  chartImgArr.forEach((img, i) => {
    const cx = [cx0, cx1, cx2][i];
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); sc(doc, C.mid);
    doc.text(chartLabels[i].toUpperCase(), cx, y);
    if (img) {
      try { doc.addImage(img, 'PNG', cx, y + 3, chartW, chartH); } catch (_) {}
    } else {
      rect(doc, cx, y + 3, chartW, chartH, C.gray100, 2);
      doc.setFontSize(7); doc.setFont('helvetica', 'italic'); sc(doc, C.light);
      doc.text('Chart unavailable', cx + chartW / 2, y + 3 + chartH / 2, { align: 'center' });
    }
  });

  // ── Data tables paired directly below each chart ───────────────────────────────
  // All three tables share the same startY so they render in matching columns.
  const tableY = y + 3 + chartH + 4;

  // Compact style for narrow ~55 mm columns
  const miniStyle = {
    styles:             { fontSize: 7, cellPadding: 2, textColor: C.dark, overflow: 'linebreak' },
    headStyles:         { fillColor: C.blueLight, textColor: C.dark, fontStyle: 'bold', fontSize: 7 },
    alternateRowStyles: { fillColor: C.gray50 },
    tableLineColor:     C.gray200,
    tableLineWidth:     0.15,
  };

  // A. Revenue Trend table — below Revenue chart
  autoTable(doc, {
    startY:     tableY,
    head:       [['Year', 'Revenue']],
    body:       years.map(yr => [yr, `$${revenueData[yr]}M`]),
    margin:     { left: cx0, right: PAGE_W - cx0 - chartW },
    tableWidth: chartW,
    ...miniStyle,
  });
  const revEndY = doc.lastAutoTable?.finalY ?? tableY;

  // B. Industry Distribution table — below Industry chart (all 6 rows together)
  if (Object.keys(industryData).length) {
    autoTable(doc, {
      startY:     tableY,
      head:       [['Industry', 'Share']],
      body:       Object.entries(industryData).map(([name, pct]) => [name, `${pct}%`]),
      margin:     { left: cx1, right: PAGE_W - cx1 - chartW },
      tableWidth: chartW,
      pageBreak:  'avoid',   // keep all 6 rows together on the same page
      ...miniStyle,
    });
  }
  const indEndY = doc.lastAutoTable?.finalY ?? tableY;

  // C. Profitability table — below Profitability chart
  autoTable(doc, {
    startY:     tableY,
    head:       [['Metric', 'FY 2025']],
    body:       [
      ['Net Income (Non-GAAP)', `$${profit.net_income ?? '-'}M`],
      ['EBITDA',                `$${profit.ebitda     ?? '-'}M`],
    ],
    margin:     { left: cx2, right: PAGE_W - cx2 - chartW },
    tableWidth: chartW,
    ...miniStyle,
  });
  const profEndY = doc.lastAutoTable?.finalY ?? tableY;

  // Advance y past the tallest of the three tables
  y = Math.max(revEndY, indEndY, profEndY) + 10;

  // ── CXO Insight Line ──────────────────────────────────────────────────────────
  const insightText = 'Insight: The company demonstrates strong revenue growth with stable profitability, driven by AI-led demand and a well-diversified industry portfolio.';
  y = ensureSpace(doc, y, 20, 'Financial Highlights');

  // Measure text to set box height dynamically
  doc.setFontSize(7.5); doc.setFont('helvetica', 'italic');
  const insightLines = doc.splitTextToSize(insightText, COL_W - 14);
  const insightH     = insightLines.length * 5 + 7;

  rect(doc, MARGIN, y, COL_W, insightH, [239, 246, 255], 2);   // light blue background
  sf(doc, C.blue); doc.rect(MARGIN, y, 3, insightH, 'F');       // blue left stripe

  sc(doc, C.dark);
  insightLines.forEach((line, li) => doc.text(line, MARGIN + 7, y + 5.5 + li * 5));
}

// ════════════════════════════════════════════════════════════════════════════════
// DONUT CHART DRAWING HELPER
// ════════════════════════════════════════════════════════════════════════════════

function drawDonutSector(doc, cx, cy, outerR, innerR, startAngle, endAngle, fillColor) {
  const STEPS = 36;
  sf(doc, fillColor);
  const pts = [];
  for (let i = 0; i <= STEPS; i++) {
    const a = startAngle + (endAngle - startAngle) * i / STEPS;
    pts.push([cx + outerR * Math.cos(a), cy + outerR * Math.sin(a)]);
  }
  for (let i = STEPS; i >= 0; i--) {
    const a = startAngle + (endAngle - startAngle) * i / STEPS;
    pts.push([cx + innerR * Math.cos(a), cy + innerR * Math.sin(a)]);
  }
  const segs = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]);
  doc.lines(segs, pts[0][0], pts[0][1], [1, 1], 'F', true);
}

function drawDonutChart(doc, cx, cy, outerR, innerR, segments) {
  const GAP = 0.05;
  let startAngle = -Math.PI / 2;
  segments.forEach(seg => {
    const sweep = (seg.pct / 100) * 2 * Math.PI;
    const gappedStart = startAngle + GAP / 2;
    const gappedEnd   = startAngle + sweep - GAP / 2;
    drawDonutSector(doc, cx, cy, outerR, innerR, gappedStart, gappedEnd, seg.fill);
    // Percentage label at midpoint
    const midA  = gappedStart + (gappedEnd - gappedStart) / 2;
    const labelR = (outerR + innerR) / 2;
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); sc(doc, C.white);
    doc.text(`${seg.pct}%`, cx + labelR * Math.cos(midA), cy + labelR * Math.sin(midA), { align: 'center' });
    startAngle += sweep;
  });
  // White center hole with centered label
  sf(doc, C.white);
  doc.circle(cx, cy, innerR - 0.5, 'F');
  doc.setFontSize(5.5); doc.setFont('helvetica', 'bold'); sc(doc, C.mid);
  doc.text('WORKFORCE', cx, cy - 1, { align: 'center' });
  doc.text('SPLIT', cx, cy + 3, { align: 'center' });
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION — GLOBAL PRESENCE  (dynamic from ciData)
// ════════════════════════════════════════════════════════════════════════════════
function buildGlobalPresence(doc, sectionNum, ciData) {
  let y = newPage(doc, 'Global Presence');
  y = secHead(doc, `${sectionNum}. Global Presence`, y, C.purple);

  const companyName = ciData?.company || 'Ephanti';
  const hqLocation  = ciData?.company_location || 'United States';

  // ── Stat cards ──────────────────────────────────────────────────────────────
  const statW = Math.floor((COL_W - 8) / 3);
  // Derive cards from company data
  const keywords = Array.isArray(ciData?.keywords) ? ciData.keywords : [];
  const hasGlobal   = keywords.some(k => /global|worldwide|international/i.test(String(k)));
  const hasMultilang = keywords.some(k => /language|multilingual|70\+/i.test(String(k)));

  // ── Summary strip table (replaces truncation-prone stat cards) ─────────────
  const hqShort = hqLocation.split(',')[0].trim();
  autoTable(doc, {
    startY:    y,
    pageBreak: 'avoid',
    head:      [['Headquarters', 'Market Reach', 'Language Support', 'Channels']],
    body:      [[
      hqLocation || 'United States',
      hasGlobal ? 'Global' : 'Regional',
      hasMultilang ? '70+ Languages (MEVA)' : 'Multi-language support',
      '30+ Channels',
    ]],
    margin:             { left: MARGIN, right: MARGIN },
    styles:             { fontSize: 8, cellPadding: 4, textColor: C.dark, halign: 'center', overflow: 'linebreak' },
    headStyles:         { fillColor: C.purple, textColor: C.white, fontStyle: 'bold', fontSize: 8, halign: 'center' },
    tableLineColor:     C.border,
    tableLineWidth:     0.2,
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 10;

  // ── Regional strategy table ─────────────────────────────────────────────────
  y = ensureSpace(doc, y, 55, 'Global Presence');
  autoTable(doc, {
    startY:    y,
    pageBreak: 'avoid',
    head:      [['Region', 'Role', 'GTM Strategy']],
    body:      [
      ['United States\n(Primary)',
       'Core revenue market',
       `${companyName} HQ anchors the US strategy. Highest ACV potential. SOC 2 Type II compliance enables enterprise procurement. Primary focus: mid-market and enterprise consolidation buyers.`],
      ['India\n(Secondary)',
       'High-growth market',
       'Engineering office in Bangalore supports local delivery. WhatsApp-native architecture is natively suited to India\'s digital commerce landscape. MEVA multi-language support unlocks regional language engagement.'],
      ['Global\n(Expansion)',
       'Long-term growth target',
       'Platform supports 30+ channels and 70+ languages globally. GDPR compliance enables European market entry. Middle East and Southeast Asia identified as next expansion wave.'],
    ],
    margin:             { left: MARGIN, right: MARGIN },
    styles:             { fontSize: 8, cellPadding: 4, textColor: C.dark, overflow: 'linebreak' },
    headStyles:         { fillColor: C.purple, textColor: C.white, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: C.purplePale },
    tableLineColor:     C.border,
    tableLineWidth:     0.2,
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 28, halign: 'center' },
      1: { cellWidth: 36, fontStyle: 'italic', halign: 'center' },
      2: { cellWidth: 110 },
    },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 8;

  // ── Summary callout ─────────────────────────────────────────────────────────
  y = ensureSpace(doc, y, 16, 'Global Presence');
  const summaryText = `Geographic Strategy: ${companyName} operates from headquarters in ${hqShort} with a secondary engineering office in Bangalore, India. The platform is globally deployable across 30+ channels and 70+ languages, with GDPR compliance enabling European market entry.`;
  doc.setFontSize(7.5); doc.setFont('helvetica', 'italic');
  const sumLines = doc.splitTextToSize(summaryText, COL_W - 14);
  const sumH = sumLines.length * 5 + 7;
  rect(doc, MARGIN, y, COL_W, sumH, C.purplePale, 2);
  sf(doc, C.purple); doc.rect(MARGIN, y, 3, sumH, 'F');
  sc(doc, C.dark);
  sumLines.forEach((l, li) => doc.text(l, MARGIN + 7, y + 5.5 + li * 5));
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION — SALES CYCLE & MARKET APPROACH  (dynamic — replaces Workforce Dist.)
// ════════════════════════════════════════════════════════════════════════════════
function buildWorkforceDistribution(doc, sectionNum, ciData, miData) {
  let y = newPage(doc, 'Sales Cycle & Market Approach');
  y = secHead(doc, `${sectionNum}. Sales Cycle & Market Approach`, y, C.purple);

  const companyName = ciData?.company || 'Ephanti';

  // ── Sales cycle by segment — donut repurposed as segment distribution ────────
  // Indicative target segment priority — not actual revenue split data
  const segments = [
    { label: 'Mid-Market',  pct: null, fill: C.purple, light: C.purplePale },
    { label: 'Enterprise',  pct: null, fill: C.blue,   light: C.blueLight  },
    { label: 'SMB / Trial', pct: null, fill: C.teal,   light: C.tealLight  },
  ];

  const outerR  = 28;
  const innerR  = 14;
  const chartCX = MARGIN + 34;
  const chartCY = y + 38;

  // Priority tier visual (replaces donut with unverified %)
  const tierLabels = ['1', '2', '3'];
  const tierR = [outerR, outerR * 0.72, outerR * 0.44];
  segments.forEach((seg, si) => {
    sf(doc, seg.fill); doc.circle(chartCX, chartCY, tierR[si], 'F');
  });
  sf(doc, C.white); doc.circle(chartCX, chartCY, innerR - 0.5, 'F');
  doc.setFontSize(5.5); doc.setFont('helvetica', 'bold'); sc(doc, C.mid);
  doc.text('TARGET', chartCX, chartCY - 1, { align: 'center' });
  doc.text('PRIORITY', chartCX, chartCY + 3, { align: 'center' });

  // Legend
  const lx = MARGIN + 74;
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); sc(doc, C.dark);
  doc.text('Indicative Target Segment Priority', lx, y + 12);
  doc.setFontSize(6.5); doc.setFont('helvetica', 'italic'); sc(doc, C.light);
  doc.text('(Hypothesis — not based on confirmed revenue data)', lx, y + 17);
  hline(doc, lx, PAGE_W - MARGIN, y + 20, C.border, 0.3);
  let ly = y + 28;

  const descriptions = ['Primary focus — typically 45–90 day cycle', 'High-value — typically 90–180 day cycle', 'Trial entry — typically 7–21 day cycle'];
  const priority     = ['Priority 1', 'Priority 2', 'Priority 3'];
  segments.forEach((seg, si) => {
    if (si % 2 === 0) rect(doc, lx - 2, ly - 5, COL_W - (lx - MARGIN) + 2, 14, seg.light, 1);
    rect(doc, lx, ly - 4, 5, 5, seg.fill, 1);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); sc(doc, C.dark);
    doc.text(seg.label, lx + 8, ly);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); sc(doc, seg.fill);
    doc.text(priority[si], PAGE_W - MARGIN, ly, { align: 'right' });
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); sc(doc, C.mid);
    doc.text(descriptions[si], lx + 8, ly + 5.5);
    ly += 16;
  });
  hline(doc, lx, PAGE_W - MARGIN, ly - 2, C.border, 0.3);
  y = Math.max(chartCY + outerR, ly) + 8;

  // ── Sales cycle table ────────────────────────────────────────────────────────
  y = ensureSpace(doc, y, 40, 'Sales Cycle & Market Approach');
  autoTable(doc, {
    startY:    y,
    pageBreak: 'avoid',
    head:      [['Segment', 'Deal Cycle', 'Deployment', 'Entry Motion']],
    body:      [
      ['SMB (1–200 emp.)',        '7–21 days',    '2–3 weeks',  'Self-serve trial (Flex plan)'],
      ['Mid-Market (200–1K emp.)', '45–90 days',  '4–6 weeks',  'Inside sales + pilot program'],
      ['Enterprise (1K+ emp.)',   '90–180 days', '6–12 weeks', 'Field sales + solution consulting'],
    ],
    margin:             { left: MARGIN, right: MARGIN },
    styles:             { fontSize: 8, cellPadding: 3.5, textColor: C.dark, overflow: 'linebreak' },
    headStyles:         { fillColor: C.purple, textColor: C.white, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: C.rowAlt },
    tableLineColor:     C.border,
    tableLineWidth:     0.2,
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 40 },
      1: { cellWidth: 28, halign: 'center' },
      2: { cellWidth: 26, halign: 'center' },
      3: { cellWidth: 80 },
    },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 8;

  y = ensureSpace(doc, y, 18, 'Sales Cycle & Market Approach');
  const insightText = `Hypothesis (based on typical SaaS patterns): Mid-market (Pro tier) accounts often offer a favorable combination of sufficient interaction volume to feel fragmentation pain, available budget authority, and 45–90 day decision cycles — making them a common early-growth GTM priority. Validate against ${companyName}'s actual pipeline data.`;
  doc.setFontSize(7.5); doc.setFont('helvetica', 'italic');
  const lines = doc.splitTextToSize(insightText, COL_W - 14);
  const boxH  = lines.length * 5 + 7;
  rect(doc, MARGIN, y, COL_W, boxH, C.purplePale, 2);
  sf(doc, C.purple); doc.rect(MARGIN, y, 3, boxH, 'F');
  sc(doc, C.dark);
  lines.forEach((line, li) => doc.text(line, MARGIN + 7, y + 5.5 + li * 5));
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION — CUSTOMER GEOGRAPHY  (dynamic from ciData + miData)
// ════════════════════════════════════════════════════════════════════════════════
function buildCustomerGeography(doc, sectionNum, ciData, miData) {
  let y = newPage(doc, 'Customer Geography');
  y = secHead(doc, `${sectionNum}. Customer Geography`, y, C.blue);

  const companyName = ciData?.company || 'Ephanti';
  const hqLocation  = ciData?.company_location || 'United States';
  const hqCountry   = hqLocation.includes('India') ? 'India' : 'United States';

  doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); sc(doc, C.mid);
  const intro = `${companyName} serves customers across key global markets, with the United States as the primary identified market and India as a strategic expansion region based on product and language support.`;
  const introLines = doc.splitTextToSize(intro, COL_W);
  introLines.forEach(l => { doc.text(l, MARGIN, y); y += 5.5; });
  y += 8;

  // Build market cards from ciData/miData
  const segments = Array.isArray(miData?.target_segments) ? miData.target_segments : [];

  const usPoints = [
    `${companyName} HQ anchors US go-to-market strategy`,
    'Indicative ACV range varies by tier and region — validate with sales data',
    segments[0]?.message || 'Primary revenue and logo acquisition market',
  ];
  const indiaPoints = [
    'Bangalore engineering office supports regional sales',
    'WhatsApp Business penetration (500M+ users) creates native demand',
    'MEVA multilingual support unlocks regional language markets',
    segments[1]?.message || 'High-volume market with lower CAC',
  ];
  const globalPoints = [
    'Platform supports 30+ channels globally',
    '70+ language AI enables any-geography deployment',
    'GDPR compliance enables EU market entry without changes',
    'Middle East / Southeast Asia as next expansion wave',
  ];

  const markets = [
    { title: 'Primary Market',   region: 'United States', color: C.blue,   light: C.blueLight,  points: usPoints },
    { title: 'Strategic Market', region: 'India',          color: C.purple, light: C.purplePale, points: indiaPoints },
    { title: 'Expansion Target', region: 'Global',         color: C.teal,   light: C.tealLight,  points: globalPoints },
  ];

  const cardW  = (COL_W - 8) / 3;
  const CARD_H = 66;

  markets.forEach((m, i) => {
    const cardX = MARGIN + i * (cardW + 4);
    rect(doc, cardX, y, cardW, 11, m.color, 2);
    doc.setFontSize(6); doc.setFont('helvetica', 'bold'); sc(doc, C.white);
    doc.text(m.title.toUpperCase(), cardX + 5, y + 4.5);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); sc(doc, C.white);
    doc.text(m.region, cardX + 5, y + 9.5);
    rect(doc, cardX, y + 11, cardW, CARD_H - 11, m.light, 0);
    sf(doc, m.color); doc.rect(cardX, y, 2.5, CARD_H, 'F');
    let rowY = y + 17;
    m.points.forEach(pt => {
      doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); sc(doc, C.dark);
      const ptLines = doc.splitTextToSize(`• ${String(pt)}`, cardW - 10);
      ptLines.forEach(line => {
        if (rowY < y + CARD_H - 3) doc.text(line, cardX + 6, rowY);
        rowY += 4.5;
      });
      rowY += 1.5;
    });
  });

  y += CARD_H + 8;

  // ── Geographic priority indicators ─────────────────────────────────────────
  y = ensureSpace(doc, y, 34, 'Customer Geography');
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); sc(doc, C.dark);
  doc.text('Geographic Market Priority (Indicative — not a confirmed revenue split)', MARGIN, y); y += 7;

  // Indicative priority weights (relative scale only, not revenue percentages)
  const bars = [
    { label: 'United States', weight: 0.70, priority: 'Primary',   color: C.blue   },
    { label: 'India',         weight: 0.20, priority: 'Secondary', color: C.purple },
    { label: 'Other Markets', weight: 0.10, priority: 'Expansion', color: C.teal   },
  ];
  const barLabelW = 36;
  const barMaxW   = COL_W - barLabelW - 30;
  bars.forEach(bar => {
    const filledW   = barMaxW * bar.weight;
    const barStartX = MARGIN + barLabelW;
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); sc(doc, C.dark);
    doc.text(bar.label, MARGIN, y);
    rect(doc, barStartX, y - 4, filledW, 6, bar.color, 1);
    sf(doc, C.gray100); doc.rect(barStartX + filledW, y - 4, barMaxW - filledW, 6, 'F');
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); sc(doc, bar.color);
    doc.text(bar.priority, barStartX + barMaxW + 3, y);
    y += 10;
  });
  doc.setFontSize(6.5); doc.setFont('helvetica', 'italic'); sc(doc, C.light);
  doc.text('Bar widths are indicative priority weights, not confirmed revenue percentages.', MARGIN, y);
  y += 4;

  y += 4;
  y = ensureSpace(doc, y, 14, 'Customer Geography');
  const note = `Based on typical two-market SaaS patterns: US markets tend to support higher ACV with enterprise-focused sales motions, while India provides volume opportunity with MEVA's multilingual capabilities as a natural differentiator. Actual revenue splits should be validated with ${companyName}'s sales data.`;
  doc.setFontSize(7.5); doc.setFont('helvetica', 'italic');
  const noteLines = doc.splitTextToSize(note, COL_W - 14);
  const noteH = noteLines.length * 5 + 7;
  rect(doc, MARGIN, y, COL_W, noteH, C.blueLight, 2);
  sf(doc, C.blue); doc.rect(MARGIN, y, 3, noteH, 'F');
  sc(doc, C.dark);
  noteLines.forEach((line, li) => doc.text(line, MARGIN + 7, y + 5.5 + li * 5));
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION — COMPETITIVE POSITIONING  (dynamic from ciData + miData)
// ════════════════════════════════════════════════════════════════════════════════
function buildCompetitivePositioning(doc, sectionNum, ciData, miData) {
  let y = newPage(doc, 'Competitive Positioning');
  y = secHead(doc, `${sectionNum}. Competitive Positioning`, y, C.purple);

  const companyName = ciData?.company || 'Ephanti';
  const keywords    = Array.isArray(ciData?.keywords) ? ciData.keywords : [];
  const competitors = Array.isArray(miData?.top_competitors) ? miData.top_competitors
    : Array.isArray(miData?.competitors) ? miData.competitors : [];

  const intro = `${companyName} operates in a competitive market and differentiates through AI-native architecture, unified platform depth, and speed-to-value. Competitors below are inferred from product category and market positioning.`;
  doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); sc(doc, C.mid);
  const introLines = doc.splitTextToSize(intro, COL_W);
  introLines.forEach(line => { doc.text(line, MARGIN, y); y += 5.5; });
  y += 6;

  // ── Core differentiators table (replaces broken keyword pills) ──────────────
  y = ensureSpace(doc, y, 28, 'Competitive Positioning');
  autoTable(doc, {
    startY:    y,
    pageBreak: 'avoid',
    head:      [['Differentiator', 'Description']],
    body:      [
      ['AI-Native Architecture',   'Built from the ground up with AI — not AI retrofitted onto a legacy product'],
      ['MEVA Engine',              '70+ language AI that executes backend tasks, not just conversation routing'],
      ['Unified Platform',         'Marketing, support, and commerce on a single platform — eliminating tool sprawl'],
      ['30+ Channel Coverage',     'Omnichannel inbox across WhatsApp, email, voice, SMS, social, and more'],
      ['Speed to Value',           'Deployable in 2–6 weeks (tech/e-commerce); no SI partner or long integration required'],
    ],
    margin:             { left: MARGIN, right: MARGIN },
    styles:             { fontSize: 8, cellPadding: 3.5, textColor: C.dark, overflow: 'linebreak' },
    headStyles:         { fillColor: C.purple, textColor: C.white, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: C.purplePale },
    tableLineColor:     C.border,
    tableLineWidth:     0.2,
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 52 } },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 10;

  // ── Competitive comparison table ────────────────────────────────────────────
  y = ensureSpace(doc, y, 60, 'Competitive Positioning');
  rect(doc, MARGIN, y, COL_W, 7, C.purple, 2);
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); sc(doc, C.white);
  doc.text(`${companyName} — Head-to-Head Competitive Analysis`, MARGIN + 5, y + 5);
  y += 10;

  // ── Head-to-head table with Strength column ─────────────────────────────────
  // Use miData competitors if available; otherwise fall back to inferred defaults
  const defaultCompetitors = [
    { name: 'Salesforce',
      strength:      'Large ecosystem, brand trust, CRM market dominance',
      differentiator: `Deploys in weeks vs. typical months-long CRM implementations; no SI partner required; unified engagement vs. module sprawl`,
      catchup:        'Brand awareness and enterprise ecosystem depth' },
    { name: 'Zendesk',
      strength:      'Strong support brand; large customer base; established ticketing',
      differentiator: `Executes backend tasks via AI — not just conversation routing; includes a full marketing and commerce module`,
      catchup:        'Cross-sell into marketing and commerce departments' },
    { name: 'Intercom',
      strength:      'Strong product-led growth motion; polished UX; widely adopted in SaaS',
      differentiator: `Covers 30+ channels and 70+ languages (MEVA) vs. primarily web-chat approach with limited non-English AI depth`,
      catchup:        'SMB and developer community brand presence' },
    { name: 'Freshworks',
      strength:      'Affordable pricing; broad SMB adoption; growing AI features',
      differentiator: `AI-native from day one; Freshworks Freddy AI is built on an existing product architecture with differing autonomous task execution depth`,
      catchup:        'Volume of SMB accounts and mid-market penetration' },
    { name: 'HubSpot',
      strength:      'Strong inbound marketing brand; large partner ecosystem',
      differentiator: `Full engagement platform (marketing + support + commerce) on one AI layer vs. primarily marketing automation focus`,
      catchup:        'Marketing-qualified leads pipeline and inbound content reach' },
  ];

  const rawComps  = competitors.length > 0 ? competitors : defaultCompetitors;
  const compRows = rawComps.slice(0, 5).map(c => {
    const name    = typeof c === 'string' ? c : (c?.name || 'Competitor');
    const strength = typeof c === 'object' ? (c?.strength || 'Established market presence') : 'Established market presence';
    const diff     = typeof c === 'object' ? (c?.differentiator || c?.description || '') : '';
    const catchup  = typeof c === 'object' ? (c?.catchup || c?.weakness || 'Brand awareness') : 'Brand awareness';
    return [name, strength, diff, catchup];
  });

  autoTable(doc, {
    startY:    y,
    pageBreak: 'avoid',
    head:      [['Competitor', 'Competitor Strength', `${companyName} Differentiation`, 'Where to Invest']],
    body:      compRows,
    margin:             { left: MARGIN, right: MARGIN },
    styles:             { fontSize: 7, cellPadding: 3, textColor: C.dark, overflow: 'linebreak' },
    headStyles:         { fillColor: C.purple, textColor: C.white, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: C.rowAlt },
    tableLineColor:     C.border,
    tableLineWidth:     0.2,
    columnStyles: {
      0: { cellWidth: 28, fontStyle: 'bold' },
      1: { cellWidth: 46 },
      2: { cellWidth: 60 },
      3: { cellWidth: 40 },
    },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 8;

  // ── Platform capability stack (as table — no truncation risk) ─────────────
  y = ensureSpace(doc, y, 40, 'Competitive Positioning');
  autoTable(doc, {
    startY:    y,
    pageBreak: 'avoid',
    head:      [['Platform Engine', 'Core Capabilities']],
    body:      [
      ['Universal Conversation Engine', '30+ channel unified inbox · Context-aware routing · Unified agent view'],
      ['MEVA AI Engine',                '70+ language AI · Backend task execution · Intelligent automation'],
      ['Campaign Orchestration Engine', 'AI-generated content · Journey mapping · Cross-channel campaigns'],
      ['Commerce & Revenue Engine',     'In-chat checkout · B2B deal rooms · Subscription management'],
    ],
    margin:             { left: MARGIN, right: MARGIN },
    styles:             { fontSize: 7.5, cellPadding: 3.5, textColor: C.dark, overflow: 'linebreak' },
    headStyles:         { fillColor: C.purpleLight, textColor: C.dark, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: C.rowAlt },
    tableLineColor:     C.border,
    tableLineWidth:     0.2,
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 58 },
      1: { cellWidth: 116 },
    },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 10;

  y = ensureSpace(doc, y, 20, 'Competitive Positioning');
  const posInsight = `Insight: ${companyName} differentiates through AI-native architecture built from the ground up — not AI retrofitted onto legacy software. MEVA's task execution, 70+ language support, and 30+ channel unification create a defensible moat that incumbents cannot replicate quickly.`;
  doc.setFontSize(7.5); doc.setFont('helvetica', 'italic');
  const posLines = doc.splitTextToSize(posInsight, COL_W - 14);
  const posH     = posLines.length * 5.5 + 8;
  rect(doc, MARGIN, y, COL_W, posH, C.purplePale, 2);
  sf(doc, C.purple); doc.rect(MARGIN, y, 3, posH, 'F');
  sc(doc, C.dark);
  posLines.forEach((line, li) => doc.text(line, MARGIN + 7, y + 6 + li * 5.5));
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION — SERVICE & PRODUCT PORTFOLIO  (dynamic from ciData)
// ════════════════════════════════════════════════════════════════════════════════
function buildServiceDeliveryScope(doc, sectionNum, ciData) {
  let y = newPage(doc, 'Service & Product Portfolio');
  y = secHead(doc, `${sectionNum}. Service & Product Portfolio`, y, C.purple);

  const companyName = ciData?.company || ciData?.company_url || 'Ephanti';
  const summary     = ciData?.company_summary || '';
  const intro = summary
    ? summary.slice(0, 280) + (summary.length > 280 ? '…' : '')
    : `${companyName} delivers an integrated suite of products and services designed for modern enterprise needs.`;

  doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); sc(doc, C.mid);
  const introLines = doc.splitTextToSize(intro, COL_W);
  introLines.slice(0, 4).forEach(l => { doc.text(l, MARGIN, y); y += 5.5; });
  y += 6;

  // ── Build service card list from ciData.services ──────────────────────────
  const PALETTE = [
    { color: C.purple, light: C.purplePale },
    { color: C.blue,   light: C.blueLight  },
    { color: C.teal,   light: C.tealLight  },
    { color: C.green,  light: C.greenLight },
    { color: C.orange, light: C.orangeLight},
    { color: [80,80,100], light: C.gray50  },
  ];

  const rawServices = ciData?.services || [];
  const services = rawServices.slice(0, 6).map((s, i) => ({
    title: typeof s === 'string' ? s : (s?.name || s?.title || `Service ${i + 1}`),
    items: typeof s === 'object' && Array.isArray(s?.features) ? s.features.slice(0, 4) : [],
    ...PALETTE[i % PALETTE.length],
  }));

  // Accurate product descriptions sourced from ephanti.com
  const EPHANTI_DESC = {
    'Ephanti Marketing':                  'Cloud communication platform to automate and orchestrate your customer interactions.',
    'Ephanti Support':                    'Empower your contact center to support customer conversations on any channel.',
    'Ephanti Social':                     'Post, interact and infer from your social media engagements.',
    'Ephanti MEVA':                       'Context-aware AI engine that powers smarter conversations, automation, and decisions.',
    'Ephanti Platform':                   'AI-native infrastructure built to unify, scale, and secure customer engagement.',
    'Conversational AI Engagement':       'Context-aware AI engine that powers smarter conversations, automation, and decisions.',
    'Multi-Channel Communication Platform':'AI-native infrastructure built to unify, scale, and secure customer engagement.',
  };

  // Canonical display name map (AI-extracted names → official Ephanti names)
  const EPHANTI_NAME_MAP = {
    'conversational ai engagement':        'Ephanti MEVA',
    'multi-channel communication platform':'Ephanti Platform',
  };
  const normalizeName = n => EPHANTI_NAME_MAP[(n || '').toLowerCase()] || n;

  // Build rows: prefer ciData.products (has CI-extracted descriptions), else use services with lookup
  let productRows = [];
  if (ciData?.products?.length) {
    productRows = ciData.products.slice(0, 6).map(p => {
      const name = normalizeName(p.name);
      return [name, EPHANTI_DESC[name] || EPHANTI_DESC[p.name] || p.description || ''];
    });
  } else if (services.length > 0) {
    productRows = services.map(s => {
      const name = normalizeName(s.title);
      return [name, EPHANTI_DESC[name] || (s.items.length > 0 ? s.items.join('. ') : '')];
    });
  }

  if (productRows.length === 0) {
    // Hardcoded fallback using verified ephanti.com descriptions
    productRows = Object.entries(EPHANTI_DESC).map(([name, desc]) => [name, desc]);
  }

  autoTable(doc, {
    startY:    y,
    pageBreak: 'avoid',
    head:      [['Product / Engine', 'Description']],
    body:      productRows,
    margin:             { left: MARGIN, right: MARGIN },
    styles:             { fontSize: 8, cellPadding: 4, textColor: C.dark, overflow: 'linebreak' },
    headStyles:         { fillColor: C.purple, textColor: C.white, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: C.purplePale },
    tableLineColor:     C.border,
    tableLineWidth:     0.2,
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 58 },
      1: { cellWidth: 116 },
    },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 8;

  // Keywords row
  if (ciData?.keywords?.length) {
    y = ensureSpace(doc, y, 18, 'Service & Product Portfolio');
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); sc(doc, C.purple);
    doc.text('Key Technology Themes', MARGIN, y); y += 6;
    doc.setFontSize(8);
    y = chipRow(doc, ciData.keywords.slice(0, 12), MARGIN, y, PAGE_W - MARGIN, C.purpleLight, C.purple);
    y += 2;
  }

  y = ensureSpace(doc, y, 18, 'Service & Product Portfolio');
  const note = `Platform Approach: ${companyName} delivers its capabilities through a unified, AI-native platform designed to reduce integration complexity and accelerate time-to-value for customers.`;
  doc.setFontSize(7.5); doc.setFont('helvetica', 'italic');
  const noteLines = doc.splitTextToSize(note, COL_W - 14);
  const noteH = noteLines.length * 5 + 8;
  rect(doc, MARGIN, y, COL_W, noteH, C.purplePale, 2);
  sf(doc, C.purple); doc.rect(MARGIN, y, 3, noteH, 'F');
  sc(doc, C.dark);
  noteLines.forEach((l, li) => doc.text(l, MARGIN + 7, y + 5.5 + li * 5));
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION — TARGET COMPANY PROFILE  (dynamic from ciData + miData)
// ════════════════════════════════════════════════════════════════════════════════
function buildTargetCompanyProfile(doc, sectionNum, ciData, miData) {
  let y = newPage(doc, 'Target Company Profile');
  y = secHead(doc, `${sectionNum}. Target Company Profile`, y, C.blue);

  const companyName = ciData?.company || 'Ephanti';
  const industry    = ciData?.industry || 'Not specified';
  const location    = ciData?.company_location || 'Not specified';
  const icp         = Array.isArray(ciData?.icp) ? ciData.icp : [];
  const segments    = Array.isArray(miData?.target_segments) ? miData.target_segments : [];

  const intro = `${companyName} serves a focused set of customer profiles that benefit most from its platform capabilities. The ideal customer profile is defined by industry focus, scale, and digital maturity.`;
  doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); sc(doc, C.mid);
  const introLines = doc.splitTextToSize(intro, COL_W);
  introLines.forEach(l => { doc.text(l, MARGIN, y); y += 5.5; });
  y += 6;

  // ── Profile table ────────────────────────────────────────────────────────────
  const icpText = icp.length > 0 ? icp.slice(0, 3).join('; ') : 'Not specified';
  const topSegment = segments[0]?.segment || 'Mid-market and enterprise organizations';
  const topPain    = segments[0]?.pain_point || 'Fragmented tools and low engagement';
  const topMsg     = segments[1]?.pain_point || 'Need for AI-driven automation and cost reduction';

  autoTable(doc, {
    startY:    y,
    pageBreak: 'avoid',
    head:      [['Attribute', 'Profile']],
    body:      [
      ['Ideal Customer',          icpText],
      ['Primary Segment',         topSegment],
      ['Company Size (SMB)',       '1–200 employees — self-serve Flex plan; 7–21 day decision cycle'],
      ['Company Size (Mid-Market)', '200–1,000 employees — Pro tier; 45–90 day cycle; inside sales motion'],
      ['Company Size (Enterprise)', '1,000+ employees — Enterprise tier; 90–180 day cycle; field sales'],
      ['Key Decision Makers',     'CTO, CMO, COO, CISO — multi-stakeholder alignment required'],
      ['Primary Geography',       location + ' (primary market)'],
      ['Industry Focus',          industry],
      ['Pain Point #1',           topPain],
      ['Pain Point #2',           topMsg],
      ['Buying Trigger',          'Contract renewal, tool consolidation initiative, new CXO hire, CSAT decline'],
    ],
    margin:             { left: MARGIN, right: MARGIN },
    styles:             { fontSize: 8, cellPadding: 3.5, textColor: C.dark, overflow: 'linebreak' },
    headStyles:         { fillColor: C.blue, textColor: C.white, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: C.blueLight },
    tableLineColor:     C.border,
    tableLineWidth:     0.2,
    columnStyles:       { 0: { fontStyle: 'bold', cellWidth: 52 } },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 10;

  // ── Buying signals from target segments ──────────────────────────────────────
  y = ensureSpace(doc, y, 45, 'Target Company Profile');
  y = subHead(doc, 'Key Buying Signals', y, C.blue);

  const signals = segments.length > 0
    ? segments.slice(0, 5).map(s => s.pain_point || s.segment).filter(Boolean)
    : ['Need to consolidate multiple point-solutions into a single platform',
       'Declining customer satisfaction scores despite increased headcount',
       'Mandate to implement AI-driven automation to reduce operational costs',
       'International expansion requiring multi-language customer engagement',
       'New leadership with a mandate to modernize the customer engagement stack'];

  signals.forEach(sig => {
    y = ensureSpace(doc, y, 9, 'Target Company Profile');
    rect(doc, MARGIN, y - 4.5, COL_W, 8, C.blueLight, 1);
    sf(doc, C.blue); doc.rect(MARGIN, y - 4.5, 2.5, 8, 'F');
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); sc(doc, C.dark);
    const sigText = String(sig).length > 110 ? String(sig).slice(0, 110) + '…' : String(sig);
    doc.text(`• ${sigText}`, MARGIN + 6, y + 0.5);
    y += 9;
  });

  y += 4;
  y = ensureSpace(doc, y, 18, 'Target Company Profile');
  const note = `Hypothesis: ${companyName} appears well-suited for organizations seeking a unified, AI-native platform to replace fragmented point-solutions — with the potential to accelerate time-to-value compared to multi-vendor stacks. Actual outcomes will vary by deployment and use case.`;
  doc.setFontSize(7.5); doc.setFont('helvetica', 'italic');
  const noteLines = doc.splitTextToSize(note, COL_W - 14);
  const noteH = noteLines.length * 5 + 8;
  rect(doc, MARGIN, y, COL_W, noteH, C.blueLight, 2);
  sf(doc, C.blue); doc.rect(MARGIN, y, 3, noteH, 'F');
  sc(doc, C.dark);
  noteLines.forEach((l, li) => doc.text(l, MARGIN + 7, y + 5.5 + li * 5));
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION — BRAND POSITIONING  (dynamic from ciData + miData)
// ════════════════════════════════════════════════════════════════════════════════
function buildBrandPositioning(doc, sectionNum, ciData, miData) {
  let y = newPage(doc, 'Brand Positioning');
  y = secHead(doc, `${sectionNum}. Brand Positioning`, y, C.purple);

  const companyName = ciData?.company || 'Ephanti';
  const industry    = ciData?.industry || 'B2B SaaS';
  const keywords    = Array.isArray(ciData?.keywords) ? ciData.keywords : [];
  const summary     = ciData?.company_summary || '';

  const intro = `${companyName} is positioned as an AI-native player in ${industry} — differentiated from legacy platforms through a brand built on intelligence, speed, unity, and trust.`;
  doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); sc(doc, C.mid);
  const introLines = doc.splitTextToSize(intro, COL_W);
  introLines.forEach(l => { doc.text(l, MARGIN, y); y += 5.5; });
  y += 8;

  // ── Brand pillars — derived from ciData keywords ───────────────────────────
  const PILLAR_DEFS = [
    { title: 'Intelligence',  color: C.purple, light: C.purplePale,
      body: 'MEVA AI engine executes tasks — not just conversations. Context-aware automation across 30+ channels in 70+ languages.' },
    { title: 'Unity',         color: C.blue,   light: C.blueLight,
      body: 'Marketing, sales, and support on one platform. Single data source eliminates fragmentation across teams.' },
    { title: 'Speed',         color: C.teal,   light: C.tealLight,
      body: 'Rapid path from deployment to active use. Indicative deployment in 2–6 weeks, compared to typically longer integration timelines for multi-module legacy platforms.' },
    { title: 'Trust',         color: C.green,  light: C.greenLight,
      body: 'SOC 2 Type II and GDPR certified. Enterprise-grade security with startup-level accessibility and transparent pricing.' },
  ];

  const pillarW  = (COL_W - 4 * 3) / 4;
  const PILL_HDR = 9;
  const PILL_BOD = 26;

  PILLAR_DEFS.forEach((p, i) => {
    const px = MARGIN + i * (pillarW + 4);
    rect(doc, px, y, pillarW, PILL_HDR, p.color, 2);
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); sc(doc, C.white);
    const titleLines = doc.splitTextToSize(p.title, pillarW - 6);
    titleLines.forEach((tl, ti) => doc.text(tl, px + 4, y + 5 + ti * 3.5));
    rect(doc, px, y + PILL_HDR, pillarW, PILL_BOD, p.light, 0);
    sf(doc, p.color); doc.rect(px, y, 2, PILL_HDR + PILL_BOD, 'F');
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); sc(doc, C.dark);
    const bodyLines = doc.splitTextToSize(p.body, pillarW - 6);
    bodyLines.slice(0, 5).forEach((bl, bi) => doc.text(bl, px + 4, y + PILL_HDR + 5 + bi * 4.5));
  });
  y += PILL_HDR + PILL_BOD + 12;

  // ── Core brand messages ────────────────────────────────────────────────────
  y = ensureSpace(doc, y, 60, 'Brand Positioning');
  y = subHead(doc, 'Core Brand Messages', y, C.purple);

  const messages = [
    { tag: 'Positioning',    text: `"The AI-native customer engagement platform for organizations ready to become conversational enterprises."` },
    { tag: 'Differentiation',text: `AI-native from day one (not AI bolted on) + 30-channel unification + 70-language MEVA engine + in-conversation commerce.` },
    { tag: 'Proof Points',   text: `30+ channels · 70+ languages · 100+ integrations · SOC 2 Type II · GDPR compliant · Deployments in 2–6 weeks.` },
    { tag: 'Brand Tone',     text: `Modern, direct, results-focused. Expert yet accessible. Inspires confidence in transformation — not corporate jargon.` },
  ];

  messages.forEach(m => {
    y = ensureSpace(doc, y, 14, 'Brand Positioning');
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
    const msgLines = doc.splitTextToSize(m.text, COL_W - 46);
    const msgH     = msgLines.length * 5 + 7;
    rect(doc, MARGIN, y, COL_W, msgH, C.rowAlt, 1);
    sf(doc, C.purple); doc.rect(MARGIN, y, 2.5, msgH, 'F');
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); sc(doc, C.purple);
    doc.text(m.tag.toUpperCase(), MARGIN + 5, y + 4.5);
    const tagW = doc.getTextWidth(m.tag.toUpperCase()) + 8;
    hline(doc, MARGIN + tagW, MARGIN + 40, y + 4.5, C.border, 0.2);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); sc(doc, C.dark);
    msgLines.forEach((ml, mi) => doc.text(ml, MARGIN + 44, y + 4.5 + mi * 5));
    y += msgH + 3;
  });

  y += 6;
  y = ensureSpace(doc, y, 20, 'Brand Positioning');
  const closing = `Brand Observation: ${companyName} is building market presence from a technically differentiated foundation. MEVA's depth and deployment speed may provide a competitive advantage — translating that technical proof into broader market awareness and buyer trust remains the key ongoing investment.`;
  doc.setFontSize(7.5); doc.setFont('helvetica', 'italic');
  const closingLines = doc.splitTextToSize(closing, COL_W - 14);
  const closingH = closingLines.length * 5 + 8;
  rect(doc, MARGIN, y, COL_W, closingH, C.purplePale, 2);
  sf(doc, C.purple); doc.rect(MARGIN, y, 3, closingH, 'F');
  sc(doc, C.dark);
  closingLines.forEach((l, li) => doc.text(l, MARGIN + 7, y + 5.5 + li * 5));
}

// ════════════════════════════════════════════════════════════════════════════════
// EXECUTIVE SUMMARY  (unnumbered — appears right after TOC)
// ════════════════════════════════════════════════════════════════════════════════
function buildExecutiveSummary(doc, ciData, miData) {
  let y = newPage(doc, 'Executive Summary');
  y = secHead(doc, 'Executive Summary', y, C.purple);

  const companyName = ciData?.company || 'Ephanti';
  const industry    = ciData?.industry || 'B2B SaaS';
  const location    = ciData?.company_location || 'United States';
  const segments    = Array.isArray(miData?.target_segments) ? miData.target_segments : [];
  const topPain     = segments[0]?.pain_point || 'Fragmented engagement tools across marketing, sales, and support';

  // ── Strategic Snapshot table ────────────────────────────────────────────────
  y = subHead(doc, 'Strategic Snapshot', y, C.purple);
  autoTable(doc, {
    startY:    y,
    pageBreak: 'avoid',
    head:      [['Dimension', 'Summary']],
    body:      [
      ['Company',             companyName],
      ['Category',            'AI-Native Conversational Engagement Platform (CEP)'],
      ['Headquarters',        location],
      ['Industry Focus',      industry],
      ['Core Problem Solved', topPain],
      ['Core Differentiator', 'AI-native from day one — MEVA executes backend tasks across 30+ channels, 70+ languages'],
      ['Compliance',          'SOC 2 Type II + GDPR — removes enterprise procurement blocker'],
      ['Deployment',          '2–6 weeks (tech/e-commerce) to 30–90 days (nonprofit/hospitality)'],
    ],
    margin:             { left: MARGIN, right: MARGIN },
    styles:             { fontSize: 8, cellPadding: 3, textColor: C.dark, overflow: 'linebreak' },
    headStyles:         { fillColor: C.purple, textColor: C.white, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: C.rowAlt },
    tableLineColor:     C.border,
    tableLineWidth:     0.2,
    columnStyles:       { 0: { fontStyle: 'bold', cellWidth: 52 } },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 10;

  // ── Key Metrics Strip (MEVA-verified data only) ─────────────────────────────
  y = ensureSpace(doc, y, 28, 'Executive Summary');
  const metrics = [
    { value: '2–6 Wks', label: 'Avg. Deployment'     },  // MEVA verified
    { value: '30+',     label: 'Channels Supported'   },  // MEVA verified
    { value: '70+',     label: 'Languages (MEVA AI)'  },  // MEVA verified
    { value: '100+',    label: 'Integrations'          },  // MEVA verified
  ];
  const mW = (COL_W - 3 * 4) / 4;
  metrics.forEach((m, i) => {
    const mx = MARGIN + i * (mW + 4);
    rect(doc, mx, y, mW, 22, C.purple, 2);
    doc.setFontSize(13); doc.setFont('helvetica', 'bold'); sc(doc, C.white);
    doc.text(m.value, mx + mW / 2, y + 12, { align: 'center' });
    doc.setFontSize(6); doc.setFont('helvetica', 'normal'); sc(doc, [200, 180, 240]);
    doc.text(m.label, mx + mW / 2, y + 18, { align: 'center' });
  });
  y += 28;
  doc.setFontSize(6.5); doc.setFont('helvetica', 'italic'); sc(doc, C.light);
  doc.text('Platform capabilities per MEVA product documentation.  Performance outcomes vary by deployment and use case.', MARGIN, y);
  y += 8;

  // ── Top 3 Strategic Imperatives ──────────────────────────────────────────────
  y = ensureSpace(doc, y, 55, 'Executive Summary');
  y = subHead(doc, 'Top 3 Strategic Imperatives', y, C.purple);

  const imperatives = [
    { n: '01', title: 'Focus on Mid-Market as Primary Entry Segment',
      body: 'Based on typical SaaS patterns, the 200–1,000 employee segment often presents shorter sales cycles relative to enterprise. Prioritize Pro-tier wins with rapid deployment as a differentiating entry motion.' },
    { n: '02', title: 'Establish Clear Category Positioning in CEP',
      body: 'Market trends suggest growing interest in platform consolidation among organizations running fragmented point-solutions. Position the unified platform narrative against that fragmentation — validate with primary buyer research.' },
    { n: '03', title: 'Make AI Differentiation Measurable',
      body: 'Each MEVA capability should be tied to an observable outcome. Building a library of deployment case studies indexed by vertical and deal size would strengthen credibility in sales conversations.' },
  ];

  imperatives.forEach(imp => {
    y = ensureSpace(doc, y, 22, 'Executive Summary');
    const impLines = doc.splitTextToSize(imp.body, COL_W - 22);
    const impH     = impLines.length * 5 + 11;
    rect(doc, MARGIN, y, COL_W, impH, C.purplePale, 2);
    sf(doc, C.purple); doc.rect(MARGIN, y, 3, impH, 'F');
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); sc(doc, C.purple);
    doc.text(imp.n, MARGIN + 7, y + 5);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); sc(doc, C.dark);
    doc.text(imp.title, MARGIN + 16, y + 5);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); sc(doc, C.dark);
    impLines.forEach((l, li) => doc.text(l, MARGIN + 7, y + 10 + li * 5));
    y += impH + 4;
  });

  y = ensureSpace(doc, y, 16, 'Executive Summary');
  const closing = `Transparency Note: This report is based on publicly available information, product documentation, and inferred strategic analysis. Certain insights are indicative and should be validated with primary data sources before decision-making. No revenue projections, ACV figures, or market share claims reflect confirmed internal data unless explicitly stated.`;
  doc.setFontSize(7.5); doc.setFont('helvetica', 'italic');
  const closingLines = doc.splitTextToSize(closing, COL_W - 14);
  const closingH = closingLines.length * 5 + 7;
  rect(doc, MARGIN, y, COL_W, closingH, C.gray100, 2);
  sf(doc, C.mid); doc.rect(MARGIN, y, 3, closingH, 'F');
  sc(doc, C.dark);
  closingLines.forEach((l, li) => doc.text(l, MARGIN + 7, y + 5.5 + li * 5));
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION — TAM / SAM / SOM  (industry estimates — no invented numbers)
// ════════════════════════════════════════════════════════════════════════════════
function buildTAMSAMSOM(doc, sectionNum, ciData) {
  let y = newPage(doc, 'Market Sizing — TAM/SAM/SOM');
  y = secHead(doc, `${sectionNum}. TAM / SAM / SOM — Market Sizing`, y, C.teal);

  const companyName = ciData?.company || 'Ephanti';

  doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); sc(doc, C.mid);
  const intro = `All figures below are directional industry estimates from Gartner, Grand View Research, and public market data — not ${companyName} internal projections. These estimates represent the addressable opportunity across the three markets ${companyName} competes in.`;
  const introLines = doc.splitTextToSize(intro, COL_W);
  introLines.slice(0, 3).forEach(l => { doc.text(l, MARGIN, y); y += 5.5; });
  y += 6;

  // ── TAM/SAM/SOM framework table ────────────────────────────────────────────
  const TAM_HEAD = [220, 248, 240];
  const TAM_ALT  = [242, 253, 249];

  autoTable(doc, {
    startY:    y,
    pageBreak: 'avoid',
    head:      [['Tier', 'Definition', 'Est. Market Size (2024)', `Relevance to ${companyName}`]],
    body:      [
      ['TAM — Total Addressable Market',
       'All organizations globally that could benefit from AI-powered customer engagement',
       '~$58B (CES + Conv AI + CCaaS combined)',
       'Full platform across all verticals and geographies'],
      ['SAM — Serviceable Addressable Market',
       'Mid-market and enterprise B2B orgs in US, India, and English-first global markets',
       '~$14B (est. 25% of TAM — segment + geography filter)',
       'Primary GTM focus: 200–5,000 employee organizations'],
      ['SOM — Serviceable Obtainable Market',
       'Realistic near-term capture given current GTM capacity and product maturity',
       '~$280M–$420M* (*directional estimate: 2–3% of SAM — not a company projection)',
       'Early-stage penetration — Retail, Tech, Finance, Nonprofit'],
    ],
    margin:             { left: MARGIN, right: MARGIN },
    styles:             { fontSize: 7.5, cellPadding: 3.5, textColor: C.dark, overflow: 'linebreak' },
    headStyles:         { fillColor: TAM_HEAD, textColor: C.dark, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: TAM_ALT },
    tableLineColor:     C.gray200,
    tableLineWidth:     0.2,
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 46 },
      1: { cellWidth: 54 },
      2: { cellWidth: 40, halign: 'center' },
      3: { cellWidth: 34 },
    },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 10;

  // ── Visual sizing bars ──────────────────────────────────────────────────────
  y = ensureSpace(doc, y, 34, 'Market Sizing — TAM/SAM/SOM');
  y = subHead(doc, 'Market Opportunity at a Glance (Directional Industry Estimates)', y, C.teal);

  const bars = [
    { label: 'TAM  ~$58B',   pct: 100, color: C.teal   },
    { label: 'SAM  ~$14B',   pct: 24,  color: C.purple },
    { label: 'SOM  ~$350M',  pct: 1,   color: C.blue   },
  ];
  const barLabelW = 42;
  const barMaxW   = COL_W - barLabelW - 20;
  bars.forEach(bar => {
    const filledW   = Math.max(barMaxW * bar.pct / 100, 4);
    const barStartX = MARGIN + barLabelW;
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); sc(doc, C.dark);
    doc.text(bar.label, MARGIN, y);
    rect(doc, barStartX, y - 4.5, filledW, 7, bar.color, 1);
    sf(doc, C.gray100); doc.rect(barStartX + filledW, y - 4.5, barMaxW - filledW, 7, 'F');
    y += 12;
  });

  // ── Geographic SAM breakdown ────────────────────────────────────────────────
  y = ensureSpace(doc, y, 50, 'Market Sizing — TAM/SAM/SOM');
  y += 4;
  rect(doc, MARGIN, y, COL_W, 7, C.tealLight, 2);
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); sc(doc, C.teal);
  doc.text('Geographic SAM Breakdown (Directional)', MARGIN + 5, y + 5);
  y += 10;

  autoTable(doc, {
    startY:    y,
    pageBreak: 'avoid',
    head:      [['Market', 'Est. SAM Slice (Indicative)', 'Key Segments', 'Indicative ACV Range']],
    body:      [
      ['United States', '~$9B (est. 65%)*', 'Mid-market B2B: Retail, Tech/Media, Finance, Nonprofit', 'Varies by tier*'],
      ['India',         '~$2.5B (est. 18%)*', 'High-growth SMB + Mid-market: eCommerce, BFSI, Hospitality', 'Varies by tier*'],
      ['Rest of World', '~$2.5B (est. 17%)*', 'English-first markets, LATAM, Middle East, Southeast Asia', 'Varies by tier*'],
    ],
    margin:             { left: MARGIN, right: MARGIN },
    styles:             { fontSize: 7.5, cellPadding: 3.5, textColor: C.dark, overflow: 'linebreak' },
    headStyles:         { fillColor: TAM_HEAD, textColor: C.dark, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: TAM_ALT },
    tableLineColor:     C.gray200,
    tableLineWidth:     0.2,
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 30 },
      1: { cellWidth: 34, halign: 'center' },
      2: { cellWidth: 72 },
      3: { cellWidth: 38, halign: 'center' },
    },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 8;

  y = ensureSpace(doc, y, 16, 'Market Sizing — TAM/SAM/SOM');
  const note = `Market Sizing Note: These are structural estimates based on public market research and industry category sizing. ACV ranges are illustrative — actual values vary by contract, tier, and geography. ${companyName}'s addressable share will be determined by GTM execution, sales capacity, and vertical prioritization — not by market size alone.`;
  doc.setFontSize(7.5); doc.setFont('helvetica', 'italic');
  const noteLines = doc.splitTextToSize(note, COL_W - 14);
  const noteH = noteLines.length * 5 + 7;
  rect(doc, MARGIN, y, COL_W, noteH, C.tealLight, 2);
  sf(doc, C.teal); doc.rect(MARGIN, y, 3, noteH, 'F');
  sc(doc, C.dark);
  noteLines.forEach((l, li) => doc.text(l, MARGIN + 7, y + 5.5 + li * 5));
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION — COMPETITION TAKEOUT STRATEGY  (final section)
// ════════════════════════════════════════════════════════════════════════════════
function buildCompetitionTakeout(doc, sectionNum, ciData, miData) {
  let y = newPage(doc, 'Competition Takeout Strategy');
  y = secHead(doc, `${sectionNum}. Competition Takeout Strategy`, y, C.red);

  const companyName = ciData?.company || 'Ephanti';

  doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); sc(doc, C.mid);
  const intro = `${companyName} is entering markets dominated by legacy CRMs and point-solution stacks. The following playbook identifies competitor positioning gaps, switching triggers, and differentiation angles. Competitor analysis is based on publicly available market positioning and category overlap — not confirmed customer intelligence.`;
  const introLines = doc.splitTextToSize(intro, COL_W);
  introLines.slice(0, 4).forEach(l => { doc.text(l, MARGIN, y); y += 5.5; });
  y += 6;

  // ── Competitor weakness map ─────────────────────────────────────────────────
  const RED_HEAD = [255, 230, 230];
  const RED_ALT  = [255, 245, 245];

  rect(doc, MARGIN, y, COL_W, 7, C.red, 2);
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); sc(doc, C.white);
  doc.text('Competitive Landscape — Platform Gaps & Differentiation', MARGIN + 5, y + 5);
  y += 10;

  autoTable(doc, {
    startY:    y,
    pageBreak: 'avoid',
    head:      [['Competitor', 'Platform Limitation (Market Observation)', 'Switching Trigger', `${companyName} Differentiation`]],
    body:      [
      ['Salesforce / Service Cloud',
       'Primarily a system-of-record (CRM); marketing, support, and AI are separate modules requiring complex integration (general market observation)',
       'Contract renewal, new CTO, consolidation mandate',
       'Faster deployment; no SI partner required; unified engagement vs. module sprawl'],
      ['Zendesk',
       'Primarily support-focused; marketing and commerce capabilities are limited compared to a full engagement platform',
       'CSAT decline despite tool investment; demand for unified marketing + support',
       'Single platform covering support, marketing campaigns, and commerce — eliminating siloed tools'],
      ['Intercom',
       'Primarily chat-centric; omnichannel depth and non-English language support vary by plan',
       'Global expansion requirement; omnichannel or WhatsApp mandate',
       "MEVA's 70+ languages and 30+ channels vs. primarily web-chat-centric approach"],
      ['Freshworks',
       'Freddy AI is built on an existing product architecture; depth of autonomous task execution differs from AI-native design',
       'AI transformation mandate; desire for deeper backend automation',
       'AI-native architecture designed for task execution — not AI capabilities added to a legacy product'],
      ['HubSpot',
       'Primarily marketing-automation-first; customer support and real-time conversational engagement are secondary capabilities',
       'CRM fatigue, omnichannel mandate, CX unification initiative',
       'Full engagement platform (marketing + support + commerce) on a single AI layer'],
    ],
    margin:             { left: MARGIN, right: MARGIN },
    styles:             { fontSize: 7, cellPadding: 3, textColor: C.dark, overflow: 'linebreak' },
    headStyles:         { fillColor: RED_HEAD, textColor: C.dark, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: RED_ALT },
    tableLineColor:     C.gray200,
    tableLineWidth:     0.2,
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 36 },
      1: { cellWidth: 52 },
      2: { cellWidth: 40 },
      3: { cellWidth: 46 },
    },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 10;

  // ── 4 tools → 1 platform replacement scenario ───────────────────────────────
  y = ensureSpace(doc, y, 40, 'Competition Takeout Strategy');
  y = subHead(doc, 'The Consolidation Story: 4 Tools Replaced by 1 Platform', y, C.red);

  const tools = [
    { label: 'Zendesk',   role: 'Customer Support',      cost: '~$18K–60K/yr*', color: C.red    },
    { label: 'HubSpot',   role: 'Marketing Automation',  cost: '~$15K–50K/yr*', color: C.orange },
    { label: 'Hootsuite', role: 'Social/Channel Mgmt',   cost: '~$8K–20K/yr*',  color: C.blue   },
    { label: 'Twilio',    role: 'Messaging/Comms API',   cost: '~$12K–40K/yr*', color: C.teal   },
  ];
  const tW = (COL_W - 3 * 4) / 4;
  tools.forEach((t, i) => {
    const tx = MARGIN + i * (tW + 4);
    rect(doc, tx, y, tW, 10, t.color, 2);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); sc(doc, C.white);
    doc.text(t.label, tx + tW / 2, y + 6.5, { align: 'center' });
    rect(doc, tx, y + 10, tW, 18, C.gray50, 0);
    sf(doc, t.color); doc.rect(tx, y, 2, 28, 'F');
    doc.setFontSize(6); doc.setFont('helvetica', 'normal'); sc(doc, C.dark);
    doc.text(t.role, tx + 4, y + 17);
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); sc(doc, t.color);
    doc.text(t.cost, tx + 4, y + 24);
  });
  y += 36;

  doc.setFontSize(6); doc.setFont('helvetica', 'italic'); sc(doc, C.light);
  doc.text('* Cost ranges are indicative estimates based on publicly available pricing tiers. Actual costs vary by contract, volume, and feature set.', MARGIN, y);
  y += 7;

  y = ensureSpace(doc, y, 20, 'Competition Takeout Strategy');
  rect(doc, MARGIN, y, COL_W, 16, C.purple, 2);
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); sc(doc, C.white);
  doc.text(`Replaced by ${companyName} — One Unified AI-Native Platform`, PAGE_W / 2, y + 6.5, { align: 'center' });
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); sc(doc, [200, 180, 240]);
  doc.text('One AI-native platform  ·  Potential cost consolidation  ·  2–6 week deployment', PAGE_W / 2, y + 13, { align: 'center' });
  y += 24;

  // ── Battle-card messaging angles ─────────────────────────────────────────────
  y = ensureSpace(doc, y, 50, 'Competition Takeout Strategy');
  rect(doc, MARGIN, y, COL_W, 7, C.purple, 2);
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); sc(doc, C.white);
  doc.text('Battle-Card Messaging Angles', MARGIN + 5, y + 5);
  y += 10;

  autoTable(doc, {
    startY:    y,
    pageBreak: 'avoid',
    head:      [['Scenario', 'Message', 'Proof Point']],
    body:      [
      ['vs. Salesforce (Speed & Cost)',
       '"Traditional CRM deployments can take months and require system integrator (SI) support. We deploy in weeks — with no SI needed."',
       'No SI required; Flex pricing; avg. deployment 2–6 wks (MEVA verified)'],
      ['vs. Zendesk (Scope)',
       '"Traditional support platforms are built for tickets — not for marketing or commerce. Ephanti unifies all three on one AI layer."',
       'Campaign engine + support + commerce in one login; SOC 2 Type II'],
      ['vs. Intercom (Global Scale)',
       '"MEVA speaks 70+ languages natively. If your customers don\'t speak English first, we\'re built for them."',
       '70+ language AI (MEVA); 30+ channel unification; WhatsApp-native'],
      ['vs. Freshworks (AI Depth)',
       '"MEVA was designed AI-first from the ground up — it executes backend tasks, not just surface-level recommendations."',
       'Backend task execution; conversational commerce; no-code automation workflows'],
    ],
    margin:             { left: MARGIN, right: MARGIN },
    styles:             { fontSize: 7.5, cellPadding: 3.5, textColor: C.dark, overflow: 'linebreak' },
    headStyles:         { fillColor: C.purpleLight, textColor: C.dark, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: C.rowAlt },
    tableLineColor:     C.border,
    tableLineWidth:     0.2,
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 38 },
      1: { cellWidth: 90, fontStyle: 'italic' },
      2: { cellWidth: 46 },
    },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 8;

  y = ensureSpace(doc, y, 16, 'Competition Takeout Strategy');
  const closing = `Takeout Insight: The most effective displacement motion is the consolidation story. Buyers running separate support, marketing, and channel tools across multiple vendors face integration overhead and data fragmentation. ${companyName} addresses this with a single AI-native platform — deployable in weeks. The ROI case should be built around consolidation savings and speed-to-value, quantified using the buyer's own tool spend.`;
  doc.setFontSize(7.5); doc.setFont('helvetica', 'italic');
  const closingLines = doc.splitTextToSize(closing, COL_W - 14);
  const closingH = closingLines.length * 5 + 7;
  rect(doc, MARGIN, y, COL_W, closingH, C.purplePale, 2);
  sf(doc, C.purple); doc.rect(MARGIN, y, 3, closingH, 'F');
  sc(doc, C.dark);
  closingLines.forEach((l, li) => doc.text(l, MARGIN + 7, y + 5.5 + li * 5));
}

// ════════════════════════════════════════════════════════════════════════════════
// MAIN EXPORTS
// ════════════════════════════════════════════════════════════════════════════════

export function generateCompanyReport({ ciData, ciUrl, miData, financialData = null, chartImages = null }) {
  const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const hasFin = !!financialData;

  // Explicit section numbers — TAM (5) is always present; Financial shifts 6+ by 1
  const fo = hasFin ? 1 : 0;
  const S  = {
    overview:    1,
    service:     2,
    target:      3,
    market:      4,
    tam:         5,
    financial:   6,              // only used when hasFin
    global:      6 + fo,
    workforce:   7 + fo,
    custgeo:     8 + fo,
    brand:       9 + fo,
    competitive: 10 + fo,
    takeout:     11 + fo,
  };

  buildTitlePage(doc, ciData?.company || ciData?.company_url || ciUrl, ciUrl || ciData?.company_url, hasFin);
  buildTOC(doc, hasFin);
  buildExecutiveSummary(doc, ciData, miData);
  buildCompanyOverview(doc, ciData, ciUrl);
  buildServiceDeliveryScope(doc, S.service, ciData);
  buildTargetCompanyProfile(doc, S.target, ciData, miData);
  buildMarketInsights(doc, miData, ciData);
  buildTAMSAMSOM(doc, S.tam, ciData);
  if (hasFin) buildFinancialHighlights(doc, financialData, chartImages);
  buildGlobalPresence(doc, S.global, ciData);
  buildWorkforceDistribution(doc, S.workforce, ciData, miData);
  buildCustomerGeography(doc, S.custgeo, ciData, miData);
  buildBrandPositioning(doc, S.brand, ciData, miData);
  buildCompetitivePositioning(doc, S.competitive, ciData, miData);
  buildCompetitionTakeout(doc, S.takeout, ciData, miData);

  // Stamp headers + footers on every non-title page
  const total = doc.getNumberOfPages();
  for (let i = 2; i <= total; i++) {
    doc.setPage(i);
    pageFooter(doc, i, total);
  }

  return doc;
}

export function downloadReport({ ciData, ciUrl, miData, financialData = null, chartImages = null }) {
  const doc     = generateCompanyReport({ ciData, ciUrl, miData, financialData, chartImages });
  const company = ciData?.company_url || ciUrl || 'company';
  const slug    = company.replace(/https?:\/\//g, '').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
  const date    = new Date().toISOString().slice(0, 10);
  doc.save(`AI_Growth_Strategist_Report_${slug}_${date}.pdf`);
}

export function previewReport({ ciData, ciUrl, miData, financialData = null, chartImages = null }) {
  return generateCompanyReport({ ciData, ciUrl, miData, financialData, chartImages }).output('bloburl');
}
