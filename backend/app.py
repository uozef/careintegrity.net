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
    User, Token, change_password, create_user, ACCESS_TOKEN_EXPIRE_MINUTES,
)
from fines import FinesManager
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
    print(f"\n✅ System initialized: {len(all_alerts)} alerts, {len(issued)} penalties across 7 engines")


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
    return {
        "username": current_user.username,
        "full_name": current_user.full_name,
        "email": current_user.email,
        "role": current_user.role,
    }


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@app.post("/api/auth/change-password")
async def api_change_password(req: ChangePasswordRequest, current_user: User = Depends(get_current_user)):
    from auth import verify_password, get_user
    user = get_user(current_user.username)
    if not verify_password(req.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password incorrect")
    change_password(current_user.username, req.new_password)
    return {"message": "Password changed successfully"}


class CreateUserRequest(BaseModel):
    username: str
    password: str
    full_name: str
    email: str
    role: str = "analyst"


@app.post("/api/auth/users")
async def api_create_user(req: CreateUserRequest, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    user = create_user(req.username, req.password, req.full_name, req.email, req.role)
    if not user:
        raise HTTPException(status_code=400, detail="Username already exists")
    return user


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


@app.get("/api/collusion")
def get_collusion(current_user: User = Depends(get_current_user)):
    return {
        "network": state.get("collusion_network", {}),
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
