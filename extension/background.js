const NATIVE_HOST_NAME = "popupwindow_desktop";
const DEFAULT_WINDOW_WIDTH = 1024;
const DEFAULT_WINDOW_HEIGHT = 768;

let installedApps = new Set();
let winMapping = new Map();
let popupMapping = new Map();
let pendingAppLaunches = [];
let appWindowToSourceTab = new Map();
let currentBrowserIsZen = false;
let launchedTabs = new Set();

const isInstallableUrl = (url) => /^https?:\/\//i.test(url || "");

const getAppInstallKey = (url) => {
  try {
    let u = new URL(url || "");
    return u.hostname ? u.hostname.toLowerCase() : null;
  } catch (error) {
    return null;
  }
};

const isAppInstalled = (url) => {
  let key = getAppInstallKey(url);
  return key ? installedApps.has(key) : false;
};

const markAppInstalled = (url) => {
  let key = getAppInstallKey(url);
  if (key) {
    installedApps.add(key);
    chrome.storage.local.set({
      installedApps: Array.from(installedApps),
    });
  }
};

const syncInstalledAppsWithNative = () => {
  chrome.runtime.sendNativeMessage(
    NATIVE_HOST_NAME,
    { action: "listInstalled" },
    (response) => {
      if (
        !chrome.runtime.lastError &&
        response &&
        Array.isArray(response.installedApps)
      ) {
        if (typeof response.isZen === "boolean") {
          currentBrowserIsZen = response.isZen;
        }
        installedApps = new Set(response.installedApps);
        chrome.storage.local.set(
          {
            installedApps: Array.from(installedApps),
          },
          () => {
            updateAllPageActions();
          },
        );
      }
    },
  );
};

const loadInstalledApps = () => {
  chrome.storage.local.get((results) => {
    if (typeof results.length === "number" && results.length > 0) {
      results = results[0];
    }
    if (results && Array.isArray(results.installedApps)) {
      installedApps = new Set(results.installedApps);
    }
    syncInstalledAppsWithNative();
  });
};

if (chrome.runtime && chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(syncInstalledAppsWithNative);
}

const isDarkMode = () => {
  return (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
};

if (typeof window !== "undefined" && window.matchMedia) {
  let mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const onThemeChange = () => {
    updateAllPageActions();
  };
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener("change", onThemeChange);
  } else if (mediaQuery.addListener) {
    mediaQuery.addListener(onThemeChange);
  }
}

if (
  typeof browser !== "undefined" &&
  browser.theme &&
  browser.theme.onUpdated
) {
  browser.theme.onUpdated.addListener(() => updateAllPageActions());
} else if (
  typeof chrome !== "undefined" &&
  chrome.theme &&
  chrome.theme.onUpdated
) {
  chrome.theme.onUpdated.addListener(() => updateAllPageActions());
}

const setPageActionIcon = (tabId, installed = false) => {
  let dark = isDarkMode();
  let iconFile = installed
    ? dark ? "icon/popup_w.svg" : "icon/popup.svg"
    : dark ? "icon/icon_w.svg" : "icon/icon.svg";
  let details = {
    path: {
      16: iconFile,
      32: iconFile,
      48: iconFile,
      64: iconFile,
    },
  };
  if (tabId !== undefined) {
    details.tabId = tabId;
  }
  chrome.pageAction.setIcon(details, () => {
    if (chrome.runtime.lastError) {
      // Ignore errors when tab is closed
    }
  });
};

const setPageActionTitle = (tabId, installed = false) => {
  chrome.pageAction.setTitle({
    tabId: tabId,
    title: installed ? "Launch as standalone app" : "Install as app",
  });
};

const updatePageAction = (tab) => {
  if (!tab || tab.id === undefined) return;
  if (!isInstallableUrl(tab.url) || tab.status === "loading") {
    chrome.pageAction.hide(tab.id);
    return;
  }
  let installed = isAppInstalled(tab.url);
  setPageActionIcon(tab.id, installed);
  setPageActionTitle(tab.id, installed);
  chrome.pageAction.show(tab.id);
};

const updateAllPageActions = () => {
  chrome.tabs.query({}, (tabs) => tabs.forEach(updatePageAction));
};

const absoluteUrl = (url, baseUrl) => {
  try {
    return new URL(url, baseUrl).href;
  } catch (error) {
    return null;
  }
};

