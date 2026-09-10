# 会话详情使用活动连接的 selector 状态

## 背景

mcode 会话详情此前用 `acp_describe_agent_options` 的临时探测会话渲染 Mode / Model / Reasoning。该接口会另起一条无 resume、无用户偏好的 agent 进程，只适合回答“这个 agent 支持什么”，不能代表 PC 端当前会话已经选择的 `agent-full-access`、模型或推理档位。于是手机端可能显示临时会话默认的 `Agent`，而 PC 端实际是 `Full access`。

## 协议与数据流

- codeg-plus 的 `LiveSessionSnapshot` 已经携带 `selectors_ready`、`modes`、`config_options`。mcode 在 `hydrateLiveSnapshot()` 中落地这三个字段。
- 实时平铺事件补齐四类归一化：`session_modes`、`session_config_options`、`selectors_ready`、`mode_changed`。
- `RuntimeSession` 保存 `selectorsReady`、`modes`、`configOptions`；换连接、断开和会话清理时一并清空，避免旧连接的选择器状态串到新 agent。
- 会话详情用 `resolveDetailAgentConfigState()`：`selectorsReady === true` 时以活动连接快照为准；否则才回退到临时探测结果。
- `selectorsReady === true` 后，`current_mode_id` 与各配置项的 `current_value` 都以活动连接为唯一权威；本地持久化选择只在 selector 尚未 ready 时作为回退，不能覆盖 PC 端后来切换的仍然有效选项。
- 探测 watcher 把 `selectorsReady` 纳入依赖；ready 后立即递增 probe token，并在调用探测 RPC 前后复核，丢弃已经在途的临时会话结果。
- 手机端 selector RPC 成功后，runtime 立即更新对应 current 值，保证勾选态即时反馈；随后到达的实时事件仍按 seq 水位覆盖它，因此 PC 端并发变更最终仍以服务端事件为准。

## UI 行为

- PC 端选好的 `Full access` 会通过活动快照在手机端显示为 Full access。
- 模型和 Reasoning 的可用性来自当前会话的 `config_options`，不再来自另一条临时会话。
- `selectorsReady` 为 false 时保持旧表现：先显示探测/缓存能力，避免旧后端或未建连时出现空白。

## 兼容性

- 旧服务端快照缺少 `selectors_ready` / `modes` / `config_options` 时不覆盖本地状态，继续走探测回退。
- 新服务端明确 `selectors_ready: true` 时，`modes: null` 与空 `config_options` 也是权威值，界面显示“远端默认配置”。
- `session_modes` / `session_config_options` 单独到达时不提前把 `selectorsReady` 置 true；该位只由快照或 `selectors_ready` 事件设置，避免半初始化状态被当成完整 selector。

## 原生客户端复刻

1. WebSocket attach 收到 snapshot 后先读 `event_seq` 做新旧判断，再持久化 `selectors_ready/modes/config_options` 到该会话的 runtime state。
2. 实时事件按 connection id 路由，并沿用同一个 seq 水位；`mode_changed` 只更新已存在的 `modes.current_mode_id`。
3. 详情页状态解析顺序必须是：若活动 selector ready，则直接使用活动 `modes/config_options` 的 current 值；否则使用临时探测回退。不要用本地旧选择覆盖活动 current 值。
4. 连接 id 变化时清空 selector 状态；不要把旧 agent 的 mode/model id 应用到新 agent。

## 相关边界

Codex 推理档位还依赖 `~/.codex/ai-switch-model-catalog.json` 能匹配根配置的 `model`。AI Switch 在主写入、已有配置/base URL 重写、单文件重写和 stale 检测四类入口统一传入目录模型：若旧值仍在目录中则保留；若已不在目录中，则改为目录首个可用模型。mcode 不改 codeg-plus 服务端。
