# On Purpose 项目指令

本文件适用于整个仓库，是 Codex 的项目规则入口。项目是以未打包目录加载的 Chrome Manifest V3 扩展，当前只支持哔哩哔哩的 HTTPS 页面。沟通和界面文案使用中文。

## 工作范围与依据

- 以用户本次明确要求为工作范围。修复、审查、文档和规则维护不强制套用历史任务顺序。
- 修改 `extension/`，或用户要求继续编码任务时，读取并使用 [.agents/skills/implement-extension-task/SKILL.md](.agents/skills/implement-extension-task/SKILL.md)。纯文档或环境配置维护无需启用该技能。
- 产品行为以 [需求说明书](<docs/Requirements Specification/Requirements Specification.md>) 的最新功能条款、[系统设计说明书](<docs/System Design Document/System Design Document.md>) 的最新设计为依据；代码用于核对实际实现，不能把已有缺陷当成新要求。
- [编码任务书](docs/assignment/assignment-book.md) 用于共享约定、验收索引和历史进度。第 13 节是进度依据；第 2 节、早期任务正文、确认清单、交接文档可能保留旧状态或旧数值。遇到冲突，先核对修订记录与相关代码，明确说明差异，不回退到旧行为。
- 仅当用户要求继续任务书、且第 13 节确有未完成任务时，默认一次推进编号最小的未完成项，不提前实现后续项。全部完成时按当前请求开展维护，不重做旧任务，不虚构“下一项”。
- 用户要求改变已确认行为时，在同一变更中先修订对应需求或设计并留下修订记录，再改代码。恢复既定行为的缺陷修复不必为了匹配缺陷而改需求。

## 扩展架构（修改 extension/ 时适用）

- 保持原生 JavaScript、HTML、CSS 与 Manifest V3，不引入打包工具或为扩展新增 `package.json`。扩展运行脚本不使用 ES Module、`import` / `export` 或 `type="module"`，共享接口挂在 `globalThis.OP`。
- `service-worker.js` 用 `importScripts` 依次载入 constants、time、storage、bilibili、index、runtime，路径相对于 `extension/src/background/service-worker.js`。该文件注册启动、闹钟和标签页事件；具体消息、计时和关闭标签页逻辑在 `runtime.js`。
- 清单中的内容脚本顺序为 `src/shared/constants.js`、`src/sites/bilibili.js`、`src/sites/index.js`、`src/content/ui.js`、`src/content/content-script.js`。保持隔离世界、`all_frames: false`、`run_at: "document_start"`。
- 弹出页通过普通 script 标签依次加载 constants、time、popup；日志页依次加载 constants、logs。页面和内容脚本不调用 `chrome.storage`，不载入 `storage.js`；通过消息向服务工作线程请求数据与变更。
- 存储、闹钟及关闭标签页的操作均由服务工作线程执行。本地键为 `localState`，会话键为 `sessionState`。状态以存储为准，内存只作当次处理缓存；保留现有串行队列，避免并发读改写覆盖。
- 对来自内容脚本的标签页操作，使用 `sender.tab.id`，不信任消息体传来的标签页 id。消息类型、文案、常量复用 `extension/src/shared/constants.js`。
- 名称与分钟数必须在服务工作线程校验；界面可重复校验以即时提示。新记录、目的与打断选项使用 `crypto.randomUUID()`，种子沿用既有固定 id。
- 写入失败时保留询问或打断窗口，提示「没能保存，请再试一次」；保存记录成功后才允许关闭当前标签页。
- 扩展不主动请求外部网络，不发送目的、备注、回答、列表或设置。加载扩展自带的脚本、样式和图标不属于外部网络请求；此约束也不禁止开发工具查阅文档。
- 共用计时使用 `Date.now()` 的墙钟时间与 `chrome.alarms`；不用 `performance.now()` 或页面、服务工作线程定时器替代。关掉打断窗口后 5 秒再弹由内容脚本 `setTimeout` 完成；短暂的界面异步兜底不属于共用计时。
- 网址识别走 `OP.findSite`，主页、主要页面及暂停播放走 `extension/src/sites/bilibili.js`。当前不新增第二个网站；未来接站点需同步站点模块、注册表和清单三处匹配范围，不把网址判断散落进状态机。
- 保留已有数据迁移，不能通过重新播种覆盖用户设置、列表或记录。当前数据与交互注意事项见技能的 [reference.md](.agents/skills/implement-extension-task/reference.md)。

## 界面（修改扩展界面时适用）

- 保持中文与已规定文案，优先复用 `OP.COPY`；只做深色，不添加主题切换。共享颜色来自 `extension/src/shared/theme.css`：背景 `#16171d`、表面 `#23242c`、文字 `#f3f4f6`、次要文字 `#b6b8c3`、分隔 `#3a3b46`、强调 `#7c8cff`。暂时关闭按钮背景为 `rgba(22, 23, 29, 0.72)`。
- 页面界面使用同一个 Shadow DOM 宿主，挂在 `document.documentElement` 末尾，`z-index` 为 `2147483646`，从扩展内链接 `theme.css`。等待根节点可用再挂载，非 HTML 文档不挂界面。
- 询问、打断用全视口遮罩；点击遮罩不关闭。全屏时先退出全屏。两者同时待显示时先目的询问，再时长打断。
- 仅在询问或打断显示时拦截页面操作。关闭后恢复点击、键盘、滚动和 `inert`；不能仅因暂时关闭按钮的宿主仍存在就继续拦截页面。修改此路径时参考 `docs/debug/页面点击失效.md`，并以当前代码核实历史报告。
- 弹出页保留间隔、目的、打断选项及「查看日志」入口；记录与统计在独立日志页，不能照早期任务正文放回弹出页。

## 检查与验收

Cursor 的 `.cursor/hooks.json` 不作为 Codex hook 注册。本文件和技能保留其有效约束，交付前按以下流程检查；指令遵循不等于工具调用前的强制拦截。

- 修改扩展 JavaScript 后，对改动的脚本运行 `node --check <文件路径>`；修改清单时用 JSON 解析检查合法性，并核对所引用资源存在、脚本顺序、注入时机与权限范围。仓库没有现成的 npm 构建或测试命令，不虚构 `npm test`。
- 根据改动逐项核对上述架构约束、消息接口、页面与存储边界、外部请求、计时和深色主题；搜索命中只作线索，需要结合实际代码判断，不能视为完整静态证明。
- UI、Chrome API、持久化、跨标签页或生命周期行为需要在安装了本扩展的 Chrome 普通窗口验收：`chrome://extensions` 加载 `extension/`，修改后重新加载。先确认当前浏览器确实加载了本地扩展；普通网页预览或语法检查不能代替扩展验收。
- 不为验证自动清空真实记录或重置用户设置。区分已执行的静态检查、模拟验证、真实 Chrome 验收与未测项；无法操作相应浏览器时交付具体待验步骤。
- 任务书验收项全部通过后才改第 13 节为完成并记录日期。缺项写备注；AC-14 无法休眠可按任务书例外记录，但不能声称通过。已有 AC-27 环境限制也不能因迁移规则就改成已验证。

迁移来源、纠正项与加载方式见 [Codex 迁移说明](docs/development/codex-migration.md)。
