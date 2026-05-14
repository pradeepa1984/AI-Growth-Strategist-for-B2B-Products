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
const CONTENT_TYPES = [
  { key: "blog",     label: "Blog Content",    icon: "📝" },
  { key: "email",    label: "Email Content",   icon: "📧" },
  { key: "linkedin", label: "LinkedIn Message", icon: "💼" },
];
const TONES           = ["Professional", "Conversational", "Persuasive", "Technical", "Friendly"];
const AUDIENCE_LEVELS = ["Beginner", "Intermediate", "Expert"];
const LENGTHS = [
  { key: "short",  label: "Short",  hint: "~200–300 words" },
  { key: "medium", label: "Medium", hint: "~400–600 words" },
  { key: "long",   label: "Long",   hint: "~700–1000 words" },
];

const normalizeUrl = (s) => { const t = s.trim(); return /^https?:\/\//i.test(t) ? t : `https://${t}`; };

const ContentDisplay = ({ content }) => (
  <div className="space-y-1.5 leading-relaxed">
    {content.split("\n").map((line, i) => {
      if (line.startsWith("## "))  return <h2 key={i} className="text-sm font-bold mt-4 first:mt-0" style={{ color: "#0B4F43" }}>{line.slice(3)}</h2>;
      if (line.startsWith("### ")) return <h3 key={i} className="text-xs font-semibold mt-3" style={{ color: "#1C2C3A" }}>{line.slice(4)}</h3>;
      if (line === "---")           return <hr key={i} className="my-2" style={{ borderColor: "#D4EDE6" }} />;
      if (!line.trim())             return <div key={i} className="h-1" />;
      return <p key={i} className="text-xs leading-relaxed" style={{ color: "#2E4057" }}>{line}</p>;
    })}
  </div>
);

const SettingsSection = ({ title, isOpen, onToggle, children }) => (
  <div className="py-1">
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between py-2 text-left hover:opacity-80 transition-opacity"
    >
      <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#2E4057" }}>{title}</p>
      <span
        className="text-[10px] transition-transform duration-200 inline-block"
        style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", color: "#2E4057" }}
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

  const [linkedinResult,       setLinkedinResult]       = useState(null);
  const [linkedinLoading,      setLinkedinLoading]      = useState(false);
  const [linkedinCopied,       setLinkedinCopied]       = useState(false);
  const [linkedinRecipientUrl, setLinkedinRecipientUrl] = useState("");

  const [kwSuggestLoading, setKwSuggestLoading] = useState(false);

  const [sendFromEmail,  setSendFromEmail]  = useState("");
  const [sendToEmail,    setSendToEmail]    = useState("");
  const [sendSubject,    setSendSubject]    = useState("");
  const [sendLoading,    setSendLoading]    = useState(false);
  const [sendSuccess,    setSendSuccess]    = useState(false);
  const [sendError,      setSendError]      = useState("");

  const [seoAnalysis,  setSeoAnalysis]  = useState(null);
  const [seoAnalyzing, setSeoAnalyzing] = useState(false);
  const [seoError,     setSeoError]     = useState("");
  const [seoExpanded,  setSeoExpanded]  = useState(false);

  const [openSections, setOpenSections] = useState({
    tone: true, audience: false, length: false, seo: false, options: false,
  });
  const toggleSection = (key) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  const effectiveTopic = useCustomTopic ? customTopicInput.trim() : selectedTopic;
  const templates      = contentType === "blog" ? BLOG_TEMPLATES : EMAIL_TEMPLATES;

  // ── Design tokens ──────────────────────────────────────────────────────────
  const S = {
    page:       { backgroundColor: "#E8F4F9" },
    topbar:     { backgroundColor: "#FFFFFF", borderBottom: "1px solid #D4EDE6" },
    panel:      { backgroundColor: "#FFFFFF", border: "1px solid #D4EDE6", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", overflow: "hidden" },
    panelHdr:   { backgroundColor: "#E8F4F9", borderBottom: "1px solid #D4EDE6", padding: "10px 16px" },
    cardDefault:{ backgroundColor: "#FFFFFF", border: "1px solid #D4EDE6", borderRadius: "8px" },
    cardActive: { backgroundColor: "#CCF2E8", border: "2px solid #1A9E7A", borderRadius: "8px" },
    btnPrimary: { backgroundColor: "#1A9E7A", borderColor: "#0B4F43", color: "#ffffff" },
    btnSecond:  { backgroundColor: "#FFFFFF", borderColor: "#D4EDE6" },
    inputStyle: { backgroundColor: "#FFFFFF", border: "1px solid #D4EDE6", borderRadius: "8px" },
    segCard:    { backgroundColor: "#E8F4F9", border: "1px solid #D4EDE6", borderRadius: "8px" },
  };

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

  useEffect(() => {
    if (selectedProspect?.email)    setSendToEmail(selectedProspect.email);
    if (selectedProspect?.linkedin) setLinkedinRecipientUrl(selectedProspect.linkedin);
  }, [selectedProspect]);

  useEffect(() => {
    if (miData?.keyword_clusters?.length > 0 && !seoKeywords) {
      const allKws = miData.keyword_clusters.flatMap(c => c.keywords || []);
      setSeoKeywords(allKws.slice(0, 8).join(", "));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miData]);

  useEffect(() => {
    setLinkedinResult(null);
    setLinkedinCopied(false);
  }, [contentType]);

  useEffect(() => {
    if (result && result.content_type === "email") {
      const match = result.content.match(/^Subject:\s*(.+)$/m);
      setSendSubject(match ? match[1].trim() : result.topic || "");
      setSendSuccess(false);
      setSendError("");
    }
  }, [result]);

  useEffect(() => {
    if (result && result.content_type === "blog" && result.content) {
      setSeoAnalysis(null); setSeoError("");
      const kwArr = seoKeywords.split(",").map(s => s.trim()).filter(Boolean);
      setSeoAnalyzing(true);
      apiPost("/api/seo-analyze", { content: result.content, keywords: kwArr, topic: effectiveTopic, length_hint: length })
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
      await apiPost("/api/send-email", { from_email: sendFromEmail, to_email: sendToEmail, subject: sendSubject, content: result.content });
      setSendSuccess(true);
      setTimeout(() => setSendSuccess(false), 5000);
    } catch (e) { setSendError(e.message); }
    finally     { setSendLoading(false); }
  };

  const generateLinkedIn = async () => {
    setLinkedinLoading(true); setLinkedinResult(null); setError("");
    const url = ciUrl ? normalizeUrl(ciUrl) : "";
    try {
      const data = await apiPost("/api/linkedin-message", {
        company_url:      url,
        topic:            effectiveTopic || "connecting",
        prospect_name:    selectedProspect?.name     || "",
        prospect_company: selectedProspect?.company  || "",
        prospect_role:    selectedProspect?.title    || "",
        linkedin_data:    selectedProspect?.enrichment || null,
      });
      setLinkedinResult(data);
    } catch (e) { setError(e.message); }
    finally { setLinkedinLoading(false); }
  };

  const handleSendViaLinkedIn = async () => {
    if (!linkedinResult?.content) return;
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
    const profileUrl  = linkedinRecipientUrl.trim();
    const encodedBody = encodeURIComponent(linkedinResult.content);
    let linkedinUrl   = "https://www.linkedin.com/messaging/";
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

  const suggestKeywords = async () => {
    if (!effectiveTopic) return;
    setKwSuggestLoading(true);
    const url = ciUrl ? normalizeUrl(ciUrl) : "";
    try {
      const data = await apiPost("/api/suggest-keywords", { company_url: url, topic: effectiveTopic });
      if (data.keywords?.length > 0) setSeoKeywords(data.keywords.join(", "));
    } catch (_) {}
    finally { setKwSuggestLoading(false); }
  };

  const analyzeSEO = async () => {
    const content = activeTab === "primary" ? result?.content : resultB?.content;
    if (!content) return;
    setSeoAnalyzing(true); setSeoError(""); setSeoAnalysis(null);
    const kwArr = seoKeywords.split(",").map(s => s.trim()).filter(Boolean);
    try {
      const data = await apiPost("/api/seo-analyze", { content, keywords: kwArr, topic: effectiveTopic, length_hint: length });
      setSeoAnalysis(data);
      setSeoExpanded(true);
    } catch (e) { setSeoError(e.message); }
    finally { setSeoAnalyzing(false); }
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={S.page}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="px-8 h-14 flex items-center justify-between overflow-visible" style={S.topbar}>
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
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold active:scale-95 transition-all"
                style={{ ...S.btnSecond, border: "1px solid #D4EDE6", color: "#2E4057" }}
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

        <div className="mb-5">
          <h1 className="text-xl font-bold tracking-tight leading-tight" style={{ color: "#0B4F43" }}>Content Generation</h1>
          <p className="text-xs mt-0.5" style={{ color: "#2E4057" }}>
            Select a topic from Market Intelligence, choose a template, and generate structured content.
          </p>
        </div>

        {selectedProspect && (
          <div
            className="mb-5 flex items-center gap-3 px-4 py-3 shadow-sm"
            style={{ backgroundColor: "#CCF2E8", border: "1px solid #1A9E7A", borderRadius: "12px" }}
          >
            <span className="text-lg">🎯</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold" style={{ color: "#0B4F43" }}>
                Composing for: {selectedProspect.name}
                {selectedProspect.title ? ` — ${selectedProspect.title}` : ""}
              </p>
              <p className="text-[11px] truncate" style={{ color: "#1A9E7A" }}>
                {selectedProspect.company}
                {selectedProspect.email ? ` · ${selectedProspect.email}` : ""}
              </p>
            </div>
            <span className="text-[10px] font-medium shrink-0" style={{ color: "#0B4F43" }}>To: auto-filled ↓</span>
          </div>
        )}

        {/* 3-column grid */}
        <div className="grid gap-6 items-start" style={{ gridTemplateColumns: "30% 45% 25%" }}>

          {/* ═══ LEFT — Topic Selection ════════════════════════════════════ */}
          <div style={S.panel}>
            <div style={S.panelHdr}>
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#0B4F43" }}>Select Topic</p>
            </div>

            <div className="p-4 space-y-2">
              {miTopics.length > 0 ? (
                <>
                  <p className="text-[10px] font-semibold uppercase tracking-widest pb-1" style={{ color: "#2E4057" }}>From Market Intelligence</p>
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
                            <span className="text-xs font-semibold leading-snug" style={{ color: isSel ? "#0B4F43" : "#1C2C3A" }}>
                              {topic.title}
                            </span>
                            {i === 0 && (
                              <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "#E8A87C", color: "#fff" }}>
                                🔥
                              </span>
                            )}
                          </div>
                          {topic.angle && (
                            <p className="text-[10px] mt-1 leading-snug" style={{ color: "#2E4057" }}>{topic.angle}</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="py-6 text-center space-y-1.5">
                  <span className="text-2xl">📊</span>
                  <p className="text-xs font-semibold" style={{ color: "#2E4057" }}>No topics yet</p>
                  <p className="text-[10px] max-w-[180px] mx-auto" style={{ color: "#2E4057" }}>
                    Run Market Intelligence first to get AI-suggested topics.
                  </p>
                </div>
              )}

              <div className="pt-3 mt-1 space-y-2" style={{ borderTop: "1px solid #D4EDE6" }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#2E4057" }}>Or write your own</p>
                <input
                  type="text"
                  value={customTopicInput}
                  onChange={(e) => { setCustomTopicInput(e.target.value); setUseCustomTopic(true); setSelectedTopic(""); }}
                  onFocus={() => setUseCustomTopic(true)}
                  placeholder="Type a custom topic…"
                  className="w-full px-3 py-2 text-xs placeholder-gray-400 focus:outline-none transition-all"
                  style={{
                    ...S.inputStyle,
                    color: "#1C2C3A",
                    ...(useCustomTopic && customTopicInput ? { border: "2px solid #1A9E7A" } : {}),
                  }}
                />
                {useCustomTopic && customTopicInput && (
                  <p className="text-[10px] font-semibold" style={{ color: "#1A9E7A" }}>✓ Using custom topic</p>
                )}
              </div>

              {effectiveTopic && (
                <div className="mt-2 p-3 rounded-lg" style={{ backgroundColor: "#CCF2E8", border: "1px solid #1A9E7A" }}>
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: "#1A9E7A" }}>Selected</p>
                  <p className="text-xs font-semibold leading-snug" style={{ color: "#1C2C3A" }}>{effectiveTopic}</p>
                </div>
              )}
            </div>
          </div>

          {/* ═══ CENTER — Steps + Output ═══════════════════════════════════ */}
          <div className="space-y-4">

            {!effectiveTopic && (
              <div style={S.panel}>
                <div className="p-12 flex flex-col items-center gap-4 text-center">
                  <span className="text-4xl">✍️</span>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "#2E4057" }}>No topic selected</p>
                    <p className="text-xs mt-1 max-w-xs" style={{ color: "#2E4057" }}>
                      Choose a topic from the left panel — from Market Intelligence or write your own.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {effectiveTopic && (
              <div style={S.panel}>
                <div style={S.panelHdr}>
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#0B4F43" }}>Step 1 — Content Type</p>
                </div>
                <div className="p-4 flex gap-3">
                  {CONTENT_TYPES.map((ct) => {
                    const active = contentType === ct.key;
                    return (
                      <button
                        key={ct.key}
                        onClick={() => { setContentType(ct.key); setSelectedTemplate(""); }}
                        className="flex-1 py-4 font-semibold text-sm transition-all flex items-center justify-center gap-2"
                        style={{ ...(active ? S.cardActive : S.cardDefault), color: active ? "#0B4F43" : "#2E4057" }}
                      >
                        <span className="text-xl">{ct.icon}</span>
                        <span>{ct.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {effectiveTopic && contentType !== "linkedin" && (
              <div style={S.panel}>
                <div style={S.panelHdr}>
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#0B4F43" }}>Step 2 — Choose Template</p>
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
                        <p className="text-xs font-semibold leading-tight" style={{ color: active ? "#0B4F43" : "#1C2C3A" }}>{tpl.name}</p>
                        <p className="text-[10px] leading-snug mt-1" style={{ color: "#2E4057" }}>{tpl.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {contentType === "linkedin" && (effectiveTopic || selectedProspect) && (
              <button
                onClick={generateLinkedIn}
                disabled={linkedinLoading}
                className="w-full py-3 text-sm font-bold text-white shadow-md hover:shadow-lg active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ ...S.btnPrimary, borderRadius: "10px", boxShadow: "0 4px 12px rgba(26,158,122,0.30)" }}
              >
                {linkedinLoading ? "Generating…" : "💼 Generate LinkedIn Message"}
              </button>
            )}

            {effectiveTopic && selectedTemplate && contentType !== "linkedin" && (
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="w-full py-3 text-sm font-bold text-white shadow-md hover:shadow-lg active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ ...S.btnPrimary, borderRadius: "10px", boxShadow: "0 4px 12px rgba(26,158,122,0.30)" }}
              >
                {loading ? "Generating…" : generateBoth ? "✨ Generate Blog + Email" : `✨ Generate ${contentType === "blog" ? "Blog" : "Email"} Content`}
              </button>
            )}

            {loading && (
              <div style={S.panel}>
                <div className="p-10 flex flex-col items-center gap-4">
                  <svg className="animate-spin h-8 w-8" style={{ color: "#1A9E7A" }} fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  <p className="text-sm font-semibold" style={{ color: "#1C2C3A" }}>Filling template with AI…</p>
                  <p className="text-xs" style={{ color: "#2E4057" }}>Claude is structuring your content.</p>
                </div>
              </div>
            )}

            {!loading && error && (
              <div className="space-y-2">
                <ErrorBox message={error} onDismiss={() => setError("")} />
                <div className="flex justify-center">
                  <button onClick={handleGenerate} className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={{ color: "#E8A87C", border: "1px solid #E8A87C", backgroundColor: "#FFFFFF" }}>
                    ↺ Try again
                  </button>
                </div>
              </div>
            )}

            {!loading && (result || resultB) && (
              <div style={S.panel}>
                {/* Tab bar */}
                <div className="flex items-center" style={{ backgroundColor: "#E8F4F9", borderBottom: "1px solid #D4EDE6" }}>
                  {result && (
                    <button
                      onClick={() => setActiveTab("primary")}
                      className="px-5 py-3 text-xs font-bold border-b-2 transition-all"
                      style={{ borderColor: activeTab === "primary" ? "#1A9E7A" : "transparent", color: activeTab === "primary" ? "#0B4F43" : "#2E4057" }}
                    >
                      {result.content_type === "blog" ? "📝" : "📧"} {result.template_name}
                    </button>
                  )}
                  {resultB && (
                    <button
                      onClick={() => setActiveTab("secondary")}
                      className="px-5 py-3 text-xs font-bold border-b-2 transition-all"
                      style={{ borderColor: activeTab === "secondary" ? "#1A9E7A" : "transparent", color: activeTab === "secondary" ? "#0B4F43" : "#2E4057" }}
                    >
                      {resultB.content_type === "blog" ? "📝" : "📧"} {resultB.template_name}
                    </button>
                  )}
                  {fromCache && activeTab === "primary" && (
                    <span className="ml-auto mr-3 text-[10px] font-semibold px-2 py-0.5" style={{ backgroundColor: "#CCF2E8", color: "#0B4F43", borderRadius: "999px" }}>
                      ⚡ Loaded from cache
                    </span>
                  )}
                  {result?.personalization_level && activeTab === "primary" && (
                    <span
                      className="mr-3 text-[10px] font-bold px-2 py-0.5 rounded-full border"
                      title={result.enrichment_used ? "LinkedIn enrichment data was used" : "No LinkedIn enrichment"}
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

                {(() => {
                  const ar = activeTab === "primary" ? result : resultB;
                  if (!ar) return null;
                  return (
                    <div className="p-5 space-y-4">
                      <div className="flex flex-wrap gap-1.5">
                        {[ar.tone, ar.audience_level, ar.length].filter(Boolean).map((b, i) => (
                          <span key={i} className="text-[10px] font-medium px-2.5 py-0.5 rounded-full" style={{ backgroundColor: "#CCF2E8", color: "#0B4F43" }}>
                            {b}
                          </span>
                        ))}
                        {(ar.keywords || []).map((kw, i) => (
                          <span key={i} className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#CCF2E8", color: "#0B4F43" }}>
                            #{kw}
                          </span>
                        ))}
                      </div>

                      <div className="rounded-lg p-5" style={S.segCard}>
                        <ContentDisplay content={ar.content} />
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        {[
                          { label: "📋 Copy",      fn: () => handleCopy(ar.content) },
                          { label: "⬇ Download",   fn: () => handleDownload(ar.content, ar.topic, ar.content_type) },
                          { label: "↺ Regenerate", fn: handleRegenerate },
                        ].map(({ label, fn }) => (
                          <button
                            key={label}
                            onClick={fn}
                            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold active:scale-95 transition-all hover:brightness-105"
                            style={{ ...S.btnSecond, border: "1px solid #D4EDE6", color: "#2E4057" }}
                          >
                            {label}
                          </button>
                        ))}
                        <button
                          onClick={() => setRewriteMode(!rewriteMode)}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                          style={
                            rewriteMode
                              ? { backgroundColor: "#CCF2E8", border: "2px solid #1A9E7A", color: "#0B4F43" }
                              : { ...S.btnSecond, border: "1px solid #D4EDE6", color: "#2E4057" }
                          }
                        >
                          🎨 Rewrite Tone
                        </button>
                        <button
                          onClick={() => addCgItem(ar)}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white active:scale-95 transition-all hover:brightness-105"
                          style={{ backgroundColor: "#1A9E7A", boxShadow: "0 4px 12px rgba(26,158,122,0.30)" }}
                        >
                          💾 Save
                        </button>
                      </div>

                      {rewriteMode && (
                        <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: "#CCF2E8", border: "1px solid #1A9E7A" }}>
                          <p className="text-xs font-semibold" style={{ color: "#0B4F43" }}>Select new tone to rewrite with</p>
                          <div className="flex flex-wrap gap-2">
                            {TONES.map((t) => (
                              <button
                                key={t}
                                onClick={() => setRewriteTone(t.toLowerCase())}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                                style={
                                  rewriteTone === t.toLowerCase()
                                    ? { backgroundColor: "#ffffff", border: "2px solid #1A9E7A", color: "#0B4F43" }
                                    : { ...S.btnSecond, border: "1px solid #D4EDE6", color: "#2E4057" }
                                }
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={handleRewriteTone}
                            disabled={!rewriteTone}
                            className="px-5 py-2 rounded-lg text-xs font-bold text-white shadow-sm hover:brightness-105 active:scale-95 transition-all disabled:opacity-40"
                            style={{ backgroundColor: "#1A9E7A" }}
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

            {/* SEO Badge */}
            {result && contentType === "blog" && (
              <div className="flex items-center gap-2 px-1">
                {seoAnalyzing && <span className="text-[10px] italic" style={{ color: "#2E4057" }}>Scoring SEO…</span>}
                {!seoAnalyzing && seoAnalysis && (
                  <span
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold shadow-sm"
                    style={{
                      backgroundColor: seoAnalysis.overall_score >= 75 ? "#dcfce7" : seoAnalysis.overall_score >= 50 ? "#CCF2E8" : "#fef9c3",
                      color: seoAnalysis.overall_score >= 75 ? "#166534" : seoAnalysis.overall_score >= 50 ? "#0B4F43" : "#854d0e",
                    }}
                  >
                    {seoAnalysis.overall_score >= 60 ? "✅" : "📊"} SEO Score: {seoAnalysis.overall_score}/100 — Grade {seoAnalysis.grade}
                  </span>
                )}
              </div>
            )}

            {/* LinkedIn Loading */}
            {linkedinLoading && (
              <div style={S.panel}>
                <div className="p-10 flex flex-col items-center gap-4">
                  <svg className="animate-spin h-8 w-8" style={{ color: "#1A9E7A" }} fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  <p className="text-sm font-semibold" style={{ color: "#1C2C3A" }}>Crafting your LinkedIn message…</p>
                  <p className="text-xs" style={{ color: "#2E4057" }}>Personalizing for {selectedProspect?.name || "your prospect"}.</p>
                </div>
              </div>
            )}

            {/* LinkedIn Result */}
            {!linkedinLoading && linkedinResult && contentType === "linkedin" && (
              <div style={S.panel}>
                <div style={{ ...S.panelHdr, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#0B4F43" }}>💼 LinkedIn Message</p>
                  {selectedProspect?.name && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#CCF2E8", color: "#0B4F43" }}>
                      For: {selectedProspect.name}
                    </span>
                  )}
                </div>

                <div className="p-5 space-y-4">
                  <div className="rounded-xl p-5 leading-relaxed text-sm whitespace-pre-line" style={{ backgroundColor: "#CCF2E8", border: "1.5px solid #1A9E7A", color: "#1C2C3A" }}>
                    {linkedinResult.content}
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#2E4057" }}>Send To — LinkedIn Profile URL</p>
                    <input
                      type="text"
                      value={linkedinRecipientUrl}
                      onChange={e => setLinkedinRecipientUrl(e.target.value)}
                      placeholder="https://www.linkedin.com/in/username"
                      className="w-full px-3 py-2 text-xs placeholder-gray-400 focus:outline-none transition-all"
                      style={{ ...S.inputStyle, color: "#1C2C3A" }}
                    />
                    <p className="text-[10px] mt-1" style={{ color: "#2E4057" }}>Pre-filled from selected lead. Edit to target someone not in your leads list.</p>
                  </div>

                  <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-[11px]" style={{ backgroundColor: "#fef9c3", border: "1px solid #fde047", color: "#854d0e" }}>
                    <span className="text-base leading-none mt-0.5">ℹ️</span>
                    <span>
                      <strong>From account:</strong> The message will be sent from <strong>your currently logged-in LinkedIn account</strong> in the browser — no credentials are stored by this app.
                    </span>
                  </div>

                  {linkedinCopied && (
                    <div className="rounded-lg px-3 py-2 text-sm font-bold flex items-center gap-2" style={{ backgroundColor: "#f0fdf4", border: "2px solid #22c55e", color: "#15803d" }}>
                      ✅ Message copied! Switch to LinkedIn and press <kbd style={{ background: "#dcfce7", borderRadius: 4, padding: "1px 5px", fontFamily: "monospace" }}>Ctrl+V</kbd> to paste.
                    </div>
                  )}

                  <p className="text-[11px] italic" style={{ color: "#2E4057" }}>
                    Click "Send via LinkedIn" — the message will be pre-filled in the LinkedIn chat box.
                  </p>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => { navigator.clipboard.writeText(linkedinResult.content).catch(() => {}); setLinkedinCopied(true); setTimeout(() => setLinkedinCopied(false), 3000); }}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold active:scale-95 transition-all hover:brightness-105"
                      style={{ ...S.btnSecond, border: "1px solid #D4EDE6", color: "#2E4057" }}
                    >
                      📋 Copy Message
                    </button>
                    <button onClick={generateLinkedIn} disabled={linkedinLoading}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold active:scale-95 transition-all hover:brightness-105"
                      style={{ ...S.btnSecond, border: "1px solid #D4EDE6", color: "#2E4057" }}>
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

            {/* Send Email */}
            {!loading && result && result.content_type === "email" && (
              <div style={S.panel}>
                <div style={S.panelHdr}>
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#0B4F43" }}>📨 Send Email</p>
                </div>
                <div className="p-4 space-y-3">
                  {["From", "To", "Subject"].map((lbl) => {
                    const stateMap = { From: sendFromEmail, To: sendToEmail, Subject: sendSubject };
                    const setterMap = { From: setSendFromEmail, To: setSendToEmail, Subject: setSendSubject };
                    const typeMap = { From: "email", To: "email", Subject: "text" };
                    return (
                      <div key={lbl}>
                        <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "#2E4057" }}>{lbl}</p>
                        <input
                          type={typeMap[lbl]}
                          value={stateMap[lbl]}
                          onChange={(e) => setterMap[lbl](e.target.value)}
                          placeholder={lbl === "From" ? "your@email.com" : lbl === "To" ? "recipient@email.com" : "Email subject…"}
                          className="w-full px-3 py-2 text-xs placeholder-gray-400 focus:outline-none transition-all"
                          style={{ ...S.inputStyle, color: "#1C2C3A" }}
                        />
                      </div>
                    );
                  })}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "#2E4057" }}>Message Preview</p>
                    <div className="rounded-lg p-3 text-xs leading-relaxed max-h-40 overflow-y-auto" style={{ ...S.segCard, color: "#2E4057", whiteSpace: "pre-line" }}>
                      {result.content.replace(/^Subject:.*\n?/im, "").replace(/^\n/, "").trim()}
                    </div>
                  </div>
                  {sendSuccess && (
                    <div className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ backgroundColor: "#f0fdf4", border: "1px solid #86efac", color: "#166534" }}>
                      ✓ Email sent successfully!
                    </div>
                  )}
                  {sendError && <ErrorBox message={sendError} onDismiss={() => setSendError("")} />}
                  <button
                    onClick={handleSendEmail}
                    disabled={sendLoading || !sendFromEmail || !sendToEmail || !sendSubject}
                    className="w-full py-2.5 text-xs font-bold text-white active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: "#1A9E7A", borderRadius: "10px", boxShadow: "0 4px 12px rgba(26,158,122,0.30)" }}
                  >
                    {sendLoading ? "Sending…" : "📨 Send Email"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ═══ RIGHT — Settings Sidebar ════════════════════════════════ */}
          <div className="sticky top-5">
            <div style={{ ...S.panel, backgroundColor: "#E8F4F9" }}>
              <div style={{ ...S.panelHdr, backgroundColor: "#CCF2E8" }}>
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#0B4F43" }}>Settings</p>
              </div>

              <div className="px-4">
                <SettingsSection title="Tone" isOpen={openSections.tone} onToggle={() => toggleSection("tone")}>
                  {TONES.map((t) => {
                    const active = tone === t.toLowerCase();
                    return (
                      <button
                        key={t}
                        onClick={() => setTone(t.toLowerCase())}
                        className="w-full text-left px-3 py-1.5 rounded-lg text-xs transition-all"
                        style={{
                          backgroundColor: active ? "#CCF2E8" : "transparent",
                          border: active ? "1px solid #1A9E7A" : "1px solid transparent",
                          color: active ? "#0B4F43" : "#2E4057",
                          fontWeight: active ? "600" : "500",
                        }}
                      >
                        {t}
                      </button>
                    );
                  })}
                </SettingsSection>

                <div style={{ borderTop: "1px solid #D4EDE6" }} />

                <SettingsSection title="Audience Level" isOpen={openSections.audience} onToggle={() => toggleSection("audience")}>
                  {AUDIENCE_LEVELS.map((a) => {
                    const active = audienceLevel === a.toLowerCase();
                    return (
                      <button
                        key={a}
                        onClick={() => setAudienceLevel(a.toLowerCase())}
                        className="w-full text-left px-3 py-1.5 rounded-lg text-xs transition-all"
                        style={{
                          backgroundColor: active ? "#CCF2E8" : "transparent",
                          border: active ? "1px solid #1A9E7A" : "1px solid transparent",
                          color: active ? "#0B4F43" : "#2E4057",
                          fontWeight: active ? "600" : "500",
                        }}
                      >
                        {a}
                      </button>
                    );
                  })}
                </SettingsSection>

                <div style={{ borderTop: "1px solid #D4EDE6" }} />

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
                            backgroundColor: active ? "#1A9E7A" : "#FFFFFF",
                            border: active ? "2px solid #0B4F43" : "1px solid #D4EDE6",
                            color: active ? "#ffffff" : "#2E4057",
                          }}
                        >
                          {l.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[9px] mt-1.5 text-center" style={{ color: "#2E4057" }}>
                    {LENGTHS.find(l => l.key === length)?.hint}
                  </p>
                </SettingsSection>

                <div style={{ borderTop: "1px solid #D4EDE6" }} />

                <SettingsSection title="SEO Keywords" isOpen={openSections.seo} onToggle={() => toggleSection("seo")}>
                  <input
                    type="text"
                    value={seoKeywords}
                    onChange={(e) => setSeoKeywords(e.target.value)}
                    placeholder="ai, automation, saas…"
                    className="w-full px-3 py-2 text-xs placeholder-gray-400 focus:outline-none transition-all"
                    style={{ ...S.inputStyle, color: "#1C2C3A" }}
                  />
                  <div className="flex items-center justify-between mt-1.5">
                    <p className="text-[9px]" style={{ color: "#2E4057" }}>Comma-separated</p>
                    <button
                      onClick={suggestKeywords}
                      disabled={kwSuggestLoading || !effectiveTopic}
                      title={!effectiveTopic ? "Select a topic first" : "AI-suggest keywords for this topic"}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold active:scale-95 transition-all disabled:opacity-40"
                      style={{ backgroundColor: "#CCF2E8", border: "1px solid #1A9E7A", color: "#0B4F43" }}
                    >
                      {kwSuggestLoading ? "…" : "✨ AI Suggest"}
                    </button>
                  </div>
                </SettingsSection>

                <div style={{ borderTop: "1px solid #D4EDE6" }} />

                <SettingsSection title="Options" isOpen={openSections.options} onToggle={() => toggleSection("options")}>
                  <label className="flex items-center gap-2.5 cursor-pointer px-1 py-1">
                    <input type="checkbox" checked={includeCta} onChange={(e) => setIncludeCta(e.target.checked)} className="w-4 h-4 accent-[#1A9E7A] shrink-0" />
                    <div>
                      <p className="text-xs font-semibold" style={{ color: "#1C2C3A" }}>Include CTA</p>
                      <p className="text-[9px]" style={{ color: "#2E4057" }}>Call-to-action in content</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer px-1 py-1">
                    <input type="checkbox" checked={generateBoth} onChange={(e) => setGenerateBoth(e.target.checked)} className="w-4 h-4 accent-[#1A9E7A] shrink-0" />
                    <div>
                      <p className="text-xs font-semibold" style={{ color: "#1C2C3A" }}>Blog + Email</p>
                      <p className="text-[9px]" style={{ color: "#2E4057" }}>Generate both in one click</p>
                    </div>
                  </label>
                </SettingsSection>

                <div className="pb-3" />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default ContentGenerationPage;
