#!/bin/bash

# DS Data Catalog — GKE Deployment
# =================================
# One-shot script: APIs → cluster → Workload Identity → images → Kubernetes manifests.
# Safe to re-run; existing resources are reused.
#
# Usage (from catalog_app/deploy/):
#   GCP_PROJECT_ID=my-project ADMIN_EMAILS=me@example.com ALLOWED_EMAIL_DOMAINS=example.com \
#   DOMAIN=catalog.example.com ./deploy.sh
#
#   ./deploy.sh secrets    Re-sync the Kubernetes secret from Secret Manager and restart the backend
#
# Environment variables:
#   GCP_PROJECT_ID          GCP project (required)
#   ADMIN_EMAILS            Comma-separated admin accounts (required)
#   ALLOWED_EMAIL_DOMAINS   Comma-separated domains whose users may sign in
#   ALLOWED_EMAILS          Comma-separated individual accounts that may sign in
#   DEFAULT_ROLE            Role for new users: viewer (default) | editor
#   DOMAIN                  Serve over HTTPS on this domain (Ingress + Google-managed certificate).
#                           Without it the app is exposed over plain HTTP on <ip>.nip.io — testing only.
#   GCP_REGION              Region (default: europe-west1)
#   CLUSTER_NAME            GKE cluster name (default: ds-catalog-cluster)
#   K8S_NAMESPACE           Kubernetes namespace (default: default)
#   REGISTRY_TYPE           artifact-registry (default) or gcr
#   AR_LOCATION             Artifact Registry location (default: $GCP_REGION)
#   AR_REPOSITORY           Artifact Registry repository (default: ds-catalog)
#   SKIP_CLUSTER            Set to "1" to skip cluster creation entirely
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
CLUSTER_NAME="${CLUSTER_NAME:-ds-catalog-cluster}"
NAMESPACE="${K8S_NAMESPACE:-default}"
REGISTRY_TYPE="${REGISTRY_TYPE:-artifact-registry}"
AR_LOCATION="${AR_LOCATION:-$REGION}"
AR_REPOSITORY="${AR_REPOSITORY:-ds-catalog}"
APP_NAME="ds-catalog"
SKIP_CLUSTER="${SKIP_CLUSTER:-0}"
DOMAIN="${DOMAIN:-}"
STATIC_IP_NAME="ds-catalog-ip"

# Paths — script lives in catalog_app/deploy/
DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_CONTEXT="$(cd "$DEPLOY_DIR/.." && pwd)"   # catalog_app/

# Kubernetes secret key : Secret Manager secret name : required?
SECRET_SOURCES="
GOOGLE_CLIENT_ID:GOOGLE_CLIENT_ID:required
GOOGLE_CLIENT_SECRET:GOOGLE_CLIENT_SECRET:required
JWT_SECRET:jwt-secret-key:required
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

get_image_url() {
    local name=$1 tag=$2
    if [ "$REGISTRY_TYPE" == "gcr" ]; then
        echo "gcr.io/${PROJECT_ID}/${name}:${tag}"
    else
        echo "${AR_LOCATION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPOSITORY}/${name}:${tag}"
    fi
}

read_secret() {
    gcloud secrets versions access latest --secret="$1" --project="$PROJECT_ID" 2>/dev/null || true
}

wait_for_ip() {
    local svc=$1 ns=${2:-$NAMESPACE}
    local timeout=300 interval=10 elapsed=0
    while [ $elapsed -lt $timeout ]; do
        local ip
        ip=$(kubectl get service "$svc" -n "$ns" \
             -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)
        [ -n "$ip" ] && echo "$ip" && return 0
        sleep $interval; elapsed=$((elapsed + interval))
        echo -e "${GREEN}[INFO]${NC} Waiting for external IP... ($elapsed/${timeout}s)" >&2
    done
    return 1
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
    for cmd in gcloud kubectl openssl; do
        if ! command -v "$cmd" &>/dev/null; then
            print_error "$cmd is not installed"
            [ "$cmd" == "gcloud" ]  && echo "Install: https://cloud.google.com/sdk/docs/install"
            [ "$cmd" == "kubectl" ] && echo "Run: gcloud components install kubectl"
            exit 1
        fi
        print_info "$cmd: ✓"
    done
    if ! command -v gke-gcloud-auth-plugin &>/dev/null; then
        print_warning "gke-gcloud-auth-plugin not found — installing..."
        gcloud components install gke-gcloud-auth-plugin --quiet
    fi
    print_success "All prerequisites met"
}

