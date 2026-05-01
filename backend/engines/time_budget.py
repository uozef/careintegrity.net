"""
Engine 3: Human Time Budget Constraint Model
Validates that claimed support doesn't exceed physically possible human time.
Checks worker overlap, participant capacity, travel constraints.
"""
import math
from collections import defaultdict
from datetime import datetime, timedelta


def haversine_km(lat1, lng1, lat2, lng2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlng / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


def parse_time(t):
    parts = t.split(":")
    return int(parts[0]) * 60 + int(parts[1])


def times_overlap(start1, end1, start2, end2):
    s1, e1 = parse_time(start1), parse_time(end1)
    s2, e2 = parse_time(start2), parse_time(end2)
    if e1 <= s1:
        e1 += 24 * 60
    if e2 <= s2:
        e2 += 24 * 60
    return s1 < e2 and s2 < e1


def detect_worker_time_impossibilities(claims):
    """Detect workers billed at multiple locations simultaneously."""
    alerts = []

    # Group claims by worker and date
    worker_day_claims = defaultdict(list)
    for c in claims:
        key = (c["worker_id"], c["date"])
        worker_day_claims[key].append(c)

    for (worker_id, day), day_claims in worker_day_claims.items():
        if len(day_claims) < 2:
            continue

        # Sort by start time
        day_claims.sort(key=lambda x: parse_time(x["start_time"]))

        # Check for overlapping shifts
        for i in range(len(day_claims)):
            for j in range(i + 1, len(day_claims)):
                c1, c2 = day_claims[i], day_claims[j]
                if times_overlap(c1["start_time"], c1["end_time"],
                                c2["start_time"], c2["end_time"]):
                    # Check if different locations
                    dist = haversine_km(c1["location_lat"], c1["location_lng"],
                                       c2["location_lat"], c2["location_lng"])
                    if dist > 0.5:  # More than 500m apart
                        alerts.append({
                            "type": "worker_time_impossibility",
                            "severity": "critical",
                            "title": f"Worker {worker_id} in 2 places at once on {day}",
                            "description": (
                                f"Claimed at {c1['start_time']}-{c1['end_time']} "
                                f"({c1['provider_id']}) and {c2['start_time']}-{c2['end_time']} "
                                f"({c2['provider_id']}) — {dist:.1f}km apart"
                            ),
                            "entities": [worker_id, c1["provider_id"], c2["provider_id"]],
                            "claims": [c1["id"], c2["id"]],
                            "distance_km": round(dist, 2),
                            "date": day,
                            "confidence": min(0.99, 0.8 + dist * 0.01),
                        })

        # Check total hours in a day
        total_hours = sum(c["hours"] for c in day_claims)
        if total_hours > 16:
            alerts.append({
                "type": "excessive_daily_hours",
                "severity": "high",
                "title": f"Worker {worker_id}: {total_hours:.1f}h billed on {day}",
                "description": f"Total claimed hours exceed realistic daily capacity",
                "entities": [worker_id],
                "total_hours": round(total_hours, 1),
                "date": day,
                "num_claims": len(day_claims),
                "confidence": min(0.95, 0.6 + (total_hours - 16) * 0.05),
            })

    # Ensure both types are represented — take top 50 of each type
    time_imp = sorted([a for a in alerts if a["type"] == "worker_time_impossibility"], key=lambda x: x["confidence"], reverse=True)[:50]
    excess_hrs = sorted([a for a in alerts if a["type"] == "excessive_daily_hours"], key=lambda x: x["confidence"], reverse=True)[:50]
    combined = time_imp + excess_hrs
    combined.sort(key=lambda x: x["confidence"], reverse=True)
    return combined


def detect_participant_overservicing(claims, participants):
    """Detect participants receiving more hours than physically plausible."""
    alerts = []
    participant_lookup = {p["id"]: p for p in participants}

    # Group claims by participant and week
    participant_week_hours = defaultdict(lambda: defaultdict(float))
    participant_week_claims = defaultdict(lambda: defaultdict(list))
    for c in claims:
        dt = datetime.strptime(c["date"], "%Y-%m-%d")
        week = dt.strftime("%Y-W%W")
        participant_week_hours[c["participant_id"]][week] += c["hours"]
        participant_week_claims[c["participant_id"]][week].append(c)

    for part_id, weekly_hours in participant_week_hours.items():
        part = participant_lookup.get(part_id)
        if not part:
            continue

        max_weekly = part["allocated_hours_weekly"]
        for week, hours in weekly_hours.items():
            if hours > max_weekly * 2:
                ratio = hours / max_weekly if max_weekly > 0 else hours
                providers = set(c["provider_id"] for c in participant_week_claims[part_id][week])
                alerts.append({
                    "type": "participant_overservicing",
                    "severity": "high" if ratio > 3 else "medium",
                    "title": f"{part_id}: {hours:.0f}h in {week} (allocated: {max_weekly:.0f}h)",
                    "description": (
                        f"Participant received {ratio:.1f}x their allocated weekly hours "
                        f"from {len(providers)} provider(s)"
                    ),
                    "entities": [part_id] + list(providers),
                    "week": week,
                    "claimed_hours": round(hours, 1),
                    "allocated_hours": max_weekly,
                    "ratio": round(ratio, 2),
                    "confidence": min(0.95, 0.5 + ratio * 0.1),
                })

    alerts.sort(key=lambda x: x.get("ratio", 0), reverse=True)
    return alerts[:100]


def detect_travel_impossibilities(claims):
    """Detect workers with impossible travel between consecutive sessions."""
    alerts = []

    worker_day_claims = defaultdict(list)
    for c in claims:
        key = (c["worker_id"], c["date"])
        worker_day_claims[key].append(c)

    for (worker_id, day), day_claims in worker_day_claims.items():
        if len(day_claims) < 2:
            continue

        day_claims.sort(key=lambda x: parse_time(x["start_time"]))

        for i in range(len(day_claims) - 1):
            c1, c2 = day_claims[i], day_claims[i + 1]
            dist = haversine_km(c1["location_lat"], c1["location_lng"],
                               c2["location_lat"], c2["location_lng"])

            # Time gap between sessions
            end1 = parse_time(c1["end_time"])
            start2 = parse_time(c2["start_time"])
            gap_minutes = start2 - end1

            if gap_minutes <= 0:
                continue

            # Assume max 60 km/h average in urban areas
            min_travel_minutes = (dist / 60) * 60

            if dist > 5 and gap_minutes < min_travel_minutes:
                alerts.append({
                    "type": "travel_impossibility",
                    "severity": "high",
                    "title": f"Worker {worker_id}: {dist:.0f}km in {gap_minutes}min on {day}",
                    "description": (
                        f"Must travel {dist:.1f}km between sessions but only "
                        f"{gap_minutes}min gap (needs ~{min_travel_minutes:.0f}min)"
                    ),
                    "entities": [worker_id, c1["provider_id"], c2["provider_id"]],
                    "distance_km": round(dist, 1),
                    "gap_minutes": gap_minutes,
                    "required_minutes": round(min_travel_minutes),
                    "date": day,
                    "confidence": min(0.9, 0.6 + (min_travel_minutes - gap_minutes) * 0.01),
                })

    alerts.sort(key=lambda x: x["confidence"], reverse=True)
    return alerts[:50]


def get_worker_daily_summary(claims, worker_id, target_date):
    """Get detailed daily timeline for a specific worker."""
    day_claims = [c for c in claims
                  if c["worker_id"] == worker_id and c["date"] == target_date]
    day_claims.sort(key=lambda x: parse_time(x["start_time"]))

    total_hours = sum(c["hours"] for c in day_claims)
    providers = list(set(c["provider_id"] for c in day_claims))
    participants = list(set(c["participant_id"] for c in day_claims))

    return {
        "worker_id": worker_id,
        "date": target_date,
        "total_hours": round(total_hours, 1),
        "num_sessions": len(day_claims),
        "providers": providers,
        "participants": participants,
        "sessions": [{
            "claim_id": c["id"],
            "start": c["start_time"],
            "end": c["end_time"],
            "hours": c["hours"],
            "provider": c["provider_id"],
            "participant": c["participant_id"],
            "location": f"({c['location_lat']:.4f}, {c['location_lng']:.4f})",
        } for c in day_claims],
    }
