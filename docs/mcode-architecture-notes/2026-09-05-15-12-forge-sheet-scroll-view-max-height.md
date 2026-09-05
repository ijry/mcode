# 仓库面板底部弹层无法滚动（scroll-view 不能靠 flex 撑高）

**文件**：`2026-09-05-15-12-forge-sheet-scroll-view-max-height.md`
**需求编号**：无（对话式反馈，2026-09-05）
**涉及端**：`mcode-app`（仅 CSS，两条声明）

## 现象（用户原话）

> 仓库面板选择仓库弹窗里无法滚动

不是「滚起来卡」，是 `scrollTop` 恒等于 0 —— 一格都动不了，且超出的项目**落在屏幕外**，
既看不见也滚不到。40 个项目、375×667 视口下最后一行在 y=2770。

## 一、根因：`flex: 1` 撑不动 uni 的 `scroll-view`

uni-app H5 把 `<scroll-view>` 编译成三层：

| 层 | 框架样式 |
| --- | --- |
| `uni-scroll-view`（宿主，我们的 class 落在这里） | `display: block; width: 100%`，**无高度** |
| `.uni-scroll-view`（真正 `overflow-y: auto` 的那层） | `height: 100%; max-height: inherit` |
| `.uni-scroll-view-content` | `height: 100%` |

原来 `pages/forge/index.scss` 是这么写的：

```scss
.forge-sheet      { display: flex; flex-direction: column; max-height: 76vh; }
.forge-sheet__body { flex: 1; min-height: 0; }   /* ← 这里 */
```

宿主确实被 flex 压到了正确高度（456px），但里层的 `height: 100%` **解析不出来**：
`.forge-sheet` 的高度是 `max-height` clamp 出来的内容盒，主轴尺寸**不确定**；按
css-flexbox §9.8.3，只有「flex 容器主轴尺寸确定」时 flex item 的 post-flex 主轴尺寸才算
确定，此处不满足，于是百分比高度退回 `auto`。

结果：**宿主被 flex 压到 456px，里层滚动容器却是 915px（内容全高）** —— 这是 14 个项目、
375×667 视口下的数；40 个项目时滚动容器 2578px，宿主不变。两种情况都是
`scrollHeight === clientHeight`，overflow 根本不成立，溢出的部分画在弹层卡片之外、屏幕之下。

这解释了两件原本看起来矛盾的事：

- **为什么同一套 `flex: 1; min-height: 0` 在页面级布局里没事** —— 那些容器的高度是从
  `height: 100%` / `100vh` 一路确定下来的，§9.8.3 成立，`height: 100%` 解析得出来。
- **为什么 `pages/tasks/index.scss` 的弹层一直好的** —— 它写的是
  `.task-sheet__scroll { max-height: 56vh }`，走的是 uni 自己留的口子。

## 二、修法：上限落在 scroll-view 自己身上

```scss
.forge-sheet       { /* 不再有 max-height */ }
.forge-sheet__body { max-height: 56vh; }
```

`max-height` 有效是因为里层的 `max-height: inherit` 会继承到这个值 —— 滚动容器被钉住而
内容照长，overflow 才成立。这是框架**专门为此留的**声明，不是巧合。

`.forge-sheet` 的 `max-height: 76vh` 必须一起去掉，否则修不干净：

- 弹层一 clamp，`.forge-sheet__body`（`flex-shrink` 默认 1）就被压到 56vh 以下，而里层
  滚动容器仍按继承来的 56vh 算 → 高度对不上，又滚不动；
- 而且内容会溢出到卡片背景之外（背景只有 `max-height` 那么高），文字直接压在半透明遮罩上。

去掉之后弹层高度 = 头 + `min(内容, 56vh)` + 尾 + padding，**永不 clamp**，两个数不再互相
牵制。实测总高 66–82vh（七个弹层 × 六个视口），遮罩始终留得住，`top > 0`。

### 56vh 是量出来的

`.forge-option` 行高随视口宽度在 50–67px 之间（rpx 跟宽度走）。照
[[2026-08-27-08-58-slash-panel-max-height-scroll]] 的教训验了「露半行」：

| 上限 | 六个视口里露半行的个数 |
| --- | --- |
| 50vh | 2 / 6 |
| 52vh | 5 / 6 |
| **56vh** | **6 / 6** |