# ── Step 2: GCP project & APIs ────────────────────────────────────────────────
setup_project() {
    print_step 2 "Configuring GCP project ($PROJECT_ID)"
    gcloud config set project "$PROJECT_ID"
    gcloud config set compute/region "$REGION"

    local apis=(
        container.googleapis.com
        compute.googleapis.com
        artifactregistry.googleapis.com
        cloudbuild.googleapis.com
        aiplatform.googleapis.com
        bigquery.googleapis.com
        secretmanager.googleapis.com
        cloudresourcemanager.googleapis.com
        iam.googleapis.com
        logging.googleapis.com
        monitoring.googleapis.com
        dlp.googleapis.com
        dataplex.googleapis.com
        cloudasset.googleapis.com
        datalineage.googleapis.com
    )
    print_info "Enabling required APIs..."
    gcloud services enable "${apis[@]}" --project="$PROJECT_ID"
    print_success "APIs enabled"
}

# ── Step 3: Create GKE Autopilot cluster ──────────────────────────────────────
create_cluster() {
    print_step 3 "GKE cluster ($CLUSTER_NAME)"

    if [ "$SKIP_CLUSTER" == "1" ]; then
        print_info "SKIP_CLUSTER=1 — skipping cluster creation"
    elif gcloud container clusters describe "$CLUSTER_NAME" \
         --region="$REGION" --project="$PROJECT_ID" &>/dev/null; then
        print_info "Cluster already exists — skipping creation"
    else
        print_info "Creating Autopilot cluster (5–10 min)..."
        gcloud container clusters create-auto "$CLUSTER_NAME" \
            --region="$REGION" \
            --project="$PROJECT_ID" \
            --release-channel="regular" \
            --logging=SYSTEM,WORKLOAD \
            --monitoring=SYSTEM
        print_success "Cluster created"
    fi

    print_info "Fetching cluster credentials..."
    gcloud container clusters get-credentials "$CLUSTER_NAME" \
        --region="$REGION" --project="$PROJECT_ID"
    print_success "kubectl configured → $(kubectl config current-context)"
}

# ── Step 4: Workload Identity ─────────────────────────────────────────────────
setup_workload_identity() {
    print_step 4 "Setting up Workload Identity"

    local GCP_SA_NAME="${APP_NAME}-sa"
    local GCP_SA_EMAIL="${GCP_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
    local K8S_SA_NAME="${APP_NAME}-sa"

    # Create GCP service account
    if gcloud iam service-accounts describe "$GCP_SA_EMAIL" \
         --project="$PROJECT_ID" &>/dev/null; then
        print_info "GCP service account already exists — skipping"
    else
        gcloud iam service-accounts create "$GCP_SA_NAME" \
            --display-name="DS Data Catalog SA" \
            --project="$PROJECT_ID"
        sleep 5
        print_success "GCP service account created"
    fi

    # Grant IAM roles (one per catalog feature; see README → IAM roles)
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
        roles/secretmanager.secretAccessor  # optional per-source service account keys
        roles/logging.logWriter
        roles/monitoring.metricWriter
    )
    for role in "${roles[@]}"; do
        gcloud projects add-iam-policy-binding "$PROJECT_ID" \
            --member="serviceAccount:${GCP_SA_EMAIL}" \
            --role="$role" --condition=None >/dev/null
    done
    print_success "IAM roles granted"

    # Workload Identity binding
    gcloud iam service-accounts add-iam-policy-binding "$GCP_SA_EMAIL" \
        --role roles/iam.workloadIdentityUser \
        --member "serviceAccount:${PROJECT_ID}.svc.id.goog[${NAMESPACE}/${K8S_SA_NAME}]" \
        --project="$PROJECT_ID" >/dev/null

    # K8s service account
    kubectl get namespace "$NAMESPACE" &>/dev/null || kubectl create namespace "$NAMESPACE"
    kubectl get serviceaccount "$K8S_SA_NAME" -n "$NAMESPACE" &>/dev/null \
        || kubectl create serviceaccount "$K8S_SA_NAME" -n "$NAMESPACE"
    kubectl annotate serviceaccount "$K8S_SA_NAME" -n "$NAMESPACE" \
        iam.gke.io/gcp-service-account="$GCP_SA_EMAIL" --overwrite

    print_success "Workload Identity configured"
}

