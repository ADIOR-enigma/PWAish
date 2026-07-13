(() => {
  window.addEventListener(
    "keydown",
    (event) => {
      if (
        event.ctrlKey &&
        event.shiftKey &&
        event.altKey &&
        (event.key === "w" || event.key === "W" || event.code === "KeyW")
      ) {
        event.preventDefault();
        event.stopPropagation();
        try {
          chrome.runtime.sendMessage({ action: "togglePopup" });
        } catch (error) {}
      }
    },
    true
  );
})();
