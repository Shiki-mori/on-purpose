# 交接：任务 1 已完成，从任务 2 做起

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-03 |
| 当前进度 | 任务 1 已完成。下一轮只做任务 2 |
| 代码 | `main`，提交 `5ac614c` |
| 依据 | [编码任务书](../assignment/assignment-book.md) 第 6 节和第 13 节 |

新对话从任务 2 开始。不要重做任务 1，也不要提前做任务 3 及以后。

## 1. 先读什么

1. 本文。
2. `docs/assignment/assignment-book.md` 第 6 节（任务 2 的行为和验收）和第 3、4 节（全程约束与已经定下的名字）。
3. `.cursor/skills/implement-extension-task/SKILL.md`。共享名字在同目录的 `reference.md`。
4. 系统设计第 6.1、6.2、7、8 节里和目的询问、弹出页、消息有关的部分。

行为以需求说明书 0.2 和系统设计说明书 0.2 为准。任务范围以任务书为准。

## 2. 任务 1 已经有的东西

`extension/` 可以在 Chrome 里加载，名字是「有目的」。清单还没有 `content_scripts` 和 `web_accessible_resources`。

已有文件：

- `manifest.json`、`icons/icon128.png`
- `src/shared/constants.js`、`theme.css`、`storage.js`、`time.js`
- `src/sites/bilibili.js`、`src/sites/index.js`
- `src/background/service-worker.js`、`runtime.js`
- `src/popup/popup.html`、`popup.js`、`popup.css`

已经接上的行为：

- 服务工作线程用 `importScripts` 按 constants、time、storage、bilibili、index、runtime 的顺序载入。启动时调用 `OP.ensureLocalState()`。已有 `localState` 时不重新播种。
- 只处理消息 `popup-get`。弹出页只读：七个初始目的、打断选项「其他」和「关闭当前标签页」、两个间隔都是 5、记录为空。宽 360 像素，高不超过 560 像素，深色背景、浅色文字。
- 消息 `type`、文案、种子 id、存储形状、站点函数都已按任务书第 4 节放在 `globalThis.OP` 上。后面的任务沿用这些名字。
- `OP.choiceLabel`、`OP.purposeContrast`、`OP.presentRecords`、`OP.createEmptySessionState`、`OP.readSession`、`OP.writeSession` 已实现。会话还没有被任务 1 写入。

验收是在本机临时下载的 Chrome for Testing 154 里做的，用户数据目录是临时的。本机已安装的 Google Chrome 150 会忽略命令行 `--load-extension`，所以那次没有用日常 Chrome 的配置。使用者自己查看时，在 `chrome://extensions` 打开开发者模式，加载仓库里的 `extension/`。

## 3. 任务 2 要做的事

打开哔哩哔哩主页时弹出目的询问。确认或跳过写入记录。弹出页能看记录，并能改名、删除目的。询问窗口里能添加目的。

新增 `src/content/ui.js`、`src/content/content-script.js`。清单补上内容脚本和 `web_accessible_resources`（`src/shared/theme.css`，只对哔哩哔哩网址开放）。内容脚本顺序必须是：

`constants.js`、`sites/bilibili.js`、`sites/index.js`、`content/ui.js`、`content/content-script.js`。

`run_at` 为 `document_start`，`all_frames` 为 false。

本项要接上的消息：`content-ready`、`purpose-add`、`purpose-commit`、`purpose-skip`、`purpose-update`、`purpose-delete`、`lists-changed`。显示规则只处理主页：`findSite` 有结果且 `isHome` 为真时显示询问，并把该标签页放进 `purposePending`，把 `roundActive` 设为 true。非主页先不显示。是否显示以服务工作线程的回复为准。

弹出页从只读改为设计第 7 节的记录和目的编辑。间隔和打断选项这一项仍然只展示，编辑留到任务 4。

验收表是任务书第 6 节的 AC-1 至 AC-7、AC-26、AC-32（主页）和 AC-42 的询问窗口与弹出页。在使用者自己的 Chrome 里对照。Cursor 内置浏览器加载不了这个扩展。每一行都对照过，再把任务书第 13 节的任务 2 改为已完成。

## 4. 任务 2 不要做的事

- 非主页的询问规则。那是任务 3。
- 闹钟、`timer-due`、时长打断、暂停播放的调用、暂时关闭按钮。
- 间隔和打断选项的编辑。
- 内容脚本或弹出页调用 `chrome.storage`，或载入 `storage.js`。写入都发给服务工作线程。
- ES Module、打包工具、网络请求。`.cursor/hooks.json` 会拦住这些写入。

详细行为、文案和记录字段以任务书第 6 节和设计第 6.2、7 节为准，不要在交接里另定一套。
