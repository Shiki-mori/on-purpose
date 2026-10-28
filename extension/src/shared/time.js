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

OP.validateBlockSchedule = function (value) {
  if (!value || typeof value.enabled !== "boolean" ||
      !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(typeof value.start === "string" ? value.start : "") ||
      !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(typeof value.end === "string" ? value.end : "")) {
    return { ok: false, error: OP.COPY.invalidBlockTime };
  }
  if (value.start === value.end) {
    return { ok: false, error: OP.COPY.sameBlockTime };
  }
  return { ok: true, schedule: { enabled: value.enabled, start: value.start, end: value.end } };
};

OP.blockScheduleState = function (schedule, now) {
  var checked = OP.validateBlockSchedule(schedule);
  var value = checked.ok ? checked.schedule : OP.DEFAULT_BLOCK_SCHEDULE;
  var stamp = typeof now === "number" ? now : Date.now();
  var offset = 8 * 60 * 60 * 1000;
  var dayMs = 24 * 60 * 60 * 1000;
  var dayStart = Math.floor((stamp + offset) / dayMs) * dayMs - offset;
  function minutes(text) {
    return Number(text.slice(0, 2)) * 60 + Number(text.slice(3));
  }
  var start = minutes(value.start);
  var end = minutes(value.end);
  var minute = (stamp - dayStart) / 60000;
  var inside = start < end ? minute >= start && minute < end : minute >= start || minute < end;
  var nextBoundary = Math.min.apply(null, [start, end].map(function (point) {
    var at = dayStart + point * 60000;
    return at > stamp ? at : at + dayMs;
  }));
  return {
    schedule: { enabled: value.enabled, start: value.start, end: value.end },
    active: value.enabled && inside,
    nextBoundary: value.enabled ? nextBoundary : null
  };
};
