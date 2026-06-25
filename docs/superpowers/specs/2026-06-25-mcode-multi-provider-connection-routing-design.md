# mcode Multi-Provider Connection Routing Design

**Date:** 2026-06-25  
**Scope:** `mcode-app`, `mcode-desktop`, `mcode-relay` 的多产品连接模型与网关拓扑重构  
**Products:** `mcode-app`, `mcode-desktop`, `mcode-relay`

---

## Problem

当前 `mcode-app` 的连接模型只有二元 `direct | relay`，且默认把远端能力视为 `codeg` 风格主机：

- 这不足以表达 “直连 Codeg / 直连 OpenCode / 直连 MCode Desktop” 三种不同目标。
- 这也无法表达 “通过网关连接到 desktop，再由 desktop 代理 Codex CLI / Claude CLI” 这种最终必需形态。
- `codex` 官方 CLI 和 `claude` 官方 CLI 没有稳定的官方对外接口，移动端不能直接接它们，必须借助 `mcode-desktop`。
- 用户又不能被强制要求一定安装 `mcode-desktop`，因为最终形态必须支持用户直接连接 `codeg`、`opencode` 等第三方 agent。

因此，问题不是“要不要抽象一个统一入口”，而是要把两个原本混在一起的维度拆开：

1. 连接目标是谁。
2. 数据怎么路由过去。

## Goals

- 让 `MCode` 同时支持：
  - 直连 `Codeg`
  - 直连 `OpenCode`
  - 直连 `MCode Desktop`
  - 通过网关连接 `MCode Desktop`
- 让 `mcode-desktop` 成为可选组件，而不是必选中间层。
- 让 `mcode-desktop` 为官方 CLI 代理、局域网直连、内网穿透三个场景提供统一宿主能力。
- 让 `mcode-relay` 成为桌面端上行连接和移动端下行访问的网关服务，并与 `mcode-app`、`mcode-desktop` 同步演进。
- 保持现有 `mcode-app` 页面尽量继续消费同一套远端命令/事件语义，避免每个页面按产品再分叉一遍。
- 为后续自建网关场景保留能力：新增连接时可选 `MCode 官方网关` 或 `自定义` 域名。

## Non-Goals

- 本次设计不要求一次性实现所有 provider 的业务能力细节。
- 本次设计不改变聊天、会话列表、项目列表等上层产品交互目标。
- 本次设计不要求 `mcode-relay` 理解 Codex CLI 或 Claude CLI 的业务语义；这些归一化工作应留在 `mcode-desktop`。
- 本次设计不要求立即开放“网关模式直连第三方 agent”的 UI；可以先只对 `mcode-desktop` 正式开放网关入口。

## Options Considered

### 1. 所有连接都强制走 `mcode-desktop`

让 `MCode` 永远只连接 `mcode-desktop`，再由 desktop 转给 `codeg`、`opencode`、`codex cli`、`claude cli`。

**优点**

- app 端协议最统一
- 官方 CLI 接入最简单

**缺点**

- 违反最终形态要求，用户无法无 desktop 直连第三方 agent
- 桌面端变成硬依赖，部署复杂度明显上升
- 第三方 agent 明明已有可直连能力时也被强行套一层代理

### 2. 每个产品都在 `mcode-app` 里单独直连，不做 desktop 与网关体系

让 app 分别接 `codeg`、`opencode`、`codex cli`、`claude cli`，不引入 desktop 和 relay。

**优点**

- 表面上链路最短
- 架构图最简单

**缺点**

- `codex` 官方 CLI 和 `claude` 官方 CLI 缺少稳定外部接口，实际上不可行
- 无法提供内网穿透、自建网关、二维码远程接入等能力
- app 需要承接过多 provider 细节，维护成本过高

### 3. 连接目标与路由方式分离，desktop 可选，网关独立存在

把连接模型拆成：

- `targetType = codeg | opencode | mcode-desktop`
- `routeMode = direct | gateway`
- `gatewayProvider = official | custom`

并规定：

