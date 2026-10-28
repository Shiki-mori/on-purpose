importScripts(
  "../shared/constants.js",
  "../shared/time.js",
  "../shared/storage.js",
  "../sites/bilibili.js",
  "../sites/index.js",
  "runtime.js"
);

OP.ensureLocalState();
OP.reconcileBlock();
OP.reconcileTimer();
OP.reconcileSnooze();

chrome.runtime.onStartup.addListener(function () { OP.reconcileBlock(); });
chrome.runtime.onInstalled.addListener(function () { OP.reconcileBlock(); });

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  if ((changeInfo.url || changeInfo.status) &&
      (OP.findSite(tab.pendingUrl || tab.url) || tab.url === chrome.runtime.getURL(OP.BLOCK_PAGE))) {
    OP.reconcileBlock();
  }
});
chrome.tabs.onActivated.addListener(function () { OP.reconcileBlock(); });
chrome.windows.onFocusChanged.addListener(function (windowId) {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) { OP.reconcileBlock(); }
});

chrome.tabs.onRemoved.addListener(function (tabId) {
  OP.handleTabRemoved(tabId);
});

chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm && (alarm.name === OP.ALARM_BLOCK_BOUNDARY || alarm.name === OP.ALARM_BLOCK_CHECK)) {
    OP.reconcileBlock();
  }
  if (alarm && alarm.name === OP.ALARM_TIMER) {
    OP.handleTimerAlarm(alarm);
  }
  if (alarm && alarm.name === OP.ALARM_SNOOZE) {
    OP.handleSnoozeAlarm(alarm);
  }
});
