"""
Engine 6: Collusion Detection (Multi-Provider Clustering)
Uses graph community detection to find provider cartels:
shared staff, shared participants, common addresses, referral loops.
"""
from collections import defaultdict
import networkx as nx


def build_provider_affinity_graph(providers, workers, claims, locations):
    """Build a weighted graph showing provider-to-provider relationships."""
    G = nx.Graph()

    for p in providers:
        G.add_node(p["id"], name=p["name"])

    # Edge weight components
    shared_staff = defaultdict(int)      # provider pair → count of shared workers
    shared_participants = defaultdict(int)  # provider pair → count of shared participants
    shared_locations = defaultdict(int)   # provider pair → count of shared locations

    # Shared staff
    for w in workers:
        provs = w["providers"]
        for i in range(len(provs)):
            for j in range(i + 1, len(provs)):
                pair = tuple(sorted([provs[i], provs[j]]))
                shared_staff[pair] += 1

    # Shared participants
    provider_participants = defaultdict(set)
    for c in claims:
        provider_participants[c["provider_id"]].add(c["participant_id"])

    provider_ids = list(provider_participants.keys())
    for i in range(len(provider_ids)):
        for j in range(i + 1, len(provider_ids)):
            p1, p2 = provider_ids[i], provider_ids[j]
            shared = provider_participants[p1] & provider_participants[p2]
            if shared:
                pair = tuple(sorted([p1, p2]))
                shared_participants[pair] = len(shared)

    # Shared locations
    for loc in locations:
        provs = loc["associated_providers"]
        for i in range(len(provs)):
            for j in range(i + 1, len(provs)):
                pair = tuple(sorted([provs[i], provs[j]]))
                shared_locations[pair] += 1

    # Build edges with composite weight
    all_pairs = set(list(shared_staff.keys()) + list(shared_participants.keys()) + list(shared_locations.keys()))
    for pair in all_pairs:
        staff_w = shared_staff.get(pair, 0) * 3  # Staff sharing is most suspicious
        part_w = shared_participants.get(pair, 0) * 1
        loc_w = shared_locations.get(pair, 0) * 2

        weight = staff_w + part_w + loc_w
        if weight > 0:
            G.add_edge(pair[0], pair[1],
                      weight=weight,
                      shared_staff=shared_staff.get(pair, 0),
                      shared_participants=shared_participants.get(pair, 0),
                      shared_locations=shared_locations.get(pair, 0))

    return G


def detect_provider_cartels(affinity_graph):
    """Detect clusters of providers that may be operating as cartels."""
    alerts = []

    if affinity_graph.number_of_nodes() < 3:
        return alerts

    # Community detection using greedy modularity
    try:
        communities = list(nx.community.greedy_modularity_communities(affinity_graph))
    except Exception:
        communities = []

    for idx, community in enumerate(communities):
        if len(community) < 2:
            continue

        community = list(community)

        # Calculate internal connectivity
        subgraph = affinity_graph.subgraph(community)
        total_weight = sum(d["weight"] for _, _, d in subgraph.edges(data=True))
        total_shared_staff = sum(d.get("shared_staff", 0) for _, _, d in subgraph.edges(data=True))
        total_shared_parts = sum(d.get("shared_participants", 0) for _, _, d in subgraph.edges(data=True))
        total_shared_locs = sum(d.get("shared_locations", 0) for _, _, d in subgraph.edges(data=True))

        density = nx.density(subgraph)

        if total_weight > 5 and len(community) >= 2:
            severity = "critical" if (density > 0.6 and len(community) >= 3) else \
                       "high" if density > 0.4 else "medium"

            alerts.append({
                "type": "provider_cartel",
                "severity": severity,
                "title": f"Provider cluster #{idx+1}: {len(community)} providers, density={density:.2f}",
                "description": (
                    f"Tightly connected cluster: {total_shared_staff} shared staff, "
                    f"{total_shared_parts} shared participants, {total_shared_locs} shared locations. "
                    f"Providers: {', '.join(community)}"
                ),
                "entities": community,
                "cluster_id": idx,
                "density": round(density, 3),
                "shared_staff": total_shared_staff,
                "shared_participants": total_shared_parts,
                "shared_locations": total_shared_locs,
                "total_weight": total_weight,
                "confidence": min(0.95, 0.4 + density * 0.5 + len(community) * 0.05),
            })

    alerts.sort(key=lambda x: x["confidence"], reverse=True)
    return alerts


def detect_referral_loops(claims):
    """Detect circular referral patterns between providers."""
    alerts = []

    # Track participant movement between providers over time
    participant_provider_timeline = defaultdict(list)
    for c in sorted(claims, key=lambda x: x["date"]):
        participant_provider_timeline[c["participant_id"]].append({
            "provider": c["provider_id"],
            "date": c["date"],
        })

    # Detect participants bouncing between same providers
    for part_id, timeline in participant_provider_timeline.items():
        provider_sequence = []
        last_provider = None
        for entry in timeline:
            if entry["provider"] != last_provider:
                provider_sequence.append(entry["provider"])
                last_provider = entry["provider"]

        # Look for repeating patterns (A→B→A→B)
        if len(provider_sequence) >= 4:
            for i in range(len(provider_sequence) - 3):
                if (provider_sequence[i] == provider_sequence[i+2] and
                    provider_sequence[i+1] == provider_sequence[i+3]):
                    alerts.append({
                        "type": "referral_loop",
                        "severity": "medium",
                        "title": f"Referral loop: {part_id} bouncing between {provider_sequence[i]} & {provider_sequence[i+1]}",
                        "description": (
                            f"Participant repeatedly moved between two providers, "
                            f"suggesting coordinated referral cycling"
                        ),
                        "entities": [part_id, provider_sequence[i], provider_sequence[i+1]],
                        "confidence": 0.6,
                    })
                    break  # One alert per participant

    return alerts[:30]


def get_collusion_network_data(affinity_graph):
    """Get provider collusion network for visualization."""
    nodes = []
    for n, data in affinity_graph.nodes(data=True):
        degree = affinity_graph.degree(n, weight="weight")
        nodes.append({
            "id": n,
            "name": data.get("name", n),
            "weighted_degree": degree,
        })

    edges = []
    for u, v, data in affinity_graph.edges(data=True):
        edges.append({
            "source": u,
            "target": v,
            "weight": data.get("weight", 1),
            "shared_staff": data.get("shared_staff", 0),
            "shared_participants": data.get("shared_participants", 0),
            "shared_locations": data.get("shared_locations", 0),
        })

    return {"nodes": nodes, "edges": edges}
