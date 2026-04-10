"""
Pipeline configuration — edit these values before running.
"""

# ── Input / Output ─────────────────────────────────────────────────────────────
INPUT_FILE  = "1st lot KS Connection.xlsx"   # relative to project root
OUTPUT_FILE = "enriched_leads.csv"
FAILED_LOG  = "failed_profiles.log"

# ── Scraper behaviour ──────────────────────────────────────────────────────────
SCRAPE_ENABLED      = True   # set False to skip scraping, use existing Excel data only
SCRAPE_MISSING_ONLY = True   # True = only scrape rows where title/company/location is blank
                              # False = scrape all rows (uses more Apify credits)

# ── Apify settings ─────────────────────────────────────────────────────────────
# APIFY_API_TOKEN  — read from environment / backend/.env
# LINKEDIN_COOKIE  — your li_at session cookie (see instructions below)
#
# How to get your li_at cookie:
#   1. Log in to LinkedIn in Chrome/Firefox
#   2. Open DevTools (F12) → Application → Cookies → www.linkedin.com
#   3. Find the cookie named "li_at" and copy its Value
#   4. Add to backend/.env:   LINKEDIN_COOKIE=AQEDATxxxxxxx...
#
URLS_PER_RUN  = 50    # LinkedIn URLs submitted per Apify actor run (keep <=100)
POLL_INTERVAL = 20    # seconds between Apify status polls
MAX_POLL_SECS = 1800  # max seconds to wait per run (50 profiles ≈ 5-10 min)

# ── Column mapping (Excel → internal field) ────────────────────────────────────
# Adjust if your column headers differ.
COL_FIRST_NAME = "First Name"
COL_LAST_NAME  = "Last Name"
COL_URL        = "URL"
COL_EMAIL      = "Email Address"
COL_COMPANY    = "Company"
COL_POSITION   = "Position"
COL_COUNTRY    = "Country"
COL_STATE      = "State"
COL_CITY       = "City"
COL_ABOUT      = "About me"
COL_STATUS     = "Status"
COL_GEO        = "Geo exposure"
COL_FOLLOWERS  = "Linkedin follower"

# All columns that represent skill/domain tags (value "Yes" → tag present).
# These are the binary columns after "About me" in your sheet.
SKILL_TAG_COLUMNS = [
    "Strategist", "Consultant", "CXO", "Coach/Coaching", "Motivator/Mentor",
    "Entrepreneurs", "Finance", "Marketing", "Technology", "Insurtech",
    "Faculty", "Content writer", "Customer service", "Team management",
    "Project management", "Business development", "Data Analysis",
    "Business analysis", "Pre-sales", "Insurance", "Banking", "Underwriting",
    "Management", "Leadership", "Risk management", "Management consultanting",
    "Agentic AI", "Gen AI", "AI", "Machine learning", "Research",
    "Problem solving", "HR and HR Related", "Microsoft Suit",
    "Product Development", "Excel", "E-mail Marketing", "Portfolio Management",
    "Communication", "Digital Marketing", "Acturial", "Analytical Skills",
    "Audit", "Law", "Mutual Fund/Investment", "Supply Chain", "GTM", "BPO",
    "Program Management", "Business Intelligence", "SDLC", "Food Industry",
    "Outsourcing/Offsourcing", "Data/Platform Architect", "Vendor Management",
    "Credit Risk", "Reinsurance", "Cyber Security", "Newspaper", "Sales",
    "Constructions", "CA/CFA/CPA", "Healthcare", "Venture Capitalist",
]
