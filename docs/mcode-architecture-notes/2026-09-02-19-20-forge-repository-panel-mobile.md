# 仓库面板（forge）对接手机端

**需求编号**：无（对话式需求，2026-09-02）
**涉及端**：`mcode-app`（uni-app 客户端）、`codeg-plus` 服务端（只读，无改动）

## 背景与目标

codeg-plus 有一个叫 **forge** 的工作台（i18n `Forge.title` = 「仓库面板」）：GitHub /
GitLab 的 Issue 与 PR triage 界面，能读列表、读讨论、发评论、开关条目、合并 PR、新建
issue，并把任意一条工作项「处理」成一个 work task 交给无头引擎跑。

mcode-app 之前已经对接了 work task（底部 tab「任务」），但看不到工作项本身 —— 用户只能
在电脑前决定「处理哪个 issue」。这次把 forge 全量搬到手机端，入口是任务页顶部的一颗
GitHub 图标。

**桌面端版本是硬前提**：forge 的 17 条 HTTP 路由只在 `main`（v0.30.0）上齐全；
v0.27.0 只有 8 条，缺评论读写、开关条目、新建 issue、PR 详情、文件 diff、身份、合并选项、
合并。对未注册的命令桌面端返回 **501 + `{"code":"not_implemented"}`**，可以拿它探测能力。

## 架构

### 三个页面（全部原生 navbar，不进 tabBar）

| 路由 | 职责 |
|---|---|
| `pages/forge/index` | 列表页：仓库条 + 双 tab + 搜索 + 筛选 + 追加分页 |
| `pages/forge-item/index` | 条目详情：对话 / 检查项 / 文件更改 三分区 + 合并 |
| `pages/forge-accounts/index` | GitHub/GitLab 账号与 token、git 路径设置 |

tabBar 保持 5 项。会话必须留在下标 1（`CONVERSATIONS_TABBAR_INDEX` 是按位置取的）。

### 服务层

```
services/forge/forgeApi.ts          13 条 forge 命令 + normalize*
services/forge/forgeTaskApi.ts      work_task_create_from_forge / _lookup_by_source
services/forge/forgeSettingsApi.ts  forge_settings_get / _set + 作用域解析
services/forge/forgeAccountApi.ts   11 条账号与 git 设置命令
services/forge/forgeRoute.ts        三个 build*Route / parse* + isForgeCapableConnection
services/forge/forgeScopePreference.ts   uni storage：connectionId/folderId/tab/perPage
services/forge/forgeRowInbox.ts     列表 ↔ 详情的写回信箱 + 首屏 seed
services/forge/forgeErrors.ts       i18n_key → 分类 + 恢复动作
services/gateway/commandError.ts    GatewayCommandError（唯一动到共享层的新增）
```

### 纯模块（不 import uni/pinia/组件，可裸测）

`forgeFilterState` / `forgeListPaging` / `forgeListScope` / `forgeTabBadge` /
`forgeRowPresentation` / `forgeLabelColor` / `forgeSourceKey` / `forgeScenario`
（列表侧），`forgeItemPresentation` / `forgeChangePresentation`（详情侧），
`forgeAccountForm`（账号侧）。

## 协议与数据流

### 三层命名规则，逐字照抄不要统一

1. **HTTP 外层 param** —— camelCase（`folderId` / `accountId` / `sourceKeys` /
   `serverUrl`），服务端每个 param struct 都带 `rename_all = "camelCase"`。
2. **请求 DTO**（`ListFilters` / `CommentFilters` / `ChangeMergeRequest` …）—— 也是
   camelCase（`assignedMe` / `perPage` / `headSha`）。
3. **响应类型** —— **snake_case**（`author_avatar` / `is_pr` / `total_count` /
   `reachable_count` / `default_method` / `previous_path`），Rust 侧没有 rename。

