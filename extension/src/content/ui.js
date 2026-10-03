var OP = globalThis.OP || (globalThis.OP = {});

var host = null;
var shadow = null;
var keepOnTop = null;
var blocked = false;
var previousOverflow = "";
var blockObserver = null;
var guardsBound = false;
var busy = false;
var view = {
  purposes: [],
  selectedId: null,
  note: "",
  commitError: "",
  addError: "",
  skipError: ""
};

function readName(raw) {
  if (typeof raw !== "string") {
    return { ok: false, error: OP.COPY.emptyName };
  }
  var name = raw.trim();
  if (!name) {
    return { ok: false, error: OP.COPY.emptyName };
  }
  if (name.length > OP.NAME_LIMIT) {
    return { ok: false, error: OP.COPY.nameTooLong };
  }
  return { ok: true, name: name };
}

function send(type, payload) {
  return new Promise(function (resolve) {
    chrome.runtime.sendMessage(Object.assign({ type: type }, payload || {}), function (response) {
      if (chrome.runtime.lastError || !response) {
        resolve({ ok: false, error: OP.COPY.saveFailed });
        return;
      }
      resolve(response);
    });
  });
}

function element(tag, className, text) {
  var node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text) {
    node.textContent = text;
  }
  return node;
}

function sortedPurposes(purposes) {
  return (Array.isArray(purposes) ? purposes : []).slice().sort(function (left, right) {
    return left.order - right.order;
  });
}

function exitFullscreen() {
  var active = document.fullscreenElement || document.webkitFullscreenElement;
  var exit = document.exitFullscreen || document.webkitExitFullscreen;
  if (!active || !exit) {
    return Promise.resolve();
  }
  return new Promise(function (resolve) {
    var settled = false;
    function finish() {
      if (settled) {
        return;
      }
      settled = true;
      document.removeEventListener("fullscreenchange", finish);
      document.removeEventListener("webkitfullscreenchange", finish);
      resolve();
    }
    document.addEventListener("fullscreenchange", finish);
    document.addEventListener("webkitfullscreenchange", finish);
    var pending;
    try {
      pending = exit.call(document);
    } catch (error) {
      finish();
      return;
    }
    if (pending && typeof pending.then === "function") {
      pending.then(finish, finish);
    }
    window.setTimeout(finish, 500);
  });
}

function applyBlock() {
  var body = document.body;
  if (!body || !blocked) {
    return;
  }
  if (!body.hasAttribute("data-op-blocked")) {
    body.setAttribute("data-op-overflow", body.style.overflow);
    body.setAttribute("data-op-blocked", "1");
  }
  body.style.overflow = "hidden";
  body.inert = true;
}

function blockPage() {
  if (!blocked) {
    blocked = true;
    previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
  }
  applyBlock();
  if (!blockObserver && document.documentElement) {
    blockObserver = new MutationObserver(function () {
      applyBlock();
    });
    blockObserver.observe(document.documentElement, { childList: true });
  }
}

function unblockPage() {
  if (!blocked) {
    return;
  }
  blocked = false;
  document.documentElement.style.overflow = previousOverflow;
  if (document.body && document.body.hasAttribute("data-op-blocked")) {
    document.body.style.overflow = document.body.getAttribute("data-op-overflow") || "";
    document.body.inert = false;
    document.body.removeAttribute("data-op-blocked");
    document.body.removeAttribute("data-op-overflow");
  }
  if (blockObserver) {
    blockObserver.disconnect();
    blockObserver = null;
  }
}

function bindGuards() {
  if (guardsBound) {
    return;
  }
  guardsBound = true;
  ["click", "mousedown", "mouseup", "pointerdown", "pointerup", "auxclick", "contextmenu", "keydown", "keyup", "keypress"].forEach(function (type) {
    window.addEventListener(type, function (event) {
      if (!blocked) {
        return;
      }
      var path = typeof event.composedPath === "function" ? event.composedPath() : [];
      if (host && path.indexOf(host) !== -1) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    }, true);
  });
}

function pinHost() {
  if (!host || !document.documentElement) {
    return;
  }
  if (!host.isConnected || document.documentElement.lastElementChild !== host) {
    document.documentElement.appendChild(host);
  }
}

