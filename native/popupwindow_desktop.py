#!/usr/bin/env python3
"""Example native messaging host for PopupWindow desktop entries."""

import json
import os
import re
import shutil
import struct
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

APP_DIR = Path.home() / ".local" / "share" / "applications"


def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) == 0:
        sys.exit(0)
    message_length = struct.unpack("=I", raw_length)[0]
    return json.loads(sys.stdin.buffer.read(message_length).decode("utf-8"))


def send_message(message):
    encoded = json.dumps(message).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("=I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def safe_name(value):
    return re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-.").lower() or "web-app"


def download_icon(url, icon_dir, base_name):
    import urllib.request

    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0"
        },
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        data = resp.read()
        if not data or len(data) < 32:
            return None
        ext = Path(urlparse(url).path).suffix.lower()
        if ext not in (".svg", ".png", ".ico", ".jpg", ".jpeg", ".webp"):
            content_type = resp.headers.get("Content-Type", "")
            ext = ".svg" if "image/svg" in content_type else ".png"
        icon_path = icon_dir / f"{base_name}{ext}"
        icon_path.write_bytes(data)
        icon_path.chmod(0o644)
        return str(icon_path)


def save_app_icon(icon_url, base_name):
    if not icon_url or not isinstance(icon_url, str):
        return "zen-browser"
    if "://" not in icon_url and not icon_url.startswith("data:"):
        return icon_url

    icon_dir = Path.home() / ".local" / "share" / "icons"
    icon_dir.mkdir(parents=True, exist_ok=True)

    try:
        if icon_url.startswith("data:"):
            import base64

            header, encoded = icon_url.split(",", 1)
            ext = ".svg" if "image/svg+xml" in header else ".png"
            icon_path = icon_dir / f"{base_name}{ext}"
            icon_path.write_bytes(base64.b64decode(encoded))
            icon_path.chmod(0o644)
            return str(icon_path)
        elif icon_url.startswith(("http://", "https://")):
            res = download_icon(icon_url, icon_dir, base_name)
            if res:
                return res
            parsed = urlparse(icon_url)
            res = download_icon(
                f"{parsed.scheme}://{parsed.netloc}/favicon.ico", icon_dir, base_name
            )
            if res:
                return res
    except Exception:
        pass

    return "zen-browser"


def install(payload):
    APP_DIR.mkdir(parents=True, exist_ok=True)
    title = payload.get("title") or payload.get("startUrl") or "Web App"
    start_url = payload.get("startUrl") or payload.get("url")
    parsed = urlparse(start_url)
    desktop_stem = f"popupwindow-{safe_name(parsed.netloc)}-{safe_name(title)}"
    desktop_id = f"{desktop_stem}.desktop"
    desktop_path = APP_DIR / desktop_id
    raw_icon = payload.get("iconUrl") or "zen-browser"
    icon = save_app_icon(raw_icon, desktop_stem)
    launcher_url = payload.get("launcherUrl") or start_url
    browser = (
        os.environ.get("POPUPWINDOW_BROWSER")
        or shutil.which("zen-browser")
        or "zen-browser"
    )
    command = f"{json.dumps(browser)} {json.dumps(launcher_url)}"
    desktop_path.write_text(
        "[Desktop Entry]\n"
        "Version=1.0\n"
        "Terminal=false\n"
        "Type=Application\n"
        f"Name={title}\n"
        f"Exec={command}\n"
        f"Icon={icon}\n"
        "Categories=Network;WebBrowser;\n",
        encoding="utf-8",
    )
    desktop_path.chmod(0o755)
    subprocess.run(
        ["update-desktop-database", str(APP_DIR)],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return {"ok": True, "desktopEntry": str(desktop_path)}


def check_installed(payload):
    url = payload.get("url") or payload.get("startUrl") or ""
    parsed = urlparse(url)
    netloc_slug = safe_name(parsed.netloc)
    if not netloc_slug or not APP_DIR.exists():
        return {"ok": True, "installed": False}
    prefix = f"popupwindow-{netloc_slug}-"
    for entry in APP_DIR.glob(f"{prefix}*.desktop"):
        return {"ok": True, "installed": True, "desktopEntry": str(entry)}
    return {"ok": True, "installed": False}


def list_installed():
    apps = set()
    if APP_DIR.exists():
        for entry in APP_DIR.glob("popupwindow-*.desktop"):
            try:
                content = entry.read_text(encoding="utf-8", errors="ignore")
                for line in content.splitlines():
                    if line.startswith("Exec="):
                        for word in line.split():
                            word = word.strip('"\'')
                            if word.startswith(("http://", "https://")):
                                parsed = urlparse(word)
                                if parsed.netloc:
                                    apps.add(parsed.netloc.lower())
                            elif "url=" in word:
                                import urllib.parse

                                q = urllib.parse.parse_qs(urlparse(word).query)
                                if "url" in q and q["url"]:
                                    parsed = urlparse(q["url"][0])
                                    if parsed.netloc:
                                        apps.add(parsed.netloc.lower())
            except Exception:
                pass
    return {"ok": True, "installedApps": list(apps)}


def main():
    payload = read_message()
    action = payload.get("action")
    if action == "install":
        send_message(install(payload))
    elif action == "checkInstalled":
        send_message(check_installed(payload))
    elif action == "listInstalled":
        send_message(list_installed())
    else:
        send_message({"ok": False, "error": "unsupported action"})


if __name__ == "__main__":
    main()
