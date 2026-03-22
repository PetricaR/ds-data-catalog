#!/bin/bash

# DS Data Catalog — Cluster Utilities
# =====================================
# Quick management commands for the running cluster.
#
# Usage:  ./utils.sh <command> [args]
# Run from any directory.

NAMESPACE="${K8S_NAMESPACE:-default}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

print_info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

# ── Commands ──────────────────────────────────────────────────────────────────

# View logs (live follow)
cmd_logs() {
    local app="${1:-ds-catalog-backend}" ns="${2:-$NAMESPACE}" lines="${3:-100}"
    print_info "Logs for $app (namespace: $ns, lines: $lines) — Ctrl+C to stop"
    kubectl logs -l app="$app" -n "$ns" --tail="$lines" -f
}

# Scale a deployment
cmd_scale() {
    local app="${1:-ds-catalog-backend}" replicas="${2:-2}" ns="${3:-$NAMESPACE}"
    print_info "Scaling $app → $replicas replicas"
    kubectl scale deployment "$app" --replicas="$replicas" -n "$ns"
    kubectl rollout status deployment "$app" -n "$ns"
}

# Restart a deployment (rolling restart)
cmd_restart() {
    local app="${1:-ds-catalog-backend}" ns="${2:-$NAMESPACE}"
    print_info "Restarting $app..."
    kubectl rollout restart deployment "$app" -n "$ns"
    kubectl rollout status deployment "$app" -n "$ns"
}

# Get external IP of a service
cmd_ip() {
    local svc="${1:-ds-catalog-frontend}" ns="${2:-$NAMESPACE}"
    local ip
    ip=$(kubectl get service "$svc" -n "$ns" \
         -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)
    if [ -n "$ip" ]; then
        echo -e "${GREEN}$svc:${NC} http://$ip"
    else
        print_warning "$svc has no external IP yet"
        kubectl get service "$svc" -n "$ns"
    fi
}

# Full cluster status
cmd_status() {
    local ns="${1:-$NAMESPACE}"
    echo -e "\n${CYAN}── Deployments ───────────────────────────────────${NC}"
    kubectl get deployments -n "$ns"

    echo -e "\n${CYAN}── Pods ──────────────────────────────────────────${NC}"
    kubectl get pods -n "$ns"

    echo -e "\n${CYAN}── Services ──────────────────────────────────────${NC}"
    kubectl get services -n "$ns"

    echo -e "\n${CYAN}── HPA ───────────────────────────────────────────${NC}"
    kubectl get hpa -n "$ns" 2>/dev/null || echo "No HPA found"

    echo -e "\n${CYAN}── External IP ───────────────────────────────────${NC}"
    cmd_ip "ds-catalog-frontend" "$ns"
}

# Show pod resource usage
cmd_top() {
    local ns="${1:-$NAMESPACE}"
    kubectl top pods -n "$ns" 2>/dev/null || print_warning "metrics-server not available"
}

# Show recent events (useful for debugging)
cmd_events() {
    local ns="${1:-$NAMESPACE}"
    kubectl get events -n "$ns" --sort-by='.lastTimestamp' | tail -30
}

# Exec into a backend pod
cmd_shell() {
    local ns="${1:-$NAMESPACE}"
    local pod
    pod=$(kubectl get pod -l app=ds-catalog-backend -n "$ns" \
          -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
    if [ -z "$pod" ]; then
        print_error "No ds-catalog-backend pod found in namespace $ns"
        exit 1
    fi
    print_info "Connecting to pod: $pod"
    kubectl exec -it "$pod" -n "$ns" -- /bin/sh
}

# Delete all ds-catalog resources (with confirmation)
cmd_delete() {
    local ns="${1:-$NAMESPACE}"
    echo -e "${YELLOW}WARNING: This will delete ALL ds-catalog resources in namespace $ns${NC}"
    echo "  Deployments: ds-catalog-backend, ds-catalog-frontend"
    echo "  StatefulSet: ds-catalog-postgres"
    echo "  Services, ConfigMap, Secret, HPA, PVC"
    read -rp "Type 'yes' to confirm: "
    if [ "$REPLY" = "yes" ]; then
        kubectl delete deployment ds-catalog-backend ds-catalog-frontend -n "$ns" --ignore-not-found
        kubectl delete statefulset ds-catalog-postgres -n "$ns" --ignore-not-found
        kubectl delete service ds-catalog-backend ds-catalog-frontend ds-catalog-postgres -n "$ns" --ignore-not-found
        kubectl delete hpa ds-catalog-backend-hpa -n "$ns" --ignore-not-found
        kubectl delete configmap ds-catalog-config -n "$ns" --ignore-not-found
        kubectl delete secret ds-catalog-secret -n "$ns" --ignore-not-found
        kubectl delete pvc ds-catalog-postgres-pvc -n "$ns" --ignore-not-found
        print_info "All ds-catalog resources deleted"
    else
        print_warning "Aborted"
    fi
}

# Redeploy with the latest image (pulls :latest)
cmd_rollout() {
    local ns="${1:-$NAMESPACE}"
    print_info "Forcing re-pull of latest images..."
    kubectl rollout restart deployment/ds-catalog-backend  -n "$ns"
    kubectl rollout restart deployment/ds-catalog-frontend -n "$ns"
    kubectl rollout status  deployment/ds-catalog-backend  -n "$ns"
    kubectl rollout status  deployment/ds-catalog-frontend -n "$ns"
    print_info "Done. Use './utils.sh ip' to get the frontend URL."
}

# ── Help & dispatch ───────────────────────────────────────────────────────────

print_help() {
    echo ""
    echo -e "${CYAN}DS Data Catalog — Cluster Utilities${NC}"
    echo ""
    echo "Usage: ./utils.sh <command> [args]"
    echo ""
    echo "Commands:"
    echo "  status  [namespace]              Full cluster status (deployments, pods, services, IP)"
    echo "  logs    [app] [ns] [lines]       Live log stream (default: ds-catalog-backend)"
    echo "  ip      [service] [ns]           Show external IP (default: ds-catalog-frontend)"
    echo "  restart [app] [ns]               Rolling restart a deployment"
    echo "  rollout [ns]                     Re-pull :latest image for backend + frontend"
    echo "  scale   [app] [replicas] [ns]    Scale a deployment"
    echo "  top     [ns]                     Pod CPU/memory usage"
    echo "  events  [ns]                     Recent cluster events (debugging)"
    echo "  shell   [ns]                     Exec into a backend pod"
    echo "  delete  [ns]                     Delete all ds-catalog resources"
    echo ""
    echo "Examples:"
    echo "  ./utils.sh status"
    echo "  ./utils.sh logs ds-catalog-backend default 200"
    echo "  ./utils.sh scale ds-catalog-backend 3"
    echo "  ./utils.sh restart ds-catalog-frontend"
    echo "  ./utils.sh rollout"
    echo "  ./utils.sh shell"
    echo "  ./utils.sh ip"
    echo ""
}

case "${1:-help}" in
    status)   cmd_status  "$2" ;;
    logs)     cmd_logs    "$2" "$3" "$4" ;;
    ip)       cmd_ip      "$2" "$3" ;;
    restart)  cmd_restart "$2" "$3" ;;
    rollout)  cmd_rollout "$2" ;;
    scale)    cmd_scale   "$2" "$3" "$4" ;;
    top)      cmd_top     "$2" ;;
    events)   cmd_events  "$2" ;;
    shell)    cmd_shell   "$2" ;;
    delete)   cmd_delete  "$2" ;;
    help|*)   print_help ;;
esac
