#!/bin/bash
# ClawMon Kubernetes Deployment Script

set -e

NAMESPACE=${NAMESPACE:-clawmon}
GATEWAY_IMAGE=${GATEWAY_IMAGE:-clawmon:latest}

echo "🚀 Deploying ClawMon to Kubernetes..."
echo "   Namespace: $NAMESPACE"
echo "   Image: $GATEWAY_IMAGE"
echo ""

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl not found. Please install kubectl first."
    exit 1
fi

# Check if cluster is accessible
if ! kubectl cluster-info &> /dev/null; then
    echo "❌ Cannot access Kubernetes cluster. Please configure kubectl."
    exit 1
fi

# Create namespace
echo "📦 Creating namespace..."
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

# Create secrets (prompt for API key)
echo ""
echo "🔑 Setting up secrets..."
if [ -z "$ANTHROPIC_API_KEY" ]; then
    read -sp "Enter Anthropic API key: " ANTHROPIC_API_KEY
    echo ""
fi

kubectl create secret generic clawmon-secrets \
    --from-literal=anthropic-api-key="$ANTHROPIC_API_KEY" \
    --namespace="$NAMESPACE" \
    --dry-run=client -o yaml | kubectl apply -f -

# Optional: Slack webhook
if [ -n "$SLACK_WEBHOOK_URL" ]; then
    kubectl patch secret clawmon-secrets -n "$NAMESPACE" \
        --type=json -p="[{\"op\": \"replace\", \"path\": \"/data/slack-webhook-url\", \"value\": \"$(echo -n "$SLACK_WEBHOOK_URL" | base64)\"}]"
fi

# Apply RBAC
echo "🔐 Applying RBAC..."
kubectl apply -f k8s/rbac/

# Apply ConfigMap
echo "⚙️  Applying ConfigMap..."
kubectl apply -f k8s/gateway/configmap.yaml

# Apply Gateway
echo "🌐 Deploying Gateway..."
kubectl apply -f k8s/gateway/service.yaml
kubectl apply -f k8s/gateway/deployment.yaml
kubectl apply -f k8s/gateway/hpa.yaml

# Wait for gateway to be ready
echo "⏳ Waiting for Gateway to be ready..."
kubectl wait --for=condition=available --timeout=60s \
    deployment/clawmon-gateway -n "$NAMESPACE"

# Apply Node DaemonSet
echo "🔧 Deploying Node DaemonSet..."
kubectl apply -f k8s/node/daemonset.yaml

# Wait for nodes to be ready
echo "⏳ Waiting for Nodes to be ready..."
kubectl wait --for=condition=ready --timeout=120s \
    pod -l app=clawmon-node -n "$NAMESPACE" --for=condition=ready

echo ""
echo "✅ ClawMon deployed successfully!"
echo ""
echo "📊 Status:"
kubectl get pods -n "$NAMESPACE" -l 'app in (clawmon-gateway,clawmon-node)'
echo ""
echo "📝 View logs:"
echo "   Gateway: kubectl logs -n $NAMESPACE deployment/clawmon-gateway -f"
echo "   Nodes:   kubectl logs -n $NAMESPACE daemonset/clawmon-node -f"
echo ""
echo "🔍 Port forward to gateway:"
echo "   kubectl port-forward -n $NAMESPACE svc/clawmon-gateway 18790:18790"
