#!/bin/bash

# DS Data Catalog — IAP (Identity-Aware Proxy) Setup
# ====================================================
# Adds Google authentication in front of the app — only allow-listed
# emails can access it (no public internet access).
#
# Run AFTER deploy.sh has completed and the app is live.
# Prerequisites: OAuth consent screen must be set up in GCP Console first.
#   https://console.cloud.google.com/apis/credentials/consent

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

print_header()  { echo -e "\n${BLUE}════════════════════════════════${NC}\n${BLUE}$1${NC}\n${BLUE}════════════════════════════════${NC}\n"; }
print_info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
print_success() { echo -e "${GREEN}[OK]${NC} $1"; }

# ── Config ────────────────────────────────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT_ID:-formare-ai}"
REGION="${GCP_REGION:-europe-west1}"
CLUSTER_NAME="${CLUSTER_NAME:-ai-agents-cluster}"
NAMESPACE="${K8S_NAMESPACE:-default}"
APP_NAME="ds-catalog-frontend"
STATIC_IP_NAME="ds-catalog-ip"

# Emails to grant access
ALLOWED_EMAILS=(
    "petrica.radan@formare.ai"
    # Add more:
    # "colleague@formare.ai"
)

# ── Step 1: Enable APIs ───────────────────────────────────────────────────────
enable_apis() {
    print_header "Enabling IAP APIs"
    gcloud services enable iap.googleapis.com certificatemanager.googleapis.com --project="$PROJECT_ID"
    print_success "APIs enabled"
}

# ── Step 2: Reserve static IP ─────────────────────────────────────────────────
reserve_static_ip() {
    print_header "Reserving Static Global IP"
    if gcloud compute addresses describe "$STATIC_IP_NAME" --global --project="$PROJECT_ID" &>/dev/null; then
        print_info "Static IP already exists — skipping"
    else
        gcloud compute addresses create "$STATIC_IP_NAME" --global --project="$PROJECT_ID"
        print_success "Static IP reserved"
    fi
    local ip
    ip=$(gcloud compute addresses describe "$STATIC_IP_NAME" --global --project="$PROJECT_ID" --format="value(address)")
    echo -e "${YELLOW}Static IP: $ip${NC}"
    echo "Point your DNS A-record to: $ip"
    echo ""
    read -rp "Press Enter once DNS is set and OAuth consent screen is configured..."
}

# ── Step 3: Create OAuth secret ───────────────────────────────────────────────
create_oauth_secret() {
    print_header "Creating OAuth Secret"
    print_warning "You need an OAuth 2.0 Client ID and Secret from:"
    print_warning "  https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID"
    echo ""

    if kubectl get secret iap-oauth-secret -n "$NAMESPACE" &>/dev/null; then
        print_info "iap-oauth-secret already exists — skipping"
        return
    fi

    read -rp "OAuth Client ID: " OAUTH_CLIENT_ID
    read -rsp "OAuth Client Secret: " OAUTH_CLIENT_SECRET
    echo ""

    kubectl create secret generic iap-oauth-secret \
        --from-literal=client_id="$OAUTH_CLIENT_ID" \
        --from-literal=client_secret="$OAUTH_CLIENT_SECRET" \
        -n "$NAMESPACE"
    print_success "OAuth secret created"
}

# ── Step 4: Create BackendConfig ──────────────────────────────────────────────
create_backend_config() {
    print_header "Creating BackendConfig with IAP"
    cat <<EOF | kubectl apply -n "$NAMESPACE" -f -
apiVersion: cloud.google.com/v1
kind: BackendConfig
metadata:
  name: ds-catalog-backend-config
spec:
  iap:
    enabled: true
    oauthclientCredentials:
      secretName: iap-oauth-secret
EOF
    print_success "BackendConfig applied"
}

# ── Step 5: Annotate frontend service ─────────────────────────────────────────
annotate_service() {
    print_header "Annotating Frontend Service for IAP"
    kubectl annotate service ds-catalog-frontend -n "$NAMESPACE" \
        beta.cloud.google.com/backend-config='{"default":"ds-catalog-backend-config"}' \
        --overwrite
    # Change to ClusterIP so traffic goes through the Ingress
    kubectl patch service ds-catalog-frontend -n "$NAMESPACE" \
        -p '{"spec":{"type":"ClusterIP"}}'
    print_success "Service annotated and changed to ClusterIP"
}

# ── Step 6: Create Ingress with managed cert ──────────────────────────────────
create_ingress() {
    print_header "Creating Ingress + ManagedCertificate"

    read -rp "Enter your domain (e.g. catalog.formare-ai.com): " DOMAIN

    cat <<EOF | kubectl apply -n "$NAMESPACE" -f -
apiVersion: networking.gke.io/v1
kind: ManagedCertificate
metadata:
  name: ds-catalog-cert
spec:
  domains:
    - $DOMAIN
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ds-catalog-ingress
  annotations:
    kubernetes.io/ingress.class: "gce"
    networking.gke.io/managed-certificates: "ds-catalog-cert"
    kubernetes.io/ingress.global-static-ip-name: "$STATIC_IP_NAME"
spec:
  defaultBackend:
    service:
      name: ds-catalog-frontend
      port:
        number: 80
EOF
    print_success "Ingress and certificate created"
    print_warning "TLS certificate provisioning takes 10–30 min after DNS propagates"
}

# ── Step 7: Grant IAP access ──────────────────────────────────────────────────
grant_iap_access() {
    print_header "Granting IAP Access"
    # Find the backend service name
    local backend_svc
    backend_svc=$(gcloud compute backend-services list \
        --filter="name~ds-catalog" --format="value(name)" \
        --project="$PROJECT_ID" 2>/dev/null | head -n 1)

    if [ -z "$backend_svc" ]; then
        print_warning "Backend service not found yet — Ingress may still be provisioning."
        print_warning "Re-run this script later or grant access manually:"
        for email in "${ALLOWED_EMAILS[@]}"; do
            echo "  gcloud iap web add-iam-policy-binding --resource-type=backend-services \\"
            echo "    --service=<BACKEND_SVC> --member=user:$email \\"
            echo "    --role=roles/iap.httpsResourceAccessor --project=$PROJECT_ID"
        done
        return
    fi

    for email in "${ALLOWED_EMAILS[@]}"; do
        print_info "Granting access to $email"
        gcloud iap web add-iam-policy-binding \
            --resource-type=backend-services \
            --service="$backend_svc" \
            --member="user:$email" \
            --role=roles/iap.httpsResourceAccessor \
            --project="$PROJECT_ID"
    done
    print_success "Access granted to ${#ALLOWED_EMAILS[@]} user(s)"
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
    print_header "DS Data Catalog — IAP Setup"
    echo "This script secures the app with Google authentication."
    echo "Only the emails listed in ALLOWED_EMAILS will have access."
    echo ""
    read -rp "Continue? (y/n) " -n 1; echo
    [[ ! $REPLY =~ ^[Yy]$ ]] && echo "Aborted." && exit 0

    gcloud container clusters get-credentials "$CLUSTER_NAME" \
        --region="$REGION" --project="$PROJECT_ID"

    enable_apis
    reserve_static_ip
    create_oauth_secret
    create_backend_config
    annotate_service
    create_ingress
    grant_iap_access

    print_header "IAP Setup Complete"
    echo -e "${GREEN}✓${NC} The app is now secured with IAP"
    echo -e "${GREEN}✓${NC} Allowed users: ${ALLOWED_EMAILS[*]}"
    echo ""
    echo "To verify:  ./utils.sh status"
    echo "To add users, edit ALLOWED_EMAILS and re-run this script."
}

main "$@"
