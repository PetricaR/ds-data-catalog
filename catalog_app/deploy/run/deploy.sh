#!/bin/bash

# DS Data Catalog — Cloud Run Deployment
# ======================================
# One-shot script: APIs → service accounts → Cloud SQL → images → Cloud Run service.
# Safe to re-run; existing resources are reused.
#
# One Cloud Run service runs both containers: nginx serves the app and proxies /api/v1 to the backend,
# a sidecar on localhost:8000 that is never exposed on its own. PostgreSQL is a Cloud SQL instance.
#
# Usage (from catalog_app/deploy/run/):
#   GCP_PROJECT_ID=my-project ADMIN_EMAILS=me@example.com ALLOWED_EMAIL_DOMAINS=example.com ./deploy.sh
#
#   ./deploy.sh secrets       Roll out a new revision that reads the latest Secret Manager values (no rebuild)
#   ./deploy.sh setup-token   Print the setup wizard's token while no OAuth client has been saved
#
# Environment variables:
#   GCP_PROJECT_ID          GCP project (required)
#   ADMIN_EMAILS            Comma-separated admin accounts (required)
#   ALLOWED_EMAIL_DOMAINS   Comma-separated domains whose users may sign in
#   ALLOWED_EMAILS          Comma-separated individual accounts that may sign in
#   DEFAULT_ROLE            Role for new users: viewer (default) | editor
#                           The three above can be left unset and set on the app's Settings page instead
#   GCP_REGION              Region for Cloud Run, Cloud SQL and Artifact Registry (default: europe-west1)
#   SERVICE_NAME            Cloud Run service (default: ds-catalog)
#   SQL_INSTANCE            Cloud SQL instance (default: ds-catalog-db)
#   SQL_TIER                Cloud SQL machine type (default: db-f1-micro — shared core, 25 connections)
#   MAX_INSTANCES           Most Cloud Run instances (default: 2). Each opens up to 15 database connections
#   APP_URL                 Public URL, if you map a custom domain (default: the service's run.app URL)
#   AR_REPOSITORY           Artifact Registry repository (default: ds-catalog)
#   ASSUME_YES              Set to "1" to skip the confirmation prompt

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── Config ────────────────────────────────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT_ID:-}"
REGION="${GCP_REGION:-europe-west1}"
SERVICE_NAME="${SERVICE_NAME:-ds-catalog}"
SQL_INSTANCE="${SQL_INSTANCE:-ds-catalog-db}"
SQL_TIER="${SQL_TIER:-db-f1-micro}"
MAX_INSTANCES="${MAX_INSTANCES:-2}"
AR_REPOSITORY="${AR_REPOSITORY:-ds-catalog}"
APP_NAME="ds-catalog"
DB_NAME="ds_catalog"
DB_USER="catalog"
SA_EMAIL="${APP_NAME}-sa@${PROJECT_ID}.iam.gserviceaccount.com"
BUILD_SA_EMAIL="${APP_NAME}-build@${PROJECT_ID}.iam.gserviceaccount.com"

# Paths — script lives in catalog_app/deploy/run/
DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_CONTEXT="$(cd "$DEPLOY_DIR/../.." && pwd)"   # catalog_app/

# Backend environment variable : Secret Manager secret name : generated or optional
SECRET_SOURCES="
DATABASE_URL:ds-catalog-database-url:generated
JWT_SECRET:jwt-secret-key:generated
ENCRYPTION_KEY:ds-catalog-encryption-key:generated
GOOGLE_CLIENT_ID:GOOGLE_CLIENT_ID:optional
GOOGLE_CLIENT_SECRET:GOOGLE_CLIENT_SECRET:optional
GEMINI_API_KEY:gemini-api-key:optional
GOOGLE_CHAT_WEBHOOK_URL:ds-catalog-google-chat-webhook:optional
BQ_SECRET_NAME:ds-catalog-bq-secret-name:optional
"