- `codeg` / `opencode` 可以无 desktop 直连
- `codex cli` / `claude cli` 通过 `mcode-desktop` 提供统一桥接
- `mcode-relay` 只负责会话、转发、配对和事件通道

**优点**

- 满足最终产品形态
- 拓扑清晰，不会把“目标是谁”和“怎么连过去”继续耦在一起
- app、desktop、relay 各自职责更稳定

**缺点**

- 需要做一次存量连接模型迁移
- 三个产品需要同步演进

## Chosen Design

采用 **方案 3**。

核心原则只有两条：

1. `mcode-desktop` 是可选宿主，不是强制入口。
2. `mcode-app` 继续面向一套统一的远端命令/事件契约工作，但每个目标可以用自己的适配器实现这套契约。

这里的“统一契约”只解决页面如何复用，不改变最终部署拓扑。部署拓扑上，`codeg` / `opencode` 仍然可以不经过 desktop。

补充决定：

- `mcode-desktop` 明确采用 **Tauri 桌面应用** 形态，而不是另起一个 CLI-first 产品。
- `mcode-desktop` 的桥接、网关和可靠性机制参考 `LinkShell` 已验证的宿主思路，但落地为 Tauri 壳 + 后台受管运行时，而不是直接复刻其命令行交互。

## Detailed Design

### 1. Concept Model

连接模型拆成三层概念：

- **Target**
  - `codeg`
  - `opencode`
  - `mcode-desktop`
- **Route**
  - `direct`
  - `gateway`
- **Gateway Provider**
  - `official`
  - `custom`

解释规则：

- `direct` 表示 app 直接连目标服务。
- `gateway` 表示 app 连网关，网关再把会话转到远端目标。
- `mcode-desktop` 是一种目标类型，不等于 route。
- `codex cli` / `claude cli` 在移动端视角下不作为独立 target 暴露；它们属于 `mcode-desktop` 提供的能力集。

### 2. Persisted Connection Shape

`mcode-app` 的持久化连接记录升级到 `version: 2`。

推荐结构：

```ts
type ConnectionTargetType = "codeg" | "opencode" | "mcode-desktop"
type ConnectionRouteMode = "direct" | "gateway"
type GatewayProvider = "official" | "custom"

interface ConnectionItemV2 {
  version: 2
  name: string
  targetType: ConnectionTargetType
  routeMode: ConnectionRouteMode

  directBaseUrl?: string
  directToken?: string

  gatewayProvider?: GatewayProvider
  gatewayBaseUrl?: string
  pairCode?: string
  pairSecret?: string
  gatewaySession?: {
    accessToken: string
    refreshToken?: string
    targetId?: string
  }

  targetProfile?: {
    targetType: ConnectionTargetType
    targetId?: string
    displayName?: string
    capabilities?: string[]
  }
}
```

设计约束：

- `directBaseUrl` 只在 `routeMode = direct` 时有效。
- `gatewayProvider` / `gatewayBaseUrl` / `pairCode` / `pairSecret` / `gatewaySession` 只在 `routeMode = gateway` 时有效。
- `targetProfile` 是配对或探测后的缓存信息，优先信任服务端返回值。
- `targetType` 是上层 UI 和页面路由使用的主字段；如果配对结果与已存值不一致，以服务端回传覆盖本地旧值。

### 3. Legacy Migration

现有 `mcode_connections` 中的旧记录按以下规则迁移：

- `mode = "direct"`:
  - 升级为 `version = 2`
  - `targetType = "codeg"`
  - `routeMode = "direct"`
  - `directBaseUrl = old.url`
  - `directToken = old.directToken`
- `mode = "relay"`:
  - 升级为 `version = 2`
  - `targetType = "codeg"`
  - `routeMode = "gateway"`
  - `gatewayProvider = "official"`
  - `gatewayBaseUrl = old.url`
  - `pairCode = old.pairCode`
  - `pairSecret = old.pairSecret`
  - `gatewaySession = old.relaySession`

说明：

