#!/bin/bash

# DS Data Catalog — Cluster IP Discovery
# ========================================
# Shows all public endpoints for the cluster and its services.

PROJECT_ID="${GCP_PROJECT_ID:-formare-ai}"
REGION="${GCP_REGION:-europe-west1}"
CLUSTER_NAME="${CLUSTER_NAME:-ai-agents-cluster}"
NAMESPACE="${K8S_NAMESPACE:-default}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "\n${BLUE}══════════════════════════════════════${NC}"
echo -e "${BLUE}  DS Data Catalog — Cluster Endpoints${NC}"
echo -e "${BLUE}══════════════════════════════════════${NC}\n"
echo "  Project:   $PROJECT_ID"
echo "  Cluster:   $CLUSTER_NAME"
echo "  Region:    $REGION"
echo "  Namespace: $NAMESPACE"
echo ""

# Cluster API endpoint
ENDPOINT=$(gcloud container clusters describe "$CLUSTER_NAME" \
    --region="$REGION" --project="$PROJECT_ID" \
    --format="value(endpoint)" 2>/dev/null || echo "not found")
echo -e "${YELLOW}Cluster API:${NC} $ENDPOINT"

echo -e "\n${YELLOW}LoadBalancer Services:${NC}"
kubectl get services -n "$NAMESPACE" \
    -o custom-columns="NAME:.metadata.name,TYPE:.spec.type,EXTERNAL-IP:.status.loadBalancer.ingress[0].ip,PORT:.spec.ports[*].port"

echo -e "\n${YELLOW}Ingresses:${NC}"
kubectl get ingress -n "$NAMESPACE" 2>/dev/null \
    -o custom-columns="NAME:.metadata.name,ADDRESS:.status.loadBalancer.ingress[0].ip,RULES:.spec.rules[*].host" \
    || echo "  No ingresses found"

echo -e "\n${YELLOW}Pods:${NC}"
kubectl get pods -n "$NAMESPACE" \
    -o custom-columns="NAME:.metadata.name,STATUS:.status.phase,READY:.status.containerStatuses[0].ready,RESTARTS:.status.containerStatuses[0].restartCount"

FRONTEND_IP=$(kubectl get service ds-catalog-frontend -n "$NAMESPACE" \
    -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)

if [ -n "$FRONTEND_IP" ]; then
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  App URL: http://$FRONTEND_IP${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
fi
