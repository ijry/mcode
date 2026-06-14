# Achievement Center

## Architecture

`我的` 页新增了一个独立的 `成就中心` 入口卡片，点击后进入 `pages/achievement/index`。该页面当前完全由本地 mock service 驱动，协议定义位于 `mcode-app/src/services/achievement.ts`，页面只消费结构化 DTO，不直接拼装业务数据，便于后续替换为远端接口或原生端复刻。

## Protocol And Data Flow

页面分两段加载：

- `getAchievementEntrySummary()` 为 `我的` 页入口提供红点、已解锁数量、当前头衔和“击败全国 xx% 用户”摘要。
- `getAchievementCenterData()` 返回成就页首屏所需的总览、已解锁徽章、待解锁徽章、最近战报。
- `getAchievementRanking(scope, metric)` 按榜单范围与指标维度返回排行榜。当前 `scope` 支持 `national | city | friends`，`metric` 支持 `response_count | response_speed | streak_days`。

所有 service 都返回深拷贝后的 mock 数据，页面状态可以自由修改，不会污染源数据。这一点对后续接入下拉刷新、分享态插桩和局部 optimistic UI 很重要。

## UI Behavior

成就页采用四段式布局：

- Hero 卡：展示当前称号、全国百分位、全国/同城/好友排名，以及社交化结论文案。
- 核心战绩：四个指标卡，强调数值与“超过多少用户”的反馈。
- 成就墙：横向滚动的已解锁高光卡片 + 纵向待解锁进度卡。
- 排行榜与战报：支持切换榜单范围和指标，底部显示最近可分享的成就动态。

点击徽章会弹出详情说明与当前进度；点击分享按钮会弹出分享文案，并允许直接复制到剪贴板。当前未接真实分享 SDK。

## Compatibility

本次实现没有引入新的业务主题色别名，页面颜色均使用 `uview-plus` 运行时变量作为基础色，并在局部卡片上叠加固定渐变。这样可以兼容现有浅色/深色模式，同时避免新建 `--mcode-*` 主题别名。Mock 协议字段也保持扁平，后续替换为远端接口时只需要保证字段名与枚举兼容。

## Native iOS/Android Replication Guidance

原生端建议复刻相同的 DTO 与交互顺序：

1. 在个人页展示成就入口卡片，消费 `AchievementEntrySummary`。
2. 成就页首屏先展示 `AchievementSummary`，再渲染 `unlocked` / `locked` / `feed`。
3. 榜单请求必须保留 `scope + metric` 双维度切换，这样同一页面状态机可以直接复用到 iOS 与 Android。
4. 复制分享文案、徽章详情弹层和“我的排名”高亮都应按当前协议字段直接展示，不依赖 Web 特有逻辑。

如果未来接入真实后端，建议保留当前 mock 枚举值，避免多端同时改协议。
