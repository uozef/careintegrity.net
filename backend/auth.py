"""
Admin authentication & role-based access control system.
Roles: admin, fraud_officer, investigator, inspector, analyst, viewer
"""
import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

SECRET_KEY = os.getenv("JWT_SECRET", "ndis-fraud-detection-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480  # 8 hours

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

# Role definitions with permissions
ROLES = {
    "admin": {
        "label": "System Administrator",
        "description": "Full system access — user management, configuration, all operations",
        "permissions": [
            "dashboard.view", "alerts.view", "alerts.manage",
            "providers.view", "providers.analyse",
            "participants.view", "participants.analyse",
            "workers.view", "workers.analyse",
            "graph.view", "graph.analyse",
            "penalties.view", "penalties.issue", "penalties.manage", "penalties.approve",
            "fines.view", "fines.manage",
            "invoices.view", "invoices.reject", "invoices.approve",
            "rules.view", "rules.manage",
            "investigation.view", "investigation.conduct",
            "inspection.view", "inspection.conduct",
            "enforcement.view", "enforcement.issue",
            "financial.view", "financial.manage",
            "users.view", "users.manage",
            "settings.manage",
        ],
    },
    "fraud_officer": {
        "label": "Fraud Officer",
        "description": "Detection, investigation, penalty issuance, invoice rejection, enforcement",
        "permissions": [
            "dashboard.view", "alerts.view", "alerts.manage",
            "providers.view", "providers.analyse",
            "participants.view", "participants.analyse",
            "workers.view", "workers.analyse",
            "graph.view", "graph.analyse",
            "penalties.view", "penalties.issue", "penalties.approve",
            "fines.view",
            "invoices.view", "invoices.reject",
            "rules.view", "rules.manage",
            "investigation.view", "investigation.conduct",
            "inspection.view", "inspection.conduct",
            "enforcement.view", "enforcement.issue",
            "financial.view",
        ],
    },
    "investigator": {
        "label": "Investigator",
        "description": "Conduct investigations, analyse entities, view evidence, recommend actions",
        "permissions": [
            "dashboard.view", "alerts.view",
            "providers.view", "providers.analyse",
            "participants.view", "participants.analyse",
            "workers.view", "workers.analyse",
            "graph.view", "graph.analyse",
            "penalties.view",
            "fines.view",
            "invoices.view",
            "rules.view",
            "investigation.view", "investigation.conduct",
            "financial.view",
        ],
    },
    "inspector": {
        "label": "Inspector",
        "description": "Conduct inspections, review provider compliance, flag issues",
        "permissions": [
            "dashboard.view", "alerts.view",
            "providers.view", "providers.analyse",
            "participants.view",
            "workers.view",
            "graph.view",
            "invoices.view",
            "inspection.view", "inspection.conduct",
            "investigation.view",
            "financial.view",
        ],
    },
    "analyst": {
        "label": "Data Analyst",
        "description": "View dashboards, run analyses, generate reports — no enforcement actions",
        "permissions": [
            "dashboard.view", "alerts.view",
            "providers.view", "providers.analyse",
            "participants.view", "participants.analyse",
            "workers.view", "workers.analyse",
            "graph.view", "graph.analyse",
            "fines.view",
            "invoices.view",
            "rules.view",
            "investigation.view",
            "financial.view",
        ],
    },
    "viewer": {
        "label": "Read-Only Viewer",
        "description": "View-only access to dashboards and reports — no actions permitted",
        "permissions": [
            "dashboard.view",
            "alerts.view",
            "providers.view",
            "participants.view",
            "workers.view",
            "graph.view",
            "financial.view",
        ],
    },
}

# In-memory user store
USERS_DB = {
    "admin": {
        "username": "admin",
        "full_name": "NDIS Administrator",
        "email": "admin@ndis-integrity.gov.au",
        "hashed_password": pwd_context.hash("NDISAdmin2025!"),
        "role": "admin",
        "disabled": False,
        "created_at": "2025-01-01T00:00:00",
        "last_login": None,
    },
    "sarah.chen": {
        "username": "sarah.chen",
        "full_name": "Sarah Chen",
        "email": "sarah.chen@ndis-integrity.gov.au",
        "hashed_password": pwd_context.hash("FraudOfficer1!"),
        "role": "fraud_officer",
        "disabled": False,
        "created_at": "2025-02-15T00:00:00",
        "last_login": None,
    },
    "james.wilson": {
        "username": "james.wilson",
        "full_name": "James Wilson",
        "email": "james.wilson@ndis-integrity.gov.au",
        "hashed_password": pwd_context.hash("Investigator1!"),
        "role": "investigator",
        "disabled": False,
        "created_at": "2025-03-01T00:00:00",
        "last_login": None,
    },
    "emma.taylor": {
        "username": "emma.taylor",
        "full_name": "Emma Taylor",
        "email": "emma.taylor@ndis-integrity.gov.au",
        "hashed_password": pwd_context.hash("Inspector1!"),
        "role": "inspector",
        "disabled": False,
        "created_at": "2025-03-10T00:00:00",
        "last_login": None,
    },
    "david.patel": {
        "username": "david.patel",
        "full_name": "David Patel",
        "email": "david.patel@ndis-integrity.gov.au",
        "hashed_password": pwd_context.hash("Analyst1!"),
        "role": "analyst",
        "disabled": False,
        "created_at": "2025-04-01T00:00:00",
        "last_login": None,
    },
}

# Audit log
AUDIT_LOG = []


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: Optional[str] = None


class User(BaseModel):
    username: str
    full_name: str
    email: str
    role: str
    disabled: bool = False


class UserInDB(User):
    hashed_password: str


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_user(username: str):
    if username in USERS_DB:
        return UserInDB(**{k: v for k, v in USERS_DB[username].items() if k in UserInDB.model_fields})
    return None


def authenticate_user(username: str, password: str):
    user = get_user(username)
    if not user or not verify_password(password, user.hashed_password):
        return None
    USERS_DB[username]["last_login"] = datetime.now().isoformat()
    return user


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(token: Optional[str] = Depends(oauth2_scheme)):
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = get_user(username)
    if user is None or user.disabled:
        raise HTTPException(status_code=401, detail="User not found or disabled")
    return user


def check_permission(user: User, permission: str):
    """Check if user has a specific permission."""
    role_def = ROLES.get(user.role, {})
    if permission not in role_def.get("permissions", []):
        raise HTTPException(status_code=403, detail=f"Permission denied: {permission} not allowed for role {user.role}")
    return True


def get_user_permissions(role: str):
    return ROLES.get(role, {}).get("permissions", [])


def change_password(username: str, new_password: str):
    if username in USERS_DB:
        USERS_DB[username]["hashed_password"] = pwd_context.hash(new_password)
        return True
    return False


def create_user(username: str, password: str, full_name: str, email: str, role: str = "analyst"):
    if username in USERS_DB:
        return None
    if role not in ROLES:
        return None
    USERS_DB[username] = {
        "username": username,
        "full_name": full_name,
        "email": email,
        "hashed_password": pwd_context.hash(password),
        "role": role,
        "disabled": False,
        "created_at": datetime.now().isoformat(),
        "last_login": None,
    }
    return get_user_info(username)


def update_user(username: str, updates: dict):
    if username not in USERS_DB:
        return None
    for k, v in updates.items():
        if k in ("role", "full_name", "email", "disabled"):
            USERS_DB[username][k] = v
        if k == "password":
            USERS_DB[username]["hashed_password"] = pwd_context.hash(v)
    return get_user_info(username)


def delete_user(username: str):
    if username in USERS_DB and username != "admin":
        del USERS_DB[username]
        return True
    return False


def get_user_info(username: str):
    u = USERS_DB.get(username)
    if not u:
        return None
    role_def = ROLES.get(u["role"], {})
    return {
        "username": u["username"],
        "full_name": u["full_name"],
        "email": u["email"],
        "role": u["role"],
        "role_label": role_def.get("label", u["role"]),
        "disabled": u["disabled"],
        "created_at": u.get("created_at"),
        "last_login": u.get("last_login"),
        "permissions": role_def.get("permissions", []),
    }


def get_all_users():
    return [get_user_info(u) for u in USERS_DB]


def log_audit(username: str, action: str, target: str, details: str = ""):
    AUDIT_LOG.append({
        "timestamp": datetime.now().isoformat(),
        "username": username,
        "action": action,
        "target": target,
        "details": details,
    })
    if len(AUDIT_LOG) > 1000:
        AUDIT_LOG.pop(0)


def get_audit_log(limit=100):
    return list(reversed(AUDIT_LOG[-limit:]))