const pickBestIcon = (icons, baseUrl) => {
  if (!Array.isArray(icons)) return null;
  let parsedIcons = icons
    .map((icon) => {
      let sizes = (icon.sizes || "").split(/\s+/).map((size) => {
        if (size && size.toLowerCase() === "any") return 512 * 512;
        let match = size.match(/^(\d+)x(\d+)$/i);
        return match ? parseInt(match[1]) * parseInt(match[2]) : 1;
      });
      return {
        src: absoluteUrl(icon.src, baseUrl),
        score: Math.max(1, ...sizes),
      };
    })
    .filter((icon) => icon.src);
  parsedIcons.sort((a, b) => b.score - a.score);
  return parsedIcons.length ? parsedIcons[0].src : null;
};

const getPageMetadata = (tabId) =>
  new Promise((resolve) => {
    chrome.tabs.executeScript(
      tabId,
      {
        code: `(() => {
      if (document.documentURI && document.documentURI.startsWith("about:")) {
        return {};
      }
      const links = Array.from(
        document.querySelectorAll(
          'link[rel*="icon"], link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]'
        )
      );
      let bestIcon = null;
      let bestScore = -1;
      for (const link of links) {
        const href = link.href || link.getAttribute("href");
        if (!href) continue;
        let score = 10;
        const rel = (link.getAttribute("rel") || "").toLowerCase();
        if (rel.includes("apple-touch-icon")) score += 5000;
        const sizes = link.getAttribute("sizes");
        if (sizes && sizes.toLowerCase() === "any") {
          score += 10000;
        } else if (sizes) {
          const match = sizes.match(/^(\\d+)x(\\d+)/i);
          if (match) {
            score += parseInt(match[1]) * parseInt(match[2]);
          }
        }
        if (score > bestScore) {
          bestScore = score;
          bestIcon = link.href;
        }
      }
      const manifestLink = document.querySelector(
        'link[rel~="manifest"], link[rel="manifest"]'
      );
      return {
        title: document.title,
        manifestUrl: manifestLink
          ? manifestLink.href || manifestLink.getAttribute("href")
          : null,
        iconUrl: bestIcon,
      };
    })();`,
      },
      (results) => {
        if (chrome.runtime.lastError || !results || !results[0]) {
          resolve({});
          return;
        }
        resolve(results[0]);
      },
    );
  });

const fetchManifest = (manifestUrl) =>
  new Promise((resolve) => {
    if (!manifestUrl) {
      resolve(null);
      return;
    }
    fetch(manifestUrl, { credentials: "omit" })
      .then((response) => (response.ok ? response.json() : null))
      .then(resolve)
      .catch(() => resolve(null));
  });

const buildLauncherUrl = (targetUrl, width, height) => {
  let launcherUrl = new URL(chrome.runtime.getURL("launcher.html"));
  launcherUrl.searchParams.set("url", targetUrl);
  if (width) {
    launcherUrl.searchParams.set("width", width);
  }
  if (height) {
    launcherUrl.searchParams.set("height", height);
  }
  return launcherUrl.href;
};

const buildInstallPayload = async (tab) => {
  let pageMetadata = await getPageMetadata(tab.id);
  let startUrl = tab.url;
  let manifestUrl = absoluteUrl(pageMetadata.manifestUrl, tab.url);
  let manifest = await fetchManifest(manifestUrl);
  if (manifest && manifest.start_url) {
    startUrl =
      absoluteUrl(manifest.start_url, manifestUrl || tab.url) || tab.url;
  }

  return {
    action: "install",
    browser: "zen-browser",
    extensionId: chrome.runtime.id,
    url: tab.url,
    startUrl: startUrl,
    scope:
      manifest && manifest.scope
        ? absoluteUrl(manifest.scope, manifestUrl || tab.url)
        : null,
    title:
      (manifest && (manifest.name || manifest.short_name)) ||
      pageMetadata.title ||
      tab.title ||
      tab.url,
    shortName: manifest && manifest.short_name ? manifest.short_name : null,
    description: manifest && manifest.description ? manifest.description : null,
    iconUrl:
      pickBestIcon(manifest && manifest.icons, manifestUrl || tab.url) ||
      absoluteUrl(pageMetadata.iconUrl, tab.url) ||
      tab.favIconUrl ||
      absoluteUrl("/favicon.ico", tab.url),
    manifestUrl: manifestUrl,
    launcherUrl: buildLauncherUrl(
      startUrl,
      DEFAULT_WINDOW_WIDTH,
      DEFAULT_WINDOW_HEIGHT,
    ),
    window: {
      width: DEFAULT_WINDOW_WIDTH,
      height: DEFAULT_WINDOW_HEIGHT,
    },
  };
};

