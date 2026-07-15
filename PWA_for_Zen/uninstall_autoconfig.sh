#!/usr/bin/env bash
set -euo pipefail

echo "================================================================="
echo "PWAish Zen Browser Autoconfig Uninstaller"
echo "================================================================="

MODE=""

show_help() {
    echo "Usage: sudo $0 [OPTIONS] [DIRECTORY...]"
    echo ""
    echo "Options:"
    echo "  -k, --keep-fx, --keep-fx-autoconfig"
    echo "      Keep original fx-autoconfig setup (config-prefs.js and base config.js),"
    echo "      removing ONLY the PWAish Standalone Autoconfig Handler code block."
    echo ""
    echo "  -r, -a, --remove-all, --purge"
    echo "      Remove the entire autoconfig setup (config.js and defaults/pref/config-prefs.js)."
    echo ""
    echo "  -h, --help"
    echo "      Show this help message and exit."
    echo ""
}

# Parse command line arguments
TARGET_DIRS=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        -k|--keep-fx|--keep-fx-autoconfig|--keep)
            MODE="keep_fx"
            shift
            ;;
        -r|-a|--remove-all|--purge|--remove)
            MODE="remove_all"
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        -*)
            echo "Error: Unknown option $1" >&2
            show_help
            exit 1
            ;;
        *)
            TARGET_DIRS+=("$1")
            shift
            ;;
    esac
done

if [ -z "$MODE" ]; then
    if [ -t 0 ]; then
        echo "Please select how to uninstall the autoconfig setup:"
        echo "  1) Keep original fx-autoconfig (remove ONLY PWAish code from config.js)"
        echo "  2) Remove whole setup (remove config.js and defaults/pref/config-prefs.js)"
        echo "  q) Cancel and quit"
        echo ""
        read -r -p "Enter choice [1/2/q]: " CHOICE
        case "$CHOICE" in
            1|[kK]*)
                MODE="keep_fx"
                ;;
            2|[rR]*|[aA]*)
                MODE="remove_all"
                ;;
            [qQ]*)
                echo "Uninstallation cancelled."
                exit 0
                ;;
            *)
                echo "Invalid choice. Cancelling."
                exit 1
                ;;
        esac
    else
        echo "Notice: Running non-interactively without --keep-fx or --remove-all flag."
        echo "Defaulting to --keep-fx (keeping existing fx-autoconfig setup and removing only PWAish code block)."
        echo "To remove the entire autoconfig setup non-interactively, run with: sudo $0 --remove-all"
        MODE="keep_fx"
    fi
fi

# Candidate Zen Browser install directories
CANDIDATE_DIRS=(
    "/opt/zen-browser-bin"
    "/opt/zen"
    "/usr/lib/zen-browser"
    "/usr/local/lib/zen-browser"
    "$HOME/.local/share/zen-browser"
)

uninstall_from() {
    local dir="$1"
    if [ ! -w "$dir" ]; then
        echo "  SKIP: $dir is not writable (try running with sudo: sudo $0)"
        return
    fi

    local config_prefs_path="$dir/defaults/pref/config-prefs.js"
    local target_cfg_name="config.js"
    if [ -f "$config_prefs_path" ]; then
        target_cfg_name=$(grep -oP 'pref\(\s*["'\''"]general\.config\.filename["'\''"]\s*,\s*["'\''"]\K[^"'\''"]+' "$config_prefs_path" 2>/dev/null || echo "config.js")
    fi
    local target_cfg_path="$dir/$target_cfg_name"

    if [ "$MODE" = "keep_fx" ]; then
        echo "  [Keep fx-autoconfig] Checking $target_cfg_path for PWAish block..."
        if [ -f "$target_cfg_path" ] && grep -q "PWAish Standalone Autoconfig Handler" "$target_cfg_path"; then
            # Remove from START to END if explicit tags exist, otherwise use python regex to remove the PWAish handler function
            python3 -c '
import sys, re
with open(sys.argv[1], "r", encoding="utf-8") as f:
    content = f.read()
pattern = r"\n?// PWAish Standalone Autoconfig Handler.*?(?:// PWAish Standalone Autoconfig Handler - END|\b\}\)\(\);(?:\s*\n)?)"
new_content = re.sub(pattern, "", content, flags=re.DOTALL)
with open(sys.argv[1], "w", encoding="utf-8") as f:
    f.write(new_content)
' "$target_cfg_path"
            echo "  Removed PWAish autoconfig handler from $target_cfg_path (kept original fx-autoconfig)."
        else
            echo "  PWAish autoconfig block not found in $target_cfg_path."
        fi
    elif [ "$MODE" = "remove_all" ]; then
        echo "  [Remove whole setup] Cleaning up $dir ..."
        if [ -f "$target_cfg_path" ]; then
            rm -f "$target_cfg_path"
            echo "  Removed $target_cfg_path"
        fi
        if [ -f "$config_prefs_path" ]; then
            rm -f "$config_prefs_path"
            echo "  Removed $config_prefs_path"
        fi
        if [ -d "$dir/defaults/pref" ] && [ -z "$(ls -A "$dir/defaults/pref" 2>/dev/null)" ]; then
            rmdir "$dir/defaults/pref" 2>/dev/null || true
        fi
        if [ -d "$dir/defaults" ] && [ -z "$(ls -A "$dir/defaults" 2>/dev/null)" ]; then
            rmdir "$dir/defaults" 2>/dev/null || true
        fi
        echo "  Removed autoconfig files from $dir."
    fi
}

if [ ${#TARGET_DIRS[@]} -ge 1 ]; then
    for dir in "${TARGET_DIRS[@]}"; do
        if [ ! -d "$dir" ]; then
            echo "Error: directory not found: $dir"
            exit 1
        fi
        echo ""
        echo "Target: $dir"
        uninstall_from "$dir"
    done
else
    UNINSTALLED=0
    for dir in "${CANDIDATE_DIRS[@]}"; do
        if [ -d "$dir" ] && ([ -f "$dir/config.js" ] || [ -f "$dir/defaults/pref/config-prefs.js" ]); then
            echo ""
            echo "Found autoconfig at: $dir"
            uninstall_from "$dir"
            UNINSTALLED=$((UNINSTALLED + 1))
        fi
    done

    if [ "$UNINSTALLED" -eq 0 ]; then
        echo ""
        echo "No PWAish autoconfig installations found."
        exit 0
    fi

    echo ""
    echo "Processed $UNINSTALLED Zen Browser directory/directories."
fi

echo ""
echo "PWAish Zen Browser autoconfig uninstallation complete!"
echo "Restart all Zen Browser instances for changes to take effect."
