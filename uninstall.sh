#!/usr/bin/env bash
set -euo pipefail

# User-local paths
PY_DIR="$HOME/.local/lib/webappinst"
PY_TARGET="${PY_DIR}/popupwindow_desktop.py"

JSON_DIR="$HOME/.mozilla/native-messaging-hosts"
JSON_TARGET="${JSON_DIR}/popupwindow_desktop.json"

echo "Removing $PY_TARGET..."
rm -f "$PY_TARGET"

echo "Removing $JSON_TARGET..."
rm -f "$JSON_TARGET"

if [ -d "$PY_DIR" ] && [ -z "$(ls -A "$PY_DIR" 2>/dev/null)" ]; then
    echo "Removing empty directory $PY_DIR..."
    rmdir "$PY_DIR" || true
fi

echo "================================================================="
echo "PWAish native host successfully uninstalled!"
echo "================================================================="
echo "Optional: If you installed the Zen Browser autoconfig setup, remove it via:"
echo "  curl -fsSL https://raw.githubusercontent.com/ADIOR-enigma/PWAish/main/PWA_for_Zen/uninstall_autoconfig.sh | sudo bash"
echo ""



