# Porygon

A stateful agent named Porygon, built with the [Letta Agent SDK](https://github.com/letta-ai/letta-agent-sdk).

Porygon is a helpful AI assistant with persistent memory that helps Ethan with general tasks, coding, research, and problem-solving. It remembers context across conversations and learns from interactions.

## Prerequisites

- Node.js 22.19+
- Letta CLI installed globally (`npm install -g @letta-ai/letta-code`)
- A provider API key (OpenCode Go, OpenAI, Anthropic, etc.)

## Install

```bash
npm install
```

## Quick Start

```bash
# 1. Create the agent
npm start

# 2. Set up Discord channel + provider
npm run discord:setup

# 3. Start the server
npm run discord:start

# 4. DM Porygon in Discord!
```

## Discord Deployment

### Configuration

The Discord channel is configured in `~/.letta/channels/discord/accounts.json`. Key fields:

```json
{
  "accounts": [{
    "channel": "discord",
    "accountId": "main",
    "token": "YOUR_BOT_TOKEN",
    "agentId": "agent-local-xxxxx",
    "dmPolicy": "open",
    "allowedUsers": ["YOUR_DISCORD_USER_ID"]
  }]
}
```

**Important:** The `agentId` field is required — without it, Porygon responds with "not connected".

### Provider Setup

Porygon uses OpenCode Go (DeepSeek V4 Flash) by default. Configure via:

```bash
letta --backend local connect openai-compatible \
  --name "OpenCode Go" \
  --base-url "https://opencode.ai/zen/go/v1" \
  --api-key "YOUR_KEY"
```

### Tool Restrictions

The agent is configured with restricted tools to minimize token usage (~3K tokens vs ~30K for full toolset):

| Tool | Purpose |
|------|---------|
| `send_message` | Respond to user |
| `conversation_search` | Recall past context |
| `core_memory_append` | Learn new info |
| `core_memory_replace` | Update existing memory |
| `memory` | Manage memory blocks |

### Scripts

| Command | Description |
|---------|-------------|
| `npm run discord:setup` | Interactive Discord + provider setup |
| `npm run discord:start` | Start the Letta server with Discord |
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

## Other Commands

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
