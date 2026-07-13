#!/usr/bin/env bash
set -euo pipefail

PY_DIR="/usr/lib/webappinst"
PY_TARGET="${PY_DIR}/popupwindow_desktop.py"

JSON_DIR="/lib/mozilla/native-messaging-hosts"
JSON_TARGET="${JSON_DIR}/popupwindow_desktop.json"

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
        SUDO="sudo"
    else
        echo "Error: Root privileges required. Please run as root or install sudo." >&2
        exit 1
    fi
fi

echo "Removing $PY_TARGET..."
$SUDO rm -f "$PY_TARGET"

echo "Removing $JSON_TARGET..."
$SUDO rm -f "$JSON_TARGET"
$SUDO rm -f "/usr/lib/mozilla/native-messaging-hosts/popupwindow_desktop.json"

if [ -d "$PY_DIR" ] && [ -z "$(ls -A "$PY_DIR" 2>/dev/null)" ]; then
    echo "Removing empty directory $PY_DIR..."
    $SUDO rmdir "$PY_DIR" || true
fi

echo "================================================================="
echo "PopupWindow native host successfully uninstalled!"
echo "================================================================="