**两个例外（最容易写错的地方）**：
- `work_task_create_from_forge` 的 `draft` 内部是 **snake_case**（`folder_id` /
  `server_host` / `owner_repo` / `account_id` / `agent_type`）。写成 camelCase 会让 serde
  用默认值填满整个结构 —— 表现是「创建成功但任务指向 folder 0」。
- `ForgePanelSettings` / `ForgeSettingsStore` / `GitHubAccountsSettings` 也是
  snake_case（它们是直接进存储的同一个 blob，不是围绕它建的请求 DTO）。

### 信任边界

客户端只送**坐标**（folderId、number、kind）与**展示快照**。仓库、URL、api_base、
账号身份、source key、提示词全部由服务端从文件夹自己的 origin 远端派生，且它会先校验
文件夹的 origin 是否真的是声称的那个仓库。这就是为什么 `ListFilters` 里没有仓库字段 ——
不是忘了，是不能有。

**provider 客户端永不自己选**：它由后端从「已配置的账号 + 主机名」推导，那个选择等于选
一份凭据。唯一的例外是**创建**账号时的表单预选（`guessForgeProvider`）—— 那时用户必须
说明 token 是给哪个 API 的，而自建实例的主机名什么都看不出来。

### 结构化错误

`directGateway` / `relayGateway` 原来在 `statusCode >= 400` 时抛
`new Error(\`${command}: ${toResponseErrorMessage(...)}\`)` —— `AppCommandError` 的
`code` / `i18n_key` / `i18n_params` 在第一步就永久蒸发。

新增 `GatewayCommandError extends Error`，两个 gateway 各改 7 行：
- `statusCode >= 400` 分支改抛它，**`message` 与改动前逐字节相同**（既有调用点与断言
  message 文本的测试全不受影响）；
- 外层 catch 加 `instanceof` 直抛（顺带修掉现存的 `"cmd: cmd: HTTP 422"` 重复前缀）。

relay 的 `/v1/proxy/:command` 原样转发桌面端的 `{status, body}`，所以**修 gateway 一处，
两条链路同时生效**。

三个 forge 的可恢复失败按 `i18n_key` 分类（`forgeErrors.ts`，key 逐字照抄 Rust 常量）：

| key | 恢复动作 |
|---|---|
| `Forge.errors.noAccount` | 「添加账号」→ accounts 页（预填 host + provider） |
| `Forge.errors.unsupportedHost` | 同上 —— 自建实例正是靠添加账号来声明自己是哪种 forge |
| `Forge.errors.wrongForge` | **静默重探 + 重拉**，每文件夹一次。后端返回它时已经自行纠正了归类，摊给用户等于把自家的记账问题当成用户的问题 |

判据必须是 key 而不是 code：`configuration_missing` 被多种失败共用，死 token 与无账号会
撞同一个 code —— 认错的代价是 token 过期时给用户一颗解决不了问题的「添加账号」按钮。

## UI 行为与关键决定

### 配额纪律（不是可选优化）

GitHub 的列表走 `/search/issues`，**30 次/分钟**。

- 搜索 **500ms 防抖**；
- **切 tab 不产生任何请求** —— 可见 tab 的计数搭在它自己的列表响应里，不可见 tab 的按
  `countsScope`（**不含 tab**）缓存，所以来回切 tab 作用域不变；
- 标签词汇表只在切仓库时拉一次；
- 三个 PR 分区的数据**只在第一次访问时**拉（`v-if=mounted` + `v-show=active`）；
- 追加分页撞到 `reachable_count` 天花板即停 —— GitHub 越过 1000 条时 `has_next` **仍是
  true**（从 Link 头推的），照着翻就是一次 422。

### 从详情页返回时不重拉列表

GitHub 的列表来自 **search 索引**，落后一次写入几秒到几分钟。任务页的 `onShow` 是无条件
重拉，forge **刻意不照抄**：重拉极大概率拿回「刚刚被改掉的那个状态」并盖上去，用户看着
关闭成功的 issue 又变回 open。

