#!/bin/bash

# DS Data Catalog — GKE Deployment Script
# =========================================
# Builds and pushes both backend and frontend images, then applies all K8s
# manifests in order: postgres → secret → configmap → service-account →
# backend deployment/service → frontend deployment/service.

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ── Configuration ─────────────────────────────────────────────────────────────

PROJECT_ID="${GCP_PROJECT_ID:-formare-ai}"
REGION="${GCP_REGION:-europe-west1}"
CLUSTER_NAME="${CLUSTER_NAME:-ai-agents-cluster}"
NAMESPACE="${K8S_NAMESPACE:-default}"

# Image registry (gcr or artifact-registry)
REGISTRY_TYPE="${REGISTRY_TYPE:-gcr}"
AR_LOCATION="${AR_LOCATION:-$REGION}"
AR_REPOSITORY="${AR_REPOSITORY:-docker-repo}"

# Build context is two levels up from scripts/ → catalog_app/
BUILD_CONTEXT="$(cd "$(dirname "$0")/../.." && pwd)"
K8S_DIR="$(cd "$(dirname "$0")/../k8s" && pwd)"

# ── Helpers ───────────────────────────────────────────────────────────────────

print_header() { echo -e "\n${BLUE}========================================${NC}\n${BLUE}$1${NC}\n${BLUE}========================================${NC}\n"; }
print_info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }

get_image_url() {
    local name=$1 tag=$2
    if [ "$REGISTRY_TYPE" == "gcr" ]; then
        echo "gcr.io/${PROJECT_ID}/${name}:${tag}"
    else
        echo "${AR_LOCATION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPOSITORY}/${name}:${tag}"
    fi
}

