# Porygon

A stateful agent named Porygon, built with the [Letta Agent SDK](https://github.com/letta-ai/letta-agent-sdk).

Porygon is a helpful AI assistant with persistent memory that helps Ethan with general tasks, coding, research, and problem-solving. It remembers context across conversations and learns from interactions.

## Prerequisites

- Node.js 22.19+
- Letta CLI installed globally (`npm install -g @letta-ai/letta-code`)
- Letta Cloud account (free tier: 3 agents)

## Install

```bash
npm install
```

## Quick Start

```bash
# 1. Authenticate with Letta Cloud
letta setup
# → Select "Letta Cloud" → authenticate via browser

# 2. Set up Discord channel + create cloud agent
npm run discord:setup

# 3. Start the server
npm run discord:start

# 4. DM Porygon in Discord!
```

## How It Works

Porygon runs on **Letta Cloud** — agent state (memory, conversations, identity) is stored in the cloud, so it stays online 24/7 without a local server. The `letta server` process on your machine acts as a bridge: it connects to Letta Cloud, receives Discord messages via the adapter, and routes them to the cloud-hosted agent.

```
Discord → Local server (bridge) → Letta Cloud (agent state + LLM)
```

## Discord Deployment

### Configuration

The Discord channel is configured in `~/.letta/channels/discord/accounts.json`:

```json
{
  "accounts": [{
    "channel": "discord",
    "accountId": "porygon",
    "enabled": true,
    "token": "YOUR_BOT_TOKEN",
    "agentId": "agent-xxxxx",
    "defaultPermissionMode": "standard",
    "dmPolicy": "open",
    "adminUsers": ["YOUR_DISCORD_USER_ID"],
    "allowedUsers": [],
    "allowedChannels": [],
    "autoThreadOnMention": false,
    "inboundDebounceMs": 0,
    "acknowledgeMessageReaction": false,
    "transcribeVoice": false
  }]
}
```

**Important:** Keys must be **camelCase** (not snake_case). The `agentId` field is required — without it, Porygon responds with "not connected".

### Agent on Letta Cloud

The agent lives on Letta Cloud (free tier: 3 agents, BYOK for LLM usage):

```bash
# Create agent
letta agents create --name "Porygon" --personality blank

# List agents
letta agents list

# Check agent config
letta agents config --agent <agent-id>
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run discord:setup` | Interactive Discord + cloud agent setup |
| `npm run discord:start` | Start the server (bridge to Letta Cloud) |
| `npm run discord:status` | Check channel status and routes |

### Channel Commands

Once connected, use these commands in Discord:

| Command | Description |
|---------|-------------|
| `/help` | Show channel usage guidance |
| `/status` | Show agent and conversation state |
| `/pause` | Pause agent replies |
| `/resume` | Resume agent replies |
| `/cancel` | Cancel the current agent turn |

## Render Deployment (Free Tier)

Porygon can be deployed on [Render](https://render.com) free tier for always-on operation.

### Setup

1. **Create a Render account** at [render.com](https://render.com) (no credit card required)
2. **Connect your GitHub repo** — Render will detect the `Dockerfile`
3. **Set environment variables** in the Render dashboard:

| Variable | Description |
|----------|-------------|
| `DISCORD_PUBLIC_KEY` | Discord app public key (from Developer Portal → App → General Information) |
| `DISCORD_BOT_TOKEN` | Discord bot token (from Developer Portal → Bot) |
| `LETTA_API_KEY` | Letta Cloud API key (from [chat.letta.com/preferences/api-keys](https://chat.letta.com/preferences/api-keys)) |

4. **Deploy** — Render builds the Dockerfile and starts the server

### How it works

```
Discord → Render (HTTP interactions endpoint) → Letta Cloud (agent state + LLM)
```

- **Cold start**: 25-60 seconds on free tier
- **Health check**: GET `/healthz` keeps the service alive
- **Wake-up**: Right-click any user in Discord → "Turn On Porygon" (context menu command)

### Waking the bot

When Porygon goes offline (after ~15 min idle):
1. Right-click any user in Discord
2. Select **Apps → Turn On Porygon**
3. The bot defers the response, boots the Letta server in the background
4. ~30 seconds later, Porygon comes online and responds

## Development

```bash
# Build
npm run build

# Type check
npm run check

# Run tests
npm test
```

## Data

Porygon reads from the shared knowledge graph via the wiki memory connector in `porygon-memory`.

| Repo | Description |
|------|-------------|
| [`porygon-memory`](https://github.com/EthanThatOneKid/porygon-memory) | Agent-specific raw captures and wiki pages |
| [`memory`](https://github.com/EthanThatOneKid/memory) | Personal knowledge graph |

## License

MIT
