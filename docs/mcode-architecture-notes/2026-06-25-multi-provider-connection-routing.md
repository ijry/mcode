# 2026-06-25 Multi-Provider Connection Routing

## Roadmap Status

The original conversation-level roadmap was P1-P6. The first `2026-06-25` implementation plan covered the foundation, but P3-P6 were later split into separate `2026-06-26` plans. Use `docs/superpowers/plans/2026-06-25-mcode-p1-p6-roadmap-status.md` as the canonical phase-status index.

## Architecture

`mcode` 的连接体系从单一 `direct | relay` 升级为双维模型：

- `targetAgent = codeg | opencode | mcode-desktop`
- `routeMode = direct | gateway`
- `gatewayProvider = official | custom`

核心边界：

- `codeg` 与 `opencode` 可以不经过 `mcode-desktop` 直连。
- `routeMode = gateway` 也必须保留并展示 `targetAgent`；网关模式不是
  `mcode-desktop` 的同义词，同一网关下可以分别连接 `codeg`、
  `opencode`、`mcode-desktop` logical target。
- `codex` 官方 CLI 与 `claude` 官方 CLI 不作为移动端独立 target，统一由 `mcode-desktop` 代理后暴露给 app。
- `mcode-relay` 是网关服务，负责配对、转发、事件流和 session refresh，不负责 CLI 语义归一化。
- `mcode-app` 继续消费统一的远端命令/事件契约；direct target adapter 和 `mcode-desktop` bridge 各自把实现映射到这套契约。
- `mcode-desktop` 明确采用 Tauri 形态：前端提供连接/配对/隧道/诊断 UI，后端托管 bridge server、CLI adapters、gateway upstream 和后台守护生命周期。
- `mcode-desktop` 初始工程已经落为独立 Tauri + Vue workspace：前端用 Pinia 保存 relay 状态、pair code/secret、capabilities 和 tunnel bind；Rust 后端用 `AppState` 保存 relay URL、当前 pair offer 与 capability 列表。
- `mcode-desktop` 的宿主机制参考 `LinkShell`：本地桥接、可拆分网关、共享协议、ACK 缓冲、重连恢复、单控制者模型、tunnel 预览。
- `mcode-app` 的前端支持必须按 agent 目录隔离；推荐 `src/agents/codeg`、`src/agents/opencode`、`src/agents/mcode-desktop`、`src/agents/shared`，避免把所有 agent 判断继续堆在共享服务里。
- `mcode-app` 现已通过 `src/services/gateway/connectionDriverRegistry.ts` 按 `targetAgent + routeMode` 选择 driver；各 agent 目录只保留自己的入口文件，共享直连/网关接线逻辑放在 `src/agents/shared/driverTypes.ts`。

## Protocol And Data Flow

持久化连接记录升级为 `version: 2`，新增字段：

- `targetAgent`
- `routeMode`
- `directBaseUrl`
- `gatewayProvider`
- `gatewayBaseUrl`
- `gatewaySession`
- `targetProfile`

兼容规则：

- 旧 `mode = direct` 迁移为 `targetAgent = codeg`、`routeMode = direct`
- 旧 `mode = relay` 迁移为 `targetAgent = codeg`、`routeMode = gateway`、`gatewayProvider = official`
- 新二维码 / 配置码写 `version: 2`
- app 继续兼容读取 `version: 1`
- 当前 `mcode-app` 的 Task 1 落地会在 `version: 2` 记录旁临时保留 `mode` / `url` / `relaySession` 兼容别名，直到连接页和详情页全部切到 `targetAgent` / `routeMode`

网关协议变化：

- `POST /v1/pair` 和 `/v1/session/refresh` 返回 target metadata
  - `targetId`
  - `targetAgent`
  - `displayName`
  - `capabilities`
  - `protocolVersion`
- `/v1/proxy/:command` 和 `/v1/events` 保持统一转发入口
- 预留 tunnel 转发入口供 desktop 暴露本地 dev server 预览
- relay 只转发 payload，不做 target-specific 改写
- desktop / relay 握手需带协议版本，并支持 ACK 序号、重放窗口和断线后短时会话保留
- app 侧把上述 metadata 同时归一到 `gatewaySession` 与 `targetProfile`；pair 和 refresh 任一返回了新值，都可以覆盖本地旧的 target 展示信息和能力列表。
- app 侧创建新的网关连接时，必须把用户选择的 `targetAgent` 与 pair
  响应中的 `targetAgent` 做一致性校验；配对码属于其他 target 时不得保存。
- app 侧新增 `applyPairMetadata(connection, session, target)` 作为 pair/refresh metadata 回写边界：`targetAgent` 以 target metadata 优先，`gatewaySession` 保留 token 并合并 target metadata，`targetProfile` 用于 UI 展示和能力判断。
- relay 侧的 `PairingStore` 已保存 `targetAgent`、`capabilities`、`protocolVersion`；`pair_offer` 和 `desktop_hello` 从 desktop 上游同步这些字段，历史调用缺省按 `codeg` / protocol `1` 兼容。
- `/v1/events` 推送统一包装为 `{ eventId, channel, payload, controllerId? }`，relay 为每个 target 维护有限 replay buffer；mobile 重连时可带 `lastEventId` / `last_event_id` 查询参数补收缺失事件。
- `/v1/tunnel/:targetId/:port/*` 是 mobile 到 desktop 本地 HTTP 服务的网关入口。relay 校验 access token 中的 `targetId` 必须等于 path target，再向 desktop upstream 发送 `tunnel_request`，desktop 以 `tunnel_response` 返回 status/headers/body。
- desktop upstream hello 使用 `targetAgent = "mcode-desktop"` 与 `protocolVersion = "1"`，不再使用旧的 `targetType` 命名；序列化到 JSON 时字段名保持 camelCase。
- desktop capability keys 当前固定为 `desktop.runtime.codex-cli`、`desktop.runtime.claude-cli`、`desktop.tunnel.available`。原生端展示层应只把认识的 key 映射成标签，未知 key 保留给后续扩展。

desktop 外网接入流程：

1. `mcode-desktop` 把本地目标绑定到 `127.0.0.1:1080`
2. desktop 向 `mcode-relay` 注册 target
3. desktop 生成 `version: 2` 网关二维码
4. `mcode-app` 扫码后保存 `routeMode = gateway` 连接

desktop 运行方式：

- 桌面窗口关闭后，bridge / upstream 可继续在托盘中运行
- 用户从 tray 或主窗口恢复、停止、重启 bridge
- 官方 CLI 子进程由 Tauri backend 统一监管，不要求用户手工执行命令行
- 初始 Tauri scaffold 暴露 `show_window`、`hide_window`、`shutdown_runtime` 命令，tray 菜单使用相同 command id，原生客户端复制时需要保持“窗口可隐藏但 runtime 可继续存在”的生命周期语义。
- bridge/runtime scaffold 已拆分为 `bridge`、`runtime`、`gateway`、`tunnel` 模块：CLI adapter 先提供命令分发边界，gateway 先提供 upstream hello/control-frame 解析边界，tunnel 默认把 Code 预览绑定到 `127.0.0.1:1080`。

## UI Behavior

新增连接页分成两种模式：

- `直连`
  - `Codeg`
  - `OpenCode`
  - `MCode Desktop`
- `中转（网关）`
  - `Codeg`
  - `OpenCode`
  - `MCode Desktop`
  - provider 下拉：`MCode 官方网关`、`自定义`
  - 选择 `自定义` 后展示域名输入框

显示规则：

- 用户可见文案统一用 `网关`，不再新增 `中继` 文案。
- 连接卡片同时展示目标类型和路由方式。
- 新增/编辑网关连接时不得把 `targetAgent` 强制改成
  `mcode-desktop`；`targetAgent` 由用户选择，并由 pair metadata 校验。
- `MCode Desktop` 连接可显示能力标签，如 `Codex CLI`、`Claude CLI`、`内网穿透`。
- web/uni-app 连接卡片通过 `getConnectionCapabilityChips()` 从 `targetProfile.capabilities` 映射能力标签；当前只展示认识的 desktop capability，未知 key 不展示但保留在数据层。
- 网关模式下 target metadata 以 pair/refresh 返回值为准，UI 不强信本地旧值。
- web/uni-app 新增连接表单已经使用 `routeMode`、`targetAgent`、`gatewayProvider` 作为主状态；`mode`、`url`、`relaySession` 只作为当前网关运行时代码的兼容别名保留。
- web/uni-app 新增连接表单现已把“目标类型”提升为直连/网关共用字段；切换到网关不会再把
  `targetAgent` 改写为 `mcode-desktop`。
- web/uni-app 网关配对成功后会校验 relay 返回的 `gatewaySession.targetAgent`，如果配对码属于其他目标类型则拒绝保存。
- web/uni-app runtime gateway driver 也复用同一 target 校验；保存后的连接在重连、会话过期后重新配对、或使用已有
  `gatewaySession` 时，不能被 relay metadata 静默改写到另一个 `targetAgent`。
- web/uni-app driver registry 现按 `codeg/gateway`、`opencode/gateway`、`mcode-desktop/gateway`
  分别选择 driver id，避免把 OpenCode 网关连接落到 Codeg 兼容 driver 标签。
- `MCode 官方网关` 不展示域名输入框，构建时从 `VITE_MCODE_OFFICIAL_GATEWAY_BASE_URL` 读取默认网关地址；如果未配置，保存时提示“官方网关地址未配置”。选择 `自定义` 时必须填写 `gatewayBaseUrl`。

## Compatibility

- 旧连接继续可用，不要求用户重建。
- 历史 relay 连接默认按 `codeg` 网关连接处理；如果后续刷新拿到新的 `targetAgent`，静默更新本地缓存。
- `mcode-relay` 是服务名，app 文案统一显示为 `网关`。
- 首版正式新增入口重点支持 `mcode-desktop/gateway`；历史 `codeg/gateway` 仍保留兼容路径。
- 原生新实现不需要复制 web 端这层旧字段别名；只有在同一个客户端里仍存在旧页面或旧路由读取逻辑时，才需要做相同兼容桥接。
- 当历史 `codeg/gateway` 记录在 pair 后被识别成 `mcode-desktop` 时，持久化必须按“配对前的连接键”回写同一条记录，再把新 `targetAgent` 保存进去；否则会因为主键从 `codeg` 变成 `mcode-desktop` 而丢失升级结果。

## P6 Enterprise Gateway Behavior

P6 第一版只做企业自部署网关的最小闭环，不引入租户、设备管理或连接吊销后台：

- `mcode-relay` 继续沿用现有 pair / session refresh / proxy / events / tunnel 协议。
- 新增公开诊断接口 `GET /health` 和 `GET /v1/gateway/info`，用于部署检查、版本检查和客户端兼容诊断。
- 公开健康信息只暴露网关名称、`PUBLIC_BASE_URL`、`DEPLOYMENT_ENV`、`LOG_POLICY`、`AUDIT_POLICY`、版本、协议版本、统计和安全警告。
- `productionReady` 仅表示当前部署满足最小生产安全条件，不代表已经具备租户隔离、设备吊销或审计后台。
- 自部署网关与官方网关在协议上保持一致；区别只在部署位置、域名、TLS 和运维策略。
- 原生 iOS/Android 复制时，只把 `/v1/gateway/info` 当作可选诊断信息，不应把它变成连接必需依赖。

安全与可观测边界：

