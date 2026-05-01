"""
Engine 4: Provider DNA Embedding Model (AI Representation Learning)
Converts each provider into a vector embedding and detects behavioural mutations,
cluster anomalies, and providers grouping with known high-risk entities.
"""
import math
from collections import defaultdict
import numpy as np


SERVICE_TYPES_LIST = [
    "SIL", "Core Support", "Capacity Building", "Transport",
    "Therapy - OT", "Therapy - Psychology", "Therapy - Speech",
    "Community Access", "Personal Care", "Domestic Assistance",
    "Plan Management", "Support Coordination",
]

DISABILITY_TYPES_LIST = [
    "Intellectual", "Physical", "Psychosocial", "Autism",
    "Neurological", "Sensory", "Multiple",
]


def compute_provider_embeddings(providers, claims, participants):
    """Compute vector embeddings for each provider based on their behaviour."""
    participant_lookup = {p["id"]: p for p in participants}

    # Group claims by provider and month
    provider_claims = defaultdict(list)
    provider_month_claims = defaultdict(lambda: defaultdict(list))
    for c in claims:
        provider_claims[c["provider_id"]].append(c)
        month = c["date"][:7]
        provider_month_claims[c["provider_id"]][month].append(c)

    embeddings = {}
    for prov in providers:
        pid = prov["id"]
        p_claims = provider_claims.get(pid, [])
        if not p_claims:
            continue

        monthly_embeddings = {}
        for month, m_claims in sorted(provider_month_claims[pid].items()):
            embedding = _compute_single_embedding(prov, m_claims, participant_lookup)
            monthly_embeddings[month] = embedding

        # Also compute overall embedding
        overall = _compute_single_embedding(prov, p_claims, participant_lookup)
        embeddings[pid] = {
            "overall": overall,
            "monthly": monthly_embeddings,
        }

    return embeddings