function dialogStyle() {
  return [
    ":host {",
    "  --op-bg: #16171d;",
    "  --op-surface: #23242c;",
    "  --op-text: #f3f4f6;",
    "  --op-muted: #b6b8c3;",
    "  --op-line: #3a3b46;",
    "  --op-accent: #7c8cff;",
    "  color-scheme: dark;",
    "}",
    ".overlay {",
    "  position: fixed;",
    "  inset: 0;",
    "  z-index: 3;",
    "  display: flex;",
    "  align-items: center;",
    "  justify-content: center;",
    "  box-sizing: border-box;",
    "  padding: 24px;",
    "  background: rgba(0, 0, 0, 0.55);",
    "  pointer-events: auto;",
    "  color: var(--op-text);",
    "  font: 14px/1.5 system-ui, \"Noto Sans CJK SC\", \"Source Han Sans SC\", sans-serif;",
    "}",
    ".dialog {",
    "  box-sizing: border-box;",
    "  width: min(420px, 100%);",
    "  max-height: calc(100vh - 48px);",
    "  overflow: auto;",
    "  overscroll-behavior: contain;",
    "  padding: 20px;",
    "  background: var(--op-bg);",
    "  color: var(--op-text);",
    "  border: 1px solid var(--op-line);",
    "  border-radius: 12px;",
    "}",
    "h1 {",
    "  margin: 0 0 16px;",
    "  font-size: 18px;",
    "  font-weight: 650;",
    "}",
    "ul {",
    "  margin: 0;",
    "  padding: 0;",
    "  list-style: none;",
    "}",
    "li + li { margin-top: 8px; }",
    "button, input, textarea { font: inherit; }",
    "button {",
    "  border: 1px solid var(--op-line);",
    "  border-radius: 8px;",
    "  background: var(--op-surface);",
    "  color: var(--op-text);",
    "  cursor: pointer;",
    "}",
    "button:disabled { cursor: default; opacity: 0.6; }",
    ".choice {",
    "  display: block;",
    "  width: 100%;",
    "  padding: 8px 10px;",
    "  text-align: left;",
    "}",
    ".choice[aria-pressed='true'] {",
    "  border-color: var(--op-accent);",
    "  box-shadow: inset 0 0 0 1px var(--op-accent);",
    "}",
    ".note { margin-top: 8px; }",
    ".note-label {",
    "  display: block;",
    "  margin-bottom: 6px;",
    "  color: var(--op-muted);",
    "  font-size: 12px;",
    "}",
    "textarea, input {",
    "  box-sizing: border-box;",
    "  width: 100%;",
    "  padding: 8px 10px;",
    "  border: 1px solid var(--op-line);",
    "  border-radius: 8px;",
    "  background: var(--op-surface);",
    "  color: var(--op-text);",
    "}",
    "textarea {",
    "  display: block;",
    "  min-height: 64px;",
    "  resize: vertical;",
    "}",
    ".confirm, .add button, .skip {",
    "  margin-top: 8px;",
    "  padding: 8px 12px;",
    "  background: var(--op-accent);",
    "  border-color: var(--op-accent);",
    "  color: var(--op-bg);",
    "}",
    ".add {",
    "  margin-top: 16px;",
    "  padding-top: 16px;",
    "  border-top: 1px solid var(--op-line);",
    "}",
    ".add-label {",
    "  display: block;",
    "  margin-bottom: 8px;",
    "  color: var(--op-muted);",
    "  font-size: 12px;",
    "}",
    ".add-row { display: flex; gap: 8px; }",
    ".add-row input { flex: 1; min-width: 0; }",
    ".add-row button { flex-shrink: 0; margin-top: 0; }",
    ".skip {",
    "  display: block;",
    "  width: 100%;",
    "  margin-top: 16px;",
    "  background: transparent;",
    "  color: var(--op-text);",
    "  border-color: var(--op-line);",
    "}",
    ".error {",
    "  margin: 8px 0 0;",
    "  color: var(--op-accent);",
    "  font-size: 12px;",
    "}",
    ".dialog-head {",
    "  display: flex;",
    "  align-items: flex-start;",
    "  gap: 12px;",
    "  margin-bottom: 16px;",
    "}",
    ".dialog-head h1 { flex: 1; margin: 0; }",
    ".dismiss {",
    "  flex-shrink: 0;",
    "  padding: 4px 10px;",
    "  background: transparent;",
    "  color: var(--op-text);",
    "  border-color: var(--op-line);",
    "}",
    ".contrast {",
    "  margin: 0 0 16px;",
    "  padding-bottom: 12px;",
    "  border-bottom: 1px solid var(--op-line);",
    "}",
    ".contrast-title {",
    "  margin: 0 0 4px;",
    "  color: var(--op-muted);",
    "  font-size: 12px;",
    "}",
    ".contrast-name { margin: 0; }",
    ".contrast-note {",
    "  margin: 4px 0 0;",
    "  color: var(--op-muted);",
    "  white-space: pre-wrap;",
    "  overflow-wrap: anywhere;",
    "}",
    ".snooze {",
    "  position: fixed;",
    "  z-index: 1;",
    "  pointer-events: auto;",
    "  margin: 0;",
    "  padding: 6px 10px;",
    "  border: 0;",
    "  border-radius: 8px;",
    "  background: rgba(22, 23, 29, 0.72);",
    "  color: #f3f4f6;",
    "  cursor: pointer;",
    "  touch-action: none;",
    "}",
    ".snooze-panel {",
    "  position: fixed;",
    "  z-index: 2;",
    "  pointer-events: auto;",
    "  box-sizing: border-box;",
    "  width: 220px;",
    "  padding: 12px;",
    "  border: 1px solid var(--op-line);",
    "  border-radius: 12px;",
    "  background: var(--op-bg);",
    "  color: var(--op-text);",
    "}",
    ".snooze-panel button {",
    "  display: block;",
    "  width: 100%;",
    "  margin-top: 8px;",
    "  padding: 8px 12px;",
    "}",
    ".snooze-deadline {",
    "  margin: 0 0 8px;",
    "  color: var(--op-muted);",
    "  font-size: 12px;",
    "}"
  ].join("\n");
}

