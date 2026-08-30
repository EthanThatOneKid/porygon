#!/usr/bin/env bash
set -euo pipefail

# Start the Letta server with Discord channel enabled on Letta Cloud.
# Prerequisites:
#   1. Letta Cloud authenticated (letta setup → select cloud)
#   2. Discord channel configured (npm run discord:setup)
#   3. Agent created on Letta Cloud (npm run discord:setup handles this)

echo "=== Starting Porygon with Discord (Letta Cloud) ==="
echo ""

# Check if Letta CLI is installed
if ! command -v letta &> /dev/null; then
  echo "Error: Letta CLI not found. Install it first:"
  echo "  npm install -g @letta-ai/letta-code"
  exit 1
fi

# Check if Letta Cloud is authenticated
if ! letta backend 2>&1 | grep -q "cloud"; then
  echo "Warning: Default backend is not set to cloud."
  echo "Run: letta backend cloud"
  echo ""
fi

# Check if Discord channel is configured
if [ ! -f "${HOME}/.letta/channels/discord/accounts.json" ]; then
  echo "Error: Discord channel not configured."
  echo "Run 'npm run discord:setup' first."
  exit 1
fi

# Check that agentId is set in accounts.json
if ! grep -q '"agentId"' "${HOME}/.letta/channels/discord/accounts.json" 2>/dev/null; then
  echo "Error: No agentId in accounts.json."
  echo "Run 'npm run discord:setup' to configure."
  exit 1
fi

echo "Starting Letta server with Discord channel on Letta Cloud..."
echo "Press Ctrl+C to stop."
echo ""

# Start the server with Discord channel and cloud backend
# --backend cloud: agent state stored on Letta Cloud (always-on)
# --env-name: name of the cloud environment (skip interactive prompt)
letta server --env-name etok --channels discord --backend cloud