wait_for_external_ip() {
    local svc=$1 ns=${2:-$NAMESPACE}
    local timeout=300 interval=10 elapsed=0
    print_info "Waiting for external IP for $svc..."
    while [ $elapsed -lt $timeout ]; do
        local ip=$(kubectl get service "$svc" -n "$ns" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")
        [ -n "$ip" ] && echo "$ip" && return 0
        sleep $interval; elapsed=$((elapsed + interval))
        print_info "Still waiting... ($elapsed/${timeout}s)"
    done
    return 1
}

# ── Prerequisite checks ───────────────────────────────────────────────────────

check_prerequisites() {
    print_header "Checking Prerequisites"
    for cmd in docker kubectl gcloud; do
        command -v "$cmd" &>/dev/null || { print_error "$cmd not found"; exit 1; }
        print_info "$cmd: ✓"
    done
    print_success "Prerequisites OK"
}

# ── Docker auth ───────────────────────────────────────────────────────────────

configure_docker_auth() {
    print_header "Configuring Docker Authentication"
    if [ "$REGISTRY_TYPE" == "gcr" ]; then
        gcloud auth configure-docker --quiet
    else
        gcloud auth configure-docker "${AR_LOCATION}-docker.pkg.dev" --quiet
    fi
    print_success "Docker auth configured"
}

# ── Build & push ──────────────────────────────────────────────────────────────

build_and_push() {
    local name=$1 dockerfile=$2
    local tag=$(date +%Y%m%d-%H%M%S)
    local image=$(get_image_url "$name" "$tag")
    local latest=$(get_image_url "$name" "latest")

    print_header "Building $name"
    print_info "Dockerfile: $dockerfile"
    print_info "Image: $image"

    docker build \
        --platform=linux/amd64 \
        -f "${BUILD_CONTEXT}/${dockerfile}" \
        -t "$image" \
        -t "$latest" \
        "$BUILD_CONTEXT"

    print_info "Pushing $image"
    docker push "$image"
    docker push "$latest"

    print_success "$name image built and pushed"
    # Export for use in deploy step
    eval "export ${name//-/_}_IMAGE_URL=$image"
}

# ── Apply K8s manifests ───────────────────────────────────────────────────────

apply_manifests() {
    print_header "Applying Kubernetes Manifests"

    # Postgres (StatefulSet + Service + PVC)
    print_info "Applying PostgreSQL..."
    kubectl apply -n "$NAMESPACE" -f "$K8S_DIR/postgres.yaml"

    # Wait for postgres to be ready before starting backend
    print_info "Waiting for PostgreSQL to be ready (up to 3 min)..."
    kubectl rollout status statefulset/ds-catalog-postgres -n "$NAMESPACE" --timeout=3m || true

    # Config + Secret
    print_info "Applying ConfigMap..."
    kubectl apply -n "$NAMESPACE" -f "$K8S_DIR/configmap.yaml"

    print_info "Applying Secret..."
    # Only create if it doesn't exist — don't overwrite with template values
    if ! kubectl get secret ds-catalog-secret -n "$NAMESPACE" &>/dev/null; then
        kubectl apply -n "$NAMESPACE" -f "$K8S_DIR/secret.yaml"
        print_warning "Secret created from template. Update real values with:"
        print_warning "  kubectl edit secret ds-catalog-secret -n $NAMESPACE"
    else
        print_info "Secret ds-catalog-secret already exists — skipping template apply"
    fi

    # Service account
    print_info "Applying ServiceAccount..."
    kubectl apply -n "$NAMESPACE" -f "$K8S_DIR/service-account.yaml"

    # Backend deployment + service (substitute real image URL)
    print_info "Applying backend deployment..."
    sed "s|IMAGE_URL_PLACEHOLDER|${ds_catalog_backend_IMAGE_URL}|g" \
        "$K8S_DIR/deployment.yaml" | kubectl apply -n "$NAMESPACE" -f -
    kubectl apply -n "$NAMESPACE" -f "$K8S_DIR/service.yaml"

    # Frontend deployment + service (substitute real image URL)
    print_info "Applying frontend deployment..."
    sed "s|IMAGE_URL_PLACEHOLDER|${ds_catalog_frontend_IMAGE_URL}|g" \
        "$K8S_DIR/frontend-deployment.yaml" | kubectl apply -n "$NAMESPACE" -f -
    kubectl apply -n "$NAMESPACE" -f "$K8S_DIR/frontend-service.yaml"

    # Autoscaling
    print_info "Applying HPA..."
    kubectl apply -n "$NAMESPACE" -f "$K8S_DIR/autoscaling.yaml"

    print_success "All manifests applied"
}

# ── Wait for rollouts ─────────────────────────────────────────────────────────

wait_for_rollouts() {
    print_header "Waiting for Rollouts"
    kubectl rollout status deployment/ds-catalog-backend  -n "$NAMESPACE" --timeout=5m
    kubectl rollout status deployment/ds-catalog-frontend -n "$NAMESPACE" --timeout=5m
    print_success "Both rollouts complete"
}

# ── Summary ───────────────────────────────────────────────────────────────────

print_summary() {
    print_header "Deployment Complete!"

    echo -e "${GREEN}✓ Project:${NC}  $PROJECT_ID"
    echo -e "${GREEN}✓ Cluster:${NC}  $CLUSTER_NAME ($REGION)"
    echo -e "${GREEN}✓ Backend:${NC}  ${ds_catalog_backend_IMAGE_URL}"
    echo -e "${GREEN}✓ Frontend:${NC} ${ds_catalog_frontend_IMAGE_URL}"

    local frontend_ip=$(wait_for_external_ip "ds-catalog-frontend" "$NAMESPACE" 2>/dev/null || echo "pending")
    if [ "$frontend_ip" != "pending" ]; then
        echo ""
        echo -e "${YELLOW}Access the app:${NC}"
        echo "  http://$frontend_ip"
        echo ""
        echo -e "${YELLOW}Update ConfigMap FRONTEND_URL:${NC}"
        echo "  kubectl patch configmap ds-catalog-config -n $NAMESPACE \\"
        echo "    -p '{\"data\":{\"FRONTEND_URL\":\"http://$frontend_ip\"}}'"
        echo "  kubectl rollout restart deployment/ds-catalog-backend -n $NAMESPACE"
    else
        echo ""
        echo -e "${YELLOW}Get frontend IP (may take a few minutes):${NC}"
        echo "  kubectl get service ds-catalog-frontend -n $NAMESPACE"
    fi

    echo ""
    echo -e "${YELLOW}Useful commands:${NC}"
    echo "  kubectl get pods -n $NAMESPACE"
    echo "  kubectl logs -l app=ds-catalog-backend -n $NAMESPACE --tail=50"
    echo "  kubectl logs -l app=ds-catalog-frontend -n $NAMESPACE --tail=50"
    echo "  kubectl logs -l app=ds-catalog-postgres -n $NAMESPACE --tail=50"
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
    print_header "DS Data Catalog — GKE Deployment"

    echo "Configuration:"
    echo "  Project:   $PROJECT_ID"
    echo "  Cluster:   $CLUSTER_NAME"
    echo "  Region:    $REGION"
    echo "  Namespace: $NAMESPACE"
    echo "  Registry:  $REGISTRY_TYPE"
    echo ""

    read -p "Continue with deployment? (y/n) " -n 1 -r; echo
    [[ ! $REPLY =~ ^[Yy]$ ]] && { print_warning "Aborted"; exit 0; }

    check_prerequisites
    gcloud config set project "$PROJECT_ID"
    configure_docker_auth

    build_and_push "ds-catalog-backend"  "Dockerfile.backend"
    build_and_push "ds-catalog-frontend" "Dockerfile.frontend"

    gcloud container clusters get-credentials "$CLUSTER_NAME" \
        --region="$REGION" --project="$PROJECT_ID"

    apply_manifests
    wait_for_rollouts
    print_summary
}

main "$@"
