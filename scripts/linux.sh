#!/usr/bin/env bash

SEARCH_DIRS=(
    "$HOME/.config/faugus-launcher/prefixes"
    "$HOME/.local/share/bottles/bottles"
    "$HOME/.local/share/Steam/steamapps/compatdata"
    "$HOME/Games" # lutris/heroic
)

TARGET_FILE="data_1"
TARGET_PATH="PlatformProcess/Cache/data_1"

best_url=""
best_mtime=0

echo "Searching for $TARGET_FILE..."
echo ""

for dir in "${SEARCH_DIRS[@]}"; do
    if [[ ! -d "$dir" ]]; then
        continue
    fi

    while IFS= read -r -d '' datafile; do
        # Only match files under PlatformProcess/Cache/
        if [[ "$datafile" != *"$TARGET_PATH"* ]]; then
            continue
        fi

        mtime=$(stat -c '%Y' "$datafile" 2>/dev/null || stat -f '%m' "$datafile" 2>/dev/null || echo 0)

        # Strip null bytes, normalize escape sequences, extract the last u8_token URL
        url=$(tr -d '\0' < "$datafile" | sed 's/\\u0026/\&/g; s/\\\//\//g; s/\&amp;/\&/g' | grep -oP 'https?://[^\s"'\''<>\\]+u8_token=[^\s"'\''<>\\]+' | tail -1)

        if [[ -z "$url" ]]; then
            continue
        fi

        echo "Found: $datafile"

        if [[ "$mtime" -gt "$best_mtime" ]]; then
            best_mtime="$mtime"
            best_url="$url"
        fi
    done < <(find "$dir" -type f -name "$TARGET_FILE" -print0 2>/dev/null)
done

if [[ -z "$best_url" ]]; then
    echo "No URL containing u8_token was found in any data_1 file."
    echo ""
    echo "Checked directories:"
    for dir in "${SEARCH_DIRS[@]}"; do
        echo "  $dir"
    done
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " URL: $best_url"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if command -v wl-copy &>/dev/null; then
    echo "$best_url" | wl-copy
    echo ""
    echo "✔ Copied to clipboard via wl-copy"
elif command -v xclip &>/dev/null; then
    echo "$best_url" | xclip -selection clipboard
    echo ""
    echo "✔ Copied to clipboard via xclip"
else
    echo ""
    echo "⚠ No clipboard tool found (install wl-copy or xclip to enable auto-copy)"
fi