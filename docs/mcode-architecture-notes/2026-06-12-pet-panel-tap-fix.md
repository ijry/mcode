# 宠物管理皮肤/配饰点击失效修复

## 问题现象

个人页进入“宠物管理”后，切换到“皮肤”页签，点击皮肤卡片、配饰卡片，以及部分页签/开关项没有反应。

## 根因

宠物管理面板 `mcode-app/src/components/pet/PetPanel.vue` 使用 `up-popup` 承载弹层，内容区使用 `scroll-view` 承载可滚动内容。在 uni-app 多端事件模型下，这类组合里 `view` 上的 `@click` 在部分端上会被滚动容器吞掉或不稳定，表现为视觉可点但事件不触发。

## 修复方案

- 将宠物管理面板内所有用户交互入口从 `@click` 统一改为 `@tap`
- 包含页签切换、语音开关、气泡开关、皮肤选择、配饰选择、关闭面板

`@tap` 是 uni-app 在移动端/小程序端更稳定的轻触事件，兼容 H5、App、各小程序运行时，更适合此类 `view` 交互。

## 数据与行为流

1. 用户在宠物管理面板点击皮肤或配饰卡片
2. `PetPanel` 中的 `onSkinTap` / `onAccessoryTap` 被稳定触发
3. 调用 `petStore.equipSkin()` 或 `petStore.equipAccessory()`
4. Pinia 状态更新后，`PetSprite` 立即根据当前 `skinId` / `accessories` 重绘

本次修复不修改 store 结构、解锁规则、皮肤配置、配饰配置，也不改变持久化协议。

## 兼容性

- Web/H5：保持可点击，通常无行为变化
- uni-app App（iOS/Android）：修复弹层滚动区内交互不触发问题
- 小程序端：更贴近原生事件模型，降低 `click` 丢失风险

## 原生端复刻建议

iOS/Android 原生实现同类弹层时：

- 如果内容区可滚动，不要依赖桌面语义的 click/click-like 事件映射
- 应直接使用平台原生 tap 手势或列表 item 选择事件
- 皮肤/配饰选择后应直接写入宠物状态仓库，并让宠物预览组件订阅刷新
