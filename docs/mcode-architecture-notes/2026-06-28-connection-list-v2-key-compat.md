# 2026-06-28 Connection List V2 Key Compatibility

## Architecture

会话列表和待办“发送到新会话”不再直接读取 `mcode_connections`
原始数组，也不再用旧的 `mode::url` 作为唯一连接 key。它们统一通过
`readStoredConnections()` 读取 `ConnectionContext`，由连接 schema 负责把旧
`direct | relay` 记录归一到 v2 `targetAgent + routeMode` 模型。

## Protocol And Data Flow

`mcode_connected_map` 的主 key 是 v2 连接 key：
`targetAgent::routeMode::routeIdentity`。为了兼容已存在客户端状态，页面判断连接
是否已连接时同时接受旧 key：`direct::baseUrl` 或 `relay::gatewayBaseUrl`。

共享边界在 `connectionContext`：

- `buildConnectionKeyCandidates(connection)` 返回 v2 key 和 legacy route key。
- `connectionKeyMatches(connection, key)` 用于从页面选中 key、历史 group key 或远端
  descriptor 反查连接。
- `isConnectionMarkedConnected(connection, connectedMap)` 用于列表页判断连接是否在线。

页面创建 gateway 时统一调用 `resolveConnectionContext()`，由 driver 处理直连 token、
网关 session 刷新和 targetAgent 校验；解析出的最新 connection 会回写到页面对象，确保
后续 auth 同步和详情页跳转携带最新 session。

会话总览加载远端连接后，会记录 `remote instanceKey -> v2 connectionKey` 的内存映射。
打开标签事件或本地缓存刷新优先用该映射定位连接；只有映射不存在时，才用远端 descriptor 的
`mode/baseUrl` 作为 legacy fallback。这样同一网关域名下同时连接 `codeg`、`opencode`、
`mcode-desktop` 时，不会因为 `relay::gatewayUrl` 相同而刷新到错误目标。

## UI Behavior

会话页的“请先添加连接”只在没有任何已连接记录时展示。保存了 v2 连接且
`mcode_connected_map` 使用 v2 key 的用户，会正常看到会话分组；仍保留旧 key 的历史用户
也会正常显示。

会话页不再把“当前在线”当作“是否有连接”的前置条件。只要本地已保存连接存在，
页面就应进入会话视图，并在连接离线时仅显示空分组或错误分组，而不是直接提示
“请先添加连接”。这避免了用户已经完成保存但尚未联机时被误导成未添加连接。

当连接离线时，会话页应为每条已保存连接保留一个离线分组，分组文案直接显示
“连接离线”，而不是把它们从列表里隐藏掉。这样用户可以区分“没添加连接”和
“连接已保存但当前不可用”两种状态。

会话页和待办页跳转会话详情时传完整编码连接上下文，而不是只传裸 key。详情页可直接恢复
v2 connection/session，不需要依赖旧 `mode::url` 查找。

## Compatibility

旧连接不需要用户重新添加或重新连接。若 `mcode_connected_map` 里仍是
`relay::https://...`，会话列表和待办 picker 仍会识别；连接页后续刷新仍会逐步使用 v2 key。

## Native iOS/Android Replication Guidance

原生端复制时，连接列表和会话选择器应以 v2 key 为主，但在迁移期必须同时检查旧
`direct::url` / `relay::url` key。任何从远端实例 descriptor 反查连接的逻辑都不要只用
descriptor 的 `mode/baseUrl` 作为主键，应把它作为 legacy candidate 去匹配本地 v2 连接。

原生端如果维护实时订阅或 opened-tabs 缓存，应保存 `instanceKey -> connectionKey` 映射；
descriptor fallback 只能用于启动早期或缓存缺失时的降级路径，不能作为多 target 网关场景的
唯一定位方式。

原生端打开会话详情时应传完整 connection context 或等价的安全引用，而不是只传显示用 key；
这样可以保留 `targetAgent`、`routeMode`、网关 session 和 target profile。
