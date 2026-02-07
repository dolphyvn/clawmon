# ClawMon Quick Start

## Setup

1. **Install dependencies**
```bash
cd /opt/works/personal/github/clawmon
npm install
npm run build
```

2. **Configure**
```bash
mkdir -p ~/.clawmon
cp .clawmon/config.example.json ~/.clawmon/config.json
# Edit ~/.clawmon/config.json with your Anthropic API key
```

3. **Set API key**
```bash
export ANTHROPIC_API_KEY=sk-ant-your-key-here
```

## Usage

### Start the Gateway (Master)

```bash
npm start gateway
```

The gateway will:
- Start WebSocket server on port 18790
- Run health checks every 60 seconds
- Send alerts to configured channels

### Start a Worker Node

```bash
npm start node -- --host <gateway-ip> --name my-worker
```

### Check Status

```bash
npm start status
```

## Example Output

```
[2024-02-07T10:00:00.000Z] INFO     Node registered: abc123def456 (my-worker)
[2024-02-07T10:01:00.000Z] INFO     Running health check for 1 nodes...
[2024-02-07T10:01:02.000Z] INFO     Analysis result: All systems operational
```

## How AI-First Monitoring Works

Unlike traditional monitoring with fixed thresholds, ClawMon:

1. **Collects metrics** from all nodes
2. **Sends to AI agent** for analysis
3. **Agent decides**:
   - Is this a problem?
   - How severe?
   - What should we do?
4. **Executes actions**:
   - Notify humans (Slack, console)
   - Attempt self-healing (restart services, etc.)
   - Ask for help when uncertain

## Example Scenarios

### High CPU
```
Agent detects CPU at 95%
→ Checks top processes
→ Identifies runaway process
→ Kills process
→ Notifies: "Killed process X (PID 1234) using 95% CPU"
```

### Disk Full
```
Agent detects disk at 95%
→ Checks for old logs
→ Clears /tmp
→ Notifies with details
```

### Service Down
```
Agent detects nginx not running
→ Checks recent logs
→ Restarts nginx
→ Verifies recovery
→ Notifies: "nginx restarted successfully"
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Gateway (runs on one machine)                   │
│  - AI Agent (Claude)                             │
│  - Health Scheduler (every 60s)                  │
│  - Alert Management                              │
│  - Slack/Console Notifications                   │
└─────────────────────────────────────────────────┘
                          ▲
                          │ WebSocket
                          │
    ┌─────────────────────┼─────────────────────┐
    │                     │                     │
┌───┴────┐          ┌─────┴─────┐         ┌─────┴─────┐
│Worker 1│          │Worker 2   │         │Worker 3   │
│node run│          │node run   │         │node run   │
│Collects│          │Collects   │         │Collects   │
│metrics │          │metrics    │         │metrics    │
└────────┘          └───────────┘         └───────────┘
```

## Development

```bash
# Watch mode for development
npm run dev

# Run tests
npm test
```
