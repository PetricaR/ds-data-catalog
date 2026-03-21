"""FastAPI dependencies for JWT-based authentication."""
from typing import Optional

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from ..config import settings

try:
    from jose import JWTError, jwt
    _JWT_BACKEND = "jose"
except ImportError:
    import jwt as _pyjwt  # type: ignore
    _JWT_BACKEND = "pyjwt"

bearer_scheme = HTTPBearer(auto_error=False)


def _decode_token(token: str) -> Optional[dict]:
    try:
        if _JWT_BACKEND == "jose":
            payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        else:
            payload = _pyjwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return payload
    except Exception:
        return None


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> Optional[dict]:
    """Extract user dict from JWT Bearer token. Returns None if no/invalid token."""
    if not credentials:
        return None
    payload = _decode_token(credentials.credentials)
    if not payload:
        return None
    return {
        "id": payload.get("sub"),
        "email": payload.get("email"),
        "role": payload.get("role", "viewer"),
    }


def require_auth(user: Optional[dict] = Depends(get_current_user)) -> dict:
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def require_role(*roles: str):
    def dep(user: dict = Depends(require_auth)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail=f"Requires role: {roles}")
        return user
    return dep
