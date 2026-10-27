const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function load() {
  const context = vm.createContext({});
  for (const file of ["shared/constants.js", "shared/storage.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../extension/src", file), "utf8"), context);
  }
  return context;
}

const plain = value => JSON.parse(JSON.stringify(value));
const sorted = items => items.slice().sort((a, b) => a.order - b.order);
const names = items => sorted(items).map(item => item.name);
const newPurposeIds = ["purpose-seed-11", "purpose-seed-12", "purpose-seed-13"];
const newOptionIds = ["interrupt-seed-6", "interrupt-seed-7", "interrupt-seed-8", "interrupt-seed-9"];

function previousState(OP) {
  const state = plain(OP.createInitialLocalState());
  state.schemaVersion = 5;
  state.purposes = state.purposes.filter(item => !newPurposeIds.includes(item.id));
  state.purposes.forEach((item, index) => { item.order = index + 1; });
  state.interruptOptions = state.interruptOptions.filter(item => !newOptionIds.includes(item.id));
  state.settings = { firstIntervalMinutes: 5, againIntervalMinutes: 17 };
  state.snooze = { until: 1900000000000 };
  state.snoozeButton = { xRatio: 0.2, yRatio: 0.7 };
  state.records = [{ id: "old-record", kind: "purpose", purposeId: "deleted", note: "保留备注" }];
  state.purposeSnapshots = { deleted: "删除前的目的" };
  return state;
}

test("新安装包含十三个目的、十二个打断项，固定 id 和锁定规则保持有效", () => {
  const { OP } = load();
  const state = plain(OP.createInitialLocalState());
  assert.equal(state.schemaVersion, 6);
  assert.deepEqual(names(state.purposes), ["学习", "游戏攻略", "追番", "健身", "生活经验", "关注更新", "其他", "无意识打开", "网络测试", "游戏资讯", "娱乐", "技术", "科普"]);
  assert.deepEqual(names(state.interruptOptions), ["目的", "其他", "关闭当前标签页", "节奏对立视频", "意义不明的短视频", "游戏短视频", "搞笑视频", "看评论区", "电影解说", "技术", "鸡汤", "家访"]);
  assert.deepEqual(state.interruptOptions.filter(item => item.locked).map(item => item.id), ["interrupt-purpose", "interrupt-other", "interrupt-close-tab"]);
  assert.deepEqual(state.interruptOptions.filter(item => item.closesTab).map(item => item.id), ["interrupt-close-tab"]);
  for (const items of [state.purposes, state.interruptOptions]) {
    assert.equal(new Set(items.map(item => item.id)).size, items.length);
  }
});

test("版本 5 升级保留用户数据、原有项相对顺序及旧记录引用，不修改输入对象", () => {
  const { OP } = load();
  const before = previousState(OP);
  before.purposes[0].name = "我的学习";
  before.purposes.push({ id: "custom-purpose", name: "自定义目的", order: 40 });
  before.interruptOptions.push({ id: "custom-option", name: "自定义回答", order: 50, locked: false, closesTab: false });
  const copy = plain(before);
  const { state, changed } = plain(OP.migrateLocalState(before));
  assert.equal(changed, true);
  assert.deepEqual(before, copy);
  assert.equal(state.schemaVersion, 6);
  for (const key of ["settings", "snooze", "snoozeButton", "records", "purposeSnapshots"]) {
    assert.deepEqual(state[key], before[key]);
  }
  assert.deepEqual(sorted(state.purposes).filter(item => !newPurposeIds.includes(item.id)).map(item => item.id), sorted(before.purposes).map(item => item.id));
  assert.deepEqual(state.interruptOptions.slice(0, before.interruptOptions.length), before.interruptOptions);
  assert.equal(state.purposes.find(item => item.id === "purpose-seed-1").name, "我的学习");
  const list = names(state.purposes);
  assert.equal(list.indexOf("网络测试"), list.indexOf("无意识打开") + 1);
  assert.equal(OP.choiceLabel(state, state.records[0]), "删除前的目的");
});

test("按列表分别去重：已有同名自定义项和改名种子均保留，不覆盖标志", () => {
  const { OP } = load();
  const before = previousState(OP);
  before.purposes.push({ id: "my-tech", name: "技术", order: 20 }, { id: "my-network", name: "网络测试", order: 21 });
  before.interruptOptions.push(
    { id: "interrupt-seed-6", name: "自定义电影名称", order: 30, locked: true, closesTab: false },
    { id: "my-soup", name: "鸡汤", order: 31, locked: false, closesTab: false }
  );
  const { state } = plain(OP.migrateLocalState(before));
  assert.equal(state.purposes.filter(item => item.name === "技术").length, 1);
  assert.equal(state.purposes.some(item => item.id === "purpose-seed-11"), false);
  assert.equal(state.purposes.some(item => item.id === "purpose-seed-13"), false);
  assert.equal(state.interruptOptions.filter(item => item.name === "技术").length, 1);
  assert.equal(state.interruptOptions.filter(item => item.name === "鸡汤").length, 1);
  assert.equal(state.interruptOptions.some(item => item.id === "interrupt-seed-8"), false);
  assert.deepEqual(state.interruptOptions.find(item => item.id === "interrupt-seed-6"), before.interruptOptions.find(item => item.id === "interrupt-seed-6"));
  const list = names(state.purposes);
  assert.equal(list.indexOf("网络测试"), list.indexOf("无意识打开") + 1);
});

