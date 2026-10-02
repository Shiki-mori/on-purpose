# 共享约定

与 `docs/assignment/assignment-book.md` 第 3、4 节相同。改这些名字或文案时，任务书和本文件一起改。

## 目录

```text
extension/
  manifest.json
  icons/icon128.png
  src/shared/constants.js
  src/shared/theme.css
  src/shared/storage.js
  src/shared/time.js
  src/sites/bilibili.js
  src/sites/index.js
  src/background/service-worker.js
  src/background/runtime.js
  src/content/content-script.js
  src/content/ui.js
  src/popup/popup.html
  src/popup/popup.js
  src/popup/popup.css
```

`importScripts` 顺序：constants、time、storage、bilibili、index、runtime。路径相对于 `service-worker.js`。

## 常量

| 名字 | 值 |
| --- | --- |
| 本地键 | `localState` |
| 会话键 | `sessionState` |
| 结构版本 | `1` |
| 闹钟名 | `timer-due`、`snooze-end` |
| 名称上限 | 200 |
| 两个间隔的初始分钟 | `5` |
| 暂时关闭预设 | `10`、`30` |
| 自定义分钟框每次打开的显示值 | `10` |
| 关掉打断窗口后再次出现 | `5000` 毫秒 |
| 拖动阈值 | `4` 像素 |
| 按钮默认边距 | 距右缘、下缘各 `24` 像素 |
| 视口内边距 | `8` 像素 |
| 宿主 `z-index` | `2147483646` |

消息 `type` 与系统设计第 8 节相同，集中放在 `constants.js`。

| type | 接入任务 |
| --- | --- |
| `popup-get` | 1 |
| `content-ready`、`purpose-add`、`purpose-commit`、`purpose-skip`、`purpose-update`、`purpose-delete`、`lists-changed` | 2，非主页分支在任务 3 |
| `settings-set`、`option-add`、`option-update`、`option-delete` | 4 |
| `interrupt-commit`、`interrupt-dismiss`、`interrupt-close-tab`、`show-interrupt` | 5 |
| `snooze-set`、`snooze-move` | 6 |

## 函数

| 函数 | 作用 |
| --- | --- |
| `OP.createInitialLocalState()` | 播种后的本地状态 |
| `OP.createEmptySessionState()` | 空会话：`roundActive` 为 false，计时 idle，各 pending 为空 |
| `OP.ensureLocalState()` | 没有 `localState` 时写入种子；已有则不覆盖 |
| `OP.readLocal` / `OP.writeLocal` | 读写 `chrome.storage.local` |
| `OP.readSession` / `OP.writeSession` | 读写 `chrome.storage.session` |
| `OP.normalizeName(raw)` | 去掉首尾空白。空或超过 200 字则失败 |
| `OP.parseMinutes(raw)` | 只接受大于或等于 1 的整数 |
| `OP.choiceLabel(local, record)` | 记录的展示文案 |
| `OP.purposeContrast(local, record)` | 目的记录的名称和非空备注 |
| `OP.findSite(url)` | 第一个匹配的站点，否则空 |

`sites/bilibili.js` 提供 `id`、`matches`、`isHome`、`isPrimary`、`entry`、`pausePlayback`。`entry` 为 `all`。`pausePlayback` 暂停顶层正在播放的 `video`，并返回只恢复这些元素的函数。`play()` 被拒绝时忽略。

初始目的 id 为 `purpose-seed-1` 至 `purpose-seed-7`，顺序：学习、游戏攻略、追番、健身、生活经验、关注更新、其他。

初始打断选项：`interrupt-other`（其他，locked，不关闭标签页）、`interrupt-close-tab`（关闭当前标签页，locked，关闭标签页）。

`settings` 两个间隔都是 `5`。`snooze.until` 和按钮的两个 ratio 是 `null`。`records` 为 `[]`。`purposeSnapshots` 为 `{}`。

时间用 `Date.now()`。本机时区：记录到秒 `YYYY-MM-DD HH:mm:ss`，按钮 `HH:mm`，截止日期 `YYYY-MM-DD HH:mm`。

## 文案

| 场合 | 文案 |
| --- | --- |
| 名称为空 | 请输入名称 |
| 名称超过 200 字 | 名称不能超过 200 个字 |
| 分钟数不合法 | 请输入大于或等于 1 的整数 |
| 保存失败 | 没能保存，请再试一次 |
| 删除目的 | 删除这个目的？ |
| 删除自定义打断选项 | 删除这个打断选项？ |
| 目的对照标题 | 这次的目的 |
| 记录来源 | 目的询问、时长打断 |
| 未生效的暂时关闭按钮 | 暂停 |
| 生效中的按钮 | 至 HH:mm |
| 弹出页间隔标签 | 首次打断间隔（分钟）、再次打断间隔（分钟） |

删除确认用浏览器自己的确认框。