- 存量 `relay` 连接先按 `codeg` 历史网关连接处理，保证不丢兼容性。
- 如果旧网关连接实际已切到新的 desktop 上游，后续以配对返回的 `targetProfile.targetType` 覆盖旧值。
- `mcode-app` 必须继续兼容读取旧的路由参数和配置码，直到所有入口都迁到 `version: 2`。

### 4. Connection Wizard UI

新增连接弹窗改为两层结构：

1. 顶层路由方式
   - `直连`
   - `中转（网关）`
2. 路由方式下的目标或服务商配置

#### 4.1 直连

`直连` 模式提供三个目标卡：

- `Codeg`
- `OpenCode`
- `MCode Desktop`

首版手动表单统一保留：

- `连接名称`
- `服务地址`
- `访问令牌`

差异规则：

- `Codeg` 使用现有直连地址 + Bearer Token 语义。
- `OpenCode` 首版也使用地址 + 令牌输入，具体鉴权由 direct adapter 解释。
- `MCode Desktop` 直连的是 desktop 自身桥接服务，而不是某个 CLI 进程。

#### 4.2 中转（网关）

`中转（网关）` 模式提供：

- `连接名称`
- `通道服务商` 下拉
  - `MCode 官方网关`
  - `自定义`
- `自定义域名` 输入框
  - 只在 `自定义` 时显示
- `配对代码`
- `配对密钥`

规则：

- `MCode 官方网关` 默认使用 app 配置里的官方网关域名，不要求用户再手填。
- `自定义` 时必须输入完整域名，优先要求 `https://`，仅本地开发允许 `http://127.0.0.1` 或局域网地址。
- 网关模式创建成功后，target type 以配对响应为准。
- 首版 UI 正式引导的网关目标是 `mcode-desktop`；历史 `codeg` 网关连接继续可用，但不作为新增主路径强调。

#### 4.3 Connection Card Presentation

连接卡片需要同时展示两类信息：

- 目标类型：`Codeg` / `OpenCode` / `MCode Desktop`
- 路由方式：`直连` / `网关`

文案与状态规则：

- 用户可见文案统一使用 `网关`，不再继续扩散 `中继` 一词。
- `官方网关` 与 `自定义网关` 作为次级标识展示。
- `MCode Desktop` 卡片允许展示能力标签，如 `Codex CLI`、`Claude CLI`、`内网穿透`。

### 5. QR And Config Code Format

连接二维码 / 配置码升级为 `version: 2`，但必须继续兼容 `version: 1` 读取。

`version: 2` 增加：

- `targetType`
- `routeMode`
- `gatewayProvider`
- `gatewayBaseUrl`
- `targetProfile`

示例：

```json
{
  "version": 2,
  "name": "Office Desktop",
  "targetType": "mcode-desktop",
  "routeMode": "gateway",
  "gatewayProvider": "official",
  "pairCode": "ABCD-1234",
  "pairSecret": "secret-value"
}
```

兼容规则：

- 导入时先尝试按 `version: 2` 解析。
- 如果是 `version: 1`，按上一节迁移规则投影到 `ConnectionItemV2`。
- 新建或重新导出的连接统一写 `version: 2`。

### 6. App Transport Architecture

`mcode-app` 不能继续只靠 `createGateway(mode)` 判断所有连接行为，需要改成 “目标 + 路由” 双维路由解析：

- `codeg/direct`
- `opencode/direct`
- `mcode-desktop/direct`
- `mcode-desktop/gateway`
- `codeg/gateway`
  - 仅兼容历史记录，先保留

建议结构：

- `connectionContext` 负责解析、迁移、持久化、编码路由参数
- `connectionDriverRegistry` 负责根据 `targetType + routeMode` 选择 driver
- 每个 driver 实现同一套 app-facing 命令/事件契约

前端目录约束：

- `mcode-app` 中不同 `targetType` 的逻辑和组件必须按 target 独立分目录组织。
- 推荐目录：
  - `mcode-app/src/targets/codeg/`
  - `mcode-app/src/targets/opencode/`
  - `mcode-app/src/targets/mcode-desktop/`
  - `mcode-app/src/targets/shared/`
