importScripts(
  "../shared/constants.js",
  "../shared/time.js",
  "../shared/storage.js",
  "../sites/bilibili.js",
  "../sites/index.js",
  "runtime.js"
);

OP.ensureLocalState();
OP.reconcileTimer();
OP.reconcileSnooze();

chrome.tabs.onRemoved.addListener(function (tabId) {
  OP.handleTabRemoved(tabId);
});

chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm && alarm.name === OP.ALARM_TIMER) {
    OP.handleTimerAlarm(alarm);
  }
  if (alarm && alarm.name === OP.ALARM_SNOOZE) {
    OP.handleSnoozeAlarm(alarm);
  }
});
