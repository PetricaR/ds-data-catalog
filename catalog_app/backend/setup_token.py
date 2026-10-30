"""
Print the setup token, which lets the setup wizard change the Google OAuth client without signing in —
e.g. after the client was deleted and nobody can sign in. Run it where the backend runs, from catalog_app/:

    python -m backend.setup_token
    kubectl exec deploy/ds-catalog-backend -- python -m backend.setup_token

On Cloud Run, before any client is saved, `deploy/run/deploy.sh setup-token` computes it from JWT_SECRET.
"""
from .database import SessionLocal
from .services.oauth_client import setup_token

if __name__ == "__main__":
    with SessionLocal() as db:
        print(setup_token(db))