- target 自己的目录负责：
  - connection driver
  - target-specific RPC 适配
  - target-specific UI 组件
  - target-specific presentation / capability 映射
- shared 目录只保留真正跨 target 的 contract、类型和无差异工具函数。
- 例如后续增加 `opencode` 支持，应优先在 `src/targets/opencode/` 下补充实现，而不是继续把判断分支塞回通用连接页或 `services/gateway` 大杂烩文件。

关键点：

- app 顶层页面继续面向统一契约，例如项目列表、会话列表、会话详情、事件流。
- 统一契约首版沿用现有 `codeg` 风格 RPC / event 语义，降低页面改造面。
- `opencode` direct adapter 和 `mcode-desktop` bridge 负责把各自实现映射成这套契约。

这不是把所有目标都“抽象成必须经 desktop”；它只是保证 app 页面对远端能力的消费方式一致。

### 7. mcode-desktop Responsibilities

`mcode-desktop` 负责三类事情：

1. **官方 CLI 代理**
   - 驱动本机 `codex` 官方 CLI
   - 驱动本机 `claude` 官方 CLI
   - 把命令、事件、会话状态归一到 app-facing 契约
2. **本地直连宿主**
   - 暴露给局域网或本机其它设备访问的 bridge 服务
   - 支持移动端直连 `MCode Desktop`
3. **网关 / 内网穿透宿主**
   - 主动连到 `mcode-relay`
   - 在“内网穿透”页为本地目标建立外网可访问的网关连接
   - 用户可从 desktop 直接生成二维码给 `MCode` 扫码导入

Desktop 内部应拆为：

- `runtime adapters`
  - `codex-cli`
  - `claude-cli`
  - 后续可扩展其它官方 CLI
- `bridge server`
  - direct HTTP/WebSocket 服务
- `gateway upstream client`
  - 负责与 `mcode-relay` 保持上行会话
- `tunnel manager`
  - 把本地服务绑定到 loopback 再发布为扫码可接入的网关目标

#### 7.1 Tauri Host Shell

`mcode-desktop` 采用 Tauri，职责拆分为：

- **Tauri frontend**
  - 连接管理
  - 官方 CLI 状态面板
  - 内网穿透页
  - 配对二维码与诊断页
- **Tauri backend**
  - 启停本地 bridge server
  - 管理 `codex` / `claude` CLI 子进程或 sidecar
  - 托管 gateway upstream 会话
  - 处理系统托盘、自启动、权限申请、日志采集
- **managed runtime workers**
  - 长连接、缓冲、重连、port tunnel、屏幕/浏览器预览等长生命周期任务

设计约束：

- 用户感知的是桌面应用，不要求打开命令行执行 `start` 或 `daemon`。
- 但运行时能力必须等价于“后台守护进程 + 本地桥接 + 可选远程网关”。
- Tauri 后端应具备把 bridge/gateway 运行时最小化驻留到托盘的能力，避免用户关闭窗口就中断会话。

#### 7.2 LinkShell-Inspired Runtime Mechanics

`mcode-desktop` 参考 `LinkShell` 的宿主机制，明确吸收以下做法：

- **本地桥接 + 可拆分网关**
  - desktop 既能本机直接开 bridge，也能连接远程 `mcode-relay`
- **共享协议与版本协商**
  - app / desktop / relay 共享消息 schema 和版本协商，避免灰度发布时直接断链
- **ACK + 双层缓冲**
  - desktop 本地缓冲 + relay 边缘缓冲两层确认，保证手机重连后能补齐最近事件
- **指数退避自动重连**
  - desktop 上行断线与 app 下行断线都走统一退避策略
- **单控制者模型**
  - 一个会话同一时刻只允许一个主动输入控制端，避免多端同时操作 `codex` / `claude` CLI 造成状态错乱
- **tunnel/preview 通道**
  - 内网穿透不仅传终端/Agent 事件，还要支持本地 dev server 的 HTTP/WebSocket 预览