# ── Step 5: Build & push images (via Cloud Build) ────────────────────────────
# Uses 'gcloud builds submit' — builds in GCP, no local Docker needed.
# Files listed in catalog_app/.gcloudignore (e.g. .env) are never uploaded.
build_and_push_images() {
    print_step 5 "Building & pushing Docker images (Cloud Build)"

    if [ "$REGISTRY_TYPE" != "gcr" ] && ! gcloud artifacts repositories describe "$AR_REPOSITORY" \
         --location="$AR_LOCATION" --project="$PROJECT_ID" &>/dev/null; then
        print_info "Creating Artifact Registry repository $AR_REPOSITORY ($AR_LOCATION)..."
        gcloud artifacts repositories create "$AR_REPOSITORY" \
            --repository-format=docker --location="$AR_LOCATION" --project="$PROJECT_ID"
    fi

    local TAG
    TAG=$(date +%Y%m%d-%H%M%S)

    for name in ds-catalog-backend ds-catalog-frontend; do
        local dockerfile
        [ "$name" == "ds-catalog-backend" ] && dockerfile="Dockerfile.backend" || dockerfile="Dockerfile.frontend"

        local image latest
        image=$(get_image_url "$name" "$TAG")
        latest=$(get_image_url "$name" "latest")

        print_info "Submitting $name to Cloud Build → $image"
        local tmpconfig
        tmpconfig=$(mktemp "${TMPDIR:-/tmp}/cloudbuild-XXXXXX")
        cat > "$tmpconfig" <<EOF
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-f', '${dockerfile}', '-t', '${image}', '-t', '${latest}', '.']
images:
  - '${image}'
  - '${latest}'
EOF
        gcloud builds submit "$BUILD_CONTEXT" \
            --project="$PROJECT_ID" \
            --config="$tmpconfig"
        rm -f "$tmpconfig"
        print_success "$name pushed"

        [ "$name" == "ds-catalog-backend" ]  && BACKEND_IMAGE="$image"
        [ "$name" == "ds-catalog-frontend" ] && FRONTEND_IMAGE="$image"
    done
}

# ── Secret Manager → K8s secret sync ─────────────────────────────────────────
# Reads credentials from Secret Manager and upserts the ds-catalog-secret.
postgres_password() {
    local value
    # Keep the password the database was initialised with.
    value=$(kubectl get secret ds-catalog-secret -n "$NAMESPACE" \
        -o jsonpath='{.data.POSTGRES_PASSWORD}' 2>/dev/null | base64 --decode 2>/dev/null || true)
    [ -n "$value" ] && { echo "$value"; return; }
    value=$(read_secret ds-catalog-postgres-password)
    [ -n "$value" ] && { echo "$value"; return; }
    value=$(openssl rand -hex 24)
    printf '%s' "$value" | gcloud secrets create ds-catalog-postgres-password \
        --data-file=- --project="$PROJECT_ID" >/dev/null
    echo -e "${GREEN}[INFO]${NC} Generated a PostgreSQL password and stored it in Secret Manager (ds-catalog-postgres-password)" >&2
    echo "$value"
}

