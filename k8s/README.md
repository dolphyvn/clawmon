# ClawMon on Kubernetes

Run ClawMon as a DaemonSet to monitor all nodes in your Kubernetes cluster.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                       │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  DaemonSet: clawmon-node (one pod per node)          │  │
│  │  - Runs worker node to collect metrics               │  │
│  │  - HostPID, hostNetwork for system access            │  │
│  └──────────────────────────────────────────────────────┘  │
│                           ▲                                  │
│                           │                                  │
│  ┌────────────────────────┴──────────────────────────────┐  │
│  │  Deployment: clawmon-gateway (single replica)         │  │
│  │  - AI Agent for analysis                              │  │
│  │  - Slack notifications                                │  │
│  │  - Health check scheduler                             │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# 1. Create namespace
kubectl create namespace clawmon

# 2. Create config with API key
kubectl create secret generic clawmon-config \
  --from-literal=anthropic-api-key=sk-ant-your-key-here \
  -n clawmon

# 3. Deploy gateway
kubectl apply -f k8s/gateway/

# 4. Deploy node agents
kubectl apply -f k8s/node/
```

## Accessing Logs

```bash
# Gateway logs
kubectl logs -n clawmon deployment/clawmon-gateway -f

# All node logs
kubectl logs -n clawmon daemonset/clawmon-node -f

# Specific node
kubectl logs -n clawmon daemonset/clawmon-node -c clawmon-node -l kubernetes.io/hostname=node-1
```

## Scaling

- **Gateway**: Deploy with HPA based on CPU/memory
- **Nodes**: DaemonSet automatically scales with cluster size

## RBAC

The node pods need access to:
- List/get pods (for pod-level metrics)
- Read node info
- Access host system (hostPID, hostNetwork)

See `rbac/` for minimal permissions.
