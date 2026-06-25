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
- relay 侧的 `PairingStore` 已保存 `targetAgent`、`capabilities`、`protocolVersion`；`pair_offer` 和 `desktop_hello` 从 desktop 上游同步这些字段，历史调用缺省按 `codeg` / protocol `1` 兼容。
- `/v1/events` 推送统一包装为 `{ eventId, channel, payload, controllerId? }`，relay 为每个 target 维护有限 replay buffer；mobile 重连时可带 `lastEventId` / `last_event_id` 查询参数补收缺失事件。
- `/v1/tunnel/:targetId/:port/*` 是 mobile 到 desktop 本地 HTTP 服务的网关入口。relay 校验 access token 中的 `targetId` 必须等于 path target，再向 desktop upstream 发送 `tunnel_request`，desktop 以 `tunnel_response` 返回 status/headers/body。

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
