# 共享约定与定位

本文件由 Cursor 技能的参考资料迁移并校正。用于定位当前约定；完整行为仍看需求与系统设计的最新对应章节。路径均相对于仓库根目录。

## 按改动查阅

| 改动 | 优先查阅 |
| --- | --- |
| 常量、消息、原文 | `extension/src/shared/constants.js`；设计第 8 节 |
| 种子、结构与迁移 | `extension/src/shared/storage.js`；设计第 4.1 节；任务书第 4 节 |
| 共用计时、轮次与暂时关闭 | `extension/src/background/runtime.js`；设计第 4.2、5 节 |
| 内容脚本注入、播放控制 | `extension/manifest.json`、`extension/src/sites/`；设计第 3、6、9 节 |
| 目的／打断／暂停界面 | `extension/src/content/ui.js`、`content-script.js`；设计第 6 节 |
| 弹出页、日志与统计 | `extension/src/popup/`、`extension/src/logs/`；设计第 7、7.1 节 |
| 产品行为与验收 | `docs/Requirements Specification/Requirements Specification.md` 第 3、4、6 节 |

## 当前常量

| 项 | 值 |
| --- | --- |
| 本地键／会话键 | `localState`／`sessionState` |
| 结构版本 | `6` |
| 闹钟 | `timer-due`、`snooze-end` |
| 两个间隔的初始值 | 都为 `3` 分钟 |
| 名称上限 | 去首尾空白后 200；当前实现按 JS 字符串 `length` 校验 |
| 分钟数 | 大于或等于 1 的整数；当前实现要求 `Number.isSafeInteger`，不另加产品上限 |
| 暂时关闭预设／每次展开的自定义值 | `10`、`30`／`10` 分钟 |
| 打断关闭后再弹 | `5000` 毫秒 |
| 拖动阈值／初始右下边距／视口边距 | `4`／`24`／`8` 像素 |
| 宿主 z-index | `2147483646` |

## 数据与展示

- 初始目的存储顺序：学习、游戏攻略、追番、健身、生活经验、关注更新、其他、无意识打开、网络测试、游戏资讯、娱乐、技术、科普。前七项 id 为 `purpose-seed-1` 至 `purpose-seed-7`；其后 id 依次为 `purpose-seed-10`、`purpose-seed-13`、`purpose-seed-8`、`purpose-seed-9`、`purpose-seed-11`、`purpose-seed-12`，order 连续为 8 至 13。
- 初始打断项前三项为 `interrupt-purpose`（目的）、`interrupt-other`（其他）、`interrupt-close-tab`（关闭当前标签页），都锁定；只有最后一项 `closesTab: true`。其后 `interrupt-seed-1` 至 `interrupt-seed-9` 依次为节奏对立视频、意义不明的短视频、游戏短视频、搞笑视频、看评论区、电影解说、技术、鸡汤、家访，不锁定且不关闭标签页。
- 新安装才播种。旧数据按 `OP.migrateLocalState` 与设计第 4.1 节迁移，完成后不重复补回用户删除的项。版本低于 2 时允许把旧默认值 5 改为 3；其后的列表迁移不能重置分钟数。
- 版本低于 6 时，按 id 或名称去重补充本次三个目的、四个打断项；「网络测试」移到名称为「无意识打开」的第一项之后，没有该名称时放末尾，不恢复旧删除项。其余字段和已有项相对顺序保留。
- 初始 `snooze.until`、按钮两个 ratio 为 `null`，`records` 为 `[]`，`purposeSnapshots` 为 `{}`。空会话用 `OP.createEmptySessionState()`，不自行构造缺字段的替代版本。
- 名称、分钟校验复用 `OP.normalizeName`、`OP.parseMinutes`。记录展示用 `OP.choiceLabel`、`OP.purposeContrast`、`OP.presentRecords`；目的改名影响旧记录显示，删除通过快照保留名字，打断选项名称按写入时快照展示。
- 目的询问把名称为「其他」「无意识打开」「网络测试」的项按这个顺序固定在顶部；打断窗口固定「目的」「其他」。目的询问及弹出页均用 `OP.sortPurposes` 将当前名称为「娱乐」的目的放在末尾，新增目的仍在它前面；同名项和其余项按 `order`。显示排序不能改写存储顺序，打断选项不采用目的的末尾规则。
- 记录和统计在日志页：范围为「本月」「近30天」，记录列表仍显示全部记录。饼图低频合并用「较少出现」，重名时用「更少出现」，不用「其他」替代。
- 时间按本机时区展示：记录到秒 `YYYY-MM-DD HH:mm:ss`，按钮 `HH:mm`，截止日期 `YYYY-MM-DD HH:mm`。后台仍以时间戳处理状态。

## 状态与站点

- 目的询问未完成时不累计共用计时；全部完成且无待处理打断后，用首次间隔从零开始。一轮打断逐标签页回答，全部完成后用再次间隔。
- 刷新或关闭部分标签页不清整轮状态；最后一个匹配标签页关闭则清会话。退出浏览器或重新加载扩展清计时，但保留本地数据与未到期的暂时关闭。
- 暂时关闭开始即清零并暂停共用计时，期间仍询问目的；延期从当前时刻重算。到期有匹配标签页则立即打断，没有则不补弹。服务工作线程启动时按设计核对残留闹钟和截止时间。
- `OP.findSite(url)` 返回首个匹配站点或空。站点接口为 `id`、`matches`、`isHome`、`isPrimary`、`entry`、`pausePlayback`；当前 `entry: "all"`。
- `pausePlayback` 只暂停顶层正在播放的视频，返回仅恢复这些元素的函数，忽略 `play()` 被拒绝。计时、目的和记录保持全局一份，存储不加 `siteId`。
- 新增站点是未来扩展点：新建站点文件、在 `sites/index.js` 注册、更新清单 `host_permissions`、`content_scripts.matches`、`web_accessible_resources.matches`；当前任务没有要求时不提前接入。