function showError(node, message) {
  if (!node) {
    return;
  }
  if (!message) {
    node.hidden = true;
    node.textContent = "";
    return;
  }
  node.hidden = false;
  node.textContent = message;
}

function renderList() {
  var list = shadow.querySelector(".purposes");
  var draft = view.note;
  var selected = view.selectedId;
  list.replaceChildren();
  sortedPurposes(view.purposes).forEach(function (purpose) {
    var item = element("li");
    var choice = element("button", "choice", purpose.name);
    choice.type = "button";
    choice.setAttribute("data-purpose-id", purpose.id);
    var pressed = purpose.id === selected;
    choice.setAttribute("aria-pressed", pressed ? "true" : "false");
    choice.addEventListener("click", function () {
      if (busy || view.selectedId === purpose.id) {
        return;
      }
      view.selectedId = purpose.id;
      view.note = "";
      view.commitError = "";
      renderList();
      var note = list.querySelector("textarea");
      if (note) {
        note.focus();
      }
    });
    item.appendChild(choice);
    if (pressed) {
      var noteBox = element("div", "note");
      var noteLabel = element("label", "note-label", "备注");
      var field = document.createElement("textarea");
      field.id = "op-purpose-note";
      noteLabel.htmlFor = field.id;
      field.value = draft;
      field.setAttribute("data-op-note", "1");
      field.addEventListener("input", function () {
        view.note = field.value;
        view.commitError = "";
        showError(item.querySelector(".error"), "");
      });
      var confirm = element("button", "confirm", OP.COPY.confirm);
      confirm.type = "button";
      confirm.setAttribute("data-op-action", "commit");
      confirm.addEventListener("click", function () {
        view.note = field.value;
        commitPurpose(purpose.id);
      });
      var error = element("p", "error");
      error.hidden = true;
      noteBox.appendChild(noteLabel);
      noteBox.appendChild(field);
      noteBox.appendChild(confirm);
      noteBox.appendChild(error);
      item.appendChild(noteBox);
      showError(error, view.commitError);
    }
    list.appendChild(item);
  });
}

function commitPurpose(purposeId) {
  if (busy) {
    return;
  }
  busy = true;
  send(OP.MESSAGE.purposeCommit, { purposeId: purposeId, note: view.note }).then(function (response) {
    busy = false;
    if (!response.ok) {
      view.commitError = response.error || OP.COPY.saveFailed;
      renderList();
      return;
    }
    closeInquiry();
  });
}

function ensureShell() {
  if (host && host.isConnected && shadow) {
    return;
  }
  host = hostShell("shell");
  shadow = host.attachShadow({ mode: "open" });
  var link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = chrome.runtime.getURL("src/shared/theme.css");
  var style = element("style");
  style.textContent = dialogStyle();
  shadow.appendChild(link);
  shadow.appendChild(style);
  document.documentElement.appendChild(host);
}