const sendNativeInstall = (payload) =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(
      NATIVE_HOST_NAME,
      payload,
      (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        if (response && typeof response.isZen === "boolean") {
          currentBrowserIsZen = response.isZen;
        }
        resolve(response);
      },
    );
  });

// Launch an installed app natively via zen --app=<url> (handled by autoconfig)
const launchAppNative = (url, sourceTab) => {
  if (sourceTab && sourceTab.id) {
    let now = Date.now();
    pendingAppLaunches.push({
      tabId: sourceTab.id,
      windowId: sourceTab.windowId,
      url: url,
      timestamp: now,
    });
    pendingAppLaunches = pendingAppLaunches.filter((p) => now - p.timestamp < 30000);
  }
  let launcherUrl = buildLauncherUrl(url, DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT);
  chrome.runtime.sendNativeMessage(
    NATIVE_HOST_NAME,
    { action: "launch", url, launcherUrl },
    () => {
      if (chrome.runtime.lastError) {
        console.error("[PWAish] Native launch error:", chrome.runtime.lastError);
      }
    },
  );
};

const installCurrentSite = async (tab) => {
  if (!tab || !isInstallableUrl(tab.url) || tab.status !== "complete") return;
  try {
    let payload = await buildInstallPayload(tab);
    await sendNativeInstall(payload);
    markAppInstalled(tab.url);
    updatePageAction(tab);
  } catch (error) {
    console.error("Unable to install web app desktop entry:", error);
  }
};

const cleanupEmptyWindow = (windowId, excludeTabId) => {
  if (windowId === undefined || windowId === null) return;
  chrome.tabs.query({ windowId: windowId }, (tabs) => {
    if (chrome.runtime.lastError || !tabs) return;
    let remainingTabs = excludeTabId
      ? tabs.filter((t) => t.id !== excludeTabId)
      : tabs;
    if (
      remainingTabs.length === 0 ||
      (remainingTabs.length === 1 &&
        (remainingTabs[0].url === "about:blank" ||
          remainingTabs[0].url === "about:newtab" ||
          remainingTabs[0].url === "about:home" ||
          remainingTabs[0].url.includes("launcher.html")))
    ) {
      let closeWindow = () => {
        chrome.windows.remove(windowId, () => {
          if (chrome.runtime.lastError) {}
        });
      };
      if (remainingTabs.length === 1 && remainingTabs[0].id) {
        chrome.tabs.remove(remainingTabs[0].id, () => {
          if (chrome.runtime.lastError) {}
          closeWindow();
        });
      } else {
        closeWindow();
      }
    }
  });
};

const popupWindow = (
  tab,
  targetUrl,
  winLeft,
  winTop,
  winWidth,
  winHeight,
  callback,
) => {
  let screen = window.screen;
  let width = winWidth ?? DEFAULT_WINDOW_WIDTH;
  let height = winHeight ?? DEFAULT_WINDOW_HEIGHT;

  let top = screen.availTop !== undefined ? screen.availTop : screen.top;
  let left = screen.availLeft !== undefined ? screen.availLeft : screen.left;
  let sTop = top;
  let sLeft = left;
  let sWidth =
    screen.availWidth !== undefined ? screen.availWidth : screen.width;
  let sHeight =
    screen.availHeight !== undefined ? screen.availHeight : screen.height;

  top = sTop + Math.round((sHeight - height) / 2);
  left = sLeft + Math.round((sWidth - width) / 2);

  if (winTop !== undefined) {
    top = winTop;
  }
  if (winLeft !== undefined) {
    left = winLeft;
  }

  let setting = {
    type: "popup",
    top: top,
    left: left,
    width: width,
    height: height,
  };
  if (targetUrl) {
    setting.url = targetUrl;
  } else {
    setting.tabId = tab.id;
  }
  chrome.windows.create(setting, (windowInfo) => {
    chrome.windows.update(windowInfo.id, {
      focused: true,
      top: top,
      left: left,
    });
    addToPopupMapping(windowInfo, tab.windowId);
    if (!targetUrl && tab && tab.windowId && tab.windowId !== windowInfo.id) {
      cleanupEmptyWindow(tab.windowId, tab.id);
    }
    if (typeof callback === "function") {
      callback(windowInfo);
    }
  });
};

const moveTab = (tabId, windowId, sourceWindowId) => {
  chrome.tabs.move(tabId, { windowId: windowId, index: -1 }, () => {
    if (sourceWindowId && sourceWindowId !== windowId) {
      cleanupEmptyWindow(sourceWindowId);
    }
  });
  chrome.windows.update(windowId, { focused: true });
  chrome.tabs.update(tabId, { active: true });
};

