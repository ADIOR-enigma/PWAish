#!/usr/bin/env bash
set -euo pipefail

REPO_RAW_BASE="https://raw.githubusercontent.com/ADIOR-enigma/PWAish/main"
PY_URL="${REPO_RAW_BASE}/native/popupwindow_desktop.py"
JSON_URL="${REPO_RAW_BASE}/native/popupwindow_desktop.json"

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

echo "Creating target directories..."
$SUDO mkdir -p "$PY_DIR"
$SUDO mkdir -p "$JSON_DIR"

if [ -f "native/popupwindow_desktop.py" ]; then
    echo "Installing popupwindow_desktop.py from local repository..."
    $SUDO cp "native/popupwindow_desktop.py" "$PY_TARGET"
else
    echo "Downloading popupwindow_desktop.py from GitHub..."
    if command -v curl >/dev/null 2>&1; then
        $SUDO curl -fsSL "$PY_URL" -o "$PY_TARGET"
    elif command -v wget >/dev/null 2>&1; then
        $SUDO wget -qO "$PY_TARGET" "$PY_URL"
    else
        echo "Error: curl or wget is required to download files." >&2
        exit 1
    fi
fi
$SUDO chmod 755 "$PY_TARGET"

if [ -f "native/popupwindow_desktop.json" ]; then
    echo "Installing popupwindow_desktop.json from local repository..."
    $SUDO cp "native/popupwindow_desktop.json" "$JSON_TARGET"
else
    echo "Downloading popupwindow_desktop.json from GitHub..."
    if command -v curl >/dev/null 2>&1; then
        $SUDO curl -fsSL "$JSON_URL" -o "$JSON_TARGET"
    elif command -v wget >/dev/null 2>&1; then
        $SUDO wget -qO "$JSON_TARGET" "$JSON_URL"
    else
        echo "Error: curl or wget is required to download files." >&2
        exit 1
    fi
fi
$SUDO chmod 644 "$JSON_TARGET"

# Also install to /usr/lib/mozilla/native-messaging-hosts if directory exists and /lib is not a symlink
if [ -d "/usr/lib/mozilla/native-messaging-hosts" ] && [ ! -L "/lib" ]; then
    $SUDO cp "$JSON_TARGET" "/usr/lib/mozilla/native-messaging-hosts/popupwindow_desktop.json"
    $SUDO chmod 644 "/usr/lib/mozilla/native-messaging-hosts/popupwindow_desktop.json"
fi

echo "================================================================="
echo "PopupWindow native host successfully installed!"
echo "  Python Script : $PY_TARGET"
echo "  JSON Manifest : $JSON_TARGET"
echo "================================================================="
