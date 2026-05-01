"""
Engine 5: Synthetic Participant Simulation Engine
Generates synthetic 'normal care' baselines and compares real data
to detect over-servicing, inflated frequency, and unnecessary service stacking.
"""
import random
import math
from collections import defaultdict


# Expected service patterns per support needs level
EXPECTED_PATTERNS = {
    "low": {
        "weekly_hours": (5, 12),
        "sessions_per_week": (2, 5),
        "avg_session_hours": (1.5, 3.0),
        "max_service_types": 3,
        "therapy_sessions_per_week": (0, 2),
        "weekend_ratio": (0.0, 0.15),
    },
    "medium": {
        "weekly_hours": (12, 25),
        "sessions_per_week": (4, 8),
        "avg_session_hours": (2.0, 4.0),
        "max_service_types": 5,
        "therapy_sessions_per_week": (1, 3),
        "weekend_ratio": (0.05, 0.25),
    },
    "high": {
        "weekly_hours": (25, 45),
        "sessions_per_week": (6, 14),
        "avg_session_hours": (2.0, 5.0),
        "max_service_types": 7,
        "therapy_sessions_per_week": (1, 4),
        "weekend_ratio": (0.1, 0.35),
    },
    "very_high": {
        "weekly_hours": (40, 80),
        "sessions_per_week": (10, 21),
        "avg_session_hours": (2.5, 6.0),
        "max_service_types": 10,
        "therapy_sessions_per_week": (2, 5),
        "weekend_ratio": (0.15, 0.5),
    },
}

THERAPY_SERVICES = {"Therapy - OT", "Therapy - Psychology", "Therapy - Speech"}


def generate_synthetic_baseline(participants, num_weeks=4):
    """Generate what 'normal' care looks like for each participant."""
    baselines = {}
    for part in participants:
        level = part["support_needs_level"]
        pattern = EXPECTED_PATTERNS.get(level, EXPECTED_PATTERNS["medium"])

        weekly_hours = random.uniform(*pattern["weekly_hours"])
        sessions_per_week = random.randint(*pattern["sessions_per_week"])
        avg_session = weekly_hours / sessions_per_week if sessions_per_week > 0 else 2

        baselines[part["id"]] = {
            "participant_id": part["id"],
            "support_level": level,
            "expected_weekly_hours": round(weekly_hours, 1),
            "expected_sessions_per_week": sessions_per_week,
            "expected_avg_session_hours": round(avg_session, 1),
            "max_service_types": pattern["max_service_types"],
            "expected_therapy_per_week": random.randint(*pattern["therapy_sessions_per_week"]),
            "expected_weekend_ratio": round(random.uniform(*pattern["weekend_ratio"]), 2),
            "expected_weekly_cost": round(weekly_hours * random.uniform(55, 70), 2),
        }

    return baselines