- 公共健康/信息接口不得泄露 secret、token、pair code、session id、target name 或客户端 IP。
- `JWT_SECRET` 默认值、缺失 `PUBLIC_BASE_URL`、以及 `ALLOW_DEV_SECRETS=true` 都应在健康接口里显式给出 warning。
- `stats` 只统计 targets、sessions 和在线 desktop 数量，不增加用户/设备维度。
- 如果未来需要租户、设备、吊销和访问策略，这些应单独进入下一阶段，不回灌到 P6 的公共接口里。

## Native iOS/Android Replication Guidance

原生端应完全复刻以下规则：

- 连接模型必须同时保存 `targetAgent` 与 `routeMode`，不要再用单字段 `mode` 代替。
- `routeMode = gateway` 时仍必须保存用户选择并经 pair metadata 校验后的
  `targetAgent`；原生端不要把所有网关连接当作 `mcode-desktop`。
- direct token 与 gateway session 分开存储，且 direct token 只按 direct base URL 作用。
- 二维码 / 配置码必须支持 `version: 1` 读取和 `version: 2` 写入。
- 网关连接创建后，以 pair/refresh 响应中的 `targetAgent`、`displayName`、`capabilities` 覆盖本地缓存。
- 连接驱动选择必须基于 `targetAgent + routeMode`，而不是只看 URL 或旧 `mode`。
- desktop capability 缺失时，应在入口层阻止进入而不是等 RPC 调用失败。
- 对 desktop gateway 连接，原生端要准备好消费 ACK/重放式事件流与单控制者状态，而不是假设永远只有单设备在线。
- 前端代码组织也应按 agent 分目录，agent-specific 组件和适配逻辑不要回灌到共享大文件。
- relay event wrapper 中 `eventId` 是按 target 递增的 relay 序号；原生端断线重连时应保存最后处理成功的 id，并用 `lastEventId` 重新连接 `/v1/events`。
- tunnel HTTP 预览必须走 authenticated gateway URL，原生端不能直接信任二维码里的本地端口；只有 relay token 所属 target 能访问对应 `/v1/tunnel/:targetId/:port/*`。

## P3 Desktop Basic Behavior

`mcode-desktop` P3 已从静态 Tauri shell 升级为可配置桌面宿主。Rust 后端通过 `AppState` 保存 `targetId`、`displayName`、网关配置、upstream 状态、当前 `PairOffer`、capabilities 和本地服务配置；前端通过 Tauri commands 读取同一份状态，不再使用硬编码 pair code 或静态 tunnel bind。

P3 Tauri command 边界：

- `desktop_get_health` 返回 `targetAgent = "mcode-desktop"`、`targetId`、版本、网关状态、能力列表、pair offer 和本地服务列表。
- `desktop_configure_gateway` 保存 `gatewayProvider = official | custom` 与规范化后的 `gatewayBaseUrl`。
- `desktop_generate_pair_offer` 生成 `version: 2` 网关二维码 payload，字段使用 `targetAgent`、`routeMode = "gateway"`、`gatewayProvider`、`pairCode`、`pairSecret`。
- `desktop_connect_gateway` 启动后台 WebSocket upstream，连接到网关的 `/v1/tunnel/desktop`，发送 `desktop_hello`，并在已有 pair offer 时发送 `pair_offer`。
- `desktop_save_local_service` 保存本机 HTTP 服务配置，但 P3 只做配置和校验。

P3 本地服务规则：

- 默认服务为 `Code`，绑定 `127.0.0.1:1080`，协议为 `http`。
- P3 只允许 `127.0.0.1`。`0.0.0.0` 或其他 host 会被前端和后端同时拒绝。
- P3 不实现 P4 的 stream/tcp tunnel 数据转发；relay 发来的 `tunnel_request` 仍属于后续阶段处理范围。
- P3 不实现 Claude/Codex 官方 CLI adapter；capability 与命令边界保留给 P5。

P3 Desktop UI 行为：

- “连接”页显示网关状态、target id、capabilities、网关服务商、网关地址、配对码和 QR payload。
- “连接网关”会先保存网关配置，必要时生成 pair offer，再启动 upstream。
- “内网穿透”页提供本地服务名称、host、port、启用开关；保存后只更新配置和展示入口，不承诺端口流量已经可访问。

P3 原生端复制规则：

- 移动端扫码读取 desktop QR 时仍按普通 v2 网关连接保存，不能因为来源是 desktop 而跳过 `targetAgent + routeMode` 驱动选择。
- 原生端展示 desktop capability 时应以 gateway pair/refresh 返回的 metadata 为准；二维码里的本地端口只用于展示或服务入口，不是可直连地址。
- 如果后续实现原生 desktop host，必须复刻 `/v1/tunnel/desktop` upstream、`desktop_hello`、`pair_offer` 和 loopback-only 服务校验，不要直接暴露 `0.0.0.0`。

## P4 HTTP Tunnel Behavior

P4 已打通 desktop loopback HTTP 服务访问链路：

```text
MCode app -> mcode-relay /v1/tunnel/:targetId/:port/* -> desktop upstream tunnel_request -> 127.0.0.1:<port> -> tunnel_response -> relay HTTP response
```

协议边界：

- `mcode-relay` 继续负责 access token 校验和 targetId path 校验。
- relay 向 desktop WebSocket 发送 `tunnel_request`，包含 `requestId` 与 `request = { port, method, path, query, headers, body }`。
- desktop 只接受已启用的 `LocalServiceConfig`，且 host 必须是 `127.0.0.1`。
- desktop 代理 HTTP 后返回 `tunnel_response = { requestId, ok, status, headers, body, error? }`。
- desktop 会过滤 `authorization`、`host`、`content-length`、`connection`、`transfer-encoding` 等不应转发的 header。
- JSON 响应按 JSON 回传；非 JSON 响应以字符串 body 回传。

UI 行为：

- “内网穿透”页现在显示 P4 HTTP 状态，不再标记为配置占位。
- 用户可保存服务名称、`127.0.0.1` host、port、启用状态。
- desktop health 暴露最近 tunnel 成功/失败 diagnostics，页面“最近访问”列表展示这些记录。

兼容与限制：

- P4 当前实现的是 `tunnel.http` 请求/响应，不是原始 TCP 字节流。
- `0.0.0.0`、LAN IP 或公网 host 仍被拒绝；开放非 loopback 必须等后续阶段加入明确确认与安全策略。
- 原生 iOS/Android 侧不能直接访问二维码里的本地端口，必须通过 relay authenticated tunnel URL。
- 原生 desktop host 复制时必须使用同样的 loopback-only 校验和 header 过滤策略。

## P7 Raw TCP Tunnel Behavior

P7 第一版在 P4 HTTP tunnel 旁边新增 raw TCP 字节流链路：

```text
MCode app WebSocket -> mcode-relay /v1/tunnel-tcp/:targetId/:port -> desktop upstream tcp_* frames -> 127.0.0.1:<port>
```

协议边界：

- mobile 侧连接 `GET /v1/tunnel-tcp/:targetId/:port` WebSocket，继续使用 access token 鉴权。
- relay 校验 token 中的 `targetId` 必须等于 path targetId，端口必须是 `1..65535`。
- relay 为每条 mobile WebSocket 分配一个 `streamId`，向 desktop upstream 发送 `tcp_connect = { streamId, port }`。
- mobile WebSocket 的 binary/text payload 都按字节转成 upstream `tcp_data = { streamId, dataBase64 }`。
- desktop 只会连接已配置且启用的 `LocalServiceConfig`，并且该服务必须是 `protocol = tcp`、`host = 127.0.0.1`。
- desktop 从本地 TCP 读到的字节以 `tcp_data` 和 `dataBase64` 回传 relay，relay 再以 WebSocket binary 发回 mobile。
- 任一侧关闭时发送或消费 `tcp_close`；错误通过 `tcp_error = { streamId, error }` 传递，并清理 stream 状态。

UI 行为：

- desktop “内网穿透”页的服务协议可选 `HTTP` 或 `TCP`。
- `HTTP` 服务继续走 `/v1/tunnel/:targetId/:port/*`。
- `TCP` 服务走 `/v1/tunnel-tcp/:targetId/:port`。
- 默认 Code 服务仍是 `HTTP`，不会自动切到 raw TCP。

兼容与限制：

- P7 raw TCP 不复用 P4 HTTP endpoint，避免把请求/响应语义和长连接字节流混在一起。
- relay 当前是一条 mobile WebSocket 对应一个 TCP stream；`streamId` 预留给后续同连接多路复用。
- 非 loopback host 仍被拒绝；开放 LAN / `0.0.0.0` 必须先加入显式确认和安全策略。
- 原生 iOS/Android 复制时，HTTP 与 TCP 服务入口必须按 `protocol` 分流，不得直接访问二维码里的本机端口。

## P5 Official CLI Adapter Foundation

P5 第一版把官方 CLI 适配边界落在 `mcode-desktop`，而不是让 app 或 relay 直接依赖 Codex/Claude CLI 的本机细节：

- desktop Rust 后端维护 `cliRuntimes`，每项包含 `runtime`、`binary`、`installed`、`version`、`capability`、`status`、`error`。
- `desktop_refresh_cli_status` 会在本机执行 `<binary> --version`，刷新 health snapshot 与 capabilities。
- desktop 连接网关前会刷新 CLI 状态，`desktop_hello` 发布已安装 runtime 对应的 `desktop.runtime.codex-cli` / `desktop.runtime.claude-cli` capability。
- relay 发送 `proxy_request = { requestId, command, payload }`，desktop 返回 `proxy_response = { requestId, ok, body?, error? }`。
- `acp_list_agents` 返回 `codex` 与 `claude_code` 两个 agent 条目；是否 available 取决于本机 CLI 检测结果。
- `acp_describe_agent_options` 返回空配置快照：`modes = null`、`config_options = []`，表示 P5 第一版还没有远端可调的 CLI session mode。
- `acp_prompt` 只有 payload 明确带 `agentType` 时才会路由到对应 adapter；Codex 当前使用 `codex exec --json [--cd <workingDir>] <prompt>` 做非交互执行，Claude 当前只返回明确的未支持/未安装错误。

安全边界：

- 官方 CLI token、账号态和本机凭据只留在 desktop 所在机器。
- app 与 relay 只看到统一 proxy 命令结果，不接触官方 token。
- relay 仍然只做网关鉴权、target 查找和帧转发，不理解 Codex/Claude 的 CLI 输出语义。

UI 行为：

- desktop 新增“智能体”页，显示 Codex CLI / Claude CLI 的安装状态、版本、binary、capability 和错误信息。
- “刷新 CLI 状态”只触发本机检测，不自动发起官方 CLI prompt。
- 页面文案明确说明 P5 第一版不包含完整会话恢复、权限请求处理和流式事件归一化。

兼容与限制：

- 当前 P5 不改变 mcode-app 的 `targetAgent + routeMode` 连接模型；官方 CLI 仍作为 `mcode-desktop` capability 暴露。
- P5 本身不实现 `acp_connect` 会话生命周期；P8 已在 desktop 侧补上第一版 session registry，但完整 ACP event stream 仍属于 P9。
- 原生 iOS/Android 复制时只需要消费 desktop gateway 连接的 capability 与 proxy 结果；不要在移动端实现官方 CLI 凭据管理。
- 如果后续官方 CLI 提供稳定 SDK 或服务接口，应只替换 desktop adapter 内部实现，外部 `proxy_request` / `proxy_response` 协议保持不变。

## P8 Official CLI Session Lifecycle Behavior

P8 第一版把官方 CLI 会话生命周期放在 `mcode-desktop` 的 Rust backend 内部，`mcode-relay`
仍只转发 `proxy_request` / `proxy_response`，不理解 Codex/Claude 会话语义。

desktop state 新增 `cliSessions`，并通过 health snapshot 暴露给 desktop UI。每个 session 包含：

