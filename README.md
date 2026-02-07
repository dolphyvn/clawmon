# ClawMon

AI-first distributed monitoring system powered by LLM agents.

## What Makes It Different

Unlike traditional monitoring with predefined thresholds, ClawMon uses an LLM agent to:
- **Dynamically decide** what to monitor based on your infrastructure
- **Set intelligent thresholds** based on historical patterns
- **Determine appropriate remediation** actions
- **Know when to escalate** issues to humans

## Quick Start

### Local Development

```bash
# Install and build
npm install
npm run build

# Configure
export ANTHROPIC_API_KEY=sk-ant-your-key-here

# Start gateway (master)
npm start gateway

# Start worker (in another terminal)
npm start node -- --host localhost --name my-worker
```

### Kubernetes (DaemonSet)

```bash
# Deploy to cluster
cd k8s
./deploy.sh

# Or manually:
kubectl create namespace clawmon
kubectl create secret generic clawmon-secrets \
  --from-literal=anthropic-api-key=sk-ant-your-key-here \
  -n clawmon
kubectl apply -f k8s/rbac/
kubectl apply -f k8s/gateway/
kubectl apply -f k8s/node/
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Master Gateway                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  AI Agent (Claude)                   │   │
│  │  - Analyzes metrics from all nodes                  │   │
│  │  - Decides alert thresholds                         │   │
│  │  - Chooses remediation actions                      │   │
│  │  - Formats and sends alerts                         │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Health Check Scheduler                  │   │
│  │  - Periodic checks (default: 60s)                  │   │
│  │  - Daily reports                                    │   │
│  │  - Alert follow-ups                                 │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          ▲
                          │ WebSocket (ws://gateway:18790)
                          │
      ┌───────────────────┼───────────────────┐
      │                   │                   │
 ┌────┴────┐         ┌────┴────┐        ┌────┴────┐
 │Worker A │         │Worker B │        │Worker C │
 │node run │         │node run │        │node run │
 │         │         │         │        │         │
 │CPU/Mem  │         │CPU/Mem  │        │CPU/Mem  │
 │Disk     │         │Disk     │        │Disk     │
 │Logs     │         │Logs     │        │Logs     │
 │Services │         │Services │        │Services │
 └─────────┘         └─────────┘        └─────────┘
```

## Monitoring Capabilities

### System Metrics
- CPU usage (per-core and total)
- Memory usage (RAM, swap)
- Disk usage and I/O
- Network connections
- System load average
- Uptime

### Process Monitoring
- List all processes
- Find processes by name
- Get process details (PID, CPU%, memory%)
- Kill processes (with confirmation)

### Service Monitoring
- Check service status (systemd/launchctl)
- Restart services
- View service logs

### Log Monitoring
- Tail log files
- Search for patterns
- Extract error messages

## Configuration

Create `~/.clawmon/config.json`:

```json
{
  "gateway": {
    "port": 18790,
    "bind": "0.0.0.0"
  },
  "agent": {
    "provider": "anthropic",
    "apiKey": "sk-ant-...",
    "model": "claude-3-5-sonnet-20241022"
  },
  "channels": {
    "console": { "enabled": true, "colors": true },
    "slack": {
      "webhookUrl": "https://hooks.slack.com/services/...",
      "channel": "#alerts"
    }
  },
  "monitoring": {
    "checkInterval": 60000,
    "alertCooldown": 300000
  }
}
```

## How AI-Driven Monitoring Works

### Traditional vs ClawMon

**Traditional monitoring:**
```yaml
if cpu > 80% then alert
if disk > 90% then alert
```

**ClawMon:**
1. Collects metrics from all nodes
2. Sends context to AI agent
3. Agent considers:
   - Is this actually a problem?
   - What's the context (time of day, running jobs)?
   - What actions should we take?
4. Executes and learns

### Example Scenarios

**Scenario 1: Transient High CPU**
```
Agent: "CPU at 85% but backup job is running.
       This is expected. No action needed."
```

**Scenario 2: Runaway Process**
```
Agent: "CPU at 95% due to 'python' process using 90%.
       This is not normal. Checking process details...
       It's a runaway script. Killing PID 1234."
→ Kills process
→ Notifies: "Killed runaway python process (PID 1234)"
```

**Scenario 3: Disk Full**
```
Agent: "Disk at 95%. Checking what's using space...
       nginx logs are 50GB. Rotating logs now.
       Also cleared /tmp of files older than 7 days."
→ Executes cleanup
→ Notifies with details
```

**Scenario 4: Service Down**
```
Agent: "nginx not responding. Checking logs...
       'out of memory' errors. Restarting service."
→ Restarts nginx
→ Monitors recovery
→ "nginx recovered successfully. Memory usage back to normal."
```

## Kubernetes Deployment

### Components

| Component | Type | Description |
|-----------|------|-------------|
| `clawmon-gateway` | Deployment | AI agent + scheduler + alert management |
| `clawmon-node` | DaemonSet | One pod per node, collects metrics |
| `clawmon-gateway` | Service | ClusterIP for internal communication |

### RBAC

Node pods need minimal permissions:
- List/get nodes and pods
- Read node stats
- Access host filesystem (read-only)

See `k8s/rbac/` for details.

### Scaling

- **Gateway**: Auto-scales with HPA (1-5 replicas based on CPU/memory)
- **Nodes**: DaemonSet automatically scales with cluster size

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Run tests
npm test
```

## License

MIT
