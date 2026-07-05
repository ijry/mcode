# P63 会话详情页主题体系

## Architecture

`mcode-app` 的会话详情页把原先的实验性炫酷模式升级为主题体系，当前支持 `default`、`matrix`、`sweet`、`summer` 四个详情页主题。主题状态使用 `mcode_detail_theme_v1` 持久化，不修改 ACP、SQLite、路由或 runtime store 数据结构；旧的 `mcode_detail_cyber_mode_v1=true` 会自动迁移到 `matrix`。

页面壳层 `mcode-app/src/pages/conversation-detail/index.vue` 负责：

- 从更多菜单切换 `详情页主题`
- 恢复和持久化全局开关
- 基于 runtime 状态与 `liveMessage` 推导 `idle | ramp | streaming | settle` 四阶段
- 在 `matrix`、`sweet` 和 `summer` 主题下隐藏自定义背景图，但不清除原有背景配置

纯逻辑放在 `detailCyberMode.ts`。`matrix` 主题的整页绿色数字雨由 `ConversationDetailCyberRain.vue` 渲染，`sweet` 主题的漂浮泡泡背景由 `ConversationDetailSweetBubbles.vue` 渲染，`summer` 主题的海浪/西瓜/椰叶/椰子氛围层由 `ConversationDetailSummerAtmosphere.vue` 渲染。实时消息解码效果只属于 `matrix` 主题，并且只对当前活动 pane 中、状态为 `streaming` 的 assistant 最新文本段开启。

主题体系不再把实验模式视为默认主题的颜色 tint，而是独立的详情页皮肤。页面 shell 在 `matrix`、`sweet` 与 `summer` 下都会覆盖 page、navbar、tabs 等 inline/prop 样式，避免 `upThemeCardStyle` 或 `up-navbar bgColor` 把界面重新刷回默认浅色。

详情页导航安全区由页面壳层兜底：`up-navbar` 挂载 `detail-navbar-shell`，页面样式强制同步 `u-status-bar`、fixed 导航层和 placeholder 占位层背景；同时额外渲染一个 fixed 顶部安全区填充层。这样即使 App 端 fixed 占位层或原生 webview 背景先绘制，也不会在实验主题顶部露出浅色状态栏。H5 iOS standalone/PWA 使用 `apple-mobile-web-app-status-bar-style=black`，不要使用 `black-translucent`；后者会让 Web 内容进入 full-bleed 状态栏布局，现有自定义 navbar 和底部 composer 已经处理 safe-area，会出现顶部和底部 inset 被重复计算的问题。

## Protocol And Data Flow

该功能不引入新的服务端协议，也不改动现有 websocket / polling / ACP 事件。

详情页主题只读取以下现有状态：

- 本地 storage 中的全局开关
- 会话 runtime status
- 当前会话是否存在 `liveMessage`
- 当前 assistant 消息的文本内容与 `streaming` 状态

`index.vue` 根据这些输入推导页面阶段，并把 `detailTheme`、`cyberEffectPhase` 逐层传给 `ConversationDetailInteractivePane`、`ConversationDetailReadonlyTimeline` 与 `MessageBubble`。`MessageBubble` 本地使用定时器驱动 0/1 解码覆盖层，不向上写回任何业务状态；`sweet` 和 `summer` 主题都不启用该解码层。

同一个 streaming assistant turn 可能包含 thinking、tool、历史 text 和最新 text 多个 part。移动端只对 `displayParts` 中最后一个非空 text part 执行解码，旧 text part 保持可读的终端样式，避免多层绿色乱码叠在历史内容上。

## UI Behavior

