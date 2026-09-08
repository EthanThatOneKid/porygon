#!/usr/bin/env bash
# Mint a GitHub App installation access token from agent secrets.
#
# Required environment variables (set as Letta agent secrets):
#   GITHUB_APP_ID             - numeric App ID of the Porygon GitHub App
#   GITHUB_APP_PRIVATE_KEY    - PEM private key (newlines may be literal or \n-escaped)
#   GITHUB_APP_INSTALLATION_ID - numeric installation ID
#
# Output: the installation access token on stdout (valid ~1 hour).
# Errors go to stderr; non-zero exit on failure.
#
# See https://github.com/EthanThatOneKid/porygon/issues/44

set -euo pipefail

: "${GITHUB_APP_ID:?GITHUB_APP_ID is not set}"
: "${GITHUB_APP_PRIVATE_KEY:?GITHUB_APP_PRIVATE_KEY is not set}"
: "${GITHUB_APP_INSTALLATION_ID:?GITHUB_APP_INSTALLATION_ID is not set}"

b64url() {
  # base64url encode stdin without padding
  openssl base64 -A | tr '+/' '-_' | tr -d '='
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

response=$(curl -sS -X POST \
  -H "Authorization: Bearer $jwt" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/app/installations/${GITHUB_APP_INSTALLATION_ID}/access_tokens")

token=$(printf '%s' "$response" | jq -r '.token // empty')
if [ -z "$token" ]; then
  printf 'Failed to mint installation token.\nResponse: %s\n' "$response" >&2
  exit 1
fi

printf '%s\n' "$token"
