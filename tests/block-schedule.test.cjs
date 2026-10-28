const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { randomUUID } = require("node:crypto");
const plain = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const popupUrl = "chrome-extension://test/src/popup/popup.html";

function setup(time = "2026-10-28T02:00:00+08:00") {
  const state = { now: Date.parse(time), rules: [], alarms: {}, updates: [], writes: 0, tabs: [], notifications: [] };
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [state.now])); }
    static now() { return state.now; }
  }
  let listener;
  let context;
  function reply(callback, value, error) {
    context.chrome.runtime.lastError = error ? { message: error } : null;
    callback(plain(value));
    context.chrome.runtime.lastError = null;
  }
  function area(key) {
    return {
      get(name, callback) { reply(callback, state[key] ? { [name]: state[key] } : {}); },
      set(payload, callback) {
        if (state.writeFails && key === "local") return reply(callback, undefined, "write failed");
        state[key] = plain(Object.values(payload)[0]);
        state.writes++;
        reply(callback);
      }
    };
  }
  context = vm.createContext({ URL, Date: Clock, crypto: { randomUUID }, console: { warn() {} }, chrome: {
    runtime: {
      lastError: null,
      getURL: file => "chrome-extension://test/" + file,
      onMessage: { addListener(fn) { listener = fn; } },
      sendMessage(message, callback) { state.notifications.push(message); reply(callback); }
    },
    storage: { local: area("local"), session: area("session") },
    declarativeNetRequest: {
      getDynamicRules(callback) { reply(callback, state.rules); },
      updateDynamicRules(change, callback) {
        if (state.ruleFails) return reply(callback, undefined, "rule failed");
        state.rules = state.rules.filter(rule => !change.removeRuleIds.includes(rule.id)).concat(plain(change.addRules));
        reply(callback);
      }
    },
    alarms: {
      get(name, callback) { reply(callback, state.alarms[name]); },
      create(name, options, callback) {
        state.alarms[name] = { ...plain(options), scheduledTime: options.when || state.now + 60000 };
        reply(callback);
      },
      clear(name, callback) { delete state.alarms[name]; reply(callback, true); }
    },
    tabs: {
      query(query, callback) { reply(callback, state.tabs); },
      get(id, callback) {
        const tab = state.tabs.find(tab => tab.id === id);
        reply(callback, tab, tab ? null : "No tab with id");
      },
      update(id, change, callback) {
        if (state.updateFails === id) return reply(callback, undefined, "update failed");
        const tab = state.tabs.find(tab => tab.id === id);
        Object.assign(tab, plain(change));
        delete tab.pendingUrl;
        state.updates.push({ id, ...plain(change) });
        reply(callback, tab);
      },
      sendMessage(id, message, callback) { reply(callback); }
    }
  } });
  for (const file of ["shared/constants.js", "shared/time.js", "shared/storage.js", "sites/bilibili.js", "sites/index.js", "background/runtime.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../extension/src", file), "utf8"), context);
  }
  state.OP = context.OP;
  state.local = plain(state.OP.createInitialLocalState());
  state.session = plain(state.OP.createEmptySessionState());
  state.send = (message, sender = { url: popupUrl }) => new Promise(resolve => listener(message, sender, resolve));
  state.at = time => { state.now = Date.parse(time); };
  return state;
}

test("北京时间区间含开始不含结束；跨午夜、关闭开关及下个边界", () => {
  const { OP } = setup();
  const schedule = { enabled: true, start: "02:00", end: "07:00" };
  for (const [time, active, next] of [
    ["2026-10-28T01:59:59.999+08:00", false, "2026-10-28T02:00:00+08:00"],
    ["2026-10-28T02:00:00+08:00", true, "2026-10-28T07:00:00+08:00"],
    ["2026-10-28T06:59:59.999+08:00", true, "2026-10-28T07:00:00+08:00"],
    ["2026-10-28T07:00:00+08:00", false, "2026-10-29T02:00:00+08:00"]
  ]) {
    const state = OP.blockScheduleState(schedule, Date.parse(time));
    assert.equal(state.active, active);
    assert.equal(state.nextBoundary, Date.parse(next));
  }
  for (const [time, active] of [["22:59:59", false], ["23:00:00", true], ["00:00:00", true], ["06:59:59", true], ["07:00:00", false]]) {
    assert.equal(OP.blockScheduleState({ ...schedule, start: "23:00" }, Date.parse(`2026-10-28T${time}+08:00`)).active, active);
  }
  const disabled = OP.blockScheduleState({ ...schedule, enabled: false });
  assert.equal(disabled.active, false);
  assert.equal(disabled.nextBoundary, null);
});

