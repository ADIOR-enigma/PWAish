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


def resolve_zen_browser(exe_path=""):
    if shutil.which("zen"):
        return "zen"
    if shutil.which("zen-browser"):
        return "zen-browser"
    if exe_path:
        if exe_path.endswith("-bin"):
            launcher = exe_path[:-4]
            if os.path.isfile(launcher) and os.access(launcher, os.X_OK):
                return launcher
        if os.path.isfile(exe_path) and os.access(exe_path, os.X_OK):
            return exe_path
    return "zen"


def detect_calling_browser():
    pid = os.getppid()
    seen_pids = set()
    while pid > 1 and pid not in seen_pids:
        seen_pids.add(pid)
        try:
            exe_path_raw = ""
            try:
                exe_path_raw = os.readlink(f"/proc/{pid}/exe")
            except Exception:
                pass

            exe_path_lower = exe_path_raw.lower()

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

            text_to_search = f"{exe_path_lower} {cmdline}"
            if "zen" in text_to_search and (
                "zen-browser" in text_to_search
                or "/zen" in text_to_search
                or "zen-bin" in text_to_search
            ):
                return resolve_zen_browser(exe_path_raw)
            if "floorp" in text_to_search:
                return "floorp"
            if "librewolf" in text_to_search:
                return "librewolf"
            # Check for non-standard Firefox installs (dev edition, nightly, etc.)
            # before falling back to the generic 'firefox' name, so we return
            # the real executable path rather than whatever `which firefox` finds.
            if "firefox" in text_to_search:
                # Prefer the named wrapper (e.g. firefox-developer-edition) over
                # the internal binary (/usr/lib/firefox-developer-edition/firefox)
                # so the .desktop Exec= line uses the correct entry point.
                for candidate in (
                    "firefox-developer-edition",
                    "firefox-nightly",
                    "firefox-esr",
                ):
                    if candidate in exe_path_lower or candidate in cmdline:
                        resolved = shutil.which(candidate)
                        if resolved:
                            return resolved
                if exe_path_raw and os.path.isfile(exe_path_raw) and os.access(exe_path_raw, os.X_OK):
                    return exe_path_raw
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

    for b in ("zen", "zen-browser", "firefox-developer-edition", "firefox-nightly", "firefox", "floorp", "librewolf"):
        if shutil.which(b):
            return b

    return "firefox"


def is_zen_browser(browser_exec):
    """Return True only when the resolved binary is a Zen Browser build.
    Zen has our autoconfig installed, which makes --app=<url> open a true
    standalone PWA window.  Other Firefox-family browsers do not."""
    name = os.path.basename(browser_exec).lower()
    path = browser_exec.lower()
    return "zen" in name or "/zen" in path or "zen-bin" in path


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

    is_zen = is_zen_browser(browser_exec)
    if is_zen:
        # Zen Browser has autoconfig installed, allowing `--app=<url>` standalone window
        browser_name = os.path.basename(browser_exec)
        command = f"{browser_name} --app={json.dumps(start_url)}"
    else:
        # Rest of Gecko family uses original extension launcher pattern (`launcherUrl`)
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
    return {"ok": True, "desktopEntry": str(desktop_path), "isZen": is_zen}


def check_installed(payload):
    url = payload.get("url") or payload.get("startUrl") or ""
    parsed = urlparse(url)
    netloc_slug = safe_name(parsed.netloc)
    browser_cmd = get_browser()
    browser_exec = shutil.which(browser_cmd) or browser_cmd
    is_zen = is_zen_browser(browser_exec)
    if not netloc_slug or not APP_DIR.exists():
        return {"ok": True, "installed": False, "isZen": is_zen}
    prefix = f"popupwindow-{netloc_slug}-"
    for entry in APP_DIR.glob(f"{prefix}*.desktop"):
        return {"ok": True, "installed": True, "desktopEntry": str(entry), "isZen": is_zen}
    return {"ok": True, "installed": False, "isZen": is_zen}


def list_installed():
    apps = set()
    if APP_DIR.exists():
        for entry in APP_DIR.glob("popupwindow-*.desktop"):
            try:
                content = entry.read_text(encoding="utf-8", errors="ignore")
                for line in content.splitlines():
                    if line.startswith("Exec="):
                        for word in line.split():
                            word_clean = word.strip('"\'')
                            if word_clean.startswith("--app="):
                                app_url = word_clean[6:].strip('"\'')
                                if app_url.startswith(("http://", "https://")):
                                    parsed = urlparse(app_url)
                                    if parsed.netloc:
                                        apps.add(parsed.netloc.lower())
                            elif word_clean.startswith(("http://", "https://")):
                                parsed = urlparse(word_clean)
                                if parsed.netloc:
                                    apps.add(parsed.netloc.lower())
                            elif "url=" in word_clean:
                                import urllib.parse

                                q = urllib.parse.parse_qs(urlparse(word_clean).query)
                                if "url" in q and q["url"]:
                                    parsed = urlparse(q["url"][0])
                                    if parsed.netloc:
                                        apps.add(parsed.netloc.lower())
            except Exception:
                pass
    browser_cmd = get_browser()
    browser_exec = shutil.which(browser_cmd) or browser_cmd
    return {
        "ok": True,
        "installedApps": list(apps),
        "isZen": is_zen_browser(browser_exec),
    }


def launch(payload):
    url = payload.get("url") or payload.get("startUrl")
    if not url:
        return {"ok": False, "error": "no url provided"}
    browser_cmd = get_browser()
    browser_exec = shutil.which(browser_cmd) or browser_cmd
    if is_zen_browser(browser_exec):
        subprocess.Popen(
            [browser_exec, f"--app={url}"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            close_fds=True,
        )
    else:
        launcher_url = payload.get("launcherUrl") or url
        subprocess.Popen(
            [browser_exec, launcher_url],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            close_fds=True,
        )
    return {"ok": True}


def main():
    payload = read_message()
    action = payload.get("action")
    if action == "install":
        send_message(install(payload))
    elif action == "launch":
        send_message(launch(payload))
    elif action == "checkInstalled":
        send_message(check_installed(payload))
    elif action == "listInstalled":
        send_message(list_installed())
    else:
        send_message({"ok": False, "error": "unsupported action"})


if __name__ == "__main__":
    main()