- `sessionId`
- `runtime = codex-cli | claude-cli`
- `agentType = codex | claude_code`
- `workingDir`
- `status = connected | running | completed | canceled | disconnected | error`
- `createdAtMs` / `updatedAtMs`
- `activeRequestId`
- `cancelRequested`
- `lastPromptPreview`
- `error`

proxy command 行为：

- `acp_connect` 创建 session；如果传入已有 `sessionId`，则恢复该 session 并把状态置为 `connected`。
- `acp_disconnect` 把 session 标记为 `disconnected`，清空 active request。
- `acp_cancel` 把 session 标记为 `canceled`，设置 `cancelRequested = true`。
- `acp_get_session_snapshot` 传 `sessionId` 时返回单个 session，不传时返回全部 in-memory sessions。
- `acp_prompt` 传 `sessionId` 时，desktop 会校验 session runtime 与 payload `agentType` 是否一致，并把 session 的 `agentType` / `workingDir` 注入到 adapter payload；执行前状态为 `running`，成功后为 `completed`，失败后为 `error`。

working directory 规则：

- 新建 session 时没有 `workingDir` 则使用 desktop 进程当前目录。
- 恢复 session 时没有 `workingDir` 则沿用旧值。
- 相对路径按 desktop 进程当前目录解析。
- 非目录路径在启动官方 CLI 之前直接拒绝。

UI 行为：

- desktop “智能体”页继续显示 Codex CLI / Claude CLI 安装状态。
- 页面新增 session 数量和最近 session 状态摘要，用于诊断移动端发来的 session 生命周期调用是否到达 desktop。
- desktop UI 不直接发起 prompt；移动端仍通过网关 proxy 控制 official CLI。

兼容与限制：

- `targetAgent` 仍是 `mcode-desktop`，不得新增移动端 `codex` / `claude` targetAgent。
- P8 session registry 是内存态；持久化、ACK/replay、崩溃恢复和单控制者强约束属于 P10。
- P8 的 `acp_cancel` 已记录取消意图，但还不保证终止正在运行的官方 CLI 进程；完整 process handle 管理留给后续 production-hardening slice。
- P8 不做流式事件归一化、权限请求 UI 或工具调用事件建模，这些属于 P9。

原生 iOS/Android 复制时：

- 对 desktop gateway 连接，`acp_connect` 成功后必须保存 `sessionId`，后续 prompt、cancel、disconnect 都带同一个 id。
- 断线重连后应先调用 `acp_get_session_snapshot` 或 `acp_connect(sessionId)` 检查 desktop 是否还持有该 session。
- 如果 desktop 返回 session not found，移动端应提示用户重新创建官方 CLI 会话，而不是把 Codex/Claude 当成独立 direct target。

## P9 Official CLI Event Normalization Behavior

P9 第一版在 `mcode-desktop` 增加官方 CLI 输出归一化层，把 Codex/Claude adapter 的 stdout JSONL 或纯文本输出转换成 MCode 已有的 ACP-style event envelope：

- `type`
- `connectionId`
- `data`

当前支持的 normalized event type：

- `stream_batch`
- `tool_call`
- `tool_call_update`
- `permission_request`
- `permission_resolved`
- `question_request`
- `question_resolved`
- `usage_update`
- `status_changed`
- `turn_complete`
- `error`

数据流：

```text
official CLI stdout -> desktop runtime normalizer -> proxy response events[] -> desktop upstream event_push -> relay /v1/events -> MCode app
```

Codex adapter 行为：

- `codex exec --json` 成功后保留原始 `stdout` / `stderr` 作为诊断字段。
- stdout 每行优先按 JSON 解析；解析成功后根据 `type/event/status` 等字段映射为 ACP-style event。
- JSON 结构不认识但能抽取文本时，降级成 `stream_batch`。
- 非 JSON 行直接作为 `stream_batch` 文本事件。
- 如果输出产生了事件但没有 completion，desktop 自动补 `status_changed(idle)` 和 `turn_complete`，保证移动端能收敛运行态。

relay 行为：

- relay 仍不解析 Codex/Claude CLI 语义。
- desktop upstream 在发送 `proxy_response` 前，会把 response body 里的 `events: []` 转成多条 `event_push` frame。
- relay 对 `event_push` 只调用已有 `broadcastEvent()`，并通过 `/v1/events` 给移动端。
- 因此企业自部署网关不需要新增 CLI-specific 代码，只需要保持 P2/P4/P7 已有 upstream frame 兼容。

兼容与限制：

- P9 第一版是“输出归一化 + event_push 投递”，还不是严格的逐 token 子进程实时 streaming；Codex 仍沿用当前非交互 `Command::output()` 边界。
- 归一化逻辑故意宽松匹配 JSONL 字段，不把官方 CLI 当前 JSON 字段视为稳定协议。
- Claude adapter 仍不执行 prompt；但一旦后续 adapter 开启执行，可复用同一 normalizer 处理 Claude JSONL/text。
- 权限和问题事件只做数据结构归一化，完整用户响应命令、权限生命周期和 live process handle 仍需后续阶段补齐。

原生 iOS/Android 复制时：

- 继续把 relay `/v1/events` 收到的 payload 当作普通 ACP event envelope 处理。
- 不要在移动端解析官方 CLI stdout；stdout 解析只属于 desktop adapter。
- 如果同时收到 proxy response 和事件流，应以事件流驱动会话 UI，proxy response 只作为命令调用完成/诊断结果。

## P10 Desktop Upstream Hardening Behavior

P10 第一版增强 `mcode-desktop` 的 gateway upstream 运行状态与诊断能力，目标是让桌面宿主能被移动端和用户界面判断为“正在重连、已被哪个控制端接管、最后确认到哪个事件、是否正在退出”。

desktop state 新增：

- `upstreamReconnectAttempt`
- `upstreamNextRetryDelayMs`
- `lastAckEventId`
- `activeControllerId`
- `shutdownRequested`

运行行为：

- `desktop_connect_gateway` 不再只启动单次 `connect_upstream`，而是启动 `connect_upstream_until_stopped` supervisor。
- upstream 断开或失败后，supervisor 记录重连次数和指数退避延迟，当前延迟上限为 30 秒。
- upstream 成功进入 online 后，重连次数和下一次延迟会清零。
- relay 下发 `ack = { eventId }` 时，desktop 记录 `lastAckEventId`。
- relay 下发 `controller_attached = { controllerId }` 时，desktop 记录 `activeControllerId` 并写入 diagnostics。
- 用户通过 `shutdown_runtime` 或 tray 退出时，desktop 会先设置 `shutdownRequested = true`，让 supervisor 停止继续重连。

UI 行为：

- desktop 连接页展示 reconnect attempt、next retry delay、last ACK、active controller 和 shutdown 状态。
- 这些字段是诊断信息，不改变 pairing 二维码和 gateway 连接模型。

兼容与限制：

- P10 第一版的 ACK、controller 和 retry 状态仍是内存态；desktop 重启后不恢复。
- 当前实现是 active controller tracking，不是完整 gateway policy enforcement；拒绝第二控制端、踢出控制端、控制端租约等仍属于后续网关运营能力。
- 当前不持久化 pending proxy/tunnel/tcp stream，也不做 crash 后自动恢复官方 CLI session。
- relay 协议无需为 P10 新增必需字段；未知旧 relay 不发送 `ack` 或 `controller_attached` 时，desktop 只保持空诊断状态。

原生 iOS/Android 复制时：

- 移动端不需要保存 desktop 的 reconnect/backoff 字段；这些字段只用于连接诊断 UI。
- 如果 `activeControllerId` 显示不是当前设备，移动端应提示可能已有控制端，而不是自行假设独占。
- 如果长时间未收到 event 且 `lastAckEventId` 不前进，应提示网关或 desktop upstream 可能异常。

## P11 Enterprise Gateway Operations Behavior

P11 第一版把企业运营能力落在 `mcode-relay`，不改变移动端连接模型，也不把官方 CLI 语义放进网关。

新增配置：

- `ADMIN_TOKEN`
- `ACCESS_POLICY`

新增 admin API：

- `GET /v1/admin/devices`
- `GET /v1/admin/sessions`
- `GET /v1/admin/audit-events`
- `POST /v1/admin/devices/:targetId/revoke`
- `POST /v1/admin/devices/:targetId/restore`
- `POST /v1/admin/sessions/:sessionId/revoke`

admin 鉴权：

- admin API 只接受 `x-mcode-admin-token` 或 bearer token。
- token 必须等于 `ADMIN_TOKEN`。
- 未配置 `ADMIN_TOKEN` 时，admin API 默认不可用。

设备与 session 行为：

- pair 成功时，relay 在 session 上记录 `deviceName` 和 `deviceUserAgent`。
- `deviceName` 来自 `x-mcode-device-name` header。
- target revoke 会把 target 标记为 revoked，并吊销该 target 下所有未吊销 session。
- session revoke 只吊销单个 session。
- 被吊销 session 不能继续访问 `/v1/targets`、`/v1/proxy/:command`、`/v1/events`、HTTP tunnel 或 TCP tunnel。
- 被吊销 target 的 refresh token 不能继续换取 access token。

审计行为：

- relay 维护 bounded in-memory audit events。
- 当前记录 `session.created`、`session.refreshed`、`session.revoked`、`target.revoked`、`target.restored`。
- audit event 包含 `eventId`、`type`、`targetId`、`sessionId`、`actor`、`message`、`createdAt`、`metadata`。
- `/health` stats 暴露 target/session/audit 计数，但不泄露 secret、token、pair code 或 session token。

gateway info 行为：

- `/v1/gateway/info` features 新增 `enterprise.devices`、`enterprise.sessionRevocation`、`enterprise.audit`、`enterprise.accessPolicy`。
- deployment 中新增 `accessPolicy`，来自 `ACCESS_POLICY`。
- `ACCESS_POLICY` 当前是部署策略声明和后续 hook，不是完整策略引擎。

兼容与限制：

- P11 第一版仍是内存态，企业商用需要把 targets、sessions、audit events 接到持久化数据库。
- 没有租户模型，admin API 操作当前 relay 实例的全局数据。
- `ADMIN_TOKEN` 是最小自部署管理能力，不是 RBAC。
- 设备吊销不改变 `targetAgent`、`routeMode` 或二维码结构；移动端只会看到后续请求返回 401。

原生 iOS/Android 复制时：

- 遇到 `session revoked` 或 `target revoked` 应清除本地 gateway session，并提示用户重新配对或联系管理员。
- 不要在移动端调用 admin API；admin API 属于企业网关管理后台或运维系统。
- 设备名可以在 pair 请求 header 中传 `x-mcode-device-name`，用于企业网关设备列表展示。

## P12 Mobile And Native Polish Behavior

P12 第一版把移动端/原生商业化 polish 落在 app 的 agent-specific 目录，避免把 desktop 逻辑继续堆到共享 presentation 文件里。

新增 app 模块：

```text
mcode-app/src/agents/mcode-desktop/capabilities.ts
```

职责：

- `getDesktopCapabilityLabels()` 把 desktop capability key 映射成移动端展示标签。
- `hasDesktopCapability()` 只对 `targetAgent = mcode-desktop` 返回 true。
- `diagnoseDesktopGatewayConnection()` 在进入 desktop 能力入口前做诊断。
- `buildDesktopTunnelEntry()` 按 HTTP/TCP 协议构造网关 tunnel 入口。

capability 规则：

- `desktop.runtime.codex-cli` 显示为 `Codex CLI`。
- `desktop.runtime.claude-cli` 显示为 `Claude CLI`。
- `desktop.tunnel.available` 显示为 `内网穿透`。
- 未知 capability 保留在数据层，不展示成标签。