- **后台守护**
  - bridge 与 gateway upstream 必须支持窗口关闭后继续运行，由 Tauri 托盘入口恢复和停止

不照搬的部分：

- 不直接复刻 `LinkShell` 的 CLI 命令体系。
- 不把“宿主”命名成 CLI；在 `mcode` 体系里它就是 `mcode-desktop`。
- 网页控制台可以作为诊断能力保留，但不是首版必须交付的主入口。

### 8. Official CLI Handling

`codex` 官方 CLI 和 `claude` 官方 CLI 的移动端接入策略固定为：

- 不要求 `mcode-app` 直接操作官方 CLI
- 由 `mcode-desktop` 在本机拉起或接管 CLI
- 由 `mcode-desktop` 负责：
  - 命令调用
  - 事件转发
  - 权限提示
  - 长任务状态
  - 会话映射

`mcode-app` 看到的是 `targetType = mcode-desktop`，以及 desktop 回传的能力列表，例如：

- `desktop.runtime.codex-cli`
- `desktop.runtime.claude-cli`
- `desktop.tunnel.available`

如果 desktop 未安装某个 CLI 或权限不足，应在能力描述里明确返回不可用状态，由 app 禁止用户进入对应路径，而不是等调用时报底层错误。

### 9. mcode-relay Responsibilities

`mcode-relay` 要同步升级，但职责保持克制：

- 接受所有 `mcode-desktop` 的上行连接
- 维护 target 注册信息、配对信息、会话 refresh 和事件转发
- 为移动端提供统一的 pair / proxy / events 入口
- 允许官方网关和客户自建网关使用同一协议

`mcode-relay` 不应承担：

- CLI 语义归一化
- conversation 业务解释
- target-specific 命令改写

这些都应留在 desktop 或 direct adapter 一侧。

### 10. Gateway Protocol Changes

网关协议需要补充 target 元数据。

`POST /v1/pair` 返回值新增：

```json
{
  "accessToken": "token",
  "refreshToken": "refresh",
  "target": {
    "targetId": "target-123",
    "targetType": "mcode-desktop",
    "displayName": "Work Mac Mini",
    "capabilities": [
      "desktop.runtime.codex-cli",
      "desktop.runtime.claude-cli",
      "desktop.tunnel.available"
    ]
  }
}
```

`/v1/session/refresh` 应返回同样的 target 元数据，避免 app 只有第一次配对才知道目标类型。

事件与代理规则：

- `/v1/proxy/:command` 继续作为命令转发入口
- `/v1/events` 继续作为统一事件流
- relay 只转发 payload，不做 target-specific 解释
- 预留 `/v1/tunnel/:targetId/:port/**` 或等价 tunnel 路由，供 desktop 预览本地 dev server 和浏览器类场景

可靠性要求：

- 命令和事件帧包含协议版本，desktop 与 relay 在握手阶段协商兼容范围
- event stream 支持 ACK 序号与重放窗口
- desktop 断线 60 秒内，relay 应保留会话与最近缓冲，便于 app 重连恢复
- 控制权相关事件至少包含 `controllerId`、`acquiredAt`、`expiresAt` 或等价字段

### 11. Desktop Tunnel Flow

用户需要外网访问自己电脑上的 code 时，推荐流程是：

1. 用户打开 `mcode-desktop`
2. 在“内网穿透”页选择 `打开 Code`
3. desktop 将本地目标绑定到 `127.0.0.1:1080`
4. desktop 向 `mcode-relay` 注册一个可配对 target
5. desktop 生成包含 `version: 2` 网关连接数据的二维码
6. 用户在 `MCode` 中扫码导入
7. `MCode` 保存一条 `routeMode = gateway` 的连接

约束：

- `127.0.0.1:1080` 是 desktop 本地桥接地址，不是移动端最终访问地址。
- 对外暴露必须经过带鉴权的网关会话，不直接把原始本地端口暴露到公网。

### 12. Error Handling