const mergeWindow = (tab, windowId) => {
  let window = windowId ? winMapping.get(windowId) : null;
  if (!window) {
    for (let w of winMapping.values()) {
      if (!window || w.lastFocus > window.lastFocus) {
        window = w;
      }
    }
  }

  if (window) {
    moveTab(tab.id, window.id, tab.windowId);
  } else {
    chrome.windows.getAll({ windowTypes: ["normal"] }, (winsInfo) => {
      let normalWindows = [];
      for (let win of winsInfo) {
        //Firefox bug, 'windowTypes' filter not working.
        if (win.type === "normal") normalWindows.push(win);
      }
      if (normalWindows.length === 0) {
        chrome.windows.create(
          {
            tabId: tab.id,
            type: "normal",
          },
          (newWin) => {
            if (chrome.runtime.lastError || !newWin) {
              chrome.windows.create(
                {
                  url: tab.url,
                  type: "normal",
                },
                () => {
                  chrome.tabs.remove(tab.id, () => {
                    if (chrome.runtime.lastError) {}
                    cleanupEmptyWindow(tab.windowId);
                  });
                },
              );
            } else {
              cleanupEmptyWindow(tab.windowId, tab.id);
            }
          },
        );
      } else {
        moveTab(tab.id, normalWindows[0].id, tab.windowId);
      }
    });
  }
};

const checkAndLinkAppWindow = (tab) => {
  if (!tab || !tab.windowId || !tab.url || !isInstallableUrl(tab.url)) return;
  if (pendingAppLaunches.length === 0) return;

  let matchIndex = pendingAppLaunches.findIndex((p) => {
    if (p.windowId === tab.windowId) return false;
    let pKey = getAppInstallKey(p.url);
    let tKey = getAppInstallKey(tab.url);
    return p.url === tab.url || (pKey && pKey === tKey);
  });

  if (matchIndex !== -1) {
    let match = pendingAppLaunches[matchIndex];
    pendingAppLaunches.splice(matchIndex, 1);
    appWindowToSourceTab.set(tab.windowId, {
      tabId: match.tabId,
      windowId: match.windowId,
    });
  }
};

// Page action: install if not installed, native-launch via zen --app= if already installed
chrome.pageAction.onClicked.addListener((tab) => {
  if (!tab || tab.status !== "complete" || !isInstallableUrl(tab.url)) return;
  if (isAppInstalled(tab.url)) {
    if (currentBrowserIsZen) {
      launchAppNative(tab.url, tab);
    } else {
      popupWindow(tab);
    }
  } else {
    installCurrentSite(tab);
  }
});

const checkAndLaunchLocalhost = (tabId, urlStr) => {
  if (!urlStr || launchedTabs.has(tabId)) return;
  try {
    let u = new URL(urlStr);
    if (u.hostname === "popupwindow.localhost") {
      let targetUrl = u.searchParams.get("url");
      if (targetUrl) {
        launchedTabs.add(tabId);
        let width = parseInt(u.searchParams.get("width"));
        let height = parseInt(u.searchParams.get("height"));
        chrome.tabs.get(tabId, (tab) => {
          if (chrome.runtime.lastError || !tab) return;
          popupWindow(
            tab,
            targetUrl,
            undefined,
            undefined,
            Number.isFinite(width) ? width : undefined,
            Number.isFinite(height) ? height : undefined,
            () => {
              chrome.tabs.remove(tabId);
            },
          );
        });
      }
    }
  } catch (e) {}
};

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading") {
    chrome.pageAction.hide(tabId);
  }
  if (changeInfo.status === "complete" || (tab && tab.status === "complete")) {
    updatePageAction(tab);
  }
  if (changeInfo.status === "loading" || changeInfo.url) {
    checkAndLaunchLocalhost(tabId, changeInfo.url || tab.url);
  }
  if (tab) {
    checkAndLinkAppWindow(tab);
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  if (tab) {
    checkAndLinkAppWindow(tab);
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) return;
    updatePageAction(tab);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  launchedTabs.delete(tabId);
  pendingAppLaunches = pendingAppLaunches.filter((p) => p.tabId !== tabId);
  for (let [winId, sourceInfo] of appWindowToSourceTab.entries()) {
    if (sourceInfo.tabId === tabId) {
      appWindowToSourceTab.delete(winId);
    }
  }
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (winMapping.get(windowId)) {
    winMapping.delete(windowId);
  } else if (popupMapping.get(windowId)) {
    popupMapping.delete(windowId);
  }

  let sourceInfo = appWindowToSourceTab.get(windowId);
  if (sourceInfo) {
    appWindowToSourceTab.delete(windowId);
    chrome.tabs.remove(sourceInfo.tabId, () => {
      if (chrome.runtime.lastError) {}
      cleanupEmptyWindow(sourceInfo.windowId, sourceInfo.tabId);
    });
  }
});

