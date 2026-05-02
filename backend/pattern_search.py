"""
Free-text fraud pattern search engine.
Parses natural language fraud descriptions and searches across all data sources
to find matching providers, workers, and participants.
"""
import re
from collections import defaultdict
from datetime import datetime


# Saved scenarios store
SAVED_SCENARIOS = [
    {
        "id": "SC-001",
        "name": "Ghost workers billing overnight",
        "query": "workers billing between midnight and 5am with sessions over 6 hours",
        "created_by": "system",
        "created_at": "2025-01-01T00:00:00",
        "run_count": 12,
        "last_run": "2026-05-01T08:00:00",
    },
    {
        "id": "SC-002",
        "name": "Provider growth without staff",
        "query": "providers with more than 50 participants but less than 3 workers",
        "created_by": "system",
        "created_at": "2025-01-01T00:00:00",
        "run_count": 8,
        "last_run": "2026-04-28T14:00:00",
    },
    {
        "id": "SC-003",
        "name": "SIL billing anomaly",
        "query": "SIL services billed at rates above $90 per hour on weekends",
        "created_by": "system",
        "created_at": "2025-02-15T00:00:00",
        "run_count": 5,
        "last_run": "2026-04-25T10:00:00",
    },
]

SCENARIO_COUNTER = 4


def parse_query(query):
    """Extract search parameters from natural language query."""
    q = query.lower()
    params = {
        "service_types": [],
        "min_hours": None,
        "max_hours": None,
        "min_rate": None,
        "max_rate": None,
        "min_participants": None,
        "max_participants": None,
        "min_workers": None,
        "max_workers": None,
        "time_start": None,
        "time_end": None,
        "weekend_only": False,
        "night_only": False,
        "keywords": [],
        "provider_pattern": None,
        "worker_pattern": None,
    }

    # Service types
    svc_map = {
        "sil": "SIL", "core support": "Core Support", "therapy": None,
        "transport": "Transport", "ot": "Therapy - OT", "occupational therapy": "Therapy - OT",
        "psychology": "Therapy - Psychology", "speech": "Therapy - Speech",
        "community access": "Community Access", "personal care": "Personal Care",
        "plan management": "Plan Management", "support coordination": "Support Coordination",
        "domestic": "Domestic Assistance", "capacity": "Capacity Building",
    }
    for key, val in svc_map.items():
        if key in q:
            if val:
                params["service_types"].append(val)
            else:
                params["service_types"].extend(["Therapy - OT", "Therapy - Psychology", "Therapy - Speech"])

    # Hours
    hrs_match = re.findall(r'(?:over|above|more than|>)\s*(\d+)\s*hours?', q)
    if hrs_match:
        params["min_hours"] = float(hrs_match[0])
    hrs_match2 = re.findall(r'(?:under|below|less than|<)\s*(\d+)\s*hours?', q)
    if hrs_match2:
        params["max_hours"] = float(hrs_match2[0])

    # Rates
    rate_match = re.findall(r'(?:over|above|more than|>)\s*\$?(\d+)\s*(?:per hour|/h|/hr|an hour)', q)
    if rate_match:
        params["min_rate"] = float(rate_match[0])
    rate_match2 = re.findall(r'(?:rate|rates)\s*(?:above|over|>)\s*\$?(\d+)', q)
    if rate_match2:
        params["min_rate"] = float(rate_match2[0])

    # Participants
    part_match = re.findall(r'(?:more than|over|>)\s*(\d+)\s*(?:participants?|clients?|patients?)', q)
    if part_match:
        params["min_participants"] = int(part_match[0])
    part_match2 = re.findall(r'(?:less than|under|fewer than|<)\s*(\d+)\s*(?:participants?|clients?)', q)
    if part_match2:
        params["max_participants"] = int(part_match2[0])

    # Workers
    wrk_match = re.findall(r'(?:less than|under|fewer than|<)\s*(\d+)\s*(?:workers?|staff)', q)
    if wrk_match:
        params["max_workers"] = int(wrk_match[0])
    wrk_match2 = re.findall(r'(?:more than|over|>)\s*(\d+)\s*(?:workers?|staff)', q)
    if wrk_match2:
        params["min_workers"] = int(wrk_match2[0])

    # Time patterns
    if any(w in q for w in ["midnight", "night", "overnight", "after hours", "late night"]):
        params["night_only"] = True
        params["time_start"] = 0
        params["time_end"] = 6
    if "between" in q:
        time_match = re.findall(r'between\s*(\d{1,2})\s*(?:am|pm|:00)?\s*and\s*(\d{1,2})\s*(?:am|pm|:00)?', q)
        if time_match:
            params["time_start"] = int(time_match[0][0])
            params["time_end"] = int(time_match[0][1])

    if "weekend" in q:
        params["weekend_only"] = True

    # Keywords for fuzzy matching
    fraud_keywords = ["ghost", "fake", "simultaneous", "overlap", "duplicate", "inflated",
                     "excessive", "impossible", "fabricated", "stacking", "cycling", "collusion",
                     "shared staff", "shared address", "multiple locations", "same worker"]
    for kw in fraud_keywords:
        if kw in q:
            params["keywords"].append(kw)

    # Provider/worker specific
    if "same worker" in q or "single worker" in q:
        params["worker_pattern"] = "single_worker_multiple"
    if "multiple provider" in q or "shared" in q:
        params["provider_pattern"] = "shared_resources"

    return params


