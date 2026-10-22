# 首页连接列表重构 + 全局自定义悬浮底栏

## 需求

按设计稿（Ardot 文件 `738949979656341`，成对的浅色/深色画板 393×852）重构 mcode-app
首页「连接」列表，并把底部导航从原生 tabBar 换成设计稿里的悬浮胶囊底栏。

## 一、为什么原生 tabBar 必须保留配置、只隐藏

自定义底栏**不能**做成「根组件挂一次」。uni-app 的 `App.vue` 是纯生命周期、没有
`template`；本项目的根节点由 `App.up.vue` 提供（`vite.config.js` 里的 `UniUpRoot` 插件，
`rootFileName: "App.up"`），但它只包 `UpRootView` 与 pet 浮层。页面是各自独立的 webview，
不会被任何根组件包围 —— 所以底栏只能每个 tab 页各挂一份（`<McodeTabBar />`），
靠 `switchTab` 切页；页签保活，组件不会重建。

同时 `pages.json` 的 `tabBar.list` **不能删**：

- `uni.switchTab` 以它为路由表；
- `uni.setTabBarBadge`（`conversationTabBadgeService` 依赖）以它定位索引；
- 删掉会丢掉 tab 页保活。

因此方案是「保留配置 → 组件内 `onShow` 调 `uni.hideTabBar({ animation: false })` → 页面内渲染
`McodeTabBar`」。`animation: false` 是必须的，默认的滑落动画会在切 tab 时露出一条白边。

`onShow` 注册在**组件内**：uni-app 的 `onShow` 在组件里同样生效（走页面实例的事件总线），
挂一次等于 5 个 tab 页都有，比在 5 个页面各抄一遍 `uni.hideTabBar()` 不容易漏。

## 二、角标通路改造（关键）

原来角标只走 `uni.setTabBarBadge` → 写原生 tabBar。原生栏隐藏后这个数字**再也看不到**。

`conversationTabBadgeService` 新增：

```ts
export function subscribeConversationTabBadge(listener: (count: number) => void): () => void
export function getConversationTabBadgeCount(): number
```

`pushBadge()` 现在两条路都走：仍然调 `applyConversationTabBarBadge`（备份，将来回退原生栏
或做 App 图标角标时它已经是对的），同时把总数推给所有订阅者。`McodeTabBar` 自己订阅，
**不从页面 props 传** —— 否则 5 个页面都要各自 import 并转发，等于把同一份订阅抄 5 遍。

计数权威副本仍在 `countByInstance`（由 `App.vue` 的 `onLaunch` 驱动，与页面无关）。
订阅者数量有界（最多 5 个，tab 页不卸载），不需要引用计数。

## 三、连接行信息映射

设计稿每行只有「38 徽标 / 主机名 + 副标题 / 状态点 + chevron」，原来的能力 chips、
健康详情、`立即重试`/`排查建议`/`项目列表` 等整行操作全部收掉。

| 设计稿元素 | 实现 | 说明 |
|---|---|---|
| 38×38 徽标文字 | `getConnectionHostShortLabel()` | 中文取 2 字、拉丁取 4 字符；云服务器统一「云」 |
| 徽标底色 | `getConnectionHostAccentClass()` | 按**机器类型**分色（设备蓝 `#007AFF` / 云 `#5856D6` / 其他灰），不按状态 —— 颜色用来定位，状态交给右侧点 |
| 行标题 | `conn.name \|\| host.displayName` | 存储里没有设计稿那种「我的 MacBook」自由文本字段 |
| 行副标题 | `getConnectionRowSubtitle()` | `主机类型 · 端点`；重连中/异常时整行替换为原因（`#CC6B00` 橙） |
| 8px 状态点 | `getConnectionDotClass()` | 在线绿 `#34C759` / 重连橙 `#FF9500` / 异常红 / 未连接灰 |
| chevron | 3 点按钮（`more-dot-fill`） | 用户选择「保留右侧更多按钮」而非长按，操作菜单原样保留 |

被收掉的功能入口保留在原位置（`showConnectionMenu`）：
断开/编辑/删除/智能体/模型供应商/配置码都还在那枚 3 点按钮里。

## 四、几何与颜色（px，不是 rpx）

设计稿是 393 宽基准，全部用 **px** 落地：rpx 会整体缩放，窄屏上会把 12px 文字压到 10px 以下、
10px 底栏文字压到不可读。关键值：

- 内容区：`padding 8/16/16`，块间距 12
- 分组卡：`radius 16`，`1px rgba(0,0,0,.06)` 描边，行 `padding 12/14`、`gap 12`
- 分隔线：`1px #E5E5EA`；深色 `rgba(255,255,255,.08)`
- 品牌：`MCode` 24 Bold / 副标题 12 / 胶囊 `radius 20`、`padding 8/12`
- 底栏：外层 `padding 12/21/21(+safe-area)`，胶囊 `h 62`、`radius 36`、`padding 4`，
  单项 `radius 30`，激活底色 `#1C1C1F`，文字 10px
- 页面底色：浅 `#F2F2F7` / 深 `#000000`（比 uview 的 `--up-page-bg-color` 更深一档，
  卡片 `#1C1C1E` 才能浮起来）

深色判据一律 `[data-up-theme='dark']`，**不是** `prefers-color-scheme` —— 项目深色由 uview
按用户在 app 内的偏好写到 `<html data-up-theme>`，与系统设置不是同一来源。

## 五、兼容性 / 注意事项

- 5 个 tab 页根节点都加了 `page--with-tabbar`，规则 `.page.page--with-tabbar { padding-bottom:
  calc(95px + env(safe-area-inset-bottom)) !important }`。**不要**用 `.page:has(.mc-tabbar)`：
  `:has()` 要 iOS 15.4+，低于本 app 最低版本，老机器上整条规则失效 = 完全没有留白。
- `connections` 页 `pages.json` 改为 `navigationStyle: custom`，状态栏高度由
  `uni.getWindowInfo().statusBarHeight` 撑出，兜底 44。
- 底栏图标用的是 uview 内置图标（`grid-fill` / `chat` / `list-dot` / `account` /
  `account-fill`），没有复用 `src/static/tabbar/*.png` —— 那批 png 是为原生 tabBar
  准备的双色资源，在自绘底栏里没法跟着主题换色。

## 六、原生端（iOS/Android）等价实现要点

1. 底部导航用原生 `UITabBar`/自绘悬浮 view 均可，但语义要一致：**5 项等宽、激活项为填充胶囊、
   未激活只有图标+文字**，不要用系统 tabBar 的图标着色机制（设计稿要的是整块填充）。
2. 未读数来自 `/v1/.../active_sessions` 聚合（`running + waiting`），不是会话列表未读数。
3. 每行只保留「徽标 / 标题+副标题 / 状态点 + 更多」四块，其余操作全部进「更多」菜单，
   不要把 chips 之类带回来 —— 设计稿明确收掉了。
4. 副标题在 `reconnecting` / `error` 时必须换成原因并染橙，这是行内唯一的告警表达。
