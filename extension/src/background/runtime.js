var OP = globalThis.OP || (globalThis.OP = {});

function byOrder(left, right) {
  return left.order - right.order;
}

function copyList(items) {
  return items.slice().sort(byOrder).map(function (item) {
    return JSON.parse(JSON.stringify(item));
  });
}

OP.handlePopupGet = function () {
  return OP.ensureLocalState().then(function (local) {
    return {
      ok: true,
      purposes: copyList(local.purposes),
      interruptOptions: copyList(local.interruptOptions),
      settings: {
        firstIntervalMinutes: local.settings.firstIntervalMinutes,
        againIntervalMinutes: local.settings.againIntervalMinutes
      },
      records: OP.presentRecords(local)
    };
  }).catch(function () {
    return { ok: false, error: OP.COPY.saveFailed };
  });
};

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || message.type !== OP.MESSAGE.popupGet) {
    return false;
  }
  OP.handlePopupGet().then(sendResponse);
  return true;
});
