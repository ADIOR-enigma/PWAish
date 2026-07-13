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


def save_app_icon(icon_url, base_name, fallback_icon="firefox"):
    if not icon_url or not isinstance(icon_url, str):
        return fallback_icon
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

    return fallback_icon


def detect_calling_browser():
    pid = os.getppid()
    seen_pids = set()
    while pid > 1 and pid not in seen_pids:
        seen_pids.add(pid)
        try:
            exe_path = ""
            try:
                exe_path = os.readlink(f"/proc/{pid}/exe").lower()
            except Exception:
                pass

            cmdline = ""
            try:
                cmdline = (
                    Path(f"/proc/{pid}/cmdline")
                    .read_text(errors="ignore")
                    .replace("\x00", " ")
                    .lower()
                )
            except Exception:
                pass

            text_to_search = f"{exe_path} {cmdline}"
            if "zen" in text_to_search and (
                "zen-browser" in text_to_search
                or "/zen" in text_to_search
                or "zen-bin" in text_to_search
            ):
                return "zen-browser"
            if "floorp" in text_to_search:
                return "floorp"
            if "librewolf" in text_to_search:
                return "librewolf"
            if "firefox" in text_to_search:
                return "firefox"

            stat_content = Path(f"/proc/{pid}/stat").read_text(errors="ignore")
            rparen = stat_content.rfind(")")
            if rparen != -1:
                parts = stat_content[rparen + 2 :].split()
                pid = int(parts[1])
            else:
                break
        except Exception:
            break
    return None


def get_browser():
    env_browser = (
        os.environ.get("PWAISH_BROWSER") or os.environ.get("POPUPWINDOW_BROWSER")
    )
    if env_browser and env_browser.strip():
        return env_browser.strip()

    caller = detect_calling_browser()
    if caller:
        return caller

    for cfg_path in (
        Path.home() / ".config" / "webappinst" / "browser",
        Path("/etc/webappinst/browser"),
    ):
        if cfg_path.exists():
            try:
                cfg = cfg_path.read_text(encoding="utf-8").strip()
                if cfg:
                    return cfg
            except Exception:
                pass

    for b in ("firefox", "zen-browser", "floorp", "librewolf"):
        if shutil.which(b):
            return b

    return "firefox"


def install(payload):
    APP_DIR.mkdir(parents=True, exist_ok=True)
    title = payload.get("title") or payload.get("startUrl") or "Web App"
    start_url = payload.get("startUrl") or payload.get("url")
    parsed = urlparse(start_url)
    desktop_stem = f"popupwindow-{safe_name(parsed.netloc)}-{safe_name(title)}"
    desktop_id = f"{desktop_stem}.desktop"
    desktop_path = APP_DIR / desktop_id
    browser_cmd = get_browser()
    browser_exec = shutil.which(browser_cmd) or browser_cmd
    fallback_icon = os.path.basename(browser_cmd)
    raw_icon = payload.get("iconUrl") or fallback_icon
    icon = save_app_icon(raw_icon, desktop_stem, fallback_icon=fallback_icon)
    launcher_url = payload.get("launcherUrl") or start_url
    command = f"{json.dumps(browser_exec)} {json.dumps(launcher_url)}"
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