# ── Helpers ───────────────────────────────────────────────────────────────────
print_step()    { echo -e "\n${CYAN}▶ STEP $1: $2${NC}\n"; }
print_info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
print_success() { echo -e "${GREEN}[OK]${NC} $1"; }

read_secret() {
    gcloud secrets versions access latest --secret="$1" --project="$PROJECT_ID" 2>/dev/null || true
}

secret_exists() {
    gcloud secrets describe "$1" --project="$PROJECT_ID" &>/dev/null
}

# Stores a new value as the secret's latest version, creating the secret if needed (value on stdin)
write_secret() {
    if secret_exists "$1"; then
        gcloud secrets versions add "$1" --data-file=- --project="$PROJECT_ID" >/dev/null
    else
        gcloud secrets create "$1" --data-file=- --project="$PROJECT_ID" >/dev/null
    fi
}

# A single-quoted YAML scalar
yaml_quote() {
    printf "'%s'" "$(printf '%s' "$1" | sed "s/'/''/g")"
}

app_url() {
    if [ -n "${APP_URL:-}" ]; then
        echo "${APP_URL%/}"
        return
    fi
    local number
    number=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
    echo "https://${SERVICE_NAME}-${number}.${REGION}.run.app"
}

# ── Step 1: Prerequisites ─────────────────────────────────────────────────────
check_prerequisites() {
    print_step 1 "Checking prerequisites"
    if [ -z "$PROJECT_ID" ]; then
        print_error "GCP_PROJECT_ID is required"
        exit 1
    fi
    if [ -z "${ADMIN_EMAILS:-}" ]; then
        print_error "ADMIN_EMAILS is required — nobody could administer the catalog otherwise"
        exit 1
    fi
    for cmd in gcloud openssl; do
        if ! command -v "$cmd" &>/dev/null; then
            print_error "$cmd is not installed"
            [ "$cmd" == "gcloud" ] && echo "Install: https://cloud.google.com/sdk/docs/install"
            exit 1
        fi
        print_info "$cmd: ✓"
    done
    print_success "All prerequisites met"
}

# ── Step 2: GCP APIs ──────────────────────────────────────────────────────────
enable_apis() {
    print_step 2 "Enabling APIs ($PROJECT_ID)"
    local apis=(
        run.googleapis.com
        sqladmin.googleapis.com
        artifactregistry.googleapis.com
        cloudbuild.googleapis.com
        secretmanager.googleapis.com
        cloudresourcemanager.googleapis.com
        iam.googleapis.com
        aiplatform.googleapis.com
        bigquery.googleapis.com
        dlp.googleapis.com
        dataplex.googleapis.com
        cloudasset.googleapis.com
        datalineage.googleapis.com
        logging.googleapis.com
        monitoring.googleapis.com
    )
    gcloud services enable "${apis[@]}" --project="$PROJECT_ID"
    print_success "APIs enabled"
}

# ── Step 3: Service accounts ──────────────────────────────────────────────────
ensure_service_account() {
    local email=$1 display_name=$2
    if gcloud iam service-accounts describe "$email" --project="$PROJECT_ID" &>/dev/null; then
        print_info "$email already exists — skipping"
    else
        gcloud iam service-accounts create "${email%%@*}" \
            --display-name="$display_name" --project="$PROJECT_ID"
        print_success "$email created"
    fi
}

# A service account can take a minute after it is created before IAM accepts it in a binding
grant_project_role() {
    local email=$1 role=$2 attempt
    for attempt in 1 2 3 4 5 6 7 8; do
        if gcloud projects add-iam-policy-binding "$PROJECT_ID" \
             --member="serviceAccount:${email}" --role="$role" --condition=None &>/dev/null; then
            return 0
        fi
        print_info "Waiting for IAM to accept $email ($role)..."
        sleep 10
    done
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:${email}" --role="$role" --condition=None >/dev/null
}

