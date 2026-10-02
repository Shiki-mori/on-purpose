# 交接：任务 6 已完成，从任务 7 做起

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-03 |
| 当前进度 | 任务 6 已完成。下一轮只做任务 7 |
| 代码 | `main`，提交 `254d988` |
| 依据 | [编码任务书](../assignment/assignment-book.md) 第 11 节和第 13 节 |

新对话从任务 7 开始。不要重做任务 6，也不要加第二个网站或新的使用者可见功能。

## 1. 先读什么

1. 本文。
2. `docs/assignment/assignment-book.md` 第 11 节（任务 7 要核对的事和验收）和第 3、4 节（全程约束与已经定下的名字）。
3. `.cursor/skills/implement-extension-task/SKILL.md`。共享名字在同目录的 `reference.md`。
4. 系统设计第 9 节。站点函数、清单三处网址、不加 `siteId` 都以那里为准。

行为以需求说明书 0.2 和系统设计说明书 0.2 为准。任务范围以任务书为准。

## 2. 任务 6 已经有的东西

`extension/` 可以在 Chrome 里加载。消息都已接上：`popup-get`、`content-ready`、目的询问那一组、`lists-changed`、`settings-set`、打断选项那一组、`interrupt-commit`、`interrupt-dismiss`、`interrupt-close-tab`、`show-interrupt`、`snooze-set`、`snooze-move`。闹钟是 `timer-due` 和 `snooze-end`。

暂时关闭：

- 按钮和询问、打断共用一个 Shadow DOM 宿主，`data-op-host` 为 `shell`。按钮是 `[data-op-snooze="1"]`，点击区域不在遮罩上。询问或打断的遮罩盖在按钮上面。
- `src/sites/bilibili.js` 的 `entry` 仍是 `all`。主页、视频播放页、番剧播放页、搜索页、推荐页，以及课堂页 `https://www.bilibili.com/cheese/`，都能挂上半透明入口。没有改成 `primary`，文件顶部也还没有「以后新增网站」的注释。那条注释是任务 7 要补的。
- 未生效时文案是「暂停」。生效时是「至 HH:mm」。面板里有「10 分钟」「30 分钟」，自定义框每次打开都显示 10。小于 1 或非整数不开始，提示「请输入大于或等于 1 的整数」。
- `snooze-set` 把 `localState.snooze.until` 设成现在加上所选分钟，并覆盖 `snooze-end`。已经在暂时关闭中时，从这次操作重新计算。一开始就清掉共用计时和 `timer-due`。拖动超过 4 像素后，`snooze-move` 把相对视口的 `xRatio`、`yRatio` 写入 `snoozeButton`。
- `snooze-end` 响时，若还有哔哩哔哩标签页，把 `until` 清成 `null`，立刻开始一轮打断，`interrupt.reason` 为 `snooze`。已经没有哔哩哔哩标签页则只清 `until`，不补弹。服务工作线程启动时 `OP.reconcileSnooze`：仍在将来就重新设上 `snooze-end`，计时保持不动；已经过去就清成 `null`，不补弹。
- 暂时关闭期间目的询问仍按任务 3 的规则出现。到期和目的询问碰到一起时，先显示目的询问，确认或跳过之后再显示时长打断。这一轮打断全部完成后，若仍有哔哩哔哩标签页，按再次打断间隔从零开始。
- 内容脚本和弹出页仍不调用 `chrome.storage`，也不载入 `storage.js`。

服务工作线程认网址只用 `OP.findSite` 和站点的 `isHome`。暂停播放走 `findSite` 之后的 `pausePlayback`。清单里的 `host_permissions`、内容脚本 `matches`、`web_accessible_resources` 都是哔哩哔哩的 https 网址。存储里没有 `siteId`。初始目的仍在 `storage.js` 的播种数据里。

任务 5、6 的验收缺口记在任务书第 13 节备注里，不要在任务 7 里重测休眠，也不要为了 AC-27 去点「重新加载」。本机开发者模式被策略锁定，重新加载未打包扩展后，Chrome 会把它标成损坏，服务工作线程不再启动。验收是在本机临时下载的 Chrome for Testing 154 里做的，用户数据目录是临时的。本机已安装的 Google Chrome 150 会忽略命令行 `--load-extension`。使用者自己查看时，在 `chrome://extensions` 打开开发者模式，加载仓库里的 `extension/`。

## 3. 任务 7 要做的事

没有新的使用者可见功能。对照设计第 9 节核对站点边界：

- 服务工作线程只对 `findSite` 有结果的标签页计入一轮使用和打断。
- 主页、主要页面、播放暂停都留在 `src/sites/bilibili.js`。
- 目的、打断选项、记录、间隔和计时仍是全局一份。不往存储里加 `siteId`。
- `entry` 保持 `all`。任务 6 没有退让。
- 在 `bilibili.js` 顶部用简短注释写明：以后新增网站时新增站点文件、在 `index.js` 注册、把网址加入清单的三处；不改计时状态机和记录结构。
- 若发现网址判断散落在站点模块之外，把判断移回站点模块。不改状态机的转移条件。清单里那三处哔哩哔哩网址按设计第 9 节留在清单里。

验收表是任务书第 11 节：AC-28、AC-42 的总确认、C-5。每一行都对照过，再把任务书第 13 节的任务 7 改为已完成。

## 4. 任务 7 不要做的事

- 不要实现第二个网站，也不要改计时、记录、询问、暂时关闭的转移条件。
- 不要把 `entry` 改成 `primary`。任务 6 已经在主要页面和一个其他页面挂上入口。
- 不要给弹出页或内容脚本接上 `chrome.storage`，或载入 `storage.js`。
- 不要监听软导航。
- ES Module、打包工具、网络请求。`.cursor/hooks.json` 会拦住这些写入。扩展自己也不发起网络请求。

详细行为以任务书第 11 节和设计第 9 节为准，不要在交接里另定一套。
