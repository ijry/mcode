# 新建连接需要「确认两次」才连上的成因与修复

## 问题现象

在连接页新增网关（relay）连接，第一次点「确认」提示连接失败，表单不关；再点一次就成功。

## 根因

`submitConnection()` 的 gateway 分支原本是一条「全成功才落盘」的链：

```
createGateway(mode=relay) → gateway.pair() → assertPairTargetAgentMatchesSelection()
→ buildConnectionItem() → assertConnectionReachable() → saveConnection() → closeAddPopup()
```

链上任何一步抛错都只弹一个 toast，不落盘、不关弹层，于是用户再点一次。三个独立诱因：

1. **在线判定与配对之间存在时序竞争。** `assertConnectionReachable` 走
   `GET /v1/targets`，取 `targets[currentTargetId].online`。relay 侧该字段来自
   `hub.isDesktopOnline(targetId)`，实现就是 `this.desktops.has(targetId)` ——
   只反映桌面端 `/v1/tunnel/desktop` WebSocket **当下**是否注册，没有心跳宽限期
   （`lastSeenAt` 有记录但无 reaper，桌面端 Rust 侧也不发 `desktop_heartbeat`，
   relay 只有接收分支）。`POST /v1/pair` 本身不检查 desktop WS 状态。桌面端上游一旦
   抖动重连（`connect_upstream_until_stopped` 指数退避 1s→30s），relay 立刻
   `unregisterDesktop` 把 target 置 offline，这一秒探测必失败，下一秒重注册后
   第二次点确认就过。
2. **探测超时偏紧且零重试。** `probeRelayOnline` / `probeDirectOnline` 都硬编码
   `timeout: 3000`。移动网络叠加冷启动网关很容易超时；第二次点时 TCP/TLS 已热。
3. **`RelayGateway.pair()` 不校验 statusCode。** 401 `{"error":"pairing failed"}`
   时 `raw.accessToken` 为 undefined，仍构造出 `accessToken: ""` 的会话对象返回，
   错误被延后到 `assertPairTargetAgentMatchesSelection` 抛「网关配对响应缺少目标类型，
   请更新 MCode Desktop 或网关」或 `probeRelayOnline` 抛「网关会话不可用」——
   把「配对码已失效」误报成「请升级 Desktop」。

另有一个隐性副作用：`consumeOffer`（`mcode-relay/src/pairing/store.ts`）是一次性的，
offers 只存内存 Map 且不进快照，桌面端仅在 WS 建立时推一次 `pair_offer`。所以只要
`pair` 已经成功，那张配对码就被消费掉了；此后探测失败不落盘，等于**白烧一张码**，
用户第二次点确认必定 401。

## 修复

### 1. `RelayGateway.pair()` 明确失败

文件：`mcode-app/src/services/gateway/relayGateway.ts`

- 补 `timeout: PAIR_TIMEOUT_MS = 15_000`。
- `statusCode >= 400` 直接抛错；401/403 走 `describePairFailure()` 给出
  「配对码已失效或已被使用，请在电脑端重新生成配对码」，其余复用
  `toResponseErrorMessage`。
- 响应缺 `accessToken` 时抛「网关未返回访问令牌」，不再返回空会话。

### 2. 可达性探测加短窗口重试

文件：`mcode-app/src/services/connection/reachability.ts`（新增）

`probeWithRetry(probe, options)`：默认 3 次尝试、间隔 1200ms，`sleep` 可注入以便测试，
`onRetry` 回调供 UI 反馈。`assertConnectionReachable` 与新建连接路径都走它。
单次探测超时从 3s 放宽到 `CONNECTION_PROBE_TIMEOUT_MS = 8000`。

### 3. 配对成功即落盘

文件：`mcode-app/src/pages/connections/index.vue`

gateway 分支不再让探测失败回滚整次操作：

- `pair` 成功后先 `saveConnection` + `syncConnectionRuntimeState`；
- 探测在线 → toast「配对成功」；
- 探测失败 → `markConnectionFailure(..., "error")` 并 toast「配对已完成，但主机暂时不可达：…」。

弹层照常关闭，卡片上「立即重试」/「排查建议」按钮生效，走 `connectConnection()`
→ `ensureRelaySession()` 复用已落盘的 session，不再消费配对码。

## 数据流与协议

协议帧、接口路径均未改动。行为差异集中在客户端：

- `POST /v1/pair` 的非 2xx 响应现在会被客户端识别为错误并翻译成可执行提示。
- `GET /v1/targets` 的 `online` 字段语义未变，但客户端不再据单次结果下最终结论。

## 兼容性

- 存量连接记录格式不变，无迁移。
- 「配对成功但不可达」的连接会以 `connected=true` + `online=false`（卡片显示
  「连接异常」）落盘。这是有意的：记录可重试，且不会误报为在线。
- relay / desktop 侧未改动，旧版网关与桌面端均兼容。

## 原生端（iOS / Android）复刻要点

1. 配对请求必须校验 HTTP 状态码，并把 401/403 映射为「配对码失效，请重新出码」，
   不要把缺字段的响应当成成功会话继续往下走。
2. 配对请求超时给到 15s 量级；可达性探测超时给到 8s 量级。
3. 可达性判定用「短窗口内多次探测」（3 次 × 1.2s）而非单次，因为服务端 `online`
   等价于桌面端 WebSocket 的瞬时注册状态。
4. 配对成功后**立即持久化**连接与会话令牌，再做可达性探测；探测失败只降级展示状态，
   不要丢弃已经消费掉的配对码。
5. 重试路径应复用已持久化的 access token，只有在没有会话时才重新用配对码换令牌。

## 遗留项

根因 1 在服务端仍未彻底消除：若要让 `online` 不随桌面端重连抖动，需要桌面端定期发送
`desktop_heartbeat`，并让 `hub.isDesktopOnline` 依据 `lastSeenAt` 给出数秒宽限。
本次未改动 relay/desktop —— 宽限期会让「桌面端刚掉线」的窗口内请求被路由到已失效的
连接上，取舍需要单独评估。

## 验证

- `mcode-app`: `npx jest --config jest.config.cjs --runInBand` → 147 suites / 1126 tests 全绿
  （新增 `tests/services/connectionReachability.spec.ts` 3 例、`tests/services/relayGateway.spec.ts`
  追加 3 例 pair 断言）。
- `npx vue-tsc --noEmit -p tsconfig.json`：`pages/connections/index.vue` 仅剩 `conn.id`
  可选性导致的 3 条**存量**报错（行号因插入而位移），本次改动未引入新报错。