setup_service_accounts() {
    print_step 3 "Setting up service accounts"

    # The app runs as this account (the same one, and roles, as the GKE deployment)
    ensure_service_account "$SA_EMAIL" "DS Data Catalog SA"
    local roles=(
        roles/bigquery.jobUser              # run preview / stats / quality queries
        roles/bigquery.dataViewer           # read table data for previews and scans
        roles/bigquery.metadataViewer       # sync schemas and metadata
        roles/bigquery.resourceViewer       # usage statistics (INFORMATION_SCHEMA.JOBS)
        roles/aiplatform.user               # Gemini insights via Vertex AI
        roles/dlp.user                      # PII detection
        roles/dataplex.dataScanAdmin        # Dataplex quality scans
        roles/datalineage.viewer            # lineage discovery
        roles/cloudasset.viewer             # schema history
        roles/secretmanager.secretAccessor  # the app's secrets and optional per-source service account keys
        roles/cloudsql.client               # connect to the Cloud SQL instance
        roles/logging.logWriter
        roles/monitoring.metricWriter
    )
    for role in "${roles[@]}"; do
        grant_project_role "$SA_EMAIL" "$role"
    done
    print_success "IAM roles granted to $SA_EMAIL"

    # Cloud Build runs as this account: newer projects give the default build account no roles
    ensure_service_account "$BUILD_SA_EMAIL" "DS Data Catalog image builds"
    grant_project_role "$BUILD_SA_EMAIL" roles/run.builder
    print_success "Build role granted to $BUILD_SA_EMAIL"
}

# ── Step 4: Cloud SQL ─────────────────────────────────────────────────────────
setup_database() {
    print_step 4 "Cloud SQL ($SQL_INSTANCE)"

    if gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT_ID" &>/dev/null; then
        print_info "Instance already exists — skipping creation"
    else
        print_info "Creating a PostgreSQL 16 instance, $SQL_TIER (10–15 min)..."
        gcloud sql instances create "$SQL_INSTANCE" \
            --project="$PROJECT_ID" \
            --region="$REGION" \
            --database-version=POSTGRES_16 \
            --edition=ENTERPRISE \
            --tier="$SQL_TIER" \
            --storage-type=SSD \
            --storage-size=10 \
            --availability-type=zonal \
            --backup-start-time=02:00 \
            --deletion-protection
        print_success "Instance created"
    fi
    SQL_CONNECTION=$(gcloud sql instances describe "$SQL_INSTANCE" \
        --project="$PROJECT_ID" --format='value(connectionName)')

    if ! gcloud sql databases describe "$DB_NAME" --instance="$SQL_INSTANCE" \
         --project="$PROJECT_ID" &>/dev/null; then
        gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE" --project="$PROJECT_ID"
    fi

    # The password lives only in the DATABASE_URL secret; keep it so running instances stay connected.
    local stored_url password generated=0
    stored_url=$(read_secret ds-catalog-database-url)
    password=$(printf '%s' "$stored_url" | sed -n -E "s|^postgresql://${DB_USER}:([^@]+)@.*|\\1|p")
    if [ -z "$password" ]; then
        password=$(openssl rand -hex 24)
        generated=1
    fi

    local users
    users=$(gcloud sql users list --instance="$SQL_INSTANCE" --project="$PROJECT_ID" --format='value(name)')
    if echo "$users" | grep -qx "$DB_USER"; then
        if [ "$generated" == 1 ]; then
            gcloud sql users set-password "$DB_USER" --instance="$SQL_INSTANCE" \
                --password="$password" --project="$PROJECT_ID"
        fi
    else
        gcloud sql users create "$DB_USER" --instance="$SQL_INSTANCE" \
            --password="$password" --project="$PROJECT_ID"
    fi

    local url="postgresql://${DB_USER}:${password}@/${DB_NAME}?host=/cloudsql/${SQL_CONNECTION}"
    if [ "$url" != "$stored_url" ]; then
        printf '%s' "$url" | write_secret ds-catalog-database-url
        print_info "Stored the database URL in Secret Manager (ds-catalog-database-url)"
    fi
    print_success "Database $DB_NAME ready on $SQL_CONNECTION"
}