补法是 `forgeRowInbox`：
- **下行 seed** —— 列表页在 navigateTo 之前放下这一行（issue body 上限 16000 字符，塞进
  URL 会超长）。取完即删，坐标不匹配就拒（那说明详情页不是从列表点进来的）；
- **上行写回** —— 详情页交出从写操作响应拿到的**权威行**，列表在 `onShow` 排空并原地
  替换。`replaceForgeRow` 找不到时不追加（一个已关闭的 issue 不该继续挂在「进行中」）。

信箱按 `${connectionKey}:${folderId}` 分格：`issue:42` 在两个仓库里是两件不同的事，而
同号在真实项目里非常常见。

`mergeForgeRowUpdate` 补回 GitLab 单条目响应没带的标签颜色 —— `with_labels_details` 是
列表端点的参数，不补的话用户一按关闭，每颗彩色胶囊都掉成灰的。

### `task://changed` 只刷芯片

任务页的回调是重拉列表，forge 这边**只重跑 `work_task_lookup_by_source`**（走本地数据库，
不花配额）。两个理由：重拉会把上面那个索引滞后问题变成**自动发生**（任务每推进一步抹
一次）；一个任务从 running 到 done 会发好几条事件，每条都重拉就是把配额烧在用户没要求的
刷新上。300ms 合并窗口与任务页一致。

反查有**自己的代际计数器**：共用会让两条线互相取消，而反查的答复是整体替换 map —— 慢的
赢会让已存在的 link 消失，芯片变回「处理」按钮，一个正在跑的任务被重复触发。

### 不能压平的 null

| 字段 | `null` 的含义 | 压平的后果 |
|---|---|---|
| `total_count` | forge 拒绝计数（GitLab >10k） | 写「共 0 条」而列表里明明有行 |
| `reachable_count` | 全部可翻 | 分页立刻停在第一页 |
| `mergeable` | **还在异步计算**（两个 forge 都是） | 说「存在冲突」，让人去找一个不存在的冲突 |
| `checks.available: false` | forge 不肯说（缺 scope / 关了 CI） | 在流水线是红的仓库上印「没有检查」 |
| `checks.partial: true` | 只读到一半 | 「全部通过」被当成可以合并的依据 |
| `patch` | binary 或 forge 因过大扣留 | 一个展开后是空白的按钮 |
| 规模四个计数 | GitLab 一个都不给 | 印 0 = 断言「变更什么都没碰」 |
| `forge_merge_change → null` | **合并成功但回读那一行失败** | 报成失败 → 有人把不可逆操作再做一遍 |
| `forge_tab_count → null` | forge 不肯数 | 徽章画一个错的数字 |

**`u-tabs` 装不下三态**：它的模板是
`:value="item.badge && item.badge.value || propsBadge.value"`，`0` 被 `||` 吃掉落回默认值，
`:show` 那条 `!!(… || item.badge.value)` 也算 false。所以徽章只画 `> 0`，「真的 0 条」
「不提供计数」「计数不完整」的区别放在 header 下的摘要行 —— 但状态里必须保留
`number | null` 三态，否则摘要行没有东西可说。

### 合并的两个契约

- **`headSha` 在打开确认弹层那一刻捕获**，确认时原样送出，不重读。面板是拿着一份 diff、
  一份文件表和一组检查项（都描述同一个提交）做的决定；两个 forge 都把它当前置条件并在
  分支动过时以 409 拒绝 —— 弹层开着时用户下拉刷新过，确认仍按旧 sha 走，那是正确的。
- **`mergeable === null` 不禁用确认按钮**：只有 forge 有资格说不，而它此刻还没算完。
  禁用意味着用户要反复下拉刷新直到它变绿。

`merge` 方式的说明**取决于 `merge_strategy`**：GitHub 上它总写一个合并提交，但 GitLab 的
项目设置决定它是合并提交、变基后合并还是快进（API 没有覆盖手段）。用同一句话描述三种
结果，就是向一个只允许快进的项目承诺一个合并提交。

### 评论永不重试

