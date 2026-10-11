var OP = globalThis.OP;

var SVG_NS = "http://www.w3.org/2000/svg";
var SLICE_FILLS = [
  "var(--op-accent)",
  "var(--op-text)",
  "var(--op-muted)",
  "var(--op-line)",
  "var(--op-surface)"
];

var loadedRecords = [];

function startOfMonth(now) {
  var date = new Date(now);
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0).getTime();
}

function startOfRecentDays(now, days) {
  var date = new Date(now);
  var start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start.getTime();
}

function recordsInRange(records, range, now) {
  var start = range === "recent" ? startOfRecentDays(now, 30) : startOfMonth(now);
  return records.filter(function (record) {
    return (record.at || 0) >= start;
  });
}

function compareLabel(left, right) {
  return left.localeCompare(right, "zh-CN");
}

function countBy(records, accept) {
  var counts = {};
  records.forEach(function (record) {
    if (accept && !accept(record)) {
      return;
    }
    var label = record.choice || "";
    counts[label] = (counts[label] || 0) + 1;
  });
  return counts;
}

function topLabels(records, kinds) {
  var counts = countBy(records, function (record) {
    return kinds.indexOf(record.kind) !== -1;
  });
  var labels = Object.keys(counts);
  if (!labels.length) {
    return [];
  }
  var max = 0;
  labels.forEach(function (label) {
    if (counts[label] > max) {
      max = counts[label];
    }
  });
  return labels.filter(function (label) {
    return counts[label] === max;
  }).sort(compareLabel);
}

function mergedName(keptLabels, primary, alt) {
  var used = {};
  keptLabels.forEach(function (label) {
    used[label] = true;
  });
  if (!used[primary]) {
    return primary;
  }
  return alt;
}

function pieSlices(records, primary, alt) {
  var counts = countBy(records);
  var labels = Object.keys(counts);
  var total = records.length;
  if (!total) {
    return [];
  }
  var max = 0;
  labels.forEach(function (label) {
    if (counts[label] > max) {
      max = counts[label];
    }
  });
  var keep = [];
  var merge = [];
  labels.forEach(function (label) {
    var count = counts[label];
    var item = { label: label, count: count, merged: false };
    if (count * 10 < total && count < max) {
      merge.push(item);
    } else {
      keep.push(item);
    }
  });
  var slices = keep.slice();
  if (merge.length >= 2) {
    var mergedCount = 0;
    merge.forEach(function (item) {
      mergedCount += item.count;
    });
    slices.push({
      label: mergedName(keep.map(function (item) {
        return item.label;
      }), primary, alt),
      count: mergedCount,
      merged: true
    });
  } else {
    merge.forEach(function (item) {
      slices.push(item);
    });
  }
  slices.sort(function (left, right) {
    if (left.merged !== right.merged) {
      return left.merged ? 1 : -1;
    }
    if (left.count !== right.count) {
      return right.count - left.count;
    }
    return compareLabel(left.label, right.label);
  });
  return slices;
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

function renderNames(container, labels) {
  container.replaceChildren();
  if (!labels.length) {
    var empty = document.createElement("p");
    empty.className = "stat-empty";
    empty.textContent = OP.COPY.statsEmpty;
    container.appendChild(empty);
    return;
  }
  labels.forEach(function (label) {
    var chip = document.createElement("span");
    chip.className = "stat-chip";
    chip.textContent = label;
    container.appendChild(chip);
  });
}

function piePoint(cx, cy, radius, angle) {
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

function buildPieSvg(slices) {
  var svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", OP.COPY.pieHeading + "：" + slices.map(function (slice) {
    return slice.label + " " + slice.count;
  }).join("，"));
  if (slices.length === 1) {
    var circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", "50");
    circle.setAttribute("cy", "50");
    circle.setAttribute("r", "46");
    circle.setAttribute("fill", SLICE_FILLS[0]);
    svg.appendChild(circle);
    return svg;
  }
  var total = 0;
  slices.forEach(function (slice) {
    total += slice.count;
  });
  var angle = -Math.PI / 2;
  slices.forEach(function (slice, index) {
    var sweep = (slice.count / total) * Math.PI * 2;
    var next = angle + sweep;
    var start = piePoint(50, 50, 46, angle);
    var end = piePoint(50, 50, 46, next);
    var path = document.createElementNS(SVG_NS, "path");
    path.setAttribute(
      "d",
      "M 50 50 L " + start[0].toFixed(3) + " " + start[1].toFixed(3) +
      " A 46 46 0 " + (sweep > Math.PI ? 1 : 0) + " 1 " +
      end[0].toFixed(3) + " " + end[1].toFixed(3) + " Z"
    );
    path.setAttribute("fill", SLICE_FILLS[index % SLICE_FILLS.length]);
    path.setAttribute("stroke", "var(--op-line)");
    path.setAttribute("stroke-width", "0.8");
    svg.appendChild(path);
    angle = next;
  });
  return svg;
}

