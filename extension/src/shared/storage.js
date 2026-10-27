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
      { id: "purpose-seed-7", name: "其他", order: 7 },
      { id: "purpose-seed-10", name: "无意识打开", order: 8 },
      { id: "purpose-seed-13", name: "网络测试", order: 9 },
      { id: "purpose-seed-8", name: "游戏资讯", order: 10 },
      { id: "purpose-seed-9", name: "娱乐", order: 11 },
      { id: "purpose-seed-11", name: "技术", order: 12 },
      { id: "purpose-seed-12", name: "科普", order: 13 }
    ],
    interruptOptions: [
      { id: "interrupt-purpose", name: "目的", order: 1, locked: true, closesTab: false },
      { id: "interrupt-other", name: "其他", order: 2, locked: true, closesTab: false },
      { id: "interrupt-close-tab", name: "关闭当前标签页", order: 3, locked: true, closesTab: true },
      { id: "interrupt-seed-1", name: "节奏对立视频", order: 4, locked: false, closesTab: false },
      { id: "interrupt-seed-2", name: "意义不明的短视频", order: 5, locked: false, closesTab: false },
      { id: "interrupt-seed-3", name: "游戏短视频", order: 6, locked: false, closesTab: false },
      { id: "interrupt-seed-4", name: "搞笑视频", order: 7, locked: false, closesTab: false },
      { id: "interrupt-seed-5", name: "看评论区", order: 8, locked: false, closesTab: false },
      { id: "interrupt-seed-6", name: "电影解说", order: 9, locked: false, closesTab: false },
      { id: "interrupt-seed-7", name: "技术", order: 10, locked: false, closesTab: false },
      { id: "interrupt-seed-8", name: "鸡汤", order: 11, locked: false, closesTab: false },
      { id: "interrupt-seed-9", name: "家访", order: 12, locked: false, closesTab: false }
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

var PREVIOUS_DEFAULT_INTERVAL_MINUTES = 5;

function highestOrder(items) {
  var max = 0;
  items.forEach(function (item) {
    if (item && typeof item.order === "number" && item.order > max) {
      max = item.order;
    }
  });
  return max;
}

function lowestOrder(items) {
  var min = null;
  items.forEach(function (item) {
    if (item && typeof item.order === "number" && (min === null || item.order < min)) {
      min = item.order;
    }
  });
  return min === null ? 1 : min;
}

function findUnconsciousPurpose(purposes) {
  var byName = null;
  var index;
  for (index = 0; index < purposes.length; index += 1) {
    var item = purposes[index];
    if (!item) {
      continue;
    }
    if (item.id === "purpose-seed-10") {
      return item;
    }
    if (!byName && item.name === "无意识打开") {
      byName = item;
    }
  }
  return byName;
}

function findFirstByName(items, name) {
  var found = null;
  items.forEach(function (item) {
    if (!item || item.name !== name) {
      return;
    }
    if (!found || (item.order || 0) < (found.order || 0)) {
      found = item;
    }
  });
  return found;
}

function placeUnconsciousAfterOther(purposes) {
  var changed = false;
  var target = findUnconsciousPurpose(purposes);
  if (!target) {
    target = { id: "purpose-seed-10", name: "无意识打开", order: 0 };
    purposes.push(target);
    changed = true;
  }
  var others = purposes.filter(function (item) {
    return item !== target;
  });
  var anchor = findFirstByName(others, "其他");
  if (!anchor) {
    var end = highestOrder(others) + 1;
    if (target.order !== end) {
      target.order = end;
      changed = true;
    }
    return changed;
  }
  if (target.order === anchor.order + 1) {
    return changed;
  }
  var insertAt = anchor.order + 1;
  others.forEach(function (item) {
    if (typeof item.order === "number" && item.order >= insertAt) {
      item.order += 1;
    }
  });
  target.order = insertAt;
  return true;
}

function hasIdOrName(items, id, name) {
  return items.some(function (item) {
    return item && (item.id === id || item.name === name);
  });
}

function placeNetworkTestAfterUnconscious(purposes) {
  var target = purposes.find(function (item) {
    return item.id === "purpose-seed-13";
  }) || findFirstByName(purposes, "网络测试");
  var others = purposes.filter(function (item) {
    return item !== target;
  });
  var anchor = findFirstByName(others, "无意识打开");
  if (!anchor) {
    target.order = highestOrder(others) + 1;
    return;
  }
  var insertAt = anchor.order + 1;
  if (target.order === insertAt) {
    return;
  }
  others.forEach(function (item) {
    if (typeof item.order === "number" && item.order >= insertAt) {
      item.order += 1;
    }
  });
  target.order = insertAt;
}

OP.migrateLocalState = function (current) {
  var next = JSON.parse(JSON.stringify(current));
  var changed = false;
  var version = typeof next.schemaVersion === "number" ? next.schemaVersion : 1;
  if (version >= OP.SCHEMA_VERSION) {
    return { state: next, changed: false };
  }
  if (version < 2) {
    if (!Array.isArray(next.purposes)) {
      next.purposes = [];
      changed = true;
    }
    [
      { id: "purpose-seed-8", name: "游戏资讯" },
      { id: "purpose-seed-9", name: "娱乐" }
    ].forEach(function (seed) {
      if (hasIdOrName(next.purposes, seed.id, seed.name)) {
        return;
      }
      next.purposes.push({
        id: seed.id,
        name: seed.name,
        order: highestOrder(next.purposes) + 1
      });
      changed = true;
    });
    if (!Array.isArray(next.interruptOptions)) {
      next.interruptOptions = [];
      changed = true;
    }
    if (!hasIdOrName(next.interruptOptions, "interrupt-purpose", "目的")) {
      next.interruptOptions.push({
        id: "interrupt-purpose",
        name: "目的",
        order: lowestOrder(next.interruptOptions) - 1,
        locked: true,
        closesTab: false
      });
      changed = true;
    }
    if (!next.settings || typeof next.settings !== "object") {
      next.settings = {
        firstIntervalMinutes: OP.DEFAULT_INTERVAL_MINUTES,
        againIntervalMinutes: OP.DEFAULT_INTERVAL_MINUTES
      };
      changed = true;
    } else {
      if (next.settings.firstIntervalMinutes === PREVIOUS_DEFAULT_INTERVAL_MINUTES) {
        next.settings.firstIntervalMinutes = OP.DEFAULT_INTERVAL_MINUTES;
        changed = true;
      }
      if (next.settings.againIntervalMinutes === PREVIOUS_DEFAULT_INTERVAL_MINUTES) {
        next.settings.againIntervalMinutes = OP.DEFAULT_INTERVAL_MINUTES;
        changed = true;
      }
    }
    next.schemaVersion = 2;
    changed = true;
    version = 2;
  }
  if (version < 4) {
    if (!Array.isArray(next.purposes)) {
      next.purposes = [];
      changed = true;
    }
    if (placeUnconsciousAfterOther(next.purposes)) {
      changed = true;
    }
    next.schemaVersion = 4;
    changed = true;
    version = 4;
  }
  if (version < 5) {
    if (!Array.isArray(next.interruptOptions)) {
      next.interruptOptions = [];
      changed = true;
    }
    [
      { id: "interrupt-seed-1", name: "节奏对立视频" },
      { id: "interrupt-seed-2", name: "意义不明的短视频" },
      { id: "interrupt-seed-3", name: "游戏短视频" },
      { id: "interrupt-seed-4", name: "搞笑视频" },
      { id: "interrupt-seed-5", name: "看评论区" }
    ].forEach(function (seed) {
      if (hasIdOrName(next.interruptOptions, seed.id, seed.name)) {
        return;
      }
      next.interruptOptions.push({
        id: seed.id,
        name: seed.name,
        order: highestOrder(next.interruptOptions) + 1,
        locked: false,
        closesTab: false
      });
      changed = true;
    });
    next.schemaVersion = 5;
    changed = true;
    version = 5;
  }
  if (version < 6) {
    if (!Array.isArray(next.purposes)) {
      next.purposes = [];
    }
    if (!Array.isArray(next.interruptOptions)) {
      next.interruptOptions = [];
    }
    [
      { id: "purpose-seed-11", name: "技术" },
      { id: "purpose-seed-12", name: "科普" },
      { id: "purpose-seed-13", name: "网络测试" }
    ].forEach(function (seed) {
      if (!hasIdOrName(next.purposes, seed.id, seed.name)) {
        next.purposes.push({
          id: seed.id,
          name: seed.name,
          order: highestOrder(next.purposes) + 1
        });
      }
    });
    placeNetworkTestAfterUnconscious(next.purposes);
    [
      { id: "interrupt-seed-6", name: "电影解说" },
      { id: "interrupt-seed-7", name: "技术" },
      { id: "interrupt-seed-8", name: "鸡汤" },
      { id: "interrupt-seed-9", name: "家访" }
    ].forEach(function (seed) {
      if (!hasIdOrName(next.interruptOptions, seed.id, seed.name)) {
        next.interruptOptions.push({
          id: seed.id,
          name: seed.name,
          order: highestOrder(next.interruptOptions) + 1,
          locked: false,
          closesTab: false
        });
      }
    });
    next.schemaVersion = 6;
    changed = true;
  }
  return { state: next, changed: changed };
};

OP.ensureLocalState = function () {
  if (!ensurePromise) {
    ensurePromise = OP.readLocal().then(function (current) {
      if (!current) {
        var initial = OP.createInitialLocalState();
        return OP.writeLocal(initial).then(function () {
          return initial;
        });
      }
      var migrated = OP.migrateLocalState(current);
      if (!migrated.changed) {
        return current;
      }
      return OP.writeLocal(migrated.state).then(function () {
        return migrated.state;
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
      kind: record.kind,
      choice: OP.choiceLabel(local, record),
      note: record.note || ""
    };
  });
};