test("后台拒绝非法开关、空时间、相同起止和无效 HH:mm，且不写入", async () => {
  const s = setup();
  const before = plain(s.local);
  for (const schedule of [null, {}, { enabled: 1, start: "02:00", end: "07:00" },
    ...["", "2:00", "24:00", "12:60", "02:00:00", "02:00\n", "07:00"].map(start => ({ enabled: true, start, end: "07:00" }))]) {
    assert.equal((await s.OP.handleBlockSettingsSet({ blockSchedule: schedule })).ok, false);
  }
  assert.deepEqual(s.local, before);
  assert.equal(s.writes, 0);
});

test("版本 6 升级只补禁用设置，重载和重复迁移保留自定义值", () => {
  const { OP } = setup();
  const old = plain(OP.createInitialLocalState());
  old.schemaVersion = 6;
  delete old.settings.blockSchedule;
  old.settings.firstIntervalMinutes = 19;
  old.purposes.splice(2, 1);
  old.records.push({ id: "keep", note: "保留" });
  const before = plain(old);
  const migrated = plain(OP.migrateLocalState(old));
  assert.deepEqual(old, before);
  assert.deepEqual(migrated.state, { ...before, schemaVersion: 7, settings: { ...before.settings, blockSchedule: { enabled: true, start: "02:00", end: "07:00" } } });
  migrated.state.settings.blockSchedule = { enabled: false, start: "23:30", end: "08:15" };
  assert.deepEqual(plain(OP.migrateLocalState(migrated.state)), { state: migrated.state, changed: false });
});

test("禁用切换所有匹配页，保留其他站、待离站导航及本地数据，清空会话", async () => {
  const s = setup();
  s.tabs = [
    { id: 1, url: "https://www.bilibili.com/" },
    { id: 2, url: "https://live.bilibili.com/1" },
    { id: 3, url: "https://search.bilibili.com/all" },
    { id: 4, url: "https://bilibili.com/" },
    { id: 5, url: "https://www.bilibili.com/video/a", pendingUrl: "https://example.com/" },
    { id: 6, url: "https://notbilibili.com/" },
    { id: 7, url: "http://www.bilibili.com/" }
  ];
  s.session.roundActive = true;
  s.session.purposePending = { 1: true };
  s.session.interrupt = { active: true, pending: { 2: true }, reason: "timer" };
  s.local.records.push({ id: "old", note: "保留" });
  s.local.snooze.until = s.now + 100000;
  const before = plain(s.local);
  await s.OP.reconcileBlock();
  assert.deepEqual(s.updates.map(tab => tab.id), [1, 2, 3, 4]);
  assert.ok(s.updates.every(tab => tab.url === "chrome-extension://test/src/blocked/blocked.html"));
  assert.deepEqual(s.local, before);
  assert.deepEqual(s.session, plain(s.OP.createEmptySessionState()));
  assert.equal(s.rules[0].action.redirect.extensionPath, "/src/blocked/blocked.html");
  assert.deepEqual(s.rules[0].condition.resourceTypes, ["main_frame"]);
  const pattern = new RegExp(s.rules[0].condition.regexFilter, "i");
  for (const tab of s.tabs.slice(4)) assert.equal(pattern.test(tab.pendingUrl || tab.url), false);
  assert.equal(pattern.test("https://www.bilibili.com.evil.com/"), false);
  assert.equal(pattern.test("https://BILIBILI.com:443/video/a"), true);
  assert.equal(s.alarms[s.OP.ALARM_BLOCK_BOUNDARY].scheduledTime, Date.parse("2026-10-28T07:00:00+08:00"));
});

test("消息入口拦截目的、跳过、打断与暂停；不产生记录，不信任消息中的 tabId", async () => {
  const s = setup();
  const sender = { url: "https://www.bilibili.com/", tab: { id: 1, url: "https://www.bilibili.com/" } };
  for (const type of ["content-ready", "purpose-select", "purpose-commit", "purpose-skip", "interrupt-commit", "interrupt-close-tab", "snooze-set"]) {
    s.tabs = [{ id: 1, url: sender.url }, { id: 2, url: "https://example.com/" }];
    const response = await s.send({ type, url: sender.url, tabId: 2, minutes: 30 }, sender);
    assert.equal(response.blocked, true);
    assert.equal(response.showPurpose, false);
    assert.equal(s.tabs[1].url, "https://example.com/");
  }
  assert.equal(s.local.records.length, 0);
  assert.equal(s.local.snooze.until, null);
});

