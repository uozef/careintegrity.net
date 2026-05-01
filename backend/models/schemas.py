from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date


class Provider(BaseModel):
    id: str
    name: str
    abn: str
    registration_date: date
    service_types: list[str]
    address: str
    lat: float
    lng: float
    risk_score: float = 0.0
    status: str = "active"


class Participant(BaseModel):
    id: str
    name: str
    ndis_number: str
    plan_start: date
    plan_end: date
    total_budget: float
    allocated_hours_weekly: float
    address: str
    lat: float
    lng: float
    disability_type: str
    support_needs_level: str  # low, medium, high, very_high


class Worker(BaseModel):
    id: str
    name: str
    role: str  # support_worker, allied_health, therapist, nurse
    providers: list[str]  # provider IDs
    qualifications: list[str]
    max_weekly_hours: float = 38.0
    address: str
    lat: float
    lng: float


class Claim(BaseModel):
    id: str
    provider_id: str
    participant_id: str
    worker_id: str
    service_type: str
    date: date
    start_time: str  # HH:MM
    end_time: str  # HH:MM
    hours: float
    rate_per_hour: float
    total_amount: float
    location_lat: float
    location_lng: float
    status: str = "submitted"


class Location(BaseModel):
    id: str
    address: str
    lat: float
    lng: float
    location_type: str  # sil_house, office, community, home
    associated_providers: list[str]


class FraudAlert(BaseModel):
    id: str
    alert_type: str
    severity: str  # low, medium, high, critical
    title: str
    description: str
    entities_involved: list[dict]
    fraud_signals: list[str]
    confidence: float
    detected_at: datetime
    status: str = "open"


class ProviderFingerprint(BaseModel):
    provider_id: str
    period: str  # YYYY-MM
    avg_hours_per_participant: float
    avg_session_duration: float
    participant_count: int
    worker_count: int
    service_mix: dict[str, float]
    peak_billing_hour: int
    weekend_ratio: float
    growth_rate: float
    geographic_spread: float
    embedding: list[float] = []


class NetworkEdge(BaseModel):
    source_id: str
    source_type: str
    target_id: str
    target_type: str
    relationship: str
    weight: float
    metadata: dict = {}


class InvoicePressureResult(BaseModel):
    claim_id: str
    fraud_likelihood: float
    deviation_score: float
    network_risk: float
    behavioural_drift: float
    flags: list[str]
