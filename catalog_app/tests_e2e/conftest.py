"""
Smoke tests against a running deployment — local or on GKE. Opt-in, never part of the default run.

They create and delete one throwaway dataset, so use an editor or admin account.

    export APP_BASE_URL=https://catalog.example.com    # or http://localhost:8000
    export E2E_TOKEN=<JWT>    # sign in, then copy localStorage.light_data_catalog_token
    pytest tests_e2e -v
"""

import os

import pytest
import requests

APP_BASE_URL = os.environ.get("APP_BASE_URL", "").rstrip("/")
E2E_TOKEN = os.environ.get("E2E_TOKEN", "")


def pytest_collection_modifyitems(config, items):
    if APP_BASE_URL and E2E_TOKEN:
        return
    skip = pytest.mark.skip(reason="set APP_BASE_URL and E2E_TOKEN to run the deployment smoke tests")
    for item in items:
        item.add_marker(skip)


class API:
    def __init__(self, base: str, token: str | None):
        self.base = base
        self.headers = {"Authorization": f"Bearer {token}"} if token else {}

    def request(self, method: str, path: str, **kwargs) -> requests.Response:
        return requests.request(method, f"{self.base}{path}", headers=self.headers, timeout=30, **kwargs)

    def get(self, path, **kwargs):
        return self.request("GET", path, **kwargs)

    def post(self, path, **kwargs):
        return self.request("POST", path, **kwargs)

    def delete(self, path, **kwargs):
        return self.request("DELETE", path, **kwargs)


@pytest.fixture(scope="session")
def api() -> API:
    return API(APP_BASE_URL, E2E_TOKEN)


@pytest.fixture(scope="session")
def anonymous() -> API:
    return API(APP_BASE_URL, None)
