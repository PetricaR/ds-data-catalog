#!/bin/bash

# DS Data Catalog — Full GKE Deployment
# =======================================
# One-shot script: sets up Workload Identity → builds & deploys.
# Cluster creation is skipped if the cluster already exists.
# Run from catalog_app/deploy/:
#   GCP_PROJECT_ID=formare-ai CLUSTER_NAME=my-existing-cluster ./deploy.sh
#
# Environment variables (all have defaults):
#   GCP_PROJECT_ID   GCP project (default: formare-ai)
#   GCP_REGION       Region (default: europe-west1)
#   CLUSTER_NAME     GKE cluster name (default: ds-catalog-cluster)
#   REGISTRY_TYPE    gcr or artifact-registry (default: gcr)
#   K8S_NAMESPACE    K8s namespace (default: default)
#   SKIP_CLUSTER     Set to "1" to skip cluster creation entirely

set -e

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── Config ────────────────────────────────────────────────────────────────────
export PROJECT_ID="${GCP_PROJECT_ID:-formare-ai}"
export REGION="${GCP_REGION:-europe-west1}"
export CLUSTER_NAME="${CLUSTER_NAME:-ai-agents-cluster}"
export NAMESPACE="${K8S_NAMESPACE:-default}"
export REGISTRY_TYPE="${REGISTRY_TYPE:-gcr}"
export AR_LOCATION="${AR_LOCATION:-$REGION}"
export AR_REPOSITORY="${AR_REPOSITORY:-docker-repo}"
export APP_NAME="ds-catalog"
export SKIP_CLUSTER="${SKIP_CLUSTER:-0}"

# Paths — script lives in catalog_app/deploy/
DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_CONTEXT="$(cd "$DEPLOY_DIR/.." && pwd)"   # catalog_app/

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

wait_for_ip() {
    local svc=$1 ns=${2:-$NAMESPACE}
    local timeout=300 interval=10 elapsed=0
    while [ $elapsed -lt $timeout ]; do
        local ip
        ip=$(kubectl get service "$svc" -n "$ns" \
             -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)
        [ -n "$ip" ] && echo "$ip" && return 0
        sleep $interval; elapsed=$((elapsed + interval))
        print_info "Waiting for external IP... ($elapsed/${timeout}s)"
    done
    return 1
}