desktop gateway 诊断：

- `mcode-desktop/direct` 会提示官方 CLI 与内网穿透通常需要 gateway。
- `mcode-desktop/gateway` 缺少 `gatewayBaseUrl` 是 error。
- `mcode-desktop/gateway` 缺少 `gatewaySession.accessToken` 是 warning。
- 缺少 `targetProfile.capabilities` 是 warning，能力入口应先隐藏或置灰。

tunnel service entry：

- HTTP 服务入口使用 `/v1/tunnel/:targetId/:port/*`。
- TCP 服务入口使用 `/v1/tunnel-tcp/:targetId/:port`。
- 入口必须满足 `targetAgent = mcode-desktop`、`routeMode = gateway`、存在 gateway base URL、存在 target id、端口有效、并且 capability 包含 `desktop.tunnel.available`。
- 不满足条件时返回 disabled entry 和具体 reason，UI 应展示不可用态而不是让用户点进失败请求。

原生 iOS/Android 复制时：

- 按 agent 目录或等效模块隔离 desktop 逻辑；不要把 `codeg`、`opencode`、`mcode-desktop` 的分支集中到一个共享巨型 helper。
- 构造 tunnel URL 时只使用 gateway URL 和 target id，不读取二维码中的本机端口作为直连地址。
- HTTP 与 TCP service entry 必须按 protocol 分流；TCP 是 WebSocket 字节流入口，不应走 HTTP 预览页面。
- capability gate 要在入口层完成，缺少能力时显示禁用原因。

## P13 Relay Operational Durability Behavior

P13 第一版把 `mcode-relay` 的企业运营状态从纯内存扩展为可选 JSON 文件持久化，不改变 app、desktop 或 upstream 的 wire protocol。

新增配置：

- `PAIRING_STORE_PATH`

存储行为：

- 未配置 `PAIRING_STORE_PATH` 时，relay 继续使用内存态 `PairingStore`，行为与 P11/P12 保持兼容。
- 配置 `PAIRING_STORE_PATH` 时，relay 启动会从该 JSON 文件恢复 `targets`、`sessions` 和 `auditEvents`。
- target、session、revocation、preferred mode、last seen 和 audit event 发生变化后，relay 会写回完整 snapshot。
- pair offer 不持久化；relay 重启后 pending pairing code 必须重新生成，避免短期 secret 被长期保留。
- JSON 文件不存在时按空状态启动；JSON 损坏或格式不完整时跳过无效记录并回退到可用的空/部分状态。

健康与诊断：

- `/health` 增加 `storage.pairingStore = "memory" | "json-file"`。
- `/v1/gateway/info` 在 `deployment.storage.pairingStore` 暴露同样的存储模式。
- 公共接口不得暴露 `PAIRING_STORE_PATH` 的本机路径，也不得暴露 secret、token、pair code 或 session token。

兼容与限制：

- JSON 文件持久化是单 relay 进程的商业化硬化首片，不是多实例共享数据库。
- 企业自部署如果需要多副本、审计不可篡改、租户隔离或集中策略，应在同一 `PairingStoreStorage` 边界下替换为数据库/外部审计系统。
- 旧客户端不需要更新；storage 字段只用于诊断展示。
- 被持久化的 revoked target/session 在 relay 重启后仍保持吊销状态，移动端继续按 401 清理本地 gateway session。

原生 iOS/Android 复制时：

- 移动端不需要理解 JSON 存储细节，只需要在诊断页展示 gateway 返回的 storage mode。
- 若 pair code 在 relay 重启后失效，原生端应提示用户重新扫码或让 desktop 重新生成 pairing offer。
- 遇到 `session revoked` 或 `target revoked` 的处理方式与 P11 一致：清除本地 gateway session，并提示重新配对或联系管理员。

## P14 Official CLI Streaming Lifecycle Behavior

P14 第一版把 `mcode-desktop` 的 Codex 官方 CLI adapter 从“进程结束后一次性返回 stdout”升级为“运行中按 stdout 行实时推送事件，并允许取消活动进程”。`targetAgent` 仍然是 `mcode-desktop`；Codex/Claude 官方 CLI 不成为移动端独立 target。

数据流：

```text
MCode app acp_prompt -> mcode-relay proxy_request -> mcode-desktop
  -> codex exec --json child process
  -> stdout line -> desktop normalizer -> event_push -> relay /v1/events -> MCode app
  -> process exit -> proxy_response
```

desktop runtime 行为：

- `dispatch_desktop_proxy_with_event_sink()` 是新的可选事件 sink 边界；普通本地调用仍可使用无 sink 的 `dispatch_desktop_proxy_with_state()`。
- Codex `acp_prompt` 使用 piped stdout/stderr 启动子进程，逐行读取 stdout。
- 每一行 stdout 用 `normalize_cli_output_line_events()` 转换为 ACP-style event，不在实时阶段合成 `turn_complete`。
- 进程结束后，完整 stdout 仍用 `normalize_cli_output_events()` 生成最终 `events[]`，用于兼容旧路径和补发 completion/status。
- response 新增 `streamedEventCount`，desktop upstream 会跳过已实时推送的前 N 个 events，避免移动端重复收到正文增量。
- response 同时带 `exitCode`、`stderrPreview`、`canceled`，并写入 session 诊断字段。

取消行为：

- `AppState` 维护本机内存态 `cli_processes`，按 `sessionId` 保存当前 active Codex process 的 cancel handle。
- `acp_cancel` 会先标记 session 为 `canceled`，再向 active process 发送取消信号并 kill 子进程。
- prompt task 收到取消后返回 `status = "canceled"` 的 `proxy_response`，session 最终保持 canceled 状态。
- 没有 active process 时，`acp_cancel` 仍保持 P8 行为：只标记 session canceled。

UI 行为：

- desktop “智能体”页继续显示 Codex CLI / Claude CLI 安装状态。
- 最新 session 诊断增加 active request、last event time、exit code、stderr preview。
- 页面文案说明 P14 已支持 Codex stdout 实时事件和取消；Claude prompt 执行仍明确未支持。

兼容与限制：

- relay 协议不变，仍然只处理 `event_push` 和 `proxy_response`。
- `streamedEventCount` 是 desktop response 内部兼容字段；旧 relay/旧 desktop 不需要理解它。
- P14 是 stdout 行级 streaming，不承诺官方 CLI 的 token 级 streaming。
- 权限/问题事件如果 CLI stdout 中出现，可以被 normalizer 转换为事件；但向官方 CLI 回写权限选择/用户输入的控制通道仍未实现。
- Claude CLI adapter 仍只做检测和明确 unsupported error，直到其官方命令语义确认后再打开 prompt 执行。

原生 iOS/Android 复制时：

- 移动端仍只消费 relay `/v1/events` 中的 ACP-style event，不解析官方 CLI stdout。
- 收到 `event_push` 后应实时更新会话 UI；`proxy_response` 只表示命令完成、取消或失败。
- 遇到 proxy response `status = canceled` 或 session `status = canceled` 时，应把当前会话输入状态恢复为空闲/已取消，不应重试同一个 prompt。
- 如果同时收到实时正文和最终 completion，移动端应按 event 顺序处理；不应依赖 proxy response 的 `stdout` 重放正文。

## P15 Official CLI Interaction Response Behavior

P15 第一版补上官方 CLI interaction 事件的 MCode 协议闭环：desktop 能记录 pending permission/question，并通过 proxy command 返回 resolved event。它仍不向 Codex/Claude 官方 CLI stdin 写入响应，因为官方交互控制协议还没有被确认。

数据流：

```text
official CLI output -> desktop normalizer -> permission_request/question_request event
  -> desktop pending interaction state
  -> MCode app sends acp_respond_permission/acp_respond_question
  -> desktop marks interaction resolved
  -> proxy_response events[] -> desktop upstream event_push -> relay /v1/events -> MCode app
```

desktop state 行为：

- `AppState.cli_pending_interactions` 保存最近 pending/resolved interaction。
- pending interaction 包含 `interactionId`、`sessionId`、`kind`、`status`、`createdAtMs`、`resolvedAtMs`、`decision`、`value`、`summary`、`data`。
- `permission_request` 使用 `id` / `requestId` / `request_id` 作为 interaction id。
- `question_request` 使用 `questionId` / `question_id` / `id` 作为 interaction id。
- pending state 有上限，当前最多保留 100 条，避免长时间运行无限增长。
- desktop health snapshot 暴露 `cliPendingInteractions`，供诊断 UI 或移动端状态同步使用。

新增 proxy command：

- `acp_respond_permission`
  - 输入：`sessionId`、`requestId` 或 `interactionId`、`decision`，可选 `value`。
  - 输出：`permission_resolved` ACP event，data 含 `requestId`、`decision`、`value`、`status = resolved`。
- `acp_respond_question`
  - 输入：`sessionId`、`questionId` 或 `interactionId`、`answer` 或 `value`。
  - 输出：`question_resolved` ACP event，data 含 `questionId`、`answer`、`decision`、`status = resolved`。

UI 行为：

- desktop “智能体”页显示每个 runtime 下 pending interaction 数量和最近 pending 摘要。
- desktop UI 当前只做诊断展示，不在桌面端提供响应按钮；响应入口仍由移动端通过 proxy command 发起。

兼容与限制：

- relay 协议不变；resolved event 仍通过 `proxy_response.events[]` 由 desktop upstream 转成 `event_push`。
- P15 不实现官方 CLI 交互响应写回；如果后续确认 Codex/Claude 的稳定控制协议，只替换 desktop adapter 内部实现。
- pending capture 当前从最终 normalized response events 回填；P14 实时事件仍会即时到达移动端，因此移动端可立即展示 permission/question UI。
- 如果响应命令找不到 pending interaction，desktop 返回 proxy error，移动端应提示该请求已失效或已被处理。

原生 iOS/Android 复制时：

- 移动端遇到 `permission_request` / `question_request` event 后，应显示对应用户确认 UI，并保存 interaction id。
- 用户操作后通过 `/v1/proxy/acp_respond_permission` 或 `/v1/proxy/acp_respond_question` 发回 desktop，而不是直接调用 relay 事件接口。
- 收到 `permission_resolved` / `question_resolved` 后，应关闭对应 pending UI。
- 原生端不要假设 resolved event 已经写回官方 CLI；它只表示 MCode 协议层已经记录用户响应。

## P16 Codex App-Server JSON-RPC Behavior

P16 第一版给 Codex 官方 CLI 增加真实交互控制通道，但仍保持外部连接模型不变：`targetAgent` 继续是 `mcode-desktop`，Codex 不成为移动端独立 target。

内部链路：

```text
MCode app acp_prompt
  -> mcode-relay proxy_request
  -> mcode-desktop
  -> codex app-server --listen stdio://
  -> newline JSON-RPC notifications/requests
  -> desktop ACP event normalizer + live interaction waiter
  -> relay event_push / proxy_response
```

desktop runtime 行为：

- 新增 `runtime/json_rpc.rs`，实现 newline-framed JSON-RPC 2.0 stdio transport。
- transport 支持 child stdin/stdout/stderr、outbound request、notification、inbound request callback、按 id 匹配 response、request timeout 和 stderr preview。
- Codex app-server 只有显式开启时使用：`MCODE_DESKTOP_CODEX_APP_SERVER=1` 或测试覆盖 `MCODE_DESKTOP_TEST_CODEX_APP_SERVER_COMMAND`。
- 默认 app-server 命令是 `codex app-server --listen stdio://`。
- app-server 初始化顺序为 `initialize` -> `initialized` -> `thread/start` -> `turn/start`。
- app-server notification 会映射为既有 ACP-style event：`stream_batch`、`tool_call`、`tool_call_update`、`usage_update`、`status_changed`、`turn_complete`。
- 如果 app-server 失败且未设置 `MCODE_DESKTOP_CODEX_APP_SERVER_REQUIRED=1`，desktop 自动回退到 P14 的 `codex exec --json` 路径。