50vh、52vh 有几个视口恰好切在整行边界上 —— 那看起来像「列表就这么长」，用户不会去滑。
56vh 同时也是 `.task-sheet__scroll` 已经在用的值，不新造数字。

## 三、影响面：七个弹层，一处修好

`.forge-sheet` / `.forge-sheet__body` 是三个页面共用的（`pages/forge/index.scss` 被
`forge-item` 与 `forge-accounts` 一起 `@import`）：

| 弹层 | 页面 | 长内容 |
| --- | --- | --- |
| ForgeScopeSheet（用户报的那个） | forge | 项目列表，条数 = 桌面端打开过的文件夹数 |
| ForgeFilterSheet | forge | 标签词汇表，仓库里有多少标签就多少行 |
| ForgeNewIssueSheet | forge | 标题 + 描述 + 标签多选 |
| ForgeStartSheet | forge | 处理方式 + 常驻提示词 + 预览 |
| ForgeSettingsSheet | forge | 作用域 + 预选项 + 提示词表单 |
| ForgeMergeSheet | forge-item | 可合并性 + 检查项 + 合并方式 |
| ForgeAccountTokenSheet | forge-accounts | 服务器地址 + 平台 + token |

七个全都中招，只是**项目列表最容易长**，所以先被发现。

## 四、验证方式

改的是 CSS，没有可测的纯函数，所以照
[[2026-08-27-08-58-slash-panel-max-height-scroll]] 的做法**起真实产物量**：把
`dist/build/h5/assets/*.css`（编译产物）加上 `@dcloudio/uni-h5` 与
`@dcloudio/uni-components` 的框架样式（`base.css` / `view.css` / `text.css` /
`scroll-view.css`），喂给一个按 ForgeScopeSheet 真实渲染结构搭的 DOM —— 带
`data-v-271f7db9` 作用域属性、三层 `scroll-view`、`u-popup` 那几条内联样式 —— 再用
Playwright 量。根字号按产物里的运行时算（`width / 23.4375`，即 750rpx = 视口宽；375 视口
下正好 16px）。

同一份 CSS、同一个 DOM，只把两条声明换回旧写法做对照：

| 视口 | 40 个项目 · 修前 | 40 个项目 · 修后 |
| --- | --- | --- |
| 320×568 | client=2231 scroll=2231 **reached=0** 末行 y=2396 | client=318 scroll=2231 **reached=1913** 末行落回视口内 |
| 375×667 | client=2578 scroll=2578 **reached=0** 末行 y=2770 | client=374 scroll=2578 **reached=2204** 同上 |
| 430×932 | client=2964 scroll=2964 **reached=0** 末行 y=3225 | client=522 scroll=2964 **reached=2442** 同上 |

五个视口 × {3 条, 40 条} 全绿，四条判据：短列表不撑高且不出滚动条、长列表能滚到底、
滚到底后末行完整可见、遮罩始终留得住（`sheetTop > 0`）、静止时露半行。

回归闸在 `tests/pages/forge/forgePageContract.spec.ts`（`bottom sheet scrolling`，
三条源码扫描断言）：`.forge-sheet__body` 必须有 `max-height` 且**不能**出现
`flex` / `flex-grow`；`.forge-sheet` 不能有 `max-height`；七个弹层都得把长内容放进
`<scroll-view scroll-y class="forge-sheet__body">`。断言只看声明块（剥掉注释），
否则注释里那些 `flex: 1` 会自己把测试打红。**已确认把两条声明换回旧写法时前两条会失败。**

三道闸：jest 190 套件 / 2028 测试全绿；`npx vue-tsc --noEmit` 19 条既有基线错误
（`services/appVersion.ts` 与 `uni_modules/up-tts/examples/*`，与本次改动无关，forge 相关
文件零错误）；`./node_modules/.bin/uni build` DONE，产物里确认
`.forge-sheet__body[data-v-*]{max-height:56vh}` 且 `.forge-sheet` 不再带 `max-height`。

## 五、刻意没做的事

- **没有用 `:deep(.uni-scroll-view)` 去强改里层高度。** 那要依赖 uni 编译产物的内部
  class 名，跨版本会静默失效；`max-height: inherit` 是框架自己留的接口。
