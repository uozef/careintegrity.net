"""
Fine codes, penalty issuance, and financial tracking system.
Handles automatic penalty generation, email notifications, and financial reporting.
"""
import uuid
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from collections import defaultdict
from typing import Optional

from pydantic import BaseModel


# --- Fine Code Definitions ---

class FineCode(BaseModel):
    code: str
    name: str
    description: str
    base_amount: float
    severity_multiplier: dict  # severity -> multiplier
    category: str  # fraud_type category
    active: bool = True


class Penalty(BaseModel):
    id: str
    fine_code: str
    provider_id: str
    provider_name: str
    provider_email: str
    alert_id: str
    alert_type: str
    amount: float
    severity: str
    description: str
    issued_at: str
    due_date: str
    status: str  # pending, sent, acknowledged, paid, disputed, overdue, cancelled
    email_sent: bool = False
    email_sent_at: Optional[str] = None
    payment_date: Optional[str] = None
    notes: str = ""


class FinancialSummary(BaseModel):
    total_fraud_detected_value: float
    total_penalties_issued: float
    total_penalties_paid: float
    total_penalties_pending: float
    total_penalties_disputed: float
    total_penalties_overdue: float
    total_savings_recovered: float
    penalty_count: int
    collection_rate: float


# Default fine codes
DEFAULT_FINE_CODES = [
    {
        "code": "FC-001",
        "name": "Invoice Cycling / Closed Loop",
        "description": "Provider involved in closed-loop money flows or invoice cycling between connected entities",
        "base_amount": 50000.00,
        "severity_multiplier": {"critical": 3.0, "high": 2.0, "medium": 1.0, "low": 0.5},
        "category": "Network Fraud",
        "active": True,
    },
    {
        "code": "FC-002",
        "name": "Impossible Service Acceleration",
        "description": "Provider growth exceeds structural capacity without corresponding workforce increase",
        "base_amount": 35000.00,
        "severity_multiplier": {"critical": 3.0, "high": 2.0, "medium": 1.0, "low": 0.5},
        "category": "Behavioural Fraud",
        "active": True,
    },
    {
        "code": "FC-003",
        "name": "Time Budget Violation",
        "description": "Worker billed at multiple locations simultaneously or exceeding physical time constraints",
        "base_amount": 25000.00,
        "severity_multiplier": {"critical": 3.5, "high": 2.0, "medium": 1.0, "low": 0.5},
        "category": "Time Fraud",
        "active": True,
    },
    {
        "code": "FC-004",
        "name": "Participant Over-servicing",
        "description": "Participant received significantly more hours than allocated or clinically justified",
        "base_amount": 20000.00,
        "severity_multiplier": {"critical": 3.0, "high": 2.0, "medium": 1.0, "low": 0.5},
        "category": "Billing Fraud",
        "active": True,
    },
    {
        "code": "FC-005",
        "name": "Behavioural Mutation Anomaly",
        "description": "Provider drastically changed service profile without legitimate business reason",
        "base_amount": 30000.00,
        "severity_multiplier": {"critical": 2.5, "high": 1.5, "medium": 1.0, "low": 0.5},
        "category": "Behavioural Fraud",
        "active": True,
    },
    {
        "code": "FC-006",
        "name": "Provider Cartel / Collusion",
        "description": "Provider identified as part of a coordinated fraud network sharing staff, clients, or addresses",
        "base_amount": 75000.00,
        "severity_multiplier": {"critical": 4.0, "high": 2.5, "medium": 1.5, "low": 0.5},
        "category": "Organised Fraud",
        "active": True,
    },
    {
        "code": "FC-007",
        "name": "Service Stacking",
        "description": "Unnecessary concurrent services without clinical justification",
        "base_amount": 15000.00,
        "severity_multiplier": {"critical": 2.5, "high": 2.0, "medium": 1.0, "low": 0.5},
        "category": "Billing Fraud",
        "active": True,
    },
    {
        "code": "FC-008",
        "name": "Geographic Impossibility",
        "description": "Travel patterns indicate physically impossible service delivery",
        "base_amount": 20000.00,
        "severity_multiplier": {"critical": 3.0, "high": 2.0, "medium": 1.0, "low": 0.5},
        "category": "Time Fraud",
        "active": True,
    },
    {
        "code": "FC-009",
        "name": "Billing Rate Manipulation",
        "description": "Charging rates significantly above NDIS price guide or peer averages",
        "base_amount": 10000.00,
        "severity_multiplier": {"critical": 3.0, "high": 2.0, "medium": 1.5, "low": 1.0},
        "category": "Billing Fraud",
        "active": True,
    },
    {
        "code": "FC-010",
        "name": "Shared Staff Network Abuse",
        "description": "Excessive worker sharing between providers indicating controlled staffing network",
        "base_amount": 40000.00,
        "severity_multiplier": {"critical": 3.0, "high": 2.0, "medium": 1.0, "low": 0.5},
        "category": "Network Fraud",
        "active": True,
    },
]

