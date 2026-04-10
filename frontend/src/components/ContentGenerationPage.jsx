import { useState, useEffect } from "react";
import logo from "../assets/Logo.png";
import { useAppContext } from "../AppContext";
import { apiPost } from "../api/client";
import ErrorBox from "./ui/ErrorBox";

// ── Static catalogues ──────────────────────────────────────────────────────────
const BLOG_TEMPLATES = [
  { key: "listicle",           name: "Listicle",           description: "Top 5 / Top 10 numbered list." },
  { key: "how_to_guide",       name: "How-to Guide",       description: "Step-by-step walkthrough." },
  { key: "thought_leadership", name: "Thought Leadership", description: "Opinion-driven insight piece." },
  { key: "case_study",         name: "Case Study",         description: "Story-driven results showcase." },
];
const EMAIL_TEMPLATES = [
  { key: "cold_outreach", name: "Cold Outreach", description: "First-touch hook email." },
  { key: "product_pitch", name: "Product Pitch", description: "Pain → solution → proof." },
  { key: "newsletter",    name: "Newsletter",    description: "Value-driven periodic update." },
  { key: "follow_up",     name: "Follow-up",     description: "Re-engagement email." },
];
const CONTENT_TYPES   = [
  { key: "blog",     label: "Blog Content",      icon: "📝" },
  { key: "email",    label: "Email Content",      icon: "📧" },
  { key: "linkedin", label: "LinkedIn Message",   icon: "💼" },
];
const TONES           = ["Professional", "Conversational", "Persuasive", "Technical", "Friendly"];
const AUDIENCE_LEVELS = ["Beginner", "Intermediate", "Expert"];
const LENGTHS = [
  { key: "short",  label: "Short",  hint: "~200–300 words" },
  { key: "medium", label: "Medium", hint: "~400–600 words" },
  { key: "long",   label: "Long",   hint: "~700–1000 words" },
];

