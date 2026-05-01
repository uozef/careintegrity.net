"""
Engine 2: Behavioural Drift Model
Each provider gets a behaviour fingerprint over time.
Detects impossible acceleration and structural impossibility signals.
"""
from collections import defaultdict
from datetime import datetime
import math


def compute_provider_fingerprints(providers, claims):
    """Compute monthly behavioural fingerprints for each provider."""
    # Group claims by provider and month
    provider_month_claims = defaultdict(lambda: defaultdict(list))
    for c in claims:
        month = c["date"][:7]  # YYYY-MM
        provider_month_claims[c["provider_id"]][month].append(c)

    fingerprints = {}
    for prov in providers:
        pid = prov["id"]
        monthly = provider_month_claims.get(pid, {})
        prov_fingerprints = []

        for month in sorted(monthly.keys()):
            month_claims = monthly[month]
            if not month_claims:
                continue

            participants = set(c["participant_id"] for c in month_claims)
            workers = set(c["worker_id"] for c in month_claims)
            total_hours = sum(c["hours"] for c in month_claims)
            total_amount = sum(c["total_amount"] for c in month_claims)

            # Service mix
            service_counts = defaultdict(int)
            for c in month_claims:
                service_counts[c["service_type"]] += 1
            total_claims = len(month_claims)
            service_mix = {k: round(v / total_claims, 3) for k, v in service_counts.items()}

            # Time-of-day distribution
            hour_counts = defaultdict(int)
            for c in month_claims:
                try:
                    hour = int(c["start_time"].split(":")[0])
                    hour_counts[hour] += 1
                except (ValueError, IndexError):
                    pass
            peak_hour = max(hour_counts, key=hour_counts.get) if hour_counts else 12

            # Weekend ratio
            weekend_claims = sum(1 for c in month_claims
                               if datetime.strptime(c["date"], "%Y-%m-%d").weekday() >= 5)
            weekend_ratio = weekend_claims / total_claims if total_claims > 0 else 0

            # Session duration stats
            durations = [c["hours"] for c in month_claims]
            avg_duration = sum(durations) / len(durations) if durations else 0

            # Geographic spread
            lats = [c["location_lat"] for c in month_claims]
            lngs = [c["location_lng"] for c in month_claims]
            if len(lats) > 1:
                lat_spread = max(lats) - min(lats)
                lng_spread = max(lngs) - min(lngs)
                geo_spread = math.sqrt(lat_spread**2 + lng_spread**2)
            else:
                geo_spread = 0

            fp = {
                "provider_id": pid,
                "period": month,
                "avg_hours_per_participant": round(total_hours / len(participants), 2) if participants else 0,
                "avg_session_duration": round(avg_duration, 2),
                "participant_count": len(participants),
                "worker_count": len(workers),
                "total_hours": round(total_hours, 2),
                "total_amount": round(total_amount, 2),
                "service_mix": service_mix,
                "peak_billing_hour": peak_hour,
                "weekend_ratio": round(weekend_ratio, 3),
                "geographic_spread": round(geo_spread, 4),
                "claims_count": total_claims,
                "staffing_ratio": round(len(participants) / len(workers), 2) if workers else 0,
            }
            prov_fingerprints.append(fp)

        # Compute growth rates
        for i in range(1, len(prov_fingerprints)):
            prev = prov_fingerprints[i - 1]
            curr = prov_fingerprints[i]
            if prev["participant_count"] > 0:
                curr["growth_rate"] = round(
                    (curr["participant_count"] - prev["participant_count"]) / prev["participant_count"], 3
                )
            else:
                curr["growth_rate"] = 0.0

        if prov_fingerprints and "growth_rate" not in prov_fingerprints[0]:
            prov_fingerprints[0]["growth_rate"] = 0.0

        fingerprints[pid] = prov_fingerprints

    return fingerprints