function renderLegend(slices) {
  var list = document.getElementById("pie-legend");
  list.replaceChildren();
  slices.forEach(function (slice, index) {
    var row = document.createElement("li");
    row.className = "legend-row";
    row.setAttribute("data-label", slice.label);
    row.setAttribute("data-count", String(slice.count));
    var swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.background = SLICE_FILLS[index % SLICE_FILLS.length];
    var name = document.createElement("span");
    name.className = "legend-name";
    name.textContent = slice.label;
    var count = document.createElement("span");
    count.className = "legend-count";
    count.textContent = String(slice.count);
    row.appendChild(swatch);
    row.appendChild(name);
    row.appendChild(count);
    list.appendChild(row);
  });
}

function renderPie(slices) {
  var host = document.getElementById("pie");
  host.replaceChildren();
  if (!slices.length) {
    var empty = document.createElement("p");
    empty.className = "stat-empty";
    empty.textContent = OP.COPY.statsEmpty;
    host.appendChild(empty);
    renderLegend([]);
    return;
  }
  host.appendChild(buildPieSvg(slices));
  renderLegend(slices);
}

function applyRange(range) {
  document.getElementById("range-month").setAttribute("aria-pressed", range === "month" ? "true" : "false");
  document.getElementById("range-recent").setAttribute("aria-pressed", range === "recent" ? "true" : "false");
  var ranged = recordsInRange(loadedRecords, range, Date.now());
  renderNames(document.getElementById("top-purpose-names"), topLabels(ranged, ["purpose"]));
  renderNames(document.getElementById("top-interrupt-names"), topLabels(ranged, ["option", "close-tab"]));
  renderPie(pieSlices(ranged, OP.COPY.pieMerged, OP.COPY.pieMergedAlt));
}

function boot() {
  document.title = OP.COPY.logsTitle;
  document.getElementById("logs-title").textContent = OP.COPY.logsTitle;
  document.getElementById("stats-heading").textContent = OP.COPY.statsHeading;
  document.getElementById("range-month").textContent = OP.COPY.rangeMonth;
  document.getElementById("range-recent").textContent = OP.COPY.rangeRecent;
  document.getElementById("top-purpose-label").textContent = OP.COPY.topPurpose;
  document.getElementById("top-interrupt-label").textContent = OP.COPY.topInterrupt;
  document.getElementById("pie-caption").textContent = OP.COPY.pieHeading;
  document.getElementById("records-heading").textContent = OP.COPY.logsAll;
  document.getElementById("range-month").addEventListener("click", function () {
    applyRange("month");
  });
  document.getElementById("range-recent").addEventListener("click", function () {
    applyRange("recent");
  });
  send(OP.MESSAGE.popupGet).then(function (response) {
    if (!response.ok || !Array.isArray(response.records)) {
      showError(response.error);
      return;
    }
    loadedRecords = response.records;
    document.getElementById("stats").hidden = false;
    applyRange("month");
    renderRecords(response.records);
  });
}

if (typeof document !== "undefined") {
  boot();
}
