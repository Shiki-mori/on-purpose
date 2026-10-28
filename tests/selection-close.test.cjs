const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");
const { test } = require("node:test");

const plain = value => JSON.parse(JSON.stringify(value));
const sender = { tab: { id: 10 } };

function setup(random = 0) {
  const state = { calls: [], removed: [], randomCalls: 0, tabs: [10, 20], alarms: {} };
  const math = Object.create(Math);
  math.random = () => { state.randomCalls++; return random; };
  const context = vm.createContext({
    URL,
    Math: math,
    crypto: { randomUUID },
    chrome: {
      runtime: { onMessage: { addListener() {} }, lastError: null },
      tabs: {
        remove(id, callback) {
          state.calls.push("remove");
          if (state.removeFails) context.chrome.runtime.lastError = { message: "remove failed" };
          else { state.removed.push(id); state.tabs = state.tabs.filter(tabId => tabId !== id); }
          callback();
          context.chrome.runtime.lastError = null;
        },
        query(query, callback) { callback(state.tabs.map(id => ({ id, url: "https://www.bilibili.com/" }))); },
        sendMessage(id, message, callback) { callback(); }
      },
      alarms: {
        create(name, options, callback) { state.alarms[name] = options; callback(); },
        clear(name, callback) { delete state.alarms[name]; callback(); }
      }
    }
  });
  for (const file of ["shared/constants.js", "shared/time.js", "shared/storage.js", "sites/bilibili.js", "sites/index.js", "background/runtime.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../extension/src", file), "utf8"), context);
  }
  const { OP } = context;
  state.local = plain(OP.createInitialLocalState());
  state.session = plain(OP.createEmptySessionState());
  state.session.roundActive = true;
  state.session.purposePending = { 10: true, 20: true };
  OP.ensureLocalState = async () => plain(state.local);
  OP.readSession = async () => plain(state.session);
  OP.writeLocal = async local => {
    state.calls.push("local");
    if (state.writeFails) throw Error("write failed");
    state.local = plain(local);
  };
  OP.writeSession = async session => { state.session = plain(session); };
  state.OP = OP;
  state.purpose = name => state.local.purposes.find(item => item.name === name).id;
  state.interrupt = name => {
    state.session.purposePending = {};
    state.session.purposeAnswered = true;
    state.local.records = name ? [{ id: "previous", source: "purpose", kind: name === "跳过" ? "skip" : "purpose", purposeId: name === "跳过" ? null : state.purpose(name), note: "原备注" }] : [];
    state.session.latestPurposeRecordId = name ? "previous" : null;
    state.session.interrupt = { active: true, reason: "timer", pending: { 10: true, 20: true } };
  };
  return state;
}

test("无意识打开点击即先保存后关闭发送页，忽略消息中的其他标签页 id", async () => {
  const s = setup(0.99);
  const result = await s.OP.handlePurposeSelect({ purposeId: s.purpose("无意识打开"), tabId: 20 }, sender);
  assert.equal(result.closed, true);
  assert.deepEqual(s.calls, ["local", "remove"]);
  assert.deepEqual(s.removed, [10]);
  assert.equal(s.randomCalls, 0);
  assert.equal(s.local.records[0].kind, "purpose");
  assert.equal(s.local.records[0].note, "");
  await s.OP.handleTabRemoved(10);
  assert.deepEqual(s.session.purposePending, { 20: true });
  assert.equal(s.session.timer.mode, "idle");
});

for (const random of [0, 0.599999, 0.6, 0.999999]) {
  test(`娱乐选择概率边界 ${random}，未关闭后的确认不重抽`, async () => {
    const s = setup(random);
    const purposeId = s.purpose("娱乐");
    const result = await s.OP.handlePurposeSelect({ purposeId }, sender);
    assert.equal(result.closed, random < 0.6);
    assert.equal(s.randomCalls, 1);
    assert.equal(s.local.records.length, random < 0.6 ? 1 : 0);
    if (random >= 0.6) {
      const commit = await s.OP.handlePurposeCommit({ purposeId, note: "保留备注" }, sender);
      assert.equal(commit.ok, true);
      assert.equal(s.local.records[0].note, "保留备注");
      assert.equal(s.session.latestPurposeRecordId, commit.recordId);
      assert.equal(s.randomCalls, 1);
      assert.deepEqual(s.removed, []);
    }
  });
  test(`娱乐对照中点击目的独立判定 ${random}，未命中仍可确认`, async () => {
    const s = setup(random);
    s.interrupt("娱乐");
    const result = await s.OP.handleInterruptSelect({ optionId: "interrupt-purpose" }, sender);
    assert.equal(result.closed, random < 0.6);
    assert.equal(s.randomCalls, 1);
    if (random < 0.6) {
      assert.equal(s.local.records.at(-1).kind, "option");
      assert.equal(s.local.records.at(-1).optionName, "目的");
      assert.equal(s.local.records.at(-1).note, "");
      assert.deepEqual(s.calls, ["local", "remove"]);
      await s.OP.handleTabRemoved(10);
      assert.deepEqual(s.session.interrupt.pending, { 20: true });
      assert.equal(s.session.interrupt.active, true);
    } else {
      assert.equal(s.local.records.length, 1);
      assert.equal((await s.OP.handleInterruptCommit({ optionId: "interrupt-purpose", note: "继续" }, sender)).ok, true);
      assert.equal(s.local.records.at(-1).note, "继续");
      assert.equal(s.randomCalls, 1);
    }
  });
}