encryption_key() {
    local value generated=0
    # Secret Manager is the source of truth (put "new,old" there to rotate). Losing the key means users
    # sign in again and an OAuth client stored by the setup wizard is entered again.
    value=$(read_secret ds-catalog-encryption-key)
    [ -n "$value" ] && { echo "$value"; return; }
    value=$(kubectl get secret ds-catalog-secret -n "$NAMESPACE" \
        -o jsonpath='{.data.ENCRYPTION_KEY}' 2>/dev/null | base64 --decode 2>/dev/null || true)
    if [ -z "$value" ]; then
        value=$(openssl rand -hex 32)
        generated=1
    fi
    if printf '%s' "$value" | gcloud secrets create ds-catalog-encryption-key \
        --data-file=- --project="$PROJECT_ID" >/dev/null 2>&1; then
        if [ "$generated" == 1 ]; then
            echo -e "${GREEN}[INFO]${NC} Generated an encryption key and stored it in Secret Manager (ds-catalog-encryption-key)" >&2
        else
            echo -e "${GREEN}[INFO]${NC} Copied the cluster's encryption key to Secret Manager (ds-catalog-encryption-key)" >&2
        fi
    elif [ "$generated" == 1 ]; then
        # Most likely the secret exists but could not be read: never replace a key that is in use.
        echo -e "${RED}[ERROR]${NC} Could not read or create the Secret Manager secret ds-catalog-encryption-key. Check access to it and re-run." >&2
        return 1
    else
        echo -e "${YELLOW}[WARN]${NC} Could not store the encryption key in Secret Manager (ds-catalog-encryption-key); it exists only in the Kubernetes secret ds-catalog-secret" >&2
    fi
    echo "$value"
}

