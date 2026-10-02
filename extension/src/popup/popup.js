var OP = globalThis.OP;

function fillNames(listId, items) {
  var list = document.getElementById(listId);
  items.forEach(function (item) {
    var row = document.createElement("li");
    row.textContent = item.name;
    list.appendChild(row);
  });
}

function showError(message) {
  var error = document.getElementById("error");
  error.hidden = false;
  error.textContent = message || OP.COPY.saveFailed;
}

document.getElementById("first-label").textContent = OP.COPY.firstIntervalLabel;
document.getElementById("again-label").textContent = OP.COPY.againIntervalLabel;

chrome.runtime.sendMessage({ type: OP.MESSAGE.popupGet }, function (response) {
  if (chrome.runtime.lastError || !response || !response.ok) {
    showError(response && response.error);
    return;
  }
  document.getElementById("first-value").textContent = String(response.settings.firstIntervalMinutes);
  document.getElementById("again-value").textContent = String(response.settings.againIntervalMinutes);
  fillNames("purposes", response.purposes);
  fillNames("options", response.interruptOptions);
  var records = document.getElementById("records");
  response.records.forEach(function (record) {
    var row = document.createElement("li");
    row.textContent = record.atText + " " + record.sourceLabel + " " + record.choice;
    if (record.note) {
      var note = document.createElement("p");
      note.textContent = record.note;
      row.appendChild(note);
    }
    records.appendChild(row);
  });
});
