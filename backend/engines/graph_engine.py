"""
Engine 1: Provider-Participant-Staff Graph (Dynamic Network Model)
Detects closed-loop money flows, fake staffing networks, invoice cycling,
and controlled provider clusters.
"""
import networkx as nx
from collections import defaultdict


def build_network_graph(providers, participants, workers, claims, locations):
    """Build the full NDIS ecosystem graph."""
    G = nx.DiGraph()

    # Add nodes
    for p in providers:
        G.add_node(p["id"], type="provider", name=p["name"], lat=p["lat"], lng=p["lng"])
    for p in participants:
        G.add_node(p["id"], type="participant", name=p["name"], lat=p["lat"], lng=p["lng"])
    for w in workers:
        G.add_node(w["id"], type="worker", name=w["name"], role=w["role"], lat=w["lat"], lng=w["lng"])
    for loc in locations:
        G.add_node(loc["id"], type="location", address=loc["address"], lat=loc["lat"], lng=loc["lng"])

    # Edges from claims (billing relationships)
    provider_participant_claims = defaultdict(float)
    provider_worker_claims = defaultdict(float)
    worker_participant_claims = defaultdict(float)

    for c in claims:
        key_pp = (c["provider_id"], c["participant_id"])
        provider_participant_claims[key_pp] += c["total_amount"]
        key_pw = (c["provider_id"], c["worker_id"])
        provider_worker_claims[key_pw] += c["total_amount"]
        key_wp = (c["worker_id"], c["participant_id"])
        worker_participant_claims[key_wp] += c["hours"]

    for (prov, part), amount in provider_participant_claims.items():
        G.add_edge(prov, part, relationship="bills", weight=amount)
    for (prov, wrk), amount in provider_worker_claims.items():
        G.add_edge(prov, wrk, relationship="employs", weight=amount)
    for (wrk, part), hours in worker_participant_claims.items():
        G.add_edge(wrk, part, relationship="serves", weight=hours)

    # Worker multi-provider edges
    for w in workers:
        for prov_id in w["providers"]:
            if not G.has_edge(prov_id, w["id"]):
                G.add_edge(prov_id, w["id"], relationship="registered_with", weight=1)

    # Location edges
    for loc in locations:
        for prov_id in loc["associated_providers"]:
            G.add_edge(prov_id, loc["id"], relationship="operates_at", weight=1)

    return G


def detect_closed_loops(G):
    """Detect closed-loop money flows (invoice cycling)."""
    alerts = []
    provider_nodes = [n for n, d in G.nodes(data=True) if d.get("type") == "provider"]

    # Find cycles involving providers
    try:
        cycles = list(nx.simple_cycles(G))
        provider_cycles = []
        for cycle in cycles:
            cycle_providers = [n for n in cycle if G.nodes[n].get("type") == "provider"]
            if len(cycle_providers) >= 2 and len(cycle) <= 8:
                provider_cycles.append({
                    "cycle": cycle,
                    "providers_involved": cycle_providers,
                    "length": len(cycle),
                })
        # Limit to top 20 most suspicious
        provider_cycles.sort(key=lambda x: len(x["providers_involved"]), reverse=True)
        for pc in provider_cycles[:20]:
            alerts.append({
                "type": "closed_loop_money_flow",
                "severity": "critical" if len(pc["providers_involved"]) >= 3 else "high",
                "title": f"Closed-loop detected: {len(pc['providers_involved'])} providers in cycle",
                "description": f"Invoice cycling pattern detected involving {', '.join(pc['providers_involved'])}",
                "entities": pc["providers_involved"],
                "confidence": min(0.95, 0.6 + len(pc["providers_involved"]) * 0.1),
            })
    except Exception:
        # Cycle detection can be expensive on large graphs; use limited approach
        for p1 in provider_nodes[:30]:
            for p2 in provider_nodes[:30]:
                if p1 != p2:
                    try:
                        paths = list(nx.all_simple_paths(G, p1, p2, cutoff=4))
                        reverse_paths = list(nx.all_simple_paths(G, p2, p1, cutoff=4))
                        if paths and reverse_paths:
                            alerts.append({
                                "type": "closed_loop_money_flow",
                                "severity": "high",
                                "title": f"Potential closed loop: {p1} ↔ {p2}",
                                "description": f"Bidirectional flow detected between providers",
                                "entities": [p1, p2],
                                "confidence": 0.7,
                            })
                    except nx.NetworkXError:
                        pass
    return alerts[:20]