function mountHost() {
  ensureShell();
  closeSnoozePanel();
  var existing = shadow.querySelector(".overlay");
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
  }
  var overlay = element("div", "overlay");
  overlay.setAttribute("data-op-layer", "purpose");
  var dialog = element("div", "dialog");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  var title = element("h1", "", OP.COPY.purposeAskTitle);
  title.id = "op-purpose-title";
  dialog.setAttribute("aria-labelledby", title.id);
  dialog.appendChild(title);
  dialog.appendChild(element("ul", "purposes"));

  var form = element("form", "add");
  var label = element("label", "add-label", "添加目的");
  label.htmlFor = "op-purpose-add";
  var row = element("div", "add-row");
  var input = document.createElement("input");
  input.id = "op-purpose-add";
  input.className = "add-name";
  input.type = "text";
  input.autocomplete = "off";
  var add = element("button", "", "添加");
  add.type = "submit";
  add.setAttribute("data-op-action", "add");
  row.appendChild(input);
  row.appendChild(add);
  var addError = element("p", "error");
  addError.hidden = true;
  addError.setAttribute("data-op-error", "add");
  form.appendChild(label);
  form.appendChild(row);
  form.appendChild(addError);
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    addPurpose();
  });
  input.addEventListener("input", function () {
    view.addError = "";
    showError(addError, "");
  });
  dialog.appendChild(form);

  var skip = element("button", "skip", OP.COPY.skip);
  skip.type = "button";
  skip.setAttribute("data-op-action", "skip");
  skip.addEventListener("click", skipPurpose);
  var skipError = element("p", "error");
  skipError.hidden = true;
  skipError.setAttribute("data-op-error", "skip");
  dialog.appendChild(skip);
  dialog.appendChild(skipError);
  overlay.appendChild(dialog);
  shadow.appendChild(overlay);

  ["mousedown", "mouseup", "click", "pointerdown", "pointerup", "auxclick", "contextmenu"].forEach(function (type) {
    overlay.addEventListener(type, function (event) {
      event.stopPropagation();
    });
  });
  overlay.addEventListener("wheel", function (event) {
    event.stopPropagation();
    if (event.target === overlay) {
      event.preventDefault();
    }
  }, { passive: false });
  overlay.addEventListener("keydown", function (event) {
    event.stopPropagation();
    if (event.key !== "Tab") {
      return;
    }
    var nodes = overlay.querySelectorAll("button, input, textarea");
    var usable = Array.prototype.filter.call(nodes, function (node) {
      return !node.disabled;
    });
    if (!usable.length) {
      return;
    }
    var first = usable[0];
    var last = usable[usable.length - 1];
    var current = shadow.activeElement;
    if (event.shiftKey && current === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && current === last) {
      event.preventDefault();
      first.focus();
    }
  });

  keepOnTop = new MutationObserver(pinHost);
  keepOnTop.observe(document.documentElement, { childList: true });
  bindGuards();
  pinHost();
  blockPage();
}

function addPurpose() {
  if (busy || !shadow) {
    return;
  }
  var input = shadow.querySelector(".add-name");
  var check = readName(input ? input.value : "");
  var error = shadow.querySelector("[data-op-error='add']");
  if (!check.ok) {
    view.addError = check.error;
    showError(error, check.error);
    return;
  }
  busy = true;
  send(OP.MESSAGE.purposeAdd, { name: check.name }).then(function (response) {
    busy = false;
    if (!response.ok) {
      view.addError = response.error || OP.COPY.saveFailed;
      showError(error, view.addError);
      return;
    }
    view.addError = "";
    showError(error, "");
    if (input) {
      input.value = "";
    }
    view.purposes = response.purposes || [];
    renderList();
    var buttons = shadow.querySelectorAll("[data-purpose-id]");
    var index;
    for (index = 0; index < buttons.length; index += 1) {
      if (buttons[index].getAttribute("data-purpose-id") === response.purposeId) {
        buttons[index].scrollIntoView({ block: "nearest" });
        break;
      }
    }
  });
}

function skipPurpose() {
  if (busy) {
    return;
  }
  busy = true;
  send(OP.MESSAGE.purposeSkip).then(function (response) {
    busy = false;
    if (!response.ok) {
      view.skipError = response.error || OP.COPY.saveFailed;
      showError(shadow && shadow.querySelector("[data-op-error='skip']"), view.skipError);
      return;
    }
    closeInquiry();
  });
}

function closeInquiry() {
  if (keepOnTop) {
    keepOnTop.disconnect();
    keepOnTop = null;
  }
  unblockPage();
  if (shadow) {
    var overlay = shadow.querySelector(".overlay");
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }
  busy = false;
  view.selectedId = null;
  view.note = "";
  view.commitError = "";
  view.addError = "";
  view.skipError = "";
  var notify = OP.onPurposeInquiryClosed;
  OP.onPurposeInquiryClosed = null;
  if (typeof notify === "function") {
    notify();
  }
}

function focusFirst() {
  if (!shadow) {
    return;
  }
  var choice = shadow.querySelector(".choice");
  if (choice) {
    choice.focus();
    return;
  }
  var input = shadow.querySelector(".add-name");
  if (input) {
    input.focus();
  }
}

OP.showPurposeInquiry = function (purposes) {
  view.purposes = sortedPurposes(purposes);
  return exitFullscreen().then(function () {
    if (!shadow || !shadow.querySelector("#op-purpose-title")) {
      mountHost();
      renderList();
      focusFirst();
      return;
    }
    pinHost();
    blockPage();
    renderList();
  });
};

OP.refreshPurposeInquiry = function (purposes) {
  if (!shadow || !shadow.querySelector("#op-purpose-title")) {
    return;
  }
  var available = sortedPurposes(purposes);
  view.purposes = available;
  if (view.selectedId && !available.some(function (item) { return item.id === view.selectedId; })) {
    view.selectedId = null;
    view.note = "";
    view.commitError = "";
  }
  pinHost();
  renderList();
  showError(shadow.querySelector("[data-op-error='add']"), view.addError);
};

