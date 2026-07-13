# PWAish

A seamless Progressive Web App (PWA) installer and desktop launcher for Firefox and Gecko-based browsers on Linux.

**PWAish** brings native-like PWA installation to Firefox. Instead of ordinary browser tabs, web apps installed through PWAish launch as standalone, chromeless desktop applications complete with native Linux `.desktop` entries and application icons.

---

## Features

- **URL Bar PWA Installer**: Displays an **Install the app** action icon directly in the address bar on HTTP and HTTPS sites.
- **Manifest & Icon Discovery**: Automatically discovers and parses Web App Manifests (`manifest.json`) to extract app titles, start URLs, and high-resolution icons.
- **Native Desktop Integration**: Uses Firefox native messaging to create standard Linux `.desktop` launchers in `~/.local/share/applications`.
- **Standalone Chromeless Windows**: Opens web applications in clean, standalone windows without tab bars, navigation bars, or bookmark bars for an authentic desktop application feel.
- **Gecko & Zen Browser Support**: Automatically detects and prioritizes [Zen Browser](https://zen-browser.app/) when available, falling back to Firefox.

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
- Native messaging host manifest: `/lib/mozilla/native-messaging-hosts/popupwindow_desktop.json`

#### Manual Installation

1. Copy `native/popupwindow_desktop.py` to `/usr/lib/webappinst/popupwindow_desktop.py` and make it executable (`sudo chmod 755 /usr/lib/webappinst/popupwindow_desktop.py`).
2. Copy `native/popupwindow_desktop.json` to `/lib/mozilla/native-messaging-hosts/popupwindow_desktop.json` (`sudo chmod 644 /lib/mozilla/native-messaging-hosts/popupwindow_desktop.json`).

---

### 2. Install the Firefox Extension

1. Download the latest release package (`webappinst.xpi`) or build it locally using `npm run build`.
2. Open Firefox or Zen Browser and install the extension package.
3. Visit any web application to see the **Install the app** icon in your address bar.

---

## Configuration

By default, desktop shortcuts launch using `zen-browser` if installed on your system, or `firefox` otherwise.

You can override the executable used when launching installed web apps by setting the `POPUPWINDOW_BROWSER` environment variable:

```bash
export POPUPWINDOW_BROWSER=/path/to/custom/firefox
```

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
