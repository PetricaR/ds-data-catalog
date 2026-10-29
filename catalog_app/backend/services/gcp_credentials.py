"""Credentials for the Google Cloud APIs the catalog calls as itself: DLP, Dataplex, Asset Inventory, Data Lineage."""
import json
from typing import Optional

import google.auth
import google.oauth2.credentials

CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform"


def get_credentials(project_id: str, secret_name: Optional[str]):
    """The service-account key in Secret Manager secret `secret_name` of `project_id`, else ADC.

    Local ADC from `gcloud auth application-default login` usually names no quota project, and Google then bills
    the call to gcloud's own project, where these APIs are off (403 SERVICE_DISABLED). Such credentials are billed
    to `project_id` instead; a quota project set with `gcloud auth application-default set-quota-project` wins.
    """
    if secret_name:
        from google.cloud import secretmanager
        from google.oauth2 import service_account

        sm = secretmanager.SecretManagerServiceClient()
        path = f"projects/{project_id}/secrets/{secret_name}/versions/latest"
        response = sm.access_secret_version(request={"name": path})
        key_dict = json.loads(response.payload.data.decode("utf-8"))
        return service_account.Credentials.from_service_account_info(key_dict, scopes=[CLOUD_PLATFORM_SCOPE])

    creds, _ = google.auth.default(scopes=[CLOUD_PLATFORM_SCOPE])
    if isinstance(creds, google.oauth2.credentials.Credentials) and not creds.quota_project_id:
        creds = creds.with_quota_project(project_id)
    return creds