OP.isPurposeInquiryOpen = function () {
  return Boolean(shadow && shadow.querySelector("#op-purpose-title"));
};

var interruptView = {
  options: [],
  selectedId: null,
  note: "",
  error: "",
  contrast: null
};
var resumePlayback = null;
var redisplayTimer = null;
var interruptMounting = false;

function sortedOptions(options) {
  return (Array.isArray(options) ? options : []).slice().sort(function (left, right) {
    return left.order - right.order;
  });
}

function hostShell(kind) {
  var node = document.createElement("div");
  node.setAttribute("data-op-host", kind);
  node.style.setProperty("position", "fixed", "important");
  node.style.setProperty("inset", "0", "important");
  node.style.setProperty("z-index", OP.HOST_Z_INDEX, "important");
  node.style.setProperty("pointer-events", "none", "important");
  node.style.setProperty("margin", "0", "important");
  node.style.setProperty("background", "transparent", "important");
  node.style.setProperty("display", "block", "important");
  return node;
}

function watchHost() {
  if (keepOnTop) {
    keepOnTop.disconnect();
  }
  keepOnTop = new MutationObserver(pinHost);
  keepOnTop.observe(document.documentElement, { childList: true });
  bindGuards();
  pinHost();
  blockPage();
}

function pauseForInterrupt() {
  resumePlayback = null;
  var site = OP.findSite(location.href);
  if (site && typeof site.pausePlayback === "function") {
    resumePlayback = site.pausePlayback(document);
  }
}

function closeInterrupt() {
  if (keepOnTop) {
    keepOnTop.disconnect();
    keepOnTop = null;
  }
  unblockPage();
  if (shadow) {
    var overlay = shadow.querySelector(".overlay");
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }
  busy = false;
}

function renderInterrupt() {
  if (!shadow) {
    return;
  }
  var list = shadow.querySelector(".options");
  var draft = interruptView.note;
  var selected = interruptView.selectedId;
  list.replaceChildren();
  interruptView.options.forEach(function (option) {
    var item = element("li");
    var choice = element("button", "choice", option.name);
    choice.type = "button";
    choice.setAttribute("data-option-id", option.id);
    if (option.closesTab) {
      choice.setAttribute("data-closes-tab", "true");
      choice.addEventListener("click", function () {
        closeCurrentTab();
      });
      item.appendChild(choice);
      list.appendChild(item);
      return;
    }
    var pressed = option.id === selected;
    choice.setAttribute("aria-pressed", pressed ? "true" : "false");
    choice.addEventListener("click", function () {
      if (busy || interruptView.selectedId === option.id) {
        return;
      }
      interruptView.selectedId = option.id;
      interruptView.note = "";
      interruptView.error = "";
      renderInterrupt();
      var note = list.querySelector("textarea");
      if (note) {
        note.focus();
      }
    });
    item.appendChild(choice);
    if (pressed) {
      var noteBox = element("div", "note");
      var noteLabel = element("label", "note-label", "备注");
      var field = document.createElement("textarea");
      field.id = "op-interrupt-note";
      field.value = draft;
      field.setAttribute("data-op-note", "1");
      noteLabel.htmlFor = field.id;
      field.addEventListener("input", function () {
        interruptView.note = field.value;
        interruptView.error = "";
        showError(shadow.querySelector("[data-op-error='interrupt']"), "");
      });
      var confirm = element("button", "confirm", OP.COPY.confirm);
      confirm.type = "button";
      confirm.setAttribute("data-op-action", "interrupt-commit");
      confirm.addEventListener("click", commitInterrupt);
      noteBox.appendChild(noteLabel);
      noteBox.appendChild(field);
      noteBox.appendChild(confirm);
      item.appendChild(noteBox);
    }
    list.appendChild(item);
  });
  showError(shadow.querySelector("[data-op-error='interrupt']"), interruptView.error);
}

function commitInterrupt() {
  if (busy || !interruptView.selectedId) {
    return;
  }
  var field = shadow && shadow.querySelector("#op-interrupt-note");
  if (field) {
    interruptView.note = field.value;
  }
  busy = true;
  send(OP.MESSAGE.interruptCommit, {
    optionId: interruptView.selectedId,
    note: interruptView.note
  }).then(function (response) {
    busy = false;
    if (!response.ok) {
      interruptView.error = response.error || OP.COPY.saveFailed;
      showError(shadow && shadow.querySelector("[data-op-error='interrupt']"), interruptView.error);
      return;
    }
    if (redisplayTimer) {
      window.clearTimeout(redisplayTimer);
      redisplayTimer = null;
    }
    resumePlayback = null;
    closeInterrupt();
  });
}

