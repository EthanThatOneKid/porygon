#!/usr/bin/env bash
# Mint a GitHub App installation access token from agent secrets.
#
# Required environment variables (set as Letta agent secrets):
#   GITHUB_APP_ID          - numeric App ID of the Porygon GitHub App
#   GITHUB_APP_PRIVATE_KEY - PEM private key (newlines may be literal or \n-escaped)
#
# Optional environment variables:
#   GITHUB_APP_INSTALLATION_ID - numeric installation ID. If unset, the script
#     auto-discovers it via GET /app/installations (requires exactly one
#     installation; with multiple, set this explicitly).
#
# Output: the installation access token on stdout (valid ~1 hour).
# Errors go to stderr; non-zero exit on failure.
#
# See https://github.com/EthanThatOneKid/porygon/issues/44

set -euo pipefail

: "${GITHUB_APP_ID:?GITHUB_APP_ID is not set}"
: "${GITHUB_APP_PRIVATE_KEY:?GITHUB_APP_PRIVATE_KEY is not set}"

api_base="https://api.github.com"

b64url() {
  # base64url encode stdin without padding
  openssl base64 -A | tr '+/' '-_' | tr -d '='
}

app_curl() {
  # Authenticated request as the GitHub App itself (JWT)
  curl -sS -H "Authorization: Bearer $jwt" -H "Accept: application/vnd.github+json" "$@"
}

# Normalize the private key: expand \n escapes into real newlines.
key_file=$(mktemp)
trap 'rm -f "$key_file"' EXIT
printf '%b' "$GITHUB_APP_PRIVATE_KEY" > "$key_file"

# Build the RS256 JWT. GitHub requires: iat up to 60s in the past, exp <= iat + 600.
now=$(date +%s)
header=$(printf '{"alg":"RS256","typ":"JWT"}' | b64url)
payload=$(printf '{"iat":%d,"exp":%d,"iss":"%s"}' "$((now - 60))" "$((now + 540))" "$GITHUB_APP_ID" | b64url)
signature=$(printf '%s.%s' "$header" "$payload" | openssl dgst -sha256 -sign "$key_file" | b64url)
jwt="${header}.${payload}.${signature}"

# Resolve the installation ID.
if [ -z "${GITHUB_APP_INSTALLATION_ID:-}" ]; then
  installations=$(app_curl "$api_base/app/installations")
  count=$(printf '%s' "$installations" | jq 'length')
  if [ "$count" -eq 0 ]; then
    printf 'No installations found for this GitHub App. Install it first:\n' >&2
    printf '  https://github.com/apps/%s/installations/new\n' \
      "$(app_curl "$api_base/app" | jq -r '.slug')" >&2
    exit 1
  elif [ "$count" -gt 1 ]; then
    printf 'Multiple installations found (%s); set GITHUB_APP_INSTALLATION_ID explicitly.\n' "$count" >&2
    printf '%s' "$installations" | jq -r '.[] | "  id=\(.id) account=\(.account.login)"' >&2
    exit 1
  fi
  installation_id=$(printf '%s' "$installations" | jq -r '.[0].id')
else
  installation_id="$GITHUB_APP_INSTALLATION_ID"
fi

response=$(app_curl -X POST "$api_base/app/installations/${installation_id}/access_tokens")

token=$(printf '%s' "$response" | jq -r '.token // empty')
if [ -z "$token" ]; then
  printf 'Failed to mint installation token for installation %s.\nResponse: %s\n' "$installation_id" "$response" >&2
  exit 1
fi

printf '%s\n' "$token"