- 如果 `gatewayProvider = custom` 且域名格式非法，保存前阻止提交。
- 如果 pair 成功但未返回 `targetType`，历史兼容分支默认回退为 `codeg`，同时标记为兼容模式。
- 如果 desktop 返回 capability 缺失，app 应展示“不支持”而不是允许进入后失败。
- 如果 direct target 鉴权方式与默认字段不兼容，adapter 负责在配置校验阶段给出明确错误。
- 如果历史 `relay` 连接刷新后 target 元数据变化，应静默更新本地缓存，避免旧标签长期错误。

### 13. Security

- direct token 继续只存本地设备，不上传到云端。
- pair code / pair secret 必须是一次性或短时有效凭据。
- gateway refresh token 只存本地持久化存储。
- desktop 的官方 CLI 凭据、授权文件和本地桥接端口只保留在 desktop 主机，不通过 app 下发原始敏感文件。
- 自定义网关模式默认要求 HTTPS，避免用户把敏感凭据交给明文链路。

### 14. Phased Delivery

这是一个跨三个产品的总设计，实施必须拆阶段推进。

#### Phase 1. App connection model upgrade

- `mcode-app` 引入 `version: 2` 连接模型
- 完成旧 `direct/relay` 到 `targetType/routeMode/gatewayProvider` 的迁移
- UI 文案从 `中继` 统一改为 `网关`
- 配置码兼容 `v1` 读、`v2` 写

#### Phase 2. App driver registry and direct targets

- 将当前 `createGateway(mode)` 改造成 driver registry
- 保持 `codeg/direct` 正常
- 接入 `mcode-desktop/direct`
- 预留 `opencode/direct` driver 插槽并完成最小直连能力

#### Phase 3. Desktop bridge and official CLI adapters

- `mcode-desktop` 建立 Tauri 桌面壳与统一 bridge server
- 接入 `codex` 官方 CLI adapter
- 接入 `claude` 官方 CLI adapter
- 接入托盘后台驻留与守护生命周期
- 输出 capability 描述接口

#### Phase 4. Relay synchronized rollout

- `mcode-relay` 接受 desktop 上行注册
- pair / refresh 返回 target metadata
- app 打通 `mcode-desktop/gateway`
- desktop 打通二维码导入、内网穿透页和 tunnel 预览链路

#### Phase 5. Gateway provider hardening

- app 新增 `官方网关 / 自定义` provider 切换
- relay 协议稳定化，支持官方部署和客户自建部署
- 安全、日志、失败恢复、连接诊断补齐

后续 implementation plan 不应把五个阶段混成一次性大改；应按 milestone 分拆。

## Testing Strategy

至少覆盖以下测试面：

1. 连接模型迁移
   - `v1 direct -> v2`
   - `v1 relay -> v2`
   - target metadata 覆盖旧值
2. 配置码
   - `v1` 可读
   - `v2` 可读可写
   - desktop 网关二维码可直接导入
3. app 路由解析
   - `targetType + routeMode` 正确选择 driver
4. relay 协议
   - pair / refresh 都返回 target metadata
   - events / proxy 在 desktop 上行断开后有明确错误
5. desktop 适配器
   - `codex` / `claude` CLI 不可用时 capability 正确降级
   - tunnel 绑定和二维码生成流程可复现

## Acceptance Criteria

- `mcode` 的连接模型不再只有 `direct | relay`，而是明确区分 target 与 route。
- 用户可以无 `mcode-desktop` 直连 `codeg`、`opencode`。
- 用户可以通过 `mcode-desktop` 直连或网关连接官方 CLI 能力。
- 新增连接 UI 支持：
  - `直连` 下的 `Codeg` / `OpenCode` / `MCode Desktop`
  - `中转（网关）` 下的 `MCode 官方网关` / `自定义`
- `mcode-relay`、`mcode-desktop`、`mcode-app` 对 target metadata 和 pair/session 协议保持一致。
- 旧连接和旧配置码仍然可用，且新连接统一写入 `version: 2` 结构。