function closeCurrentTab() {
  if (busy) {
    return;
  }
  busy = true;
  send(OP.MESSAGE.interruptCloseTab).then(function (response) {
    busy = false;
    if (!response.ok) {
      interruptView.error = response.error || OP.COPY.saveFailed;
      showError(shadow && shadow.querySelector("[data-op-error='interrupt']"), interruptView.error);
      return;
    }
    if (redisplayTimer) {
      window.clearTimeout(redisplayTimer);
      redisplayTimer = null;
    }
    resumePlayback = null;
    closeInterrupt();
  });
}

function dismissInterrupt() {
  if (busy) {
    return;
  }
  busy = true;
  send(OP.MESSAGE.interruptDismiss).then(function (response) {
    busy = false;
    if (!response.ok) {
      interruptView.error = response.error || OP.COPY.saveFailed;
      showError(shadow && shadow.querySelector("[data-op-error='interrupt']"), interruptView.error);
      return;
    }
    var resume = resumePlayback;
    resumePlayback = null;
    closeInterrupt();
    if (typeof resume === "function") {
      resume();
    }
    redisplayTimer = window.setTimeout(function () {
      redisplayTimer = null;
      OP.showInterrupt(interruptView.options, interruptView.contrast);
    }, OP.REDISPLAY_MS);
  });
}

function mountInterrupt() {
  ensureShell();
  closeSnoozePanel();
  var existing = shadow.querySelector(".overlay");
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
  }
  var overlay = element("div", "overlay");
  overlay.setAttribute("data-op-layer", "interrupt");
  var dialog = element("div", "dialog");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  var head = element("div", "dialog-head");
  var title = element("h1", "", OP.COPY.interruptTitle);
  title.id = "op-interrupt-title";
  dialog.setAttribute("aria-labelledby", title.id);
  var dismiss = element("button", "dismiss", OP.COPY.dismiss);
  dismiss.type = "button";
  dismiss.setAttribute("data-op-action", "dismiss");
  dismiss.addEventListener("click", dismissInterrupt);
  head.appendChild(title);
  head.appendChild(dismiss);
  dialog.appendChild(head);
  if (interruptView.contrast && interruptView.contrast.name) {
    var contrast = element("div", "contrast");
    contrast.setAttribute("data-op-contrast", "1");
    contrast.appendChild(element("p", "contrast-title", OP.COPY.purposeContrastTitle));
    contrast.appendChild(element("p", "contrast-name", interruptView.contrast.name));
    if (interruptView.contrast.note) {
      contrast.appendChild(element("p", "contrast-note", interruptView.contrast.note));
    }
    dialog.appendChild(contrast);
  }
  dialog.appendChild(element("ul", "options"));
  var error = element("p", "error");
  error.hidden = true;
  error.setAttribute("data-op-error", "interrupt");
  dialog.appendChild(error);
  overlay.appendChild(dialog);
  shadow.appendChild(overlay);
  ["mousedown", "mouseup", "click", "pointerdown", "pointerup", "auxclick", "contextmenu"].forEach(function (type) {
    overlay.addEventListener(type, function (event) {
      event.stopPropagation();
    });
  });
  watchHost();
  renderInterrupt();
}

OP.showInterrupt = function (options, contrast) {
  if (redisplayTimer) {
    window.clearTimeout(redisplayTimer);
    redisplayTimer = null;
  }
  interruptView.options = sortedOptions(options);
  interruptView.contrast = contrast || null;
  interruptView.selectedId = null;
  interruptView.note = "";
  interruptView.error = "";
  if (OP.isPurposeInquiryOpen()) {
    return Promise.resolve();
  }
  if (shadow && shadow.querySelector("#op-interrupt-title")) {
    renderInterrupt();
    pinHost();
    return Promise.resolve();
  }
  if (interruptMounting) {
    return Promise.resolve();
  }
  interruptMounting = true;
  return exitFullscreen().then(function () {
    interruptMounting = false;
    if (OP.isPurposeInquiryOpen()) {
      return;
    }
    if (shadow && shadow.querySelector("#op-interrupt-title")) {
      renderInterrupt();
      pinHost();
      return;
    }
    mountInterrupt();
    pauseForInterrupt();
  }, function () {
    interruptMounting = false;
  });
};

OP.refreshInterrupt = function (options) {
  if (!shadow || !shadow.querySelector("#op-interrupt-title")) {
    interruptView.options = sortedOptions(options);
    return;
  }
  var available = sortedOptions(options);
  interruptView.options = available;
  if (interruptView.selectedId && !available.some(function (item) { return item.id === interruptView.selectedId; })) {
    interruptView.selectedId = null;
    interruptView.note = "";
    interruptView.error = "";
  }
  renderInterrupt();
};

OP.isInterruptOpen = function () {
  return Boolean(shadow && shadow.querySelector("#op-interrupt-title"));
};

