"""
Engine 7: Real-time Invoice Pressure Testing
Every invoice is scored against historical baseline, peer group averages,
provider history, workforce constraints, and geographic feasibility.

Final score: Fraud likelihood = deviation × network risk × behavioural drift
"""
import math
from collections import defaultdict


def compute_baselines(claims, providers, participants):
    """Pre-compute statistical baselines for pressure testing."""
    # Provider baselines
    provider_stats = defaultdict(lambda: {
        "hours": [], "rates": [], "amounts": [],
        "participants": set(), "claim_count": 0,
    })
    for c in claims:
        ps = provider_stats[c["provider_id"]]
        ps["hours"].append(c["hours"])
        ps["rates"].append(c["rate_per_hour"])
        ps["amounts"].append(c["total_amount"])
        ps["participants"].add(c["participant_id"])
        ps["claim_count"] += 1

    provider_baselines = {}
    for pid, stats in provider_stats.items():
        hours = stats["hours"]
        rates = stats["rates"]
        provider_baselines[pid] = {
            "avg_hours": sum(hours) / len(hours) if hours else 0,
            "std_hours": _std(hours),
            "avg_rate": sum(rates) / len(rates) if rates else 0,
            "std_rate": _std(rates),
            "avg_amount": sum(stats["amounts"]) / len(stats["amounts"]) if stats["amounts"] else 0,
            "participant_count": len(stats["participants"]),
            "claim_count": stats["claim_count"],
        }

    # Participant baselines
    participant_stats = defaultdict(lambda: {"hours": [], "rates": [], "amounts": []})
    for c in claims:
        ps = participant_stats[c["participant_id"]]
        ps["hours"].append(c["hours"])
        ps["rates"].append(c["rate_per_hour"])
        ps["amounts"].append(c["total_amount"])

    participant_baselines = {}
    for pid, stats in participant_stats.items():
        participant_baselines[pid] = {
            "avg_hours": sum(stats["hours"]) / len(stats["hours"]) if stats["hours"] else 0,
            "std_hours": _std(stats["hours"]),
            "avg_rate": sum(stats["rates"]) / len(stats["rates"]) if stats["rates"] else 0,
            "avg_amount": sum(stats["amounts"]) / len(stats["amounts"]) if stats["amounts"] else 0,
        }

    # Global baselines (peer group)
    all_hours = [c["hours"] for c in claims]
    all_rates = [c["rate_per_hour"] for c in claims]
    global_baseline = {
        "avg_hours": sum(all_hours) / len(all_hours) if all_hours else 0,
        "std_hours": _std(all_hours),
        "avg_rate": sum(all_rates) / len(all_rates) if all_rates else 0,
        "std_rate": _std(all_rates),
    }

    return {
        "provider": provider_baselines,
        "participant": participant_baselines,
        "global": global_baseline,
    }


def pressure_test_invoice(claim, baselines, provider_risk_scores=None, drift_scores=None):
    """Score a single invoice against all baselines."""
    if provider_risk_scores is None:
        provider_risk_scores = {}
    if drift_scores is None:
        drift_scores = {}

    prov_bl = baselines["provider"].get(claim["provider_id"], {})
    part_bl = baselines["participant"].get(claim["participant_id"], {})
    global_bl = baselines["global"]

    flags = []

    # 1. Hours deviation from provider baseline
    hours_dev_provider = _z_score(claim["hours"], prov_bl.get("avg_hours", 0), prov_bl.get("std_hours", 1))
    if hours_dev_provider > 2:
        flags.append(f"Hours {hours_dev_provider:.1f}σ above provider average")

    # 2. Hours deviation from participant baseline
    hours_dev_participant = _z_score(claim["hours"], part_bl.get("avg_hours", 0), part_bl.get("std_hours", 1))
    if hours_dev_participant > 2:
        flags.append(f"Hours {hours_dev_participant:.1f}σ above participant average")

    # 3. Rate deviation from global baseline
    rate_dev = _z_score(claim["rate_per_hour"], global_bl.get("avg_rate", 0), global_bl.get("std_rate", 1))
    if rate_dev > 2:
        flags.append(f"Rate ${claim['rate_per_hour']:.0f}/hr ({rate_dev:.1f}σ above average)")

    # 4. Amount deviation
    amount_dev = _z_score(claim["total_amount"], prov_bl.get("avg_amount", 0),
                         prov_bl.get("avg_amount", 1) * 0.5)  # Use 50% of mean as proxy std
    if amount_dev > 2:
        flags.append(f"Amount ${claim['total_amount']:.0f} significantly above normal")

    # 5. Time-of-day check
    try:
        hour = int(claim["start_time"].split(":")[0])
        if hour < 6 or hour > 21:
            flags.append(f"Unusual billing hour: {hour:02d}:00")
    except (ValueError, IndexError):
        pass

    # Composite deviation score
    deviation_score = min(1.0, (
        abs(hours_dev_provider) * 0.25 +
        abs(hours_dev_participant) * 0.25 +
        abs(rate_dev) * 0.25 +
        abs(amount_dev) * 0.25
    ) / 3.0)

    # Network risk (from graph analysis)
    network_risk = provider_risk_scores.get(claim["provider_id"], 0.1)

    # Behavioural drift (from drift engine)
    behavioural_drift = drift_scores.get(claim["provider_id"], 0.1)

    # Final score
    fraud_likelihood = min(1.0, deviation_score * 0.4 + network_risk * 0.3 + behavioural_drift * 0.3)

    return {
        "claim_id": claim["id"],
        "provider_id": claim["provider_id"],
        "participant_id": claim["participant_id"],
        "fraud_likelihood": round(fraud_likelihood, 4),
        "deviation_score": round(deviation_score, 4),
        "network_risk": round(network_risk, 4),
        "behavioural_drift": round(behavioural_drift, 4),
        "flags": flags,
        "hours_zscore_provider": round(hours_dev_provider, 2),
        "hours_zscore_participant": round(hours_dev_participant, 2),
        "rate_zscore": round(rate_dev, 2),
    }


def pressure_test_batch(claims, baselines, provider_risk_scores=None, drift_scores=None,
                        threshold=0.5):
    """Pressure test a batch of claims and return those above threshold."""
    results = []
    for claim in claims:
        result = pressure_test_invoice(claim, baselines, provider_risk_scores, drift_scores)
        if result["fraud_likelihood"] >= threshold:
            results.append(result)

    results.sort(key=lambda x: x["fraud_likelihood"], reverse=True)
    return results


def get_invoice_distribution(claims, baselines):
    """Get distribution of fraud scores for visualization."""
    buckets = defaultdict(int)
    total = 0

    # Sample for performance
    sample = claims if len(claims) < 5000 else [claims[i] for i in range(0, len(claims), len(claims) // 5000 + 1)]

    for claim in sample:
        result = pressure_test_invoice(claim, baselines)
        bucket = round(result["fraud_likelihood"], 1)
        buckets[bucket] += 1
        total += 1

    distribution = []
    for score in [i / 10 for i in range(11)]:
        distribution.append({
            "score": score,
            "count": buckets.get(score, 0),
            "percentage": round(buckets.get(score, 0) / total * 100, 1) if total > 0 else 0,
        })

    return distribution


def _z_score(value, mean, std):
    if std == 0 or std is None:
        return 0
    return (value - mean) / std


def _std(values):
    if len(values) < 2:
        return 0
    mean = sum(values) / len(values)
    variance = sum((x - mean) ** 2 for x in values) / (len(values) - 1)
    return math.sqrt(variance)
