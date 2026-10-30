#!/bin/bash

# DS Data Catalog — IAP (Identity-Aware Proxy) Setup
# ====================================================
# Optional extra layer: Google checks identity at the load balancer, before any
# request reaches the app (which still enforces its own sign-in and roles).
#
# Run AFTER an HTTPS deploy:  DOMAIN=catalog.example.com ./deploy.sh
# Prerequisites: OAuth consent screen configured in the GCP Console:
#   https://console.cloud.google.com/apis/credentials/consent
#
# Usage:
#   GCP_PROJECT_ID=my-project IAP_MEMBERS="group:data-team@example.com,user:me@example.com" ./setup-iap.sh
#
#   IAP_MEMBERS  Comma-separated IAM members (user:, group:, domain:). Bare emails are treated as user:.

set -euo pipefail

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
PROJECT_ID="${GCP_PROJECT_ID:-}"
REGION="${GCP_REGION:-europe-west1}"
CLUSTER_NAME="${CLUSTER_NAME:-ds-catalog-cluster}"
NAMESPACE="${K8S_NAMESPACE:-default}"
IAP_MEMBERS="${IAP_MEMBERS:-}"

if [ -z "$PROJECT_ID" ] || [ -z "$IAP_MEMBERS" ]; then
    print_error "GCP_PROJECT_ID and IAP_MEMBERS are required"
    exit 1
fi

members=()
IFS=',' read -r -a raw_members <<< "$IAP_MEMBERS"
for m in "${raw_members[@]}"; do
    m="$(echo "$m" | tr -d '[:space:]')"
    [ -z "$m" ] && continue
    case "$m" in
        *:*) members+=("$m") ;;
        *)   members+=("user:$m") ;;
    esac
done

# ── Step 1: Check the HTTPS Ingress exists ────────────────────────────────────
check_ingress() {
    if ! kubectl get ingress ds-catalog-ingress -n "$NAMESPACE" &>/dev/null; then
        print_error "No ds-catalog-ingress in namespace $NAMESPACE."
        print_error "IAP needs the HTTPS load balancer — deploy first with: DOMAIN=<your domain> ./deploy.sh"
        exit 1
    fi
}

# ── Step 2: Enable APIs ───────────────────────────────────────────────────────
enable_apis() {
    print_header "Enabling IAP API"
    gcloud services enable iap.googleapis.com --project="$PROJECT_ID"
    print_success "API enabled"
}

# ── Step 3: Create OAuth secret ───────────────────────────────────────────────
create_oauth_secret() {
    print_header "Creating OAuth Secret"

    if kubectl get secret iap-oauth-secret -n "$NAMESPACE" &>/dev/null; then
        print_info "iap-oauth-secret already exists — skipping"
        return
    fi

    print_warning "IAP needs its own OAuth 2.0 client (Web application) from:"
    print_warning "  https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID"
    echo ""
    read -rp "OAuth Client ID: " OAUTH_CLIENT_ID
    read -rsp "OAuth Client Secret: " OAUTH_CLIENT_SECRET
    echo ""

    kubectl create secret generic iap-oauth-secret \
        --from-literal=client_id="$OAUTH_CLIENT_ID" \
        --from-literal=client_secret="$OAUTH_CLIENT_SECRET" \
        -n "$NAMESPACE"
    print_success "OAuth secret created"
}

# ── Step 4: Create BackendConfig and attach it to the frontend service ───────
enable_iap_on_service() {
    print_header "Enabling IAP on the frontend backend service"
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
    # deploy.sh re-applies this annotation on every redeploy once the BackendConfig exists
    kubectl annotate service ds-catalog-frontend -n "$NAMESPACE" \
        cloud.google.com/backend-config='{"default":"ds-catalog-backend-config"}' \
        --overwrite
    print_success "IAP enabled on ds-catalog-frontend"
}

# ── Step 5: Grant IAP access ──────────────────────────────────────────────────
grant_iap_access() {
    print_header "Granting IAP Access"
    local backend_svc
    backend_svc=$(gcloud compute backend-services list \
        --filter="name~ds-catalog-frontend" --format="value(name)" \
        --project="$PROJECT_ID" 2>/dev/null | head -n 1)

    if [ -z "$backend_svc" ]; then
        print_warning "Backend service not found yet — the Ingress may still be provisioning."
        print_warning "Re-run this script later, or grant access manually:"
        for member in "${members[@]}"; do
            echo "  gcloud iap web add-iam-policy-binding --resource-type=backend-services \\"
            echo "    --service=<BACKEND_SVC> --member=$member \\"
            echo "    --role=roles/iap.httpsResourceAccessor --project=$PROJECT_ID"
        done
        return
    fi

    for member in "${members[@]}"; do
        print_info "Granting access to $member"
        gcloud iap web add-iam-policy-binding \
            --resource-type=backend-services \
            --service="$backend_svc" \
            --member="$member" \
            --role=roles/iap.httpsResourceAccessor \
            --project="$PROJECT_ID" >/dev/null
    done
    print_success "Access granted to ${#members[@]} member(s)"
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
    print_header "DS Data Catalog — IAP Setup"
    echo "Members to allow: ${members[*]}"
    echo ""
    read -rp "Continue? (y/n) " -n 1; echo
    [[ ! $REPLY =~ ^[Yy]$ ]] && echo "Aborted." && exit 0

    gcloud container clusters get-credentials "$CLUSTER_NAME" \
        --region="$REGION" --project="$PROJECT_ID"

    check_ingress
    enable_apis
    create_oauth_secret
    enable_iap_on_service
    grant_iap_access

    print_header "IAP Setup Complete"
    echo -e "${GREEN}✓${NC} The load balancer now requires Google sign-in before any request reaches the app"
    echo "To add members, re-run with a new IAP_MEMBERS list."
}

main "$@"
