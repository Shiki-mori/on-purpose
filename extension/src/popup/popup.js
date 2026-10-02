var OP = globalThis.OP;

var savedIntervals = { first: null, again: null };
var intervalPending = { first: false, again: false };

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

function readMinutes(raw) {
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

function showError(message) {
  var error = document.getElementById("error");
  error.hidden = false;
  error.textContent = message || OP.COPY.saveFailed;
}

function hideError() {
  var error = document.getElementById("error");
  error.hidden = true;
  error.textContent = "";
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

function line(parent, className, text) {
  var node = document.createElement("p");
  node.className = className;
  node.textContent = text;
  parent.appendChild(node);
  return node;
}

function renderOptions(items) {
  var list = document.getElementById("options");
  list.replaceChildren();
  items.forEach(function (item) {
    var row = document.createElement("li");
    row.className = "option";
    row.setAttribute("data-option-id", item.id);
    if (item.locked) {
      row.setAttribute("data-locked", "true");
      var lockedName = document.createElement("span");
      lockedName.className = "option-name";
      lockedName.textContent = item.name;
      row.appendChild(lockedName);
      list.appendChild(row);
      return;
    }

    var view = document.createElement("div");
    view.className = "option-view";
    var name = document.createElement("span");
    name.className = "option-name";
    name.textContent = item.name;
    var actions = document.createElement("div");
    actions.className = "option-actions";
    var rename = document.createElement("button");
    rename.type = "button";
    rename.textContent = "改名";
    var remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "删除";
    actions.appendChild(rename);
    actions.appendChild(remove);
    view.appendChild(name);
    view.appendChild(actions);

    var error = document.createElement("p");
    error.className = "row-error";
    error.hidden = true;

    rename.addEventListener("click", function () {
      openOptionRename(row, item);
    });
    remove.addEventListener("click", function () {
      removeOption(item, error, remove);
    });

    row.appendChild(view);
    row.appendChild(error);
    list.appendChild(row);
  });
}

function renderRecords(records) {
  var list = document.getElementById("records");
  list.replaceChildren();
  records.forEach(function (record) {
    var row = document.createElement("li");
    row.className = "record";
    row.setAttribute("data-record-id", record.id);
    line(row, "record-time", record.atText);
    line(row, "record-source", record.sourceLabel);
    line(row, "record-choice", record.choice);
    if (record.note) {
      line(row, "record-note", record.note);
    }
    list.appendChild(row);
  });
}

function renderPurposes(purposes) {
  var list = document.getElementById("purposes");
  list.replaceChildren();
  purposes.forEach(function (purpose) {
    var row = document.createElement("li");
    row.className = "purpose";
    row.setAttribute("data-purpose-id", purpose.id);

    var view = document.createElement("div");
    view.className = "purpose-view";
    var name = document.createElement("span");
    name.className = "purpose-name";
    name.textContent = purpose.name;
    var actions = document.createElement("div");
    actions.className = "purpose-actions";
    var rename = document.createElement("button");
    rename.type = "button";
    rename.textContent = "改名";
    var remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "删除";
    actions.appendChild(rename);
    actions.appendChild(remove);
    view.appendChild(name);
    view.appendChild(actions);

    var error = document.createElement("p");
    error.className = "row-error";
    error.hidden = true;

    rename.addEventListener("click", function () {
      openRename(row, purpose);
    });
    remove.addEventListener("click", function () {
      removePurpose(purpose, error, remove);
    });

    row.appendChild(view);
    row.appendChild(error);
    list.appendChild(row);
  });
}

function openRename(row, purpose) {
  var view = row.querySelector(".purpose-view");
  var error = row.querySelector(".row-error");
  error.hidden = true;
  view.replaceChildren();

  var editor = document.createElement("div");
  editor.className = "purpose-editor";
  var input = document.createElement("input");
  input.type = "text";
  input.value = purpose.name;
  input.setAttribute("aria-label", "目的名称");
  var confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "primary";
  confirm.textContent = OP.COPY.confirm;
  var cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "取消";
  editor.appendChild(input);
  editor.appendChild(confirm);
  editor.appendChild(cancel);
  view.appendChild(editor);
  input.focus();
  input.select();

  function cancelEdit() {
    load();
  }

  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      submitRename(purpose.id, input.value, error, confirm);
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
    }
  });
  confirm.addEventListener("click", function () {
    submitRename(purpose.id, input.value, error, confirm);
  });
  cancel.addEventListener("click", cancelEdit);
}

function submitRename(id, raw, error, button) {
  var check = readName(raw);
  if (!check.ok) {
    error.hidden = false;
    error.textContent = check.error;
    return;
  }
  button.disabled = true;
  send(OP.MESSAGE.purposeUpdate, { id: id, name: check.name }).then(function (response) {
    button.disabled = false;
    if (!response.ok) {
      error.hidden = false;
      error.textContent = response.error || OP.COPY.saveFailed;
      return;
    }
    load();
  });
}

function removePurpose(purpose, error, button) {
  if (!window.confirm(OP.COPY.confirmDeletePurpose)) {
    return;
  }
  button.disabled = true;
  send(OP.MESSAGE.purposeDelete, { id: purpose.id }).then(function (response) {
    button.disabled = false;
    if (!response.ok) {
      error.hidden = false;
      error.textContent = response.error || OP.COPY.saveFailed;
      return;
    }
    load();
  });
}