def _compute_single_embedding(provider, claims_subset, participant_lookup):
    """Compute a single embedding vector for a set of claims."""
    if not claims_subset:
        return [0.0] * 32

    # Feature 1-12: Service mix proportions
    service_counts = defaultdict(int)
    for c in claims_subset:
        service_counts[c["service_type"]] += 1
    total = len(claims_subset)
    service_vec = [service_counts.get(st, 0) / total for st in SERVICE_TYPES_LIST]

    # Feature 13-19: Participant demographics served
    part_ids = set(c["participant_id"] for c in claims_subset)
    disability_counts = defaultdict(int)
    for pid in part_ids:
        p = participant_lookup.get(pid)
        if p:
            disability_counts[p["disability_type"]] += 1
    demo_total = sum(disability_counts.values()) or 1
    demo_vec = [disability_counts.get(dt, 0) / demo_total for dt in DISABILITY_TYPES_LIST]

    # Feature 20: Average session duration (normalized)
    durations = [c["hours"] for c in claims_subset]
    avg_duration = sum(durations) / len(durations) if durations else 0
    norm_duration = min(avg_duration / 10.0, 1.0)

    # Feature 21: Average rate per hour (normalized)
    rates = [c["rate_per_hour"] for c in claims_subset]
    avg_rate = sum(rates) / len(rates) if rates else 0
    norm_rate = min(avg_rate / 150.0, 1.0)

    # Feature 22: Weekend ratio
    weekend_claims = sum(1 for c in claims_subset
                        if _is_weekend(c["date"]))
    weekend_ratio = weekend_claims / total

    # Feature 23: Night hours ratio (before 7am or after 9pm)
    night_claims = sum(1 for c in claims_subset
                      if _is_night(c["start_time"]))
    night_ratio = night_claims / total

    # Feature 24: Participant count (normalized)
    norm_participants = min(len(part_ids) / 100.0, 1.0)

    # Feature 25: Geographic spread
    lats = [c["location_lat"] for c in claims_subset]
    lngs = [c["location_lng"] for c in claims_subset]
    geo_spread = 0
    if len(lats) > 1:
        lat_std = float(np.std(lats))
        lng_std = float(np.std(lngs))
        geo_spread = min(math.sqrt(lat_std**2 + lng_std**2) * 100, 1.0)

    # Feature 26: Billing intensity (total $ per participant)
    total_amount = sum(c["total_amount"] for c in claims_subset)
    billing_intensity = min((total_amount / len(part_ids)) / 10000.0, 1.0) if part_ids else 0

    # Feature 27-28: Session length variance
    duration_std = float(np.std(durations)) if len(durations) > 1 else 0
    norm_duration_std = min(duration_std / 5.0, 1.0)

    # Feature 29: Rate variance
    rate_std = float(np.std(rates)) if len(rates) > 1 else 0
    norm_rate_std = min(rate_std / 50.0, 1.0)

    # Feature 30-32: Time distribution entropy
    hour_bins = [0] * 8  # 3-hour bins: 0-3, 3-6, 6-9, ..., 21-24
    for c in claims_subset:
        try:
            h = int(c["start_time"].split(":")[0])
            hour_bins[h // 3] += 1
        except (ValueError, IndexError):
            pass
    bin_total = sum(hour_bins) or 1
    time_probs = [b / bin_total for b in hour_bins]
    time_entropy = -sum(p * math.log(p + 1e-10) for p in time_probs)
    norm_entropy = min(time_entropy / math.log(8), 1.0)

    embedding = (
        service_vec +          # 12 features
        demo_vec +             # 7 features
        [norm_duration] +      # 1
        [norm_rate] +          # 1
        [weekend_ratio] +      # 1
        [night_ratio] +        # 1
        [norm_participants] +  # 1
        [geo_spread] +         # 1
        [billing_intensity] +  # 1
        [norm_duration_std] +  # 1
        [norm_rate_std] +      # 1
        [norm_entropy] +       # 1
        time_probs             # 8 features (pad to 32 total: 12+7+8+8=35 actually)
    )

    return [round(x, 4) for x in embedding[:35]]


def _is_weekend(date_str):
    from datetime import datetime as dt
    return dt.strptime(date_str, "%Y-%m-%d").weekday() >= 5


def _is_night(time_str):
    try:
        h = int(time_str.split(":")[0])
        return h < 7 or h >= 21
    except (ValueError, IndexError):
        return False


def detect_behavioural_mutations(embeddings):
    """Detect providers whose embedding vectors shift dramatically over time."""
    alerts = []
    for pid, emb_data in embeddings.items():
        monthly = emb_data.get("monthly", {})
        months = sorted(monthly.keys())
        if len(months) < 3:
            continue

        for i in range(2, len(months)):
            prev = np.array(monthly[months[i - 2]])
            curr = np.array(monthly[months[i]])

            if len(prev) != len(curr):
                continue

            # Cosine distance
            dot = np.dot(prev, curr)
            norm_prev = np.linalg.norm(prev)
            norm_curr = np.linalg.norm(curr)
            if norm_prev == 0 or norm_curr == 0:
                continue
            cosine_sim = dot / (norm_prev * norm_curr)
            cosine_dist = 1 - cosine_sim

            # Euclidean distance
            euclidean_dist = float(np.linalg.norm(curr - prev))

            if cosine_dist > 0.04 or euclidean_dist > 0.4:
                # Identify what changed most
                diff = curr - prev
                top_changes = sorted(
                    enumerate(diff), key=lambda x: abs(x[1]), reverse=True
                )[:5]

                alerts.append({
                    "type": "behavioural_mutation",
                    "severity": "critical" if cosine_dist > 0.08 else "high" if cosine_dist > 0.05 else "medium",
                    "title": f"{pid}: Dramatic behaviour shift ({months[i-2]} → {months[i]})",
                    "description": (
                        f"Provider DNA changed significantly: cosine distance={cosine_dist:.3f}, "
                        f"euclidean distance={euclidean_dist:.3f}. Possible role/service shift."
                    ),
                    "entities": [pid],
                    "from_period": months[i - 2],
                    "to_period": months[i],
                    "cosine_distance": round(cosine_dist, 4),
                    "euclidean_distance": round(euclidean_dist, 4),
                    "confidence": min(0.95, 0.5 + cosine_dist * 5),
                })

    alerts.sort(key=lambda x: x.get("cosine_distance", 0), reverse=True)
    return alerts[:30]


def detect_cluster_anomalies(embeddings, fraud_provider_ids=None):
    """Detect providers clustering unnaturally with high-risk entities."""
    if fraud_provider_ids is None:
        fraud_provider_ids = set()
    else:
        fraud_provider_ids = set(fraud_provider_ids)

    alerts = []
    providers_with_embeddings = {
        pid: emb_data["overall"]
        for pid, emb_data in embeddings.items()
        if emb_data.get("overall")
    }

    pids = list(providers_with_embeddings.keys())
    if len(pids) < 3:
        return alerts

    # Compute pairwise similarities
    vectors = np.array([providers_with_embeddings[pid] for pid in pids])

    # Normalize
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms == 0] = 1
    vectors_norm = vectors / norms

    # Cosine similarity matrix
    sim_matrix = vectors_norm @ vectors_norm.T

    # Find providers suspiciously similar to known fraud providers
    for i, pid in enumerate(pids):
        if pid in fraud_provider_ids:
            continue
        for j, fpid in enumerate(pids):
            if fpid not in fraud_provider_ids:
                continue
            sim = float(sim_matrix[i][j])
            if sim > 0.70:
                alerts.append({
                    "type": "cluster_anomaly",
                    "severity": "high",
                    "title": f"{pid} clusters with flagged provider {fpid}",
                    "description": (
                        f"Provider DNA similarity {sim:.3f} with known high-risk provider. "
                        f"May indicate similar fraudulent patterns."
                    ),
                    "entities": [pid, fpid],
                    "similarity": round(sim, 4),
                    "confidence": min(0.9, 0.5 + sim * 0.4),
                })

    return alerts


