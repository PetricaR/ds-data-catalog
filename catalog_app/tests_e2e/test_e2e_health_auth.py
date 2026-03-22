"""Health and authentication e2e tests."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

from tests_e2e.conftest import JWT_SECRET, JWT_ALGORITHM, make_token


class TestHealth:
    def test_health_returns_ok(self, api):
        r = api.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


class TestAuthMe:
    def test_me_with_valid_token(self, api):
        r = api.get("/api/v1/auth/me")
        assert r.status_code == 200
        data = r.json()
        assert "email" in data
        assert "role" in data

    def test_me_without_token(self, base_url):
        r = requests.get(f"{base_url}/api/v1/auth/me")
        assert r.status_code == 401

    def test_me_with_expired_token(self, base_url):
        try:
            from jose import jwt
        except ImportError:
            import jwt  # type: ignore
        payload = {
            "sub": str(uuid.uuid4()),
            "email": "expired@example.com",
            "role": "editor",
            "exp": datetime.now(timezone.utc) - timedelta(hours=1),
        }
        token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
        r = requests.get(
            f"{base_url}/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 401

    def test_me_with_wrong_secret(self, base_url):
        try:
            from jose import jwt
        except ImportError:
            import jwt  # type: ignore
        payload = {
            "sub": str(uuid.uuid4()),
            "email": "fake@example.com",
            "role": "editor",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        }
        token = jwt.encode(payload, "wrong-secret-that-is-long-enough-xxx", algorithm=JWT_ALGORITHM)
        r = requests.get(
            f"{base_url}/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 401

    def test_me_with_admin_token(self, base_url):
        token = make_token("admin", "admin@example.com")
        r = requests.get(
            f"{base_url}/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        assert r.json()["role"] == "admin"