# ── Step 5: Build & push images (via Cloud Build) ────────────────────────────
# Uses 'gcloud builds submit' — builds in GCP, no local Docker needed.
# Files listed in catalog_app/.gcloudignore (e.g. .env) are never uploaded.
build_and_push_images() {
    print_step 5 "Building & pushing Docker images (Cloud Build)"

    if ! gcloud artifacts repositories describe "$AR_REPOSITORY" \
         --location="$REGION" --project="$PROJECT_ID" &>/dev/null; then
        print_info "Creating Artifact Registry repository $AR_REPOSITORY ($REGION)..."
        gcloud artifacts repositories create "$AR_REPOSITORY" \
            --repository-format=docker --location="$REGION" --project="$PROJECT_ID"
    fi

    local tag registry tmpconfig
    tag=$(date +%Y%m%d-%H%M%S)
    registry="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPOSITORY}"
    BACKEND_IMAGE="${registry}/ds-catalog-backend:${tag}"
    FRONTEND_IMAGE="${registry}/ds-catalog-frontend:${tag}"

    # Both images in one build; the frontend gets this target's nginx config
    tmpconfig=$(mktemp "${TMPDIR:-/tmp}/cloudbuild-XXXXXX")
    cat > "$tmpconfig" <<EOF
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-f', 'Dockerfile.backend', '-t', '${BACKEND_IMAGE}', '.']
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-f', 'Dockerfile.frontend', '--build-arg', 'NGINX_CONF=deploy/run/nginx.conf',
           '-t', '${FRONTEND_IMAGE}', '.']
images:
  - '${BACKEND_IMAGE}'
  - '${FRONTEND_IMAGE}'
options:
  logging: CLOUD_LOGGING_ONLY
EOF
    print_info "Submitting to Cloud Build → $registry (tag $tag)"
    gcloud builds submit "$BUILD_CONTEXT" \
        --project="$PROJECT_ID" \
        --config="$tmpconfig" \
        --service-account="projects/${PROJECT_ID}/serviceAccounts/${BUILD_SA_EMAIL}"
    rm -f "$tmpconfig"
    print_success "Images pushed"
}

# ── Secrets ───────────────────────────────────────────────────────────────────
# Generated secrets are created once with a random value and never replaced: losing JWT_SECRET signs
# everyone out, losing ENCRYPTION_KEY loses the stored secrets (users sign in again, and an OAuth client
# saved by the setup wizard is entered again). Put "new,old" in ds-catalog-encryption-key to rotate.
ensure_generated_secrets() {
    local name
    for name in jwt-secret-key ds-catalog-encryption-key; do
        if ! secret_exists "$name"; then
            openssl rand -hex 32 | tr -d '\n' | write_secret "$name"
            print_info "Generated $name and stored it in Secret Manager"
        fi
    done
}

# The backend's env entries for the secrets that exist, as YAML
secret_env_yaml() {
    local line env_name sm_name kind
    for line in $SECRET_SOURCES; do
        IFS=: read -r env_name sm_name kind <<< "$line"
        if secret_exists "$sm_name"; then
            print_info "  ✓ $env_name (from $sm_name)" >&2
            cat <<EOF
            - name: ${env_name}
              valueFrom:
                secretKeyRef:
                  name: ${sm_name}
                  key: latest
EOF
        elif [ "$kind" == "generated" ]; then
            print_error "Secret $sm_name is missing" >&2
            return 1
        else
            print_info "  - $env_name not set (optional secret '$sm_name' not found)" >&2
        fi
    done
}