var snoozeState = {
  until: null,
  xRatio: null,
  yRatio: null,
  open: false
};
var snoozeResizeBound = false;

function padClock(value) {
  return String(value).padStart(2, "0");
}

function hourMinute(ms) {
  var date = new Date(ms);
  return padClock(date.getHours()) + ":" + padClock(date.getMinutes());
}

function deadlineText(ms) {
  var date = new Date(ms);
  return date.getFullYear() + "-" + padClock(date.getMonth() + 1) + "-" + padClock(date.getDate()) + " " + hourMinute(ms);
}

function readSnoozeMinutes(raw) {
  var text = typeof raw === "string" ? raw.trim() : "";
  if (!/^[0-9]+$/.test(text)) {
    return { ok: false, error: OP.COPY.invalidMinutes };
  }
  var minutes = Number(text);
  if (!Number.isSafeInteger(minutes) || minutes < 1) {
    return { ok: false, error: OP.COPY.invalidMinutes };
  }
  return { ok: true, minutes: minutes };
}

function snoozeButtonNode() {
  return shadow ? shadow.querySelector("[data-op-snooze='1']") : null;
}

function placeSnoozePanel() {
  var panel = shadow && shadow.querySelector(".snooze-panel");
  var button = snoozeButtonNode();
  if (!panel || !button || panel.hidden) {
    return;
  }
  var edge = OP.BUTTON_EDGE_PX;
  var rect = button.getBoundingClientRect();
  var width = panel.offsetWidth;
  var height = panel.offsetHeight;
  var x = rect.right - width;
  var y = rect.top - height - 8;
  if (y < edge) {
    y = rect.bottom + 8;
  }
  x = Math.min(Math.max(x, edge), Math.max(edge, window.innerWidth - width - edge));
  y = Math.min(Math.max(y, edge), Math.max(edge, window.innerHeight - height - edge));
  panel.style.left = x + "px";
  panel.style.top = y + "px";
}

function placeSnooze() {
  var button = snoozeButtonNode();
  if (!button) {
    return;
  }
  var edge = OP.BUTTON_EDGE_PX;
  var margin = OP.BUTTON_MARGIN_PX;
  var width = button.offsetWidth || 48;
  var height = button.offsetHeight || 32;
  var maxX = Math.max(edge, window.innerWidth - width - edge);
  var maxY = Math.max(edge, window.innerHeight - height - edge);
  var x = window.innerWidth - width - margin;
  var y = window.innerHeight - height - margin;
  if (typeof snoozeState.xRatio === "number" && typeof snoozeState.yRatio === "number") {
    x = snoozeState.xRatio * window.innerWidth;
    y = snoozeState.yRatio * window.innerHeight;
  }
  button.style.left = Math.min(Math.max(x, edge), maxX) + "px";
  button.style.top = Math.min(Math.max(y, edge), maxY) + "px";
  placeSnoozePanel();
}

function renderSnoozeLabel() {
  var button = snoozeButtonNode();
  if (!button) {
    return;
  }
  var active = typeof snoozeState.until === "number" && snoozeState.until > Date.now();
  button.textContent = active ? "至 " + hourMinute(snoozeState.until) : OP.COPY.snoozeIdle;
  var deadline = shadow.querySelector("[data-op-snooze-deadline]");
  if (!deadline) {
    return;
  }
  if (active) {
    deadline.hidden = false;
    deadline.textContent = deadlineText(snoozeState.until);
  } else {
    deadline.hidden = true;
    deadline.textContent = "";
  }
}

function closeSnoozePanel() {
  snoozeState.open = false;
  var panel = shadow && shadow.querySelector(".snooze-panel");
  if (panel) {
    panel.hidden = true;
  }
}

function openSnoozePanel() {
  var panel = shadow && shadow.querySelector(".snooze-panel");
  if (!panel) {
    return;
  }
  snoozeState.open = true;
  panel.hidden = false;
  var input = panel.querySelector("[data-op-snooze-custom]");
  if (input) {
    input.value = String(OP.DEFAULT_SNOOZE_INPUT_MINUTES);
  }
  showError(panel.querySelector("[data-op-error='snooze']"), "");
  renderSnoozeLabel();
  placeSnoozePanel();
}

function sendSnoozeMinutes(minutes) {
  send(OP.MESSAGE.snoozeSet, { minutes: String(minutes) }).then(function (response) {
    var error = shadow && shadow.querySelector("[data-op-error='snooze']");
    if (!response.ok) {
      showError(error, response.error || OP.COPY.saveFailed);
      return;
    }
    if (response.snooze) {
      OP.applySnooze(response.snooze);
    }
    closeSnoozePanel();
  });
}