# Alert type to fine code mapping
ALERT_TO_FINE_CODE = {
    "closed_loop_money_flow": "FC-001",
    "impossible_acceleration": "FC-002",
    "billing_spike": "FC-002",
    "worker_time_impossibility": "FC-003",
    "excessive_daily_hours": "FC-003",
    "participant_overservicing": "FC-004",
    "over_servicing": "FC-004",
    "behavioural_mutation": "FC-005",
    "cluster_anomaly": "FC-005",
    "provider_cartel": "FC-006",
    "referral_loop": "FC-006",
    "service_stacking": "FC-007",
    "inflated_frequency": "FC-007",
    "excessive_therapy": "FC-007",
    "travel_impossibility": "FC-008",
    "staffing_anomaly": "FC-009",
    "unusual_hours": "FC-009",
    "shared_staff_cluster": "FC-010",
    "shared_address": "FC-010",
}


class FinesManager:
    def __init__(self):
        self.fine_codes: dict[str, dict] = {}
        self.penalties: list[dict] = []
        self.email_config = {
            "smtp_host": "localhost",
            "smtp_port": 587,
            "sender_email": "enforcement@ndis-integrity.gov.au",
            "sender_name": "NDIS Integrity Unit",
            "enabled": False,  # Disabled by default - enable with real SMTP
        }

        # Initialize default fine codes
        for fc in DEFAULT_FINE_CODES:
            self.fine_codes[fc["code"]] = fc

    def get_fine_codes(self):
        return list(self.fine_codes.values())

    def update_fine_code(self, code: str, updates: dict):
        if code not in self.fine_codes:
            return None
        self.fine_codes[code].update(updates)
        return self.fine_codes[code]

    def create_fine_code(self, fine_code: dict):
        if fine_code["code"] in self.fine_codes:
            return None
        self.fine_codes[fine_code["code"]] = fine_code
        return fine_code

    def delete_fine_code(self, code: str):
        if code in self.fine_codes:
            del self.fine_codes[code]
            return True
        return False

    def calculate_penalty_amount(self, fine_code: str, severity: str):
        fc = self.fine_codes.get(fine_code)
        if not fc:
            return 0
        multiplier = fc["severity_multiplier"].get(severity, 1.0)
        return round(fc["base_amount"] * multiplier, 2)

    def issue_penalty(self, alert, provider_info):
        """Issue a penalty for a detected fraud alert."""
        alert_type = alert.get("type", "")
        fine_code = ALERT_TO_FINE_CODE.get(alert_type, "FC-009")
        severity = alert.get("severity", "medium")

        amount = self.calculate_penalty_amount(fine_code, severity)
        fc_info = self.fine_codes.get(fine_code, {})

        from datetime import timedelta
        now = datetime.now()
        due_date = now + timedelta(days=30)

        penalty = {
            "id": f"PEN-{uuid.uuid4().hex[:8].upper()}",
            "fine_code": fine_code,
            "fine_code_name": fc_info.get("name", ""),
            "provider_id": provider_info.get("id", ""),
            "provider_name": provider_info.get("name", "Unknown"),
            "provider_email": f"{provider_info.get('id', 'provider').lower()}@example.com",
            "alert_id": alert.get("id", ""),
            "alert_type": alert_type,
            "amount": amount,
            "severity": severity,
            "description": f"{fc_info.get('name', 'Violation')}: {alert.get('description', '')}",
            "issued_at": now.isoformat(),
            "due_date": due_date.strftime("%Y-%m-%d"),
            "status": "pending",
            "email_sent": False,
            "email_sent_at": None,
            "payment_date": None,
            "notes": "",
            "category": fc_info.get("category", ""),
            "confidence": alert.get("confidence", 0),
        }

        self.penalties.append(penalty)
        return penalty

    def auto_issue_penalties(self, alerts, providers):
        """Automatically issue penalties for all high-confidence alerts."""
        provider_lookup = {p["id"]: p for p in providers}
        issued = []

        # Track which provider+alert_type combos already have penalties
        existing = set()
        for p in self.penalties:
            existing.add((p["provider_id"], p["alert_type"]))

        for alert in alerts:
            if alert.get("confidence", 0) < 0.6:
                continue
            if alert.get("severity") not in ("critical", "high"):
                continue

            entities = alert.get("entities", [])
            provider_ids = [e for e in entities if e.startswith("PRV")]

            for pid in provider_ids:
                key = (pid, alert.get("type", ""))
                if key in existing:
                    continue
                existing.add(key)

                provider = provider_lookup.get(pid, {"id": pid, "name": "Unknown Provider"})
                penalty = self.issue_penalty(alert, provider)
                issued.append(penalty)

        return issued

    def send_penalty_email(self, penalty_id: str):
        """Send penalty notification email to provider."""
        penalty = next((p for p in self.penalties if p["id"] == penalty_id), None)
        if not penalty:
            return {"success": False, "error": "Penalty not found"}

        email_body = f"""
NDIS INTEGRITY UNIT - PENALTY NOTICE
{'='*50}

Penalty Reference: {penalty['id']}
Fine Code: {penalty['fine_code']} - {penalty['fine_code_name']}
Date Issued: {penalty['issued_at'][:10]}

Provider: {penalty['provider_name']} ({penalty['provider_id']})

VIOLATION DETAILS:
{penalty['description']}

Severity: {penalty['severity'].upper()}
Confidence: {penalty['confidence']*100:.0f}%

PENALTY AMOUNT: ${penalty['amount']:,.2f}
DUE DATE: {penalty['due_date']}

This penalty has been issued under the NDIS Fraud Prevention
and Integrity Framework. You have 30 days to either:
  1. Pay the penalty in full
  2. Lodge a formal dispute with supporting evidence

Failure to respond by the due date will result in the penalty
being escalated and may affect your NDIS registration status.

NDIS Integrity Unit
enforcement@ndis-integrity.gov.au
"""

        if self.email_config["enabled"]:
            try:
                msg = MIMEMultipart()
                msg["From"] = f"{self.email_config['sender_name']} <{self.email_config['sender_email']}>"
                msg["To"] = penalty["provider_email"]
                msg["Subject"] = f"NDIS Penalty Notice - {penalty['id']} - ${penalty['amount']:,.2f}"
                msg.attach(MIMEText(email_body, "plain"))

                with smtplib.SMTP(self.email_config["smtp_host"], self.email_config["smtp_port"]) as server:
                    server.starttls()
                    server.send_message(msg)

                penalty["email_sent"] = True
                penalty["email_sent_at"] = datetime.now().isoformat()
                penalty["status"] = "sent"
                return {"success": True, "message": "Email sent successfully"}
            except Exception as e:
                return {"success": False, "error": str(e)}
        else:
            # Simulate email send
            penalty["email_sent"] = True
            penalty["email_sent_at"] = datetime.now().isoformat()
            penalty["status"] = "sent"
            return {"success": True, "message": "Email simulated (SMTP not configured)", "email_body": email_body}

    def send_all_pending_emails(self):
        """Send emails for all pending penalties."""
        results = []
        for penalty in self.penalties:
            if penalty["status"] == "pending" and not penalty["email_sent"]:
                result = self.send_penalty_email(penalty["id"])
                results.append({"penalty_id": penalty["id"], **result})
        return results

    def update_penalty_status(self, penalty_id: str, status: str, notes: str = ""):
        penalty = next((p for p in self.penalties if p["id"] == penalty_id), None)
        if not penalty:
            return None
        penalty["status"] = status
        if notes:
            penalty["notes"] = notes
        if status == "paid":
            penalty["payment_date"] = datetime.now().isoformat()
        return penalty

    def get_penalties(self, provider_id=None, status=None, limit=100, offset=0):
        filtered = self.penalties
        if provider_id:
            filtered = [p for p in filtered if p["provider_id"] == provider_id]
        if status:
            filtered = [p for p in filtered if p["status"] == status]
        return {
            "total": len(filtered),
            "penalties": filtered[offset:offset + limit],
        }

    def get_financial_summary(self):
        """Compute financial tracking summary."""
        total_issued = sum(p["amount"] for p in self.penalties)
        total_paid = sum(p["amount"] for p in self.penalties if p["status"] == "paid")
        total_pending = sum(p["amount"] for p in self.penalties if p["status"] in ("pending", "sent"))
        total_disputed = sum(p["amount"] for p in self.penalties if p["status"] == "disputed")
        total_overdue = sum(p["amount"] for p in self.penalties if p["status"] == "overdue")

        # Fraud value = sum of all claim amounts from flagged providers
        # This gets set externally
        fraud_value = getattr(self, "_fraud_detected_value", 0)

        return {
            "total_fraud_detected_value": round(fraud_value, 2),
            "total_penalties_issued": round(total_issued, 2),
            "total_penalties_paid": round(total_paid, 2),
            "total_penalties_pending": round(total_pending, 2),
            "total_penalties_disputed": round(total_disputed, 2),
            "total_penalties_overdue": round(total_overdue, 2),
            "total_savings_recovered": round(total_paid + fraud_value * 0.1, 2),  # Estimated savings
            "penalty_count": len(self.penalties),
            "penalties_paid_count": len([p for p in self.penalties if p["status"] == "paid"]),
            "penalties_pending_count": len([p for p in self.penalties if p["status"] in ("pending", "sent")]),
            "penalties_disputed_count": len([p for p in self.penalties if p["status"] == "disputed"]),
            "collection_rate": round(total_paid / total_issued * 100, 1) if total_issued > 0 else 0,
        }

    def get_financial_by_category(self):
        """Financial breakdown by fraud category."""
        categories = defaultdict(lambda: {"count": 0, "total_amount": 0, "paid": 0, "pending": 0})
        for p in self.penalties:
            cat = p.get("category", "Other")
            categories[cat]["count"] += 1
            categories[cat]["total_amount"] += p["amount"]
            if p["status"] == "paid":
                categories[cat]["paid"] += p["amount"]
            elif p["status"] in ("pending", "sent"):
                categories[cat]["pending"] += p["amount"]

        return {k: {kk: round(vv, 2) if isinstance(vv, float) else vv for kk, vv in v.items()}
                for k, v in categories.items()}

    def get_financial_timeline(self):
        """Monthly penalty issuance timeline."""
        monthly = defaultdict(lambda: {"issued": 0, "amount": 0, "paid": 0})
        for p in self.penalties:
            month = p["issued_at"][:7]
            monthly[month]["issued"] += 1
            monthly[month]["amount"] += p["amount"]
            if p["status"] == "paid":
                monthly[month]["paid"] += p["amount"]

        return [{"month": k, **{kk: round(vv, 2) if isinstance(vv, float) else vv for kk, vv in v.items()}}
                for k, v in sorted(monthly.items())]

    def get_provider_penalty_summary(self):
        """Penalty summary per provider."""
        providers = defaultdict(lambda: {"count": 0, "total_amount": 0, "paid": 0, "statuses": []})
        for p in self.penalties:
            pid = p["provider_id"]
            providers[pid]["provider_name"] = p["provider_name"]
            providers[pid]["count"] += 1
            providers[pid]["total_amount"] += p["amount"]
            if p["status"] == "paid":
                providers[pid]["paid"] += p["amount"]
            providers[pid]["statuses"].append(p["status"])

        result = []
        for pid, data in providers.items():
            result.append({
                "provider_id": pid,
                "provider_name": data["provider_name"],
                "penalty_count": data["count"],
                "total_amount": round(data["total_amount"], 2),
                "paid_amount": round(data["paid"], 2),
                "outstanding": round(data["total_amount"] - data["paid"], 2),
                "statuses": list(set(data["statuses"])),
            })
        result.sort(key=lambda x: x["total_amount"], reverse=True)
        return result
