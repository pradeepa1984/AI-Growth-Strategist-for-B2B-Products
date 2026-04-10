# 🚀 AI Growth Engine (MVP)

An AI-powered system that transforms a company website into actionable growth insights — including business understanding, market opportunities, and lead generation.

---

## 🧠 Problem Statement

Marketing and sales teams today rely on multiple disconnected tools to:
- Understand their own positioning
- Identify SEO opportunities
- Generate content ideas
- Discover relevant leads

There is no single system that connects:
> **Website → Business Understanding → Market Strategy → Lead Generation**

---

## 💡 Solution

AI Growth Engine automates this flow:

```text
Website → Intelligence → Market Insights → Leads Discovery → Content Generation (with SEO Optimization) → Campaign Automation →Analytics dashboard

🏗️ Architecture Overview
1. Website Intelligence
Crawls company website
Extracts:
Company summary
Industry
Services / offerings
ICP (target audience)
Keywords
Uses:
Firecrawl (for crawling)
Claude (LLM via AWS Bedrock)
Includes:
Confidence-based iterative crawling
Human-in-the-loop approval
Caching (DynamoDB)
S3 for Storing Markdown

2. Market Intelligence
Generates:
Keyword clusters
Content topics
Target segments
Top competitors (LLM-based)
Input:
Approved Website Intelligence output
Powered by:
Claude (LLM reasoning)

3. Lead Discovery
Identifies potential companies/leads
Filters based on:
Industry
ICP
Services
Integrates with:
Apollo (initial version)

⚙️ Tech Stack
Backend: Python (FastAPI)
Frontend: React
LLM: Claude (AWS Bedrock - Haiku)
Crawling: Firecrawl
Storage:
DynamoDB → structured data
S3 → raw crawl + LLM responses

System Flow

User Input (Website URL)
↓
Website Intelligence (Crawl + LLM)
↓
Human Approval
↓
Market Intelligence (LLM)
↓
Lead Discovery (Apollo)
↓
UI Display

📦 API Endpoints
1. Crawl Website
POST api/crawl

Input
{
  "url": "https://example.com"
}

2. Website Intelligence

POST /api/website-intelligence

Output
Json
{
  "company_summary": "...",
  "industry": "...",
  "services": ["..."],
  "icp": "...",
  "keywords": ["..."],
  "confidence_score": 0.82
}

3. Market Intelligence
POST /api/market-intelligence
Output

</> JSON

{
  "keyword_clusters": [...],
  "content_topics": [...],
  "target_segments": [...],
  "top_competitors": [...]
}

🧩 Key Features
🔁 Iterative Crawling based on confidence
🧠 LLM-driven structured intelligence
🧑‍💼 Human-in-the-loop validation
⚡ Caching to avoid re-computation
📊 Progress tracking across modules

Setup
1. Clone

git clone <repo>
cd project

2. Setup Environment

Create .env
FIRECRAWL_API_KEY=...
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=us.anthropic.claude-3-5-haiku-20241022-v1:0
# Haiku 4.5 : us.anthropic.claude-haiku-4-5-20251001-v1:0
S3_BUCKET=ai-growth-strategist

3. AWS Setup

aws config --profile Website-intel-dev

4. Run backend

uvicorn main:app --reload

5. Frontend
npm install
npm run dev

📌 Future Enhancements
SEO APIs (Ahrefs / SEMrush)
Advanced competitor analysis
Lead scoring
Multi-agent orchestration (LangGraph)
Workflow configurability (n8n-style UI)

🎯 Product Vision

AI Growth Strategist for B2B companies

👩‍💻 Author

Built as an MVP to validate AI-driven growth automation.