const normalizeUrl = (s) => { const t = s.trim(); return /^https?:\/\//i.test(t) ? t : `https://${t}`; };

// Renders markdown-like headings and paragraphs
const ContentDisplay = ({ content }) => (
  <div className="space-y-1.5 leading-relaxed">
    {content.split("\n").map((line, i) => {
      if (line.startsWith("## "))  return <h2 key={i} className="text-sm font-bold text-gray-900 mt-4 first:mt-0">{line.slice(3)}</h2>;
      if (line.startsWith("### ")) return <h3 key={i} className="text-xs font-semibold text-gray-700 mt-3">{line.slice(4)}</h3>;
      if (line === "---")           return <hr key={i} className="my-2" style={{ borderColor: "#b8a898" }} />;
      if (!line.trim())             return <div key={i} className="h-1" />;
      return <p key={i} className="text-xs text-gray-600 leading-relaxed">{line}</p>;
    })}
  </div>
);

// Collapsible accordion section for the settings sidebar
const SettingsSection = ({ title, isOpen, onToggle, children }) => (
  <div className="py-1">
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between py-2 text-left hover:opacity-80 transition-opacity"
    >
      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">{title}</p>
      <span
        className="text-[10px] text-gray-400 transition-transform duration-200 inline-block"
        style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
      >
        ▼
      </span>
    </button>
    {isOpen && <div className="pb-2 space-y-1">{children}</div>}
  </div>
);

// ── Main Component ─────────────────────────────────────────────────────────────
const ContentGenerationPage = ({ user, onSignOut }) => {
  const { ciUrl, miData, addCgItem, selectedProspect } = useAppContext();
  const miTopics = miData?.content_topics || [];

  const [selectedTopic,    setSelectedTopic]    = useState("");
  const [useCustomTopic,   setUseCustomTopic]   = useState(false);
  const [customTopicInput, setCustomTopicInput] = useState("");
  const [contentType,      setContentType]      = useState("blog");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [tone,             setTone]             = useState("professional");
  const [audienceLevel,    setAudienceLevel]    = useState("intermediate");
  const [length,           setLength]           = useState("medium");
  const [includeCta,       setIncludeCta]       = useState(true);
  const [seoKeywords,      setSeoKeywords]      = useState("");
  const [generateBoth,     setGenerateBoth]     = useState(false);
  const [loading,          setLoading]          = useState(false);
  const [error,            setError]            = useState("");
  const [result,           setResult]           = useState(null);
  const [resultB,          setResultB]          = useState(null);
  const [fromCache,        setFromCache]        = useState(false);
  const [activeTab,        setActiveTab]        = useState("primary");
  const [rewriteMode,      setRewriteMode]      = useState(false);
  const [rewriteTone,      setRewriteTone]      = useState("");

  // ── LinkedIn Message state ─────────────────────────────────────────────────
  const [linkedinResult,       setLinkedinResult]       = useState(null);
  const [linkedinLoading,      setLinkedinLoading]      = useState(false);
  const [linkedinCopied,       setLinkedinCopied]       = useState(false);
  const [linkedinRecipientUrl, setLinkedinRecipientUrl] = useState("");

  // ── SEO keyword suggestion state ───────────────────────────────────────────
  const [kwSuggestLoading, setKwSuggestLoading] = useState(false);

  // ── Send Email state ───────────────────────────────────────────────────────
  const [sendFromEmail,  setSendFromEmail]  = useState("");
  const [sendToEmail,    setSendToEmail]    = useState("");
  const [sendSubject,    setSendSubject]    = useState("");
  const [sendLoading,    setSendLoading]    = useState(false);
  const [sendSuccess,    setSendSuccess]    = useState(false);
  const [sendError,      setSendError]      = useState("");

  // ── SEO Analysis state ────────────────────────────────────────────────────
  const [seoAnalysis,     setSeoAnalysis]     = useState(null);
  const [seoAnalyzing,    setSeoAnalyzing]    = useState(false);
  const [seoError,        setSeoError]        = useState("");
  const [seoExpanded,     setSeoExpanded]     = useState(false);

  // Collapsible settings — tone open by default, rest collapsed
  const [openSections, setOpenSections] = useState({
    tone: true, audience: false, length: false, seo: false, options: false,
  });
  const toggleSection = (key) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  const effectiveTopic = useCustomTopic ? customTopicInput.trim() : selectedTopic;
  const templates      = contentType === "blog" ? BLOG_TEMPLATES : EMAIL_TEMPLATES;

  // ── API ──────────────────────────────────────────────────────────────────────
  const generate = async ({ overrideTone = null, overrideType = null, forceRefresh = false, isSecondary = false } = {}) => {
    if (!effectiveTopic) return;
    setLoading(true); setError("");
    const url      = ciUrl ? normalizeUrl(ciUrl) : "";
    const kwArr    = seoKeywords.split(",").map(s => s.trim()).filter(Boolean);
    const useTone  = overrideTone || tone;
    const useType  = overrideType || contentType;
    const useTempl = overrideType
      ? (overrideType === "blog" ? BLOG_TEMPLATES[0].key : EMAIL_TEMPLATES[0].key)
      : selectedTemplate;
    try {
      const data = await apiPost("/api/content-generation", {
        company_url:    url,
        topic:          effectiveTopic,
        content_type:   useType,
        tone:           useTone,
        audience_level: audienceLevel,
        length,
        template:       useTempl,
        keywords:       kwArr,
        use_template:   true,
        include_cta:    includeCta,
        force_refresh:  forceRefresh,
        prospect_name:  selectedProspect?.name  || null,
        prospect_role:  selectedProspect?.title || null,
        // Pass Apify enrichment data if available — elevates to HIGH personalization
        linkedin_data:  selectedProspect?.enrichment || null,
      });
      if (isSecondary) { setResultB(data); }
      else             { setResult(data); setFromCache(!!data.from_cache); setActiveTab("primary"); }
    } catch (e) { setError(e.message); }
    finally     { setLoading(false); }
  };

  const handleGenerate    = () => { setResult(null); setResultB(null); setRewriteMode(false); setSendSuccess(false); setSendError(""); generate(); if (generateBoth) setTimeout(() => generate({ overrideType: contentType === "blog" ? "email" : "blog", isSecondary: true }), 400); };
  const handleRegenerate  = () => generate({ forceRefresh: true });
  const handleRewriteTone = () => { if (rewriteTone) { generate({ overrideTone: rewriteTone, forceRefresh: true }); setRewriteMode(false); } };
  const handleCopy        = (text) => navigator.clipboard.writeText(text).catch(() => {});
  const handleDownload    = (text, topic, type) => { const blob = new Blob([text], { type: "text/plain" }); const url = URL.createObjectURL(blob); const a = Object.assign(document.createElement("a"), { href: url, download: `${topic.slice(0, 40).replace(/\s+/g, "_")}_${type}.txt` }); a.click(); URL.revokeObjectURL(url); };

  // Pre-fill "To" email + LinkedIn URL when arriving from Lead Discovery
  useEffect(() => {
    if (selectedProspect?.email) {
      setSendToEmail(selectedProspect.email);
    }
    if (selectedProspect?.linkedin) {
      setLinkedinRecipientUrl(selectedProspect.linkedin);
    }
  }, [selectedProspect]);

  // Auto-populate SEO keywords from MI keyword clusters when MI data is available
  useEffect(() => {
    if (miData?.keyword_clusters?.length > 0 && !seoKeywords) {
      const allKws = miData.keyword_clusters.flatMap(c => c.keywords || []);
      const top = allKws.slice(0, 8).join(", ");
      setSeoKeywords(top);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miData]);

  // Reset LinkedIn result when switching content type
  useEffect(() => {
    setLinkedinResult(null);
    setLinkedinCopied(false);
  }, [contentType]);

  // Auto-fill email subject when an email result is generated
  useEffect(() => {
    if (result && result.content_type === "email") {
      const match = result.content.match(/^Subject:\s*(.+)$/m);
      setSendSubject(match ? match[1].trim() : result.topic || "");
      setSendSuccess(false);
      setSendError("");
    }
  }, [result]);

  // Auto-run SEO analysis when a blog result is generated
  useEffect(() => {
    if (result && result.content_type === "blog" && result.content) {
      setSeoAnalysis(null);
      setSeoError("");
      const kwArr = seoKeywords.split(",").map(s => s.trim()).filter(Boolean);
      setSeoAnalyzing(true);
      apiPost("/api/seo-analyze", {
        content: result.content, keywords: kwArr, topic: effectiveTopic, length_hint: length,
      })
        .then(data => { if (data) setSeoAnalysis(data); })
        .catch(() => {})
        .finally(() => setSeoAnalyzing(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const handleSendEmail = async () => {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(sendFromEmail)) { setSendError("Invalid sender email address."); return; }
    if (!emailRe.test(sendToEmail))   { setSendError("Invalid recipient email address."); return; }
    setSendLoading(true); setSendError(""); setSendSuccess(false);
    try {
      await apiPost("/api/send-email", {
        from_email: sendFromEmail, to_email: sendToEmail, subject: sendSubject, content: result.content,
      });
      setSendSuccess(true);
      setTimeout(() => setSendSuccess(false), 5000);
    } catch (e) { setSendError(e.message); }
    finally     { setSendLoading(false); }
  };

  // ── LinkedIn Message generation ───────────────────────────────────────────────
  const generateLinkedIn = async () => {
    setLinkedinLoading(true);
    setLinkedinResult(null);
    setError("");
    const url = ciUrl ? normalizeUrl(ciUrl) : "";
    try {
      const data = await apiPost("/api/linkedin-message", {
        company_url:      url,
        topic:            effectiveTopic || "connecting",
        prospect_name:    selectedProspect?.name     || "",
        prospect_company: selectedProspect?.company  || "",
        prospect_role:    selectedProspect?.title    || "",
        // Pass Apify enrichment data if available — elevates to HIGH personalization
        linkedin_data:    selectedProspect?.enrichment || null,
      });
      setLinkedinResult(data);
    } catch (e) { setError(e.message); }
    finally { setLinkedinLoading(false); }
  };

  const handleSendViaLinkedIn = async () => {
    if (!linkedinResult?.content) return;
    // Copy to clipboard — try modern API, fall back to execCommand
    let copied = false;
    try {
      await navigator.clipboard.writeText(linkedinResult.content);
      copied = true;
    } catch (_) {
      try {
        const ta = document.createElement("textarea");
        ta.value = linkedinResult.content;
        ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        copied = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch (__) {}
    }
    setLinkedinCopied(copied);
    if (copied) setTimeout(() => setLinkedinCopied(false), 6000);
    // Use the editable recipient URL field (may be typed manually or auto-filled from prospect)
    const profileUrl = linkedinRecipientUrl.trim();
    const encodedBody = encodeURIComponent(linkedinResult.content);
    let linkedinUrl  = "https://www.linkedin.com/messaging/";
    if (profileUrl) {
      const match = profileUrl.match(/linkedin\.com\/in\/([^/?#\s]+)/i);
      if (match) {
        linkedinUrl = `https://www.linkedin.com/messaging/compose/?recipient=${match[1]}&body=${encodedBody}`;
      } else {
        linkedinUrl = `https://www.linkedin.com/messaging/compose/?body=${encodedBody}`;
      }
    } else {
      linkedinUrl = `https://www.linkedin.com/messaging/compose/?body=${encodedBody}`;
    }
    window.open(linkedinUrl, "_blank");
  };

  // ── SEO keyword AI suggestions ────────────────────────────────────────────────
  const suggestKeywords = async () => {
    if (!effectiveTopic) return;
    setKwSuggestLoading(true);
    const url = ciUrl ? normalizeUrl(ciUrl) : "";
    try {
      const data = await apiPost("/api/suggest-keywords", { company_url: url, topic: effectiveTopic });
      if (data.keywords?.length > 0) {
        setSeoKeywords(data.keywords.join(", "));
      }
    } catch (_) { /* best-effort — silently skip if unavailable */ }
    finally { setKwSuggestLoading(false); }
  };

  // ── SEO Analysis ─────────────────────────────────────────────────────────────
  const analyzeSEO = async () => {
    const content = activeTab === "primary" ? result?.content : resultB?.content;
    if (!content) return;
    setSeoAnalyzing(true); setSeoError(""); setSeoAnalysis(null);
    const kwArr = seoKeywords.split(",").map(s => s.trim()).filter(Boolean);
    try {
      const data = await apiPost("/api/seo-analyze", {
        content, keywords: kwArr, topic: effectiveTopic, length_hint: length,
      });
      setSeoAnalysis(data);
      setSeoExpanded(true);
    } catch (e) { setSeoError(e.message); }
    finally { setSeoAnalyzing(false); }
  };

  // ── Shared inline style tokens — mirrors Market Intelligence page exactly ────
  const S = {
    page:       { backgroundColor: "#F6E5FF" },
    topbar:     { backgroundColor: "#F2DFFF" },
    panel:      { backgroundColor: "#ffffff", border: "1px solid #e5e7eb", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden" },
    panelHdr:   { backgroundColor: "#f9fafb", borderBottom: "1px solid #e5e7eb", padding: "10px 16px" },
    cardDefault:{ backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "8px" },
    cardActive: { backgroundColor: "#f3eeff", border: "2px solid #9b72d0", borderRadius: "8px" },
    btnGreen:   { backgroundColor: "#BFD8B8", borderColor: "#7aaa7a" },
    btnPurple:  { backgroundColor: "#9b72d0" },
    btnSecond:  { backgroundColor: "#f9fafb", borderColor: "#e5e7eb" },
    inputStyle: { backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "8px" },
    segCard:    { backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "8px" },
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={S.page}>

      {/* ── Top bar — identical to Market Intelligence ─────────────────────── */}
      <div
        className="border-b px-8 h-14 flex items-center justify-between overflow-visible"
        style={{ ...S.topbar, borderColor: "#b8a898" }}
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
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-gray-700 active:scale-95 transition-all"
                style={{ ...S.btnSecond, border: "1px solid #b8a898" }}
              >
                ⎋ Sign Out
              </button>
            </div>
          )}
          <img src={logo} alt="Logo" className="h-32 w-auto object-contain" />
        </div>
      </div>

      {/* ── Page container ──────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-8 pt-5 pb-10">

        {/* Page title */}
        <div className="mb-5">
          <h1 className="text-xl font-bold text-gray-900 tracking-tight leading-tight">Content Generation</h1>
          <p className="text-xs text-gray-600 mt-0.5">
            Select a topic from Market Intelligence, choose a template, and generate structured content.
          </p>
        </div>

        {/* Prospect banner — shown when arriving from Lead Discovery */}
        {selectedProspect && (
          <div
            className="mb-5 flex items-center gap-3 px-4 py-3 rounded-xl border border-indigo-300 shadow-sm"
            style={{ backgroundColor: "#ede9fe" }}
          >
            <span className="text-lg">🎯</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-indigo-800">
                Composing for: {selectedProspect.name}
                {selectedProspect.title ? ` — ${selectedProspect.title}` : ""}
              </p>
              <p className="text-[11px] text-indigo-600 truncate">
                {selectedProspect.company}
                {selectedProspect.email ? ` · ${selectedProspect.email}` : ""}
              </p>
            </div>
            <span className="text-[10px] text-indigo-500 font-medium shrink-0">
              To: auto-filled ↓
            </span>
          </div>
        )}

        {/* 3-column grid: 30% / 45% / 25% */}
        <div className="grid gap-6 items-start" style={{ gridTemplateColumns: "30% 45% 25%" }}>

          {/* ═══ LEFT — Topic Selection ════════════════════════════════════ */}
          <div style={S.panel}>
            <div style={S.panelHdr}>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Select Topic</p>
            </div>

            <div className="p-4 space-y-2">
              {miTopics.length > 0 ? (
                <>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest pb-1">
                    From Market Intelligence
                  </p>
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-0.5">
                    {miTopics.map((topic, i) => {
                      const isSel = !useCustomTopic && selectedTopic === topic.title;
                      return (
                        <button
                          key={i}
                          onClick={() => { setSelectedTopic(topic.title); setUseCustomTopic(false); }}
                          className="w-full text-left p-3 transition-all"
                          style={isSel ? S.cardActive : S.cardDefault}
                        >
                          <div className="flex items-start justify-between gap-1.5">
                            <span className="text-xs font-semibold leading-snug" style={{ color: isSel ? "#6b21a8" : "#1f2937" }}>
                              {topic.title}
                            </span>
                            {i === 0 && (
                              <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "#ff9800", color: "#fff" }}>
                                🔥
                              </span>
                            )}
                          </div>
                          {topic.angle && (
                            <p className="text-[10px] text-gray-500 mt-1 leading-snug">{topic.angle}</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="py-6 text-center space-y-1.5">
                  <span className="text-2xl">📊</span>
                  <p className="text-xs font-semibold text-gray-500">No topics yet</p>
                  <p className="text-[10px] text-gray-400 max-w-[180px] mx-auto">
                    Run Market Intelligence first to get AI-suggested topics.
                  </p>
                </div>
              )}

              {/* Custom topic input */}
              <div className="pt-3 mt-1 space-y-2" style={{ borderTop: "1px solid #b8a898" }}>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                  Or write your own
                </p>
                <input
                  type="text"
                  value={customTopicInput}
                  onChange={(e) => { setCustomTopicInput(e.target.value); setUseCustomTopic(true); setSelectedTopic(""); }}
                  onFocus={() => setUseCustomTopic(true)}
                  placeholder="Type a custom topic…"
                  className="w-full px-3 py-2 text-xs text-gray-800 placeholder-gray-400 focus:outline-none transition-all"
                  style={{
                    ...S.inputStyle,
                    ...(useCustomTopic && customTopicInput ? { border: "2px solid #9b72d0" } : {}),
                  }}
                />
                {useCustomTopic && customTopicInput && (
                  <p className="text-[10px] font-semibold" style={{ color: "#9b72d0" }}>✓ Using custom topic</p>
                )}
              </div>

              {/* Selected indicator */}
              {effectiveTopic && (
                <div className="mt-2 p-3 rounded-lg" style={{ backgroundColor: "#f3eeff", border: "1px solid #9b72d0" }}>
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: "#9b72d0" }}>Selected</p>
                  <p className="text-xs font-semibold text-gray-800 leading-snug">{effectiveTopic}</p>
                </div>
              )}
            </div>
          </div>

          {/* ═══ CENTER — Steps + Output ═══════════════════════════════════ */}
          <div className="space-y-4">

            {/* Empty state */}
            {!effectiveTopic && (
              <div style={S.panel}>
                <div className="p-12 flex flex-col items-center gap-4 text-center">
                  <span className="text-4xl">✍️</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-700">No topic selected</p>
                    <p className="text-xs text-gray-400 mt-1 max-w-xs">
                      Choose a topic from the left panel — from Market Intelligence or write your own.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Step 1 — Content Type */}
            {effectiveTopic && (
              <div style={S.panel}>
                <div style={S.panelHdr}>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Step 1 — Content Type</p>
                </div>
                <div className="p-4 flex gap-3">
                  {CONTENT_TYPES.map((ct) => {
                    const active = contentType === ct.key;
                    return (
                      <button
                        key={ct.key}
                        onClick={() => { setContentType(ct.key); setSelectedTemplate(""); }}
                        className="flex-1 py-4 font-semibold text-sm transition-all flex items-center justify-center gap-2"
                        style={{
                          ...(active ? S.cardActive : S.cardDefault),
                          color: active ? "#6b21a8" : "#4b5563",
                        }}
                      >
                        <span className="text-xl">{ct.icon}</span>
                        <span>{ct.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 2 — Template (hidden for LinkedIn) */}
            {effectiveTopic && contentType !== "linkedin" && (
              <div style={S.panel}>
                <div style={S.panelHdr}>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Step 2 — Choose Template</p>
                </div>
                <div className="p-4 grid grid-cols-2 gap-3">
                  {templates.map((tpl) => {
                    const active = selectedTemplate === tpl.key;
                    return (
                      <button
                        key={tpl.key}
                        onClick={() => setSelectedTemplate(tpl.key)}
                        className="text-left p-3 transition-all"
                        style={{ ...(active ? S.cardActive : S.cardDefault), minHeight: "72px" }}
                      >
                        <p className="text-xs font-semibold leading-tight" style={{ color: active ? "#6b21a8" : "#1f2937" }}>
                          {tpl.name}
                        </p>
                        <p className="text-[10px] text-gray-500 leading-snug mt-1">{tpl.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Generate button — LinkedIn variant */}
            {contentType === "linkedin" && (effectiveTopic || selectedProspect) && (
              <button
                onClick={generateLinkedIn}
                disabled={linkedinLoading}
                className="w-full py-3 rounded-xl text-sm font-bold text-gray-800 border-2 shadow-md hover:shadow-lg hover:brightness-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: "#c7d2fe", borderColor: "#6366f1" }}
              >
                {linkedinLoading ? "Generating…" : "💼 Generate LinkedIn Message"}
              </button>
            )}

            {/* Generate button — Blog / Email variant */}
            {effectiveTopic && selectedTemplate && contentType !== "linkedin" && (
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="w-full py-3 rounded-xl text-sm font-bold text-gray-800 border-2 shadow-md hover:shadow-lg hover:brightness-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={S.btnGreen}
              >
                {loading
                  ? "Generating…"
                  : generateBoth
                    ? "✨ Generate Blog + Email"
                    : `✨ Generate ${contentType === "blog" ? "Blog" : "Email"} Content`}
              </button>
            )}

            {/* Loading */}
            {loading && (
              <div style={S.panel}>
                <div className="p-10 flex flex-col items-center gap-4">
                  <svg className="animate-spin h-8 w-8 text-gray-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  <p className="text-sm font-semibold text-gray-700">Filling template with AI…</p>
                  <p className="text-xs text-gray-400">Claude is structuring your content.</p>
                </div>
              </div>
            )}

            {/* Error */}
            {!loading && error && (
              <div className="space-y-2">
                <ErrorBox message={error} onDismiss={() => setError("")} />
                <div className="flex justify-center">
                  <button onClick={handleGenerate} className="px-4 py-1.5 rounded-lg text-xs font-semibold text-red-700 border border-red-300 hover:bg-red-100 transition-all">
                    ↺ Try again
                  </button>
                </div>
              </div>
            )}

            {/* Output */}
            {!loading && (result || resultB) && (
              <div style={S.panel}>

                {/* Tab bar */}
                <div className="flex items-center" style={{ backgroundColor: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                  {result && (
                    <button
                      onClick={() => setActiveTab("primary")}
                      className="px-5 py-3 text-xs font-bold border-b-2 transition-all"
                      style={{ borderColor: activeTab === "primary" ? "#9b72d0" : "transparent", color: activeTab === "primary" ? "#6b21a8" : "#6b7280" }}
                    >
                      {result.content_type === "blog" ? "📝" : "📧"} {result.template_name}
                    </button>
                  )}
                  {resultB && (
                    <button
                      onClick={() => setActiveTab("secondary")}
                      className="px-5 py-3 text-xs font-bold border-b-2 transition-all"
                      style={{ borderColor: activeTab === "secondary" ? "#9b72d0" : "transparent", color: activeTab === "secondary" ? "#6b21a8" : "#6b7280" }}
                    >
                      {resultB.content_type === "blog" ? "📝" : "📧"} {resultB.template_name}
                    </button>
                  )}
                  {fromCache && activeTab === "primary" && (
                    <span className="ml-auto mr-3 text-[10px] font-semibold px-2 py-0.5 rounded-full border" style={{ backgroundColor: "#e0f2fe", borderColor: "#7dd3fc", color: "#0369a1" }}>
                      ⚡ Loaded from cache
                    </span>
                  )}
                  {/* Personalization level badge */}
                  {result?.personalization_level && activeTab === "primary" && (
                    <span
                      className="mr-3 text-[10px] font-bold px-2 py-0.5 rounded-full border"
                      title={result.enrichment_used ? "LinkedIn enrichment data was used" : "No LinkedIn enrichment — pass Apify data for HIGH personalization"}
                      style={{
                        backgroundColor: result.personalization_level === "HIGH" ? "#dcfce7" : result.personalization_level === "MEDIUM" ? "#fef9c3" : "#f3f4f6",
                        borderColor:     result.personalization_level === "HIGH" ? "#86efac" : result.personalization_level === "MEDIUM" ? "#fde047" : "#d1d5db",
                        color:           result.personalization_level === "HIGH" ? "#166534" : result.personalization_level === "MEDIUM" ? "#854d0e" : "#6b7280",
                      }}
                    >
                      {result.personalization_level === "HIGH" ? "🎯 HIGH personalization" : result.personalization_level === "MEDIUM" ? "✓ MEDIUM personalization" : "○ LOW personalization"}
                    </span>
                  )}
                </div>

                {/* Content body */}
                {(() => {
                  const ar = activeTab === "primary" ? result : resultB;
                  if (!ar) return null;
                  return (
                    <div className="p-5 space-y-4">

                      {/* Meta badges — matches MI's segment card style */}
                      <div className="flex flex-wrap gap-1.5">
                        {[ar.tone, ar.audience_level, ar.length].filter(Boolean).map((b, i) => (
                          <span key={i} className="text-[10px] font-medium px-2.5 py-0.5 rounded-full" style={{ backgroundColor: "#f5f0eb", border: "1px solid #b8a898", color: "#4b5563" }}>
                            {b}
                          </span>
                        ))}
                        {(ar.keywords || []).map((kw, i) => (
                          <span key={i} className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#dbeafe", border: "1px solid #93c5fd", color: "#1d4ed8" }}>
                            #{kw}
                          </span>
                        ))}
                      </div>

                      {/* Generated text area */}
                      <div className="rounded-lg p-5" style={S.segCard}>
                        <ContentDisplay content={ar.content} />
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {[
                          { label: "📋 Copy",      fn: () => handleCopy(ar.content) },
                          { label: "⬇ Download",   fn: () => handleDownload(ar.content, ar.topic, ar.content_type) },
                          { label: "↺ Regenerate", fn: handleRegenerate },
                        ].map(({ label, fn }) => (
                          <button
                            key={label}
                            onClick={fn}
                            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-gray-700 active:scale-95 transition-all hover:brightness-105"
                            style={{ ...S.btnSecond, border: "1px solid #b8a898" }}
                          >
                            {label}
                          </button>
                        ))}
                        <button
                          onClick={() => setRewriteMode(!rewriteMode)}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                          style={
                            rewriteMode
                              ? { backgroundColor: "#f3eeff", border: "2px solid #9b72d0", color: "#6b21a8" }
                              : { ...S.btnSecond, border: "1px solid #b8a898", color: "#374151" }
                          }
                        >
                          🎨 Rewrite Tone
                        </button>
                        <button
                          onClick={() => addCgItem(ar)}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border-2 active:scale-95 transition-all hover:brightness-105"
                          style={{ backgroundColor: "#BFD8B8", borderColor: "#7aaa7a", color: "#14532d" }}
                        >
                          💾 Save
                        </button>
                      </div>

                      {/* Rewrite tone picker */}
                      {rewriteMode && (
                        <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: "#f3eeff", border: "1px solid #9b72d0" }}>
                          <p className="text-xs font-semibold" style={{ color: "#6b21a8" }}>Select new tone to rewrite with</p>
                          <div className="flex flex-wrap gap-2">
                            {TONES.map((t) => (
                              <button
                                key={t}
                                onClick={() => setRewriteTone(t.toLowerCase())}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                                style={
                                  rewriteTone === t.toLowerCase()
                                    ? { backgroundColor: "#ffffff", border: "2px solid #9b72d0", color: "#6b21a8" }
                                    : { ...S.btnSecond, border: "1px solid #b8a898", color: "#374151" }
                                }
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={handleRewriteTone}
                            disabled={!rewriteTone}
                            className="px-5 py-2 rounded-lg text-xs font-bold text-gray-800 border-2 shadow-sm hover:brightness-105 active:scale-95 transition-all disabled:opacity-40"
                            style={S.btnGreen}
                          >
                            Apply Rewrite
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── SEO Badge (auto-analyzed, no button) ─────────────────── */}
            {result && contentType === "blog" && (
              <div className="flex items-center gap-2 px-1">
                {seoAnalyzing && (
                  <span className="text-[10px] text-gray-400 italic">Scoring SEO…</span>
                )}
                {!seoAnalyzing && seoAnalysis && (
                  <span
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold shadow-sm"
                    style={{
                      backgroundColor: seoAnalysis.overall_score >= 75 ? "#dcfce7" : seoAnalysis.overall_score >= 50 ? "#dbeafe" : "#fef9c3",
                      color: seoAnalysis.overall_score >= 75 ? "#166534" : seoAnalysis.overall_score >= 50 ? "#1e40af" : "#854d0e",
                    }}
                  >
                    {seoAnalysis.overall_score >= 60 ? "✅" : "📊"} SEO Score: {seoAnalysis.overall_score}/100 — Grade {seoAnalysis.grade}
                  </span>
                )}
              </div>
            )}

            {/* ── LinkedIn Message Loading ──────────────────────────────── */}
            {linkedinLoading && (
              <div style={S.panel}>
                <div className="p-10 flex flex-col items-center gap-4">
                  <svg className="animate-spin h-8 w-8" style={{ color: "#6366f1" }} fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  <p className="text-sm font-semibold text-gray-700">Crafting your LinkedIn message…</p>
                  <p className="text-xs text-gray-400">Personalizing for {selectedProspect?.name || "your prospect"}.</p>
                </div>
              </div>
            )}

            {/* ── LinkedIn Message Result ───────────────────────────────── */}
            {!linkedinLoading && linkedinResult && contentType === "linkedin" && (
              <div style={S.panel}>
                <div style={{ ...S.panelHdr, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">💼 LinkedIn Message</p>
                  {selectedProspect?.name && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#e0e7ff", color: "#3730a3" }}>
                      For: {selectedProspect.name}
                    </span>
                  )}
                </div>

                <div className="p-5 space-y-4">
                  {/* Message card */}
                  <div
                    className="rounded-xl p-5 leading-relaxed text-sm text-gray-800 whitespace-pre-line"
                    style={{ backgroundColor: "#f0f4ff", border: "1.5px solid #a5b4fc" }}
                  >
                    {linkedinResult.content}
                  </div>

                  {/* ── Recipient URL field (editable "To") ────────────────── */}
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">
                      Send To — LinkedIn Profile URL
                    </p>
                    <input
                      type="text"
                      value={linkedinRecipientUrl}
                      onChange={e => setLinkedinRecipientUrl(e.target.value)}
                      placeholder="https://www.linkedin.com/in/username  (or leave blank for general messaging)"
                      className="w-full px-3 py-2 text-xs text-gray-800 placeholder-gray-400 focus:outline-none transition-all"
                      style={S.inputStyle}
                    />
                    <p className="text-[10px] text-gray-400 mt-1">
                      Pre-filled from selected lead. Edit to target someone not in your leads list.
                    </p>
                  </div>

                  {/* ── From account notice ─────────────────────────────────── */}
                  <div
                    className="flex items-start gap-2 px-3 py-2 rounded-lg text-[11px]"
                    style={{ backgroundColor: "#fef9c3", border: "1px solid #fde047", color: "#854d0e" }}
                  >
                    <span className="text-base leading-none mt-0.5">ℹ️</span>
                    <span>
                      <strong>From account:</strong> The message will be sent from <strong>your currently logged-in LinkedIn account</strong> in the browser — no credentials are stored by this app. Make sure you're logged into the right account before clicking "Send via LinkedIn".
                    </span>
                  </div>

                  {/* Copied toast */}
                  {linkedinCopied && (
                    <div
                      className="rounded-lg px-3 py-2 text-sm font-bold flex items-center gap-2"
                      style={{ backgroundColor: "#f0fdf4", border: "2px solid #22c55e", color: "#15803d" }}
                    >
                      ✅ Message copied! Switch to LinkedIn and press <kbd style={{ background: "#dcfce7", borderRadius: 4, padding: "1px 5px", fontFamily: "monospace" }}>Ctrl+V</kbd> to paste.
                    </div>
                  )}

                  {/* Helper text */}
                  <p className="text-[11px] text-gray-500 italic">
                    Click "Send via LinkedIn" — the message will be pre-filled in the LinkedIn chat box. Just hit Send.
                  </p>

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(linkedinResult.content).catch(() => {});
                        setLinkedinCopied(true);
                        setTimeout(() => setLinkedinCopied(false), 3000);
                      }}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-gray-700 active:scale-95 transition-all hover:brightness-105"
                      style={{ ...S.btnSecond, border: "1px solid #b8a898" }}
                    >
                      📋 Copy Message
                    </button>
                    <button
                      onClick={generateLinkedIn}
                      disabled={linkedinLoading}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-gray-700 active:scale-95 transition-all hover:brightness-105"
                      style={{ ...S.btnSecond, border: "1px solid #b8a898" }}
                    >
                      ↺ Regenerate
                    </button>
                    <button
                      onClick={handleSendViaLinkedIn}
                      className="px-4 py-1.5 rounded-lg text-xs font-bold text-white active:scale-95 transition-all hover:brightness-110 shadow-sm"
                      style={{ backgroundColor: "#0a66c2" }}
                    >
                      👉 Send via LinkedIn
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Send Email — shown when email content is generated ─────── */}
            {!loading && result && result.content_type === "email" && (
              <div style={S.panel}>
                <div style={S.panelHdr}>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">📨 Send Email</p>
                </div>
                <div className="p-4 space-y-3">
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">From</p>
                    <input
                      type="email" value={sendFromEmail} onChange={(e) => setSendFromEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full px-3 py-2 text-xs text-gray-800 placeholder-gray-400 focus:outline-none transition-all"
                      style={S.inputStyle}
                    />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">To</p>
                    <input
                      type="email" value={sendToEmail} onChange={(e) => setSendToEmail(e.target.value)}
                      placeholder="recipient@email.com"
                      className="w-full px-3 py-2 text-xs text-gray-800 placeholder-gray-400 focus:outline-none transition-all"
                      style={S.inputStyle}
                    />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Subject</p>
                    <input
                      type="text" value={sendSubject} onChange={(e) => setSendSubject(e.target.value)}
                      placeholder="Email subject…"
                      className="w-full px-3 py-2 text-xs text-gray-800 placeholder-gray-400 focus:outline-none transition-all"
                      style={S.inputStyle}
                    />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Message Preview</p>
                    <div
                      className="rounded-lg p-3 text-xs text-gray-600 leading-relaxed max-h-40 overflow-y-auto"
                      style={{ ...S.segCard, whiteSpace: "pre-line" }}
                    >
                      {/* Strip leading "Subject: ..." line so preview shows only the body */}
                      {result.content
                        .replace(/^Subject:.*\n?/im, "")
                        .replace(/^\n/, "")
                        .trim()}
                    </div>
                  </div>
                  {sendSuccess && (
                    <div className="rounded-lg px-3 py-2 text-xs font-semibold text-green-700" style={{ backgroundColor: "#f0fdf4", border: "1px solid #86efac" }}>
                      ✓ Email sent successfully!
                    </div>
                  )}
                  {sendError && <ErrorBox message={sendError} onDismiss={() => setSendError("")} />}
                  <button
                    onClick={handleSendEmail}
                    disabled={sendLoading || !sendFromEmail || !sendToEmail || !sendSubject}
                    className="w-full py-2.5 rounded-xl text-xs font-bold text-white active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: "#9b72d0" }}
                  >
                    {sendLoading ? "Sending…" : "📨 Send Email"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ═══ RIGHT — Settings Sidebar (sticky) ════════════════════════ */}
          <div className="sticky top-5">
            <div style={S.panel}>
              <div style={S.panelHdr}>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Settings</p>
              </div>

              <div className="px-4" style={{ borderTop: "none" }}>

                {/* Tone */}
                <SettingsSection title="Tone" isOpen={openSections.tone} onToggle={() => toggleSection("tone")}>
                  {TONES.map((t) => {
                    const active = tone === t.toLowerCase();
                    return (
                      <button
                        key={t}
                        onClick={() => setTone(t.toLowerCase())}
                        className="w-full text-left px-3 py-1.5 rounded-lg text-xs transition-all"
                        style={{
                          backgroundColor: active ? "#f3eeff" : "transparent",
                          border: active ? "1px solid #9b72d0" : "1px solid transparent",
                          color: active ? "#6b21a8" : "#4b5563",
                          fontWeight: active ? "600" : "500",
                        }}
                      >
                        {t}
                      </button>
                    );
                  })}
                </SettingsSection>

                <div style={{ borderTop: "1px solid #e5e7eb" }} />

                {/* Audience Level */}
                <SettingsSection title="Audience Level" isOpen={openSections.audience} onToggle={() => toggleSection("audience")}>
                  {AUDIENCE_LEVELS.map((a) => {
                    const active = audienceLevel === a.toLowerCase();
                    return (
                      <button
                        key={a}
                        onClick={() => setAudienceLevel(a.toLowerCase())}
                        className="w-full text-left px-3 py-1.5 rounded-lg text-xs transition-all"
                        style={{
                          backgroundColor: active ? "#f3eeff" : "transparent",
                          border: active ? "1px solid #9b72d0" : "1px solid transparent",
                          color: active ? "#6b21a8" : "#4b5563",
                          fontWeight: active ? "600" : "500",
                        }}
                      >
                        {a}
                      </button>
                    );
                  })}
                </SettingsSection>

                <div style={{ borderTop: "1px solid #e5e7eb" }} />

                {/* Content Length */}
                <SettingsSection title="Content Length" isOpen={openSections.length} onToggle={() => toggleSection("length")}>
                  <div className="flex gap-1.5">
                    {LENGTHS.map((l) => {
                      const active = length === l.key;
                      return (
                        <button
                          key={l.key}
                          onClick={() => setLength(l.key)}
                          title={l.hint}
                          className="flex-1 py-2 rounded-lg text-[10px] font-bold transition-all"
                          style={{
                            backgroundColor: active ? "#BFD8B8" : "#f9fafb",
                            border: active ? "2px solid #7aaa7a" : "1px solid #b8a898",
                            color: active ? "#14532d" : "#4b5563",
                          }}
                        >
                          {l.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[9px] text-gray-400 mt-1.5 text-center">
                    {LENGTHS.find(l => l.key === length)?.hint}
                  </p>
                </SettingsSection>

                <div style={{ borderTop: "1px solid #e5e7eb" }} />

                {/* SEO Keywords */}
                <SettingsSection title="SEO Keywords" isOpen={openSections.seo} onToggle={() => toggleSection("seo")}>
                  <input
                    type="text"
                    value={seoKeywords}
                    onChange={(e) => setSeoKeywords(e.target.value)}
                    placeholder="ai, automation, saas…"
                    className="w-full px-3 py-2 text-xs text-gray-800 placeholder-gray-400 focus:outline-none transition-all"
                    style={S.inputStyle}
                  />
                  <div className="flex items-center justify-between mt-1.5">
                    <p className="text-[9px] text-gray-400">Comma-separated</p>
                    <button
                      onClick={suggestKeywords}
                      disabled={kwSuggestLoading || !effectiveTopic}
                      title={!effectiveTopic ? "Select a topic first" : "AI-suggest keywords for this topic"}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold active:scale-95 transition-all disabled:opacity-40"
                      style={{ backgroundColor: "#f3eeff", border: "1px solid #9b72d0", color: "#6b21a8" }}
                    >
                      {kwSuggestLoading ? "…" : "✨ AI Suggest"}
                    </button>
                  </div>
                </SettingsSection>

                <div style={{ borderTop: "1px solid #e5e7eb" }} />

                {/* Options */}
                <SettingsSection title="Options" isOpen={openSections.options} onToggle={() => toggleSection("options")}>
                  <label className="flex items-center gap-2.5 cursor-pointer px-1 py-1">
                    <input type="checkbox" checked={includeCta} onChange={(e) => setIncludeCta(e.target.checked)} className="w-4 h-4 accent-[#9b72d0] shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-gray-700">Include CTA</p>
                      <p className="text-[9px] text-gray-400">Call-to-action in content</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer px-1 py-1">
                    <input type="checkbox" checked={generateBoth} onChange={(e) => setGenerateBoth(e.target.checked)} className="w-4 h-4 accent-[#9b72d0] shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-gray-700">Blog + Email</p>
                      <p className="text-[9px] text-gray-400">Generate both in one click</p>
                    </div>
                  </label>
                </SettingsSection>

                {/* bottom padding */}
                <div className="pb-3" />
              </div>
            </div>
          </div>
          {/* ═══ end RIGHT ═══════════════════════════════════════════════ */}

        </div>
        {/* ═══ end GRID ═══════════════════════════════════════════════════ */}

      </div>
    </div>
  );
};

export default ContentGenerationPage;
