# 黑客帝国主题：移除状态胶囊内部扫光，保留边框动画

涉及文件：`mcode-app/src/pages/conversation-detail/ConversationDetailBody.vue`、
`mcode-app/tests/pages/conversation-detail/detailCyberLayout.spec.ts`

## 背景

matrix（黑客帝国）主题下，输入区上方的运行状态胶囊原本叠了两套动画：

1. **边框动画** —— `.input-status-wrap::before` 是一个铺满 `inset: -42rpx` 的旋转
   `conic-gradient`，被 `::after`（`inset: 2rpx` 的实色面板）盖住中心，只在边缘露出一圈跑动
   的亮光；另有 `index.scss` 里 `cyberScanPulse` 给整个 wrap 做外发光呼吸。
2. **内部扫光** —— `.input-status-wrap__content::before` 是一条宽 22% 的线性渐变高光，
   由 `cyberStatusSweep` 从左侧 `-160%` 平移到 `560%`，在胶囊内部横扫。

用户要求只保留边框动画，内部扫光不要。

## 改动内容

从 `ConversationDetailBody.vue` 的 `<style>` 中删除以下 6 处（全部属于内部扫光）：

| 删除项 | 说明 |
| --- | --- |
| `.input-status-wrap__content::before` | 高光层本体（渐变、宽度、初始 transform） |
| `...--status-running .input-status-wrap__content::before` | running 态启动 `cyberStatusSweep 1.8s` |
| `.detail-body--ramp` / `--streaming` / `--settle` 三个阶段覆盖 | 只改扫光的 `animation-duration` / `opacity` |
| `...--status-pending .input-status-wrap__content::before` | pending 态的琥珀色扫光变体 |
| `...--status-error .input-status-wrap__content::before` | error 态把扫光关掉的兜底规则 |
| `@keyframes cyberStatusSweep` | 关键帧本体，删完已无引用 |
| `prefers-reduced-motion` 分组里的 `.input-status-wrap__content::before` | 该选择器已不存在 |

`.input-status-wrap__content` 本身**保留** —— 它是 flex 布局容器（内距、`min-height`、
`overflow: hidden`、`z-index: 1`），删掉会破坏状态行排版。被删的只是挂在它上面的 `::before`
伪元素图层。

`.detail-body--settle` 在 Body.vue 里此前只被扫光规则用到，删除后该阶段在此文件内不再有专属
样式；`settle` 阶段本身仍由 `detailCyberMode.ts` 与其他组件（雨幕、气泡）消费，未受影响。

## 保留的边框动画（未改动）

- `ConversationDetailBody.vue`：`.detail-body--cyber-active .input-status-wrap::before`
  → `inputStatusLedSpin 1.55s linear infinite`；ramp / streaming 阶段加速到 0.95s；
  idle / online / error 态 `animation: none` 并固定在 `rotate(72deg)`。
- `index.scss`：`.page--cyber-streaming` / `.page--cyber-ramp` 下
  `cyberScanPulse`（1.8s / 1.12s）给 wrap 做 `box-shadow` 呼吸。

## 实测（Chromium via playwright，375px 视口）

抽取组件真实样式（去掉 `:deep()` 包装）渲染三种状态：

| status | wrap 动画 | ::before（边框）动画 | 时长 | ::before 不透明度 | content::before content | content::before 动画 |
| --- | --- | --- | --- | --- | --- | --- |
| running | none | inputStatusLedSpin | 0.95s | 0.95 | none | none |
| pending | none | inputStatusLedSpin | 0.95s | 0.74 | none | none |
| error | none | none | – | 0.72 | none | none |

`content::before` 的 `content` 为 `none` 证明高光层已彻底不生成。边框旋转确认在动：间隔 400ms
两次读取 `::before` 的 transform 得到 `matrix(1,0,0,1,0,0)` → `matrix(-0.82,0.57,-0.57,-0.82,0,0)`。

`wrapAnimation` 为 none 是因为测量页只挂了 `detail-body--*` 类，`cyberScanPulse` 挂在页面级
`.page--cyber-streaming` 上，未在该沙盒中复现 —— 这条规则本次未改动。

## 兼容性

- 纯删除样式，无模板结构、协议或数据流变化。状态胶囊的 DOM 层级保持
  `wrap > wrap__content > slot(status)`。
- 少一个常驻 `transform` 动画图层，长会话下 matrix 主题的合成压力略降。
- 测量基于 Chromium / H5；uni 原生端（App-Plus）伪元素支持本就有限，删除只会更安全。

## 原生端复刻指引（iOS / Android）

matrix 主题状态胶囊现在只需一层动画：

- **边框流光**：胶囊下方放一个比自身大 42rpx 的旋转渐变图层（绿色扫过 72° / 284° 两个亮区），
  上面盖一个 `inset 2rpx` 的近黑实色圆角面板，只让边缘露出流光。运行中匀速旋转，周期
  1.55s；ramp / streaming 阶段缩短到 0.95s；idle / online / error 停在 72° 不转。
- **外发光呼吸**：streaming / ramp 时对胶囊阴影做 1.12～1.8s 的强弱循环。
- **不要**再实现胶囊内部由左向右平移的高光条。

## 测试

`detailCyberLayout.spec.ts` 原有断言里 `input-status-wrap__content::before` 与
`@keyframes cyberStatusSweep` 已改为反向断言，并新增
`drops the inner left-to-right sweep and keeps the border animation`：确认扫光相关标识全部消失，
同时 `inputStatusLedSpin` 与 `cyberScanPulse` 仍在。

全量：143 suites / 1098 tests 通过。
