#!/usr/bin/env bash
set -euo pipefail

echo "=== Porygon Discord Status ==="
echo ""

# Check if Letta CLI is installed
if ! command -v letta &> /dev/null; then
  echo "Error: Letta CLI not found."
  exit 1
fi

# Show channel status
letta channels status

echo ""
echo "=== Routes ==="
letta channels route list --channel discord 2>/dev/null || echo "No routes configured."