test("设置保存持久化并立即应用；规则不影响其他 id；结束/关闭清规则不返回原页", async () => {
  const s = setup("2026-10-28T12:00:00+08:00");
  const schedule = { enabled: true, start: "12:00", end: "13:00" };
  s.rules = [{ id: 900, condition: {}, action: { type: "block" } }];
  s.tabs = [{ id: 1, url: "https://www.bilibili.com/video/test" }];
  const response = await s.send({ type: "block-settings-set", blockSchedule: schedule });
  assert.equal(response.ok, true);
  assert.deepEqual(s.local.settings.blockSchedule, schedule);
  assert.equal(s.rules.length, 2);
  await s.OP.reconcileBlock();
  assert.equal(s.rules.length, 2);
  s.at("2026-10-28T13:00:00+08:00");
  assert.equal((await s.OP.handleBlockGet()).block.active, false);
  assert.deepEqual(s.rules.map(rule => rule.id), [900]);
  assert.equal(s.updates.length, 1);
  assert.equal((await s.OP.handleBlockSettingsSet({ blockSchedule: { ...schedule, enabled: false } })).ok, true);
  assert.deepEqual(s.alarms, {});
  assert.equal(s.tabs[0].url, "chrome-extension://test/src/blocked/blocked.html");
});

test("边界、跨午夜、错过整个时段和时钟调整按当前时间核对", async () => {
  const s = setup("2026-10-28T22:59:00+08:00");
  s.local.settings.blockSchedule = { enabled: true, start: "23:00", end: "07:00" };
  await s.OP.reconcileBlock();
  assert.equal(s.rules.length, 0);
  s.at("2026-10-28T23:00:00+08:00");
  await s.OP.reconcileBlock();
  assert.equal(s.rules.length, 1);
  s.at("2026-10-29T08:00:00+08:00");
  await s.OP.reconcileBlock();
  assert.equal(s.rules.length, 0);
  s.tabs = [{ id: 1, url: "https://www.bilibili.com/" }];
  s.at("2026-10-30T08:00:00+08:00");
  await s.OP.reconcileBlock();
  assert.equal(s.updates.length, 0);
  s.at("2026-10-30T04:00:00+08:00");
  await s.OP.reconcileBlock();
  assert.equal(s.updates.length, 1);
});

test("保存失败不改变设置；规则失败仍切换标签页，报告部分成功并可重试", async () => {
  const s = setup();
  const schedule = { enabled: true, start: "01:00", end: "08:00" };
  const before = plain(s.local);
  s.writeFails = true;
  assert.equal((await s.OP.handleBlockSettingsSet({ blockSchedule: schedule })).error, "没能保存，请再试一次");
  assert.deepEqual(s.local, before);
  assert.equal(s.rules.length, 0);
  s.writeFails = false;
  s.ruleFails = true;
  s.tabs = [{ id: 1, url: "https://www.bilibili.com/" }];
  const response = await s.OP.handleBlockSettingsSet({ blockSchedule: schedule });
  assert.equal(response.saved, true);
  assert.equal(response.ok, false);
  assert.equal(response.error, s.OP.COPY.blockApplyFailed);
  assert.equal(s.updates.length, 1);
  assert.deepEqual(s.local.settings.blockSchedule, schedule);
  s.ruleFails = false;
  await s.OP.reconcileBlock();
  assert.equal(s.rules.length, 1);
});

test("一个标签页切换失败不阻碍其他页，后续核对重试；非设置页不能改开关", async () => {
  const s = setup();
  s.tabs = [{ id: 1, url: "https://www.bilibili.com/" }, { id: 2, url: "https://live.bilibili.com/" }];
  s.updateFails = 1;
  const schedule = plain(s.local.settings.blockSchedule);
  assert.equal((await s.OP.handleBlockSettingsSet({ blockSchedule: schedule })).saved, true);
  assert.deepEqual(s.updates.map(tab => tab.id), [2]);
  s.updateFails = null;
  await s.OP.reconcileBlock();
  assert.deepEqual(s.updates.map(tab => tab.id), [2, 1]);
  const forged = await s.send({ type: "block-settings-set", blockSchedule: { ...schedule, enabled: false } }, { url: "https://example.com/" });
  assert.equal(forged.ok, false);
  assert.equal(s.local.settings.blockSchedule.enabled, true);
});