def detect_shared_staff_clusters(G, workers):
    """Detect providers sharing unusually many staff members."""
    alerts = []
    provider_workers = defaultdict(set)
    for w in workers:
        for prov_id in w["providers"]:
            provider_workers[prov_id].add(w["id"])

    provider_ids = list(provider_workers.keys())
    for i in range(len(provider_ids)):
        for j in range(i + 1, len(provider_ids)):
            p1, p2 = provider_ids[i], provider_ids[j]
            shared = provider_workers[p1] & provider_workers[p2]
            if len(shared) >= 3:
                total = len(provider_workers[p1] | provider_workers[p2])
                overlap_ratio = len(shared) / total if total > 0 else 0
                alerts.append({
                    "type": "shared_staff_cluster",
                    "severity": "high" if overlap_ratio > 0.5 else "medium",
                    "title": f"Staff overlap: {p1} & {p2} share {len(shared)} workers",
                    "description": f"{overlap_ratio:.0%} staff overlap — possible controlled provider cluster",
                    "entities": [p1, p2],
                    "shared_workers": list(shared),
                    "overlap_ratio": round(overlap_ratio, 3),
                    "confidence": min(0.95, 0.5 + overlap_ratio),
                })

    alerts.sort(key=lambda x: x.get("overlap_ratio", 0), reverse=True)
    return alerts[:15]


def detect_shared_addresses(locations):
    """Detect providers sharing addresses suspiciously."""
    alerts = []
    for loc in locations:
        if len(loc["associated_providers"]) >= 2:
            alerts.append({
                "type": "shared_address",
                "severity": "medium" if len(loc["associated_providers"]) == 2 else "high",
                "title": f"{len(loc['associated_providers'])} providers at {loc['address'][:40]}",
                "description": f"Multiple providers operating from same location: {', '.join(loc['associated_providers'])}",
                "entities": loc["associated_providers"],
                "location": loc["id"],
                "confidence": min(0.85, 0.4 + len(loc["associated_providers"]) * 0.15),
            })
    return alerts


def get_graph_stats(G):
    """Return summary statistics about the network graph."""
    node_types = defaultdict(int)
    for _, data in G.nodes(data=True):
        node_types[data.get("type", "unknown")] += 1

    edge_types = defaultdict(int)
    for _, _, data in G.edges(data=True):
        edge_types[data.get("relationship", "unknown")] += 1

    return {
        "total_nodes": G.number_of_nodes(),
        "total_edges": G.number_of_edges(),
        "node_types": dict(node_types),
        "edge_types": dict(edge_types),
        "density": round(nx.density(G), 6),
        "connected_components": nx.number_weakly_connected_components(G),
    }


def get_graph_data_for_viz(G, max_nodes=200):
    """Return graph data formatted for frontend visualization."""
    # Get top nodes by degree
    degrees = dict(G.degree())
    top_nodes = sorted(degrees, key=degrees.get, reverse=True)[:max_nodes]
    top_set = set(top_nodes)

    nodes = []
    for n in top_nodes:
        data = G.nodes[n]
        nodes.append({
            "id": n,
            "type": data.get("type", "unknown"),
            "name": data.get("name", n),
            "degree": degrees[n],
            "lat": data.get("lat"),
            "lng": data.get("lng"),
        })

    edges = []
    for u, v, data in G.edges(data=True):
        if u in top_set and v in top_set:
            edges.append({
                "source": u,
                "target": v,
                "relationship": data.get("relationship", ""),
                "weight": data.get("weight", 1),
            })

    return {"nodes": nodes, "edges": edges}
