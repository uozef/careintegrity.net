"""
Synthetic NDIS data generator.
Generates realistic providers, participants, workers, claims, and locations
with embedded fraud patterns for testing the detection engines.
"""
import random
import json
import math
import hashlib
from datetime import date, timedelta, datetime
from pathlib import Path

random.seed(42)

FIRST_NAMES = [
    "James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda",
    "David", "Elizabeth", "William", "Barbara", "Richard", "Susan", "Joseph", "Jessica",
    "Thomas", "Sarah", "Christopher", "Karen", "Daniel", "Lisa", "Matthew", "Nancy",
    "Anthony", "Betty", "Mark", "Margaret", "Donald", "Sandra", "Steven", "Ashley",
    "Paul", "Dorothy", "Andrew", "Kimberly", "Joshua", "Emily", "Kenneth", "Donna",
    "Kevin", "Michelle", "Brian", "Carol", "George", "Amanda", "Timothy", "Melissa",
    "Ronald", "Deborah", "Edward", "Stephanie", "Jason", "Rebecca", "Jeffrey", "Sharon",
    "Ryan", "Laura", "Jacob", "Cynthia", "Gary", "Kathleen", "Nicholas", "Amy",
    "Eric", "Angela", "Jonathan", "Shirley", "Stephen", "Anna", "Larry", "Brenda",
    "Justin", "Pamela", "Scott", "Emma", "Brandon", "Nicole", "Benjamin", "Helen",
]

LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
    "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
    "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker",
    "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
    "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell",
    "Carter", "Roberts", "Chen", "Patel", "Kumar", "Singh", "Wang", "Li", "Zhang",
]

STREETS = [
    "Main St", "High St", "Park Ave", "Oak Rd", "Cedar Ln", "Elm St", "Maple Dr",
    "Pine St", "Lake Ave", "Hill Rd", "River St", "Church St", "Mill Rd", "School Ln",
    "Garden Ave", "Station Rd", "Victoria St", "King St", "Queen St", "George St",
    "Bridge Rd", "Chapel St", "North Rd", "South St", "East Ave", "West Rd",
]

SUBURBS_SYDNEY = [
    ("Parramatta", -33.8151, 151.0011), ("Liverpool", -33.9200, 150.9238),
    ("Bankstown", -33.9175, 151.0353), ("Blacktown", -33.7688, 150.9063),
    ("Penrith", -33.7507, 150.6877), ("Campbelltown", -34.0650, 150.8142),
    ("Fairfield", -33.8722, 150.9564), ("Auburn", -33.8492, 151.0330),
    ("Cabramatta", -33.8948, 150.9356), ("Merrylands", -33.8364, 150.9928),
    ("Granville", -33.8321, 151.0120), ("Hurstville", -33.9673, 151.1023),
    ("Strathfield", -33.8796, 151.0846), ("Burwood", -33.8773, 151.1043),
    ("Lakemba", -33.9196, 151.0753), ("Canterbury", -33.9117, 151.1180),
    ("Ryde", -33.8152, 151.1024), ("Hornsby", -33.7025, 151.0990),
    ("Chatswood", -33.7969, 151.1831), ("Sutherland", -34.0311, 151.0556),
]

SERVICE_TYPES = [
    "SIL", "Core Support", "Capacity Building", "Transport",
    "Therapy - OT", "Therapy - Psychology", "Therapy - Speech",
    "Community Access", "Personal Care", "Domestic Assistance",
    "Plan Management", "Support Coordination",
]

DISABILITY_TYPES = [
    "Intellectual", "Physical", "Psychosocial", "Autism",
    "Neurological", "Sensory", "Multiple",
]

PROVIDER_PREFIXES = [
    "Care", "Support", "Allied", "Community", "National", "Metro",
    "Premier", "Guardian", "Aspire", "Enable", "Nexus", "Thrive",
    "Empower", "Unity", "Inclusive", "Access", "Ability", "Life",
]

PROVIDER_SUFFIXES = [
    "Services", "Solutions", "Care", "Health", "Support", "Group",
    "Partners", "Alliance", "Connect", "Plus", "Hub", "Network",
]


def gen_id(prefix: str, idx: int) -> str:
    return f"{prefix}-{idx:04d}"


def gen_abn() -> str:
    return f"{random.randint(10,99)} {random.randint(100,999)} {random.randint(100,999)} {random.randint(100,999)}"


def gen_name() -> str:
    return f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"


