#!/usr/bin/env bash
set -euo pipefail

REPO_RAW_BASE="https://raw.githubusercontent.com/ADIOR-enigma/PWAish/main"
PY_URL="${REPO_RAW_BASE}/native/popupwindow_desktop.py"
JSON_URL="${REPO_RAW_BASE}/native/popupwindow_desktop.json"

PY_DIR="$HOME/.local/lib/webappinst"
PY_TARGET="${PY_DIR}/popupwindow_desktop.py"

JSON_DIR="$HOME/.mozilla/native-messaging-hosts"
JSON_TARGET="${JSON_DIR}/popupwindow_desktop.json"

echo "Creating target directories..."
mkdir -p "$PY_DIR" "$JSON_DIR"

# Install Python script
if [ -f "native/popupwindow_desktop.py" ]; then
    echo "Installing popupwindow_desktop.py from local repository..."
    cp "native/popupwindow_desktop.py" "$PY_TARGET"
else
    echo "Downloading popupwindow_desktop.py..."
    curl -fsSL "$PY_URL" -o "$PY_TARGET" || wget -qO "$PY_TARGET" "$PY_URL"
fi
chmod 755 "$PY_TARGET"

# Install JSON manifest
if [ -f "native/popupwindow_desktop.json" ]; then
    echo "Installing popupwindow_desktop.json from local repository..."
    cp "native/popupwindow_desktop.json" "$JSON_TARGET"
else
    echo "Downloading popupwindow_desktop.json..."
    curl -fsSL "$JSON_URL" -o "$JSON_TARGET" || wget -qO "$JSON_TARGET" "$JSON_URL"
fi
chmod 644 "$JSON_TARGET"

# Validate JSON contains path field
grep -q '"path"' "$JSON_TARGET" || {
    echo "Error: Invalid JSON manifest (missing path field)" >&2
    exit 1
}

# Patch path safely
sed -i 's|"path":[[:space:]]*".*"|"path": "'"$PY_TARGET"'"|' "$JSON_TARGET"

echo "================================================================="
echo "PWAish native host successfully installed!"
echo "  Python Script : $PY_TARGET"
echo "  JSON Manifest : $JSON_TARGET"
echo "================================================================="
echo ""
echo "Optional: If using Zen Browser, install the autoconfig for native --app=URL window support:"
echo "  curl -fsSL https://raw.githubusercontent.com/ADIOR-enigma/PWAish/main/PWA_for_Zen/install_autoconfig.sh | sudo bash"
echo ""

echo "Restart all browser instances to apply changes."


