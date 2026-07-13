const parseInteger = (value) => {
  let parsed = parseInt(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

window.addEventListener("DOMContentLoaded", () => {
  let params = new URLSearchParams(window.location.search);
  let targetUrl = params.get("url");
  if (!targetUrl) {
    window.close();
    return;
  }

  chrome.runtime.sendMessage(
    {
      action: "launchInstalledApp",
      url: targetUrl,
      width: parseInteger(params.get("width")),
      height: parseInteger(params.get("height")),
    },
    () => {
      window.close();
    },
  );
});