live interaction 行为：

- app-server inbound request 如果匹配 permission/question 方法，desktop 立即创建 `permission_request` 或 `question_request` event，并写入 `cliPendingInteractions`。
- 同时 desktop 在 `cli_interaction_waiters` 保存 oneshot waiter，等待移动端调用 `acp_respond_permission` 或 `acp_respond_question`。
- 响应命令仍返回 P15 的 resolved event；如果存在 live waiter，还会把响应写回当前 JSON-RPC request，让 Codex app-server 继续执行。
- 支持的 permission source 包括 `session/request_permission`、`*/requestApproval`、`item/commandExecution/requestApproval`、`item/fileChange/requestApproval`、`item/permissions/requestApproval`、`claude/requestApproval`。
- 支持的 question source 包括 `mcpServer/elicitation/request`、`item/tool/requestUserInput`、`claude/askUserQuestion`。
- P16 修正了 P15 回填边界：最终 response 中 `streamedEventCount` 之前的事件不再重复捕获 pending，避免 live resolved 后又变回 pending。

兼容与限制：

- relay wire protocol 不变，仍只看 `proxy_request`、`proxy_response` 和 `event_push`。
- `protocol = codex-app-server` 只出现在 desktop proxy response 诊断字段里，不要求移动端分支处理。
- P16 第一版的 app-server process 以 prompt turn 为边界；P17 已将 Codex app-server 升级为 Desktop CLI session 级复用。
- Claude 官方 CLI 仍保持保守 adapter，不在 P16 开启 live control channel。
- app-server notification mapper 只覆盖商业闭环必须的 common subset；更完整 timeline 可以继续在 desktop adapter 内扩展，不改变 app/relay 协议。

原生 iOS/Android 复制时：

- 原生端不需要知道 app-server 或 JSON-RPC 细节，仍通过 desktop gateway 的 `/v1/proxy/:command` 和 `/v1/events` 工作。
- 遇到 `permission_request` / `question_request` 后，继续按 P15 规则调用 response proxy command。
- 收到 resolved event 后关闭本地交互 UI；如果 desktop 返回 `liveResolved = true`，可在诊断页显示“已写回本机 CLI”，但业务逻辑不要依赖这个字段。
- 原生端不得直接启动或管理 Codex app-server；官方 CLI 凭据、进程和控制协议都属于 desktop adapter 内部实现。

## P17 Codex App-Server Session Reuse Behavior

P17 把 P16 的 Codex app-server 从“每次 prompt 启动一个进程”升级为“每个 MCode Desktop CLI session 持有一个 app-server client”。外部连接模型保持不变：移动端仍连接 `targetAgent = mcode-desktop`，Codex 官方 CLI 仍是 desktop capability，不成为移动端 direct target。

内部链路：

```text
MCode app acp_connect -> desktop creates CLI sessionId
MCode app acp_prompt(sessionId)
  -> desktop acquire Codex app-server session by sessionId
  -> first prompt: spawn app-server, initialize, thread/start
  -> later prompts: reuse same JSON-RPC transport and provider threadId
  -> bind per-turn event context
  -> turn/start
  -> notifications/inbound requests -> current turn events + live waiters
```

desktop state 行为：

- `AppState.codexAppServerSessions` 按 MCode CLI `sessionId` 保存 Codex app-server handle。
- 每个 handle 包含 JSON-RPC transport、provider `threadId`、`workingDir`、创建时间、turn 串行锁和当前 turn context。
- 同一个 `sessionId` 且 `workingDir` 未变时复用既有 app-server process 和 provider `threadId`。
- 如果 transport 已关闭或 `workingDir` 改变，desktop 停止旧 process 并重新 `thread/start`。
- `CliRuntimeSession` 增加诊断字段：`protocol`、`providerThreadId`、`activeTurnId`、`appServerActive`。
- 长驻 JSON-RPC notification/request handler 不直接持有某次 prompt 的事件数组，而是通过当前 turn context 写入；每次 prompt 开始绑定 context，结束后清空。

取消与关闭行为：

- `turn/started` notification 会写入 session `activeTurnId`，供健康快照和取消路径使用。
- `acp_cancel` 仍走既有 proxy command，不改 relay 协议；desktop 对 app-server active turn 发送 `turn/interrupt`，参数为 `threadId` 和 `turnId`。
- 如果 `turn/interrupt` 无法发送，或 provider 没有在短时间内让 `turn/start` 收敛，desktop 会 stop transport，下一次 prompt 自动重建 app-server。
- `acp_disconnect` 会停止该 session 的持久 Codex app-server process，并把 session 诊断标记为 disconnected。

UI 行为：

- desktop/移动端可从 health/session snapshot 显示 `protocol = codex-app-server`、provider thread、active turn 和 app-server active 状态。
- 移动端对 streaming、permission/question、resolved event 的处理不变，仍只消费 ACP-style events。
- 不需要在新增连接中增加 Codex direct target；Codex 仍通过 MCode Desktop capability 暴露。

兼容与限制：

- app/relay wire protocol 不变；新增字段只在 desktop response/session snapshot 中作为诊断信息出现。
- `codex exec --json` fallback 保持不变；app-server 仍通过环境变量 opt-in，直到真实 Codex CLI 版本兼容性验证完成。
- Provider thread mapping 目前是内存态，desktop 重启后丢失；商业化版本需要持久化或可恢复 thread resume。
- Claude 官方 CLI 尚未接入 live-control session 复用，后续应在 adapter 内部实现，不改变 MCode 协议。

原生 iOS/Android 复制时：

- 原生端不需要实现 app-server 进程管理，只需要展示 desktop 暴露的 session 诊断字段。
- 用户取消时继续调用 `acp_cancel`；不要直接假设 `turn/interrupt`，这是 desktop adapter 内部细节。
- 用户断开 desktop CLI session 时应调用 `acp_disconnect`，以便 desktop 释放本机官方 CLI process。
- 如果 session snapshot 显示 `appServerActive = false` 但连接仍有效，原生端可以提示下一次 prompt 会自动重建本机 Codex app-server。

## P18 Claude CLI Streaming Session Adapter Behavior

P18 把 Claude 官方 CLI adapter 从“检测 + unsupported error”推进到可用的 Desktop runtime。外部连接模型不变：Claude 官方 CLI 仍是 `targetAgent = mcode-desktop` 下的 capability，不新增移动端 `targetAgent = claude`，官方凭据和本机进程仍只留在 desktop。

Implementation plan: `docs/superpowers/plans/2026-06-28-mcode-p18-claude-cli-streaming.md`。Claude 默认 print-mode 命令参考 Anthropic Claude Code CLI reference：`claude -p`、`--output-format stream-json`、`--verbose`、`--include-partial-messages` 和 `--permission-mode`。

执行链路：

```text
MCode app acp_connect(agentType=claude_code)
  -> desktop creates CLI sessionId
MCode app acp_prompt(sessionId, agentType=claude_code)
  -> desktop spawns local claude CLI process
  -> stdout/stderr line readers
  -> normalize to ACP-style events
  -> event_push / proxy_response
```

P18 第一版应采用保守的 process streaming adapter：

- 支持测试覆盖 `MCODE_DESKTOP_TEST_CLAUDE_COMMAND`，部署覆盖 `MCODE_DESKTOP_CLAUDE_COMMAND`，生产默认 binary 仍是 `claude`。
- `acp_prompt` 对 `claude_code` 执行真实 Claude CLI prompt，不再返回 unsupported。
- 默认参数为 `-p <prompt> --output-format stream-json --verbose --include-partial-messages`；payload 的 `permissionMode` / `permission_mode` 会映射到 Claude `--permission-mode`。
- stdout 按行实时归一化为 `stream_batch`、`tool_call`、`tool_call_update`、`permission_request`、`question_request`、`usage_update`、`status_changed`、`turn_complete` 等既有事件。
- stderr 进入 session diagnostics，最终 response 包含 `runtime = claude-cli`、`protocol = claude-cli-stdio`、`exitCode`、`stderrPreview`、`eventCount`、`streamedEventCount`、`canceled`。
- `acp_cancel` 复用 `cli_processes` 注册表终止活动 Claude 子进程。
- 如果 Claude 输出里出现 permission/question request，desktop 复用 P15 的 `cliPendingInteractions` 和 response proxy commands 形成 MCode 可见闭环。

兼容与限制：

- relay wire protocol 不变，仍只转发 `proxy_request`、`proxy_response` 和 `event_push`。
- P18 不猜测 Claude stdin/live-control 私有协议；`acp_respond_permission` / `acp_respond_question` 只解析 MCode 可见 pending 状态并发 resolved event，`liveResolved = false`。
- P18 不要求 Claude 达到 Codex app-server 的 session reuse 能力；如果后续 Claude 提供稳定 SDK、stdio server 或 live-control 协议，应在 desktop adapter 内部替换实现，不影响 app/relay。

原生 iOS/Android 复制时：

- 原生端仍只通过 desktop gateway 调用 `acp_connect`、`acp_prompt`、`acp_cancel`、`acp_disconnect` 和 interaction response commands。
- 不需要直接启动 Claude CLI，也不需要理解 Claude 输出格式。
- 对 `protocol = claude-cli-stdio` 或后续更具体协议名只做诊断展示，不作为业务分支条件。

## P19 Desktop/Relay Recovery Layer Behavior

P19 补齐 Desktop gateway 模式在移动端重连、relay 重启、Desktop upstream 重连和 Desktop 进程重启后的第一层恢复语义。外部连接模型不变：移动端仍连接 `targetAgent = mcode-desktop`，Codex/Claude 官方 CLI 仍只是 Desktop capabilities，relay 不理解官方 CLI 语义。

设计文档：`docs/superpowers/specs/2026-06-28-mcode-p19-desktop-relay-recovery-design.md`。
实施计划：`docs/superpowers/plans/2026-06-28-mcode-p19-desktop-relay-recovery.md`。

relay recovery 行为：

- `RelayEventFrame` 增加可选 `localEventId`，旧 mobile client 可忽略该字段。
- `ReplayBuffer` 支持 metadata、window miss 查询、snapshot 和 restore。
- `REPLAY_STORE_PATH` 启用 `schema = "mcode.relay.replay.v1"` 的 bounded JSON replay persistence；为空时保持 in-memory。
- `/v1/events` ready frame 暴露 replay metadata；当 `lastEventId` 超出保留窗口时发送 `replay_miss`。
- Desktop 发送 `event_push.localEventId` 后，relay 会在 ACK 中回传 `ack.localEventId` 和 relay `eventId`。
- proxy/tunnel/TCP 运行时失败使用分类 code：`target_offline`、`desktop_replaced`、`session_revoked`、`request_timeout`、`gateway_shutdown`。
- `/health` 和 `/v1/gateway/info` 暴露 replay storage mode，但不暴露本地文件路径。

Desktop recovery 行为：

