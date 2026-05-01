"""
Custom Rule Engine
Allows admins to define fraud detection rules with conditions and actions.
Rules are evaluated against claims and provider data to generate alerts.
"""
import uuid
from datetime import datetime
from collections import defaultdict


DEFAULT_RULES = [
    {
        "id": "RULE-001",
        "name": "High hourly rate",
        "description": "Flag claims where rate exceeds threshold for the service type",
        "category": "Billing",
        "enabled": True,
        "priority": 1,
        "conditions": [
            {"field": "rate_per_hour", "operator": ">", "value": 95}
        ],
        "logic": "ALL",
        "action": "flag",
        "severity": "medium",
        "created_at": "2025-01-01T00:00:00",
    },
    {
        "id": "RULE-002",
        "name": "Excessive session duration",
        "description": "Flag claims longer than 8 hours in a single session",
        "category": "Time",
        "enabled": True,
        "priority": 1,
        "conditions": [
            {"field": "hours", "operator": ">", "value": 8}
        ],
        "logic": "ALL",
        "action": "flag",
        "severity": "high",
        "created_at": "2025-01-01T00:00:00",
    },
    {
        "id": "RULE-003",
        "name": "After-hours billing",
        "description": "Flag sessions starting between midnight and 5 AM",
        "category": "Time",
        "enabled": True,
        "priority": 2,
        "conditions": [
            {"field": "start_hour", "operator": "<", "value": 5}
        ],
        "logic": "ALL",
        "action": "flag",
        "severity": "medium",
        "created_at": "2025-01-01T00:00:00",
    },
    {
        "id": "RULE-004",
        "name": "High value claim",
        "description": "Flag any single claim exceeding $800",
        "category": "Billing",
        "enabled": True,
        "priority": 1,
        "conditions": [
            {"field": "total_amount", "operator": ">", "value": 800}
        ],
        "logic": "ALL",
        "action": "flag",
        "severity": "high",
        "created_at": "2025-01-01T00:00:00",
    },
    {
        "id": "RULE-005",
        "name": "Weekend + high hours",
        "description": "Flag weekend claims over 6 hours — potential ghost billing",
        "category": "Pattern",
        "enabled": True,
        "priority": 2,
        "conditions": [
            {"field": "is_weekend", "operator": "==", "value": True},
            {"field": "hours", "operator": ">", "value": 6}
        ],
        "logic": "ALL",
        "action": "flag",
        "severity": "high",
        "created_at": "2025-01-01T00:00:00",
    },
    {
        "id": "RULE-006",
        "name": "Late night high-value",
        "description": "Flag claims after 10 PM with amount over $500",
        "category": "Pattern",
        "enabled": True,
        "priority": 1,
        "conditions": [
            {"field": "start_hour", "operator": ">=", "value": 22},
            {"field": "total_amount", "operator": ">", "value": 500}
        ],
        "logic": "ALL",
        "action": "alert",
        "severity": "critical",
        "created_at": "2025-01-01T00:00:00",
    },
    {
        "id": "RULE-007",
        "name": "Suspiciously round hours",
        "description": "Flag claims with exactly round hours (8.0, 10.0, 12.0) and high amount",
        "category": "Pattern",
        "enabled": True,
        "priority": 3,
        "conditions": [
            {"field": "hours_is_round", "operator": "==", "value": True},
            {"field": "hours", "operator": ">=", "value": 6},
            {"field": "total_amount", "operator": ">", "value": 400}
        ],
        "logic": "ALL",
        "action": "flag",
        "severity": "medium",
        "created_at": "2025-01-01T00:00:00",
    },
]

OPERATORS = {
    ">": lambda a, b: a > b,
    ">=": lambda a, b: a >= b,
    "<": lambda a, b: a < b,
    "<=": lambda a, b: a <= b,
    "==": lambda a, b: a == b,
    "!=": lambda a, b: a != b,
    "contains": lambda a, b: b in str(a),
}

AVAILABLE_FIELDS = [
    {"field": "hours", "label": "Session Hours", "type": "number"},
    {"field": "rate_per_hour", "label": "Rate per Hour ($)", "type": "number"},
    {"field": "total_amount", "label": "Total Claim Amount ($)", "type": "number"},
    {"field": "start_hour", "label": "Start Hour (0-23)", "type": "number"},
    {"field": "end_hour", "label": "End Hour (0-23)", "type": "number"},
    {"field": "is_weekend", "label": "Is Weekend", "type": "boolean"},
    {"field": "hours_is_round", "label": "Hours is Round Number", "type": "boolean"},
    {"field": "service_type", "label": "Service Type", "type": "string"},
    {"field": "provider_id", "label": "Provider ID", "type": "string"},
    {"field": "worker_id", "label": "Worker ID", "type": "string"},
]