chrome.windows.onCreated.addListener((windowInfo) => {
  if (windowInfo.type === "normal") {
    addToWinMapping(windowInfo);
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  let window = winMapping.get(windowId);
  if (!window) return;
  window.lastFocus = performance.now();
});

chrome.windows.getAll({ windowTypes: ["normal", "popup"] }, (windowInfos) => {
  for (let windowInfo of windowInfos) {
    if (windowInfo.type === "normal") {
      addToWinMapping(windowInfo);
    } else {
      addToPopupMapping(windowInfo, null);
    }
  }
});

function addToWinMapping(window) {
  winMapping.set(window.id, {
    id: window.id,
    lastFocus: 0,
  });
}

function addToPopupMapping(window, originalWindowId) {
  popupMapping.set(window.id, {
    id: window.id,
    originalWindowId: originalWindowId,
  });
}

window.addEventListener("DOMContentLoaded", (event) => {
  loadInstalledApps();
});

// Keyboard shortcut: toggle current tab between popup and normal window
chrome.commands.onCommand.addListener((command) => {
  if (command === "popupWindow") {
    chrome.windows.getCurrent((windowInfo) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (typeof tabs !== "undefined" && tabs.length > 0) {
          let tab = tabs[0];
          if (windowInfo.type === "popup") {
            let popup = popupMapping.get(windowInfo.id);
            mergeWindow(tab, popup ? popup.originalWindowId : null);
          } else {
            popupWindow(tab);
          }
        }
      });
    });
  }
});

const messageHandler = (message, sender, sendResponse) => {
  if (message.action === "popupWindow") {
    chrome.tabs.get(message.tabId, (tab) => {
      if (message.left && message.top) {
        popupWindow(
          tab,
          null,
          message.left,
          message.top,
          message.width,
          message.height,
        );
      } else {
        popupWindow(tab);
      }
    });
  } else if (message.action === "launchInstalledApp") {
    let sourceTabId = sender.tab ? sender.tab.id : null;
    let sourceWindowId = sender.tab ? sender.tab.windowId : null;
    popupWindow(
      sender.tab || {},
      message.url,
      undefined,
      undefined,
      message.width,
      message.height,
      () => {
        if (sourceTabId && sourceWindowId) {
          chrome.tabs.query({ windowId: sourceWindowId }, (tabs) => {
            if (!chrome.runtime.lastError && tabs && tabs.length <= 1) {
              chrome.tabs.remove(sourceTabId, () => {
                if (chrome.runtime.lastError) {}
                chrome.windows.remove(sourceWindowId, () => {
                  if (chrome.runtime.lastError) {}
                  sendResponse({ result: "ok" });
                });
              });
            } else {
              chrome.tabs.remove(sourceTabId, () => {
                if (chrome.runtime.lastError) {}
                sendResponse({ result: "ok" });
              });
            }
          });
        } else {
          sendResponse({ result: "ok" });
        }
      },
    );
    return true;
  } else if (message.action === "installApp") {
    chrome.tabs.get(message.tabId, (tab) => {
      installCurrentSite(tab).then(() => sendResponse({ result: "ok" }));
    });
    return true;
  } else if (message.action === "togglePopup") {
    const toggleTabPopup = (tab) => {
      if (!tab) return;
      chrome.windows.get(tab.windowId, (windowInfo) => {
        if (chrome.runtime.lastError || !windowInfo) return;
        if (windowInfo.type === "popup") {
          let popup = popupMapping.get(windowInfo.id);
          mergeWindow(tab, popup ? popup.originalWindowId : null);
        } else {
          popupWindow(tab);
        }
      });
    };
    if (sender && sender.tab) {
      toggleTabPopup(sender.tab);
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0) toggleTabPopup(tabs[0]);
      });
    }
    sendResponse({ result: "ok" });
    return true;
  } else if (message.action === "ack") {
    sendResponse({ result: "ok" });
  }
};

chrome.runtime.onMessage.addListener(messageHandler);
chrome.runtime.onMessageExternal.addListener(messageHandler);
