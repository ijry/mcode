# Android 手机端详情页实时用户消息权威化

## 目标

会话详情中的用户消息只以 ACP `user_message` 事件为权威来源。客户端发送 prompt 后不再乐观插入本地 `MessageTurn`，从而消除“先显示在末尾、随后消失或移动到上一条 Agent 消息附近”的竞态。

## 发送与实时数据流

1. 发送路径只构造 ACP `blocks` 并调用 `acp_prompt`；不创建 `optimistic-*` turn，不把附件或文本复制进时间线。
2. `user_message` 到达时，以 `messageId` 和 blocks 合成已确认用户轮次，设置 `inFlightUserTurnId`。
3. “思考中”占位仍可存在，但它只表示 assistant 流式状态，不能代替或伪造用户消息。
4. `turn_complete` 同时持久化权威用户轮次和最终 assistant turn，再从 SQLite 重载已完成轮次；这样下一轮流式内容始终有用户轮次分隔。

## 去重与异步回填

- 首选去重键是 ACP `messageId`。
- SQLite 回填可能把当前未完成用户轮次替换为持久化 id，因此只允许对**当前 in-flight 的最后一个用户轮次**使用内容签名兜底。
- 绝不能按全部历史内容签名去重：用户连续发送相同文本（例如“继续”）必须显示为两条独立消息。
- `replay-gap` 回填带有 generation。收到 `user_message` 或达到回合边界后 generation 会递增；早先启动、晚到的回填响应不得覆盖刚确认的用户消息。
- `turn_cancelled` 必须清除 `inFlightUserTurnId` 并重置回填守卫，下一回合才能正常回填。

## 缓存与兼容性

运行时 SQLite schema 中已有的 `optimistic_json` 历史列保留，以兼容既有安装数据；应用不再读取、写入或恢复该列。所有当前运行态判断只看已确认 local turns、live assistant、权限/提问和 ACP 序号。

## 原生复刻要点

### Android

- 不要在点击发送时把用户气泡插入 RecyclerView/Compose 列表。
- 把 `user_message` 的 message id 作为当前 turn 的关联键；assistant complete 时将 user + assistant 一起写入持久层。
- 所有历史回填任务都要可取消或带代际/token 校验。

### iOS

- 不要在 `send` 成功回调里直接 append 用户气泡；只订阅 `user_message`。
- 对重复事件使用 message id，内容兜底只限未完成的当前轮次。
- 完成、取消、切换会话和重新连接都必须使旧的异步 reload 失效，避免 UITableView/SwiftUI 列表重排。
