# 支持 DeepSeek Harness（targetAgent = dsh）

## 这件事是什么

MCode 现在可以遥控一台跑着 **DeepSeek Harness**（`dsh`）的桌面。承接侧是 dsh 的一个插件
`dsh-plugin-mobile-bridge`（住在 `DeepSeek-Harness-Desktop-Ultra` 仓库的 `plugins/` 下，随桌面
外壳的安装包分发）。它在 dsh 里开一个**带鉴权的窄接口**，手机扫码配对后就能看会话、发消息、
看流式回复、批准工具调用。

```
MCode App
  │  扫码 → 一次性配对码 → Bearer token
  │  REST（/dsh-mobile-bridge/*） + WebSocket（/dsh-mobile-bridge/ws）
  ▼
dsh-plugin-mobile-bridge          ← 承接插件，不在本仓库
  │  只调允许清单里的方法（in-process）
  ▼
dsh 自己的 /api（apiProxy）
```

## 为什么 `dsh` 是一个独立的 targetAgent

`ConnectionTargetAgent` 加了第四个值 `"dsh"`。它**不是** `mcode-desktop` 的一个能力位：那是另一个
进程、另一套协议 —— 与 `codeg` / `opencode` 各自成项是同一个理由。它也**不是**「按 CLI 拆 target」，
`mcode-desktop` 代理的官方 CLI 仍然只在 `mcode-desktop` 后面（见
`2026-06-25-multi-provider-connection-routing.md`）。

## 耦合点只有一个目录

DSH 的全部实现在 `mcode-app/src/agents/dsh/`：

| 文件 | 职责 |
| --- | --- |
| `protocol.ts` | 桥的线上契约（前缀、帧类型、错误码、能力键、URL 构造）。是桥仓库 `src/shared/protocol.js` 的手抄本 —— 两个仓库不能互相依赖，桥必须零依赖 |
| `acpTranslation.ts` | **桥的帧 ↔ ACP 事件**。纯函数，测试最密的一块 |
| `bridgeGateway.ts` | `CodegGateway` 实现：ACP 命令 → 桥接口，WebSocket → ACP 事件 |
| `driver.ts` | `ConnectionDriver`：一条 `ConnectionRecordV2` → 一个可用 gateway |
| `capabilities.ts` | 能力键 → 连接卡片上的中文标签 |

目录之外的改动全部是「把 `"dsh"` 加进一个封闭联合」，共 10 处：`connectionSchema.ts`（类型 + 运行时
集合）、`agents/shared/driverTypes.ts`（`ConnectionDriverId` + 收窄）、`services/gateway/types.ts`、
`services/gateway/relayGateway.ts`（配对元数据收窄）、`services/connectionContext.ts`、
`pages/conversation-detail/detailConnectionResolution.ts`、`pages/connections/connectionTargetAgentOptions.ts`、
`pages/connections/connectionPresentation.ts`、`services/connectionPairValidation.ts`、
`services/gateway/connectionDriverRegistry.ts`。

**关键设计**：`AcpApiClient` 的每条命令都走 `gateway.call(command, payload)`，事件都从
`connectEvents(onEvent)` 进。所以在 gateway 这一层把两套词汇对上之后，会话详情、流式渲染、审批与
提问**一行都不用改** —— 应用侧对「宿主是 dsh」这件事一无所知。

## 协议与数据流

信封统一 `{ ok: true, value }` / `{ ok: false, error: { code, message, dshCode? } }`。

**ACP 命令 → 桥接口**（`bridgeGateway.call`）：

| ACP 命令 | 桥 |
| --- | --- |
| `health` | `GET /hello` |
| `acp_list_agents` | 合成一条 `{ agent_type: "dsh" }`（桥后面只有一个 dsh） |
| `acp_describe_agent_options` | 空快照 `{ modes: null, config_options: [] }` |
| `acp_connect` | `POST /sessions`；带了 `sessionId` 就直接复用 |
| `acp_prompt` | `POST /sessions/:id/prompt` |
| `acp_cancel` | `POST /sessions/:id/cancel` |
| `acp_get_sessions` / `acp_get_session_snapshot` | `GET /sessions` |
| `acp_respond_permission` | `POST /answers`（`kind: approval`） |
| `acp_respond_question` | `POST /answers`（`kind: question`） |
| `get_conversation_messages` | `GET /sessions/:id/messages` |
| 其余 | **明确报错**，不静默成功 |

最后一行是刻意的：dsh 里没有后台任务看板、没有 Git 面板、没有文件树。让这些命令静默成功会让界面
给出做不到的承诺；报错能让上层的能力判断把入口关掉。

**桥的帧 → ACP 事件**（`acpTranslation.toAcpEvents`）：

| 桥 | ACP |
| --- | --- |
| `message/delta`（kind text / reasoning） | `stream_batch`（`contentType: text` / `thinking`） |
| `message/end`（role user） | `user_message` |
| `message/end`（role assistant） | **不发** —— 正文已经流过去了，再发一遍气泡里会出现两份 |
| `message/end`（role tool） | `tool_call_update`（补 output） |
| `tool/call` | `tool_call` |
| `tool/result` | `tool_call_update` |
| `session/status`（running true） | `turn_started`（false 不发，结束由 `turn/end` 表达） |
| `turn/end` | `turn_complete` |
| `approval/requested` | `permission_request`，两个选项 `allowed-once` / `rejected` |
| `question/requested` | `question_request`（`questions` 转成 `QuestionSpec`） |
| `error` | `error` |
| 其余 | 丢掉，不猜 |