- `recovery.rs` 提供 bounded `OutboundEventQueue`，默认上限 500，按本地递增 `localEventId` 记录未确认 outbound event。
- Desktop upstream 的实时 CLI event sink 和 proxy response `events[]` 都先进入 outbound queue，再发送 `event_push.localEventId`。
- 收到 `ack.localEventId` 后，Desktop 按本地 id 删除对应 queued event；旧 ACK 仍更新兼容的 relay event id。
- upstream 重连后按本地顺序 replay 未 ACK queued events。
- `MCODE_DESKTOP_STATE_PATH` 启用 `schema = "mcode.desktop.state.v1"` 的 runtime snapshot；为空时只保留内存态。
- snapshot 保存 target/gateway/local services、ACK checkpoint、queued outbound events、CLI session metadata、pending interactions 和 bounded diagnostics。
- Desktop 启动时加载 snapshot；重启前处于 `running` 的 CLI session 恢复为 `interrupted`，对应 pending interaction 标记为 `stale`。
- gateway 配置、本地服务、CLI session 状态、pending interaction、outbound queue enqueue/ACK 等可恢复状态变更后都会触发 best-effort 落盘。

安全与兼容边界：

- 现有 `event_push`、`ack`、`proxy_response`、tunnel 和 TCP frames 继续可用；新增字段都是 additive。
- snapshot 不持久化 pair offer、pair secret、官方 CLI token、app/relay access token、refresh token 或 live process handle。
- P19 的 JSON persistence 是单机 first-slice hardening，不是多实例共享数据库。
- Relay 只做 replay/ACK/错误分类，不解析 Codex 或 Claude CLI 的 session、permission、streaming 语义。

UI 行为：

- Desktop connection page 显示 `lastAckLocalEventId`、`lastRelayEventId`、queued event count、recovery storage mode、replay support 和 oldest queued local event。
- Desktop agents page 显示 interrupted session count 和 stale pending interaction count。
- Desktop health/runtimeApi/Pinia 同步暴露上述 recovery diagnostics，便于 native client 复刻。

原生 iOS/Android 复制规则：

- Store the last processed relay `eventId` per gateway connection and pass it as `lastEventId` when reconnecting `/v1/events`.
- If `replay_miss` arrives, show a recoverable warning and refresh session state; do not reconnect as `codex` or `claude`.
- Treat `target_offline` and `request_timeout` as retryable operation failures.
- Treat `session_revoked` as a gateway session reset and require re-pair or session refresh.
- Display Desktop `interrupted` CLI sessions as requiring a new prompt because live official CLI processes cannot be resumed after Desktop restart.
- Display `stale` pending interactions as no longer actionable, even if their original request id is still visible in local UI history.

## P20 App Recovery UX Behavior

P20 closes the mobile/app side of P19 without changing relay or Desktop
protocols. `mcode-app` now consumes relay replay checkpoints and recovery
signals so a Desktop gateway connection can reconnect with `lastEventId`,
surface replay gaps, and refresh visible session state.

Design document: `docs/superpowers/specs/2026-06-28-mcode-p20-app-recovery-ux-design.md`.
Implementation plan: `docs/superpowers/plans/2026-06-28-mcode-p20-app-recovery-ux.md`.

Implemented app behavior:

- `RelayGateway.connectEvents()` accepts optional recovery options and appends
  `lastEventId` to `/v1/events` when the current relay instance has a known
  positive checkpoint.
- `acpApi` owns per-`instanceKey` relay checkpoints because it owns realtime
  bridge reconnect and event dispatch.
- Relay wrapper frames update the checkpoint only after their payload is
  dispatched successfully; failed dispatches do not advance the checkpoint.
- `ready` refreshes replay metadata and clears stale recovery warnings without
  being dispatched as an ACP event.
- `replay_miss` updates realtime bridge health, emits a recoverable warning,
  and triggers active conversation calibration for bindings under the affected
  `instanceKey` instead of being treated as an ACP conversation event.
- Detail status UI shows replay-miss as a recoverable warning, while preserving
  the existing reconnect/recovered banners.
- Classified gateway errors map to user actions: `target_offline` and
  `request_timeout` are retryable, `session_revoked` requires gateway session
  reset or re-pair, and `desktop_replaced` should reconnect the bridge.
- Desktop `interrupted` sessions and `stale` permission/question interactions
  have app-side helper copy under `mcode-app/src/agents/mcode-desktop`; stale
  interactions must not keep active response buttons.

Compatibility and native replication:

- Direct Codeg/OpenCode events do not use relay checkpoints.
- Relay `eventId` remains separate from ACP `seq`; native clients must not
  merge these sequences.
- The P20 checkpoint can be memory-only for the first slice; durable app restart
  checkpoint persistence is a later storage decision.
- Native clients should pass `lastEventId` only for the same authenticated
  gateway session context and should update it after successful event handling,
  not on raw WebSocket receive.
- Native clients should run the same replay-miss recovery flow: update bridge
  health, show recoverable warning copy, refresh/calibrate visible sessions, and
  keep official CLI state under `targetAgent = mcode-desktop`.

## P21 App Relay Checkpoint Persistence Behavior

P21 makes the P20 relay checkpoint survive app restart without changing relay
or Desktop protocols. The app persists only the relay high-water
checkpoint needed for `/v1/events?lastEventId=...`; it will not persist gateway
tokens, pair secrets, official CLI credentials, raw relay payloads, or Desktop
runtime snapshots in the checkpoint store.

Design document:
`docs/superpowers/specs/2026-06-28-mcode-p21-app-relay-checkpoint-persistence-design.md`.
Implementation plan:
`docs/superpowers/plans/2026-06-28-mcode-p21-app-relay-checkpoint-persistence.md`.

Implemented app behavior:

- `relayCheckpointStore.ts` under `mcode-app/src/services/gateway/` owns
  the versioned `mcode_relay_checkpoints_v1` snapshot in `uni` storage.
- The store writes one checkpoint record per `instanceKey`: `instanceKey`,
  `lastRelayEventId`, and `updatedAt`.
- `acpApi` hydrates relay recovery state from the store before opening the
  realtime bridge.
- A new checkpoint is persisted only after wrapped relay event payload handling
  succeeds.
- `replay_miss.lastEventId` is persisted as the relay high-water checkpoint after
  starting the state refresh/calibration path, so the app stops requesting an
  event id outside the retained replay window.
- Persisted checkpoints are cleared when `clearRelayRecoveryState()` clears the
  matching in-memory recovery state.

Native replication:

- Native iOS/Android clients should use a small key-value checkpoint store
  scoped by the same gateway instance identity used for realtime reconnect.
- The checkpoint belongs to the authenticated gateway instance, not to an ACP
  conversation.
- Persist only positive relay event ids and update timestamps.
- Never persist gateway tokens, official CLI credentials, or raw event payloads
  in checkpoint storage.

## P22 Planned Multi-client Session Coordination Behavior

P22 makes `mcode-desktop` the session host for official CLI-backed agents and
keeps relay as a multi-client transport gateway. Phone, watch, and desktop
clients may all connect to the same Desktop target and receive the current turn
stream in real time, regardless of which client started the task. A client does
not own the whole Desktop target; Desktop owns the CLI session and coordinates
write operations per active turn.

Design document:
`docs/superpowers/specs/2026-06-28-mcode-p22-multi-client-session-coordination-design.md`.

Planned relay behavior:

- `/v1/events` continues to allow multiple subscribers for the same Desktop
  target.
- relay assigns or accepts a stable `clientId` for each app connection and
  forwards it on mutating proxy calls to Desktop.
- Desktop-originated session events are broadcast to every subscribed client.
- replay/checkpoint behavior remains independent from client ownership; a
  reconnecting device can recover missed events without stealing session state.
- relay must not enforce a single-controller lease for Desktop targets.

Planned Desktop behavior:

- `mcode-desktop` owns Codex/Claude official CLI sessions and keeps official CLI
  credentials local.
- Desktop tracks `activeTurnId`, `activeTurnOwnerClientId`, and pending
  permission/question interactions per hosted session.
- If another client calls `acp_prompt` while a turn is active, Desktop returns
  `turn_busy` instead of queueing or running concurrently.
- Permission/question responses use first-valid-responder-wins semantics.
  Desktop broadcasts the resolved interaction to every client.
- `activeControllerId` may remain a legacy diagnostic, but new code should
  prefer `activeTurnOwnerClientId` and must not treat a single client as owner
  of the whole target.

Planned app behavior:

- Every client renders the active turn stream even when another device started
  it.
- `turn_busy` maps to user copy such as `其他设备正在执行任务，请等待当前任务完成。`
- Interactions resolved by another device disable local controls and show copy
  such as `该请求已由其他设备处理。`
- Codex and Claude official CLIs remain Desktop capabilities under
  `targetAgent = mcode-desktop`; native/mobile clients must not add direct
  official CLI target agents.

Native replication:

- Native clients should generate and persist a per-install `clientId`.
- Native clients should subscribe to Desktop target events as viewers even when
  another device started the active turn.
- Treat `turn_busy` as a recoverable busy state, not as connection loss.
- Disable permission/question controls after any resolved event arrives.

Implementation progress:

- Relay now treats app clients as multiple subscribers, assigns/reuses
  `clientId`, includes it in `/v1/events` ready frames, and forwards client
  identity on `proxy_request` to Desktop.
- Desktop now records active turn ownership per hosted official CLI session,
  rejects concurrent prompt attempts with `turn_busy`, and annotates resolved
  permission/question interactions with `responderClientId`.
- App now persists a per-install relay `clientId`, sends it on relay HTTP and
  event connections, maps `turn_busy` to multi-device busy copy, and treats
  resolved interactions from any device as authoritative.

P22 first slice status:

- Implemented multi-client event observation with relay `clientId`.
- Implemented Desktop-hosted active turn coordination with `turn_busy`.
- Implemented first-valid-responder-wins metadata for interactions.
- Not implemented: prompt queueing and explicit cancel/takeover of another
  device's active turn.

## P23 Planned Active Turn Control Behavior

P23 adds operation-level cancellation for active Desktop-hosted official CLI
turns. It is the practical "takeover" foundation for multi-device use: another
paired device does not steal a running Codex/Claude provider turn, but it can
request cancellation, observe Desktop settling the provider process, and then
start the next prompt after the active-turn guard is cleared.

Design document:
`docs/superpowers/specs/2026-06-28-mcode-p23-active-turn-control-design.md`.
Implementation plan:
`docs/superpowers/plans/2026-06-28-mcode-p23-active-turn-control.md`.

Planned relay behavior:

- Continue forwarding P22 `clientId` and `client` metadata on
  `/v1/proxy/acp_cancel`.
- Continue broadcasting Desktop-originated turn-control events to every
  subscriber of the target.
- Do not store cancel ownership, active turn state, or controller leases in
  relay.
- Official and self-hosted gateways use the same additive protocol.

Planned Desktop behavior:

- Keep `acp_cancel` as the public command for active turn cancellation.
- When a hosted official CLI turn is active, record
  `cancelRequestedByClientId`, `cancelRequestedAtMs`, and `cancelReason` on the
  active-turn/session diagnostics.
- Emit `turn_cancel_requested` before invoking the provider cancellation path.
- Reuse Codex app-server `turn/interrupt` plus fallback stop behavior, and reuse
  Claude/process cancellation for stdio adapters.
- Emit `turn_cancelled` after successful settlement or `turn_cancel_failed` with
  a safe error summary if Desktop cannot cancel cleanly.
- Treat duplicate cancel requests for the same active turn as idempotent
  `cancel_requested`, not as duplicate provider interrupts.
- Preserve existing `acp_cancel` response compatibility with
  `status = canceled`; P23 request-state metadata is additive under
  `cancelStatus = cancel_requested`.

Planned app behavior:

- Any paired client connected to the Desktop-hosted active turn may call
  `acp_cancel`.
- The requesting device shows `正在取消当前任务...`; other devices show
  `其他设备正在取消当前任务。`
