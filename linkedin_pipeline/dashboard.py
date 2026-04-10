"""
dashboard.py — Aggregate enriched leads into summary statistics.

Call generate_dashboard_data(leads) after the pipeline completes.
Returns a dict ready to be printed, saved, or fed into a BI tool.
"""

from __future__ import annotations

from collections import Counter
from typing import Any


def generate_dashboard_data(leads: list[dict]) -> dict[str, Any]:
    """
    Aggregate enriched lead data into summary statistics.

    Parameters
    ----------
    leads : list of enriched lead dicts (output of the pipeline)

    Returns
    -------
    dict with keys:
        total_leads          int
        active_leads         int
        industry_distribution  Counter  {industry: count}
        top_skills             list of (skill, count) — top 20
        geo_distribution       Counter  {country: count}
        city_distribution      Counter  {city: count}
        experience_distribution Counter {level: count}
        geo_exposure_split     Counter  {Global/India/etc.: count}
        follower_stats         dict {min, max, mean, median}
        completeness           dict — % of leads with each field populated
    """
    total = len(leads)
    if total == 0:
        return {"total_leads": 0}

    industry_counter   = Counter()
    skill_counter      = Counter()
    geo_country        = Counter()
    geo_city           = Counter()
    experience_counter = Counter()
    geo_exposure_ctr   = Counter()
    followers_list: list[float] = []

    field_counts = {f: 0 for f in ["title", "company", "location", "skills",
                                    "industry", "experience_level", "email"]}
    active = 0

    for lead in leads:
        # Active status
        if str(lead.get("status", "")).lower() == "active":
            active += 1

        # Industry
        ind = lead.get("industry") or "Unknown"
        industry_counter[ind] += 1

        # Skills
        skills = lead.get("skills") or []
        skill_counter.update(skills)

        # Location
        loc = lead.get("location") or ""
        parts = [p.strip() for p in loc.split(",")]
        if len(parts) >= 3:
            geo_city[parts[0]] += 1       # City
            geo_country[parts[-1]] += 1   # Country
        elif len(parts) == 2:
            geo_country[parts[-1]] += 1
        elif len(parts) == 1 and parts[0]:
            geo_country[parts[0]] += 1

        # Experience
        exp = lead.get("experience_level") or "Unknown"
        experience_counter[exp] += 1

        # Geo exposure
        ge = lead.get("geo_exposure") or "Unknown"
        geo_exposure_ctr[ge] += 1

        # Followers
        f = lead.get("followers")
        try:
            followers_list.append(float(f))
        except (TypeError, ValueError):
            pass

        # Completeness
        for field in field_counts:
            val = lead.get(field)
            if val and val != [] and val != "Unknown":
                field_counts[field] += 1

    # Follower stats
    follower_stats: dict = {}
    if followers_list:
        sorted_f = sorted(followers_list)
        n = len(sorted_f)
        follower_stats = {
            "min":    int(sorted_f[0]),
            "max":    int(sorted_f[-1]),
            "mean":   round(sum(sorted_f) / n, 1),
            "median": int(sorted_f[n // 2]),
            "count":  n,
        }

    completeness = {
        field: round(count / total * 100, 1)
        for field, count in field_counts.items()
    }

    return {
        "total_leads":            total,
        "active_leads":           active,
        "industry_distribution":  dict(industry_counter.most_common()),
        "top_skills":             skill_counter.most_common(20),
        "geo_distribution":       dict(geo_country.most_common()),
        "city_distribution":      dict(geo_city.most_common(20)),
        "experience_distribution": dict(experience_counter.most_common()),
        "geo_exposure_split":     dict(geo_exposure_ctr.most_common()),
        "follower_stats":         follower_stats,
        "completeness_pct":       completeness,
    }


def print_dashboard(data: dict) -> None:
    """Pretty-print dashboard data to stdout (ASCII-safe for Windows terminals)."""
    W = 60
    sep = "-" * W

    print("\n" + "=" * W)
    print(f"  ENRICHMENT DASHBOARD  ({data['total_leads']} total leads)")
    print("=" * W)

    print(f"\nActive leads: {data.get('active_leads', 'N/A')}")

    print(f"\n{sep}")
    print("  Industry Distribution")
    print(sep)
    for industry, count in list(data.get("industry_distribution", {}).items())[:10]:
        bar = "#" * (count // 3)
        print(f"  {industry:<35} {count:>4}  {bar}")

    print(f"\n{sep}")
    print("  Top 15 Skills")
    print(sep)
    for skill, count in (data.get("top_skills") or [])[:15]:
        print(f"  {skill:<35} {count:>4}")

    print(f"\n{sep}")
    print("  Geo Distribution (Country)")
    print(sep)
    for country, count in list(data.get("geo_distribution", {}).items())[:10]:
        print(f"  {country:<35} {count:>4}")

    print(f"\n{sep}")
    print("  Experience Levels")
    print(sep)
    for level, count in data.get("experience_distribution", {}).items():
        print(f"  {level:<35} {count:>4}")

    print(f"\n{sep}")
    print("  Field Completeness (%)")
    print(sep)
    for field, pct in data.get("completeness_pct", {}).items():
        bar = "#" * int(pct // 5)
        print(f"  {field:<25} {pct:>5.1f}%  {bar}")

    if data.get("follower_stats"):
        fs = data["follower_stats"]
        print(f"\n{sep}")
        print("  Follower Stats")
        print(sep)
        print(f"  Min: {fs['min']:,}  |  Median: {fs['median']:,}  |  "
              f"Max: {fs['max']:,}  |  Mean: {fs['mean']:,}")

    print("\n" + "=" * W + "\n")
