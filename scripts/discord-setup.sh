#!/usr/bin/env bash
set -euo pipefail

# Porygon Discord Setup (Letta Cloud)
# Creates the agent on Letta Cloud and configures the Discord channel.

LETTA_CHANNELS_DIR="${HOME}/.letta/channels"
DISCORD_DIR="${LETTA_CHANNELS_DIR}/discord"
ACCOUNTS_FILE="${DISCORD_DIR}/accounts.json"

echo "=== Porygon Discord Setup (Letta Cloud) ==="
echo ""

# Check if Letta CLI is installed
if ! command -v letta &> /dev/null; then
  echo "Error: Letta CLI not found. Install it first:"
  echo "  npm install -g @letta-ai/letta-code"
  exit 1
fi

# Step 1: Authenticate with Letta Cloud
echo "Step 1: Authenticate with Letta Cloud"
echo ""

if ! letta backend 2>&1 | grep -q "cloud"; then
  echo "Setting backend to Letta Cloud..."
  letta backend cloud
fi

echo "Backend: Letta Cloud ✓"
echo ""

# Step 2: Create agent on Letta Cloud
echo "Step 2: Create Porygon agent on Letta Cloud"
echo ""

AGENT_ID=$(letta agents list --query Porygon 2>/dev/null | node -e "
  let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
    try {
      const resp = JSON.parse(d);
      const items = resp.items || resp.response?.items || [];
      const porygon = items.find(a => a.name === 'Porygon');
      if (porygon) console.log(porygon.id);
    } catch(e) {}
  });
" 2>/dev/null)

if [ -z "$AGENT_ID" ]; then
  echo "Creating Porygon agent on Letta Cloud..."
  RESULT=$(letta agents create --name "Porygon" --personality blank 2>&1)
  AGENT_ID=$(echo "$RESULT" | node -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      try {
        const agent = JSON.parse(d);
        console.log(agent.id);
      } catch(e) {}
    });
  " 2>/dev/null)

  if [ -z "$AGENT_ID" ]; then
    echo "Error: Failed to create agent."
    echo "$RESULT"
    exit 1
  fi
  echo "Created agent: $AGENT_ID"
else
  echo "Found existing agent: $AGENT_ID"
fi
echo ""

# Step 3: Configure Discord channel
echo "Step 3: Configure Discord channel"
echo ""
echo "You'll need:"
echo "  1. A Discord Bot Token (from https://discord.com/developers/applications)"
echo "  2. Your Discord User ID (right-click your name in Discord → Copy User ID)"
echo ""

read -p "Discord Bot Token: " BOT_TOKEN
read -p "Your Discord User ID: " USER_ID

if [ -z "$BOT_TOKEN" ] || [ -z "$USER_ID" ]; then
  echo "Error: Token and User ID are required."
  exit 1
fi

# Write accounts.json with correct camelCase format
mkdir -p "$DISCORD_DIR"
cat > "$ACCOUNTS_FILE" << ACCOUNTS
{
  "accounts": [
    {
      "channel": "discord",
      "accountId": "porygon",
      "enabled": true,
      "token": "${BOT_TOKEN}",
      "agentId": "${AGENT_ID}",
      "defaultPermissionMode": "standard",
      "dmPolicy": "open",
      "adminUsers": ["${USER_ID}"],
      "allowedUsers": [],
      "allowedChannels": [],
      "autoThreadOnMention": false,
      "inboundDebounceMs": 0,
      "acknowledgeMessageReaction": false,
      "transcribeVoice": false,
      "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
      "updatedAt": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
    }
  ]
}
ACCOUNTS

echo "✓ accounts.json written"
echo ""

echo "=== Setup Complete ==="
echo ""
echo "Agent ID: ${AGENT_ID}"
echo ""
echo "Next steps:"
echo "  1. Start the server:  npm run discord:start"
echo "  2. DM Porygon in Discord!"
echo ""