- On `turn_cancelled`, clear generating state and allow a new prompt.
- On `turn_cancel_failed`, show a recoverable error and keep refresh/reconnect
  actions available.
- UI must not imply one device owns the whole Desktop target; active turn owner
  and cancel requester are diagnostics only.

Compatibility and native replication:

- Older clients may keep calling `acp_cancel(connectionId)` without a client id;
  Desktop should treat the requester as `unknown`.
- Existing `canceled`/`cancelled` status handling remains valid.
- Direct Codeg/OpenCode paths are unaffected unless they later opt into the
  same event names.
- Native clients should keep using the persistent relay `clientId`, send
  cancellation only through Desktop `acp_cancel`, disable duplicate cancel
  controls while cancellation is pending, and only allow a new prompt after
  `turn_cancelled` or a refreshed snapshot shows no active turn.

Implementation progress:

- Relay coverage now explicitly verifies that `acp_cancel` forwards the same
  P22 `clientId` metadata as prompt and interaction commands.
- Desktop now records active-turn cancel requester metadata, emits
  `turn_cancel_requested` and `turn_cancelled`, treats duplicate cancel requests
  as idempotent, and keeps the active-turn guard authoritative until
  cancellation settlement.
- App now normalizes P23 turn-control events and synchronizes local/other-device
  cancellation copy, cancelled idle transition, and recoverable cancel failure
  state across subscribed clients.

P23 first slice status:

- Implemented client-identity forwarding coverage for `acp_cancel`.
- Implemented Desktop-hosted active-turn cancel requester metadata and
  cancellation lifecycle events.
- Implemented app turn-control event normalization and multi-device cancel copy.
- Preserved existing `acp_cancel` compatibility with `status = canceled`; P23
  request-state metadata is additive under `cancelStatus`.
- Not implemented: prompt queueing or a separate `acp_takeover` command.

## P24 Desktop Prompt Queue Behavior

P24 adds a Desktop-hosted prompt queue for official CLI-backed sessions. The
external connection model remains unchanged: Codex and Claude official CLIs are
still Desktop capabilities under `targetAgent = mcode-desktop`; relay remains a
transport gateway and does not own queue state or CLI semantics.

Design document:
`docs/superpowers/specs/2026-06-28-mcode-p24-desktop-prompt-queue-design.md`.
Implementation plan:
`docs/superpowers/plans/2026-06-28-mcode-p24-desktop-prompt-queue.md`.

Desktop behavior:

- `AppState.queued_prompts` stores an in-memory FIFO queue per CLI `sessionId`.
- If `acp_prompt` reaches a hosted session that already has an active turn,
  Desktop enqueues the prompt by default and returns
  `status = queued`, `queued = true`, `queueItemId`, `queuePosition`,
  `queueLength`, `activeTurnId`, and `activeTurnOwnerClientId`.
- Clients may opt out with `queueIfBusy = false`; Desktop then preserves the
  P22 `turn_busy` error behavior.
- Queue length is capped to a bounded first-slice limit. Overflow returns a
  retryable `turn_queue_full` error and does not drop existing queued prompts.
- `acp_cancel_queued_prompt` cancels a queued item without interrupting the
  active provider turn.
- After prompt completion, prompt error, or successful active-turn cancellation,
  Desktop auto-starts the next queued prompt if the hosted session is idle.
- Desktop emits additive queue events:
  `turn_queued`, `turn_queue_updated`, `turn_dequeued`, `turn_started`,
  `turn_queue_cancelled`, and `turn_queue_failed`.
- Desktop health exposes `promptQueueCount` and per-item summaries for
  diagnostics.

App behavior:

- `mcode-app` normalizes queue events from snake_case or camelCase payloads into
  one `TurnQueueEvent` shape.
- Conversation runtime sessions expose `sharedPromptQueue = { count, items,
  lastMessage }` as shared Desktop queue metadata. This is separate from the
  local composer draft queue.
- `turn_queued` inserts a shared queue item and shows queued copy. Queue update
  events only update existing items so a cancel update cannot reinsert a removed
  item.
- `turn_dequeued`, `turn_started`, and `turn_queue_cancelled` remove the queued
  item. `turn_started` moves the session into thinking state; streaming events
  remain authoritative for visible assistant content.
- `turn_queue_failed` removes the queued item and surfaces a recoverable runtime
  error.
- If `acp_prompt` returns `status = queued`, the detail send path treats the
  request as accepted, removes the local optimistic user turn, and relies on the
  shared queue event/state instead of waiting for an immediate active turn.

Compatibility and limits:

- P24 queue state is intentionally memory-only; queued prompts do not survive
  Desktop restart. P19 recovery continues to cover outbound event replay and
  interrupted session diagnostics, not queued prompt persistence.
- Existing clients that do not understand queue events can ignore them. They
  still receive the queued prompt response body and later normal stream events
  when the queued prompt starts.
- Existing `turn_busy` handling remains available for older Desktop versions
  and for explicit `queueIfBusy = false`.
- Relay protocol changes are additive because queue lifecycle events travel
  through the existing `event_push` and `/v1/events` paths.

Native iOS/Android replication:

- Keep one local composer draft queue and one Desktop shared prompt queue; do
  not persist queued Desktop prompts in the mobile client as if they were local
  drafts.
- Treat `status = queued` as a successful send attempt, not as a timeout or
  failure. Remove any local optimistic turn unless the native UI has a distinct
  queued-message rendering model.
- Subscribe to the same queue lifecycle events and update queue count/items by
  `queueItemId`.
- Allow active-turn cancel and queued-item cancel to remain separate commands:
  `acp_cancel` for the running provider turn, `acp_cancel_queued_prompt` for an
  item that has not started.
- Do not add mobile-side `codex` or `claude` target agents for this feature;
  official CLI queueing remains under `targetAgent = mcode-desktop`.

## P25 Shared Prompt Queue UI Behavior

P25 makes the P24 Desktop-hosted prompt queue visible and cancellable in
`mcode-app`. It does not change queue ownership: Desktop remains the queue host,
relay remains transport-only, and the app renders shared queue state from
`session.sharedPromptQueue`.

Design document:
`docs/superpowers/specs/2026-06-28-mcode-p25-shared-prompt-queue-ui-design.md`.

Implemented app behavior:

- Conversation detail shows a separate `Desktop 队列` surface when
  `sharedPromptQueue.count > 0`.
- The existing local draft queue remains separate and keeps its current
  `待发送` behavior.
- Shared queue rows show position, prompt preview, source device, created time,
  and a queued-item cancel action.
- Any paired client may cancel any queued item. This follows P23 active-turn
  cancellation semantics and prevents queued work from becoming unmanageable if
  the submitting device is offline.
- `acpCancelQueuedPrompt(connectionId, queueItemId, sessionId?)` calls
  `acp_cancel_queued_prompt` with `reason = "user_cancelled"`.
- Cancel UI disables only the clicked row while the request is in flight.
- The app must not remove rows optimistically; P24 queue lifecycle events remain
  authoritative.

Compatibility and native replication:

- Older Desktop builds that do not emit queue events simply do not show the
  shared queue UI.
- Older Desktop builds that reject `acp_cancel_queued_prompt` should surface a
  recoverable cancel-failed toast.
- Native clients should render Desktop shared queue state separately from local
  drafts, use `queueItemId` as the stable key, and wait for queue lifecycle
  events before removing cancelled rows.
- Official CLI queue UI remains under `targetAgent = mcode-desktop`; native
  clients must not add direct Codex or Claude target agents.

P25 first slice status:

- Implemented shared Desktop queue presentation helpers for title, summary,
  row preview, source labels, position labels, and cancel-disabled state.
- Implemented `acpCancelQueuedPrompt(...)` as the app wrapper for
  `acp_cancel_queued_prompt`.
- Implemented conversation detail shared queue UI separately from the local
  draft queue.
- Implemented queued-item cancel request state without optimistic row removal;
  P24 lifecycle events remain authoritative.
- Not implemented: queue reorder, queue persistence, bulk cancel, or ownership
  restrictions.

## P26 Desktop Queue Recovery Behavior

P26 persists Desktop-hosted queued prompts in the existing P19 recovery
snapshot. Only not-yet-started prompts are persisted; active provider turns
remain non-resumable and restore as interrupted sessions.

Design document:
`docs/superpowers/specs/2026-06-28-mcode-p26-desktop-queue-recovery-design.md`.
Implementation plan:
`docs/superpowers/plans/2026-06-28-mcode-p26-desktop-queue-recovery.md`.

Implemented Desktop behavior:

- `DesktopRecoverySnapshot.queuedPrompts` stores serializable queued prompt
  records without runtime `eventSink`.
- Restored queue items are visible through `desktop_get_health.promptQueue`.
- Desktop boot does not auto-start restored queue items.
- `acp_cancel_queued_prompt` can cancel restored queue items.
- Relay remains transport-only and does not own queue durability.

Compatibility and native replication:

- Snapshots without `queuedPrompts` restore an empty queue.
- Running CLI sessions still restore as interrupted; queued prompts that have
  not started remain manageable.
- Native clients should treat restored queue rows the same as live P24 queue
  rows, keep local drafts separate, and avoid mobile-side Codex or Claude
  target agents.

## P27 Queue Policy Controls Behavior

P27 adds first-slice Desktop queue policy controls without moving queue
ownership to relay.

Design document:
`docs/superpowers/specs/2026-06-28-mcode-p27-queue-policy-controls-design.md`.
Implementation plan:
`docs/superpowers/plans/2026-06-28-mcode-p27-queue-policy-controls.md`.

Planned Desktop behavior:

- Health exposes `promptQueuePolicy` and `expiredPromptQueueCount`.
- Queue overflow uses policy `queueLimit`.
- Recovery drops queued prompts older than policy `maxRestoredAgeMs`.
- Expired restored prompts are counted and recorded as Desktop diagnostics.
- `acp_cancel_all_queued_prompts` clears queued prompts for one Desktop
  session without interrupting the active provider turn.

Implemented app behavior:

- Conversation detail shared Desktop queue can show a `清空` action.
- Clear-all calls `acp_cancel_all_queued_prompts` and disables while in flight.
- Shared queue rows remain event-authoritative and are not removed
  optimistically.

Compatibility and native replication:

- Older Desktop builds may reject clear-all; clients should show a recoverable
  failure message.
- Native clients should treat clear-all as a Desktop shared queue action, not as
  a local draft queue operation.

P27 first slice status:

- Implemented Desktop `PromptQueuePolicy` with default queue limit, restored
  queue age limit, and any-client cancel flag.
- Implemented health fields `promptQueuePolicy` and
  `expiredPromptQueueCount`.
- Implemented restored queued-prompt expiry with Desktop diagnostics.
- Implemented `acp_cancel_all_queued_prompts` for one Desktop session.
- Implemented app API wrapper and conversation-detail `清空` action.
- Not implemented: queue reorder, priority scheduling, or hard ownership
  restriction enforcement.

## P28 Official CLI Completion Behavior

P28 completes the Desktop-hosted official CLI session model for Codex and
Claude. The important boundary is unchanged: the app and relay still only see
ACP-style session/turn/interaction events, while `mcode-desktop` owns the local
process lifecycle, credentials, diagnostics, and recovery state.

Implemented Desktop behavior:

- Codex and Claude official CLI sessions now share the same Desktop session
  shape under `targetAgent = mcode-desktop`.
- `runtime` / `protocol` remain provider diagnostics only. They identify the
  local adapter path such as `codex-cli-exec` or `claude-cli-stdio`, but they
  do not change the connection model seen by the app.
- Streaming output is normalized into ordered ACP-style `stream_batch` events
  with stable `eventCount` / `streamedEventCount` accounting.