def get_embedding_visualization_data(embeddings):
    """Reduce embeddings to 2D using PCA + force-spread for better distribution."""
    pids = list(embeddings.keys())
    if len(pids) < 3:
        return []

    vectors = []
    valid_pids = []
    for pid in pids:
        emb = embeddings[pid].get("overall", [])
        if emb and any(v != 0 for v in emb):
            vectors.append(emb)
            valid_pids.append(pid)

    if len(valid_pids) < 3:
        return []

    # Pad/truncate to same length
    max_len = max(len(v) for v in vectors)
    vectors = [v + [0] * (max_len - len(v)) for v in vectors]

    X = np.array(vectors)

    # Normalize each feature to [0,1] to prevent single features dominating
    for col in range(X.shape[1]):
        col_min = X[:, col].min()
        col_max = X[:, col].max()
        if col_max - col_min > 1e-8:
            X[:, col] = (X[:, col] - col_min) / (col_max - col_min)

    # PCA to 2D
    X_centered = X - X.mean(axis=0)
    try:
        cov = np.cov(X_centered.T)
        eigenvalues, eigenvectors = np.linalg.eigh(cov)
        idx = eigenvalues.argsort()[::-1][:2]
        components = eigenvectors[:, idx]
        X_2d = X_centered @ components
    except np.linalg.LinAlgError:
        return []

    # Normalize to [-1, 1]
    for dim in range(2):
        col = X_2d[:, dim]
        vmin, vmax = col.min(), col.max()
        if vmax - vmin > 1e-8:
            X_2d[:, dim] = 2.0 * (col - vmin) / (vmax - vmin) - 1.0

    # Force-spread: push overlapping points apart (like t-SNE repulsion)
    positions = X_2d.copy()
    for iteration in range(80):
        alpha = 0.05 * (1 - iteration / 80)
        for i in range(len(positions)):
            for j in range(i + 1, len(positions)):
                dx = positions[j][0] - positions[i][0]
                dy = positions[j][1] - positions[i][1]
                dist = math.sqrt(dx * dx + dy * dy) + 1e-6
                # Repel if too close (< 0.12 in normalized space)
                if dist < 0.15:
                    force = alpha * (0.15 - dist) / dist
                    positions[i][0] -= dx * force
                    positions[i][1] -= dy * force
                    positions[j][0] += dx * force
                    positions[j][1] += dy * force

    # Final normalize to [-1, 1]
    for dim in range(2):
        col = positions[:, dim]
        vmin, vmax = col.min(), col.max()
        if vmax - vmin > 1e-8:
            positions[:, dim] = 2.0 * (col - vmin) / (vmax - vmin) - 1.0

    result = []
    for i, pid in enumerate(valid_pids):
        result.append({
            "provider_id": pid,
            "x": round(float(positions[i][0]), 4),
            "y": round(float(positions[i][1]), 4),
        })

    return result