# ── Step 1: Prerequisites ─────────────────────────────────────────────────────
check_prerequisites() {
    print_step 1 "Checking prerequisites"
    for cmd in gcloud docker kubectl; do
        if ! command -v "$cmd" &>/dev/null; then
            print_error "$cmd is not installed"
            [ "$cmd" == "gcloud" ]   && echo "Install: https://cloud.google.com/sdk/docs/install"
            [ "$cmd" == "docker" ]   && echo "Install: https://docs.docker.com/engine/install/"
            [ "$cmd" == "kubectl" ]  && echo "Run: gcloud components install kubectl"
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
        aiplatform.googleapis.com
        bigquery.googleapis.com
        bigquerystorage.googleapis.com
        secretmanager.googleapis.com
        cloudresourcemanager.googleapis.com
        iam.googleapis.com
        logging.googleapis.com
        monitoring.googleapis.com
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

    # Grant IAM roles
    local roles=(
        roles/aiplatform.user
        roles/bigquery.jobUser
        roles/bigquery.dataViewer
        roles/bigquery.metadataViewer
        roles/secretmanager.secretAccessor
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
        --project="$PROJECT_ID"

    # K8s service account
    kubectl get namespace "$NAMESPACE" &>/dev/null || kubectl create namespace "$NAMESPACE"
    kubectl get serviceaccount "$K8S_SA_NAME" -n "$NAMESPACE" &>/dev/null \
        || kubectl create serviceaccount "$K8S_SA_NAME" -n "$NAMESPACE"
    kubectl annotate serviceaccount "$K8S_SA_NAME" -n "$NAMESPACE" \
        iam.gke.io/gcp-service-account="$GCP_SA_EMAIL" --overwrite

    print_success "Workload Identity configured"
}

# ── Step 5: Build & push images (via Cloud Build) ────────────────────────────
# Uses 'gcloud builds submit' — builds in GCP, pushes directly to GCR.
# Avoids all local Docker BuildKit / docker-container driver issues on Mac.
build_and_push_images() {
    print_step 5 "Building & pushing Docker images (Cloud Build)"

    local TAG
    TAG=$(date +%Y%m%d-%H%M%S)

    # Enable Cloud Build API if not already enabled
    gcloud services enable cloudbuild.googleapis.com --project="$PROJECT_ID" --quiet

    for name in ds-catalog-backend ds-catalog-frontend; do
        local dockerfile
        [ "$name" == "ds-catalog-backend" ] && dockerfile="Dockerfile.backend" || dockerfile="Dockerfile.frontend"

        local image latest
        image=$(get_image_url "$name" "$TAG")
        latest=$(get_image_url "$name" "latest")

        print_info "Submitting $name to Cloud Build → $image"
        local tmpconfig
        tmpconfig=$(mktemp /tmp/cloudbuild-XXXXXX)
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

        [ "$name" == "ds-catalog-backend" ]  && export BACKEND_IMAGE="$image"
        [ "$name" == "ds-catalog-frontend" ] && export FRONTEND_IMAGE="$image"
    done
}

# ── Step 6: Apply K8s manifests ───────────────────────────────────────────────
deploy_to_kubernetes() {
    print_step 6 "Deploying to Kubernetes"

    # Postgres first — backend needs DB on startup
    print_info "Applying PostgreSQL..."
    kubectl apply -n "$NAMESPACE" -f "$DEPLOY_DIR/postgres.yaml"
    kubectl rollout status statefulset/ds-catalog-postgres -n "$NAMESPACE" --timeout=3m || true

    # Config
    print_info "Applying ConfigMap..."
    kubectl apply -n "$NAMESPACE" -f "$DEPLOY_DIR/configmap.yaml"

    # Secret — only create if absent (never overwrite real creds with template)
    if kubectl get secret ds-catalog-secret -n "$NAMESPACE" &>/dev/null; then
        print_info "Secret already exists — skipping template apply"
    else
        kubectl apply -n "$NAMESPACE" -f "$DEPLOY_DIR/secret.yaml"
        print_warning "Secret created from template. Update real values:"
        print_warning "  kubectl edit secret ds-catalog-secret -n $NAMESPACE"
    fi

    # ServiceAccount
    print_info "Applying ServiceAccount..."
    kubectl apply -n "$NAMESPACE" -f "$DEPLOY_DIR/service-account.yaml"

    # Backend
    print_info "Applying backend..."
    sed "s|IMAGE_URL_PLACEHOLDER|${BACKEND_IMAGE}|g" \
        "$DEPLOY_DIR/deployment.yaml" | kubectl apply -n "$NAMESPACE" -f -
    kubectl apply -n "$NAMESPACE" -f "$DEPLOY_DIR/service.yaml"

    # Frontend
    print_info "Applying frontend..."
    sed "s|IMAGE_URL_PLACEHOLDER|${FRONTEND_IMAGE}|g" \
        "$DEPLOY_DIR/frontend-deployment.yaml" | kubectl apply -n "$NAMESPACE" -f -
    kubectl apply -n "$NAMESPACE" -f "$DEPLOY_DIR/frontend-service.yaml"

    # HPA
    kubectl apply -n "$NAMESPACE" -f "$DEPLOY_DIR/autoscaling.yaml"

    print_success "All manifests applied"

    # Wait for rollouts
    print_info "Waiting for backend rollout..."
    kubectl rollout status deployment/ds-catalog-backend  -n "$NAMESPACE" --timeout=5m
    print_info "Waiting for frontend rollout..."
    kubectl rollout status deployment/ds-catalog-frontend -n "$NAMESPACE" --timeout=5m
    print_success "Rollouts complete"
}

# ── Step 7: Summary ───────────────────────────────────────────────────────────
print_summary() {
    print_step 7 "Done!"

    local ip
    ip=$(wait_for_ip "ds-catalog-frontend" "$NAMESPACE" 2>/dev/null || echo "")

    echo ""
    echo -e "${GREEN}✓ Project:${NC}  $PROJECT_ID"
    echo -e "${GREEN}✓ Cluster:${NC}  $CLUSTER_NAME ($REGION)"
    echo -e "${GREEN}✓ Backend:${NC}  $BACKEND_IMAGE"
    echo -e "${GREEN}✓ Frontend:${NC} $FRONTEND_IMAGE"

    if [ -n "$ip" ]; then
        echo ""
        echo -e "${CYAN}══════════════════════════════════════${NC}"
        echo -e "${CYAN}  App URL: http://$ip${NC}"
        echo -e "${CYAN}══════════════════════════════════════${NC}"
        echo ""
        echo -e "${YELLOW}Update FRONTEND_URL in ConfigMap so OAuth login redirects correctly:${NC}"
        echo "  kubectl patch configmap ds-catalog-config -n $NAMESPACE \\"
        echo "    -p '{\"data\":{\"FRONTEND_URL\":\"http://$ip\"}}'"
        echo "  kubectl rollout restart deployment/ds-catalog-backend -n $NAMESPACE"
    else
        echo ""
        echo -e "${YELLOW}External IP not ready yet. Check later:${NC}"
        echo "  kubectl get service ds-catalog-frontend -n $NAMESPACE"
    fi

    echo ""
    echo -e "${YELLOW}Useful commands:${NC}"
    echo "  kubectl get pods -n $NAMESPACE"
    echo "  kubectl logs -l app=ds-catalog-backend  -n $NAMESPACE --tail=50"
    echo "  kubectl logs -l app=ds-catalog-frontend -n $NAMESPACE --tail=50"
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║   DS Data Catalog — GKE Deployment       ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
    echo ""
    echo "  Project:        $PROJECT_ID"
    echo "  Region:         $REGION"
    echo "  Cluster:        $CLUSTER_NAME"
    echo "  Namespace:      $NAMESPACE"
    echo "  Registry:       $REGISTRY_TYPE"
    echo "  Skip cluster:   $SKIP_CLUSTER (set SKIP_CLUSTER=1 to reuse existing)"
    echo ""

    read -rp "Continue? (y/n) " -n 1; echo
    [[ ! $REPLY =~ ^[Yy]$ ]] && echo "Aborted." && exit 0

    check_prerequisites
    setup_project
    create_cluster
    setup_workload_identity
    build_and_push_images
    deploy_to_kubernetes
    print_summary
}

main "$@"