- 入口位于会话详情页右上角更多菜单中的 `详情页主题`。
- `matrix` 主题：整页切换为黑底绿字的终端风格，navbar、tabs、消息气泡、composer、配置面板和底部抽屉都会使用暗色 terminal surface。
- `matrix` 消息区使用低 alpha 的 terminal glass surface：assistant/user 气泡约 0.56/0.60，thinking/tool/code 等内部块同步降低不透明度；消息正文绿字约 0.88 alpha，thinking/tool 黄字约 0.90 alpha，让数字雨和网格背景能穿透消息内容区。
- `matrix` 数字雨使用更密集的 DOM 列阵。`idle` 降低透明度，`ramp` / `streaming` 提升亮度和速度。
- `sweet` 主题：整页切换为奶油粉到淡莓紫的渐变背景，叠加大泡泡、小泡泡、少量星点高光与柔光斑。消息气泡、面板和输入区使用更低 alpha 的 jelly glass surface，正文为深莓色，避免可爱主题变成低对比度粉雾。
- `sweet` 消息区让背景继续穿透内容区：外层 assistant/user 气泡、输入托盘和面板比普通玻璃卡片更透明，thinking/tool/plan 等内部块再额外降低一档不透明度。
- `summer` 主题：整页切换为海水蓝到浅沙金的上下分层背景，叠加海浪、西瓜片、椰叶和椰子等强元素，形成“西瓜海浪”夏日限定皮肤。
- `summer` 消息区使用海盐玻璃与果汁玻璃两类低 alpha surface：assistant 偏海水蓝白，user 可带轻微暖果汁色，thinking/tool/plan 等内部块继续比外层更透明。
- `idle` 阶段保持弱化待机效果。
- `thinking`、`running_tool`、`waiting_permission`、`waiting_question` 等阶段进入 `ramp`，页面高亮和扫描感增强。
- 有实时 `liveMessage` 时进入 `streaming`。`matrix` 主题下，活动 pane 内最新 assistant 流式文本段会先显示绿色 0/1 解码覆盖层，再逐步收敛成真实消息；`sweet` 与 `summer` 主题只保留背景与面板氛围变化，不做文字乱码解码。
- `matrix` 解码覆盖层在同一段文本停止增长后，会在 streaming 阶段内自行收敛到完整文本，不要求等待消息状态切到非 `streaming` 才露出最后几个字。
- 流式结束后的短暂窗口进入 `settle`，随后回落到普通待机氛围。
- 只读时间线和非活动 tab 只保留整页氛围，不运行强解码动画，避免多实例同时高频重绘。
- `matrix` 顶部导航和手机状态栏统一为纯黑背景，状态栏图标切换为浅色；`sweet` 统一为浅粉玻璃背景和深色状态栏图标；`summer` 统一为浅海水玻璃背景和深色状态栏图标；默认主题保持当前 uview 主题色。
- H5 iOS standalone 下，详情页同步 `apple-mobile-web-app-status-bar-style=black`、`theme-color` 和根节点背景；当 `uni.getWindowInfo().statusBarHeight` 为 0 时，顶部填充层用 `env(safe-area-inset-top)` 兜底。

## Compatibility

- 主题完全可选，切回 `default` 时页面行为与现有实现一致。
- 背景图配置仍保留；炫酷模式只是视觉上覆盖背景图。
- `MessageBubble` 的详情页主题 props 全部是可选字段，其他调用点不需要同步改协议。
- 复杂 markdown（代码块、标题、列表、表格）会降级为原始文本渲染，避免解码覆盖层破坏可读性。
- 如果平台对 scoped 样式穿透支持较弱，原生或其他端应优先在页面/pane 根节点挂 cyber class，再由消息组件自身持有 bubble 级暗色样式。

## Native iOS And Android Guidance

- 原生端复刻时保留相同的详情页主题枚举和四阶段状态机：`default`、`matrix`、`sweet`、`summer` 以及 `idle`、`ramp`、`streaming`、`settle`。
- 炫酷模式应放在会话详情页控制器/页面层实现，不要侵入消息模型、协议模型或本地数据库。
- `matrix` 的绿色数字雨建议作为整页 atmosphere 层实现；实时解码动画只绑定当前活动会话 pane 的 assistant 最新流式文本段。
- `sweet` 建议使用低频泡泡、少量星点高光和柔光氛围，不要使用持续高频抖动或大面积粒子效果；在移动端优先保证输入区、消息区和顶部导航的可读性。
- `sweet` 原生端复刻时，前景控件建议统一为果冻胶囊语言，消息外层卡片与内部 thinking/tool/plan 卡片使用两级透明度，避免可爱背景被厚重白底完全挡住。
- `summer` 建议把海浪、西瓜片、椰叶和椰子作为页面层装饰而不是消息内容元素；动画保持低频，避免把详情页做成旅游海报或儿童贴纸墙。
- `summer` 原生端复刻时，assistant/user 气泡可区分为海盐玻璃和轻果汁玻璃两类 surface，发送按钮使用更强的西瓜红点题，但红绿不要在大面积上同时拉满。
- 原生端需要显式覆盖导航栏、tab strip、输入框、消息气泡和底部抽屉的浅色背景，不能只叠加绿色文字。
- 原生端需要把系统状态栏背景、导航安全区背景、导航内容区背景和导航占位高度视为同一个 chrome 区域。炫酷模式开启时全部使用 `#000000`，状态栏图标使用 light 样式；退出页面或关闭模式时恢复主题默认导航栏/页面背景。
- PWA/standalone 端没有任意颜色的状态栏 API，只能使用 Apple meta 暴露的 `default`、`black`、`black-translucent` 模式。MCode 使用 `black` 保持 viewport 布局不变，同时让系统状态栏为黑色；不要在现有页面壳层上切到 `black-translucent`，除非同步重构所有自定义导航和底部 fixed 区域的 safe-area 计算。
- 开启炫酷模式时隐藏详情页背景图展示，但不要删除用户已存的背景图配置。
- 低性能设备可以降低数字雨列数、减慢 tick 频率或关闭文字抖动动画，但应保持页面整体黑绿终端风与实时消息解码的核心体验。
