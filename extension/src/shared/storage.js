var OP = globalThis.OP || (globalThis.OP = {});

var ensurePromise = null;

function storageGet(area, key) {
  return new Promise(function (resolve, reject) {
    area.get(key, function (items) {
      var error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      if (!items || !Object.prototype.hasOwnProperty.call(items, key)) {
        resolve(null);
        return;
      }
      resolve(items[key]);
    });
  });
}

function storageSet(area, key, value) {
  return new Promise(function (resolve, reject) {
    var payload = {};
    payload[key] = value;
    area.set(payload, function () {
      var error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(value);
    });
  });
}

OP.createInitialLocalState = function () {
  return {
    schemaVersion: OP.SCHEMA_VERSION,
    purposes: [
      { id: "purpose-seed-1", name: "学习", order: 1 },
      { id: "purpose-seed-2", name: "游戏攻略", order: 2 },
      { id: "purpose-seed-3", name: "追番", order: 3 },
      { id: "purpose-seed-4", name: "健身", order: 4 },
      { id: "purpose-seed-5", name: "生活经验", order: 5 },
      { id: "purpose-seed-6", name: "关注更新", order: 6 },
      { id: "purpose-seed-7", name: "其他", order: 7 }
    ],
    interruptOptions: [
      { id: "interrupt-other", name: "其他", order: 1, locked: true, closesTab: false },
      { id: "interrupt-close-tab", name: "关闭当前标签页", order: 2, locked: true, closesTab: true }
    ],
    settings: {
      firstIntervalMinutes: OP.DEFAULT_INTERVAL_MINUTES,
      againIntervalMinutes: OP.DEFAULT_INTERVAL_MINUTES
    },
    snooze: { until: null },
    snoozeButton: { xRatio: null, yRatio: null },
    records: [],
    purposeSnapshots: {}
  };
};

OP.createEmptySessionState = function () {
  return {
    roundActive: false,
    timer: {
      mode: "idle",
      startedAt: null,
      intervalKind: null
    },
    purposePending: {},
    purposeAnswered: false,
    latestPurposeRecordId: null,
    interrupt: {
      active: false,
      reason: null,
      pending: {}
    }
  };
};

OP.readLocal = function () {
  return storageGet(chrome.storage.local, OP.LOCAL_KEY);
};

OP.writeLocal = function (state) {
  return storageSet(chrome.storage.local, OP.LOCAL_KEY, state);
};

OP.readSession = function () {
  return storageGet(chrome.storage.session, OP.SESSION_KEY);
};

OP.writeSession = function (state) {
  return storageSet(chrome.storage.session, OP.SESSION_KEY, state);
};

OP.ensureLocalState = function () {
  if (!ensurePromise) {
    ensurePromise = OP.readLocal().then(function (current) {
      if (current) {
        return current;
      }
      var initial = OP.createInitialLocalState();
      return OP.writeLocal(initial).then(function () {
        return initial;
      });
    }).finally(function () {
      ensurePromise = null;
    });
  }
  return ensurePromise;
};

OP.normalizeName = function (raw) {
  if (typeof raw !== "string") {
    return { ok: false, error: OP.COPY.emptyName };
  }
  var name = raw.trim();
  if (!name) {
    return { ok: false, error: OP.COPY.emptyName };
  }
  if (name.length > OP.NAME_LIMIT) {
    return { ok: false, error: OP.COPY.nameTooLong };
  }
  return { ok: true, name: name };
};

OP.parseMinutes = function (raw) {
  var text = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  if (!/^[0-9]+$/.test(text)) {
    return { ok: false, error: OP.COPY.invalidMinutes };
  }
  var minutes = Number(text);
  if (!Number.isSafeInteger(minutes) || minutes < 1) {
    return { ok: false, error: OP.COPY.invalidMinutes };
  }
  return { ok: true, minutes: minutes };
};

OP.choiceLabel = function (local, record) {
  if (!record) {
    return "";
  }
  if (record.kind === "skip") {
    return OP.COPY.skip;
  }
  if (record.kind === "option") {
    return record.optionName || "";
  }
  if (record.kind === "close-tab") {
    return OP.COPY.closeTab;
  }
  if (record.kind !== "purpose") {
    return "";
  }
  var purposes = local && Array.isArray(local.purposes) ? local.purposes : [];
  var index;
  for (index = 0; index < purposes.length; index += 1) {
    if (purposes[index].id === record.purposeId) {
      return purposes[index].name;
    }
  }
  var snapshots = local && local.purposeSnapshots ? local.purposeSnapshots : {};
  if (Object.prototype.hasOwnProperty.call(snapshots, record.purposeId)) {
    return snapshots[record.purposeId];
  }
  return "";
};

OP.purposeContrast = function (local, record) {
  var contrast = { name: OP.choiceLabel(local, record) };
  if (record && record.note) {
    contrast.note = record.note;
  }
  return contrast;
};

OP.presentRecords = function (local) {
  var records = local && Array.isArray(local.records) ? local.records : [];
  var decorated = records.map(function (record, index) {
    return { record: record, index: index };
  });
  decorated.sort(function (left, right) {
    var leftAt = left.record.at || 0;
    var rightAt = right.record.at || 0;
    if (leftAt !== rightAt) {
      return rightAt - leftAt;
    }
    return right.index - left.index;
  });
  return decorated.map(function (item) {
    var record = item.record;
    return {
      id: record.id,
      at: record.at,
      atText: OP.formatTime(record.at),
      source: record.source,
      sourceLabel: record.source === "interrupt" ? OP.COPY.sourceInterrupt : OP.COPY.sourcePurpose,
      choice: OP.choiceLabel(local, record),
      note: record.note || ""
    };
  });
};