plain_env_yaml() {
    local frontend_url=$1 name value
    for name in GCP_PROJECT_ID FRONTEND_URL CORS_ORIGINS ADMIN_EMAILS ALLOWED_EMAIL_DOMAINS ALLOWED_EMAILS \
                DEFAULT_ROLE LOG_SETUP_TOKEN; do
        case "$name" in
            GCP_PROJECT_ID)  value="$PROJECT_ID" ;;
            FRONTEND_URL)    value="$frontend_url" ;;
            CORS_ORIGINS)    value="[\"$frontend_url\"]" ;;
            # Anyone who can read the project's logs could finish setup with a logged token
            LOG_SETUP_TOKEN) value="false" ;;
            *)               value="${!name:-}" ;;
        esac
        [ -z "$value" ] && continue
        cat <<EOF
            - name: ${name}
              value: $(yaml_quote "$value")
EOF
    done
}

# ── Step 6: Deploy the Cloud Run service ──────────────────────────────────────
deploy_service() {
    print_step 6 "Deploying Cloud Run service ($SERVICE_NAME)"

    local frontend_url secret_env manifest
    frontend_url=$(app_url)
    ensure_generated_secrets
    print_info "Secrets from Secret Manager:"
    secret_env=$(secret_env_yaml) || exit 1

    local client_secrets=0
    secret_exists GOOGLE_CLIENT_ID && client_secrets=$((client_secrets + 1))
    secret_exists GOOGLE_CLIENT_SECRET && client_secrets=$((client_secrets + 1))
    if [ "$client_secrets" == 1 ]; then
        print_warning "Only one of GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET is in Secret Manager: sign-in will not work"
    fi

    manifest=$(mktemp "${TMPDIR:-/tmp}/ds-catalog-service-XXXXXX")
    cat > "$manifest" <<EOF
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  labels:
    cloud.googleapis.com/location: ${REGION}
  annotations:
    run.googleapis.com/ingress: all
    # Public without an allUsers binding, so it also works under domain-restricted sharing.
    # The app signs users in itself; every API route but sign-in and setup requires it.
    run.googleapis.com/invoker-iam-disabled: 'true'
spec:
  template:
    metadata:
      # A new name on every deploy rolls out a revision, which reads the latest secret versions
      name: ${SERVICE_NAME}-$(date +%Y%m%d-%H%M%S)
      annotations:
        autoscaling.knative.dev/maxScale: '${MAX_INSTANCES}'
        run.googleapis.com/cloudsql-instances: ${SQL_CONNECTION}
        run.googleapis.com/container-dependencies: '{"frontend":["backend"]}'
        run.googleapis.com/startup-cpu-boost: 'true'
    spec:
      serviceAccountName: ${SA_EMAIL}
      # Long requests: a sync, or a Dataplex quality scan that polls for up to 5 minutes
      timeoutSeconds: 600
      containerConcurrency: 80
      containers:
        - name: frontend
          image: ${FRONTEND_IMAGE}
          ports:
            - name: http1
              containerPort: 80
          resources:
            limits:
              cpu: '1'
              memory: 256Mi
        - name: backend
          image: ${BACKEND_IMAGE}
          env:
$(plain_env_yaml "$frontend_url")
${secret_env}
          resources:
            limits:
              cpu: '1'
              memory: 1Gi
          startupProbe:
            httpGet:
              path: /health
              port: 8000
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 24
EOF

    gcloud run services replace "$manifest" --region="$REGION" --project="$PROJECT_ID"
    rm -f "$manifest"
    APP_URL="$frontend_url"
    print_success "Service deployed"
}

# Images of the running service, to roll out a new revision without a rebuild
current_images() {
    local images
    images=$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --project="$PROJECT_ID" \
        --format='value(spec.template.spec.containers[0].image,spec.template.spec.containers[1].image)')
    FRONTEND_IMAGE=$(echo "$images" | cut -f1)
    BACKEND_IMAGE=$(echo "$images" | cut -f2)
    if [ -z "$FRONTEND_IMAGE" ] || [ -z "$BACKEND_IMAGE" ]; then
        print_error "Service $SERVICE_NAME not found in $REGION — run ./deploy.sh first"
        exit 1
    fi
    SQL_CONNECTION=$(gcloud sql instances describe "$SQL_INSTANCE" \
        --project="$PROJECT_ID" --format='value(connectionName)')
}