`permission_request.id` **必须**是 dsh 铸的那个 `rpcId` 原样回传。用新 id 回答会让 dsh 一直等下去 ——
这是这一层最容易出错的地方，测试专门钉了它。

## 配对：直连地址 + 一次性配对码

二维码里是 **base64url 编码的 MCode v2 配置码**，所以现有扫码路径不用改格式：

```jsonc
{ "version": 2, "name": "书房台式机 的 dsh", "targetAgent": "dsh", "routeMode": "direct",
  "directBaseUrl": "http://192.168.1.20:8790/dsh-mobile-bridge",
  "pairCode": "ABCD-2345", "pairSecret": "...",
  "candidates": ["http://10.8.0.2:8790/dsh-mobile-bridge"] }
```

`routeMode: "direct"` 配 `pairCode`/`pairSecret` 是**新增的组合**：地址是直连的，凭据要换。Bearer
token 绝不能放进一张任何人都能拍下来的二维码里。因此 `connectionConfigCode.ts` 的
`assertConfigCodeCredentials` 对 `dsh` 放行「有配对码但没有 directToken」，而 `driver.connect()` 在
第一次连接时用配对码去桥上换一对令牌、写进 `gatewaySession`、并把用掉的配对码清掉。

配对码**一次一用**、用掉自动换新、30 分钟过期，且只在桥进程内存里（重启即失效）。所以：
- 换过一次之后再拿旧码去配对必然 401，提示语要说「重新出码」而不是「密钥错误」。
- 令牌换到手必须落盘，否则下一次连接会拿一张已经失效的码去试。

`candidates` 是二维码带来的备用地址（最多两条）。笔记本换 Wi-Fi 不会通知任何人，主地址失效时备用
地址常常还通，所以 driver 逐个试；代价是失败时每个地址各自超时一次。

## 事件流用 WebSocket 而不是 SSE

桥两个载体都有。App 端用 WebSocket，因为 uni-app 的 App 运行时 `EventSource` 不可靠 —— 这也是
现有直连传输选 WebSocket 的原因。令牌不能走 `Authorization` 头（浏览器不允许给 WebSocket 设头），
所以走桥约定的子协议 `dshm-token.<base64url(token)>`，握手时连同 `dshm-events` 一起 offer。

WebSocket 没有 SSE 的 `id:` 字段，所以续传点放在信封里：`{ eventId, event, data }`。重连时把
`lastEventId` 放进查询串，还在桥的环形缓冲（600 帧）里的会补发；超出范围时 `hello` 帧带
`gap: true`，此时应当重新拉一次历史而不是渲染出一个洞。

## relay 侧

`mcode-relay` 的 `TargetAgent` 加了 `"dsh"`。顺手把三处重复的收窄（配对 offer、target upsert、
快照恢复）收成一个 `isTargetAgent()`：之前它们各自抄了一份联合，而「两处接受、第三处丢掉」的后果
是配对成功、连上、然后 relay 一重启目标就没了。

当前桥**不走 relay**（它是宿主上的一个监听，公网靠隧道把那个端口搬出去）。加这个值是为了让
relay 能描述一个 dsh 目标、也为将来桥支持反向拨号留好位置 —— 那需要桥去实现 relay 的
desktop upstream 协议（`desktop_hello` / `tunnel_request` / `event_push`），是另一件事。

## 兼容性

- **纯增量**：三个既有 targetAgent 的行为一行未变，`resolveConnectionDriver` 的既有分支顺序不变。
- **选项表里 `dsh` 是 `hidden: true`**，与 `opencode` / `mcode-desktop` 一致：新建连接的表单里看不到，
  但编辑一条已存的 dsh 连接时会出现。**不能**从表里删掉 —— 查不到会把下标算成 0，一保存就把连接
  类型悄悄改掉。
- **旧版本 App 扫到 dsh 配置码**会在 `normalizeV2ConfigCodePayload` 处失败并提示不支持，不会存出一条
  半残的记录。
- **桥以后多宣称一个能力**，旧 App 只会少显示一个 chip（`capabilities.ts` 只映射认识的 key）。
- 桥的协议版本在 `/hello` 的 `protocolVersion`；客户端应当读**能力列表**做判断，而不是比版本号。

## 原生 iOS/Android 复刻要点

1. 目标类型加 `dsh`，与既有三个并列，不要做成某个宿主的能力位。
2. 直连模式要接受「有 `pairCode`/`pairSecret`、没有 token」这一组合，并在首次连接时换令牌、落盘、
   清掉配对码。
3. 事件流用 WebSocket，令牌走子协议 `dshm-token.<base64url(token)>`；重连带 `lastEventId`，收到
   `hello.gap === true` 就重拉历史。
4. 帧 → 本地事件的映射照上面那张表，尤其两条：assistant 的 `message/end` 不要再渲染一次正文；
   审批回答必须原样回传 `requestId`。
5. 做不到的功能要**报错**而不是静默成功，并据此把入口关掉。
6. 桥地址允许用户手抄（隧道场景），所以要容错「只填到域名」——自动补 `/dsh-mobile-bridge`，判断
   条件是结尾而不是包含。

## 参考

- 桥的 README 与协议表：`plugins/dsh-plugin-mobile-bridge/README.md`（DSH Desktop Ultra 仓库）
- 外网接入（Cloudflare Tunnel / 命名隧道 / Tailscale / 反代）：
  `plugins/dsh-plugin-mobile-bridge/docs/public-access.md`
- 连接体系的双维模型：`2026-06-25-multi-provider-connection-routing.md`
- v2-only 连接协议：`2026-06-29-p42-v2-only-connection-protocol.md`
