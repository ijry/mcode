# 2026-06-25 Multi-Provider Connection Routing

## Architecture

`mcode` 的连接体系从单一 `direct | relay` 升级为双维模型：

- `targetType = codeg | opencode | mcode-desktop`
- `routeMode = direct | gateway`
- `gatewayProvider = official | custom`

核心边界：

- `codeg` 与 `opencode` 可以不经过 `mcode-desktop` 直连。
- `codex` 官方 CLI 与 `claude` 官方 CLI 不作为移动端独立 target，统一由 `mcode-desktop` 代理后暴露给 app。
- `mcode-relay` 是网关服务，负责配对、转发、事件流和 session refresh，不负责 CLI 语义归一化。
- `mcode-app` 继续消费统一的远端命令/事件契约；direct target adapter 和 `mcode-desktop` bridge 各自把实现映射到这套契约。
- `mcode-desktop` 明确采用 Tauri 形态：前端提供连接/配对/隧道/诊断 UI，后端托管 bridge server、CLI adapters、gateway upstream 和后台守护生命周期。
- `mcode-desktop` 的宿主机制参考 `LinkShell`：本地桥接、可拆分网关、共享协议、ACK 缓冲、重连恢复、单控制者模型、tunnel 预览。
- `mcode-app` 的 target 支持必须按目录隔离；推荐 `src/targets/codeg`、`src/targets/opencode`、`src/targets/mcode-desktop`、`src/targets/shared`，避免把所有 target 判断继续堆在共享服务里。

## Protocol And Data Flow

持久化连接记录升级为 `version: 2`，新增字段：

- `targetType`
- `routeMode`
- `directBaseUrl`
- `gatewayProvider`
- `gatewayBaseUrl`
- `gatewaySession`
- `targetProfile`

兼容规则：

- 旧 `mode = direct` 迁移为 `targetType = codeg`、`routeMode = direct`
- 旧 `mode = relay` 迁移为 `targetType = codeg`、`routeMode = gateway`、`gatewayProvider = official`
- 新二维码 / 配置码写 `version: 2`
- app 继续兼容读取 `version: 1`

网关协议变化：

- `POST /v1/pair` 和 `/v1/session/refresh` 返回 target metadata
  - `targetId`
  - `targetType`
  - `displayName`
  - `capabilities`
- `/v1/proxy/:command` 和 `/v1/events` 保持统一转发入口
- 预留 tunnel 转发入口供 desktop 暴露本地 dev server 预览
- relay 只转发 payload，不做 target-specific 改写
- desktop / relay 握手需带协议版本，并支持 ACK 序号、重放窗口和断线后短时会话保留

desktop 外网接入流程：

1. `mcode-desktop` 把本地目标绑定到 `127.0.0.1:1080`
2. desktop 向 `mcode-relay` 注册 target
3. desktop 生成 `version: 2` 网关二维码
4. `mcode-app` 扫码后保存 `routeMode = gateway` 连接

desktop 运行方式：

- 桌面窗口关闭后，bridge / upstream 可继续在托盘中运行
- 用户从 tray 或主窗口恢复、停止、重启 bridge
- 官方 CLI 子进程由 Tauri backend 统一监管，不要求用户手工执行命令行

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

## Compatibility

- 旧连接继续可用，不要求用户重建。
- 历史 relay 连接默认按 `codeg` 网关连接处理；如果后续刷新拿到新的 `targetType`，静默更新本地缓存。
- `mcode-relay` 是服务名，app 文案统一显示为 `网关`。
- 首版正式新增入口重点支持 `mcode-desktop/gateway`；历史 `codeg/gateway` 仍保留兼容路径。

## Native iOS/Android Replication Guidance

原生端应完全复刻以下规则：

- 连接模型必须同时保存 `targetType` 与 `routeMode`，不要再用单字段 `mode` 代替。
- direct token 与 gateway session 分开存储，且 direct token 只按 direct base URL 作用。
- 二维码 / 配置码必须支持 `version: 1` 读取和 `version: 2` 写入。
- 网关连接创建后，以 pair/refresh 响应中的 `targetType`、`displayName`、`capabilities` 覆盖本地缓存。
- 连接驱动选择必须基于 `targetType + routeMode`，而不是只看 URL 或旧 `mode`。
- desktop capability 缺失时，应在入口层阻止进入而不是等 RPC 调用失败。
- 对 desktop gateway 连接，原生端要准备好消费 ACK/重放式事件流与单控制者状态，而不是假设永远只有单设备在线。
- 前端代码组织也应按 target 分目录，target-specific 组件和适配逻辑不要回灌到共享大文件。
