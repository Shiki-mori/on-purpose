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

function notifyListsChanged(purposes, interruptOptions) {
  return queryTabs().then(function (tabs) {
    tabs.forEach(function (tab) {
      if (typeof tab.id !== "number" || !isBilibiliTab(tab)) {
        return;
      }
      var message = {
        type: OP.MESSAGE.listsChanged,
        purposes: purposes
      };
      if (interruptOptions) {
        message.interruptOptions = interruptOptions;
      }
      chrome.tabs.sendMessage(tab.id, message, function () {
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

function findOption(options, id) {
  var index;
  if (!Array.isArray(options)) {
    return null;
  }
  for (index = 0; index < options.length; index += 1) {
    if (options[index].id === id) {
      return options[index];
    }
  }
  return null;
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

function ensureTimer(session) {
  if (!session.timer || typeof session.timer !== "object") {
    session.timer = { mode: "idle", startedAt: null, intervalKind: null };
  }
  return session.timer;
}

function ensureInterrupt(session) {
  if (!session.interrupt || typeof session.interrupt !== "object") {
    session.interrupt = { active: false, reason: null, pending: {} };
  }
  if (!session.interrupt.pending || typeof session.interrupt.pending !== "object" || Array.isArray(session.interrupt.pending)) {
    session.interrupt.pending = {};
  }
  return session.interrupt;
}

function mapEmpty(map) {
  return !map || typeof map !== "object" || Array.isArray(map) || Object.keys(map).length === 0;
}

function idleTimerFields(session) {
  var timer = ensureTimer(session);
  timer.mode = "idle";
  timer.startedAt = null;
  timer.intervalKind = null;
}

function intervalMinutes(local, kind) {
  if (!local || !local.settings) {
    return null;
  }
  if (kind === "again") {
    return local.settings.againIntervalMinutes;
  }
  if (kind === "first") {
    return local.settings.firstIntervalMinutes;
  }
  return null;
}

function dueAt(startedAt, minutes) {
  return startedAt + minutes * 60 * 1000;
}

function setTimerAlarm(when) {
  return new Promise(function (resolve, reject) {
    chrome.alarms.create(OP.ALARM_TIMER, { when: when }, function () {
      var error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

function clearTimerAlarm() {
  return new Promise(function (resolve) {
    chrome.alarms.clear(OP.ALARM_TIMER, function () {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

function clearRound() {
  return clearTimerAlarm().then(function () {
    return OP.writeSession(OP.createEmptySessionState());
  });
}

function armTimer(session, local, kind) {
  var minutes = intervalMinutes(local, kind);
  var now = Date.now();
  var timer = ensureTimer(session);
  timer.mode = "running";
  timer.startedAt = now;
  timer.intervalKind = kind;
  var interrupt = ensureInterrupt(session);
  interrupt.active = false;
  interrupt.reason = null;
  interrupt.pending = {};
  return { when: dueAt(now, minutes) };
}

function rollbackRecord(local, record) {
  local.records = local.records.filter(function (item) {
    return item.id !== record.id;
  });
  return OP.writeLocal(local).then(function () {
    throw new Error("session");
  });
}

function writeSessionOrRollback(local, session, record) {
  return OP.writeSession(session).catch(function () {
    return rollbackRecord(local, record);
  });
}

function planFirstInterval(session, local) {
  if (!mapEmpty(ensurePendingMap(session))) {
    return null;
  }
  var interrupt = ensureInterrupt(session);
  if (interrupt.active && !mapEmpty(interrupt.pending)) {
    return null;
  }
  if (!session.purposeAnswered) {
    return null;
  }
  if (interrupt.active) {
    return armTimer(session, local, "again");
  }
  return armTimer(session, local, "first");
}

function appendRecord(local, record, session, tabId) {
  local.records.push(record);
  return OP.writeLocal(local).then(function () {
    finishPurpose(session, tabId, record.id);
    var plan = planFirstInterval(session, local);
    return writeSessionOrRollback(local, session, record).then(function () {
      if (!plan) {
        return null;
      }
      return setTimerAlarm(plan.when);
    });
  });
}

function contrastFor(local, session) {
  if (!session || !session.latestPurposeRecordId || !local || !Array.isArray(local.records)) {
    return null;
  }
  var index;
  var record = null;
  for (index = 0; index < local.records.length; index += 1) {
    if (local.records[index].id === session.latestPurposeRecordId) {
      record = local.records[index];
      break;
    }
  }
  if (!record || (record.source !== "purpose" && record.kind !== "purpose" && record.kind !== "skip")) {
    return null;
  }
  var contrast = OP.purposeContrast(local, record);
  if (!contrast || !contrast.name) {
    return null;
  }
  return contrast;
}

function interruptPayload(local, session) {
  return {
    type: OP.MESSAGE.showInterrupt,
    interruptOptions: copyList(local.interruptOptions || []),
    purposeContrast: contrastFor(local, session)
  };
}

function bilibiliTabs(tabs) {
  return (tabs || []).filter(isBilibiliTab);
}

function startInterruptRound(session, local, tabs, reason) {
  idleTimerFields(session);
  var interrupt = ensureInterrupt(session);
  interrupt.active = true;
  interrupt.reason = reason;
  interrupt.pending = {};
  tabs.forEach(function (tab) {
    if (typeof tab.id === "number") {
      interrupt.pending[String(tab.id)] = true;
    }
  });
  var payload = interruptPayload(local, session);
  return clearTimerAlarm().then(function () {
    return OP.writeSession(session);
  }).then(function () {
    tabs.forEach(function (tab) {
      if (typeof tab.id !== "number") {
        return;
      }
      chrome.tabs.sendMessage(tab.id, payload, function () {
        void chrome.runtime.lastError;
      });
    });
  });
}

function readyBody(local, session, showPurpose, showInterrupt) {
  var body = {
    ok: true,
    showPurpose: showPurpose,
    showInterrupt: showInterrupt
  };
  if (showPurpose && local) {
    body.purposes = copyList(local.purposes);
  }
  if (showInterrupt && local) {
    body.interruptOptions = copyList(local.interruptOptions || []);
    body.purposeContrast = contrastFor(local, session);
  }
  return body;
}

function removeTab(tabId) {
  return new Promise(function (resolve, reject) {
    chrome.tabs.remove(tabId, function () {
      var error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
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
      var interrupt = ensureInterrupt(session);
      var showPurpose = site.isHome(url) || !session.roundActive || Object.prototype.hasOwnProperty.call(pending, key);
      var showInterrupt = Boolean(interrupt.active);
      var timerStopped = false;
      var changed = false;
      if (showPurpose) {
        session.roundActive = true;
        if (!Object.prototype.hasOwnProperty.call(pending, key)) {
          changed = true;
        }
        pending[key] = true;
        if (ensureTimer(session).mode === "running") {
          idleTimerFields(session);
          timerStopped = true;
          changed = true;
        }
      }
      if (showInterrupt && !Object.prototype.hasOwnProperty.call(interrupt.pending, key)) {
        interrupt.pending[key] = true;
        changed = true;
      }
      if (!showPurpose && !showInterrupt) {
        return { ok: true, showPurpose: false, showInterrupt: false };
      }
      return OP.ensureLocalState().then(function (local) {
        var saved = changed ? OP.writeSession(session) : Promise.resolve();
        return saved.then(function () {
          if (timerStopped) {
            return clearTimerAlarm();
          }
          return null;
        }).then(function () {
          return readyBody(local, session, showPurpose, showInterrupt);
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

function saveOptions(next) {
  var options = copyList(next.interruptOptions);
  var purposes = copyList(next.purposes || []);
  return OP.writeLocal(next).then(function () {
    return notifyListsChanged(purposes, options).then(function () {
      return { ok: true, interruptOptions: options };
    });
  });
}

function settingsFrom(local) {
  return {
    firstIntervalMinutes: local.settings.firstIntervalMinutes,
    againIntervalMinutes: local.settings.againIntervalMinutes
  };
}

OP.handleSettingsSet = function (message) {
  return enqueue(function () {
    var hasFirst = Boolean(message) && Object.prototype.hasOwnProperty.call(message, "firstIntervalMinutes");
    var hasAgain = Boolean(message) && Object.prototype.hasOwnProperty.call(message, "againIntervalMinutes");
    if (hasFirst === hasAgain) {
      return fail();
    }
    var check = OP.parseMinutes(hasFirst ? message.firstIntervalMinutes : message.againIntervalMinutes);
    if (!check.ok) {
      return fail(check.error);
    }
    return OP.ensureLocalState().then(function (local) {
      var next = cloneState(local);
      if (!next.settings || typeof next.settings !== "object") {
        return fail();
      }
      if (hasFirst) {
        next.settings.firstIntervalMinutes = check.minutes;
      } else {
        next.settings.againIntervalMinutes = check.minutes;
      }
      return OP.writeLocal(next).then(function () {
        return loadSession().then(function (session) {
          var kind = hasFirst ? "first" : "again";
          var timer = ensureTimer(session);
          if (timer.mode !== "running" || timer.intervalKind !== kind || typeof timer.startedAt !== "number") {
            return { ok: true, settings: settingsFrom(next) };
          }
          var due = dueAt(timer.startedAt, check.minutes);
          if (due > Date.now()) {
            return setTimerAlarm(due).then(function () {
              return { ok: true, settings: settingsFrom(next) };
            });
          }
          return queryTabs().then(function (tabs) {
            var open = bilibiliTabs(tabs);
            if (!open.length) {
              return clearRound().then(function () {
                return { ok: true, settings: settingsFrom(next) };
              });
            }
            return startInterruptRound(session, next, open, "timer").then(function () {
              return { ok: true, settings: settingsFrom(next) };
            });
          });
        });
      });
    });
  }).catch(function () {
    return fail();
  });
};

OP.handleOptionAdd = function (message) {
  return enqueue(function () {
    var check = OP.normalizeName(message && message.name);
    if (!check.ok) {
      return fail(check.error);
    }
    return OP.ensureLocalState().then(function (local) {
      var next = cloneState(local);
      if (!Array.isArray(next.interruptOptions)) {
        return fail();
      }
      next.interruptOptions.push({
        id: crypto.randomUUID(),
        name: check.name,
        order: nextOrder(next.interruptOptions),
        locked: false,
        closesTab: false
      });
      return saveOptions(next);
    });
  }).catch(function () {
    return fail();
  });
};

OP.handleOptionUpdate = function (message) {
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
      var option = findOption(next.interruptOptions, id);
      if (!option || option.locked) {
        return fail();
      }
      option.name = check.name;
      return saveOptions(next);
    });
  }).catch(function () {
    return fail();
  });
};

OP.handleOptionDelete = function (message) {
  return enqueue(function () {
    var id = message && typeof message.id === "string" ? message.id : "";
    if (!id) {
      return fail();
    }
    return OP.ensureLocalState().then(function (local) {
      var next = cloneState(local);
      var option = findOption(next.interruptOptions, id);
      if (!option || option.locked) {
        return fail();
      }
      next.interruptOptions = next.interruptOptions.filter(function (item) {
        return item.id !== option.id;
      });
      return saveOptions(next);
    });
  }).catch(function () {
    return fail();
  });
};

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

function sessionHasRound(session) {
  if (!session) {
    return false;
  }
  if (session.roundActive || session.purposeAnswered || session.latestPurposeRecordId) {
    return true;
  }
  if (session.timer && session.timer.mode === "running") {
    return true;
  }
  if (session.interrupt && (session.interrupt.active || !mapEmpty(session.interrupt.pending))) {
    return true;
  }
  return !mapEmpty(session.purposePending);
}

function dropClosedTab(session, tabId) {
  if (!session) {
    return null;
  }
  var next = cloneState(session);
  var key = String(tabId);
  var purpose = ensurePendingMap(next);
  var interrupt = ensureInterrupt(next);
  var hadPurpose = Object.prototype.hasOwnProperty.call(purpose, key);
  var hadInterrupt = Object.prototype.hasOwnProperty.call(interrupt.pending, key);
  if (!hadPurpose && !hadInterrupt) {
    return null;
  }
  if (hadPurpose) {
    delete purpose[key];
  }
  if (hadInterrupt) {
    delete interrupt.pending[key];
  }
  return OP.writeSession(next);
}

OP.handleTabRemoved = function (tabId) {
  return enqueue(function () {
    return OP.readSession().then(function (session) {
      return queryTabs().then(function (tabs) {
        var open = bilibiliTabs(tabs);
        if (!open.length) {
          return clearTimerAlarm().then(function () {
            if (!sessionHasRound(session)) {
              return null;
            }
            return OP.writeSession(OP.createEmptySessionState());
          });
        }
        if (!session) {
          return null;
        }
        var next = cloneState(session);
        var key = String(tabId);
        var purpose = ensurePendingMap(next);
        var interrupt = ensureInterrupt(next);
        var hadPurpose = Object.prototype.hasOwnProperty.call(purpose, key);
        var hadInterrupt = Object.prototype.hasOwnProperty.call(interrupt.pending, key);
        if (hadPurpose) {
          delete purpose[key];
        }
        if (hadInterrupt) {
          delete interrupt.pending[key];
        }
        if (interrupt.active && mapEmpty(interrupt.pending)) {
          return OP.ensureLocalState().then(function (local) {
            var plan = armTimer(next, local, "again");
            return OP.writeSession(next).then(function () {
              return setTimerAlarm(plan.when);
            });
          });
        }
        if (hadPurpose && mapEmpty(purpose) && next.purposeAnswered && !interrupt.active && ensureTimer(next).mode !== "running") {
          return OP.ensureLocalState().then(function (local) {
            var plan = armTimer(next, local, "first");
            return OP.writeSession(next).then(function () {
              return setTimerAlarm(plan.when);
            });
          });
        }
        if (!hadPurpose && !hadInterrupt) {
          return null;
        }
        return OP.writeSession(next);
      }).catch(function () {
        return dropClosedTab(session, tabId);
      });
    });
  }).catch(function () {
    return null;
  });
};

function findRecordSlot(local, session, tabId) {
  var interrupt = ensureInterrupt(session);
  if (!interrupt.active || !Object.prototype.hasOwnProperty.call(interrupt.pending, String(tabId))) {
    return null;
  }
  return interrupt;
}

OP.handleInterruptCommit = function (message, sender) {
  return enqueue(function () {
    var tabId = tabIdFrom(sender);
    var optionId = message && typeof message.optionId === "string" ? message.optionId : "";
    var note = message && typeof message.note === "string" ? message.note : "";
    if (tabId === null || !optionId) {
      return fail();
    }
    return OP.ensureLocalState().then(function (local) {
      var next = cloneState(local);
      var option = findOption(next.interruptOptions, optionId);
      if (!option || option.closesTab || !Array.isArray(next.records)) {
        return fail();
      }
      return loadSession().then(function (session) {
        if (!findRecordSlot(local, session, tabId)) {
          return fail();
        }
        var record = {
          id: crypto.randomUUID(),
          at: Date.now(),
          source: "interrupt",
          kind: "option",
          purposeId: null,
          optionId: option.id,
          optionName: option.name,
          note: note
        };
        next.records.push(record);
        return OP.writeLocal(next).then(function () {
          delete ensureInterrupt(session).pending[String(tabId)];
          var pendingLeft = !mapEmpty(session.interrupt.pending);
          var saved = pendingLeft ? writeSessionOrRollback(next, session, record) : queryTabs().then(function (tabs) {
            if (!bilibiliTabs(tabs).length) {
              return clearRound().catch(function () {
                return rollbackRecord(next, record);
              });
            }
            var plan = armTimer(session, next, "again");
            return writeSessionOrRollback(next, session, record).then(function () {
              return setTimerAlarm(plan.when);
            });
          });
          return saved.then(function () {
            return { ok: true, recordId: record.id };
          });
        });
      });
    });
  }).catch(function () {
    return fail();
  });
};

OP.handleInterruptDismiss = function (message, sender) {
  return enqueue(function () {
    if (tabIdFrom(sender) === null) {
      return fail();
    }
    return { ok: true };
  });
};

OP.handleInterruptCloseTab = function (message, sender) {
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
        if (!findRecordSlot(local, session, tabId)) {
          return fail();
        }
        var record = {
          id: crypto.randomUUID(),
          at: Date.now(),
          source: "interrupt",
          kind: "close-tab",
          purposeId: null,
          optionId: null,
          optionName: "",
          note: ""
        };
        next.records.push(record);
        return OP.writeLocal(next).then(function () {
          return removeTab(tabId).catch(function () {
            return rollbackRecord(next, record);
          });
        }).then(function () {
          return { ok: true, recordId: record.id };
        });
      });
    });
  }).catch(function () {
    return fail();
  });
};

OP.handleTimerAlarm = function (alarm) {
  if (!alarm || alarm.name !== OP.ALARM_TIMER) {
    return Promise.resolve();
  }
  return enqueue(function () {
    return loadSession().then(function (session) {
      var timer = ensureTimer(session);
      if (timer.mode !== "running" || typeof timer.startedAt !== "number") {
        return clearTimerAlarm();
      }
      return OP.ensureLocalState().then(function (local) {
        var minutes = intervalMinutes(local, timer.intervalKind);
        if (typeof minutes !== "number") {
          return clearTimerAlarm();
        }
        var due = dueAt(timer.startedAt, minutes);
        if (due > Date.now() + 250) {
          return setTimerAlarm(due);
        }
        return queryTabs().then(function (tabs) {
          var open = bilibiliTabs(tabs);
          if (!open.length) {
            return clearRound();
          }
          return startInterruptRound(session, local, open, "timer");
        });
      });
    });
  }).catch(function () {
    return null;
  });
};

OP.reconcileTimer = function () {
  return enqueue(function () {
    return OP.readSession().then(function (stored) {
      if (!stored || !stored.timer || stored.timer.mode !== "running" || typeof stored.timer.startedAt !== "number") {
        return clearTimerAlarm();
      }
      return OP.ensureLocalState().then(function (local) {
        var minutes = intervalMinutes(local, stored.timer.intervalKind);
        if (typeof minutes !== "number") {
          return clearTimerAlarm();
        }
        var due = dueAt(stored.timer.startedAt, minutes);
        if (due > Date.now()) {
          return setTimerAlarm(due);
        }
        var session = cloneState(stored);
        return queryTabs().then(function (tabs) {
          var open = bilibiliTabs(tabs);
          if (!open.length) {
            return clearRound();
          }
          return startInterruptRound(session, local, open, "timer");
        });
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
handlers[OP.MESSAGE.settingsSet] = function (message) {
  return OP.handleSettingsSet(message);
};
handlers[OP.MESSAGE.optionAdd] = function (message) {
  return OP.handleOptionAdd(message);
};
handlers[OP.MESSAGE.optionUpdate] = function (message) {
  return OP.handleOptionUpdate(message);
};
handlers[OP.MESSAGE.optionDelete] = function (message) {
  return OP.handleOptionDelete(message);
};
handlers[OP.MESSAGE.interruptCommit] = function (message, sender) {
  return OP.handleInterruptCommit(message, sender);
};
handlers[OP.MESSAGE.interruptDismiss] = function (message, sender) {
  return OP.handleInterruptDismiss(message, sender);
};
handlers[OP.MESSAGE.interruptCloseTab] = function (message, sender) {
  return OP.handleInterruptCloseTab(message, sender);
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
