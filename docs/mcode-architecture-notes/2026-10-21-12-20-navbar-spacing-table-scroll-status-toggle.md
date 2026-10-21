# 详情页：导航栏间距 / 表格横向滚动 / 状态胶囊开关 / 宠物默认关闭

日期：2026-10-21 12:20
涉及文件：

- `src/pages/conversation-detail/index.vue`
- `src/pages/conversation-detail/index.scss`
- `src/pages/conversation-detail/ConversationDetailBody.vue`
- `src/pages/conversation-detail/ConversationDetailInteractivePane.vue`
- `src/pages/conversation-detail/detailCyberMode.ts`
- `src/components/MessageBubble.vue`
- `src/components/pet/PetFloat.vue`
- `src/stores/pet.ts`
- `src/pages/profile/index.vue`
- `src/services/petSetupSignal.ts`（新增）

---

## 1. 导航栏第二行「思考中」贴底

**现象**：导航栏标题下方那枚运行状态胶囊，底边几乎压在导航栏下边框上。

**原因**：`.detail-navbar` 是 `align-items: flex-start`，而标题 + 胶囊是两行内容
（16px 标题行 ≈ 20px + 1px gap + 19px 胶囊 ≈ 40px），被顶到 45px 导航栏的上沿，
余量全落在下面。设计稿导航栏是 48px（节点 `9:11`，标题组 `9:30` 垂直 gap 1）。

**改法**：

- `<up-navbar height="45px">` → `48px`；
- `getNavbarHeight()` 的兜底从 `statusBarHeight + 44` → `+ 48`
  （之前两处本身就差 1px，消息区 `marginTop` 和导航栏占位永远对不齐）；
- `.detail-navbar` 改 `align-items: center` + `height: 100%`，两行内容居中，
  上下各留约 4px。

## 2. 表格超出宽度时右侧被裁、且划不动

**根因**（关键）：上一版为了修「一字一行」用了

```scss
width: max-content;
min-width: 100%;
overflow-x: auto;
```

`max-content` 让**表格元素本身**撑到内容宽度（实测 401px / 容器 360px），于是
`scrollWidth === clientWidth` —— 它自己没有任何可滚动溢出；真正溢出的是它的祖先
（`.up-markdown` / `._root`，都是 `overflow: hidden`，那是有意压掉「每条消息各自
成为动量滚动容器」）。结果就是超出的部分被裁掉、手指也划不动。

**改法**：回归「表格自己当滚动壳」，但宽度必须受父级约束：

```scss
display: block;
width: 100%;
max-width: 100%;
overflow-x: auto;
overflow-y: hidden;
```

配合已有的单元格 `min-width: 4em`：

| 场景 | 结果 |
|---|---|
| 5 列、短词 | 铺满整行，格内换行，不裁不滚（实测无溢出） |
| 7 列 | `scrollWidth 456 > clientWidth 360` → 横向滚动，列宽不变形 |
| 20 位哈希 | 224px 列内换行，不顶出屏幕 |

**试过但否决的方案**：把 `thead` / `tbody` 各自 `display: table` + `max-content`，
外层 block 滚动。滚动是有了，但表头与表体成了**两个独立表盒**、列宽各算各的
（实测表头全 72px、表体 65/114/65/65/91），表头和数据错位 —— 不可接受。

## 3. 右上角菜单：输入框状态胶囊显隐

新配色已经把「它在干什么」搬到导航栏标题下方，输入区上方那条是重复信息；但它还
挂着计划进度、后台任务入口和传输层横幅，不能直接删。

- 存储：`mcode_detail_input_status_v1`（`{ visible: boolean }`），
  `normalizeDetailInputStatusVisibility()` 容错解析，**缺省 true**（老用户不受影响）；
- 菜单项文案随状态变：`隐藏输入框状态` / `显示输入框状态`；
  handler 走 `handleDetailMoreMenuClick` 里新增的两个分支；
- `onLoad` 与 `onShow` 都恢复（从别页改完回来只有 `onShow` 会触发）；
- 数据线：`index.vue` → `:show-input-status-pill` → Pane 的 `inputStatusVisible`
  → `v-if` 只包住 `input-status-row`；
- **传输横幅不跟着关**：Pane 传给 Body 的是
  `status-area-visible = inputStatusVisible || Boolean(transportBanner)`，
  断线/重连这类错误通道不能因为「不想看状态胶囊」就一起闭嘴；
  Body 侧缺省 `true`（`props.statusAreaVisible !== false`），其他调用方不受影响。

## 4. 宠物默认关闭

- `defaultState().hidden: false → true`：新装用户不再默认占一个悬浮位
  （持久化过的老用户状态会被 pinia-persist 还原，不会突然消失）；
- 移除 `PetFloat` 挂载时的「自动弹选宠弹窗」——那会在用户没表达意愿时挡住首屏；
- 入口收敛到「我的 → 宠物管理」：未初始化时不再只弹一句 toast，而是
  `requestPetSetup()` 通过 `src/services/petSetupSignal.ts` 通知 `PetFloat` 打开弹窗；
- 选完宠物 `initPet()` 之后 `setHidden(false)`，用户刚主动选择就顺手显示出来。

用模块级监听器而不是 store 字段，是因为 persist 会把状态整份落盘，一个纯「请求」
标记被持久化后，下次冷启还会再弹一次。

---

## 验证

- `tests/pages/conversation-detail/detailInputStatusToggle.spec.ts`（10 条，新增）
- `tests/pet/petStore.spec.ts`（+2 条：默认隐藏 / 显式开启）
- 变异验证：把表格改回 `max-content`、`.detail-navbar` 改回 `flex-start`、
  `!== false` 改成 `=== true`，三处均被对应断言捕获
- 详情页 38 套件 / 350 用例、全量 201 套件 / 2140 用例通过
- `uni build` → `DONE Build complete`，产物含
  `overflow-x:auto;overflow-y:hidden` 的表格壳规则
