# 把详情页那条断线横幅接回 UI

落地 [[2026-09-04-11-12-background-activity-mobile-gap]] 第四节第 8 条：
`buildDetailStatusState` 把 `bridge_reconnecting` / `bridge_error` / `replay_miss` /
`agent_disconnected` / `bridge_recovered` 连 `reconnect` 动作全算好了，**却没有任何消费者**
（`index.vue` 里那段注释自己写着「状态条整套已经归 pane 所有」）。结果：手机上桥接断了、
agent 进程死了，界面一个字都不说，用户只能靠「怎么半天没反应」自己猜。

代码一行没删、判据一行没改，只是把它接上。

## 一、只放行传输层那几档

新增纯函数 `isTransportStatusCode` / `buildTransportBanner`（`detailStatusPresentation.ts`）。
白名单五个码：`bridge_recovered`、`bridge_reconnecting`、`bridge_error`、`replay_miss`、
`agent_disconnected`。

**被刻意挡掉的**：

| 状态码 | 为什么不画 |
| --- | --- |
| `runtime_error` / `api_retry` | pane 已经在 composer 那侧渲染（`input-feedback--error` / `--retry`），横幅再画一条是同一件事说两遍 |
| `long_wait` | pane 的等待卡片脚注承接 |
| `attach_settling` | 那是 attach 后「瞬态状态还没到齐」的 3 秒窗口，**正常会话每次进入都会经过**，画出来就是每次开会话闪一条横幅 |
| `idle` 及其余运行态 | 状态胶囊本来就在说 |

## 二、画在哪：输入区上方，不是页面顶部

横幅由**外壳算、pane 画**：判据里的 `bridgeHealth`、`attachElapsedMs`、`longWaitElapsedMs`
全归外壳所有（1Hz 计时器 + bridge health 订阅），而输入区上方那块「瞬态通知」区域归 pane 所有。
所以外壳传 `transport-banner` prop，pane 在 `#status` 插槽最上面渲染，动作用 `status-action`
事件回抛给外壳已有的 `handleDetailStatusAction`（`reconnect` 重连桥接 / `reconnect_agent`
重新拉起 agent / `inspect`）。

**没有画在页面顶部**：那里是 fixed 的导航栏 + tab 条，往中间插一条要重算
`detailShellViewportStyle` / `detailTabsBarStyle` / 历史指示行那一整套 top offset 数学 ——
而这个项目此前恰好因为那类计算删掉过 `buildHistoryStatusStyle`。输入区上方是既有的通知位，
零布局风险，而且与「活动反馈改由输入区上方状态条承接」的既有决定一致。

只有**当前活跃的那个 tab** 收到横幅（`isActiveDetailTabPage(index) ? transportBanner : null`）：
判据是外壳级的，挂到后台 tab 上会显示别人的状态。

## 三、`details` 默认折叠

`agent_disconnected` / `runtime_error` 携带的 `details` 是 agent stderr 尾巴，可能几十行。
横幅只放一行文案 + 「详情」按钮，点开才展开一个 240rpx 上限的滚动区 ——
`DetailStatusState` 把 `details` 与 `text` 分开返回本来就是为了这个。

## 四、顺带修正了一处注释

`index.vue` 里那段「这条链没有任何消费者」的注释已经过期，改成写清楚现在**只用其中一部分**，
以及 `planTaskCount` 那个坑仍然存在的条件（`long_wait` 若将来也接进 UI，得换掉全表扫描）。

## 五、原生端（iOS / Android）复刻要点

1. 传输层状态（桥接重连中/异常、replay 丢帧、agent 断开）必须有独立的可视位置，
   **不要**跟运行时错误挤在一个控件里 —— 它们的动作不同：一个是重连 WebSocket，
   另一个是重新拉起 agent 进程，混在一起用户会点错。
2. 「刚恢复」是一条 3 秒的正向提示，不要做成常驻。
3. attach 后的短暂「同步中」窗口不要画横幅。
4. stderr 证据默认折叠。
