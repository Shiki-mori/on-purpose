var OP = globalThis.OP || (globalThis.OP = {});

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

function announceReady() {
  chrome.runtime.sendMessage({
    type: OP.MESSAGE.contentReady,
    url: location.href
  }, function (response) {
    if (chrome.runtime.lastError || !response || !response.ok || !response.showPurpose) {
      return;
    }
    OP.showPurposeInquiry(response.purposes || []);
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
      if (!message || message.type !== OP.MESSAGE.listsChanged || !Array.isArray(message.purposes)) {
        return;
      }
      OP.refreshPurposeInquiry(message.purposes);
    });
  }
}
