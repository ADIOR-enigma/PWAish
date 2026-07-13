# PWAish

A seamless Progressive Web App (PWA) installer and desktop launcher for Firefox and Gecko-based browsers on Linux [tested on arch].

**PWAish** brings native-like PWA installation to Firefox. Instead of ordinary browser tabs, web apps installed through PWAish launch as standalone, chromeless desktop applications complete with native Linux `.desktop` entries and application icons.

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

The native messaging host is required to create Linux desktop entries.

#### Automated Installation

Install directly using `curl`:

```bash
curl -fsSL https://raw.githubusercontent.com/ADIOR-enigma/PWAish/main/install.sh | sudo bash
```

Or, if you have cloned this repository locally:

```bash
sudo ./install.sh
```

This installs:
- Python installer script: `/usr/lib/webappinst/popupwindow_desktop.py`
- Native messaging host manifest: `/lib/mozilla/native-messaging-hosts/popupwindow_desktop.json` (shared across Firefox, Zen Browser, Floorp, and LibreWolf)

#### Manual Installation

1. Copy `native/popupwindow_desktop.py` to `/usr/lib/webappinst/popupwindow_desktop.py` and make it executable (`sudo chmod 755 /usr/lib/webappinst/popupwindow_desktop.py`).
2. Copy `native/popupwindow_desktop.json` to `/lib/mozilla/native-messaging-hosts/popupwindow_desktop.json` (`sudo chmod 644 /lib/mozilla/native-messaging-hosts/popupwindow_desktop.json`).

---

### 2. Install the Browser Extension

Because `webappinst.xpi` is a standard XPI package, you can install it directly into **any Gecko-based browser** (Firefox, Zen Browser, Floorp, LibreWolf, etc.):

1. Go to the [Releases page](https://github.com/ADIOR-enigma/PWAish/releases/latest) and click on **`webappinst.xpi`** to download and install it directly in your browser.
   - *Alternatively, you can build from source locally using `npm run build` and install `dist/webappinst.xpi`.*
2. Once installed, visit any web application to see the **Install the app** icon in your address bar.

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

To remove the native messaging host and clean up installed system files:

```bash
curl -fsSL https://raw.githubusercontent.com/ADIOR-enigma/PWAish/main/uninstall.sh | sudo bash
```

Or from a local clone:

```bash
sudo ./uninstall.sh
```