function bindSnoozePointer(button) {
  var drag = null;
  button.addEventListener("pointerdown", function (event) {
    if (event.button !== 0) {
      return;
    }
    drag = {
      x: event.clientX,
      y: event.clientY,
      moved: false,
      pointerId: event.pointerId
    };
    try {
      if (button.setPointerCapture) {
        button.setPointerCapture(event.pointerId);
      }
    } catch (error) {
      void error;
    }
  });
  button.addEventListener("pointermove", function (event) {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    var dx = event.clientX - drag.x;
    var dy = event.clientY - drag.y;
    if (!drag.moved && Math.sqrt(dx * dx + dy * dy) <= OP.DRAG_THRESHOLD_PX) {
      return;
    }
    if (!drag.moved) {
      drag.moved = true;
      drag.originLeft = button.getBoundingClientRect().left;
      drag.originTop = button.getBoundingClientRect().top;
    }
    var edge = OP.BUTTON_EDGE_PX;
    var left = drag.originLeft + (event.clientX - drag.x);
    var top = drag.originTop + (event.clientY - drag.y);
    var maxX = Math.max(edge, window.innerWidth - button.offsetWidth - edge);
    var maxY = Math.max(edge, window.innerHeight - button.offsetHeight - edge);
    button.style.left = Math.min(Math.max(left, edge), maxX) + "px";
    button.style.top = Math.min(Math.max(top, edge), maxY) + "px";
    placeSnoozePanel();
  });
  button.addEventListener("pointerup", function (event) {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    var moved = drag.moved;
    drag = null;
    if (moved) {
      var rect = button.getBoundingClientRect();
      send(OP.MESSAGE.snoozeMove, {
        xRatio: window.innerWidth ? rect.left / window.innerWidth : 0,
        yRatio: window.innerHeight ? rect.top / window.innerHeight : 0
      }).then(function (response) {
        if (response.ok && response.snooze) {
          OP.applySnooze(response.snooze);
        }
      });
      return;
    }
    if (snoozeState.open) {
      closeSnoozePanel();
    } else {
      openSnoozePanel();
    }
  });
  button.addEventListener("pointercancel", function (event) {
    if (drag && event.pointerId === drag.pointerId) {
      drag = null;
    }
  });
}

function ensureSnoozeControls() {
  if (!shadow || shadow.querySelector("[data-op-snooze='1']")) {
    return;
  }
  var button = element("button", "snooze", OP.COPY.snoozeIdle);
  button.type = "button";
  button.setAttribute("data-op-snooze", "1");
  var panel = element("div", "snooze-panel");
  panel.hidden = true;
  var deadline = element("p", "snooze-deadline", "");
  deadline.hidden = true;
  deadline.setAttribute("data-op-snooze-deadline", "1");
  var ten = element("button", "", "10 分钟");
  ten.type = "button";
  ten.setAttribute("data-op-snooze-preset", "10");
  var thirty = element("button", "", "30 分钟");
  thirty.type = "button";
  thirty.setAttribute("data-op-snooze-preset", "30");
  var custom = document.createElement("input");
  custom.type = "text";
  custom.setAttribute("data-op-snooze-custom", "1");
  custom.setAttribute("inputmode", "numeric");
  custom.value = String(OP.DEFAULT_SNOOZE_INPUT_MINUTES);
  var confirm = element("button", "confirm", OP.COPY.confirm);
  confirm.type = "button";
  confirm.setAttribute("data-op-action", "snooze-custom");
  var error = element("p", "error");
  error.hidden = true;
  error.setAttribute("data-op-error", "snooze");
  panel.appendChild(deadline);
  panel.appendChild(ten);
  panel.appendChild(thirty);
  panel.appendChild(custom);
  panel.appendChild(confirm);
  panel.appendChild(error);
  shadow.appendChild(button);
  shadow.appendChild(panel);
  bindSnoozePointer(button);
  ten.addEventListener("click", function () {
    sendSnoozeMinutes(OP.PRESET_SNOOZE_MINUTES[0]);
  });
  thirty.addEventListener("click", function () {
    sendSnoozeMinutes(OP.PRESET_SNOOZE_MINUTES[1]);
  });
  confirm.addEventListener("click", function () {
    var check = readSnoozeMinutes(custom.value);
    if (!check.ok) {
      showError(error, check.error);
      return;
    }
    sendSnoozeMinutes(check.minutes);
  });
  if (!snoozeResizeBound) {
    snoozeResizeBound = true;
    window.addEventListener("resize", placeSnooze);
  }
}

OP.applySnooze = function (snapshot) {
  if (!snapshot) {
    return;
  }
  snoozeState.until = typeof snapshot.until === "number" ? snapshot.until : null;
  snoozeState.xRatio = typeof snapshot.xRatio === "number" ? snapshot.xRatio : null;
  snoozeState.yRatio = typeof snapshot.yRatio === "number" ? snapshot.yRatio : null;
  ensureShell();
  ensureSnoozeControls();
  renderSnoozeLabel();
  placeSnooze();
};
