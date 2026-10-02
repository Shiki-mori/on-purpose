importScripts(
  "../shared/constants.js",
  "../shared/time.js",
  "../shared/storage.js",
  "../sites/bilibili.js",
  "../sites/index.js",
  "runtime.js"
);

OP.ensureLocalState();

chrome.tabs.onRemoved.addListener(function (tabId) {
  OP.handleTabRemoved(tabId);
});
