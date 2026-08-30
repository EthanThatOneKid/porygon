#!/usr/bin/env bash
set -euo pipefail

# Start the Letta server with Discord channel enabled.
# Prerequisites:
#   1. Discord channel configured (npm run discord:setup or manual accounts.json)
#   2. Agent created (npm start creates it once)
#   3. Provider connected (letta --backend local connect openai-compatible ...)
#
# The agent uses OpenCode Go (DeepSeek V4 Flash) by default.
# Override with OPENAI_API_KEY + OPENAI_BASE_URL for other providers.

echo "=== Starting Porygon with Discord ==="
echo ""

# Check if Letta CLI is installed
if ! command -v letta &> /dev/null; then
  echo "Error: Letta CLI not found. Install it first:"
  echo "  npm install -g @letta-ai/letta-code"
  exit 1
fi

# Check if Discord channel is configured
if [ ! -f "${HOME}/.letta/channels/discord/accounts.json" ]; then
  echo "Error: Discord channel not configured."
  echo "Run 'npm run discord:setup' first, or:"
  echo "  letta channels configure discord"
  exit 1
fi

# Check that agentId is set in accounts.json
if ! grep -q '"agentId"' "${HOME}/.letta/channels/discord/accounts.json" 2>/dev/null; then
  echo "Error: No agentId in accounts.json."
  echo "Add your agent ID to the account config:"
  echo '  "agentId": "agent-local-xxxxx"'
  exit 1
fi

echo "Starting Letta server with Discord channel..."
echo "Press Ctrl+C to stop."
echo ""

# Start the server with Discord channel and local backend
# --backend local: no cloud auth needed
# --env-name: skip interactive environment setup prompt
letta server --env-name etok --channels discord --backend local