一次 POST 可能已经到达 forge 而只是响应丢了，重试就是发两遍到一个别人在读的线程里。
失败时保留用户写的内容，措辞是「可能已经发出，请下拉线程确认」而**不是**「请重试」。

### 账号管理的两处顺序

- **保存**：先 `save_account_token` 再 `update_github_accounts`。反过来中间失败会留下一个
  有身份、没凭据的账号行 —— forge 会挑中它然后 401，用户看到的是「token 无效」而不是
  「保存没成功」。
- **删除**：顺序相反。孤儿 token 无害，孤儿账号行会 401。

**替换 token 必须沿用原 `account.id`**：每个 forge 触发的任务都把它钉在
`source_meta.account_id` 上，换 id 会让那些任务失去可交付的身份（推分支、建 PR、回写评论
全部失败）—— 而失败发生在几小时后任务跑完时，那时没人会想到是换 token 引起的。

### source key 差一个字符就永远不亮

`work_task_lookup_by_source` 是精确字符串匹配，key 由 Rust `forge::source_key()` 在触发时
写进 `work_task.source_key`。**不报错**，只是「这个 issue 看起来没人处理过」，于是被重复
触发。

规范 `{provider}:{server_host}:{owner_repo}:{kind}:{number}`，全小写。归一化顺序：
`trim` → 去首尾 `/` → **重复**去尾部 `.git` → 全小写。

**这里与桌面端 TS 镜像有一处分歧**：Rust 用 `trim_end_matches(".git")`（一直剥到没有为止），
桌面端 `src/lib/forge-source-key.ts` 用 `.replace(/\.git$/i, "")` 只剥一次。手机端以**写 key
的 Rust** 为准（`.replace(/(\.git)+$/i, "")`）—— 一个 `repo.git.git` 形式的远端（某些镜像
工具会这么生成）在桌面端与手机端会算出不同的 key。

`kind:number` 而不是裸 number：GitHub 的 issue 与 PR 共享编号空间，但 **GitLab 的 issue 与
MR 各有一套** —— 裸 number 会让两者互相覆盖。

### 面板设置的作用域

线上全局行是 **`folderId: null`**，UI 的「全部项目」哨兵值是 **`0`**。`0 → null` 的转换
**在 service 层做且只做一次** —— 忘了会把全局设置写到一个不存在的 folder 0 上，表现是
「保存成功但下次打开什么都没变」。

`settings: null` 是「**删掉**这个项目自己那行让它回去跟随全局」，不是「清空设置」。
全局行本身不能删（服务端 422）。

覆盖是**整份替换**不是逐字段合并 —— 这条规则从任务设置照抄：两个弹层在同一个面板上隔
一次点击，学过「这个项目现在有自己的设置」的用户不该在另一个里遇到不同的算法。

### 标签配色

桌面端 `labelSwatch` 输出六个 CSS 自定义属性由根节点 `.dark` class 在 CSS 里挑；手机端
没有这个机制（scoped 样式里没有可 key 的根 class，`--mcode-*` 前缀硬禁止），所以在**计算
时**就把 `isDark` 吃掉，直接出一套具体色值（Primer 的 BT.709 感知亮度算法照搬）。

`isDark` 取 uview mixin 的 **`upThemeIsDark`**（computed，靠 `upThemeVersion` 触发重算），
**不能**用 `isDarkThemeMode()` 一次性读值 —— 后者会让切到深色后每颗标签仍是浅色配方，
深蓝标签变成黑底黑字。这是个静默失败，只在深色模式下才看得见。

`color === null`（GitLab 写入时接受 CSS 颜色名，后端因此拒绝透传）走中性胶囊，不编默认色。

## 兼容性

- **桌面端必须是 v0.30.0（或含 forge 全量的分支）**。旧版本上详情页那 9 条命令会返回
  501，表现是各分区显示「加载失败」。