function openOptionRename(row, option) {
  var view = row.querySelector(".option-view");
  var error = row.querySelector(".row-error");
  error.hidden = true;
  view.replaceChildren();

  var editor = document.createElement("div");
  editor.className = "option-editor";
  var input = document.createElement("input");
  input.type = "text";
  input.value = option.name;
  input.setAttribute("aria-label", "打断选项名称");
  var confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "primary";
  confirm.textContent = OP.COPY.confirm;
  var cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "取消";
  editor.appendChild(input);
  editor.appendChild(confirm);
  editor.appendChild(cancel);
  view.appendChild(editor);
  input.focus();
  input.select();

  function cancelEdit() {
    load();
  }

  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      submitOptionRename(option.id, input.value, error, confirm);
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
    }
  });
  confirm.addEventListener("click", function () {
    submitOptionRename(option.id, input.value, error, confirm);
  });
  cancel.addEventListener("click", cancelEdit);
}

function submitOptionRename(id, raw, error, button) {
  var check = readName(raw);
  if (!check.ok) {
    error.hidden = false;
    error.textContent = check.error;
    return;
  }
  button.disabled = true;
  send(OP.MESSAGE.optionUpdate, { id: id, name: check.name }).then(function (response) {
    button.disabled = false;
    if (!response.ok) {
      error.hidden = false;
      error.textContent = response.error || OP.COPY.saveFailed;
      return;
    }
    load();
  });
}

function removeOption(option, error, button) {
  if (!window.confirm(OP.COPY.confirmDeleteOption)) {
    return;
  }
  button.disabled = true;
  send(OP.MESSAGE.optionDelete, { id: option.id }).then(function (response) {
    button.disabled = false;
    if (!response.ok) {
      error.hidden = false;
      error.textContent = response.error || OP.COPY.saveFailed;
      return;
    }
    load();
  });
}

function showFieldError(error, message) {
  error.hidden = false;
  error.textContent = message;
}

function hideFieldError(error) {
  error.hidden = true;
  error.textContent = "";
}

function commitInterval(kind) {
  if (intervalPending[kind] || savedIntervals[kind] === null) {
    return;
  }
  var input = document.getElementById(kind === "first" ? "first-minutes" : "again-minutes");
  var error = document.getElementById(kind === "first" ? "first-error" : "again-error");
  var saved = savedIntervals[kind];
  var check = readMinutes(input.value);
  if (!check.ok) {
    input.value = saved === null ? "" : String(saved);
    showFieldError(error, check.error);
    return;
  }
  input.value = String(check.minutes);
  hideFieldError(error);
  if (check.minutes === saved) {
    return;
  }
  intervalPending[kind] = true;
  input.disabled = true;
  var payload = {};
  payload[kind === "first" ? "firstIntervalMinutes" : "againIntervalMinutes"] = String(check.minutes);
  send(OP.MESSAGE.settingsSet, payload).then(function (response) {
    intervalPending[kind] = false;
    input.disabled = false;
    if (!response.ok) {
      input.value = saved === null ? "" : String(saved);
      showFieldError(error, response.error || OP.COPY.saveFailed);
      return;
    }
    savedIntervals.first = response.settings.firstIntervalMinutes;
    savedIntervals.again = response.settings.againIntervalMinutes;
    if (document.activeElement !== input) {
      input.value = String(savedIntervals[kind]);
    }
    hideFieldError(error);
  });
}

function bindInterval(kind) {
  var input = document.getElementById(kind === "first" ? "first-minutes" : "again-minutes");
  input.addEventListener("keydown", function (event) {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    commitInterval(kind);
  });
  input.addEventListener("blur", function () {
    commitInterval(kind);
  });
}

function addOption(event) {
  event.preventDefault();
  var input = document.getElementById("option-name");
  var error = document.getElementById("option-add-error");
  var button = document.querySelector("#option-form button");
  var check = readName(input.value);
  if (!check.ok) {
    showFieldError(error, check.error);
    return;
  }
  button.disabled = true;
  send(OP.MESSAGE.optionAdd, { name: check.name }).then(function (response) {
    button.disabled = false;
    if (!response.ok) {
      showFieldError(error, response.error || OP.COPY.saveFailed);
      return;
    }
    input.value = "";
    hideFieldError(error);
    load();
  });
}

function render(response) {
  savedIntervals.first = response.settings.firstIntervalMinutes;
  savedIntervals.again = response.settings.againIntervalMinutes;
  ["first", "again"].forEach(function (kind) {
    var input = document.getElementById(kind === "first" ? "first-minutes" : "again-minutes");
    if (intervalPending[kind] || document.activeElement === input) {
      return;
    }
    input.value = String(savedIntervals[kind]);
  });
  renderPurposes(response.purposes);
  renderOptions(response.interruptOptions);
  renderRecords(response.records);
}

function load() {
  send(OP.MESSAGE.popupGet).then(function (response) {
    if (!response.ok) {
      showError(response.error);
      return;
    }
    hideError();
    render(response);
  });
}

document.getElementById("first-label").textContent = OP.COPY.firstIntervalLabel;
document.getElementById("again-label").textContent = OP.COPY.againIntervalLabel;
bindInterval("first");
bindInterval("again");
document.getElementById("option-form").addEventListener("submit", addOption);
document.getElementById("option-name").addEventListener("input", function () {
  hideFieldError(document.getElementById("option-add-error"));
});
load();
