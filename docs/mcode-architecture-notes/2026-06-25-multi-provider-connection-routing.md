# 2026-06-25 Multi-Provider Connection Routing

## Architecture

`mcode` 的连接体系从单一 `direct | relay` 升级为双维模型：

- `targetAgent = codeg | opencode | mcode-desktop`
- `routeMode = direct | gateway`
- `gatewayProvider = official | custom`

核心边界：

- `codeg` 与 `opencode` 可以不经过 `mcode-desktop` 直连。
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
  - provider 下拉：`MCode 官方网关`、`自定义`
  - 选择 `自定义` 后展示域名输入框

显示规则：

- 用户可见文案统一用 `网关`，不再新增 `中继` 文案。
- 连接卡片同时展示目标类型和路由方式。
- `MCode Desktop` 连接可显示能力标签，如 `Codex CLI`、`Claude CLI`、`内网穿透`。
- web/uni-app 连接卡片通过 `getConnectionCapabilityChips()` 从 `targetProfile.capabilities` 映射能力标签；当前只展示认识的 desktop capability，未知 key 不展示但保留在数据层。
- 网关模式下 target metadata 以 pair/refresh 返回值为准，UI 不强信本地旧值。
- web/uni-app 新增连接表单已经使用 `routeMode`、`targetAgent`、`gatewayProvider` 作为主状态；`mode`、`url`、`relaySession` 只作为当前网关运行时代码的兼容别名保留。
- `MCode 官方网关` 不展示域名输入框，构建时从 `VITE_MCODE_OFFICIAL_GATEWAY_BASE_URL` 读取默认网关地址；如果未配置，保存时提示“官方网关地址未配置”。选择 `自定义` 时必须填写 `gatewayBaseUrl`。

## Compatibility

- 旧连接继续可用，不要求用户重建。
- 历史 relay 连接默认按 `codeg` 网关连接处理；如果后续刷新拿到新的 `targetAgent`，静默更新本地缓存。
- `mcode-relay` 是服务名，app 文案统一显示为 `网关`。
- 首版正式新增入口重点支持 `mcode-desktop/gateway`；历史 `codeg/gateway` 仍保留兼容路径。
- 原生新实现不需要复制 web 端这层旧字段别名；只有在同一个客户端里仍存在旧页面或旧路由读取逻辑时，才需要做相同兼容桥接。
- 当历史 `codeg/gateway` 记录在 pair 后被识别成 `mcode-desktop` 时，持久化必须按“配对前的连接键”回写同一条记录，再把新 `targetAgent` 保存进去；否则会因为主键从 `codeg` 变成 `mcode-desktop` 而丢失升级结果。

## Native iOS/Android Replication Guidance

原生端应完全复刻以下规则：

- 连接模型必须同时保存 `targetAgent` 与 `routeMode`，不要再用单字段 `mode` 代替。
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
- 当前 P5 不实现 `acp_connect` 会话生命周期，也不把官方 CLI 输出归一成完整 ACP event stream。
- 原生 iOS/Android 复制时只需要消费 desktop gateway 连接的 capability 与 proxy 结果；不要在移动端实现官方 CLI 凭据管理。
- 如果后续官方 CLI 提供稳定 SDK 或服务接口，应只替换 desktop adapter 内部实现，外部 `proxy_request` / `proxy_response` 协议保持不变。