class RuleEngine:
    def __init__(self):
        self.rules = {r["id"]: r for r in DEFAULT_RULES}
        self.rule_results = []
        self.rule_stats = {}

    def get_rules(self):
        return list(self.rules.values())

    def get_rule(self, rule_id):
        return self.rules.get(rule_id)

    def create_rule(self, rule_data):
        rule_id = f"RULE-{uuid.uuid4().hex[:6].upper()}"
        rule = {
            "id": rule_id,
            "name": rule_data["name"],
            "description": rule_data.get("description", ""),
            "category": rule_data.get("category", "Custom"),
            "enabled": rule_data.get("enabled", True),
            "priority": rule_data.get("priority", 2),
            "conditions": rule_data.get("conditions", []),
            "logic": rule_data.get("logic", "ALL"),
            "action": rule_data.get("action", "flag"),
            "severity": rule_data.get("severity", "medium"),
            "created_at": datetime.now().isoformat(),
        }
        self.rules[rule_id] = rule
        return rule

    def update_rule(self, rule_id, updates):
        if rule_id not in self.rules:
            return None
        self.rules[rule_id].update(updates)
        return self.rules[rule_id]

    def delete_rule(self, rule_id):
        if rule_id in self.rules:
            del self.rules[rule_id]
            return True
        return False

    def toggle_rule(self, rule_id):
        if rule_id not in self.rules:
            return None
        self.rules[rule_id]["enabled"] = not self.rules[rule_id]["enabled"]
        return self.rules[rule_id]

    def _extract_field(self, claim, field):
        """Extract a field value from a claim, including computed fields."""
        if field == "start_hour":
            try:
                return int(claim["start_time"].split(":")[0])
            except (ValueError, IndexError):
                return 0
        elif field == "end_hour":
            try:
                return int(claim["end_time"].split(":")[0])
            except (ValueError, IndexError):
                return 0
        elif field == "is_weekend":
            from datetime import datetime as dt
            try:
                return dt.strptime(claim["date"], "%Y-%m-%d").weekday() >= 5
            except (ValueError, KeyError):
                return False
        elif field == "hours_is_round":
            return claim.get("hours", 0) == int(claim.get("hours", 0)) and claim.get("hours", 0) >= 1
        else:
            return claim.get(field)

    def evaluate_claim(self, claim):
        """Evaluate all enabled rules against a single claim."""
        matches = []
        for rule in self.rules.values():
            if not rule["enabled"]:
                continue
            conditions = rule["conditions"]
            if not conditions:
                continue

            results = []
            for cond in conditions:
                field_val = self._extract_field(claim, cond["field"])
                op_func = OPERATORS.get(cond["operator"])
                if field_val is not None and op_func:
                    try:
                        results.append(op_func(field_val, cond["value"]))
                    except (TypeError, ValueError):
                        results.append(False)
                else:
                    results.append(False)

            if rule["logic"] == "ALL":
                matched = all(results)
            else:  # ANY
                matched = any(results)

            if matched:
                matches.append(rule)

        return matches

    def evaluate_all_claims(self, claims, sample_size=10000):
        """Evaluate rules against all claims and produce results."""
        self.rule_results = []
        self.rule_stats = defaultdict(lambda: {"matches": 0, "total_amount": 0, "claims": []})

        # Sample for performance
        eval_claims = claims if len(claims) <= sample_size else [
            claims[i] for i in range(0, len(claims), max(1, len(claims) // sample_size))
        ]

        for claim in eval_claims:
            matched_rules = self.evaluate_claim(claim)
            for rule in matched_rules:
                self.rule_stats[rule["id"]]["matches"] += 1
                self.rule_stats[rule["id"]]["total_amount"] += claim.get("total_amount", 0)
                if len(self.rule_stats[rule["id"]]["claims"]) < 5:
                    self.rule_stats[rule["id"]]["claims"].append({
                        "claim_id": claim["id"],
                        "provider_id": claim["provider_id"],
                        "amount": claim["total_amount"],
                        "hours": claim["hours"],
                        "date": claim["date"],
                    })

                self.rule_results.append({
                    "rule_id": rule["id"],
                    "rule_name": rule["name"],
                    "severity": rule["severity"],
                    "claim_id": claim["id"],
                    "provider_id": claim["provider_id"],
                    "participant_id": claim["participant_id"],
                    "amount": claim["total_amount"],
                    "hours": claim["hours"],
                    "date": claim["date"],
                })

        return {
            "total_evaluated": len(eval_claims),
            "total_matches": len(self.rule_results),
            "rules_triggered": len(self.rule_stats),
        }

    def get_results(self, rule_id=None, limit=100, offset=0):
        results = self.rule_results
        if rule_id:
            results = [r for r in results if r["rule_id"] == rule_id]
        return {
            "total": len(results),
            "results": results[offset:offset + limit],
        }

    def get_stats(self):
        stats = []
        for rule_id, rule in self.rules.items():
            s = self.rule_stats.get(rule_id, {"matches": 0, "total_amount": 0, "claims": []})
            stats.append({
                "rule_id": rule_id,
                "rule_name": rule["name"],
                "category": rule["category"],
                "severity": rule["severity"],
                "enabled": rule["enabled"],
                "matches": s["matches"],
                "total_amount": round(s["total_amount"], 2),
                "sample_claims": s["claims"],
            })
        stats.sort(key=lambda x: x["matches"], reverse=True)
        return stats

    def get_available_fields(self):
        return AVAILABLE_FIELDS
