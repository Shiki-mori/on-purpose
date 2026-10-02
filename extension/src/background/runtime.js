var OP = globalThis.OP || (globalThis.OP = {});

var chain = Promise.resolve();

function enqueue(task) {
  var result = chain.then(function () {
    return task();
  });
  chain = result.then(function () {
    return null;
  }, function () {
    return null;
  });
  return result;
}

function byOrder(left, right) {
  return left.order - right.order;
}

function copyList(items) {
  return items.slice().sort(byOrder).map(function (item) {
    return JSON.parse(JSON.stringify(item));
  });
}

function cloneState(value) {
  return JSON.parse(JSON.stringify(value));
}

function fail(error) {
  return { ok: false, error: error || OP.COPY.saveFailed };
}

function tabIdFrom(sender) {
  if (sender && sender.tab && typeof sender.tab.id === "number") {
    return sender.tab.id;
  }
  return null;
}

function tabAddress(tab) {
  if (!tab) {
    return "";
  }
  if (typeof tab.url === "string" && tab.url) {
    return tab.url;
  }
  if (typeof tab.pendingUrl === "string") {
    return tab.pendingUrl;
  }
  return "";
}

function isBilibiliTab(tab) {
  return Boolean(OP.findSite(tabAddress(tab)));
}

function queryTabs() {
  return new Promise(function (resolve, reject) {
    chrome.tabs.query({}, function (tabs) {
      var error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(tabs || []);
    });
  });
}

function notifyListsChanged(purposes) {
  return queryTabs().then(function (tabs) {
    tabs.forEach(function (tab) {
      if (typeof tab.id !== "number" || !isBilibiliTab(tab)) {
        return;
      }
      chrome.tabs.sendMessage(tab.id, {
        type: OP.MESSAGE.listsChanged,
        purposes: purposes
      }, function () {
        void chrome.runtime.lastError;
      });
    });
  }).catch(function () {
    return null;
  });
}

function nextOrder(items) {
  var max = 0;
  items.forEach(function (item) {
    if (typeof item.order === "number" && item.order > max) {
      max = item.order;
    }
  });
  return max + 1;
}

function findPurpose(purposes, id) {
  var index;
  for (index = 0; index < purposes.length; index += 1) {
    if (purposes[index].id === id) {
      return purposes[index];
    }
  }
  return null;
}

function loadSession() {
  return OP.readSession().then(function (session) {
    if (!session) {
      return OP.createEmptySessionState();
    }
    return cloneState(session);
  });
}

function ensurePendingMap(session) {
  if (!session.purposePending || typeof session.purposePending !== "object" || Array.isArray(session.purposePending)) {
    session.purposePending = {};
  }
  return session.purposePending;
}

function finishPurpose(session, tabId, recordId) {
  ensurePendingMap(session);
  delete session.purposePending[String(tabId)];
  session.purposeAnswered = true;
  session.latestPurposeRecordId = recordId;
  if (!session.roundActive) {
    session.roundActive = true;
  }
}

function appendRecord(local, record, session, tabId) {
  local.records.push(record);
  return OP.writeLocal(local).then(function () {
    finishPurpose(session, tabId, record.id);
    return OP.writeSession(session).catch(function () {
      local.records = local.records.filter(function (item) {
        return item.id !== record.id;
      });
      return OP.writeLocal(local).then(function () {
        throw new Error("session");
      });
    });
  });
}

OP.handlePopupGet = function () {
  return enqueue(function () {
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
    });
  }).catch(function () {
    return fail();
  });
};

OP.handleContentReady = function (message, sender) {
  return enqueue(function () {
    var tabId = tabIdFrom(sender);
    if (tabId === null) {
      return fail();
    }
    var url = message && typeof message.url === "string" ? message.url : "";
    var site = OP.findSite(url);
    if (!site) {
      return { ok: true, showPurpose: false };
    }
    return loadSession().then(function (session) {
      var key = String(tabId);
      var pending = ensurePendingMap(session);
      var showPurpose = site.isHome(url) || !session.roundActive || Object.prototype.hasOwnProperty.call(pending, key);
      if (!showPurpose) {
        return { ok: true, showPurpose: false };
      }
      session.roundActive = true;
      pending[key] = true;
      return OP.ensureLocalState().then(function (local) {
        return OP.writeSession(session).then(function () {
          return {
            ok: true,
            showPurpose: true,
            purposes: copyList(local.purposes)
          };
        });
      });
    });
  }).catch(function () {
    return fail();
  });
};

OP.handlePurposeAdd = function (message) {
  return enqueue(function () {
    var check = OP.normalizeName(message && message.name);
    if (!check.ok) {
      return fail(check.error);
    }
    return OP.ensureLocalState().then(function (local) {
      var next = cloneState(local);
      if (!Array.isArray(next.purposes)) {
        return fail();
      }
      var created = {
        id: crypto.randomUUID(),
        name: check.name,
        order: nextOrder(next.purposes)
      };
      next.purposes.push(created);
      return OP.writeLocal(next).then(function () {
        return {
          ok: true,
          purposes: copyList(next.purposes),
          purposeId: created.id
        };
      });
    });
  }).catch(function () {
    return fail();
  });
};

