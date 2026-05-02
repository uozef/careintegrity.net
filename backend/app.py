"""
NDIS Network Integrity Graph + Behavioural Drift Engine
Main FastAPI application
"""
import json
import time
import random
from pathlib import Path
from datetime import datetime, timedelta
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from typing import Optional

from data_generator import generate_data, save_data
from auth import (
    authenticate_user, create_access_token, get_current_user,
    User, Token, change_password, create_user, update_user, delete_user,
    get_all_users, get_user_info, check_permission, get_user_permissions,
    ROLES, log_audit, get_audit_log, ACCESS_TOKEN_EXPIRE_MINUTES,
)
from fines import FinesManager
from rules import RuleEngine
from pattern_search import search_fraud_pattern, save_scenario, get_saved_scenarios, delete_scenario, increment_scenario_run
from enterprise import (
    add_to_watchlist, get_watchlist, update_watchlist_entry, add_watchlist_note,
    create_notification, get_notifications, mark_notification_read,
    submit_tipoff, get_tipoffs, update_tipoff, add_tipoff_note,
    get_compliance_standards, get_compliance_summary,
    generate_executive_report, get_system_health, get_risk_heatmap,
    seed_demo_data,
)
from engines.graph_engine import (
    build_network_graph, detect_closed_loops, detect_shared_staff_clusters,
    detect_shared_addresses, get_graph_stats, get_graph_data_for_viz,
)
from engines.behavioural_drift import (
    compute_provider_fingerprints, detect_impossible_acceleration,
    detect_staffing_anomalies, get_drift_timeline,
)
from engines.time_budget import (
    detect_worker_time_impossibilities, detect_participant_overservicing,
    detect_travel_impossibilities, get_worker_daily_summary,
)
from engines.provider_dna import (
    compute_provider_embeddings, detect_behavioural_mutations,
    detect_cluster_anomalies, get_embedding_visualization_data,
)
from engines.synthetic_simulation import (
    generate_synthetic_baseline, compare_real_vs_synthetic,
    get_participant_comparison,
)
from engines.collusion_detection import (
    build_provider_affinity_graph, detect_provider_cartels,
    detect_referral_loops, get_collusion_network_data,
)
from engines.invoice_pressure import (
    compute_baselines, pressure_test_batch,
    get_invoice_distribution,
)


# Global state
state = {}
fines_manager = FinesManager()
rule_engine = RuleEngine()


def initialize_system():
    """Generate data and run all engines."""
    print("🔄 Generating synthetic NDIS data...")
    start = time.time()
    data = generate_data()
    print(f"   Generated {data['metadata']['num_claims']} claims in {time.time()-start:.1f}s")

    state["data"] = data
    state["providers"] = data["providers"]
    state["participants"] = data["participants"]
    state["workers"] = data["workers"]
    state["locations"] = data["locations"]
    state["claims"] = data["claims"]
    state["fraud_provider_ids"] = data["fraud_provider_ids"]

    # Engine 1: Network Graph
    print("🔄 Building network graph...")
    start = time.time()
    state["graph"] = build_network_graph(
        data["providers"], data["participants"], data["workers"],
        data["claims"], data["locations"]
    )
    state["graph_stats"] = get_graph_stats(state["graph"])
    state["graph_viz"] = get_graph_data_for_viz(state["graph"])
    state["closed_loops"] = detect_closed_loops(state["graph"])
    state["shared_staff"] = detect_shared_staff_clusters(state["graph"], data["workers"])
    state["shared_addresses"] = detect_shared_addresses(data["locations"])
    print(f"   Graph built in {time.time()-start:.1f}s")

    # Engine 2: Behavioural Drift
    print("🔄 Computing behavioural fingerprints...")
    start = time.time()
    state["fingerprints"] = compute_provider_fingerprints(data["providers"], data["claims"])
    state["impossible_accel"] = detect_impossible_acceleration(state["fingerprints"])
    state["staffing_anomalies"] = detect_staffing_anomalies(state["fingerprints"])
    print(f"   Fingerprints computed in {time.time()-start:.1f}s")

    # Engine 3: Time Budget
    print("🔄 Checking time budget constraints...")
    start = time.time()
    state["time_impossibilities"] = detect_worker_time_impossibilities(data["claims"])
    state["overservicing"] = detect_participant_overservicing(data["claims"], data["participants"])
    state["travel_impossibilities"] = detect_travel_impossibilities(data["claims"])
    print(f"   Time budget checked in {time.time()-start:.1f}s")

    # Engine 4: Provider DNA
    print("🔄 Computing provider DNA embeddings...")
    start = time.time()
    state["embeddings"] = compute_provider_embeddings(
        data["providers"], data["claims"], data["participants"]
    )
    state["mutations"] = detect_behavioural_mutations(state["embeddings"])
    state["cluster_anomalies"] = detect_cluster_anomalies(
        state["embeddings"], data["fraud_provider_ids"]
    )
    state["embedding_viz"] = get_embedding_visualization_data(state["embeddings"])
    print(f"   DNA embeddings computed in {time.time()-start:.1f}s")

    # Engine 5: Synthetic Simulation
    print("🔄 Running synthetic simulation...")
    start = time.time()
    state["baselines"] = generate_synthetic_baseline(data["participants"])
    state["simulation_alerts"] = compare_real_vs_synthetic(
        data["claims"], data["participants"], state["baselines"]
    )
    print(f"   Simulation complete in {time.time()-start:.1f}s")

    # Engine 6: Collusion Detection
    print("🔄 Detecting provider collusion...")
    start = time.time()
    state["affinity_graph"] = build_provider_affinity_graph(
        data["providers"], data["workers"], data["claims"], data["locations"]
    )
    state["cartels"] = detect_provider_cartels(state["affinity_graph"])
    state["referral_loops"] = detect_referral_loops(data["claims"])
    state["collusion_network"] = get_collusion_network_data(state["affinity_graph"])
    print(f"   Collusion detection complete in {time.time()-start:.1f}s")

    # Engine 7: Invoice Pressure Testing
    print("🔄 Pressure testing invoices...")
    start = time.time()
    state["invoice_baselines"] = compute_baselines(
        data["claims"], data["providers"], data["participants"]
    )

    provider_risk = {}
    for alert in (state["closed_loops"] + state["shared_staff"] + state["cartels"]):
        for entity in alert.get("entities", []):
            if entity.startswith("PRV"):
                provider_risk[entity] = max(provider_risk.get(entity, 0), alert["confidence"])

    drift_scores = {}
    for alert in (state["impossible_accel"] + state["mutations"]):
        for entity in alert.get("entities", []):
            if entity.startswith("PRV"):
                drift_scores[entity] = max(drift_scores.get(entity, 0), alert["confidence"])

    state["provider_risk_scores"] = provider_risk
    state["drift_scores"] = drift_scores

    state["flagged_invoices"] = pressure_test_batch(
        data["claims"], state["invoice_baselines"],
        provider_risk, drift_scores, threshold=0.4
    )
    state["invoice_distribution"] = get_invoice_distribution(
        data["claims"], state["invoice_baselines"]
    )
    print(f"   Invoice pressure testing complete in {time.time()-start:.1f}s")

    # Compile all alerts
    all_alerts = []
    alert_id = 0
    alert_sources = [
        ("closed_loops", "Network Graph"),
        ("shared_staff", "Network Graph"),
        ("shared_addresses", "Network Graph"),
        ("impossible_accel", "Behavioural Drift"),
        ("staffing_anomalies", "Behavioural Drift"),
        ("time_impossibilities", "Time Budget"),
        ("overservicing", "Time Budget"),
        ("travel_impossibilities", "Time Budget"),
        ("mutations", "Provider DNA"),
        ("cluster_anomalies", "Provider DNA"),
        ("simulation_alerts", "Synthetic Simulation"),
        ("cartels", "Collusion Detection"),
        ("referral_loops", "Collusion Detection"),
    ]

    for key, source in alert_sources:
        for alert in state.get(key, []):
            alert["id"] = f"ALT-{alert_id:04d}"
            alert["source_engine"] = source
            alert["detected_at"] = datetime.now().isoformat()
            alert["status"] = "open"
            all_alerts.append(alert)
            alert_id += 1

    state["all_alerts"] = all_alerts
    state["alerts_by_severity"] = {
        "critical": [a for a in all_alerts if a["severity"] == "critical"],
        "high": [a for a in all_alerts if a["severity"] == "high"],
        "medium": [a for a in all_alerts if a["severity"] == "medium"],
        "low": [a for a in all_alerts if a["severity"] == "low"],
    }

    # Provider risk scores (aggregated)
    provider_risk_agg = {}
    for alert in all_alerts:
        for entity in alert.get("entities", []):
            if entity.startswith("PRV"):
                if entity not in provider_risk_agg:
                    provider_risk_agg[entity] = {"alerts": 0, "max_severity": "low", "total_confidence": 0}
                provider_risk_agg[entity]["alerts"] += 1
                provider_risk_agg[entity]["total_confidence"] += alert["confidence"]
                sev_order = {"critical": 4, "high": 3, "medium": 2, "low": 1}
                if sev_order.get(alert["severity"], 0) > sev_order.get(provider_risk_agg[entity]["max_severity"], 0):
                    provider_risk_agg[entity]["max_severity"] = alert["severity"]

    for pid, risk in provider_risk_agg.items():
        risk["risk_score"] = min(1.0, risk["total_confidence"] / max(risk["alerts"], 1))

    state["provider_risk_agg"] = provider_risk_agg

    # --- Auto-issue penalties ---
    print("🔄 Auto-issuing penalties...")
    start = time.time()
    issued = fines_manager.auto_issue_penalties(all_alerts, data["providers"])

    # Calculate total fraud detected value from flagged invoices
    fraud_value = sum(inv.get("fraud_likelihood", 0) * 500 for inv in state["flagged_invoices"][:1000])
    # Add claim amounts from fraud providers
    fraud_provider_set = set(data["fraud_provider_ids"])
    fraud_claim_value = sum(c["total_amount"] for c in data["claims"] if c["provider_id"] in fraud_provider_set)
    fines_manager._fraud_detected_value = fraud_claim_value

    # Simulate some penalties as paid/disputed for realistic demo data
    for i, penalty in enumerate(fines_manager.penalties):
        r = random.random()
        if r < 0.15:
            penalty["status"] = "paid"
            penalty["payment_date"] = (datetime.now() - timedelta(days=random.randint(1, 20))).isoformat()
        elif r < 0.25:
            penalty["status"] = "disputed"
            penalty["notes"] = "Provider has lodged formal dispute"
        elif r < 0.35:
            penalty["status"] = "overdue"
        elif r < 0.60:
            penalty["status"] = "sent"
            penalty["email_sent"] = True
            penalty["email_sent_at"] = datetime.now().isoformat()

    print(f"   {len(issued)} penalties issued in {time.time()-start:.1f}s")

    # --- Rule Engine ---
    print("🔄 Evaluating custom rules...")
    start = time.time()
    rule_result = rule_engine.evaluate_all_claims(data["claims"])
    print(f"   Rules evaluated: {rule_result['total_matches']} matches in {time.time()-start:.1f}s")

    # --- Enterprise features ---
    seed_demo_data(data["providers"], provider_risk_agg)
    print(f"\n✅ System initialized: {len(all_alerts)} alerts, {len(issued)} penalties, {rule_result['total_matches']} rule matches across 8 engines")


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_system()
    yield