- 手机端不新增 tabBar 项，不接 SQLite 缓存（那套 schema 只为会话设计），不建 pinia store。
- 只用 uview 运行时主题变量（`--up-*`），不引入 `--mcode-*` 别名。
- `<script setup>` 里 `upThemeVar` / `upThemeIsDark` 必须经
  `getCurrentInstance()?.proxy?.…` 取 —— 裸调 ReferenceError，在 computed 里还会静默失败
  （prop 变空串）。

## 原生 iOS / Android 复刻指引

按这个顺序实现，每一步都能独立验证：

1. **传输层**：`POST {baseUrl}/api/{command}`，`Authorization: Bearer <token>`。
   `statusCode >= 400` 时**保留响应体**（`{code, message, detail?, i18n_key?, i18n_params?}`），
   不要只留一句 message —— 后面三个可恢复失败全靠 `i18n_key` 分支。
2. **列表**：`folder_forge_remote` 探测（一个项目一次）→ 三种前置状态 →
   `forge_list_issues`。`total_count` / `reachable_count` / `mergeable` 等九个字段用可选
   类型（Swift `Int?` / Kotlin `Int?`），**不要**用 `0` / `false` 当缺省。
3. **配额**：搜索防抖 500ms；tab 计数按「不含 tab 的筛选键」缓存；标签按仓库缓存。
4. **详情**：三分区各自懒加载并各自持有分页状态与代际计数器。切 tab 不销毁已加载的分区。
5. **写回**：详情的写操作把响应里的行交给列表（内存信箱，键含仓库），列表原地替换。
   **不要**在返回时重拉列表。
6. **合并**：打开确认界面时快照 `head_sha`；返回 `null` 走成功路径。
7. **任务桥**：source key 严格按上面的规范（注意 `.git` 重复剥离与 `kind:number`）；
   任务事件只重跑反查。
8. **设置**：`0 → null` 的作用域转换只在一处做；覆盖整份替换。

需要与 Rust 侧逐字对齐的常量：`BODY_CAP 16000` / `MAX_SEARCH_CHARS 128` /
`MAX_LABEL_FILTERS 10` / `MAX_ISSUE_LABELS 50` / `MAX_COMMENT_CHARS 65536` /
`MAX_TITLE_CHARS 255` / `PROMPT_CAP 4000` / per-page `1..=100`（列表默认 20、评论 20、
文件 50）/ `LOOKUP_KEYS_CAP 100`。

## 测试

`npm run test:unit`（179 套件 / 1891 测试）。forge 相关：

| spec | 锁住什么 |
|---|---|
| `tests/services/forgeApi.spec.ts` | 13 条命令的名字与载荷形状、9 个 null 语义 |
| `tests/services/forgeTaskApi.spec.ts` | draft 的 snake_case（含反向断言不含 camelCase 变体） |
| `tests/services/forgeSettingsApi.spec.ts` | `0 → null`、整份替换、未知提示词键保留 |
| `tests/services/forgeAccountApi.spec.ts` | 两步保存的载荷、`provider: null` 的语义 |
| `tests/services/forgeErrors.spec.ts` | 三个 i18n key 与各自的恢复动作 |
| `tests/services/gatewayCommandError.spec.ts` | **message 逐字节不变** + `i18n_key` 存活 |
| `tests/services/forgeRowInbox.spec.ts` | seed 取完即删、写回按仓库分格、标签补色 |
| `tests/pages/forge/*.spec.ts` | 8 个纯模块 |
| `tests/pages/forge-item/*.spec.ts` | 2 个纯模块 |
| `tests/pages/forge/forgePageContract.spec.ts` | 109 条源码扫描断言（组件不挂载，只能这么锁） |

类型检查 `npx vue-tsc --noEmit`（仓库没有 lint/typecheck script；既有的一批历史错误与本次
改动无关，forge 相关文件零错误）。

真机验证需要：跑 main 分支的 codeg-plus 桌面端 + 至少一个配好 token 的 GitHub 或 GitLab
账号 + 一个 origin 指向该仓库的项目文件夹。配额纪律要抓包或看桌面端日志确认请求次数，
不能只看 UI。