OP.handlePurposeCommit = function (message, sender) {
  return enqueue(function () {
    var tabId = tabIdFrom(sender);
    var purposeId = message && typeof message.purposeId === "string" ? message.purposeId : "";
    var note = message && typeof message.note === "string" ? message.note : "";
    if (tabId === null || !purposeId) {
      return fail();
    }
    return OP.ensureLocalState().then(function (local) {
      var next = cloneState(local);
      if (!Array.isArray(next.records) || !findPurpose(next.purposes || [], purposeId)) {
        return fail();
      }
      return loadSession().then(function (session) {
        var record = {
          id: crypto.randomUUID(),
          at: Date.now(),
          source: "purpose",
          kind: "purpose",
          purposeId: purposeId,
          optionId: null,
          optionName: "",
          note: note
        };
        return appendRecord(next, record, session, tabId).then(function () {
          return { ok: true, recordId: record.id };
        });
      });
    });
  }).catch(function () {
    return fail();
  });
};

OP.handlePurposeSkip = function (message, sender) {
  return enqueue(function () {
    var tabId = tabIdFrom(sender);
    if (tabId === null) {
      return fail();
    }
    return OP.ensureLocalState().then(function (local) {
      var next = cloneState(local);
      if (!Array.isArray(next.records)) {
        return fail();
      }
      return loadSession().then(function (session) {
        var record = {
          id: crypto.randomUUID(),
          at: Date.now(),
          source: "purpose",
          kind: "skip",
          purposeId: null,
          optionId: null,
          optionName: "",
          note: ""
        };
        return appendRecord(next, record, session, tabId).then(function () {
          return { ok: true, recordId: record.id };
        });
      });
    });
  }).catch(function () {
    return fail();
  });
};

function savePurposes(next) {
  var purposes = copyList(next.purposes);
  return OP.writeLocal(next).then(function () {
    return notifyListsChanged(purposes).then(function () {
      return { ok: true, purposes: purposes };
    });
  });
}

OP.handlePurposeUpdate = function (message) {
  return enqueue(function () {
    var check = OP.normalizeName(message && message.name);
    if (!check.ok) {
      return fail(check.error);
    }
    var id = message && typeof message.id === "string" ? message.id : "";
    if (!id) {
      return fail();
    }
    return OP.ensureLocalState().then(function (local) {
      var next = cloneState(local);
      var purpose = Array.isArray(next.purposes) ? findPurpose(next.purposes, id) : null;
      if (!purpose) {
        return fail();
      }
      purpose.name = check.name;
      return savePurposes(next);
    });
  }).catch(function () {
    return fail();
  });
};

OP.handlePurposeDelete = function (message) {
  return enqueue(function () {
    var id = message && typeof message.id === "string" ? message.id : "";
    if (!id) {
      return fail();
    }
    return OP.ensureLocalState().then(function (local) {
      var next = cloneState(local);
      var purpose = Array.isArray(next.purposes) ? findPurpose(next.purposes, id) : null;
      if (!purpose) {
        return fail();
      }
      if (!next.purposeSnapshots || typeof next.purposeSnapshots !== "object" || Array.isArray(next.purposeSnapshots)) {
        next.purposeSnapshots = {};
      }
      next.purposeSnapshots[purpose.id] = purpose.name;
      next.purposes = next.purposes.filter(function (item) {
        return item.id !== purpose.id;
      });
      return savePurposes(next);
    });
  }).catch(function () {
    return fail();
  });
};

function dropPendingTab(session, tabId) {
  if (!session || !session.purposePending) {
    return null;
  }
  var key = String(tabId);
  if (!Object.prototype.hasOwnProperty.call(session.purposePending, key)) {
    return null;
  }
  var next = cloneState(session);
  delete next.purposePending[key];
  return OP.writeSession(next);
}

function sessionHasRound(session) {
  if (!session) {
    return false;
  }
  if (session.roundActive || session.purposeAnswered || session.latestPurposeRecordId) {
    return true;
  }
  var pending = session.purposePending;
  return Boolean(pending && typeof pending === "object" && Object.keys(pending).length);
}

OP.handleTabRemoved = function (tabId) {
  return enqueue(function () {
    return OP.readSession().then(function (session) {
      return queryTabs().then(function (tabs) {
        if (!tabs.some(isBilibiliTab)) {
          if (!sessionHasRound(session)) {
            return null;
          }
          return OP.writeSession(OP.createEmptySessionState());
        }
        return dropPendingTab(session, tabId);
      }).catch(function () {
        return dropPendingTab(session, tabId);
      });
    });
  }).catch(function () {
    return null;
  });
};

var handlers = {};
handlers[OP.MESSAGE.popupGet] = function () {
  return OP.handlePopupGet();
};
handlers[OP.MESSAGE.contentReady] = function (message, sender) {
  return OP.handleContentReady(message, sender);
};
handlers[OP.MESSAGE.purposeAdd] = function (message) {
  return OP.handlePurposeAdd(message);
};
handlers[OP.MESSAGE.purposeCommit] = function (message, sender) {
  return OP.handlePurposeCommit(message, sender);
};
handlers[OP.MESSAGE.purposeSkip] = function (message, sender) {
  return OP.handlePurposeSkip(message, sender);
};
handlers[OP.MESSAGE.purposeUpdate] = function (message) {
  return OP.handlePurposeUpdate(message);
};
handlers[OP.MESSAGE.purposeDelete] = function (message) {
  return OP.handlePurposeDelete(message);
};

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || typeof message.type !== "string" || !handlers[message.type]) {
    return false;
  }
  handlers[message.type](message, sender).then(sendResponse, function () {
    sendResponse(fail());
  });
  return true;
});