def detect_impossible_acceleration(fingerprints):
    """Detect providers with impossible growth patterns."""
    alerts = []
    for pid, fps in fingerprints.items():
        if len(fps) < 3:
            continue

        for i in range(2, len(fps)):
            curr = fps[i]
            prev = fps[i - 1]
            prev2 = fps[i - 2]

            # Check for explosive participant growth without staffing increase
            participant_growth = curr["participant_count"] - prev2["participant_count"]
            worker_growth = curr["worker_count"] - prev2["worker_count"]

            if participant_growth > 15 and worker_growth <= 2:
                alerts.append({
                    "type": "impossible_acceleration",
                    "severity": "critical",
                    "title": f"{pid}: +{participant_growth} participants with no staff increase",
                    "description": (
                        f"Provider grew from {prev2['participant_count']} to {curr['participant_count']} "
                        f"participants in 2 months, but workers only changed from {prev2['worker_count']} "
                        f"to {curr['worker_count']}. Structurally impossible."
                    ),
                    "entities": [pid],
                    "period": curr["period"],
                    "participant_growth": participant_growth,
                    "worker_growth": worker_growth,
                    "confidence": min(0.98, 0.7 + participant_growth * 0.005),
                })

            # Check for sudden billing spikes
            if prev["total_amount"] > 0:
                billing_ratio = curr["total_amount"] / prev["total_amount"]
                if billing_ratio > 3.0:
                    alerts.append({
                        "type": "billing_spike",
                        "severity": "high",
                        "title": f"{pid}: {billing_ratio:.1f}x billing increase in one month",
                        "description": (
                            f"Billing jumped from ${prev['total_amount']:,.0f} to "
                            f"${curr['total_amount']:,.0f} ({curr['period']})"
                        ),
                        "entities": [pid],
                        "period": curr["period"],
                        "billing_ratio": round(billing_ratio, 2),
                        "confidence": min(0.9, 0.5 + (billing_ratio - 2) * 0.1),
                    })

    alerts.sort(key=lambda x: x["confidence"], reverse=True)
    return alerts


def detect_staffing_anomalies(fingerprints):
    """Detect impossible staffing ratios."""
    alerts = []
    for pid, fps in fingerprints.items():
        for fp in fps:
            # More than 20 participants per worker is suspicious
            if fp["staffing_ratio"] > 20:
                alerts.append({
                    "type": "staffing_anomaly",
                    "severity": "high",
                    "title": f"{pid}: {fp['staffing_ratio']:.0f}:1 participant-to-worker ratio",
                    "description": (
                        f"{fp['participant_count']} participants served by {fp['worker_count']} "
                        f"workers in {fp['period']} — exceeds realistic capacity"
                    ),
                    "entities": [pid],
                    "period": fp["period"],
                    "ratio": fp["staffing_ratio"],
                    "confidence": min(0.95, 0.6 + (fp["staffing_ratio"] - 15) * 0.02),
                })

            # Unusual billing hours (after 10pm or before 6am dominant)
            if fp["peak_billing_hour"] < 6 or fp["peak_billing_hour"] > 21:
                alerts.append({
                    "type": "unusual_hours",
                    "severity": "medium",
                    "title": f"{pid}: Peak billing at {fp['peak_billing_hour']}:00",
                    "description": f"Most billing occurs outside normal hours in {fp['period']}",
                    "entities": [pid],
                    "period": fp["period"],
                    "peak_hour": fp["peak_billing_hour"],
                    "confidence": 0.65,
                })

    return alerts


def get_drift_timeline(fingerprints, provider_id):
    """Get the behavioural drift timeline for a specific provider."""
    fps = fingerprints.get(provider_id, [])
    timeline = []
    for fp in fps:
        timeline.append({
            "period": fp["period"],
            "participants": fp["participant_count"],
            "workers": fp["worker_count"],
            "total_hours": fp["total_hours"],
            "total_amount": fp["total_amount"],
            "avg_session_duration": fp["avg_session_duration"],
            "staffing_ratio": fp["staffing_ratio"],
            "growth_rate": fp.get("growth_rate", 0),
            "weekend_ratio": fp["weekend_ratio"],
            "geographic_spread": fp["geographic_spread"],
        })
    return timeline
