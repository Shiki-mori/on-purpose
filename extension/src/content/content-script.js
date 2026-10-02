var OP = globalThis.OP || (globalThis.OP = {});

var waitingInterrupt = null;

function isHtmlDocument() {
  var type = document.contentType || "";
  if (type && type !== "text/html" && type !== "application/xhtml+xml") {
    return false;
  }
  if (document.documentElement && document.documentElement.namespaceURI !== "http://www.w3.org/1999/xhtml") {
    return false;
  }
  return true;
}

function onDocumentElement(done) {
  if (document.documentElement) {
    done();
    return;
  }
  var observer = new MutationObserver(function () {
    if (document.documentElement) {
      observer.disconnect();
      done();
    }
  });
  observer.observe(document, { childList: true });
}

function rememberInterrupt(payload) {
  waitingInterrupt = {
    interruptOptions: payload.interruptOptions || [],
    purposeContrast: payload.purposeContrast || null
  };
}

function presentInterrupt(payload) {
  waitingInterrupt = null;
  OP.showInterrupt(payload.interruptOptions || [], payload.purposeContrast || null);
}

function afterPurpose() {
  if (!waitingInterrupt) {
    return;
  }
  var payload = waitingInterrupt;
  waitingInterrupt = null;
  OP.showInterrupt(payload.interruptOptions, payload.purposeContrast);
}

function announceReady() {
  chrome.runtime.sendMessage({
    type: OP.MESSAGE.contentReady,
    url: location.href
  }, function (response) {
    if (chrome.runtime.lastError || !response || !response.ok) {
      return;
    }
    if (response.showInterrupt) {
      rememberInterrupt(response);
    }
    if (response.showPurpose) {
      OP.onPurposeInquiryClosed = afterPurpose;
      OP.showPurposeInquiry(response.purposes || []);
      return;
    }
    if (response.showInterrupt) {
      presentInterrupt(response);
    }
  });
}

if (!globalThis.__opContentBound) {
  globalThis.__opContentBound = true;
  if (isHtmlDocument()) {
    onDocumentElement(function () {
      if (isHtmlDocument()) {
        announceReady();
      }
    });

    chrome.runtime.onMessage.addListener(function (message) {
      if (!message) {
        return;
      }
      if (message.type === OP.MESSAGE.listsChanged) {
        if (Array.isArray(message.purposes)) {
          OP.refreshPurposeInquiry(message.purposes);
        }
        if (Array.isArray(message.interruptOptions)) {
          if (waitingInterrupt) {
            waitingInterrupt.interruptOptions = message.interruptOptions;
          }
          OP.refreshInterrupt(message.interruptOptions);
        }
        return;
      }
      if (message.type === OP.MESSAGE.showInterrupt) {
        if (OP.isPurposeInquiryOpen()) {
          rememberInterrupt(message);
          OP.onPurposeInquiryClosed = afterPurpose;
          return;
        }
        presentInterrupt(message);
      }
    });
  }
}
