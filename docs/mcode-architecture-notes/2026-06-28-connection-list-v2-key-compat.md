# 2026-06-28 Connection List V2 Key Behavior

## Architecture

会话列表和待办“发送到新会话”统一通过 `readStoredConnections()` 读取
`ConnectionContext`。P42 后该读取路径只接受 v2 `targetAgent + routeMode`
连接模型，不再在列表、待办或详情页兼容旧 `direct | relay` 记录。

唯一保留的旧连接处理入口是连接首页调用
`migrateLegacyStoredConnectionsToV2()`，把本机 `mcode_connections` 中的旧
`mode/url/relaySession` 记录一次性改写为 v2 记录。其他页面不得复制这段迁移逻辑。

## Protocol And Data Flow

`mcode_connected_map` 的 key 是唯一 v2 连接 key：
`targetAgent::routeMode::routeIdentity`。P42 后页面判断连接是否已连接时只接受这个
v2 key，不再接受旧 key：`direct::baseUrl` 或 `relay::gatewayBaseUrl`。

共享边界在 `connectionContext`：

- `buildConnectionKey(connection)` 返回唯一 v2 key。
- `connectionKeyMatches(connection, key)` 只比较 v2 key。
- `isConnectionMarkedConnected(connection, connectedMap)` 只检查 v2 key。

页面创建 gateway 时统一调用 `resolveConnectionContext()`，由 driver 处理网关
session 刷新和 targetAgent 校验；解析出的最新 connection 会回写到页面对象，确保后续
auth 同步和详情页跳转携带最新 v2 session。

会话总览加载远端连接后，会记录 `remote instanceKey -> v2 connectionKey` 的内存映射。
打开标签事件或本地缓存刷新优先用该映射定位连接；映射不存在时不得再退回到旧
`mode/baseUrl` key。这样同一网关域名下同时连接 `codeg`、`opencode`、
`mcode-desktop` 时，不会因为旧 `relay::gatewayUrl` 相同而刷新到错误目标。

## UI Behavior

会话页的“请先添加连接”只在没有任何已保存 v2 连接时展示。保存了 v2 连接但暂未在线时，
页面应进入会话视图并显示离线分组或错误分组，而不是提示未添加连接。

仍保留旧 `mcode_connected_map` key 的客户端状态不再作为已连接依据；用户需要进入连接页
完成一次性旧连接迁移并重新连接。

会话页和待办页跳转会话详情时传完整编码连接上下文，而不是只传裸 key。详情页可直接恢复
v2 connection/session，不依赖旧 `mode::url` 查找。

## Compatibility

P42 废止本 note 早期的旧 key 兼容策略。配置码导入、详情页查找、会话列表、待办 picker
和 connected-map 判断都只使用 v2 结构。旧连接自动转换只允许发生在连接首页。

## Native iOS/Android Replication Guidance

原生端复制时，连接列表和会话选择器只使用 v2 key。不要同时检查旧
`direct::url` / `relay::url` key。任何从远端实例 descriptor 反查连接的逻辑都不要只用
descriptor 的 `mode/baseUrl` 作为主键。

原生端如果维护实时订阅或 opened-tabs 缓存，应保存 `instanceKey -> connectionKey` 映射；
缓存缺失时应重新从 v2 连接上下文建立映射，而不是走 legacy descriptor fallback。

原生端打开会话详情时应传完整 connection context 或等价的安全引用，以保留
`targetAgent`、`routeMode`、网关 session 和 target profile。
