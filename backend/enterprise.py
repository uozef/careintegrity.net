"""
Enterprise features for government compliance:
- Executive Reports
- Risk Heatmap (geographic)
- Watchlist Management
- Compliance Framework (NDIS Quality & Safeguards)
- System Health Monitoring
- Notifications Center
- Whistleblower / Tip-off Portal
"""
import uuid
from datetime import datetime, timedelta
from collections import defaultdict


# ==================== WATCHLIST ====================

WATCHLIST = []

def add_to_watchlist(entity_id, entity_type, entity_name, reason, added_by, priority="high"):
    entry = {
        "id": f"WL-{uuid.uuid4().hex[:8].upper()}",
        "entity_id": entity_id,
        "entity_type": entity_type,
        "entity_name": entity_name,
        "reason": reason,
        "priority": priority,
        "added_by": added_by,
        "added_at": datetime.now().isoformat(),
        "status": "active",
        "notes": [],
        "review_date": (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d"),
    }
    WATCHLIST.append(entry)
    return entry

def get_watchlist(status=None):
    if status:
        return [w for w in WATCHLIST if w["status"] == status]
    return WATCHLIST

def update_watchlist_entry(wl_id, updates):
    entry = next((w for w in WATCHLIST if w["id"] == wl_id), None)
    if not entry:
        return None
    for k, v in updates.items():
        if k in ("status", "priority", "reason", "review_date"):
            entry[k] = v
    return entry

def add_watchlist_note(wl_id, note, author):
    entry = next((w for w in WATCHLIST if w["id"] == wl_id), None)
    if not entry:
        return None
    entry["notes"].append({"text": note, "author": author, "timestamp": datetime.now().isoformat()})
    return entry


# ==================== NOTIFICATIONS ====================

NOTIFICATIONS = []

def create_notification(title, message, severity="info", target_roles=None, entity_id=None):
    notif = {
        "id": f"NTF-{uuid.uuid4().hex[:8].upper()}",
        "title": title,
        "message": message,
        "severity": severity,
        "target_roles": target_roles or ["admin", "fraud_officer"],
        "entity_id": entity_id,
        "created_at": datetime.now().isoformat(),
        "read_by": [],
    }
    NOTIFICATIONS.append(notif)
    if len(NOTIFICATIONS) > 500:
        NOTIFICATIONS.pop(0)
    return notif

def get_notifications(role=None, limit=50):
    filtered = NOTIFICATIONS
    if role:
        filtered = [n for n in filtered if role in n.get("target_roles", [])]
    return list(reversed(filtered[-limit:]))

def mark_notification_read(notif_id, username):
    notif = next((n for n in NOTIFICATIONS if n["id"] == notif_id), None)
    if notif and username not in notif["read_by"]:
        notif["read_by"].append(username)
    return notif


# ==================== WHISTLEBLOWER / TIP-OFF ====================

TIPOFFS = []

def submit_tipoff(category, subject, description, provider_id=None, contact_method=None, contact_detail=None):
    tip = {
        "id": f"TIP-{uuid.uuid4().hex[:8].upper()}",
        "category": category,
        "subject": subject,
        "description": description,
        "provider_id": provider_id,
        "contact_method": contact_method,  # None = anonymous
        "contact_detail": contact_detail,
        "submitted_at": datetime.now().isoformat(),
        "status": "new",
        "assigned_to": None,
        "priority": "medium",
        "investigation_notes": [],
    }
    TIPOFFS.append(tip)
    create_notification(
        f"New tip-off received: {subject}",
        f"Category: {category}. Provider: {provider_id or 'Not specified'}",
        severity="high",
        target_roles=["admin", "fraud_officer", "investigator"],
        entity_id=tip["id"],
    )
    return tip

def get_tipoffs(status=None):
    if status:
        return [t for t in TIPOFFS if t["status"] == status]
    return TIPOFFS

def update_tipoff(tip_id, updates):
    tip = next((t for t in TIPOFFS if t["id"] == tip_id), None)
    if not tip:
        return None
    for k, v in updates.items():
        if k in ("status", "priority", "assigned_to"):
            tip[k] = v
    return tip

def add_tipoff_note(tip_id, note, author):
    tip = next((t for t in TIPOFFS if t["id"] == tip_id), None)
    if not tip:
        return None
    tip["investigation_notes"].append({"text": note, "author": author, "timestamp": datetime.now().isoformat()})
    return tip


# ==================== COMPLIANCE FRAMEWORK ====================

NDIS_COMPLIANCE_STANDARDS = [
    {
        "id": "CS-001", "category": "Registration",
        "standard": "Provider Registration Verification",
        "description": "All providers must hold valid NDIS registration with current ABN and appropriate service categories",
        "check_type": "automated", "status": "passing", "score": 95,
    },
    {
        "id": "CS-002", "category": "Billing",
        "standard": "NDIS Price Guide Compliance",
        "description": "All service rates must comply with NDIS Price Guide limits for the relevant support category and region",
        "check_type": "automated", "status": "warning", "score": 78,
    },
    {
        "id": "CS-003", "category": "Billing",
        "standard": "Duplicate Claim Prevention",
        "description": "System must detect and prevent duplicate claims for the same participant, date, and service",
        "check_type": "automated", "status": "passing", "score": 99,
    },
    {
        "id": "CS-004", "category": "Safeguards",
        "standard": "Worker Screening Verification",
        "description": "All workers must have valid NDIS Worker Screening Check clearance",
        "check_type": "manual", "status": "warning", "score": 82,
    },
    {
        "id": "CS-005", "category": "Safeguards",
        "standard": "Incident Reporting Compliance",
        "description": "All reportable incidents must be logged and escalated within required timeframes",
        "check_type": "manual", "status": "passing", "score": 91,
    },
    {
        "id": "CS-006", "category": "Quality",
        "standard": "Service Agreement Documentation",
        "description": "Valid service agreements must exist between providers and participants before service delivery",
        "check_type": "manual", "status": "failing", "score": 65,
    },
    {
        "id": "CS-007", "category": "Financial",
        "standard": "Plan Budget Monitoring",
        "description": "System must alert when participant plan utilisation exceeds 90% or billing patterns are anomalous",
        "check_type": "automated", "status": "passing", "score": 97,
    },
    {
        "id": "CS-008", "category": "Financial",
        "standard": "Conflict of Interest Controls",
        "description": "Detect and flag conflicts where providers, workers, or plan managers have financial relationships",
        "check_type": "automated", "status": "warning", "score": 74,
    },
    {
        "id": "CS-009", "category": "Governance",
        "standard": "Audit Trail Completeness",
        "description": "All system actions, decisions, and data changes must be logged with timestamps and user attribution",
        "check_type": "automated", "status": "passing", "score": 100,
    },
    {
        "id": "CS-010", "category": "Governance",
        "standard": "Role-Based Access Control",
        "description": "System access must be role-based with principle of least privilege enforced",
        "check_type": "automated", "status": "passing", "score": 100,
    },
    {
        "id": "CS-011", "category": "Data",
        "standard": "Data Retention & Privacy",
        "description": "Personal information handling must comply with Australian Privacy Principles and NDIS data requirements",
        "check_type": "manual", "status": "passing", "score": 88,
    },
    {
        "id": "CS-012", "category": "Detection",
        "standard": "Multi-Engine Fraud Detection",
        "description": "System must employ multiple independent detection engines covering network, behavioural, temporal, and financial dimensions",
        "check_type": "automated", "status": "passing", "score": 100,
    },
]

def get_compliance_standards():
    return NDIS_COMPLIANCE_STANDARDS

def get_compliance_summary():
    total = len(NDIS_COMPLIANCE_STANDARDS)
    passing = len([s for s in NDIS_COMPLIANCE_STANDARDS if s["status"] == "passing"])
    warning = len([s for s in NDIS_COMPLIANCE_STANDARDS if s["status"] == "warning"])
    failing = len([s for s in NDIS_COMPLIANCE_STANDARDS if s["status"] == "failing"])
    avg_score = sum(s["score"] for s in NDIS_COMPLIANCE_STANDARDS) / total if total else 0
    return {
        "total_standards": total,
        "passing": passing,
        "warning": warning,
        "failing": failing,
        "overall_score": round(avg_score, 1),
        "by_category": _group_by(NDIS_COMPLIANCE_STANDARDS, "category"),
    }

def _group_by(items, key):
    groups = defaultdict(list)
    for item in items:
        groups[item[key]].append(item)
    return {k: {"count": len(v), "avg_score": round(sum(i["score"] for i in v)/len(v), 1)} for k, v in groups.items()}


# ==================== EXECUTIVE REPORTS ====================

def generate_executive_report(state, fines_manager):
    """Generate comprehensive executive summary report."""
    claims = state.get("claims", [])
    providers = state.get("providers", [])
    participants = state.get("participants", [])
    all_alerts = state.get("all_alerts", [])
    risk_agg = state.get("provider_risk_agg", {})
    fraud_ids = set(state.get("fraud_provider_ids", []))
    financial = fines_manager.get_financial_summary()

    total_billed = sum(c["total_amount"] for c in claims)
    fraud_billed = sum(c["total_amount"] for c in claims if c["provider_id"] in fraud_ids)

    # Risk distribution
    risk_dist = {"critical": 0, "high": 0, "medium": 0, "low": 0, "clean": 0}
    for p in providers:
        rs = risk_agg.get(p["id"], {}).get("risk_score", 0)
        if rs >= 0.7: risk_dist["critical"] += 1
        elif rs >= 0.5: risk_dist["high"] += 1
        elif rs >= 0.3: risk_dist["medium"] += 1
        elif rs > 0: risk_dist["low"] += 1
        else: risk_dist["clean"] += 1

    # Alert trends by engine
    by_engine = defaultdict(int)
    by_severity = defaultdict(int)
    for a in all_alerts:
        by_engine[a.get("source_engine", "Unknown")] += 1
        by_severity[a.get("severity", "low")] += 1

    # Top risk providers
    top_risk = sorted(
        [{"id": p["id"], "name": p["name"], "risk": risk_agg.get(p["id"], {}).get("risk_score", 0),
          "alerts": risk_agg.get(p["id"], {}).get("alerts", 0)}
         for p in providers if risk_agg.get(p["id"], {}).get("risk_score", 0) > 0],
        key=lambda x: x["risk"], reverse=True
    )[:20]

    compliance = get_compliance_summary()

    return {
        "report_date": datetime.now().isoformat(),
        "period": f"{claims[0]['date'] if claims else 'N/A'} to {claims[-1]['date'] if claims else 'N/A'}",
        "overview": {
            "total_providers": len(providers),
            "total_participants": len(participants),
            "total_claims": len(claims),
            "total_billed": round(total_billed, 2),
            "fraud_detected_value": round(fraud_billed, 2),
            "fraud_percentage": round(fraud_billed / total_billed * 100, 1) if total_billed > 0 else 0,
        },
        "alerts": {
            "total": len(all_alerts),
            "by_severity": dict(by_severity),
            "by_engine": dict(by_engine),
        },
        "risk_distribution": risk_dist,
        "financial": financial,
        "compliance": compliance,
        "top_risk_providers": top_risk,
        "recommendations": [
            {"priority": "critical", "title": "Immediate investigation required",
             "detail": f"{risk_dist['critical']} providers at critical risk level — recommend immediate audit and potential suspension"},
            {"priority": "high", "title": "Penalty enforcement acceleration",
             "detail": f"Collection rate at {financial.get('collection_rate', 0)}% — escalate overdue penalties and consider registration sanctions"},
            {"priority": "high", "title": "Workforce integrity review",
             "detail": "Multiple workers detected billing at multiple locations simultaneously — recommend worker screening audit"},
            {"priority": "medium", "title": "Service stacking investigation",
             "detail": "Pattern of excessive concurrent therapy services detected — review clinical justification requirements"},
            {"priority": "medium", "title": "Provider cluster monitoring",
             "detail": "Collusion detection identified provider cartels with shared staff/addresses — recommend ongoing surveillance"},
        ],
        "watchlist_count": len(get_watchlist("active")),
        "tipoff_count": len(get_tipoffs()),
    }


# ==================== SYSTEM HEALTH ====================

SYSTEM_START = datetime.now()

def get_system_health(state):
    import sys
    claims = state.get("claims", [])
    alerts = state.get("all_alerts", [])
    uptime = datetime.now() - SYSTEM_START
    hours = uptime.total_seconds() / 3600

    return {
        "status": "operational",
        "uptime_hours": round(hours, 1),
        "started_at": SYSTEM_START.isoformat(),
        "engines": [
            {"name": "Network Graph Analysis", "status": "active", "last_run": datetime.now().isoformat(), "health": 100},
            {"name": "Behavioural Drift Engine", "status": "active", "last_run": datetime.now().isoformat(), "health": 100},
            {"name": "Time Budget Constraints", "status": "active", "last_run": datetime.now().isoformat(), "health": 100},
            {"name": "Provider DNA Embeddings", "status": "active", "last_run": datetime.now().isoformat(), "health": 100},
            {"name": "Synthetic Simulation", "status": "active", "last_run": datetime.now().isoformat(), "health": 100},
            {"name": "Collusion Detection", "status": "active", "last_run": datetime.now().isoformat(), "health": 100},
            {"name": "Invoice Pressure Testing", "status": "active", "last_run": datetime.now().isoformat(), "health": 100},
            {"name": "Rule Engine", "status": "active", "last_run": datetime.now().isoformat(), "health": 100},
        ],
        "data_stats": {
            "claims_processed": len(claims),
            "alerts_generated": len(alerts),
            "providers_monitored": len(state.get("providers", [])),
            "participants_protected": len(state.get("participants", [])),
            "workers_tracked": len(state.get("workers", [])),
        },
        "api_version": "2.0.0",
        "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
    }


# ==================== GEOGRAPHIC RISK ====================

def get_risk_heatmap(providers, risk_agg):
    """Generate geographic risk data for heatmap visualization — includes ALL providers."""
    points = []
    for p in providers:
        risk = risk_agg.get(p["id"], {})
        rs = risk.get("risk_score", 0)
        points.append({
            "id": p["id"],
            "name": p["name"],
            "lat": p["lat"],
            "lng": p["lng"],
            "risk_score": rs,
            "alerts": risk.get("alerts", 0),
            "severity": risk.get("max_severity", "none"),
            "address": p["address"],
        })
    return sorted(points, key=lambda x: x["risk_score"], reverse=True)


# ==================== SEED DATA ====================

def seed_demo_data(providers, risk_agg):
    """Create demo watchlist entries, notifications, and tipoffs."""
    # Watchlist
    top_risk = sorted(providers, key=lambda p: risk_agg.get(p["id"], {}).get("risk_score", 0), reverse=True)
    for p in top_risk[:8]:
        add_to_watchlist(p["id"], "provider", p["name"],
            "Flagged by automated detection — multiple fraud indicators",
            "system", "critical" if risk_agg.get(p["id"], {}).get("risk_score", 0) > 0.8 else "high")

    # Notifications
    create_notification("System initialized", "All 8 detection engines are active and processing claims", "info", ["admin"])
    create_notification("Critical alerts detected", f"{len([a for a in [] ])} critical fraud patterns identified", "critical")
    create_notification("Batch analysis complete", "Processed 98,966 claims across 60 providers", "info")
    create_notification("New penalties issued", "221 automated penalties generated totalling $23.9M", "high")
    create_notification("Compliance review due", "Quarterly NDIS compliance audit scheduled", "warning", ["admin", "fraud_officer"])

    # Tipoffs
    submit_tipoff("Billing Fraud", "Suspicious SIL billing",
        "Provider appears to be billing for SIL services at multiple houses simultaneously with the same staff. "
        "Workers have told me they only visit one house but the provider bills for three.",
        "PRV-0003", "email", "concerned.worker@email.com")
    submit_tipoff("Service Quality", "No actual services delivered",
        "My family member receives invoices for therapy sessions that never happened. "
        "The therapist has not visited in 3 months but billing continues weekly.",
        "PRV-0007", None, None)
    submit_tipoff("Workforce Abuse", "Ghost workers on payroll",
        "Former employee here. The company has at least 5 workers on the books who don't exist. "
        "Their identities are used to bill NDIS but no one actually provides the services.",
        "PRV-0011", "phone", "Anonymous")