# The token is derived from JWT_SECRET and the saved OAuth client (backend/services/oauth_client.py),
# so with no client saved yet it can be computed here, without access to the database.
print_setup_token() {
    local jwt_secret
    jwt_secret=$(read_secret jwt-secret-key)
    if [ -z "$jwt_secret" ]; then
        print_error "Could not read the secret jwt-secret-key in $PROJECT_ID"
        exit 1
    fi
    printf '%s' "$jwt_secret" | python3 -c '
import hashlib, hmac, sys
# HKDF-SHA256 with no salt, as crypto.derive_key(JWT_SECRET, b"setup-token"); HMAC over an empty stored secret
prk = hmac.new(bytes(32), sys.stdin.buffer.read(), hashlib.sha256).digest()
key = hmac.new(prk, b"ds-catalog/setup-token\x01", hashlib.sha256).digest()
print(hmac.new(key, b"", hashlib.sha256).hexdigest()[:32])'
}

# ── Step 7: Summary ───────────────────────────────────────────────────────────
print_summary() {
    print_step 7 "Done!"

    echo -e "${GREEN}✓ Project:${NC}   $PROJECT_ID ($REGION)"
    echo -e "${GREEN}✓ Database:${NC}  $SQL_CONNECTION"
    echo -e "${GREEN}✓ Backend:${NC}   $BACKEND_IMAGE"
    echo -e "${GREEN}✓ Frontend:${NC}  $FRONTEND_IMAGE"
    echo ""
    echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  App URL: $APP_URL${NC}"
    echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Register these on your OAuth client (APIs & Services → Credentials):"
    echo "  Authorised JavaScript origin: $APP_URL"
    echo "  Authorised redirect URI:      $APP_URL/api/v1/auth/callback"
    if ! secret_exists GOOGLE_CLIENT_ID; then
        echo ""
        echo "Then enter the client at $APP_URL/setup with the setup token from:"
        echo "  GCP_PROJECT_ID=$PROJECT_ID ./deploy.sh setup-token"
    fi
    echo ""
    echo -e "${YELLOW}Useful commands:${NC}"
    echo "  gcloud run services logs read $SERVICE_NAME --region=$REGION --project=$PROJECT_ID"
    echo "  gcloud sql connect $SQL_INSTANCE --user=$DB_USER --database=$DB_NAME --project=$PROJECT_ID"
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
    set -euo pipefail

    case "${1:-}" in
        secrets)
            [ -z "$PROJECT_ID" ] && { print_error "GCP_PROJECT_ID is required"; exit 1; }
            current_images
            deploy_service
            exit 0
            ;;
        setup-token)
            [ -z "$PROJECT_ID" ] && { print_error "GCP_PROJECT_ID is required"; exit 1; }
            print_setup_token
            exit 0
            ;;
    esac

    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║   DS Data Catalog — Cloud Run Deployment ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
    echo ""
    echo "  Project:        ${PROJECT_ID:-<not set>}"
    echo "  Region:         $REGION"
    echo "  Service:        $SERVICE_NAME"
    echo "  Cloud SQL:      $SQL_INSTANCE ($SQL_TIER)"
    echo "  Admins:         ${ADMIN_EMAILS:-<not set>}"
    echo "  Allowed:        ${ALLOWED_EMAIL_DOMAINS:-} ${ALLOWED_EMAILS:-}"
    echo ""

    if [ "${ASSUME_YES:-0}" != "1" ]; then
        read -rp "Continue? (y/n) " -n 1; echo
        [[ ! $REPLY =~ ^[Yy]$ ]] && echo "Aborted." && exit 0
    fi

    check_prerequisites
    enable_apis
    setup_service_accounts
    setup_database
    build_and_push_images
    deploy_service
    print_summary
}

main "$@"
