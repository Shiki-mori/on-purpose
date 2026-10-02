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
      if (!host || !host.isConnected) {
        return;
      }
      var path = typeof event.composedPath === "function" ? event.composedPath() : [];
      if (path.indexOf(host) !== -1) {
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
    "  z-index: 0;",
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

function mountHost() {
  host = document.createElement("div");
  host.setAttribute("data-op-host", "purpose");
  host.style.setProperty("position", "fixed", "important");
  host.style.setProperty("inset", "0", "important");
  host.style.setProperty("z-index", OP.HOST_Z_INDEX, "important");
  host.style.setProperty("pointer-events", "none", "important");
  host.style.setProperty("margin", "0", "important");
  host.style.setProperty("background", "transparent", "important");
  host.style.setProperty("display", "block", "important");
  shadow = host.attachShadow({ mode: "open" });

  var link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = chrome.runtime.getURL("src/shared/theme.css");
  var style = element("style");
  style.textContent = dialogStyle();
  shadow.appendChild(link);
  shadow.appendChild(style);

  var overlay = element("div", "overlay");
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
  if (host && host.parentNode) {
    host.parentNode.removeChild(host);
  }
  host = null;
  shadow = null;
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
    if (!host) {
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
  if (!host || !host.isConnected || host.getAttribute("data-op-host") !== "purpose") {
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
  return Boolean(host && host.isConnected && host.getAttribute("data-op-host") === "purpose");
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
  if (host && host.getAttribute("data-op-host") === "interrupt" && host.parentNode) {
    host.parentNode.removeChild(host);
  }
  if (!host || host.getAttribute("data-op-host") === "interrupt") {
    host = null;
    shadow = null;
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
  host = hostShell("interrupt");
  shadow = host.attachShadow({ mode: "open" });
  var link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = chrome.runtime.getURL("src/shared/theme.css");
  var style = element("style");
  style.textContent = dialogStyle();
  shadow.appendChild(link);
  shadow.appendChild(style);

  var overlay = element("div", "overlay");
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
  document.documentElement.appendChild(host);
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
  if (host && host.isConnected && host.getAttribute("data-op-host") === "interrupt") {
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
    if (host && host.isConnected && host.getAttribute("data-op-host") === "interrupt") {
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
  if (!host || !host.isConnected || host.getAttribute("data-op-host") !== "interrupt") {
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
  return Boolean(host && host.isConnected && host.getAttribute("data-op-host") === "interrupt");
};
