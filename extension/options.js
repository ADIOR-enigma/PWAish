let currentPrefs = {};

const saveToPreference = (id, value) => {
  chrome.storage.local.set({ [id]: value });
};

const handleValueChange = (id) => {
  let elem = document.getElementById(id);
  if (!elem) return;
  let type = elem.getAttribute("type");
  if (type === "checkbox") {
    elem.addEventListener("input", () => saveToPreference(id, elem.checked));
  } else if (type === "option" || type === "number") {
    elem.addEventListener("input", () => saveToPreference(id, parseInt(elem.value)));
  } else if (type === "text") {
    elem.addEventListener("input", () => saveToPreference(id, elem.value.trim()));
  } else if (type === "radioGroup") {
    elem.querySelectorAll(`input[name="${id}"]`).forEach((radio) => {
      radio.addEventListener("input", () => {
        if (radio.checked) saveToPreference(id, parseInt(radio.value));
      });
    });
  }
};

const setValueToElem = (id, value) => {
  let elem = document.getElementById(id);
  if (!elem) return;
  let type = elem.getAttribute("type");
  if (type === "checkbox") {
    elem.checked = value;
  } else if (type === "option" || type === "number" || type === "text") {
    elem.value = value;
  } else if (type === "radioGroup") {
    elem.querySelectorAll(`input[name="${id}"]`).forEach((radio) => {
      if (parseInt(radio.value) === value) radio.checked = true;
    });
  }
};

const onDefaultPositionChange = () => {
  let isCustom = document.getElementById("defaultPosition")?.value === "5";
  document.querySelectorAll(".windowPosition").forEach((el) => {
    el.classList.toggle("show", isCustom);
    el.classList.toggle("hidden", !isCustom);
  });
};

const init = (preferences) => {
  currentPrefs = preferences;
  for (let p in preferences) {
    setValueToElem(p, preferences[p]);
    handleValueChange(p);
  }
  let defaultPos = document.getElementById("defaultPosition");
  if (defaultPos) {
    defaultPos.addEventListener("change", onDefaultPositionChange);
  }
  onDefaultPositionChange();
};

window.addEventListener("load", () => {
  chrome.storage.local.get((results) => {
    let prefs = Array.isArray(results) && results.length > 0 ? results[0] : results;
    if (prefs && prefs.version) init(prefs);
  });
});