def compare_real_vs_synthetic(claims, participants, baselines):
    """Compare real billing against synthetic baselines."""
    alerts = []
    participant_lookup = {p["id"]: p for p in participants}

    # Group claims by participant and week
    part_week_data = defaultdict(lambda: defaultdict(list))
    for c in claims:
        from datetime import datetime
        dt = datetime.strptime(c["date"], "%Y-%m-%d")
        week = dt.strftime("%Y-W%W")
        part_week_data[c["participant_id"]][week].append(c)

    for part_id, weeks in part_week_data.items():
        baseline = baselines.get(part_id)
        if not baseline:
            continue

        for week, week_claims in weeks.items():
            actual_hours = sum(c["hours"] for c in week_claims)
            actual_sessions = len(week_claims)
            actual_cost = sum(c["total_amount"] for c in week_claims)
            actual_services = set(c["service_type"] for c in week_claims)
            therapy_sessions = sum(1 for c in week_claims if c["service_type"] in THERAPY_SERVICES)

            expected_hours = baseline["expected_weekly_hours"]
            expected_sessions = baseline["expected_sessions_per_week"]

            # Over-servicing: hours significantly above baseline
            if actual_hours > expected_hours * 2.0:
                ratio = actual_hours / expected_hours if expected_hours > 0 else actual_hours
                alerts.append({
                    "type": "over_servicing",
                    "severity": "high" if ratio > 3 else "medium",
                    "title": f"{part_id}: {actual_hours:.0f}h vs {expected_hours:.0f}h expected ({week})",
                    "description": (
                        f"Participant ({baseline['support_level']} needs) received "
                        f"{ratio:.1f}x expected weekly hours"
                    ),
                    "entities": [part_id] + list(set(c["provider_id"] for c in week_claims)),
                    "week": week,
                    "actual_hours": round(actual_hours, 1),
                    "expected_hours": expected_hours,
                    "ratio": round(ratio, 2),
                    "confidence": min(0.9, 0.4 + ratio * 0.1),
                })

            # Inflated session frequency
            if actual_sessions > expected_sessions * 2:
                freq_ratio = actual_sessions / expected_sessions if expected_sessions > 0 else actual_sessions
                alerts.append({
                    "type": "inflated_frequency",
                    "severity": "medium",
                    "title": f"{part_id}: {actual_sessions} sessions vs {expected_sessions} expected ({week})",
                    "description": (
                        f"Session frequency {freq_ratio:.1f}x above baseline for "
                        f"{baseline['support_level']} needs level"
                    ),
                    "entities": [part_id],
                    "week": week,
                    "actual_sessions": actual_sessions,
                    "expected_sessions": expected_sessions,
                    "confidence": min(0.85, 0.4 + freq_ratio * 0.08),
                })

            # Service stacking: too many concurrent service types
            if len(actual_services) > baseline["max_service_types"]:
                alerts.append({
                    "type": "service_stacking",
                    "severity": "high",
                    "title": f"{part_id}: {len(actual_services)} service types in {week}",
                    "description": (
                        f"Receiving {len(actual_services)} different service types "
                        f"(max expected: {baseline['max_service_types']} for "
                        f"{baseline['support_level']} needs). Services: {', '.join(actual_services)}"
                    ),
                    "entities": [part_id],
                    "services": list(actual_services),
                    "week": week,
                    "confidence": 0.7,
                })

            # Excessive therapy without clinical justification
            if therapy_sessions > baseline["expected_therapy_per_week"] * 3:
                alerts.append({
                    "type": "excessive_therapy",
                    "severity": "medium",
                    "title": f"{part_id}: {therapy_sessions} therapy sessions in {week}",
                    "description": (
                        f"Therapy sessions far exceed expected ({baseline['expected_therapy_per_week']}/week) "
                        f"for {baseline['support_level']} needs level"
                    ),
                    "entities": [part_id],
                    "week": week,
                    "therapy_sessions": therapy_sessions,
                    "expected": baseline["expected_therapy_per_week"],
                    "confidence": 0.65,
                })

    alerts.sort(key=lambda x: x["confidence"], reverse=True)
    return alerts[:100]


def get_participant_comparison(part_id, claims, baselines):
    """Get detailed comparison for a specific participant."""
    baseline = baselines.get(part_id, {})
    part_claims = [c for c in claims if c["participant_id"] == part_id]

    if not part_claims:
        return {"participant_id": part_id, "baseline": baseline, "actual": {}}

    total_hours = sum(c["hours"] for c in part_claims)
    total_cost = sum(c["total_amount"] for c in part_claims)
    services = list(set(c["service_type"] for c in part_claims))
    providers = list(set(c["provider_id"] for c in part_claims))

    # Monthly breakdown
    monthly = defaultdict(lambda: {"hours": 0, "cost": 0, "sessions": 0})
    for c in part_claims:
        month = c["date"][:7]
        monthly[month]["hours"] += c["hours"]
        monthly[month]["cost"] += c["total_amount"]
        monthly[month]["sessions"] += 1

    return {
        "participant_id": part_id,
        "baseline": baseline,
        "actual": {
            "total_hours": round(total_hours, 1),
            "total_cost": round(total_cost, 2),
            "total_sessions": len(part_claims),
            "service_types": services,
            "providers": providers,
            "monthly": {k: {kk: round(vv, 2) for kk, vv in v.items()} for k, v in sorted(monthly.items())},
        },
    }
