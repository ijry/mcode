# tab 角标不显示：`mcode_connected_map` 被当成可达性事实

需求：修复底部 tab「会话」角标经常不显示进行中会话总数。

## 症状

角标时有时无，且**不会自愈** —— 冷启动没有、进会话页没有、下拉刷新也没有，
只有回「连接」页手动点一次「连接」才出现。

## 根因

角标服务用 `mcode_connected_map` 作为「哪些连接参与计数」的唯一门禁：

```ts
// conversationTabBadgeService.ts（修复前）
function getConnectedConnections() {
  const connectedMap = readConnectedMap()
  return readStoredConnections().filter((conn) =>
    Boolean(connectedMap[buildConnectionKey(conn)])
  )
}
```

而这个 map **只在用户于「连接」页手动点「连接」时写入**
（`pages/connections/index.vue` 的 `persistConnectedMap`，由 `connectConnection` 等路径调用）。
它的真实语义是「用户点过没」，是个 UI 交互标记 —— 不是「这台机器现在可达」。

角标服务把它当成了后者。于是只要这个 map 是空的（清缓存 / 换设备 / 重装 / 从未手动连过），
`pet_list_active_sessions` **一次都不会发出**。

**为什么不自愈**：所有刷新入口 —— `App.vue` 的 `onLaunch` / `onShow`、会话页下拉刷新、
`pet://sessions` 推送、桥接重连补拉 —— 最终都走同一个 `getConnectedConnections()`，
全被这道门挡住。

浏览器实测（连接记录在、`connected_map` 为空）：

```
1) 冷启动（map 空）      badge=null  petCalls=0
2) 进会话页后            badge=null  petCalls=0
3) 下拉刷新后            badge=null  petCalls=0
```

`petCalls=0` —— 请求根本没发出去。

## 修法

门禁放宽成「有保存的连接就试一次」，连不上的由 `Promise.allSettled` 静默跳过
（`refreshInternal` 里「失败保留上一次计数」的逻辑本来就在，一次网络抖动不会让角标归零）。

同时把「确实连上过」这个**事实**回填给那个标记，让它从「用户点过没」升级为
「曾经成功连上过」—— 会话列表页读同一个 map，顺带受益。

```ts
function getCountableConnections() {
  return readStoredConnections()   // 不再按 connected_map 过滤
}

function markConnectionConnected(connectionKey: string) {
  if (!connectionKey) return
  const connectedMap = readConnectedMap()
  if (connectedMap[connectionKey]) return   // 只在缺失时写，别每次刷新都碰 storage
  uni.setStorageSync("mcode_connected_map", { ...connectedMap, [connectionKey]: true })
}
```

### 关键点：标记必须写在**网络请求成功之后**

第一版把 `markConnectionConnected` 放在 `resolveConnectionContext` 之后 —— 错的。
direct 模式下 `resolve` 只是用存储里的 baseUrl + token 拼出 gateway 对象，**完全不碰网络**
（见 `connectionDriverRegistry` / `directGateway`），所以 resolve 成功证明不了机器可达。

实测暴露：指向一个没在监听的端口，角标正确地没显示，但 map 里却被写进了
`{"codeg::direct::http://127.0.0.1:3999": true}` —— 一台早已下线的机器被永久标成 connected，
这个假事实还会喂给会话列表页。

正确顺序是等 `fetchOngoingActiveSessionCount`（真的打 `pet_list_active_sessions`）返回之后再写：

```ts
const count = await fetchOngoingActiveSessionCount(resolved.gateway)
markConnectionConnected(buildConnectionKey(conn))
return { instanceKey, count }
```

## 验证

修复后实测（同一场景）：

| 场景 | 结果 |
|---|---|
| 活跃机器 + `map` 为空 | `badge=6`、`petCalls=1`，`map` 自愈为 `{"codeg::direct::...":true}` |
| 端口未监听（连不上） | `badge=null`、`map={}` —— 不写假标记 |
| 全量单测 | 864/864 通过 |

单测见 `mcode-app/tests/services/conversationTabBadgeService.spec.ts`（10 例），其中
`does not mark a connection that resolves but cannot be reached` 专门锁住上面那个顺序 ——
把 `markConnectionConnected` 挪回 fetch 之前，它会失败（已反向验证过）。

## 收口：`connectedMapStore` 成为唯一读写入口

修完角标后顺手处理了同一个 map 的另一个隐患：它原先在 **4 个文件**里各写了一遍，
且**写方和读方用的不是同一个 key 函数**。

- 写：`pages/connections/index.vue` → `buildConnectionRecordKey(conn)`（直接读原始字段）
- 读：`pages/conversations/index.vue` / `pages/todos/index.vue` /
      `conversationTabBadgeService` → `buildConnectionKey(conn)`（先归一化再取键）

两者对良构 v2 记录恰好等价，所以一直没炸。但只要记录**无法通过 v2 归一化**就会分叉，
实测三种（写了个临时 spec 逐一比对得出）：

