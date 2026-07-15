#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_RAW_BASE="https://raw.githubusercontent.com/ADIOR-enigma/PWAish/main/PWA_for_Zen"

echo "================================================================="
echo "PWAish Zen Browser Autoconfig Installer (--app=URL)"
echo "================================================================="

# Locate local config files or download via curl into a temporary directory
TMP_DIR=""
cleanup_tmp() {
    if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
        rm -rf "$TMP_DIR"
    fi
}
trap cleanup_tmp EXIT

if [ -f "$SCRIPT_DIR/pwaish.cfg" ]; then
    PWAISH_CFG_SRC="$SCRIPT_DIR/pwaish.cfg"
elif [ -f "$SCRIPT_DIR/PWA_for_Zen/pwaish.cfg" ]; then
    PWAISH_CFG_SRC="$SCRIPT_DIR/PWA_for_Zen/pwaish.cfg"
else
    echo "Downloading pwaish.cfg from GitHub repository..."
    TMP_DIR=$(mktemp -d)
    curl -fsSL "${REPO_RAW_BASE}/pwaish.cfg" -o "$TMP_DIR/pwaish.cfg" || wget -qO "$TMP_DIR/pwaish.cfg" "${REPO_RAW_BASE}/pwaish.cfg"
    PWAISH_CFG_SRC="$TMP_DIR/pwaish.cfg"
fi

if [ -f "$SCRIPT_DIR/defaults/pref/config-prefs.js" ]; then
    CONFIG_PREFS_SRC="$SCRIPT_DIR/defaults/pref/config-prefs.js"
elif [ -f "$SCRIPT_DIR/PWA_for_Zen/defaults/pref/config-prefs.js" ]; then
    CONFIG_PREFS_SRC="$SCRIPT_DIR/PWA_for_Zen/defaults/pref/config-prefs.js"
else
    if [ -z "$TMP_DIR" ]; then
        TMP_DIR=$(mktemp -d)
    fi
    echo "Downloading config-prefs.js from GitHub repository..."
    curl -fsSL "${REPO_RAW_BASE}/defaults/pref/config-prefs.js" -o "$TMP_DIR/config-prefs.js" || wget -qO "$TMP_DIR/config-prefs.js" "${REPO_RAW_BASE}/defaults/pref/config-prefs.js"
    CONFIG_PREFS_SRC="$TMP_DIR/config-prefs.js"
fi

if [ ! -s "$PWAISH_CFG_SRC" ] || [ ! -s "$CONFIG_PREFS_SRC" ]; then
    echo "Error: Failed to locate or download autoconfig source files." >&2
    exit 1
fi

# Candidate Zen Browser install directories
CANDIDATE_DIRS=(
    "/opt/zen-browser-bin"
    "/opt/zen"
    "/usr/lib/zen-browser"
    "/usr/local/lib/zen-browser"
    "$HOME/.local/share/zen-browser"
)

install_to() {
    local dir="$1"
    if [ ! -w "$dir" ]; then
        echo "  SKIP: $dir is not writable (try running with sudo: sudo $0)"
        return
    fi

    mkdir -p "$dir/defaults/pref"
    local config_prefs_path="$dir/defaults/pref/config-prefs.js"

    # Step 1: Check if config-prefs.js file is there; if not, add the file
    if [ ! -f "$config_prefs_path" ]; then
        echo "  Adding → $config_prefs_path ..."
        cp "$CONFIG_PREFS_SRC" "$config_prefs_path"
        chmod 644 "$config_prefs_path"
    else
        echo "  Existing $config_prefs_path found. Verifying autoconfig preferences..."
        if ! grep -q '"general.config.filename"' "$config_prefs_path" && ! grep -q "'general.config.filename'" "$config_prefs_path"; then
            echo "  Appending general.config preferences to $config_prefs_path ..."
            echo 'pref("general.config.obscure_value", 0);' >> "$config_prefs_path"
            echo 'pref("general.config.filename", "config.js");' >> "$config_prefs_path"
            echo 'pref("general.config.sandbox_enabled", false);' >> "$config_prefs_path"
        fi
    fi

    # Determine what filename config-prefs.js points to (default: config.js)
    local target_cfg_name
    target_cfg_name=$(grep -oP 'pref\(\s*["'\''"]general\.config\.filename["'\''"]\s*,\s*["'\''"]\K[^"'\''"]+' "$config_prefs_path" 2>/dev/null || echo "config.js")
    local target_cfg_path="$dir/$target_cfg_name"

    # Step 2: Check config.js; if there, add the rest of the code; if not, add the file
    if [ ! -f "$target_cfg_path" ]; then
        echo "  Adding → $target_cfg_path ..."
        cp "$PWAISH_CFG_SRC" "$target_cfg_path"
        chmod 644 "$target_cfg_path"
    else
        echo "  Existing $target_cfg_path found. Checking for PWAish autoconfig handler..."
        if grep -q "PWAish Standalone Autoconfig Handler" "$target_cfg_path"; then
            echo "  PWAish autoconfig code already present in $target_cfg_path (skipping)."
        else
            echo "  Adding PWAish autoconfig handler to existing $target_cfg_path ..."
            echo "" >> "$target_cfg_path"
            # Extract only the PWAish Standalone Autoconfig Handler block to append to existing autoconfig file
            sed -n '/^\/\/ PWAish Standalone Autoconfig Handler - START/,$p' "$PWAISH_CFG_SRC" >> "$target_cfg_path"
        fi
    fi

    echo "  Done: $dir"
}

if [ $# -ge 1 ]; then
    # Explicit target(s) provided on command line
    for dir in "$@"; do
        if [ ! -d "$dir" ]; then
            echo "Error: directory not found: $dir"
            exit 1
        fi
        echo ""
        echo "Target: $dir"
        install_to "$dir"
    done
else
    # Auto-discover: install to ALL found browser directories
    INSTALLED=0
    for dir in "${CANDIDATE_DIRS[@]}"; do
        if [ -d "$dir" ] && [ -d "$dir/defaults/pref" ]; then
            echo ""
            echo "Found: $dir"
            install_to "$dir"
            INSTALLED=$((INSTALLED + 1))
        fi
    done

    if [ "$INSTALLED" -eq 0 ]; then
        echo ""
        echo "Error: No supported Zen Browser installation found."
        echo "Please specify the Zen Browser directory explicitly:"
        echo "  sudo $0 /path/to/zen-browser"
        exit 1
    fi

    echo ""
    echo "Installed to $INSTALLED Zen Browser instance(s)."
fi

echo ""
echo "PWAish Zen Browser autoconfig installation complete!"
echo "Restart all Zen Browser instances for changes to take effect."
