#!/usr/bin/env bash
set -euo pipefail

# Register the "Turn On Porygon" context menu command with Discord.
#
# This script registers a USER context menu command that appears when
# you right-click any user in Discord. When invoked, it triggers the
# HTTP interactions endpoint which boots the Letta server.
#
# Prerequisites:
#   - DISCORD_BOT_TOKEN env var (or read from accounts.json)
#   - Application ID = Bot user ID (fetched automatically)

# --- Resolve bot token ---
if [ -z "${DISCORD_BOT_TOKEN:-}" ]; then
  ACCOUNTS_FILE="${HOME}/.letta/channels/discord/accounts.json"
  if [ ! -f "$ACCOUNTS_FILE" ]; then
    echo "Error: No DISCORD_BOT_TOKEN and no accounts.json found."
    echo "Set DISCORD_BOT_TOKEN or run 'npm run discord:setup' first."
    exit 1
  fi

  # Use a temp file to avoid shell escaping issues with node -e
  TMPJS=$(mktemp "${TMP:-/tmp}/porygon-XXXXXX.js")
  cat > "$TMPJS" << 'JSEOF'
const fs = require('fs');
const path = require('path');
const home = process.env.HOME || process.env.USERPROFILE || '';
const accountsPath = path.join(home, '.letta', 'channels', 'discord', 'accounts.json');
const data = JSON.parse(fs.readFileSync(accountsPath, 'utf-8'));
const account = data.accounts.find(a => a.channel === 'discord');
if (!account || !account.token) { process.exit(1); }
process.stdout.write(account.token);
JSEOF

  DISCORD_BOT_TOKEN=$(node "$TMPJS")
  rm -f "$TMPJS"

  if [ -z "$DISCORD_BOT_TOKEN" ]; then
    echo "Error: Could not extract token from accounts.json."
    exit 1
  fi
fi

# --- Fetch application ID (same as bot user ID) ---
echo "Fetching application info..."
TMPJS2=$(mktemp "${TMP:-/tmp}/porygon-XXXXXX.js")
cat > "$TMPJS2" << 'JSEOF'
const data = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
process.stdout.write(data.id);
JSEOF

APP_ID=$(curl -s -H "Authorization: Bot $DISCORD_BOT_TOKEN" \
  https://discord.com/api/v10/users/@me | node "$TMPJS2")
rm -f "$TMPJS2"

if [ -z "$APP_ID" ]; then
  echo "Error: Could not fetch application ID. Is the bot token valid?"
  exit 1
fi
echo "Application ID: $APP_ID"

# --- Register the context menu command ---
echo ""
echo "Registering 'Turn On Porygon' context menu command..."

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Authorization: Bot $DISCORD_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Turn On Porygon",
    "type": 2
  }' \
  "https://discord.com/api/v10/applications/$APP_ID/commands")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
  TMPJS3=$(mktemp "${TMP:-/tmp}/porygon-XXXXXX.js")
  cat > "$TMPJS3" << 'JSEOF'
const data = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
process.stdout.write(data.id);
JSEOF

  COMMAND_ID=$(echo "$BODY" | node "$TMPJS3")
  rm -f "$TMPJS3"

  echo ""
  echo "✅ Context menu command registered successfully!"
  echo "   Command ID: $COMMAND_ID"
  echo "   Name: Turn On Porygon"
  echo "   Type: USER (context menu)"
  echo ""
  echo "Right-click any user in Discord to see the command."
else
  echo ""
  echo "❌ Failed to register command (HTTP $HTTP_CODE):"
  echo "$BODY"
  exit 1
fi