app = FastAPI(
    title="NDIS Fraud Detection System",
    description="Network Integrity Graph + Behavioural Drift Engine",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== AUTH ROUTES ====================

@app.post("/api/auth/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/api/auth/me")
async def get_me(current_user: User = Depends(get_current_user)):
    info = get_user_info(current_user.username)
    return info or {"username": current_user.username, "role": current_user.role}


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@app.post("/api/auth/change-password")
async def api_change_password(req: ChangePasswordRequest, current_user: User = Depends(get_current_user)):
    from auth import verify_password, get_user as get_user_db
    user = get_user_db(current_user.username)
    if not verify_password(req.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password incorrect")
    change_password(current_user.username, req.new_password)
    log_audit(current_user.username, "change_password", current_user.username)
    return {"message": "Password changed successfully"}


# ==================== USER MANAGEMENT ROUTES ====================

@app.get("/api/users")
def api_get_users(current_user: User = Depends(get_current_user)):
    check_permission(current_user, "users.view")
    return get_all_users()


@app.get("/api/users/roles")
def api_get_roles(current_user: User = Depends(get_current_user)):
    return {role: {"label": info["label"], "description": info["description"],
                   "permissions": info["permissions"], "permission_count": len(info["permissions"])}
            for role, info in ROLES.items()}


@app.get("/api/users/{username}")
def api_get_user(username: str, current_user: User = Depends(get_current_user)):
    check_permission(current_user, "users.view")
    info = get_user_info(username)
    if not info:
        raise HTTPException(status_code=404, detail="User not found")
    return info


class CreateUserRequest(BaseModel):
    username: str
    password: str
    full_name: str
    email: str
    role: str = "analyst"


@app.post("/api/users")
def api_create_user(req: CreateUserRequest, current_user: User = Depends(get_current_user)):
    check_permission(current_user, "users.manage")
    if req.role not in ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Valid: {', '.join(ROLES.keys())}")
    user = create_user(req.username, req.password, req.full_name, req.email, req.role)
    if not user:
        raise HTTPException(status_code=400, detail="Username already exists or invalid role")
    log_audit(current_user.username, "create_user", req.username, f"Role: {req.role}")
    return user


class UpdateUserRequest(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    disabled: Optional[bool] = None
    password: Optional[str] = None


@app.put("/api/users/{username}")
def api_update_user(username: str, req: UpdateUserRequest, current_user: User = Depends(get_current_user)):
    check_permission(current_user, "users.manage")
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    if "role" in updates and updates["role"] not in ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role")
    result = update_user(username, updates)
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    log_audit(current_user.username, "update_user", username, str(updates))
    return result


@app.delete("/api/users/{username}")
def api_delete_user(username: str, current_user: User = Depends(get_current_user)):
    check_permission(current_user, "users.manage")
    if username == "admin":
        raise HTTPException(status_code=400, detail="Cannot delete admin")
    if username == current_user.username:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    if not delete_user(username):
        raise HTTPException(status_code=404, detail="User not found")
    log_audit(current_user.username, "delete_user", username)
    return {"message": "User deleted"}


@app.post("/api/users/{username}/toggle")
def api_toggle_user(username: str, current_user: User = Depends(get_current_user)):
    check_permission(current_user, "users.manage")
    if username == "admin":
        raise HTTPException(status_code=400, detail="Cannot disable admin")
    info = get_user_info(username)
    if not info:
        raise HTTPException(status_code=404, detail="User not found")
    result = update_user(username, {"disabled": not info["disabled"]})
    log_audit(current_user.username, "toggle_user", username, f"Disabled: {result['disabled']}")
    return result


@app.get("/api/audit-log")
def api_get_audit_log(limit: int = 100, current_user: User = Depends(get_current_user)):
    check_permission(current_user, "users.view")
    return get_audit_log(limit)


# ==================== DASHBOARD ROUTES ====================

@app.get("/api/dashboard")
def get_dashboard(current_user: User = Depends(get_current_user)):
    alerts = state.get("all_alerts", [])
    financial = fines_manager.get_financial_summary()
    return {
        "summary": {
            "total_providers": len(state.get("providers", [])),
            "total_participants": len(state.get("participants", [])),
            "total_workers": len(state.get("workers", [])),
            "total_claims": len(state.get("claims", [])),
            "total_alerts": len(alerts),
            "critical_alerts": len([a for a in alerts if a["severity"] == "critical"]),
            "high_alerts": len([a for a in alerts if a["severity"] == "high"]),
            "medium_alerts": len([a for a in alerts if a["severity"] == "medium"]),
            "flagged_invoices": len(state.get("flagged_invoices", [])),
            "fraud_providers_detected": len(state.get("provider_risk_agg", {})),
        },
        "financial": financial,
        "graph_stats": state.get("graph_stats", {}),
        "alerts_by_severity": {
            k: len(v) for k, v in state.get("alerts_by_severity", {}).items()
        },
        "alerts_by_engine": _count_by_engine(alerts),
        "invoice_distribution": state.get("invoice_distribution", []),
    }


@app.get("/api/alerts")
def get_alerts(severity: str = None, engine: str = None, limit: int = 100, offset: int = 0,
               current_user: User = Depends(get_current_user)):
    alerts = state.get("all_alerts", [])
    if severity:
        alerts = [a for a in alerts if a["severity"] == severity]
    if engine:
        alerts = [a for a in alerts if a.get("source_engine") == engine]
    total = len(alerts)
    return {"total": total, "alerts": alerts[offset:offset + limit]}


@app.get("/api/graph")
def get_graph(current_user: User = Depends(get_current_user)):
    return state.get("graph_viz", {"nodes": [], "edges": []})


@app.get("/api/graph/stats")
def get_graph_statistics(current_user: User = Depends(get_current_user)):
    return state.get("graph_stats", {})


@app.get("/api/graph/node/{node_id}")
def get_graph_node_detail(node_id: str, current_user: User = Depends(get_current_user)):
    """Get rich contextual detail for any node in the network graph."""
    claims = state.get("claims", [])
    providers = state.get("providers", [])
    participants = state.get("participants", [])
    workers = state.get("workers", [])
    locations = state.get("locations", [])
    risk_agg = state.get("provider_risk_agg", {})
    all_alerts = state.get("all_alerts", [])

    if node_id.startswith("PRV"):
        provider = next((p for p in providers if p["id"] == node_id), None)
        if not provider:
            return {"error": "Not found"}
        p_claims = [c for c in claims if c["provider_id"] == node_id]
        p_workers = [w for w in workers if node_id in w["providers"]]
        p_participants = list(set(c["participant_id"] for c in p_claims))
        risk = risk_agg.get(node_id, {})
        alerts = [a for a in all_alerts if node_id in a.get("entities", [])]
        total_billed = sum(c["total_amount"] for c in p_claims)
        total_hours = sum(c["hours"] for c in p_claims)
        avg_rate = total_billed / total_hours if total_hours > 0 else 0
        services_used = list(set(c["service_type"] for c in p_claims))
        # Monthly billing
        from collections import defaultdict as dd
        monthly = dd(float)
        for c in p_claims:
            monthly[c["date"][:7]] += c["total_amount"]
        penalties = fines_manager.get_penalties(provider_id=node_id)
        return {
            "node_type": "provider",
            "id": node_id,
            "name": provider["name"],
            "abn": provider["abn"],
            "address": provider["address"],
            "registration_date": provider["registration_date"],
            "status": provider["status"],
            "service_types": provider["service_types"],
            "risk_score": risk.get("risk_score", 0),
            "max_severity": risk.get("max_severity", "none"),
            "alert_count": risk.get("alerts", 0),
            "total_claims": len(p_claims),
            "total_billed": round(total_billed, 2),
            "total_hours": round(total_hours, 1),
            "avg_rate": round(avg_rate, 2),
            "worker_count": len(p_workers),
            "participant_count": len(p_participants),
            "workers": [{"id": w["id"], "name": w["name"], "role": w["role"]} for w in p_workers],
            "services_used": services_used,
            "monthly_billing": [{"month": k, "amount": round(v, 2)} for k, v in sorted(monthly.items())],
            "alerts": alerts[:10],
            "penalties": penalties,
        }

    elif node_id.startswith("WRK"):
        worker = next((w for w in workers if w["id"] == node_id), None)
        if not worker:
            return {"error": "Not found"}
        w_claims = [c for c in claims if c["worker_id"] == node_id]
        served_participants = list(set(c["participant_id"] for c in w_claims))
        served_providers = list(set(c["provider_id"] for c in w_claims))
        total_hours = sum(c["hours"] for c in w_claims)
        total_earned = sum(c["total_amount"] for c in w_claims)
        # Daily hours analysis
        from collections import defaultdict as dd
        daily_hours = dd(float)
        for c in w_claims:
            daily_hours[c["date"]] += c["hours"]
        max_daily = max(daily_hours.values()) if daily_hours else 0
        days_over_16h = sum(1 for h in daily_hours.values() if h > 16)
        alerts = [a for a in all_alerts if node_id in a.get("entities", [])]
        # Location spread
        lats = [c["location_lat"] for c in w_claims]
        lngs = [c["location_lng"] for c in w_claims]
        import math
        geo_spread = 0
        if len(lats) > 1:
            geo_spread = math.sqrt((max(lats)-min(lats))**2 + (max(lngs)-min(lngs))**2) * 111  # approx km
        multi_provider = len(worker["providers"]) > 1
        return {
            "node_type": "worker",
            "id": node_id,
            "name": worker["name"],
            "role": worker["role"],
            "address": worker["address"],
            "qualifications": worker["qualifications"],
            "max_weekly_hours": worker["max_weekly_hours"],
            "registered_providers": worker["providers"],
            "multi_provider_flag": multi_provider,
            "total_claims": len(w_claims),
            "total_hours": round(total_hours, 1),
            "total_earned": round(total_earned, 2),
            "participants_served": len(served_participants),
            "providers_served": served_providers,
            "max_daily_hours": round(max_daily, 1),
            "days_over_16h": days_over_16h,
            "geographic_spread_km": round(geo_spread, 1),
            "alerts": alerts[:10],
        }

    elif node_id.startswith("PRT"):
        participant = next((p for p in participants if p["id"] == node_id), None)
        if not participant:
            return {"error": "Not found"}
        p_claims = [c for c in claims if c["participant_id"] == node_id]
        providers_used = list(set(c["provider_id"] for c in p_claims))
        workers_used = list(set(c["worker_id"] for c in p_claims))
        total_hours = sum(c["hours"] for c in p_claims)
        total_cost = sum(c["total_amount"] for c in p_claims)
        services = list(set(c["service_type"] for c in p_claims))
        baselines = state.get("baselines", {})
        baseline = baselines.get(node_id, {})
        alerts = [a for a in all_alerts if node_id in a.get("entities", [])]
        # Weekly hours
        from collections import defaultdict as dd
        from datetime import datetime as dt
        weekly = dd(float)
        for c in p_claims:
            wk = dt.strptime(c["date"], "%Y-%m-%d").strftime("%Y-W%W")
            weekly[wk] += c["hours"]
        max_weekly = max(weekly.values()) if weekly else 0
        budget_used_pct = (total_cost / participant["total_budget"] * 100) if participant["total_budget"] > 0 else 0
        return {
            "node_type": "participant",
            "id": node_id,
            "name": participant["name"],
            "ndis_number": participant["ndis_number"],
            "address": participant["address"],
            "disability_type": participant["disability_type"],
            "support_needs_level": participant["support_needs_level"],
            "plan_start": participant["plan_start"],
            "plan_end": participant["plan_end"],
            "total_budget": participant["total_budget"],
            "allocated_hours_weekly": participant["allocated_hours_weekly"],
            "total_claims": len(p_claims),
            "total_hours": round(total_hours, 1),
            "total_cost": round(total_cost, 2),
            "budget_used_pct": round(budget_used_pct, 1),
            "providers_count": len(providers_used),
            "providers": providers_used,
            "workers_count": len(workers_used),
            "services": services,
            "max_weekly_hours": round(max_weekly, 1),
            "allocated_weekly": participant["allocated_hours_weekly"],
            "baseline": baseline,
            "alerts": alerts[:10],
        }

    elif node_id.startswith("LOC"):
        location = next((l for l in locations if l["id"] == node_id), None)
        if not location:
            return {"error": "Not found"}
        assoc_providers = location["associated_providers"]
        provider_names = {p["id"]: p["name"] for p in providers if p["id"] in assoc_providers}
        alerts = [a for a in all_alerts if node_id in a.get("entities", []) or
                  any(pid in a.get("entities", []) for pid in assoc_providers)]
        return {
            "node_type": "location",
            "id": node_id,
            "address": location["address"],
            "location_type": location["location_type"],
            "lat": location["lat"],
            "lng": location["lng"],
            "associated_providers": [{"id": pid, "name": provider_names.get(pid, pid)} for pid in assoc_providers],
            "multi_provider_flag": len(assoc_providers) > 1,
            "alerts": alerts[:10],
        }

    return {"error": "Unknown node type"}


@app.get("/api/analyse/{entity_id}")
def analyse_entity(entity_id: str, current_user: User = Depends(get_current_user)):
    """Deep anomaly analysis for any entity — runs all detection checks and returns findings."""
    from collections import defaultdict
    import math

    claims = state.get("claims", [])
    providers = state.get("providers", [])
    participants = state.get("participants", [])
    workers = state.get("workers", [])
    all_alerts = state.get("all_alerts", [])
    risk_agg = state.get("provider_risk_agg", {})

    findings = []  # list of {category, title, detail, severity, score}
    entity_claims = []
    entity_type = ""
    entity_name = ""
    entity_meta = {}

    if entity_id.startswith("PRV"):
        entity_type = "provider"
        prov = next((p for p in providers if p["id"] == entity_id), None)
        if not prov:
            return {"error": "Not found"}
        entity_name = prov["name"]
        entity_claims = [c for c in claims if c["provider_id"] == entity_id]
        entity_meta = {"abn": prov["abn"], "address": prov["address"], "services": prov["service_types"]}

        # 1. Billing analysis
        total_billed = sum(c["total_amount"] for c in entity_claims)
        total_hours = sum(c["hours"] for c in entity_claims)
        avg_rate = total_billed / total_hours if total_hours > 0 else 0
        global_avg_rate = sum(c["rate_per_hour"] for c in claims) / len(claims) if claims else 60

        if avg_rate > global_avg_rate * 1.5:
            findings.append({"category": "Billing", "title": "Above-average billing rate",
                "detail": f"Avg rate ${avg_rate:.2f}/h is {(avg_rate/global_avg_rate*100-100):.0f}% above system average (${global_avg_rate:.2f}/h)",
                "severity": "high" if avg_rate > global_avg_rate * 2 else "medium", "score": min(1, (avg_rate/global_avg_rate - 1))})

        # 2. Growth analysis
        monthly_parts = defaultdict(set)
        monthly_hours = defaultdict(float)
        monthly_amount = defaultdict(float)
        for c in entity_claims:
            m = c["date"][:7]
            monthly_parts[m].add(c["participant_id"])
            monthly_hours[m] += c["hours"]
            monthly_amount[m] += c["total_amount"]
        months = sorted(monthly_parts.keys())
        if len(months) >= 3:
            first_count = len(monthly_parts[months[0]])
            last_count = len(monthly_parts[months[-1]])
            if first_count > 0 and last_count > first_count * 3:
                findings.append({"category": "Growth", "title": "Explosive participant growth",
                    "detail": f"Grew from {first_count} to {last_count} participants ({months[0]} to {months[-1]}). {last_count/first_count:.1f}x increase.",
                    "severity": "critical", "score": min(1, (last_count/first_count - 1) / 10)})
            first_bill = monthly_amount.get(months[0], 0)
            last_bill = monthly_amount.get(months[-1], 0)
            if first_bill > 0 and last_bill > first_bill * 3:
                findings.append({"category": "Billing", "title": "Billing volume spike",
                    "detail": f"Monthly billing grew from ${first_bill:,.0f} to ${last_bill:,.0f} ({last_bill/first_bill:.1f}x)",
                    "severity": "high", "score": min(1, (last_bill/first_bill - 1) / 10)})

        # 3. Time-of-day analysis
        hour_counts = defaultdict(int)
        for c in entity_claims:
            try: hour_counts[int(c["start_time"].split(":")[0])] += 1
            except: pass
        night_claims = sum(hour_counts.get(h, 0) for h in range(0, 6))
        night_pct = night_claims / len(entity_claims) * 100 if entity_claims else 0
        if night_pct > 20:
            findings.append({"category": "Time Pattern", "title": "High proportion of night billing",
                "detail": f"{night_pct:.0f}% of claims between midnight and 6 AM ({night_claims} claims)",
                "severity": "high", "score": min(1, night_pct / 50)})

        # 4. Staffing ratio
        unique_workers = set(c["worker_id"] for c in entity_claims)
        unique_parts = set(c["participant_id"] for c in entity_claims)
        if unique_workers and len(unique_parts) / len(unique_workers) > 20:
            ratio = len(unique_parts) / len(unique_workers)
            findings.append({"category": "Staffing", "title": "Extreme participant-to-worker ratio",
                "detail": f"{len(unique_parts)} participants served by {len(unique_workers)} workers = {ratio:.0f}:1 ratio",
                "severity": "critical", "score": min(1, ratio / 40)})

        # 5. Weekend analysis
        from datetime import datetime as dt
        weekend_claims = sum(1 for c in entity_claims if dt.strptime(c["date"], "%Y-%m-%d").weekday() >= 5)
        weekend_pct = weekend_claims / len(entity_claims) * 100 if entity_claims else 0
        if weekend_pct > 40:
            findings.append({"category": "Time Pattern", "title": "Unusually high weekend billing",
                "detail": f"{weekend_pct:.0f}% of claims on weekends ({weekend_claims} of {len(entity_claims)})",
                "severity": "medium", "score": min(1, weekend_pct / 60)})

        # 6. Rate variance
        rates = [c["rate_per_hour"] for c in entity_claims]
        if rates:
            rate_std = (sum((r - avg_rate)**2 for r in rates) / len(rates)) ** 0.5
            if rate_std > 20:
                findings.append({"category": "Billing", "title": "High rate variance",
                    "detail": f"Billing rates range from ${min(rates):.0f} to ${max(rates):.0f}/h (std: ${rate_std:.0f})",
                    "severity": "medium", "score": min(1, rate_std / 40)})

        # 7. Service type consistency
        service_counts = defaultdict(int)
        for c in entity_claims:
            service_counts[c["service_type"]] += 1
        if len(service_counts) > 6:
            findings.append({"category": "Service Pattern", "title": "Broad service scope",
                "detail": f"Provider delivers {len(service_counts)} different service types — may indicate unfocused or fraudulent billing",
                "severity": "low", "score": 0.3})

    elif entity_id.startswith("WRK"):
        entity_type = "worker"
        worker = next((w for w in workers if w["id"] == entity_id), None)
        if not worker:
            return {"error": "Not found"}
        entity_name = worker["name"]
        entity_claims = [c for c in claims if c["worker_id"] == entity_id]
        entity_meta = {"role": worker["role"], "providers": worker["providers"]}

        # 1. Multi-provider check
        if len(worker["providers"]) > 1:
            findings.append({"category": "Network", "title": "Multi-provider registration",
                "detail": f"Registered with {len(worker['providers'])} providers: {', '.join(worker['providers'])}. Shared staff is a collusion indicator.",
                "severity": "high" if len(worker["providers"]) > 2 else "medium",
                "score": min(1, len(worker["providers"]) / 5)})

        # 2. Daily hours check
        daily_hours = defaultdict(float)
        daily_claims = defaultdict(list)
        for c in entity_claims:
            daily_hours[c["date"]] += c["hours"]
            daily_claims[c["date"]].append(c)
        over_16 = [(d, h) for d, h in daily_hours.items() if h > 16]
        if over_16:
            worst = max(over_16, key=lambda x: x[1])
            findings.append({"category": "Time Impossibility", "title": f"Billed over 16h in a day ({len(over_16)} days)",
                "detail": f"Worst: {worst[1]:.1f}h on {worst[0]}. Workers cannot physically deliver this many hours.",
                "severity": "critical", "score": min(1, worst[1] / 24)})

        # 3. Simultaneous billing check
        overlap_count = 0
        for day, day_cls in daily_claims.items():
            if len(day_cls) < 2: continue
            day_cls.sort(key=lambda x: x["start_time"])
            for i in range(len(day_cls) - 1):
                for j in range(i + 1, len(day_cls)):
                    c1, c2 = day_cls[i], day_cls[j]
                    # Simple overlap check
                    s1 = int(c1["start_time"].split(":")[0]) * 60 + int(c1["start_time"].split(":")[1])
                    e1 = s1 + int(c1["hours"] * 60)
                    s2 = int(c2["start_time"].split(":")[0]) * 60 + int(c2["start_time"].split(":")[1])
                    if s2 < e1:
                        dist = math.sqrt((c1["location_lat"] - c2["location_lat"])**2 + (c1["location_lng"] - c2["location_lng"])**2) * 111
                        if dist > 1:
                            overlap_count += 1
        if overlap_count > 0:
            findings.append({"category": "Time Impossibility", "title": f"Simultaneous billing at different locations",
                "detail": f"{overlap_count} instances of overlapping sessions at locations >1km apart",
                "severity": "critical", "score": min(1, overlap_count / 20)})

        # 4. Geographic spread
        lats = [c["location_lat"] for c in entity_claims]
        lngs = [c["location_lng"] for c in entity_claims]
        if len(lats) > 1:
            spread_km = math.sqrt((max(lats)-min(lats))**2 + (max(lngs)-min(lngs))**2) * 111
            if spread_km > 60:
                findings.append({"category": "Geography", "title": "Extreme geographic spread",
                    "detail": f"Claims span {spread_km:.0f}km — unusually wide coverage for a single worker",
                    "severity": "high", "score": min(1, spread_km / 100)})

        # 5. Earnings analysis
        total_earned = sum(c["total_amount"] for c in entity_claims)
        total_hours = sum(c["hours"] for c in entity_claims)
        if total_hours > 38 * 52:  # more than a full year of full-time
            findings.append({"category": "Billing", "title": "Excessive annual hours",
                "detail": f"{total_hours:.0f}h total ({total_hours/52:.0f}h/week average) — exceeds full-time capacity",
                "severity": "high", "score": min(1, total_hours / (50 * 52))})

    elif entity_id.startswith("PRT"):
        entity_type = "participant"
        part = next((p for p in participants if p["id"] == entity_id), None)
        if not part:
            return {"error": "Not found"}
        entity_name = part["name"]
        entity_claims = [c for c in claims if c["participant_id"] == entity_id]
        entity_meta = {"ndis_number": part["ndis_number"], "disability_type": part["disability_type"],
                      "support_level": part["support_needs_level"], "budget": part["total_budget"],
                      "allocated_weekly": part["allocated_hours_weekly"]}

        total_cost = sum(c["total_amount"] for c in entity_claims)
        total_hours = sum(c["hours"] for c in entity_claims)

        # 1. Budget analysis
        if part["total_budget"] > 0:
            budget_pct = total_cost / part["total_budget"] * 100
            if budget_pct > 90:
                findings.append({"category": "Budget", "title": f"Budget {budget_pct:.0f}% consumed",
                    "detail": f"${total_cost:,.0f} of ${part['total_budget']:,.0f} budget used",
                    "severity": "high" if budget_pct > 110 else "medium", "score": min(1, budget_pct / 150)})

        # 2. Weekly hours vs allocation
        from datetime import datetime as dt
        weekly_hours = defaultdict(float)
        for c in entity_claims:
            wk = dt.strptime(c["date"], "%Y-%m-%d").strftime("%Y-W%W")
            weekly_hours[wk] += c["hours"]
        if weekly_hours:
            max_wk = max(weekly_hours.values())
            over_weeks = sum(1 for h in weekly_hours.values() if h > part["allocated_hours_weekly"] * 2)
            if over_weeks > 0:
                findings.append({"category": "Over-servicing", "title": f"Exceeded allocation {over_weeks} weeks",
                    "detail": f"Allocated {part['allocated_hours_weekly']}h/week. Peak week: {max_wk:.0f}h ({max_wk/part['allocated_hours_weekly']:.1f}x). {over_weeks} weeks >2x allocation.",
                    "severity": "high", "score": min(1, over_weeks / 20)})

        # 3. Multi-provider check
        provider_set = set(c["provider_id"] for c in entity_claims)
        if len(provider_set) > 3:
            findings.append({"category": "Network", "title": f"Receiving from {len(provider_set)} providers",
                "detail": f"Unusually high provider count: {', '.join(list(provider_set)[:5])}",
                "severity": "medium", "score": min(1, len(provider_set) / 8)})

        # 4. Service stacking
        svc_types = set(c["service_type"] for c in entity_claims)
        therapy_svcs = [s for s in svc_types if "Therapy" in s]
        if len(therapy_svcs) >= 3:
            findings.append({"category": "Service Pattern", "title": f"{len(therapy_svcs)} concurrent therapy types",
                "detail": f"Receiving {', '.join(therapy_svcs)} — possible unnecessary service stacking",
                "severity": "medium", "score": 0.5})

        # 5. Rate analysis
        rates = [c["rate_per_hour"] for c in entity_claims]
        if rates:
            avg_rate = sum(rates) / len(rates)
            if avg_rate > 85:
                findings.append({"category": "Billing", "title": f"High average rate: ${avg_rate:.0f}/h",
                    "detail": f"Average rate across all services is above normal range",
                    "severity": "medium", "score": min(1, avg_rate / 120)})

    # Get related alerts
    related_alerts = [a for a in all_alerts if entity_id in a.get("entities", [])]

    # Compute overall risk score
    if findings:
        severity_weights = {"critical": 1.0, "high": 0.7, "medium": 0.4, "low": 0.2}
        risk_score = min(1.0, sum(f["score"] * severity_weights.get(f["severity"], 0.3) for f in findings) / max(len(findings) * 0.3, 1))
    else:
        risk_score = 0

    # Sort findings by severity
    sev_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    findings.sort(key=lambda f: sev_order.get(f["severity"], 4))

    return {
        "entity_id": entity_id,
        "entity_type": entity_type,
        "entity_name": entity_name,
        "entity_meta": entity_meta,
        "risk_score": round(risk_score, 3),
        "total_claims": len(entity_claims),
        "total_amount": round(sum(c["total_amount"] for c in entity_claims), 2),
        "total_hours": round(sum(c["hours"] for c in entity_claims), 1),
        "findings": findings,
        "findings_by_severity": {
            "critical": len([f for f in findings if f["severity"] == "critical"]),
            "high": len([f for f in findings if f["severity"] == "high"]),
            "medium": len([f for f in findings if f["severity"] == "medium"]),
            "low": len([f for f in findings if f["severity"] == "low"]),
        },
        "related_alerts": related_alerts[:15],
        "related_alert_count": len(related_alerts),
    }


@app.get("/api/providers")
def get_providers(current_user: User = Depends(get_current_user)):
    providers = state.get("providers", [])
    risk_agg = state.get("provider_risk_agg", {})
    result = []
    for p in providers:
        risk = risk_agg.get(p["id"], {})
        result.append({
            **p,
            "risk_score": risk.get("risk_score", 0),
            "alert_count": risk.get("alerts", 0),
            "max_severity": risk.get("max_severity", "none"),
        })
    result.sort(key=lambda x: x["risk_score"], reverse=True)
    return result


@app.get("/api/providers/{provider_id}")
def get_provider_detail(provider_id: str, current_user: User = Depends(get_current_user)):
    provider = next((p for p in state.get("providers", []) if p["id"] == provider_id), None)
    if not provider:
        return {"error": "Provider not found"}

    risk = state.get("provider_risk_agg", {}).get(provider_id, {})
    alerts = [a for a in state.get("all_alerts", []) if provider_id in a.get("entities", [])]
    fingerprints = get_drift_timeline(state.get("fingerprints", {}), provider_id)
    penalties = fines_manager.get_penalties(provider_id=provider_id)

    return {
        "provider": {**provider, "risk_score": risk.get("risk_score", 0)},
        "risk_profile": risk,
        "alerts": alerts,
        "drift_timeline": fingerprints,
        "penalties": penalties,
    }


@app.get("/api/providers/{provider_id}/drift")
def get_provider_drift(provider_id: str, current_user: User = Depends(get_current_user)):
    return get_drift_timeline(state.get("fingerprints", {}), provider_id)


@app.get("/api/participants")
def get_participants(limit: int = 50, offset: int = 0, current_user: User = Depends(get_current_user)):
    return state.get("participants", [])[offset:offset + limit]


@app.get("/api/participants/{participant_id}/comparison")
def get_participant_sim_comparison(participant_id: str, current_user: User = Depends(get_current_user)):
    return get_participant_comparison(participant_id, state.get("claims", []), state.get("baselines", {}))


@app.get("/api/workers")
def get_workers(limit: int = 50, offset: int = 0, current_user: User = Depends(get_current_user)):
    return state.get("workers", [])[offset:offset + limit]


@app.get("/api/workers/{worker_id}/timeline")
def get_worker_timeline(worker_id: str, date: str = "2025-03-15", current_user: User = Depends(get_current_user)):
    return get_worker_daily_summary(state.get("claims", []), worker_id, date)


@app.get("/api/investigation/providers")
def get_investigation_providers(current_user: User = Depends(get_current_user)):
    """Get all providers with participant counts and billing for investigation bubble view."""
    from collections import defaultdict
    claims = state.get("claims", [])
    providers = state.get("providers", [])
    risk_agg = state.get("provider_risk_agg", {})

    prov_data = {}
    for p in providers:
        prov_data[p["id"]] = {
            "id": p["id"], "name": p["name"], "services": p["service_types"],
            "participants": set(), "total_billed": 0, "total_hours": 0, "claim_count": 0,
        }

    for c in claims:
        pd = prov_data.get(c["provider_id"])
        if pd:
            pd["participants"].add(c["participant_id"])
            pd["total_billed"] += c["total_amount"]
            pd["total_hours"] += c["hours"]
            pd["claim_count"] += 1

    result = []
    for pid, pd in prov_data.items():
        risk = risk_agg.get(pid, {})
        result.append({
            "id": pid, "name": pd["name"], "services": pd["services"],
            "participant_count": len(pd["participants"]),
            "total_billed": round(pd["total_billed"], 2),
            "total_hours": round(pd["total_hours"], 1),
            "claim_count": pd["claim_count"],
            "risk_score": risk.get("risk_score", 0),
            "alert_count": risk.get("alerts", 0),
            "max_severity": risk.get("max_severity", "none"),
        })
    result.sort(key=lambda x: x["total_billed"], reverse=True)
    return result


@app.get("/api/investigation/provider/{provider_id}/participants")
def get_provider_participants(provider_id: str, current_user: User = Depends(get_current_user)):
    """Get all participants of a provider with service breakdown."""
    from collections import defaultdict
    claims = state.get("claims", [])
    participants = state.get("participants", [])
    part_lookup = {p["id"]: p for p in participants}

    part_data = defaultdict(lambda: {"hours": 0, "cost": 0, "claims": 0, "services": set(), "dates": []})
    for c in claims:
        if c["provider_id"] != provider_id:
            continue
        pd = part_data[c["participant_id"]]
        pd["hours"] += c["hours"]
        pd["cost"] += c["total_amount"]
        pd["claims"] += 1
        pd["services"].add(c["service_type"])
        pd["dates"].append(c["date"])

    result = []
    for pid, pd in part_data.items():
        part = part_lookup.get(pid, {})
        dates = sorted(pd["dates"])
        result.append({
            "id": pid, "name": part.get("name", pid),
            "ndis_number": part.get("ndis_number", ""),
            "disability_type": part.get("disability_type", ""),
            "support_level": part.get("support_needs_level", ""),
            "allocated_weekly": part.get("allocated_hours_weekly", 0),
            "total_budget": part.get("total_budget", 0),
            "total_hours": round(pd["hours"], 1),
            "total_cost": round(pd["cost"], 2),
            "claim_count": pd["claims"],
            "services": list(pd["services"]),
            "first_claim": dates[0] if dates else "",
            "last_claim": dates[-1] if dates else "",
        })
    result.sort(key=lambda x: x["total_cost"], reverse=True)
    return result


@app.get("/api/investigation/participant/{participant_id}/services")
def get_participant_services(participant_id: str, provider_id: str = None,
                             current_user: User = Depends(get_current_user)):
    """Get detailed service timeline for a participant, optionally filtered by provider."""
    from collections import defaultdict
    claims = state.get("claims", [])

    filtered = [c for c in claims if c["participant_id"] == participant_id]
    if provider_id:
        filtered = [c for c in filtered if c["provider_id"] == provider_id]

    # Group by service type
    by_service = defaultdict(lambda: {"claims": [], "total_hours": 0, "total_cost": 0})
    for c in sorted(filtered, key=lambda x: x["date"]):
        svc = by_service[c["service_type"]]
        svc["total_hours"] += c["hours"]
        svc["total_cost"] += c["total_amount"]
        svc["claims"].append({
            "id": c["id"], "date": c["date"],
            "start_time": c["start_time"], "end_time": c["end_time"],
            "hours": c["hours"], "rate": c["rate_per_hour"],
            "amount": round(c["total_amount"], 2),
            "worker_id": c["worker_id"], "provider_id": c["provider_id"],
        })

    # Monthly summary
    monthly = defaultdict(lambda: {"hours": 0, "cost": 0, "sessions": 0})
    for c in filtered:
        m = c["date"][:7]
        monthly[m]["hours"] += c["hours"]
        monthly[m]["cost"] += c["total_amount"]
        monthly[m]["sessions"] += 1

    services = []
    for stype, sd in by_service.items():
        services.append({
            "service_type": stype,
            "total_hours": round(sd["total_hours"], 1),
            "total_cost": round(sd["total_cost"], 2),
            "claim_count": len(sd["claims"]),
            "avg_session_hours": round(sd["total_hours"] / len(sd["claims"]), 1) if sd["claims"] else 0,
            "avg_rate": round(sd["total_cost"] / sd["total_hours"], 2) if sd["total_hours"] > 0 else 0,
            "claims": sd["claims"][:50],  # limit per service
        })
    services.sort(key=lambda x: x["total_cost"], reverse=True)

    return {
        "participant_id": participant_id,
        "provider_id": provider_id,
        "total_hours": round(sum(s["total_hours"] for s in services), 1),
        "total_cost": round(sum(s["total_cost"] for s in services), 2),
        "total_claims": sum(s["claim_count"] for s in services),
        "services": services,
        "monthly": [{"month": k, **{kk: round(vv, 2) if isinstance(vv, float) else vv for kk, vv in v.items()}}
                    for k, v in sorted(monthly.items())],
    }


@app.get("/api/search")
def search_entities(q: str = "", entity_type: str = "all", current_user: User = Depends(get_current_user)):
    """Search across providers, participants, and workers."""
    results = []
    q_lower = q.lower()
    if not q:
        return {"results": [], "total": 0}

    if entity_type in ("all", "provider"):
        for p in state.get("providers", []):
            if q_lower in p["id"].lower() or q_lower in p["name"].lower() or q_lower in p.get("abn", "").lower():
                risk = state.get("provider_risk_agg", {}).get(p["id"], {})
                results.append({
                    "type": "provider", "id": p["id"], "name": p["name"],
                    "detail": f"ABN: {p['abn']} | Services: {', '.join(p['service_types'][:3])}",
                    "risk_score": risk.get("risk_score", 0),
                    "alert_count": risk.get("alerts", 0),
                })

    if entity_type in ("all", "participant"):
        for p in state.get("participants", []):
            if q_lower in p["id"].lower() or q_lower in p["name"].lower() or q_lower in p.get("ndis_number", "").lower():
                results.append({
                    "type": "participant", "id": p["id"], "name": p["name"],
                    "detail": f"NDIS: {p['ndis_number']} | {p['disability_type']} | {p['support_needs_level']}",
                    "risk_score": 0, "alert_count": 0,
                })

    if entity_type in ("all", "worker"):
        for w in state.get("workers", []):
            if q_lower in w["id"].lower() or q_lower in w["name"].lower():
                results.append({
                    "type": "worker", "id": w["id"], "name": w["name"],
                    "detail": f"Role: {w['role']} | Providers: {', '.join(w['providers'])}",
                    "risk_score": 0, "alert_count": 0,
                })

    results.sort(key=lambda x: x.get("risk_score", 0), reverse=True)
    return {"results": results[:50], "total": len(results)}


@app.get("/api/service-codes")
def get_service_codes(current_user: User = Depends(get_current_user)):
    """Get service type statistics."""
    from collections import defaultdict
    claims = state.get("claims", [])
    providers = state.get("providers", [])
    fraud_set = set(state.get("fraud_provider_ids", []))

    svc_stats = defaultdict(lambda: {
        "total_claims": 0, "total_hours": 0, "total_amount": 0,
        "providers": set(), "participants": set(), "workers": set(),
        "rates": [], "hours_list": [], "fraud_claims": 0,
    })

    for c in claims:
        s = svc_stats[c["service_type"]]
        s["total_claims"] += 1
        s["total_hours"] += c["hours"]
        s["total_amount"] += c["total_amount"]
        s["providers"].add(c["provider_id"])
        s["participants"].add(c["participant_id"])
        s["workers"].add(c["worker_id"])
        s["rates"].append(c["rate_per_hour"])
        s["hours_list"].append(c["hours"])
        if c["provider_id"] in fraud_set:
            s["fraud_claims"] += 1

    result = []
    for stype, s in svc_stats.items():
        avg_rate = sum(s["rates"]) / len(s["rates"]) if s["rates"] else 0
        avg_hours = sum(s["hours_list"]) / len(s["hours_list"]) if s["hours_list"] else 0
        fraud_pct = (s["fraud_claims"] / s["total_claims"] * 100) if s["total_claims"] > 0 else 0
        result.append({
            "service_type": stype,
            "total_claims": s["total_claims"],
            "total_hours": round(s["total_hours"], 1),
            "total_amount": round(s["total_amount"], 2),
            "provider_count": len(s["providers"]),
            "participant_count": len(s["participants"]),
            "worker_count": len(s["workers"]),
            "avg_rate": round(avg_rate, 2),
            "avg_session_hours": round(avg_hours, 1),
            "min_rate": round(min(s["rates"]), 2) if s["rates"] else 0,
            "max_rate": round(max(s["rates"]), 2) if s["rates"] else 0,
            "fraud_claim_pct": round(fraud_pct, 1),
        })
    result.sort(key=lambda x: x["total_amount"], reverse=True)
    return result


@app.get("/api/collusion")
def get_collusion(current_user: User = Depends(get_current_user)):
    network = state.get("collusion_network", {})
    risk_agg = state.get("provider_risk_agg", {})
    # Inject risk scores into network nodes
    if network.get("nodes"):
        for node in network["nodes"]:
            r = risk_agg.get(node["id"], {})
            node["risk_score"] = r.get("risk_score", 0)
            node["alert_count"] = r.get("alerts", 0)
            node["max_severity"] = r.get("max_severity", "none")
    return {
        "network": network,
        "cartels": state.get("cartels", []),
        "referral_loops": state.get("referral_loops", []),
    }


@app.get("/api/embeddings")
def get_embeddings(current_user: User = Depends(get_current_user)):
    return {
        "points": state.get("embedding_viz", []),
        "fraud_providers": state.get("fraud_provider_ids", []),
    }


@app.get("/api/invoices/flagged")
def get_flagged_invoices(limit: int = 50, offset: int = 0, current_user: User = Depends(get_current_user)):
    flagged = state.get("flagged_invoices", [])
    return {"total": len(flagged), "invoices": flagged[offset:offset + limit]}


@app.get("/api/invoices/distribution")
def get_invoice_dist(current_user: User = Depends(get_current_user)):
    return state.get("invoice_distribution", [])


@app.get("/api/engines/status")
def get_engine_status(current_user: User = Depends(get_current_user)):
    return {
        "engines": [
            {"id": 1, "name": "Network Graph Analysis", "description": "Provider-Participant-Staff dynamic network model",
             "alerts": len(state.get("closed_loops", [])) + len(state.get("shared_staff", [])) + len(state.get("shared_addresses", [])), "status": "active"},
            {"id": 2, "name": "Behavioural Drift", "description": "Provider behaviour fingerprint tracking over time",
             "alerts": len(state.get("impossible_accel", [])) + len(state.get("staffing_anomalies", [])), "status": "active"},
            {"id": 3, "name": "Time Budget Constraints", "description": "Human time budget and physical impossibility detection",
             "alerts": len(state.get("time_impossibilities", [])) + len(state.get("overservicing", [])) + len(state.get("travel_impossibilities", [])), "status": "active"},
            {"id": 4, "name": "Provider DNA Embeddings", "description": "AI representation learning for provider behaviour vectors",
             "alerts": len(state.get("mutations", [])) + len(state.get("cluster_anomalies", [])), "status": "active"},
            {"id": 5, "name": "Synthetic Simulation", "description": "Compare real billing against simulated normal care baselines",
             "alerts": len(state.get("simulation_alerts", [])), "status": "active"},
            {"id": 6, "name": "Collusion Detection", "description": "Multi-provider cartel and referral loop detection",
             "alerts": len(state.get("cartels", [])) + len(state.get("referral_loops", [])), "status": "active"},
            {"id": 7, "name": "Invoice Pressure Testing", "description": "Real-time invoice scoring against multi-dimensional baselines",
             "alerts": len(state.get("flagged_invoices", [])), "status": "active"},
        ]
    }


# ==================== FINES & PENALTIES ROUTES ====================

@app.get("/api/fines/codes")
def get_fine_codes(current_user: User = Depends(get_current_user)):
    return fines_manager.get_fine_codes()


class FineCodeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    base_amount: Optional[float] = None
    severity_multiplier: Optional[dict] = None
    active: Optional[bool] = None


@app.put("/api/fines/codes/{code}")
def update_fine_code(code: str, update: FineCodeUpdate, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    updates = {k: v for k, v in update.model_dump().items() if v is not None}
    result = fines_manager.update_fine_code(code, updates)
    if not result:
        raise HTTPException(status_code=404, detail="Fine code not found")
    return result


class NewFineCode(BaseModel):
    code: str
    name: str
    description: str
    base_amount: float
    severity_multiplier: dict
    category: str
    active: bool = True


@app.post("/api/fines/codes")
def create_fine_code(fc: NewFineCode, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    result = fines_manager.create_fine_code(fc.model_dump())
    if not result:
        raise HTTPException(status_code=400, detail="Code already exists")
    return result


@app.delete("/api/fines/codes/{code}")
def delete_fine_code(code: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    if not fines_manager.delete_fine_code(code):
        raise HTTPException(status_code=404, detail="Fine code not found")
    return {"message": "Deleted"}


@app.get("/api/penalties")
def get_penalties(provider_id: str = None, penalty_status: str = None, limit: int = 100, offset: int = 0,
                  current_user: User = Depends(get_current_user)):
    return fines_manager.get_penalties(provider_id, penalty_status, limit, offset)


class PenaltyStatusUpdate(BaseModel):
    status: str
    notes: str = ""


@app.put("/api/penalties/{penalty_id}/status")
def update_penalty_status(penalty_id: str, update: PenaltyStatusUpdate,
                          current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    result = fines_manager.update_penalty_status(penalty_id, update.status, update.notes)
    if not result:
        raise HTTPException(status_code=404, detail="Penalty not found")
    return result


@app.post("/api/penalties/{penalty_id}/send-email")
def send_penalty_email(penalty_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return fines_manager.send_penalty_email(penalty_id)


@app.post("/api/penalties/send-all")
def send_all_penalty_emails(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return fines_manager.send_all_pending_emails()


# ==================== FINANCIAL TRACKER ROUTES ====================

@app.get("/api/financial/summary")
def get_financial_summary(current_user: User = Depends(get_current_user)):
    return fines_manager.get_financial_summary()


@app.get("/api/financial/by-category")
def get_financial_by_category(current_user: User = Depends(get_current_user)):
    return fines_manager.get_financial_by_category()


@app.get("/api/financial/timeline")
def get_financial_timeline(current_user: User = Depends(get_current_user)):
    return fines_manager.get_financial_timeline()


@app.get("/api/financial/by-provider")
def get_financial_by_provider(current_user: User = Depends(get_current_user)):
    return fines_manager.get_provider_penalty_summary()


# ==================== RULE ENGINE ROUTES ====================

@app.get("/api/rules")
def get_rules(current_user: User = Depends(get_current_user)):
    return rule_engine.get_rules()


@app.get("/api/rules/fields")
def get_rule_fields(current_user: User = Depends(get_current_user)):
    return rule_engine.get_available_fields()


class RuleCreate(BaseModel):
    name: str
    description: str = ""
    category: str = "Custom"
    enabled: bool = True
    priority: int = 2
    conditions: list = []
    logic: str = "ALL"
    action: str = "flag"
    severity: str = "medium"


@app.post("/api/rules")
def create_rule(rule: RuleCreate, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    result = rule_engine.create_rule(rule.model_dump())
    # Re-evaluate
    rule_engine.evaluate_all_claims(state.get("claims", []))
    return result


class RuleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    enabled: Optional[bool] = None
    priority: Optional[int] = None
    conditions: Optional[list] = None
    logic: Optional[str] = None
    action: Optional[str] = None
    severity: Optional[str] = None


@app.put("/api/rules/{rule_id}")
def update_rule(rule_id: str, update: RuleUpdate, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    updates = {k: v for k, v in update.model_dump().items() if v is not None}
    result = rule_engine.update_rule(rule_id, updates)
    if not result:
        raise HTTPException(status_code=404, detail="Rule not found")
    rule_engine.evaluate_all_claims(state.get("claims", []))
    return result


@app.delete("/api/rules/{rule_id}")
def delete_rule(rule_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    if not rule_engine.delete_rule(rule_id):
        raise HTTPException(status_code=404, detail="Rule not found")
    rule_engine.evaluate_all_claims(state.get("claims", []))
    return {"message": "Deleted"}


@app.post("/api/rules/{rule_id}/toggle")
def toggle_rule(rule_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    result = rule_engine.toggle_rule(rule_id)
    if not result:
        raise HTTPException(status_code=404, detail="Rule not found")
    rule_engine.evaluate_all_claims(state.get("claims", []))
    return result


@app.get("/api/rules/results")
def get_rule_results(rule_id: str = None, limit: int = 100, offset: int = 0,
                     current_user: User = Depends(get_current_user)):
    return rule_engine.get_results(rule_id, limit, offset)


@app.get("/api/rules/stats")
def get_rule_stats(current_user: User = Depends(get_current_user)):
    return rule_engine.get_stats()


@app.post("/api/rules/evaluate")
def re_evaluate_rules(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return rule_engine.evaluate_all_claims(state.get("claims", []))


# ==================== PATTERN SEARCH ROUTES ====================

class PatternSearchRequest(BaseModel):
    query: str

@app.post("/api/pattern-search")
def api_pattern_search(req: PatternSearchRequest, current_user: User = Depends(get_current_user)):
    check_permission(current_user, "investigation.conduct")
    return search_fraud_pattern(req.query, state.get("claims", []), state.get("providers", []),
                                state.get("workers", []), state.get("participants", []),
                                state.get("provider_risk_agg", {}))

@app.get("/api/scenarios")
def api_get_scenarios(current_user: User = Depends(get_current_user)):
    return get_saved_scenarios()

class SaveScenarioRequest(BaseModel):
    name: str
    query: str

@app.post("/api/scenarios")
def api_save_scenario(req: SaveScenarioRequest, current_user: User = Depends(get_current_user)):
    return save_scenario(req.name, req.query, current_user.username)

@app.delete("/api/scenarios/{scenario_id}")
def api_delete_scenario(scenario_id: str, current_user: User = Depends(get_current_user)):
    delete_scenario(scenario_id)
    return {"message": "Deleted"}

@app.post("/api/scenarios/{scenario_id}/run")
def api_run_scenario(scenario_id: str, current_user: User = Depends(get_current_user)):
    scenario = increment_scenario_run(scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return search_fraud_pattern(scenario["query"], state.get("claims", []), state.get("providers", []),
                                state.get("workers", []), state.get("participants", []),
                                state.get("provider_risk_agg", {}))


# ==================== ENTERPRISE ROUTES ====================

@app.get("/api/watchlist")
def api_get_watchlist(wl_status: str = None, current_user: User = Depends(get_current_user)):
    return get_watchlist(wl_status)

class WatchlistAdd(BaseModel):
    entity_id: str
    entity_type: str
    entity_name: str
    reason: str
    priority: str = "high"

@app.post("/api/watchlist")
def api_add_watchlist(req: WatchlistAdd, current_user: User = Depends(get_current_user)):
    check_permission(current_user, "investigation.conduct")
    return add_to_watchlist(req.entity_id, req.entity_type, req.entity_name, req.reason, current_user.username, req.priority)

class WatchlistUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    reason: Optional[str] = None

@app.put("/api/watchlist/{wl_id}")
def api_update_watchlist(wl_id: str, req: WatchlistUpdate, current_user: User = Depends(get_current_user)):
    return update_watchlist_entry(wl_id, {k:v for k,v in req.model_dump().items() if v is not None})

class WatchlistNote(BaseModel):
    note: str

@app.post("/api/watchlist/{wl_id}/note")
def api_add_watchlist_note(wl_id: str, req: WatchlistNote, current_user: User = Depends(get_current_user)):
    return add_watchlist_note(wl_id, req.note, current_user.username)

@app.get("/api/notifications")
def api_get_notifications(current_user: User = Depends(get_current_user)):
    return get_notifications(current_user.role, 50)

@app.post("/api/notifications/{notif_id}/read")
def api_mark_read(notif_id: str, current_user: User = Depends(get_current_user)):
    return mark_notification_read(notif_id, current_user.username)

class TipoffSubmit(BaseModel):
    category: str
    subject: str
    description: str
    provider_id: Optional[str] = None
    contact_method: Optional[str] = None
    contact_detail: Optional[str] = None

@app.post("/api/tipoffs")
def api_submit_tipoff(req: TipoffSubmit):
    """Public endpoint — no auth required for anonymous tips."""
    return submit_tipoff(req.category, req.subject, req.description, req.provider_id, req.contact_method, req.contact_detail)

@app.get("/api/tipoffs")
def api_get_tipoffs(tip_status: str = None, current_user: User = Depends(get_current_user)):
    check_permission(current_user, "investigation.view")
    return get_tipoffs(tip_status)

class TipoffUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_to: Optional[str] = None

@app.put("/api/tipoffs/{tip_id}")
def api_update_tipoff(tip_id: str, req: TipoffUpdate, current_user: User = Depends(get_current_user)):
    check_permission(current_user, "investigation.conduct")
    return update_tipoff(tip_id, {k:v for k,v in req.model_dump().items() if v is not None})

@app.post("/api/tipoffs/{tip_id}/note")
def api_add_tipoff_note(tip_id: str, req: WatchlistNote, current_user: User = Depends(get_current_user)):
    return add_tipoff_note(tip_id, req.note, current_user.username)

@app.get("/api/compliance")
def api_get_compliance(current_user: User = Depends(get_current_user)):
    return {"standards": get_compliance_standards(), "summary": get_compliance_summary()}

@app.get("/api/executive-report")
def api_executive_report(current_user: User = Depends(get_current_user)):
    return generate_executive_report(state, fines_manager)

@app.get("/api/system-health")
def api_system_health(current_user: User = Depends(get_current_user)):
    return get_system_health(state)

@app.get("/api/risk-heatmap")
def api_risk_heatmap(current_user: User = Depends(get_current_user)):
    return get_risk_heatmap(state.get("providers", []), state.get("provider_risk_agg", {}))


# ==================== SERVE FRONTEND ====================

FRONTEND_DIR = Path(__file__).parent.parent / "frontend" / "dist"


@app.get("/")
def serve_root():
    index = FRONTEND_DIR / "index.html"
    if index.exists():
        return FileResponse(index)
    return {"message": "NDIS Fraud Detection API. Visit /docs for API."}


if FRONTEND_DIR.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        file_path = FRONTEND_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(FRONTEND_DIR / "index.html")


def _count_by_engine(alerts):
    counts = {}
    for a in alerts:
        engine = a.get("source_engine", "Unknown")
        counts[engine] = counts.get(engine, 0) + 1
    return counts


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