- **没给弹层加 `min(56vh, calc(100vh - Nrpx))` 之类的自适应上限。** 量过：横屏时 rpx 跟
  宽度走，头尾会涨到 ~330px，`100vh - Nrpx` 只剩 7px 滚动窗口，比「顶部被裁一点」更糟。
  横屏下整个 app 的 rpx 版式都不成立（一行 128px 高），这里不单独兜。
- **没把 `flex: 1; min-height: 0` 从别处一起换掉。** 页面级布局的容器高度是确定的，
  那些 `flex: 1` 是对的，改成 `max-height` 反而会写死。判据是「最近的限高祖先是
  `height` 还是 `max-height`」，不是「有没有用 flex」。
- **`components/ExpertMenu.vue` 的 `.category-scroll` 没动。** 全仓 40 个
  `<scroll-view>` 逐个查过，它是唯一另一处同样形制的（`flex: 1` + 祖先
  `.menu-wrap { max-height: 85vh }` + `up-popup mode="bottom"`），但 `ExpertMenu.vue` 与
  `AgentSelector.vue` **全仓无人引用**（`pages.json` 的 easycom 只映射 `^u-`/`^up-`，
  自动扫描要求 `components/Name/Name.vue` 的目录形式），是死代码，今天零用户影响。
  它还额外手写了 `overflow-y: auto` 落在宿主上，宿主自己会原生滚动 —— 症状被掩盖了，
  但 `scrolltolower` / `scroll-top` / `refresher-*` 全失效（这个组件没用到）。
  真要用它之前按本篇的写法改。
- **没有加 `box-sizing: border-box`。** `.task-sheet` 有它是因为它还留着 `max-height`
  （padding 会算在外面，实测让 76vh 变成 80vh）；`.forge-sheet` 已经没有限高，加了是死代码。

## 顺带查清的一件事（别改坏它）

`pages/conversation-detail/index.scss` 的 `.plan-drawer__list` 也是 `flex: 1; min-height: 0`
的 `scroll-view`（三个 drawer 共用），它**是好的** —— 因为 `.plan-drawer` 除了
`max-height` 还写了**显式的 `height: min(68vh, calc(100vh - 160rpx))`**，主轴尺寸确定，
§9.8.3 成立。那行 `height` 是承重的：只留 `max-height` 就会立刻变成本篇这个 bug。

`components/pet/PetPanel.vue` 的 `.pet-panel__content` 是**侥幸**好的：祖先只有
`max-height: 70vh`，但它自己带了 `max-height: 400rpx`，`max-height: inherit` 接得到。

## 原生 iOS / Android 复刻要点

1. **底部弹层里的长内容一律「头/尾固定 + 中间一个有明确高度上限的滚动容器」。**
   UIKit 用 `scrollView.heightAnchor.constraint(lessThanOrEqualToConstant:)`，
   Compose 用 `Modifier.heightIn(max = ...)`。**不要**让滚动容器去吃「剩下的空间」而
   容器自己的高度又是内容撑出来的 —— 那在任何布局引擎里都是一个欠定方程，Web 上的表现
   就是这个 bug。
2. **上限只给滚动容器，弹层总高由各部分相加。** 两层都限高就要保证外层永不生效，否则
   内层被压扁而它的内容不跟着压。
3. **上限值要与行高错开**，落在整行边界上用户看不出还能滑（同上一篇 `/` 面板）。
4. **短内容不要撑到上限** —— 3 个项目的弹层就该只有 3 行高。
5. **验收要量 `contentSize` 与 `bounds`，不能只看截图。** 这个 bug 的截图看起来完全正常：
   弹层是对的高度、列表是对的样式，只有「滑不动」和「第 6 项以后不存在」。

## 相关笔记

- [[2026-08-27-08-58-slash-panel-max-height-scroll]] —— 同一类「限高 + 内部滚动」，
  那次是**漏了**滚动容器，这次是滚动容器**撑高的方式**不对；「上限不取行高整数倍」
  和「起真实产物量」两条方法论都是从那篇来的
- [[2026-09-02-19-20-forge-repository-panel-mobile]] —— 这七个弹层的来源，形制、
  受控方式与各自装什么都在那篇
