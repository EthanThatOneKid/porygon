# Porygon

A stateful Discord bot powered by [Letta Cloud](https://app.letta.com). Porygon remembers conversations across sessions and channels.

Built with [discord.js](https://discord.js.org) and the [Letta TypeScript SDK](https://github.com/letta-ai/letta-client).

## Features

- **Stateful memory** — Porygon remembers context across conversations
- **Multi-channel** — Responds to DMs, @mentions, and replies
- **Letta Cloud** — Agent state persists across restarts
- **Render-ready** — Deploys on Render free tier

## Quickstart

### Prerequisites

- Node.js 20+
- A Discord bot token (see [Creating a Discord Bot Token](#creating-a-discord-bot-token) below)
- A [Letta Cloud API key](https://app.letta.com/preferences/api-keys)
- A Letta agent ID (create one at [app.letta.com](https://app.letta.com))

### Creating a Discord Bot Token

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application** (or select your existing app)
3. Go to **Bot** in the left sidebar
4. Under **Token**, click **Copy** (or **Reset Token** for a fresh one)
5. In the same **Bot** page, enable **Message Content Intent** (required — the bot reads message content)
6. Invite the bot to your server via **OAuth2 → URL Generator** with the `bot` scope and appropriate permissions

### Local development

```bash
# Clone and install
git clone https://github.com/EthanThatOneKid/porygon.git
cd porygon
npm install

# Configure
cp .env.template .env
# Edit .env with your tokens

# Run
npm run dev
```

### Deploy to Render

1. Connect your GitHub repo to [Render](https://render.com)
2. Create a new **Web Service** using the `Dockerfile`
3. Set environment variables in the **Environment** tab:
   - `DISCORD_TOKEN` — Your bot token (from above)
   - `LETTA_API_KEY` — Your Letta Cloud API key
   - `LETTA_AGENT_ID` — Your agent's ID
4. Deploy

> **Note:** `render.yaml` declares these env vars with `sync: false`, meaning they must be set manually in the Render dashboard — they won't be pulled from any `.env` file.

The bot connects to Discord via WebSocket (no public URL needed).

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DISCORD_TOKEN` | Yes | — | Discord bot token |
| `LETTA_API_KEY` | Yes | — | Letta Cloud API key |
| `LETTA_AGENT_ID` | Yes | — | Letta agent ID to use |
| `LETTA_BASE_URL` | No | `https://api.letta.com` | Letta API base URL |
| `LETTA_USE_SENDER_PREFIX` | No | `true` | Include sender context in messages |
| `LETTA_CONTEXT_MESSAGE_COUNT` | No | `5` | Recent messages to include as context |
| `RESPOND_TO_DMS` | No | `true` | Respond to direct messages |
| `RESPOND_TO_MENTIONS` | No | `true` | Respond to @mentions |
| `RESPOND_TO_BOTS` | No | `false` | Respond to other bots |
| `RESPOND_TO_GENERIC` | No | `false` | Respond to all channel messages |
| `DISCORD_CHANNEL_ID` | No | — | Restrict to a specific channel |
| `PORT` | No | `3001` | HTTP server port |

## Architecture

```
Discord ←WebSocket→ discord.js ←→ Letta Cloud API
                    ↑
              Express (health check)
```

The bot connects to Discord's gateway via WebSocket. Messages are sent to Letta Cloud for processing, and responses are sent back to Discord.

## Health Check

```
GET /healthz
{
  "status": "ok",
  "discord": "connected",
  "uptime": 123.45
}
```

## License

MIT
