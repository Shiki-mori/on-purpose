var OP = globalThis.OP;

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

function showError(message) {
  var error = document.getElementById("error");
  error.hidden = false;
  error.textContent = message || OP.COPY.saveFailed;
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

document.title = OP.COPY.logsTitle;
document.getElementById("logs-title").textContent = OP.COPY.logsTitle;

send(OP.MESSAGE.popupGet).then(function (response) {
  if (!response.ok || !Array.isArray(response.records)) {
    showError(response.error);
    return;
  }
  renderRecords(response.records);
});