def search_fraud_pattern(query, claims, providers, workers, participants, risk_agg):
    """Execute a fraud pattern search across all data."""
    params = parse_query(query)

    # Group claims by provider
    prov_claims = defaultdict(list)
    for c in claims:
        prov_claims[c["provider_id"]].append(c)

    # Group claims by worker
    worker_claims = defaultdict(list)
    for c in claims:
        worker_claims[c["worker_id"]].append(c)

    suspects = []
    matched_claims = []

    provider_lookup = {p["id"]: p for p in providers}
    worker_lookup = {w["id"]: w for w in workers}

    # Search providers
    for pid, pclaims in prov_claims.items():
        score = 0
        reasons = []
        prov = provider_lookup.get(pid, {})

        # Service type filter
        if params["service_types"]:
            svc_claims = [c for c in pclaims if c["service_type"] in params["service_types"]]
            if not svc_claims:
                continue
            pclaims = svc_claims
            score += 10

        filtered = pclaims

        # Hours filter
        if params["min_hours"]:
            filtered = [c for c in filtered if c["hours"] > params["min_hours"]]
            if filtered:
                score += 20
                reasons.append(f"Sessions over {params['min_hours']}h found ({len(filtered)} claims)")

        # Rate filter
        if params["min_rate"]:
            filtered = [c for c in filtered if c["rate_per_hour"] > params["min_rate"]]
            if filtered:
                score += 20
                reasons.append(f"Rates above ${params['min_rate']}/h ({len(filtered)} claims)")

        # Time of day filter
        if params["night_only"] or params["time_start"] is not None:
            start_h = params["time_start"] if params["time_start"] is not None else 0
            end_h = params["time_end"] if params["time_end"] is not None else 6
            night = []
            for c in filtered:
                try:
                    h = int(c["start_time"].split(":")[0])
                    if start_h <= h <= end_h or (start_h > end_h and (h >= start_h or h <= end_h)):
                        night.append(c)
                except:
                    pass
            if night:
                filtered = night
                score += 25
                reasons.append(f"Night/after-hours billing ({len(night)} claims between {start_h}:00-{end_h}:00)")

        # Weekend filter
        if params["weekend_only"]:
            wknd = []
            for c in filtered:
                try:
                    from datetime import datetime as dt
                    if dt.strptime(c["date"], "%Y-%m-%d").weekday() >= 5:
                        wknd.append(c)
                except:
                    pass
            if wknd:
                filtered = wknd
                score += 15
                reasons.append(f"Weekend billing ({len(wknd)} claims)")

        # Participant/worker count checks
        unique_parts = set(c["participant_id"] for c in pclaims)
        unique_workers = set(c["worker_id"] for c in pclaims)

        if params["min_participants"] and len(unique_parts) > params["min_participants"]:
            score += 20
            reasons.append(f"{len(unique_parts)} participants (threshold: >{params['min_participants']})")

        if params["max_workers"] and len(unique_workers) < params["max_workers"]:
            score += 30
            reasons.append(f"Only {len(unique_workers)} workers for {len(unique_parts)} participants")

        # Keyword-based checks
        if "ghost" in params["keywords"] or "fake" in params["keywords"]:
            score += 10
            reasons.append("Pattern matches ghost/fake billing indicators")
        if "stacking" in params["keywords"]:
            svcs = set(c["service_type"] for c in pclaims)
            if len(svcs) > 5:
                score += 15
                reasons.append(f"Service stacking: {len(svcs)} service types")
        if "simultaneous" in params["keywords"] or "overlap" in params["keywords"]:
            score += 10
            reasons.append("Checking for simultaneous billing patterns")

        if not filtered and not reasons:
            continue

        risk = risk_agg.get(pid, {})
        risk_score = risk.get("risk_score", 0)
        score += int(risk_score * 30)

        if score > 0 or filtered:
            total_amount = sum(c["total_amount"] for c in (filtered or pclaims[:100]))
            suspects.append({
                "entity_type": "provider",
                "entity_id": pid,
                "entity_name": prov.get("name", pid),
                "match_score": min(100, score),
                "risk_score": risk_score,
                "alert_count": risk.get("alerts", 0),
                "reasons": reasons or ["Matches query criteria"],
                "matched_claims": len(filtered),
                "total_amount": round(total_amount, 2),
                "participants": len(unique_parts),
                "workers": len(unique_workers),
                "sample_claims": [{"id": c["id"], "date": c["date"], "hours": c["hours"],
                                   "rate": c["rate_per_hour"], "amount": round(c["total_amount"], 2),
                                   "service": c["service_type"], "time": c["start_time"]}
                                  for c in (filtered or pclaims)[:5]],
            })

    # Also search workers for worker-specific patterns
    if params["worker_pattern"] or params["night_only"] or "simultaneous" in params["keywords"]:
        for wid, wclaims in worker_claims.items():
            worker = worker_lookup.get(wid, {})
            score = 0
            reasons = []

            if params["worker_pattern"] == "single_worker_multiple":
                provs = set(c["provider_id"] for c in wclaims)
                if len(provs) > 1:
                    score += 30
                    reasons.append(f"Worker across {len(provs)} providers: {', '.join(list(provs)[:5])}")

            if params["night_only"]:
                night = [c for c in wclaims if int(c["start_time"].split(":")[0]) < 6]
                if night:
                    score += 20
                    reasons.append(f"{len(night)} night shifts")

            if score > 0:
                suspects.append({
                    "entity_type": "worker",
                    "entity_id": wid,
                    "entity_name": worker.get("name", wid),
                    "match_score": min(100, score),
                    "risk_score": 0,
                    "alert_count": 0,
                    "reasons": reasons,
                    "matched_claims": len(wclaims),
                    "total_amount": round(sum(c["total_amount"] for c in wclaims), 2),
                    "participants": len(set(c["participant_id"] for c in wclaims)),
                    "workers": 1,
                    "sample_claims": [{"id": c["id"], "date": c["date"], "hours": c["hours"],
                                       "rate": c["rate_per_hour"], "amount": round(c["total_amount"], 2),
                                       "service": c["service_type"], "time": c["start_time"]}
                                      for c in wclaims[:5]],
                })

    suspects.sort(key=lambda x: x["match_score"], reverse=True)

    return {
        "query": query,
        "parsed_params": {k: v for k, v in params.items() if v},
        "total_suspects": len(suspects),
        "suspects": suspects[:30],
        "searched_at": datetime.now().isoformat(),
    }


def save_scenario(name, query, created_by):
    global SCENARIO_COUNTER
    scenario = {
        "id": f"SC-{SCENARIO_COUNTER:03d}",
        "name": name,
        "query": query,
        "created_by": created_by,
        "created_at": datetime.now().isoformat(),
        "run_count": 0,
        "last_run": None,
    }
    SAVED_SCENARIOS.append(scenario)
    SCENARIO_COUNTER += 1
    return scenario


def get_saved_scenarios():
    return SAVED_SCENARIOS


def delete_scenario(scenario_id):
    global SAVED_SCENARIOS
    SAVED_SCENARIOS = [s for s in SAVED_SCENARIOS if s["id"] != scenario_id]
    return True


def increment_scenario_run(scenario_id):
    for s in SAVED_SCENARIOS:
        if s["id"] == scenario_id:
            s["run_count"] += 1
            s["last_run"] = datetime.now().isoformat()
            return s
    return None
