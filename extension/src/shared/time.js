var OP = globalThis.OP || (globalThis.OP = {});

function padTime(value) {
  return String(value).padStart(2, "0");
}

function localParts(ms) {
  var date = new Date(ms);
  return {
    year: date.getFullYear(),
    month: padTime(date.getMonth() + 1),
    day: padTime(date.getDate()),
    hour: padTime(date.getHours()),
    minute: padTime(date.getMinutes()),
    second: padTime(date.getSeconds())
  };
}

OP.minutesToMs = function (minutes) {
  return minutes * 60 * 1000;
};

OP.formatTime = function (ms) {
  var parts = localParts(ms);
  return parts.year + "-" + parts.month + "-" + parts.day + " " + parts.hour + ":" + parts.minute + ":" + parts.second;
};

OP.formatHourMinute = function (ms) {
  var parts = localParts(ms);
  return parts.hour + ":" + parts.minute;
};

OP.formatDeadline = function (ms) {
  var parts = localParts(ms);
  return parts.year + "-" + parts.month + "-" + parts.day + " " + parts.hour + ":" + parts.minute;
};
