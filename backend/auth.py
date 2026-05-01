"""
Admin authentication system with JWT tokens.
Default admin credentials: admin / NDISAdmin2025!
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

# In-memory user store (production would use a database)
USERS_DB = {
    "admin": {
        "username": "admin",
        "full_name": "NDIS Administrator",
        "email": "admin@ndis-integrity.gov.au",
        "hashed_password": pwd_context.hash("NDISAdmin2025!"),
        "role": "admin",
        "disabled": False,
    }
}


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
        return UserInDB(**USERS_DB[username])
    return None


def authenticate_user(username: str, password: str):
    user = get_user(username)
    if not user or not verify_password(password, user.hashed_password):
        return None
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


def change_password(username: str, new_password: str):
    if username in USERS_DB:
        USERS_DB[username]["hashed_password"] = pwd_context.hash(new_password)
        return True
    return False


def create_user(username: str, password: str, full_name: str, email: str, role: str = "analyst"):
    if username in USERS_DB:
        return None
    USERS_DB[username] = {
        "username": username,
        "full_name": full_name,
        "email": email,
        "hashed_password": pwd_context.hash(password),
        "role": role,
        "disabled": False,
    }
    return User(**{k: v for k, v in USERS_DB[username].items() if k != "hashed_password"})
