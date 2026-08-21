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
- 角标生命周期不能绑在任何页面上（见
  `2026-08-20-16-05-tabbar-badge-autonomous-service.md`：这套逻辑原先活在会话页的
  `onShow` / `onUnload` 上，而冷启动落在「连接」页、会话页可能整个会话期间都没挂载过）——
  iOS 放 `AppDelegate` / `SceneDelegate`，Android 放 `Application` 或
  `WorkManager` 的周期任务。
