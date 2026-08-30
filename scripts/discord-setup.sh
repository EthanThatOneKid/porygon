#!/usr/bin/env bash
set -euo pipefail

# Porygon Discord + OpenCode Go setup
# This script configures the Letta Discord channel and provider.

LETTA_CHANNELS_DIR="${HOME}/.letta/channels"
DISCORD_DIR="${LETTA_CHANNELS_DIR}/discord"

echo "=== Porygon Discord Setup ==="
echo ""

# Check if Letta CLI is installed
if ! command -v letta &> /dev/null; then
  echo "Error: Letta CLI not found. Install it first:"
  echo "  npm install -g @letta-ai/letta-code"
  exit 1
fi

# Step 1: Configure Discord channel
echo "Step 1: Configure Discord channel"
echo ""
echo "You'll need:"
echo "  1. A Discord Bot Token (from https://discord.com/developers/applications)"
echo "  2. Your Discord User ID (right-click your name in Discord → Copy User ID)"
echo ""

read -p "Press Enter to start Discord configuration wizard... "
letta channels configure discord

# Step 2: Connect OpenCode Go provider
echo ""
echo "Step 2: Connect OpenCode Go provider"
echo ""

# Check if OpenCode auth exists
if [ -f "${HOME}/.local/share/opencode/auth.json" ]; then
  OPENCODE_KEY=$(node -e "
    const fs = require('fs');
    const auth = JSON.parse(fs.readFileSync('${HOME}/.local/share/opencode/auth.json', 'utf8'));
    console.log(auth['opencode-go']?.key || '');
  " 2>/dev/null)

  if [ -n "$OPENCODE_KEY" ]; then
    echo "Found OpenCode Go API key from local auth."
    letta --backend local connect openai-compatible \
      --name "OpenCode Go" \
      --base-url "https://opencode.ai/zen/go/v1" \
      --api-key "$OPENCODE_KEY"
  else
    echo "No OpenCode Go key found. Please provide your API key:"
    read -p "API Key: " OPENCODE_KEY
    letta --backend local connect openai-compatible \
      --name "OpenCode Go" \
      --base-url "https://opencode.ai/zen/go/v1" \
      --api-key "$OPENCODE_KEY"
  fi
else
  echo "No OpenCode auth found. Please provide your API key:"
  read -p "API Key: " OPENCODE_KEY
  letta --backend local connect openai-compatible \
    --name "OpenCode Go" \
    --base-url "https://opencode.ai/zen/go/v1" \
    --api-key "$OPENCODE_KEY"
fi

# Step 3: Add agentId to accounts.json
echo ""
echo "Step 3: Link agent to Discord"
echo ""

# Find the agent
AGENT_ID=$(letta agents list --json 2>/dev/null | node -e "
  let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
    try {
      const agents = JSON.parse(d);
      const porygon = agents.find(a => a.name === 'Porygon');
      if (porygon) console.log(porygon.id);
    } catch(e) {}
  });
" 2>/dev/null)

if [ -z "$AGENT_ID" ]; then
  echo "No Porygon agent found. Creating one..."
  cd "$(dirname "$0")/.." && npm start
  echo "Created. Re-run this script to link to Discord."
  exit 0
fi

echo "Found agent: $AGENT_ID"

# Update accounts.json with agentId
ACCOUNTS_FILE="${DISCORD_DIR}/accounts.json"
if [ -f "$ACCOUNTS_FILE" ]; then
  node -e "
    const fs = require('fs');
    const config = JSON.parse(fs.readFileSync('${ACCOUNTS_FILE}', 'utf8'));
    config.accounts[0].agentId = '${AGENT_ID}';
    config.accounts[0].dmPolicy = 'open';
    fs.writeFileSync('${ACCOUNTS_FILE}', JSON.stringify(config, null, 2));
    console.log('Updated accounts.json with agentId: ${AGENT_ID}');
  "
else
  echo "Error: accounts.json not found. Run Discord setup first."
  exit 1
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Start the server:  npm run discord:start"
echo "  2. DM Porygon in Discord!"
echo ""