| 记录 | `buildConnectionRecordKey` | `buildConnectionKey` |
|---|---|---|
| `targetAgent: "CodeG"` | `"CodeG::direct::…"` | `""` |
| `version: 1` | `"codeg::direct::…"` | `""` |
| 缺 `directBaseUrl` | `"codeg::direct::"` | `""` |

写进去的键读方永远匹配不上 —— 「已连接」状态静默丢失。更糟的是
`pages/conversations/index.vue` 会按自己的算法**重写整个 map**
（`pruneConnectedMapBySavedConnections`），把读不出来的条目当成陈旧条目剪掉，造成不可逆丢失。

现在统一走 `src/services/connection/connectedMapStore.ts`：

- 所有键都由 `buildConnectionKey` 生成（归一化失败返回 `""`）。
- `markConnectionConnected` 遇到空键**什么都不做** —— 宁可不标记，
  也不要写一个谁都读不到的键。
- 剪枝（`pruneConnectedMap`）与置位共用同一个 key 函数，不会再自相矛盾。
- `pages/connections/index.vue` 的 `connectionKey` 也改用 `buildConnectionKey`；
  它的 `connections.value` 来自 `readStoredConnections()`（已归一化），所以对本页行为无影响。

单测见 `mcode-app/tests/services/connectedMapStore.spec.ts`（12 例），其中三例就是上表那三种分叉。

## 另一个坑：`upThemeVar` 不能在 `<script setup>` 里调

收口过程中撞上一个**我自己在 navbar 改造里埋的**运行时错误：

```
ReferenceError: upThemeVar is not defined
```

`upThemeVar` 是 uview 通过 **Options API mixin** 注入的方法（`libs/mixin/mixin.js`），
只有**模板作用域**能调。在 `<script setup>` 里写 `computed(() => upThemeVar(...))` 会抛错，
而且是在 computed 求值时抛 —— 表现为 prop 静默变成空串，于是
`u-navbar` 回退到 `statusBarBgColor ? … : navbarBgColor`，状态栏又变透明。

（这也解释了当时排查状态栏时看到的 `statusBarBgColor: ""`：不是时序问题、不是 TDZ、
不是 HMR 缓存 —— 就是这个函数在那个作用域里根本不存在。绕了很多探针才定位到。）

正确做法是直接给 CSS `var()` 字面量，交给浏览器求值：

```ts
const NAVBAR_GLASS_BG_COLOR = "var(--up-navbar-glass-bg-color, rgba(255, 255, 255, 0.82))"
```

反而更好 —— 主题切换时自动跟随，不需要响应式。**模板里**的
`:leftIconColor="upThemeVar('--up-main-color', '#191c1e')"` 是合法的，别一起改掉。

**注意**：`vue-tsc` 会把这个报成 `TS2304: Cannot find name 'upThemeVar'`，
但那个报错对**模板里**的用法是误报（mixin 注入的东西它看不见）。所以不能只看类型检查 ——
这个错误是靠浏览器控制台的 `pageerror` 抓到的。

## native iOS / Android 复刻指引

**别把 UI 状态当事实**。这个 bug 的本质是「用户点过连接按钮」被当作「机器可达」使用。
native 端如果也维护类似的本地连接状态表，要区分两件事：

1. **用户意图**（这条连接是否启用 / 是否想连）—— 由 UI 写入，可以持久化。
2. **可达性**（现在能不能拿到数据）—— 只能由一次真实请求的成功来证明，不可从 1 推导。

角标（以及任何后台计数）应当基于 2，且**不要**用 1 做前置过滤，否则会出现
「本地状态一旦丢失就永久不显示、且没有自愈路径」的问题。

**具体到实现**：
- 计数任务应遍历所有已保存连接，逐个尝试，失败静默跳过并保留上一次的值
  （一次网络抖动不该让角标归零，用户会误以为任务都跑完了）。
- 「标记为已连接」必须发生在拿到响应之后，不是构造完 client 对象就写。
  iOS 上 `URLSession` 的 task 创建同样不代表连通，Android 的 `Retrofit` 实例化亦然。
- **连接标识必须全局只有一份实现**。web 端这个 bug 的另一半就是同一个 map 有两套 key
  算法（见上文「收口」），native 端同样容易犯 —— 把「连接 → 唯一键」收敛成一个函数，
  归一化失败时返回空并拒绝写入，而不是各处 `"\(agent)::\(mode)::\(url)"` 手拼。
- 角标生命周期不能绑在任何页面上（见
  `2026-08-20-16-05-tabbar-badge-autonomous-service.md`：这套逻辑原先活在会话页的
  `onShow` / `onUnload` 上，而冷启动落在「连接」页、会话页可能整个会话期间都没挂载过）——
  iOS 放 `AppDelegate` / `SceneDelegate`，Android 放 `Application` 或
  `WorkManager` 的周期任务。

## 已知遗留

「待办」页不会触发 `refreshConversationTabBadge`，App 的 `onShow` 也不在应用内 tab
切换时触发。所以冷启动**直接落在待办页**的话，角标要等到用户切去别的 tab 才出现。
这与本次根因无关（是同一类「刷新入口覆盖不全」的问题），未在本次改动范围内处理。
