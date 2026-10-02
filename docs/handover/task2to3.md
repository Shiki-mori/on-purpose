# 交接：任务 2 已完成，从任务 3 做起

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-03 |
| 当前进度 | 任务 2 已完成。下一轮只做任务 3 |
| 代码 | `main`，提交 `9a55bcf` |
| 依据 | [编码任务书](../assignment/assignment-book.md) 第 7 节和第 13 节 |

新对话从任务 3 开始。不要重做任务 2，也不要提前做任务 4 及以后。

## 1. 先读什么

1. 本文。
2. `docs/assignment/assignment-book.md` 第 7 节（任务 3 的行为和验收）和第 3、4 节（全程约束与已经定下的名字）。
3. `.cursor/skills/implement-extension-task/SKILL.md`。共享名字在同目录的 `reference.md`。
4. 系统设计第 6.2 节的显示表，以及第 4.2、8 节里和会话、`content-ready` 有关的部分。软导航见设计 D-1。

行为以需求说明书 0.2 和系统设计说明书 0.2 为准。任务范围以任务书为准。

## 2. 任务 2 已经有的东西

`extension/` 可以在 Chrome 里加载。清单已有内容脚本和 `web_accessible_resources`（`src/shared/theme.css`，只对哔哩哔哩网址开放）。内容脚本顺序是 `constants.js`、`sites/bilibili.js`、`sites/index.js`、`content/ui.js`、`content/content-script.js`。`run_at` 为 `document_start`，`all_frames` 为 false。

已经接上的消息：`popup-get`、`content-ready`、`purpose-add`、`purpose-commit`、`purpose-skip`、`purpose-update`、`purpose-delete`、`lists-changed`。更晚的消息还没有处理函数。

主页询问、记录和弹出页编辑已经可用：

- 内容脚本注入时发送一次 `content-ready`，带上 `location.href`。不监听 `popstate`、`hashchange` 或站内换址。是否显示只看服务工作线程回复里的 `showPurpose`。为真时用现有的 Shadow DOM 询问窗口，回复里带按 `order` 排好的目的列表。
- `OP.handleContentReady` 里主页分支保持不变：`findSite` 有结果且 `isHome` 为真时显示，把 `purposePending[String(tabId)]` 设为 true，并把 `roundActive` 设为 true。非主页现在直接回复 `showPurpose: false`，不写会话。这一支在 `runtime.js` 里有注释，任务 3 改这里。
- 确认写入 `kind` 为 `purpose` 的记录，跳过写入 `kind` 为 `skip`。两者都会把该标签页移出 `purposePending`，把 `purposeAnswered` 设为 true，并把 `latestPurposeRecordId` 指到这条记录。不设 `timer-due`，不计时。
- 弹出页能看记录（新的在前，时间到秒），目的可以改名、删除。删除前问「删除这个目的？」，名称写入 `purposeSnapshots`。改名或删除成功后向已打开的哔哩哔哩标签页发送 `lists-changed`。间隔和打断选项仍然只展示。
- `chrome.tabs.onRemoved` 在 `service-worker.js`，处理函数是 `OP.handleTabRemoved`。标签页 id 在 `purposePending` 里时才处理：不写记录，移出 `purposePending`。当时若已经没有哔哩哔哩标签页，会话写成 `OP.createEmptySessionState()`。关掉的标签页不在 `purposePending` 里时，函数直接返回，即使它是最后一个哔哩哔哩标签页也不清会话。

验收是在本机临时下载的 Chrome for Testing 154 里做的，用户数据目录是临时的。本机已安装的 Google Chrome 150 会忽略命令行 `--load-extension`。使用者自己查看时，在 `chrome://extensions` 打开开发者模式，加载仓库里的 `extension/`。

## 3. 任务 3 要做的事

把设计第 6.2 节的显示表做全。主页那一行已经有了，保持不变。补上的是非主页：

| 情况 | 是否显示 |
| --- | --- |
| 非主页加载时 `roundActive` 为 false | 显示，并设为 true |
| 非主页加载时该标签页仍在 `purposePending` | 显示 |
| 非主页加载时这一轮已经开始，且该页不在 `purposePending` | 不显示 |

非主页要显示时，同样把该标签页放进 `purposePending`。内容脚本已经会按 `showPurpose` 画出任务 2 的询问窗口，一般不用另做一套界面。

标签页关闭要补全任务书第 7 节这一条：只关掉一部分哔哩哔哩标签页时，保留 `roundActive`、`purposeAnswered` 和其余 `purposePending`。最后一个哔哩哔哩标签页关闭后，会话写成空状态，Chrome 仍在系统后台运行时也清。现在只有「关掉的页还在 `purposePending` 里」才会清。已经回答过的最后一页被关掉时，会话还留着 `roundActive: true`，下一轮打开非主页会被误判成「这一轮已经开始」。判断网址只用 `findSite`、`isHome`。刷新不是标签页关闭。

多个主页同时挂着未完成询问、各自写记录、未回答就关掉不写记录，这些任务 2 已经有了，保持不变。

验收表是任务书第 7 节：AC-29、AC-9 的询问部分、AC-31、AC-30、AC-32（非主页）、设计 D-1，以及关掉全部标签页后再打开非主页会再次询问。在使用者自己的 Chrome 里对照。Cursor 内置浏览器加载不了这个扩展。每一行都对照过，再把任务书第 13 节的任务 3 改为已完成。

## 4. 任务 3 不要做的事

- 计时从零开始，不设 `timer-due`。验收里「计时不重置」留到任务 5。
- 暂时关闭期间仍要询问。那是任务 6，本项没有暂时关闭。
- 闹钟、时长打断、暂停播放、暂时关闭按钮。
- 间隔和打断选项的编辑。
- 给内容脚本或弹出页接上 `chrome.storage`，或载入 `storage.js`。
- 监听软导航。地址变了但文档没有重新加载时，不重新判断，已经打开的询问留在当前文档上。
- ES Module、打包工具、网络请求。`.cursor/hooks.json` 会拦住这些写入。

详细行为以任务书第 7 节和设计第 6.2 节为准，不要在交接里另定一套。