def gen_address(suburb_data) -> tuple:
    suburb, lat, lng = random.choice(suburb_data)
    num = random.randint(1, 200)
    street = random.choice(STREETS)
    lat_jitter = random.uniform(-0.01, 0.01)
    lng_jitter = random.uniform(-0.01, 0.01)
    return f"{num} {street}, {suburb} NSW 2000", lat + lat_jitter, lng + lng_jitter


def haversine_km(lat1, lng1, lat2, lng2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
    return R * 2 * math.asin(math.sqrt(a))


def generate_data(
    num_providers=60,
    num_participants=300,
    num_workers=150,
    num_locations=40,
    num_months=12,
    fraud_provider_ratio=0.2,
):
    base_date = date(2025, 1, 1)

    # --- Providers ---
    providers = []
    fraud_provider_ids = set()
    for i in range(num_providers):
        addr, lat, lng = gen_address(SUBURBS_SYDNEY)
        is_fraud = i < int(num_providers * fraud_provider_ratio)
        pid = gen_id("PRV", i)
        if is_fraud:
            fraud_provider_ids.add(pid)

        num_services = random.randint(1, 5) if not is_fraud else random.randint(3, 8)
        services = random.sample(SERVICE_TYPES, min(num_services, len(SERVICE_TYPES)))

        providers.append({
            "id": pid,
            "name": f"{random.choice(PROVIDER_PREFIXES)} {random.choice(PROVIDER_SUFFIXES)}",
            "abn": gen_abn(),
            "registration_date": str(base_date - timedelta(days=random.randint(180, 1800))),
            "service_types": services,
            "address": addr,
            "lat": lat,
            "lng": lng,
            "risk_score": 0.0,
            "status": "active",
            "_is_fraud": is_fraud,
        })

    # --- Participants ---
    participants = []
    for i in range(num_participants):
        addr, lat, lng = gen_address(SUBURBS_SYDNEY)
        needs = random.choice(["low", "medium", "high", "very_high"])
        budget_map = {"low": 25000, "medium": 60000, "high": 120000, "very_high": 250000}
        hours_map = {"low": 8, "medium": 18, "high": 35, "very_high": 60}
        participants.append({
            "id": gen_id("PRT", i),
            "name": gen_name(),
            "ndis_number": f"4{random.randint(10000000, 99999999)}",
            "plan_start": str(base_date),
            "plan_end": str(base_date + timedelta(days=365)),
            "total_budget": budget_map[needs] + random.randint(-5000, 10000),
            "allocated_hours_weekly": hours_map[needs] + random.randint(-2, 5),
            "address": addr,
            "lat": lat,
            "lng": lng,
            "disability_type": random.choice(DISABILITY_TYPES),
            "support_needs_level": needs,
        })

    # --- Workers ---
    workers = []
    roles = ["support_worker"] * 80 + ["allied_health"] * 30 + ["therapist"] * 25 + ["nurse"] * 15
    for i in range(num_workers):
        addr, lat, lng = gen_address(SUBURBS_SYDNEY)
        role = random.choice(roles)
        # Assign to 1-3 providers; fraud workers assigned to fraud provider clusters
        if i < 20:
            # Some workers shared across fraud providers (collusion signal)
            assigned = random.sample(
                [p["id"] for p in providers if p["_is_fraud"]],
                min(random.randint(2, 4), len(fraud_provider_ids))
            )
        else:
            assigned = random.sample(
                [p["id"] for p in providers],
                random.randint(1, 2)
            )
        workers.append({
            "id": gen_id("WRK", i),
            "name": gen_name(),
            "role": role,
            "providers": assigned,
            "qualifications": [role.replace("_", " ").title()],
            "max_weekly_hours": 38.0,
            "address": addr,
            "lat": lat,
            "lng": lng,
        })

    # --- Locations ---
    locations = []
    for i in range(num_locations):
        addr, lat, lng = gen_address(SUBURBS_SYDNEY)
        loc_type = random.choice(["sil_house", "office", "community", "home"])
        # Some locations shared across fraud providers
        if i < 8:
            assoc = random.sample(
                [p["id"] for p in providers if p["_is_fraud"]],
                min(random.randint(2, 4), len(fraud_provider_ids))
            )
        else:
            assoc = [random.choice([p["id"] for p in providers])]
        locations.append({
            "id": gen_id("LOC", i),
            "address": addr,
            "lat": lat,
            "lng": lng,
            "location_type": loc_type,
            "associated_providers": assoc,
        })

    # --- Claims ---
    claims = []
    claim_idx = 0
    provider_participant_map = {}

    # Assign participants to providers
    for part in participants:
        num_provs = random.randint(1, 3)
        assigned_provs = random.sample([p["id"] for p in providers], num_provs)
        for prov_id in assigned_provs:
            provider_participant_map.setdefault(prov_id, []).append(part["id"])

    provider_lookup = {p["id"]: p for p in providers}
    participant_lookup = {p["id"]: p for p in participants}
    worker_lookup = {w["id"]: w for w in workers}

    for month_offset in range(num_months):
        month_start = base_date + timedelta(days=month_offset * 30)

        for prov in providers:
            prov_id = prov["id"]
            is_fraud = prov["_is_fraud"]
            part_ids = provider_participant_map.get(prov_id, [])

            # Fraud providers: grow participant base over time (impossible acceleration)
            if is_fraud and month_offset > 3:
                extra = random.sample(
                    [p["id"] for p in participants if p["id"] not in part_ids],
                    min(random.randint(5, 15), len(participants) - len(part_ids))
                )
                part_ids = part_ids + extra
                provider_participant_map[prov_id] = part_ids

            eligible_workers = [w for w in workers if prov_id in w["providers"]]
            if not eligible_workers:
                eligible_workers = [random.choice(workers)]

            for part_id in part_ids:
                part = participant_lookup[part_id]
                # Normal: 2-5 sessions/month, Fraud: 8-20 sessions/month
                num_sessions = random.randint(2, 5) if not is_fraud else random.randint(8, 20)

                for _ in range(num_sessions):
                    worker = random.choice(eligible_workers)
                    service = random.choice(prov["service_types"])
                    day_offset = random.randint(0, 29)
                    claim_date = month_start + timedelta(days=day_offset)

                    # Normal hours: 1-4, Fraud: 3-10
                    hours = round(random.uniform(1, 4), 1) if not is_fraud else round(random.uniform(3, 10), 1)

                    # Time of day
                    if is_fraud:
                        start_hour = random.choice([0, 1, 2, 3, 4, 5, 22, 23])  # unusual hours
                    else:
                        start_hour = random.randint(7, 17)

                    start_time = f"{start_hour:02d}:{random.choice(['00','15','30','45'])}"
                    end_hour = min(23, start_hour + int(hours))
                    end_mins = int((hours % 1) * 60)
                    end_time = f"{end_hour:02d}:{end_mins:02d}"

                    rate = round(random.uniform(50, 75), 2) if not is_fraud else round(random.uniform(65, 120), 2)

                    # Location: fraud providers sometimes claim impossible distances
                    if is_fraud and random.random() < 0.3:
                        far_suburb = random.choice(SUBURBS_SYDNEY)
                        clat, clng = far_suburb[1] + random.uniform(-0.5, 0.5), far_suburb[2] + random.uniform(-0.5, 0.5)
                    else:
                        clat = part["lat"] + random.uniform(-0.005, 0.005)
                        clng = part["lng"] + random.uniform(-0.005, 0.005)

                    claims.append({
                        "id": gen_id("CLM", claim_idx),
                        "provider_id": prov_id,
                        "participant_id": part_id,
                        "worker_id": worker["id"],
                        "service_type": service,
                        "date": str(claim_date),
                        "start_time": start_time,
                        "end_time": end_time,
                        "hours": hours,
                        "rate_per_hour": rate,
                        "total_amount": round(hours * rate, 2),
                        "location_lat": round(clat, 6),
                        "location_lng": round(clng, 6),
                        "status": "submitted",
                    })
                    claim_idx += 1

    # Remove internal fraud flag from providers before output
    for p in providers:
        del p["_is_fraud"]

    return {
        "providers": providers,
        "participants": participants,
        "workers": workers,
        "locations": locations,
        "claims": claims,
        "fraud_provider_ids": list(fraud_provider_ids),
        "metadata": {
            "generated_at": datetime.now().isoformat(),
            "num_providers": len(providers),
            "num_participants": len(participants),
            "num_workers": len(workers),
            "num_locations": len(locations),
            "num_claims": len(claims),
        }
    }


def save_data(output_dir: str = "data"):
    path = Path(output_dir)
    path.mkdir(exist_ok=True)
    data = generate_data()
    for key in ["providers", "participants", "workers", "locations", "claims", "fraud_provider_ids", "metadata"]:
        with open(path / f"{key}.json", "w") as f:
            json.dump(data[key], f, indent=2, default=str)
    print(f"Generated {data['metadata']['num_claims']} claims across {data['metadata']['num_providers']} providers")
    return data


if __name__ == "__main__":
    save_data()
