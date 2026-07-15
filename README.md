# PWAish

A seamless Progressive Web App (PWA) installer and desktop launcher for Firefox and Gecko-based browsers on Linux [tested on arch].

**PWAish** brings native-like PWA installation to Firefox. Instead of ordinary browser tabs, web apps installed through PWAish launch as standalone, chromeless desktop applications complete with native Linux `.desktop` entries and application icons.


https://github.com/user-attachments/assets/0abe172e-9984-4510-9bc4-cdd6030c370c


---

## Features

- **URL Bar PWA Installer**: Displays an **Install the app** action icon directly in the address bar on HTTP and HTTPS sites.
- **Manifest & Icon Discovery**: Automatically discovers and parses Web App Manifests (`manifest.json`) to extract app titles, start URLs, and high-resolution icons.
- **Native Desktop Integration**: Uses Firefox native messaging to create standard Linux `.desktop` launchers in `~/.local/share/applications`.
- **Multi-Browser Auto-Detection**: Fully supports [Firefox](https://www.mozilla.org/firefox/), [Zen Browser](https://zen-browser.app/), [Floorp](https://floorp.app/), and [LibreWolf](https://librewolf.net/). PWAish automatically inspects the calling process so PWAs installed from any browser open natively in that same browser.

---

## How It Works

1. **Install App**: Click the **Install the app** icon in the URL bar while browsing any web app.
2. **Native Messaging Host**: The extension sends app metadata (title, URL, manifest icon) to the native messaging host script (`popupwindow_desktop.py`).
3. **Desktop Entry Creation**: The host downloads the app icon and generates a `.desktop` file in `~/.local/share/applications`.
4. **App Launch**: Launching the app from your application menu opens the extension's launcher page (`launcher.html`), which immediately elevates the app into a standalone popup window.

---

## Installation

### 1. Install the Native Messaging Host (Linux)

The native messaging host is required to create Linux desktop entries. Installation is user-local (`~/.local`) and does not require root/sudo privileges.

#### Automated Installation

Install directly using `curl`:

```bash
curl -fsSL https://raw.githubusercontent.com/ADIOR-enigma/PWAish/main/install.sh | bash
```

Or, if you have cloned this repository locally:

```bash
./install.sh
```

This installs:
- Python installer script: `~/.local/lib/webappinst/popupwindow_desktop.py`
- Native messaging host manifest: `~/.mozilla/native-messaging-hosts/popupwindow_desktop.json` (shared across Firefox, Zen Browser, Floorp, and LibreWolf)

#### Manual Installation

1. Create target directories:
   ```bash
   mkdir -p ~/.local/lib/webappinst
   mkdir -p ~/.mozilla/native-messaging-hosts
   ```
2. Copy `native/popupwindow_desktop.py` to `~/.local/lib/webappinst/popupwindow_desktop.py` and make it executable:
   ```bash
   cp native/popupwindow_desktop.py ~/.local/lib/webappinst/popupwindow_desktop.py
   chmod 755 ~/.local/lib/webappinst/popupwindow_desktop.py
   ```
3. Copy `native/popupwindow_desktop.json` to `~/.mozilla/native-messaging-hosts/popupwindow_desktop.json` and update its `"path"` to point to your script:
   ```bash
   cp native/popupwindow_desktop.json ~/.mozilla/native-messaging-hosts/popupwindow_desktop.json
   sed -i "s|\"path\": \".*\"|\"path\": \"$HOME/.local/lib/webappinst/popupwindow_desktop.py\"|" ~/.mozilla/native-messaging-hosts/popupwindow_desktop.json
   chmod 644 ~/.mozilla/native-messaging-hosts/popupwindow_desktop.json
   ```

---

### 2. Install the Browser Extension

Because `webappinst.xpi` is a standard XPI package, you can install it directly into **any Gecko-based browser** (Firefox, Zen Browser, Floorp, LibreWolf, etc.):

1. Go to the [Releases page](https://github.com/ADIOR-enigma/PWAish/releases/latest) and click on **`webappinst.xpi`** to install it directly in your browser.
   - *Alternatively, you can build from source locally using `npm run build` and install `dist/webappinst.xpi`.*
2. Once installed, visit any web application to see the **Install the app** icon in your address bar.

---

### 3. Install Autoconfig for Zen Browser (`--app=URL` Support) (Optional)

Zen Browser can launch true standalone, chromeless PWA windows directly via the command-line flag `--app=URL`. PWAish includes a Zen Browser autoconfig installer (`install_autoconfig.sh`) that sets up this capability seamlessly while preserving any existing `fx-autoconfig` scripts.

#### Automated Installation

Install directly using `curl`:

```bash
curl -fsSL https://raw.githubusercontent.com/ADIOR-enigma/PWAish/main/PWA_for_Zen/install_autoconfig.sh | sudo bash
```

Or from a local clone:

```bash
sudo ./PWA_for_Zen/install_autoconfig.sh
```

**How `install_autoconfig.sh` works (Install & Update):**
1. **Checks `config-prefs.js`**: Verifies if `defaults/pref/config-prefs.js` exists in Zen Browser system directories (`/opt/zen-browser-bin`, `/usr/lib/zen-browser`, etc.). If not present, adds the file. If present, verifies and appends autoconfig preferences (`general.config.filename`) without overwriting your setup.
2. **Checks `config.js`**: Verifies if `config.js` exists. If not present, creates the file with the PWAish autoconfig handler (`pwaish.cfg`). If present, it checks whether an existing `PWAish Standalone Autoconfig Handler` block is already there. If found, it cleanly replaces/updates the block with the latest version; if not, it appends the PWAish code cleanly so your existing `fx-autoconfig` scripts and PWAish run side by side.

> [!TIP]
> **Updating PWAish**: Because `install.sh` and `install_autoconfig.sh` are idempotent, you can re-run either installation script at any time to update your local files (`popupwindow_desktop.py`) or Zen Browser autoconfig setup to the latest version.


---

## Configuration

PWAish automatically detects which browser (`firefox`, `zen-browser`, `floorp`, or `librewolf`) invoked the install request and configures `.desktop` launchers to use that browser executable.

You can optionally override the browser used for PWA launches:

1. **Environment variable override**: Set `PWAISH_BROWSER` or `POPUPWINDOW_BROWSER` when launching:
```bash
export PWAISH_BROWSER=floorp
```
2. **System-wide override**: Edit `/etc/webappinst/browser` to contain `firefox`, `zen-browser`, `floorp`, or `librewolf`.
3. **Per-user override**: Create `~/.config/webappinst/browser` with your preferred browser executable.

---

## Uninstallation

### 1. Uninstall the Native Messaging Host

To remove the native messaging host and clean up installed files:

```bash
curl -fsSL https://raw.githubusercontent.com/ADIOR-enigma/PWAish/main/uninstall.sh | bash
```

Or from a local clone:

```bash
./uninstall.sh
```

### 2. Uninstall the Zen Browser Autoconfig Setup

To remove or downgrade the PWAish autoconfig setup across Zen Browser directories:

```bash
curl -fsSL https://raw.githubusercontent.com/ADIOR-enigma/PWAish/main/PWA_for_Zen/uninstall_autoconfig.sh | sudo bash
```

Or from a local clone:

```bash
sudo ./PWA_for_Zen/uninstall_autoconfig.sh
```


#### Uninstaller Options (`uninstall_autoconfig.sh`)

When running `uninstall_autoconfig.sh`, you can choose how to handle your configuration files:
- **`--keep-fx` (`-k`)**: **Keep original fx-autoconfig**. Preserves `config-prefs.js` and your existing `config.js`, removing ONLY the `PWAish Standalone Autoconfig Handler` code block. Ideal if you use custom `fx-autoconfig` userChrome modifications in Zen Browser.
- **`--remove-all` (`-r`)**: **Remove whole setup**. Deletes both `config.js` and `defaults/pref/config-prefs.js` completely from Zen Browser directories.

If run interactively without options, `uninstall_autoconfig.sh` presents a prompt allowing you to select whether to keep your original `fx-autoconfig` setup or remove the entire configuration.

