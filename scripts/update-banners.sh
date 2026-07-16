#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)
BANNERS_FILE="$REPO_ROOT/src/lib/banners.jsonc"
API_FILE="$REPO_ROOT/src/lib/api.ts"
API_BASE="https://ef-webview.gryphline.com/api"

DRY_RUN=false
SOURCE_URL=${ENDFIELD_WEBVIEW_URL:-}
POOL_IDS=()

usage() {
  cat <<'EOF'
Usage: scripts/update-banners.sh [options]

Updates src/lib/banners.jsonc with banner metadata confirmed by the Endfield API.
Existing entries are preserved so expired banners remain available historically.

Options:
  --url URL         Webview URL containing a u8_token. If omitted, the script prompts securely.
  --pool-id ID      Also check a known pool ID. May be supplied more than once.
  --dry-run         Print the updated JSON without writing banners.jsonc.
  -h, --help        Show this help.

The URL may point to any authenticated Endfield webview page. Pool IDs are discovered
from the record APIs; an explicit pool_id in the URL is also checked. Confirmed special
banners cause their matching weponbox_* pool to be checked as well.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url)
      [[ $# -ge 2 ]] || { echo "--url requires a value" >&2; exit 2; }
      SOURCE_URL=$2
      shift 2
      ;;
    --pool-id)
      [[ $# -ge 2 ]] || { echo "--pool-id requires a value" >&2; exit 2; }
      POOL_IDS+=("$2")
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

for command in curl jq node; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Required command not found: $command" >&2
    exit 1
  }
done

[[ -f "$BANNERS_FILE" ]] || { echo "Banner file not found: $BANNERS_FILE" >&2; exit 1; }

USER_AGENT=$(node --input-type=module -e '
  import fs from "node:fs";
  const source = fs.readFileSync(process.argv[1], "utf8");
  const match = source.match(/export const ENDFIELD_USER_AGENT\s*=\s*([^;]+);/s);
  const expression = match?.[1].trim();
  if (!expression || expression.length < 2) process.exit(1);
  process.stdout.write(expression.slice(1, -1));
' "$API_FILE") || {
  echo "Could not read ENDFIELD_USER_AGENT from $API_FILE" >&2
  exit 1
}

url_param() {
  local name=$1
  SOURCE_URL="$SOURCE_URL" node --input-type=module -e '
    const raw = (process.env.SOURCE_URL || "").replace(/\x1f/g, "").trim();
    if (!raw) process.exit(0);
    const value = new URL(raw).searchParams.get(process.argv[1]);
    if (value) process.stdout.write(value);
  ' "$name"
}

TOKEN=""
LANGUAGE="en-us"
SERVER_ID="3"

if [[ -z "$SOURCE_URL" && ${#POOL_IDS[@]} -eq 0 ]]; then
  read -r -s -p "Paste an Endfield webview URL: " SOURCE_URL
  echo >&2
fi

if [[ -n "$SOURCE_URL" ]]; then
  TOKEN=$(url_param u8_token)
  LANGUAGE=$(url_param lang)
  SERVER_ID=$(url_param server)
  URL_POOL_ID=$(url_param pool_id)
  LANGUAGE=${LANGUAGE:-en-us}
  SERVER_ID=${SERVER_ID:-3}
  [[ -n "$URL_POOL_ID" ]] && POOL_IDS+=("$URL_POOL_ID")
fi

declare -A SEEN_POOL_IDS=()
DISCOVERED_POOL_IDS=()

add_pool_id() {
  local pool_id=$1
  [[ -n "$pool_id" ]] || return
  [[ -z ${SEEN_POOL_IDS[$pool_id]+x} ]] || return
  SEEN_POOL_IDS[$pool_id]=1
  DISCOVERED_POOL_IDS+=("$pool_id")
}

for pool_id in "${POOL_IDS[@]}"; do
  add_pool_id "$pool_id"
done

api_request() {
  curl --fail --silent --show-error --get "$1" \
    --connect-timeout 10 \
    --max-time 30 \
    --header "User-Agent: $USER_AGENT" \
    "${@:2}"
}

require_success_code() {
  local response=$1
  local context=$2
  local code
  code=$(jq -r '.code // -1' <<<"$response")
  if [[ "$code" != "0" ]]; then
    echo "$context failed: $(jq -r '.msg // "Unknown API error"' <<<"$response") (code $code)" >&2
    exit 1
  fi
}

discover_character_pools() {
  local pool_type response
  local pool_types=(
    E_CharacterGachaPoolType_Special
    E_CharacterGachaPoolType_Standard
    E_CharacterGachaPoolType_Beginner
    E_CharacterGachaPoolType_Joint
  )

  for pool_type in "${pool_types[@]}"; do
    echo "  Checking $pool_type..." >&2
    response=$(api_request "$API_BASE/record/char" \
      --data-urlencode "lang=$LANGUAGE" \
      --data-urlencode "pool_type=$pool_type" \
      --data-urlencode "token=$TOKEN" \
      --data-urlencode "server_id=$SERVER_ID")
    require_success_code "$response" "Character record request"
    while IFS= read -r pool_id; do
      add_pool_id "$pool_id"
    done < <(jq -r '.data.list[]?.poolId // empty' <<<"$response")
  done
}

discover_weapon_pools() {
  local response
  echo "  Checking weapon pools..." >&2
  response=$(api_request "$API_BASE/record/weapon/pool" \
    --data-urlencode "lang=$LANGUAGE" \
    --data-urlencode "token=$TOKEN" \
    --data-urlencode "server_id=$SERVER_ID")
  require_success_code "$response" "Weapon pool request"
  while IFS= read -r pool_id; do
    add_pool_id "$pool_id"
  done < <(jq -r '.data[]?.poolId // empty' <<<"$response")
}

if [[ ${#DISCOVERED_POOL_IDS[@]} -gt 0 ]]; then
  echo "Using explicit pool ID(s); record discovery is not needed." >&2
elif [[ -n "$TOKEN" ]]; then
  echo "Discovering pool IDs from record APIs..." >&2
  discover_character_pools
  discover_weapon_pools
elif [[ -n "$SOURCE_URL" ]]; then
  echo "The supplied URL has no u8_token; only explicit pool IDs can be checked." >&2
fi

if [[ ${#DISCOVERED_POOL_IDS[@]} -eq 0 ]]; then
  echo "No pool IDs were discovered." >&2
  exit 1
fi

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT
METADATA_JSONL="$TEMP_DIR/metadata.jsonl"
: > "$METADATA_JSONL"

echo "Checking ${#DISCOVERED_POOL_IDS[@]} pool ID(s) against /api/content..." >&2

for ((index = 0; index < ${#DISCOVERED_POOL_IDS[@]}; index++)); do
  pool_id=${DISCOVERED_POOL_IDS[$index]}
  response=$(api_request "$API_BASE/content" \
    --data-urlencode "lang=$LANGUAGE" \
    --data-urlencode "pool_id=$pool_id" \
    --data-urlencode "server_id=$SERVER_ID")

  code=$(jq -r '.code // -1' <<<"$response")
  if [[ "$code" != "0" ]]; then
    echo "Skipping $pool_id: $(jq -r '.msg // "content unavailable"' <<<"$response")" >&2
    continue
  fi

  gacha_type=$(jq -r '.data.pool.pool_gacha_type // empty' <<<"$response")
  wire_pool_type=$(jq -r '.data.pool.pool_type // empty' <<<"$response")
  case "$gacha_type:$wire_pool_type" in
    weapon:*) pool_type=weapon ;;
    char:special) pool_type=E_CharacterGachaPoolType_Special ;;
    char:normal) pool_type=E_CharacterGachaPoolType_Standard ;;
    char:newbie) pool_type=E_CharacterGachaPoolType_Beginner ;;
    char:extra) pool_type=E_CharacterGachaPoolType_Joint ;;
    *)
      echo "Skipping $pool_id: unrecognized pool type ($gacha_type/$wire_pool_type)" >&2
      continue
      ;;
  esac

  pool_name=$(jq -r '.data.pool.pool_name // empty' <<<"$response")
  up6_name=$(jq -r '.data.pool.up6_name // empty' <<<"$response")
  featured=""
  if [[ -n "$up6_name" ]]; then
    featured=$(jq -r --arg name "$up6_name" '
      first(.data.pool.all[]? | select(.rarity == 6 and .name == $name) | .id) // empty
    ' <<<"$response")
  fi

  jq -cn \
    --arg id "$pool_id" \
    --arg poolType "$pool_type" \
    --arg poolName "$pool_name" \
    --arg featured "$featured" '
      { id: $id, poolType: $poolType, poolName: $poolName }
      + if $featured == "" then {} else { featured: $featured } end
    ' >> "$METADATA_JSONL"

  echo "Confirmed: $pool_id ($pool_name)" >&2

  if [[ "$pool_type" == "E_CharacterGachaPoolType_Special" && "$pool_id" == special_* ]]; then
    add_pool_id "weponbox_${pool_id#special_}"
  fi
done

if [[ ! -s "$METADATA_JSONL" ]]; then
  echo "No active banner metadata was returned; banners.jsonc was not changed." >&2
  [[ "$DRY_RUN" == "true" ]] && cat "$BANNERS_FILE"
  exit 0
fi

METADATA_JSON="$TEMP_DIR/metadata.json"
jq -s 'unique_by(.id)' "$METADATA_JSONL" > "$METADATA_JSON"

UPDATED_FILE="$TEMP_DIR/banners.jsonc"
jq --slurpfile incoming "$METADATA_JSON" '
  . as $existing
  | [
      $incoming[0][] as $new
      | select(any($existing[]; .id == $new.id) | not)
      | $new
    ]
    + [
        $existing[] as $old
        | (first($incoming[0][] | select(.id == $old.id)) // {}) as $update
        | $old * $update
      ]
' "$BANNERS_FILE" > "$UPDATED_FILE"

if [[ "$DRY_RUN" == "true" ]]; then
  cat "$UPDATED_FILE"
else
  mv "$UPDATED_FILE" "$BANNERS_FILE"
  echo "Updated $BANNERS_FILE" >&2
fi