test("普通目的、其他打断项、非娱乐／跳过／缺失对照不抽取或关闭", async () => {
  const s = setup();
  assert.equal((await s.OP.handlePurposeSelect({ purposeId: s.purpose("学习") }, sender)).closed, false);
  for (const name of ["学习", "跳过", null]) {
    s.interrupt(name);
    assert.equal((await s.OP.handleInterruptSelect({ optionId: "interrupt-purpose" }, sender)).closed, false);
  }
  s.interrupt("娱乐");
  assert.equal((await s.OP.handleInterruptSelect({ optionId: "interrupt-other" }, sender)).closed, false);
  assert.equal(s.randomCalls, 0);
  assert.deepEqual(s.removed, []);
});

test("按当前名称识别同名目的，改名种子不误关；打断使用当前全局最近目的", async () => {
  const s = setup();
  s.local.purposes.find(item => item.name === "无意识打开").name = "我的目的";
  assert.equal((await s.OP.handlePurposeSelect({ purposeId: s.purpose("我的目的") }, sender)).closed, false);
  s.local.purposes.push({ id: "custom", name: "无意识打开", order: 99 });
  assert.equal((await s.OP.handlePurposeSelect({ purposeId: "custom" }, sender)).closed, true);
  const t = setup();
  t.interrupt("娱乐");
  t.local.purposes.find(item => item.name === "娱乐").name = "已改名";
  assert.equal((await t.OP.handleInterruptSelect({ optionId: "interrupt-purpose" }, sender)).closed, false);
  assert.equal(t.randomCalls, 0);
});

for (const mode of ["purpose", "interrupt"]) {
  for (const failure of ["writeFails", "removeFails"]) {
    test(`${mode} 的 ${failure} 保留 pending 和已有记录，可重试`, async () => {
      const s = setup();
      if (mode === "interrupt") s.interrupt("娱乐");
      const before = plain(s.local.records);
      const session = plain(s.session);
      const select = () => mode === "purpose"
        ? s.OP.handlePurposeSelect({ purposeId: s.purpose("无意识打开") }, sender)
        : s.OP.handleInterruptSelect({ optionId: "interrupt-purpose" }, sender);
      s[failure] = true;
      assert.equal((await select()).error, "没能保存，请再试一次");
      assert.deepEqual(s.local.records, before);
      assert.deepEqual(s.session, session);
      assert.deepEqual(s.removed, []);
      if (failure === "writeFails") assert.deepEqual(s.calls, ["local"]);
      s[failure] = false;
      assert.equal((await select()).closed, true);
      assert.equal(s.local.records.length, before.length + 1);
    });
  }
  test(`${mode} 关闭最后一个匹配页清会话，仍有其他匹配页时正确继续计时`, async () => {
    for (const last of [false, true]) {
      const s = setup();
      s.session.purposeAnswered = true;
      s.session.purposePending = { 10: true };
      if (mode === "interrupt") {
        s.interrupt("娱乐");
        s.session.interrupt.pending = { 10: true };
      }
      if (last) s.tabs = [10];
      const result = mode === "purpose"
        ? await s.OP.handlePurposeSelect({ purposeId: s.purpose("无意识打开") }, sender)
        : await s.OP.handleInterruptSelect({ optionId: "interrupt-purpose" }, sender);
      assert.equal(result.closed, true);
      await s.OP.handleTabRemoved(10);
      if (last) assert.deepEqual(s.session, plain(s.OP.createEmptySessionState()));
      else {
        assert.equal(s.session.timer.mode, "running");
        assert.equal(s.session.timer.intervalKind, mode === "purpose" ? "first" : "again");
        assert.ok(s.alarms[s.OP.ALARM_TIMER]);
      }
    }
  });
}

test("缺少发送页、无 pending、无效选项不写入、不抽取、不关闭", async () => {
  const s = setup();
  const message = { purposeId: s.purpose("无意识打开") };
  assert.equal((await s.OP.handlePurposeSelect(message, {})).ok, false);
  s.session.purposePending = {};
  assert.equal((await s.OP.handlePurposeSelect(message, sender)).ok, false);
  assert.equal((await s.OP.handlePurposeSelect({ purposeId: "missing" }, sender)).ok, false);
  assert.equal((await s.OP.handleInterruptSelect({ optionId: "interrupt-purpose" }, sender)).ok, false);
  s.interrupt("娱乐");
  assert.equal((await s.OP.handleInterruptSelect({ optionId: "interrupt-close-tab" }, sender)).ok, false);
  assert.equal(s.randomCalls, 0);
  assert.deepEqual(s.calls, []);
});