- Permission and question requests are captured as pending interactions,
  resolved through the shared `acp_respond_permission` and
  `acp_respond_question` paths, and mirrored into health snapshots.
- `acp_cancel` cancels the active official CLI process through the shared host
  contract.
- If Desktop restarts while a CLI session is running, the restored session is
  marked `interrupted`, not resumable.
- Session diagnostics surface `exitCode`, `stderrPreview`, `lastEventAtMs`,
  active turn metadata, and provider-specific protocol details for debugging.

Native iOS/Android replication guidance:

- Keep the same session model and event names; do not expose Codex/Claude as
  separate mobile target agents.
- Treat `targetAgent = mcode-desktop` as the stable host identity and use
  `runtime` / `protocol` only as adapter diagnostics.
- Preserve interrupted official CLI sessions as terminal state that requires a
  new prompt rather than a resume.
- Mirror the same interaction and cancel semantics so multiple clients can
  observe and resolve a Desktop-hosted turn without taking ownership of the
  provider process.

## P29 Shared Queue Priority And Reorder Behavior

P29 extends the Desktop-hosted shared prompt queue with reorder and priority
controls.

Implemented Desktop behavior:

- Desktop exposes queue mutation capability metadata in connect/session health
  responses so the app can hide unsupported controls.
- `acp_reorder_queued_prompt` supports `move_up`, `move_down`, `move_top`, and
  `move_bottom` for queued items.
- `acp_set_queued_prompt_priority` supports `low`, `normal`, and `high`.
- Reorder and priority changes broadcast `turn_queue_reordered`,
  `turn_queue_priority_changed`, and `turn_queue_updated`.
- Queue mutation events carry a full `queueSnapshot` so all subscribed clients
  can rebuild the same ordered queue.
- Queue order and priority persist through the existing Desktop recovery path.

Native iOS/Android replication guidance:

- Treat queue order and priority as shared Desktop state, not local UI state.
- Rebuild the visible queue from Desktop `queueSnapshot` payloads after each
  reorder or priority change.
- Gate mutation controls on Desktop capability metadata instead of assuming
  every hosted session supports them.
- Keep official CLI sessions under `targetAgent = mcode-desktop`; do not add
  mobile-side official CLI agents.

## P30 Enterprise Tenant Model Behavior

P30 turns the first enterprise relay slice into a tenant-aware model without
changing the relay wire protocol. Existing single-tenant deployments still work
because legacy snapshots and unaffiliated records fall back to the `default`
tenant.

Implemented relay behavior:

- `PairingStore` snapshots now persist `tenants`, `targets`, `sessions`, and
  `auditEvents`.
- `tenantId` is attached to pairing offers, targets, sessions, and audit
  events so persisted records stay scoped to the tenant that created them.
- `GET /v1/admin/tenants` returns tenant summaries.
- `POST /v1/admin/tenants` creates or updates a tenant record.
- `POST /v1/admin/devices/:targetId/tenant` reassigns a target to a new tenant
  and records an audit event.
- `GET /v1/admin/devices`, `/v1/admin/sessions`, and
  `/v1/admin/audit-events` accept tenant scoping through `tenantId` query or
  `x-mcode-tenant-id` header.
- `/health` reports tenant count in stats and `/v1/gateway/info` advertises
  `enterprise.tenants`.

Compatibility and native replication:

- Old JSON snapshots without a `tenants` array still restore with
  `tenantId = "default"`.
- Clients that do not care about tenant operations can ignore the new field;
  the public pairing and proxy contract is unchanged.
- Native admin tooling should keep the same default-tenant fallback and use the
  same filtering conventions when presenting tenant-scoped devices or audit
  history.

## P31 Admin RBAC Policy Behavior

P31 adds a relay-side RBAC layer for `/v1/admin/*` while keeping pairing,
proxy, event, tunnel, and desktop upstream protocols unchanged.

Implemented relay behavior:

- `ADMIN_TOKEN` remains the bootstrap owner credential for existing
  deployments.
- `ADMIN_TOKEN_ROLES` accepts a JSON object mapping admin tokens to
  `{ role, tenantId }` entries.
- Supported roles are `owner`, `admin`, and `auditor`.
- `owner` can read and mutate all admin resources.
- `admin` can read and mutate resources only inside its assigned tenant.
- `auditor` can read resources only inside its assigned tenant and cannot
  mutate state.
- Missing or invalid admin credentials return `401`.
- Valid admin credentials without permission return `403` with
  `{ error: "forbidden", reason }`.
- `/v1/gateway/info` reports `deployment.policyMode = "token-role"` and
  `deployment.policyWarnings`, but never exposes admin token values or role
  mappings.

Compatibility and native replication:

- Existing self-hosted relay deployments continue to work with only
  `ADMIN_TOKEN`; when `ADMIN_TOKEN_ROLES` is empty, the bootstrap token acts as
  `owner`.
- Native admin clients should treat `401` as authentication failure and `403`
  as an authorization failure.
- Native admin clients should not duplicate RBAC decisions locally; relay is
  the policy enforcement point.
- Mobile app and Desktop runtime clients do not need changes because non-admin
  relay protocols are untouched.

## P32 Audit Export And Retention Behavior

P32 adds enterprise audit export and configurable audit retention inside
`mcode-relay`. It builds on P30 tenant scoping and P31 RBAC and does not change
mobile, desktop, pairing, proxy, event, or tunnel protocols.

Implemented relay behavior:

- `AUDIT_EVENT_LIMIT` configures the retained in-process audit event count.
- `PairingStore` prunes the oldest audit events after each audit write once the
  configured limit is exceeded.
- `/v1/gateway/info` reports `deployment.auditRetentionLimit`.
- `GET /v1/admin/audit-events/export` exports audit events as JSON or JSONL.
- Export supports `tenantId` / `x-mcode-tenant-id`, `limit`, `since`, `until`,
  and `format=json|jsonl`.
- Export reuses the P31 `audit.read` policy, so owner can export globally while
  admin/auditor principals remain tenant-scoped.
- Exported audit metadata recursively redacts fields whose keys contain
  `token`, `secret`, `authorization`, or `password`.

Compatibility and native replication:

- Existing `/v1/admin/audit-events` behavior is preserved.
- Native admin tools should use JSON for in-app inspection and JSONL for file
  download or forwarding to compliance tooling.
- Native admin tools should surface `403` from audit export as RBAC denial and
  must not attempt to widen tenant scope client-side.
- Multi-node audit storage remains future gateway work.

## P33 Audit Webhook Sink Behavior

P33 adds best-effort external audit forwarding to `mcode-relay`. It keeps the
P32 local audit retention and export behavior, and it does not change mobile,
desktop, pairing, proxy, event, HTTP tunnel, or TCP tunnel protocols.

Implemented relay behavior:

- `AUDIT_WEBHOOK_URL` enables audit forwarding when non-empty.
- `AUDIT_WEBHOOK_SECRET` is optional and is sent only to the webhook receiver as
  `x-mcode-audit-secret`.
- `AUDIT_WEBHOOK_TIMEOUT_MS` bounds each delivery attempt.
- Relay writes the local audit event first, then schedules webhook delivery
  asynchronously.
- Webhook delivery uses payload shape `{ event }`.
- Webhook payload metadata uses the same recursive redaction as P32 audit
  export for keys containing `token`, `secret`, `authorization`, or `password`.
- Webhook failures, non-2xx responses, invalid URLs, and timeouts update sink
  diagnostics but do not fail pairing, refresh, or admin mutation requests.
- `/health` exposes `auditWebhook` status and `/v1/gateway/info` exposes
  `deployment.auditWebhook`.
- Diagnostics include enabled state, delivered count, failed count, last
  delivery timestamp, last error timestamp, and last error message.
- Diagnostics never expose webhook URL or webhook secret.

Compatibility and native replication:

- Existing deployments without `AUDIT_WEBHOOK_URL` behave as before.
- Native iOS/Android clients do not need to implement audit webhook delivery.
- Native admin screens may display webhook enabled state and delivery health,
  but must not request or render webhook URL or secret values.
- External immutable audit storage is now expected to live behind the webhook
  receiver; relay itself still does not provide immutable audit storage.

## P34 Admin Credential Rotation Behavior

P34 adds dynamic admin credentials to `mcode-relay` so enterprise operators can
create and revoke admin API tokens without editing environment variables or
restarting the gateway. It does not change mobile, desktop, pairing, proxy,
event, HTTP tunnel, or TCP tunnel protocols.

Implemented relay behavior:

- `ADMIN_CREDENTIAL_STORE_PATH` enables JSON-file persistence for dynamic admin
  credentials; empty config keeps them in memory.
- Dynamic credential records contain `credentialId`, `tokenHash`, `role`,
  `tenantId`, `label`, lifecycle timestamps, and revocation metadata.
- Relay stores only token hashes. Raw generated tokens are returned only once
  from `POST /v1/admin/credentials`.
- Dynamic credential resolution runs before static `ADMIN_TOKEN_ROLES` and
  bootstrap `ADMIN_TOKEN` fallback.
- `GET /v1/admin/credentials` returns safe credential metadata and never
  includes raw tokens or token hashes.
- `POST /v1/admin/credentials` creates `owner`, `admin`, or `auditor`
  credentials. `admin` and `auditor` require `tenantId`.
- `POST /v1/admin/credentials/:credentialId/revoke` revokes a dynamic
  credential immediately.
- Credential management requires owner role; tenant admins and auditors receive
  `403`.
- Credential create/revoke writes audit events and therefore also flows through
  P33 audit webhook forwarding when configured.
- Credential audit metadata includes safe ids, role, tenant scope, label, and
  expiry, but never includes raw tokens or token hashes.
- `/health` stats expose dynamic credential counts and
  `/v1/gateway/info` storage exposes `adminCredentialStore = memory|json-file`
  without exposing the JSON path.

Compatibility and native replication:

- Existing static `ADMIN_TOKEN` and `ADMIN_TOKEN_ROLES` deployments keep working.
- Native admin clients should show the generated token only on the create
  success screen and tell operators it cannot be viewed again.
- Native admin clients should treat revocation as immediate and irreversible.
- Native clients should not cache owner/admin/auditor authorization decisions;
  relay remains the policy enforcement point.

## P35 Tunnel Service Discovery Behavior

P35 returns the product direction to the remote-control client loop. It adds
service discovery for MCode Desktop local services so the app can show and open
desktop loopback services through the relay tunnel. It does not add app-side
gateway administration UI; relay Web administration is reserved for P36.

Implemented behavior:

- Desktop upstream `desktop_hello` and `pair_offer` now include
  `localServices`.
- Local service metadata is additive and uses `name`, `host`, `port`,
  `protocol = http|tcp`, and `enabled`.
- Relay normalizes local services, accepts only `host = 127.0.0.1`, drops
  invalid ports and duplicate ports, and stores safe service metadata on the
  target record.
- Pair and refresh target metadata include `localServices` when available.
- `GET /v1/target-services` is authenticated with the normal paired session
  access token and returns services for the current target only.
- App `RelayGateway` exposes optional `listTargetServices()`.
- App Desktop service discovery maps returned services into HTTP/TCP tunnel
  entries using the existing tunnel URL builder.
- App target page shows discovered MCode Desktop local services. HTTP services
  can be opened through relay tunnel URLs; TCP services are shown as discovered
  but remain informational in P35.

Compatibility and native replication:

- Older Desktop clients that do not send `localServices` produce an empty
  service list.
- Older app clients can continue using known tunnel URLs manually.
- Native clients must build service access URLs from relay base URL, target id,
  and service port. They must never try to connect directly to `127.0.0.1`
  values from Desktop metadata.