sync_secrets_from_secret_manager() {
    print_info "Syncing secrets from Secret Manager..."

    local pg_password enc_key
    pg_password=$(postgres_password)
    enc_key=$(encryption_key) || exit 1
    local kubectl_args=(
        "--from-literal=POSTGRES_PASSWORD=${pg_password}"
        "--from-literal=DATABASE_URL=postgresql://catalog:${pg_password}@ds-catalog-postgres:5432/ds_catalog"
        "--from-literal=ENCRYPTION_KEY=${enc_key}"
    )

    local missing_required=()
    local line k8s_key sm_name required value
    for line in $SECRET_SOURCES; do
        IFS=: read -r k8s_key sm_name required <<< "$line"
        value=$(read_secret "$sm_name")
        if [ -n "$value" ]; then
            kubectl_args+=("--from-literal=${k8s_key}=${value}")
            print_info "  ✓ $k8s_key (from $sm_name)"
        elif [ "$required" == "required" ]; then
            missing_required+=("$sm_name")
        else
            kubectl_args+=("--from-literal=${k8s_key}=")
            print_info "  - $k8s_key not set (optional secret '$sm_name' not found)"
        fi
    done

    if [ ${#missing_required[@]} -gt 0 ]; then
        print_error "Missing required secrets in Secret Manager. Create them with:"
        for s in "${missing_required[@]}"; do
            if [ "$s" == "jwt-secret-key" ]; then
                echo "    openssl rand -hex 32 | tr -d '\\n' | gcloud secrets create $s --data-file=- --project=$PROJECT_ID"
            else
                echo "    echo -n 'VALUE' | gcloud secrets create $s --data-file=- --project=$PROJECT_ID"
            fi
        done
        exit 1
    fi

    kubectl create secret generic ds-catalog-secret -n "$NAMESPACE" \
        "${kubectl_args[@]}" --dry-run=client -o yaml | kubectl apply -n "$NAMESPACE" -f -

    print_success "K8s secret upserted from Secret Manager"
}

apply_configmap() {
    local frontend_url=$1
    kubectl create configmap ds-catalog-config -n "$NAMESPACE" \
        --from-literal=GCP_PROJECT_ID="$PROJECT_ID" \
        --from-literal=FRONTEND_URL="$frontend_url" \
        --from-literal=CORS_ORIGINS="[\"$frontend_url\"]" \
        --from-literal=ADMIN_EMAILS="${ADMIN_EMAILS:-}" \
        --from-literal=ALLOWED_EMAIL_DOMAINS="${ALLOWED_EMAIL_DOMAINS:-}" \
        --from-literal=ALLOWED_EMAILS="${ALLOWED_EMAILS:-}" \
        --from-literal=DEFAULT_ROLE="${DEFAULT_ROLE:-viewer}" \
        --from-literal=LOG_SETUP_TOKEN=false \
        --dry-run=client -o yaml | kubectl apply -n "$NAMESPACE" -f -
}

# ── Step 6: Apply K8s manifests ───────────────────────────────────────────────
deploy_to_kubernetes() {
    print_step 6 "Deploying to Kubernetes"

    # A previous HTTPS deploy (or setup-iap.sh) created an Ingress — never fall back to a public HTTP IP.
    if [ -z "$DOMAIN" ] && kubectl get ingress ds-catalog-ingress -n "$NAMESPACE" &>/dev/null; then
        DOMAIN=$(kubectl get managedcertificate ds-catalog-cert -n "$NAMESPACE" \
            -o jsonpath='{.spec.domains[0]}' 2>/dev/null || true)
        [ -n "$DOMAIN" ] && print_info "Existing Ingress found — keeping HTTPS on $DOMAIN"
    fi

    # Secret first — PostgreSQL and the backend read it on startup
    sync_secrets_from_secret_manager

    print_info "Applying PostgreSQL..."
    kubectl apply -n "$NAMESPACE" -f "$DEPLOY_DIR/postgres.yaml"
    kubectl rollout status statefulset/ds-catalog-postgres -n "$NAMESPACE" --timeout=5m

    local service_type frontend_url
    if [ -n "$DOMAIN" ]; then
        service_type="ClusterIP"
        frontend_url="https://${DOMAIN}"
    else
        service_type="LoadBalancer"
    fi

    print_info "Applying frontend service ($service_type)..."
    sed "s|^  type: ClusterIP$|  type: ${service_type}|" \
        "$DEPLOY_DIR/frontend-service.yaml" | kubectl apply -n "$NAMESPACE" -f -
    if kubectl get backendconfig ds-catalog-backend-config -n "$NAMESPACE" &>/dev/null; then
        # Keep IAP (set up by setup-iap.sh) attached across redeploys
        kubectl annotate service ds-catalog-frontend -n "$NAMESPACE" \
            cloud.google.com/backend-config='{"default":"ds-catalog-backend-config"}' --overwrite
    fi

    if [ -z "$DOMAIN" ]; then
        local frontend_ip
        if ! frontend_ip=$(wait_for_ip "ds-catalog-frontend" "$NAMESPACE"); then
            print_error "The frontend LoadBalancer did not get an external IP within 5 minutes"
            exit 1
        fi
        frontend_url="http://${frontend_ip}.nip.io"
    fi

    print_info "Applying ConfigMap (FRONTEND_URL=$frontend_url)..."
    apply_configmap "$frontend_url"

    print_info "Applying backend..."
    sed "s|IMAGE_URL_PLACEHOLDER|${BACKEND_IMAGE}|g" \
        "$DEPLOY_DIR/deployment.yaml" | kubectl apply -n "$NAMESPACE" -f -
    kubectl apply -n "$NAMESPACE" -f "$DEPLOY_DIR/service.yaml"

    print_info "Applying frontend..."
    sed "s|IMAGE_URL_PLACEHOLDER|${FRONTEND_IMAGE}|g" \
        "$DEPLOY_DIR/frontend-deployment.yaml" | kubectl apply -n "$NAMESPACE" -f -

    kubectl apply -n "$NAMESPACE" -f "$DEPLOY_DIR/autoscaling.yaml"

    if [ -n "$DOMAIN" ]; then
        if ! gcloud compute addresses describe "$STATIC_IP_NAME" --global --project="$PROJECT_ID" &>/dev/null; then
            print_info "Reserving global static IP $STATIC_IP_NAME..."
            gcloud compute addresses create "$STATIC_IP_NAME" --global --project="$PROJECT_ID"
        fi
        print_info "Applying HTTPS Ingress + managed certificate for $DOMAIN..."
        kubectl apply -n "$NAMESPACE" -f "$DEPLOY_DIR/frontend-config.yaml"
        sed "s|DOMAIN_PLACEHOLDER|${DOMAIN}|g" \
            "$DEPLOY_DIR/certificate.yaml" | kubectl apply -n "$NAMESPACE" -f -
        kubectl apply -n "$NAMESPACE" -f "$DEPLOY_DIR/ingress.yaml"
    fi

    print_success "All manifests applied"

    # Every deploy builds a new image tag, so the apply above already rolls the pods
    # and they pick up the new ConfigMap and Secret.
    print_info "Waiting for rollouts..."
    kubectl rollout status deployment/ds-catalog-backend  -n "$NAMESPACE" --timeout=5m
    kubectl rollout status deployment/ds-catalog-frontend -n "$NAMESPACE" --timeout=5m
    print_success "Rollouts complete"

    APP_URL="$frontend_url"
}

# ── Step 7: Summary ───────────────────────────────────────────────────────────
print_summary() {
    print_step 7 "Done!"

    echo -e "${GREEN}✓ Project:${NC}  $PROJECT_ID"
    echo -e "${GREEN}✓ Cluster:${NC}  $CLUSTER_NAME ($REGION)"
    echo -e "${GREEN}✓ Backend:${NC}  $BACKEND_IMAGE"
    echo -e "${GREEN}✓ Frontend:${NC} $FRONTEND_IMAGE"
    echo ""
    echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  App URL: $APP_URL${NC}"
    echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Register these on your OAuth client (APIs & Services → Credentials):"
    echo "  Authorised JavaScript origin: $APP_URL"
    echo "  Authorised redirect URI:      $APP_URL/api/v1/auth/callback"

    if [ -n "$DOMAIN" ]; then
        local ip
        ip=$(gcloud compute addresses describe "$STATIC_IP_NAME" --global \
            --project="$PROJECT_ID" --format="value(address)" 2>/dev/null || true)
        echo ""
        echo -e "${YELLOW}Point the DNS A record for $DOMAIN to $ip.${NC}"
        echo "The managed certificate is issued 10–60 min after DNS resolves:"
        echo "  kubectl describe managedcertificate ds-catalog-cert -n $NAMESPACE"
    else
        echo ""
        print_warning "The app is served over plain HTTP on a public IP. Use this for testing only;"
        print_warning "re-run with DOMAIN=<your domain> for HTTPS before real users or data."
    fi

    echo ""
    echo -e "${YELLOW}Useful commands:${NC}"
    echo "  ./utils.sh status"
    echo "  ./utils.sh logs ds-catalog-backend"
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
    set -euo pipefail

    if [ "${1:-}" == "secrets" ]; then
        [ -z "$PROJECT_ID" ] && { print_error "GCP_PROJECT_ID is required"; exit 1; }
        sync_secrets_from_secret_manager
        kubectl rollout restart deployment/ds-catalog-backend -n "$NAMESPACE"
        exit 0
    fi

    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║   DS Data Catalog — GKE Deployment       ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
    echo ""
    echo "  Project:        ${PROJECT_ID:-<not set>}"
    echo "  Region:         $REGION"
    echo "  Cluster:        $CLUSTER_NAME"
    echo "  Namespace:      $NAMESPACE"
    echo "  Registry:       $REGISTRY_TYPE"
    echo "  Domain:         ${DOMAIN:-<none — HTTP on a public IP>}"
    echo "  Admins:         ${ADMIN_EMAILS:-<not set>}"
    echo "  Allowed:        ${ALLOWED_EMAIL_DOMAINS:-} ${ALLOWED_EMAILS:-}"
    echo ""

    if [ "${ASSUME_YES:-0}" != "1" ]; then
        read -rp "Continue? (y/n) " -n 1; echo
        [[ ! $REPLY =~ ^[Yy]$ ]] && echo "Aborted." && exit 0
    fi

    check_prerequisites
    setup_project
    create_cluster
    setup_workload_identity
    build_and_push_images
    deploy_to_kubernetes
    print_summary
}

main "$@"
