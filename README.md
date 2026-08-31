# Porygon

A stateful Discord bot powered by [Letta Cloud](https://app.letta.com). Porygon remembers conversations across sessions and channels.

Built with [discord.js](https://discord.js.org) and the [Letta Agent SDK](https://github.com/letta-ai/letta-agent-sdk) for cloud-hosted compute access.

## Features

**Free tier (current):**
- **Web search** — Search the web and fetch page content
- **Memory** — Agent remembers context across conversations
- **Multi-channel** — Responds to DMs, @mentions, and replies
- **Thread support** — Full thread context and optional reply-in-threads
- **Message batching** — Accumulates rapid messages to reduce API calls
- **Image handling** — Forwards image attachments as multi-modal content
- **Timer/heartbeat** — Proactive agent behavior on a randomized schedule
- **Code block preservation** — Splits messages without breaking code fences
- **Letta Cloud** — Agent state persists across restarts
- **Render-ready** — Deploys on Render free tier

**Requires Pro ($20/mo) or API plan to unlock:**
- **Cloud compute access** — Agent runs shell commands, installs deps, and uses tools via managed cloud sandboxes
- **Tool approval** — Interactive Approve/Deny buttons for human-in-the-loop tool execution
- **Session isolation** — Per-channel, per-user, or global sandbox isolation
- **Cloud sandbox tools** — Bash, Read, Write, Edit, Git, Search, Memory, Skills, Subagents

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

#### Option A: Letta Cloud (quickest)

```bash
# Clone and install
git clone https://github.com/EthanThatOneKid/porygon.git
cd porygon
npm install

# Configure
cp .env.template .env
# Edit .env with your tokens:
#   DISCORD_TOKEN=your_discord_token
#   LETTA_API_KEY=your_letta_api_key
#   LETTA_AGENT_ID=your_agent_id

# Run
npm run dev
```

#### Option B: Local Letta Server (full offline)

Test against a local Letta server without cloud dependencies:

```bash
# Clone and install
git clone https://github.com/EthanThatOneKid/porygon.git
cd porygon
npm install

# Start local Letta server (requires Docker)
docker compose up -d

# Configure for local server
cp .env.local.example .env.local
# Edit .env.local with your LLM API key and Discord token

# Run against local server
LETTA_BASE_URL=http://localhost:8283 npm run dev
```

**Benefits of local mode:**
- No Letta Cloud API key needed
- Test with your own LLM provider (OpenAI, Anthropic, Ollama)
- Full control over agent state
- Faster iteration during development
- Verify behavior before deploying to production

```bash
npm test       # Run tests
npm run build  # Build for production
```

### Deploy to Render

1. Connect your GitHub repo to [Render](https://render.com)
2. Create a new **Web Service** using the `Dockerfile`
3. Set environment variables in the **Environment** tab:
   - `DISCORD_TOKEN` — Your bot token (from above)
   - `LETTA_API_KEY` — Your Letta Cloud API key
   - `LETTA_AGENT_ID` — Your agent's ID (see below)
4. Deploy

> **Note:** `render.yaml` declares these env vars with `sync: false`, meaning they must be set manually in the Render dashboard — they won't be pulled from any `.env` file.

### Agent Configuration

The agent ID determines which Letta agent Porygon uses. The default `render.yaml` uses a **Blank** agent that doesn't claim tool access it doesn't have.

**Free tier:** Use the Blank agent (no cloud sandbox tools):
```bash
LETTA_AGENT_ID=agent-73c98a83-9c1d-4d85-8856-93b0932b2e10
```

**Pro/API plan:** Create a Letta Code agent for full cloud sandbox tools:
```bash
letta --new-agent --personality letta-code --name "Porygon"
# Note the agent ID from the output
LETTA_AGENT_ID=<new-agent-id>
```

The bot connects to Discord via WebSocket (no public URL needed).

## Environment Variables

### Core

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DISCORD_TOKEN` | Yes | — | Discord bot token |
| `LETTA_API_KEY` | Yes | — | Letta Cloud API key |
| `LETTA_AGENT_ID` | Yes | — | Letta agent ID to use |
| `PORT` | No | `3001` | HTTP server port |
| `LETTA_TIMEOUT_MS` | No | `60000` | Letta API request timeout (ms) |

### Cloud Sandbox

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SANDBOX_TTL_MINUTES` | No | `5` | How long the sandbox stays alive after last activity |
| `SANDBOX_REFRESH_INTERVAL_MS` | No | `240000` | How often to refresh the sandbox while active (4 min) |

### Tool Approval (Human-in-the-Loop)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENABLE_TOOL_APPROVAL` | No | `false` | Enable interactive approval for tool calls via Discord |
| `TOOL_APPROVAL_TIMEOUT_MS` | No | `60000` | How long to wait for user approval before denying |

When enabled, the agent asks for permission before running shell commands or other tools. The Discord user sees Approve/Deny buttons. When disabled (default), all tools are auto-approved in the sandbox.

### Session Isolation

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SESSION_ISOLATION` | No | `channel` | `channel`, `user`, or `global` |

Controls how Letta sessions map to Discord:
- `channel` — one session per channel (default, backward compatible)
- `user` — one session per user per channel (more isolation, more sandboxes)
- `global` — single shared session for all channels

### Message Behavior

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LETTA_USE_SENDER_PREFIX` | No | `true` | Include sender context in messages |
| `LETTA_CONTEXT_MESSAGE_COUNT` | No | `5` | Recent messages to include as context |
| `RESPOND_TO_DMS` | No | `true` | Respond to direct messages |
| `RESPOND_TO_MENTIONS` | No | `true` | Respond to @mentions |
| `RESPOND_TO_BOTS` | No | `false` | Respond to other bots |
| `RESPOND_TO_GENERIC` | No | `false` | Respond to all channel messages |
| `DISCORD_CHANNEL_ID` | No | — | Restrict to a specific channel |
| `SURFACE_ERRORS` | No | `false` | Show errors in Discord |

### Message Batching

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MESSAGE_BATCH_ENABLED` | No | `false` | Accumulate messages before sending |
| `MESSAGE_BATCH_SIZE` | No | `10` | Max messages per batch |
| `MESSAGE_BATCH_TIMEOUT_MS` | No | `30000` | Auto-drain timeout (ms) |

### Thread Support

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REPLY_IN_THREADS` | No | `false` | Reply in threads (creates new thread if needed) |
| `ENABLE_THREAD_CONVERSATIONS` | No | `false` | Respond to all messages in threads |
| `THREAD_CONVERSATIONS_RESPOND_WITHOUT_MENTION` | No | `false` | Skip mention requirement in threads |
| `LETTA_THREAD_CONTEXT_ENABLED` | No | `true` | Fetch full thread context |
| `LETTA_THREAD_MESSAGE_LIMIT` | No | `50` | Max messages to fetch from threads |

### Image Handling

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENABLE_IMAGE_HANDLING` | No | `false` | Forward image attachments to the agent |

### Timer/Heartbeat

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENABLE_TIMER` | No | `false` | Enable periodic heartbeat events |
| `TIMER_INTERVAL_MINUTES` | No | `15` | Max interval for random timer |
| `FIRING_PROBABILITY` | No | `0.1` | Probability timer fires (0.0–1.0) |

### Interactions Endpoint

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `INTERACTION_PUBLIC_KEY` | No | — | Discord interactions public key for signature verification |

## Architecture

```
┌─────────┐    WebSocket     ┌────────────┐    HTTPS     ┌──────────────────┐
│ Discord  │ ◄──────────────► │ discord.js │ ◄──────────► │   Letta Cloud    │
│  Client  │                  │  (bot.js)  │              │   (Agent SDK)    │
└─────────┘                  └────────────┘              └────────┬─────────┘
                                                                  │
                                                                  ▼
                                                       ┌──────────────────┐
                                                       │  Cloud Sandbox   │
                                                       │ ─────────────── │
                                                       │  Bash, Read,     │
                                                       │  Write, Edit,    │
                                                       │  Git, Search,    │
                                                       │  Memory, Skills  │
                                                       └──────────────────┘
                    ┌────────────────────┐
                    │  Express (port     │
                    │  3001)             │
                    │  • /healthz        │
                    │  • /interactions   │
                    └────────────────────┘
```

### Message Flow

```
1. Discord message → discord.js gateway
2. Message type determined (DM / mention / reply / thread)
3. Session key resolved (channel / user / global)
4. Session created or resumed from cache
5. Context assembled (recent messages, thread history, sender prefix)
6. Images extracted and base64-encoded (if enabled)
7. Message sent via session.send()
8. Agent processes in cloud sandbox:
   a. LLM reasons about the request
   b. Tool calls executed (Bash, Read, Write, etc.)
   c. Results fed back to LLM
   d. Final response generated
9. Response streamed via session.stream()
10. Assistant text sent to Discord (split if > 2000 chars)
```

### Cloud Sandbox Tools

> **Requires Pro ($20/mo) or API plan.** Free tier does not include cloud sandboxes. If no tools are reported at startup, upgrade at [app.letta.com/settings/billing](https://app.letta.com/settings/billing).

The cloud sandbox is an isolated computer provisioned by Letta Cloud for each session. It provides a full Linux environment with:

| Category | Tools | Description |
|----------|-------|-------------|
| **Shell** | `Bash` | Run arbitrary shell commands |
| **Files** | `Read`, `Write`, `Edit`, `SetWorkingDirectory` | Filesystem operations |
| **Search** | `web_search`, `fetch_webpage` | Web search and page fetching |
| **Memory** | `memory` | Update agent memory blocks |
| **Tasks** | `TaskCreate`, `TaskGet`, `TaskList`, `TaskUpdate`, `TaskOutput`, `TaskStop` | Background task management |
| **Agents** | `Agent` | Launch subagents for parallel/isolated work |
| **Git** | `EnterWorktree`, `ExitWorktree` | Isolated git worktrees |
| **Skills** | `Skill` | Invoke agent skills on demand |
| **Events** | `Monitor` | Watch for external events |

Tools are provided by the **harness** (Letta Code runtime) at session creation time — not stored on the agent definition. The `toolset.base` setting controls which tools are available (`"auto"`, `"default"`, `"none"`).

### Session Lifecycle

```
┌──────────────────────────────────────────────────────────────┐
│                    Session Lifecycle                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Create          2. Ready           3. Active             │
│  ┌─────────┐       ┌─────────┐       ┌─────────┐           │
│  │ createSession() │ session.ready()  │ session.send()      │
│  │ Provision sandbox│ Log tools       │ Stream responses    │
│  └─────────┘       └─────────┘       └─────────┘           │
│       │                                    │                 │
│       │                                    ▼                 │
│       │                            ┌─────────────┐          │
│       │                            │  Tool calls  │          │
│       │                            │  executed in │          │
│       │                            │  sandbox     │          │
│       │                            └─────────────┘          │
│       │                                    │                 │
│       │                                    ▼                 │
│       │                            ┌─────────────┐          │
│       │                            │  Response    │          │
│       │                            │  streamed    │          │
│       │                            └─────────────┘          │
│       │                                    │                 │
│       │          ┌─────────────────────────┘                 │
│       │          │                                           │
│       ▼          ▼                                           │
│  ┌────────────────────┐    ┌─────────────────────┐          │
│  │  Sandbox TTL timer │    │  4. Expired          │          │
│  │  (5 min default)   │───►│  CloudManagedSandbox │          │
│  │  Refresh every 4m  │    │  ExpiredError         │          │
│  └────────────────────┘    │  → Recreate session   │          │
│                            └─────────────────────┘          │
│                                                              │
│  5. Shutdown                                                            │
│  ┌─────────────────────┐                                             │
│  │  closeSessions()     │                                             │
│  │  session.close()     │                                             │
│  │  Cache cleared       │                                             │
│  └─────────────────────┘                                             │
└──────────────────────────────────────────────────────────────┘
```

Key behaviors:
- **Sandbox TTL**: Sandbox expires after `SANDBOX_TTL_MINUTES` of inactivity. The bot auto-refreshes every `SANDBOX_REFRESH_INTERVAL_MS`.
- **Recovery**: If the sandbox expires mid-conversation, the bot catches `CloudManagedSandboxExpiredError`, creates a new session, and retries the message.
- **Cleanup**: On bot shutdown (`SIGINT`/`SIGTERM`), all sessions are closed gracefully.

### Session Isolation

Sessions map Discord channels/users to Letta sessions with cloud sandboxes:

| Mode | Session Key | Behavior | Use Case |
|------|-------------|----------|----------|
| `channel` | `{channelId}` | One sandbox per channel | Default — backward compatible |
| `user` | `{userId}:{channelId}` | One sandbox per user per channel | Maximum isolation |
| `global` | `global` | Single shared sandbox | Shared workspace |

```
channel mode:                    user mode:
┌──────────┐                    ┌──────────┐
│ #general │ → sandbox-1        │ #general │ → alice → sandbox-a
│          │                    │          │ → bob   → sandbox-b
├──────────┤                    ├──────────┤
│ #dev     │ → sandbox-2        │ #dev     │ → alice → sandbox-c
│          │                    │          │ → bob   → sandbox-d
└──────────┘                    └──────────┘

global mode:
All channels → single sandbox-1
```

### Tool Approval (Human-in-the-Loop)

When `ENABLE_TOOL_APPROVAL=true`, the agent asks for permission before executing tools:

```
Agent wants to run: Bash("rm -rf /tmp/cache")
         │
         ▼
┌─────────────────────┐
│ Discord message with │
│ [Approve] [Deny]    │
│ buttons              │
└─────────────────────┘
         │
    ┌────┴────┐
    ▼         ▼
[Approve]  [Deny]
    │         │
    ▼         ▼
Tool runs   Tool blocked
Result      Agent told
returned    "Denied"
```

- Each approval has a unique key (session + tool + timestamp)
- Timeout auto-denies after `TOOL_APPROVAL_TIMEOUT_MS`
- Concurrent approvals don't conflict

### Interactions Endpoint (Cold Start)

On Render's free tier, the service spins down after ~15 min of inactivity. The interactions endpoint allows Discord to wake it up:

1. Right-click a user in Discord → select **"Start Porygon"**
2. Discord POSTs to `/interactions`
3. Render wakes up, Express responds
4. Bot connects to Discord

To enable:
1. Set `INTERACTION_PUBLIC_KEY` in Render (from Discord Developer Portal → App → General Information)
2. Set Interactions Endpoint URL to `https://porygon.onrender.com/interactions`

## Health Check

```
GET /healthz
{
  "status": "ok",
  "discord": "connected",
  "uptime": 123.45
}
```

## Development

```bash
npm run dev          # Start with hot reload
npm test             # Run tests
npm run build        # Build for production
docker compose up    # Start local Letta server
```

## License

MIT