test("锚点删除或改名时不恢复它；同名锚点选 order 最小的一项", () => {
  const { OP } = load();
  for (const renamed of [false, true]) {
    const before = previousState(OP);
    if (renamed) before.purposes.find(item => item.id === "purpose-seed-10").name = "自定义原目的";
    else before.purposes = before.purposes.filter(item => item.id !== "purpose-seed-10");
    const { state } = plain(OP.migrateLocalState(before));
    assert.equal(state.purposes.some(item => item.name === "无意识打开"), false);
    assert.equal(names(state.purposes).at(-1), "网络测试");
  }
  const before = previousState(OP);
  before.purposes.push({ id: "earlier-anchor", name: "无意识打开", order: -5 });
  const { state } = plain(OP.migrateLocalState(before));
  assert.equal(state.purposes.find(item => item.name === "网络测试").order, -4);
});

test("迁移仅执行一次，升级后删除或改名新项再重载不会重建或重排", () => {
  const { OP } = load();
  const { state } = plain(OP.migrateLocalState(previousState(OP)));
  state.purposes = state.purposes.filter(item => item.id !== "purpose-seed-13");
  state.purposes.find(item => item.id === "purpose-seed-11").name = "工程技术";
  state.interruptOptions = state.interruptOptions.filter(item => item.id !== "interrupt-seed-9");
  const again = plain(OP.migrateLocalState(state));
  assert.equal(again.changed, false);
  assert.deepEqual(again.state, state);
});

test("旧版本 1 至 4 仍串行迁移到 6，默认间隔只在版本 2 的历史阶段修改", () => {
  const { OP } = load();
  for (const version of [1, 2, 3, 4]) {
    const before = previousState(OP);
    before.schemaVersion = version;
    if (version < 4) before.purposes = before.purposes.filter(item => item.id !== "purpose-seed-10");
    before.interruptOptions = before.interruptOptions.filter(item => !/^interrupt-seed-/.test(item.id));
    const { state } = plain(OP.migrateLocalState(before));
    assert.equal(state.schemaVersion, 6);
    assert.equal(state.interruptOptions.length, 12);
    assert.equal(state.settings.firstIntervalMinutes, version < 2 ? 3 : 5);
    assert.equal(state.settings.againIntervalMinutes, 17);
    assert.deepEqual(state.records, before.records);
    const list = names(state.purposes);
    assert.equal(list.indexOf("网络测试"), list.indexOf("无意识打开") + 1);
  }
});

test("存储写入失败后能重试；并发初始化只执行一次读写", async () => {
  const { OP } = load();
  const before = previousState(OP);
  let reads = 0;
  let writes = 0;
  let stored = before;
  OP.readLocal = async () => { reads += 1; return stored; };
  OP.writeLocal = async state => {
    writes += 1;
    if (writes === 1) throw new Error("模拟配额错误");
    stored = plain(state);
    return state;
  };
  await assert.rejects(OP.ensureLocalState(), /模拟配额错误/);
  assert.equal(stored.schemaVersion, 5);
  const results = await Promise.all([OP.ensureLocalState(), OP.ensureLocalState()]);
  assert.equal(reads, 2);
  assert.equal(writes, 2);
  assert.equal(results[0].schemaVersion, 6);
  assert.deepEqual(plain(results[0]), plain(results[1]));
  await OP.ensureLocalState();
  assert.equal(writes, 2);
});

test("娱乐始终在新增目的之后，重名项按 order，改名后恢复顺序且不改输入", () => {
  const { OP } = load();
  const purposes = [
    { id: "entertainment-later", name: "娱乐", order: 2 },
    { id: "new-purpose", name: "后来新增", order: 100 },
    { id: "entertainment-first", name: "娱乐", order: 1 },
    { id: "tech", name: "技术", order: 3 }
  ];
  const before = plain(purposes);
  assert.deepEqual(plain(OP.sortPurposes(purposes)).map(item => item.id), ["tech", "new-purpose", "entertainment-first", "entertainment-later"]);
  assert.deepEqual(purposes, before);
  purposes[2].name = "已改名";
  assert.deepEqual(plain(OP.sortPurposes(purposes)).map(item => item.id), ["entertainment-first", "tech", "new-purpose", "entertainment-later"]);
});

test("询问渲染保留三个置顶项，娱乐末尾规则不影响打断列表", () => {
  const context = load();
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../extension/src/content/ui.js"), "utf8"), context);
  const lists = {};
  context.shadow = { querySelector: selector => ({ selector, replaceChildren() {} }) };
  context.renderPurposeItems = (list, items) => { lists[list.selector] = plain(items); };
  context.view.purposes = plain(context.OP.createInitialLocalState().purposes);
  context.view.purposes.push({ id: "late", name: "后来新增", order: 100 });
  const before = plain(context.view.purposes);
  context.renderList();
  assert.deepEqual(lists[".purposes-pin"].map(item => item.name), ["其他", "无意识打开", "网络测试"]);
  assert.equal(lists[".purposes-rest"].at(-1).name, "娱乐");
  assert.equal(lists[".purposes-rest"].at(-2).name, "后来新增");
  assert.deepEqual(plain(context.view.purposes), before);
  const interruptItems = [
    { id: "entertainment-option", name: "娱乐", order: 1 },
    { id: "other-option", name: "技术", order: 2 }
  ];
  assert.deepEqual(plain(context.splitPinned(interruptItems, ["目的", "其他"]).rest), interruptItems);
});
