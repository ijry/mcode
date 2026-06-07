# MCode Pet Voice Interaction Design

**Date:** 2026-06-07  
**Scope:** `mcode-app` 宠物互动增强，增加实时发声、点击动画、音效反馈和新的管理入口  
**Primary Files:** `mcode-app/src/components/pet/PetFloat.vue`, `mcode-app/src/components/pet/PetPanel.vue`, `mcode-app/src/pages/profile/index.vue`, `mcode-app/src/services/petEngine.ts`, `mcode-app/src/services/petConfig.ts`, `mcode-app/src/stores/pet.ts`

---

## Problem

当前宠物已经具备悬浮显示、状态情绪、气泡文案和面板管理能力，但互动反馈仍然偏弱：

- 单击宠物的主要行为是打开面板，缺少“立即回应”的陪伴感
- 双击宠物虽然能触发互动，但反馈只有少量经验和简单气泡
- 宠物气泡文案数量少，重复感明显
- 缺少语音能力，无法把提醒和陪伴文案变成更直接的反馈
- 宠物面板入口绑定在悬浮球点击上，导致“互动”和“管理”共用同一个入口，容易冲突

用户希望把宠物优化成更主动、更有存在感的陪伴角色：

- 多说一点话
- 点击后触发动画和音效
- 能实时把文案念出来
- 晚上能提醒休息
- 悬浮球优先承担互动，不优先承担管理入口

## Goal

增强宠物悬浮球的即时互动体验，满足以下目标：

- 单击宠物时立刻触发互动反馈，而不是优先打开面板
- 宠物对常见场景有更多、更自然的文案
- 在支持的平台上实时朗读宠物文案
- 语音、气泡、动画、点击音效共享同一套触发链
- 宠物管理入口移到“我的”页面，避免和互动冲突
- 不支持 TTS 或音频受限时平滑降级，不影响原有宠物使用

## Non-Goals

- 不重做宠物成长系统、等级系统、皮肤和配饰系统
- 不引入联网 TTS 服务，不依赖外部 API
- 不新增复杂的语音配置页或语音市场
- 不重做整套宠物视觉资源，只在现有动画体系上补交互态
- 不在本次实现中增加桌面端特化逻辑

## Constraints

- 项目当前是 UniApp + Vue 3 + Pinia 架构
- 现有宠物逻辑集中在 `PetFloat.vue`、`petEngine.ts`、`petConfig.ts` 和 `pet.ts`
- 用户指定优先使用本地插件 `D:\Repos\xyito\lingyun\up-tts`
- `up-tts` 的能力是系统 TTS，而不是预生成音频文件
- 各平台音色、可用语音和播放策略存在差异，体验不能假设完全一致

## Options Considered

### 1. 继续使用预生成音频资源

**做法**

- 预先生成一批宠物语音文件
- 互动时随机播放本地音频

**优点**

- 音色统一
- 点击时响应稳定

**缺点**

- 文案扩展成本高
- 不能方便地复用已有气泡模板
- 与用户希望的“实时生成”方向不一致

### 2. 用 `up-tts` 做实时朗读，并保留轻量点击音效（采用）

**做法**

- 宠物触发文案时同步触发气泡、TTS、交互动画
- 额外保留一个短点击音效加强手感
- TTS 不可用时自动只保留气泡、动画、点击音效

**优点**

- 文案可维护性最好
- 与现有气泡模板天然兼容
- 更符合“宠物会说话”的目标
- 不需要联网或额外后端

**缺点**

- 各平台音色不一致
- 部分 Web 或设备场景下可用性依赖系统能力

### 3. 只增加气泡和动画，不做语音

**做法**

- 扩充模板并增强动画
- 不接入 TTS

**优点**

- 实现最稳

**缺点**

- 不能满足用户的实时发声要求

## Chosen Design

采用 **方案 2**：

- `单击` 宠物时优先触发互动发声
- `双击` 触发更强反馈的互动发声
- `长按` 继续保留快捷菜单
- `宠物管理` 从悬浮球行为中分离，放到“我的”页面
- 使用 `up-tts` 作为统一的实时朗读能力
- 使用本地短音效作为点击反馈补强
- TTS 不可用时优雅回退，不让互动失效

核心原则如下：

1. **互动优先。** 宠物悬浮球首先是陪伴入口，不再把单击行为浪费在打开管理面板上。
2. **同一事件统一触发。** 一次互动由文案、气泡、动画、音效、TTS 共同构成。
3. **平台差异可接受，但功能退化必须可控。**
4. **尽量复用现有宠物引擎和模板机制，不重造状态系统。**

## Detailed Design

### 1. Interaction Model

#### 1.1 悬浮球行为调整

位置：`mcode-app/src/components/pet/PetFloat.vue`

行为修改如下：

- `单击`：立即触发普通互动，不再打开 `PetPanel`
- `双击`：触发强化互动，使用更兴奋的文案和更明显的动画
- `长按`：保留现有快捷菜单
- `拖拽`：保持现有位置记忆和边缘吸附逻辑不变

这意味着当前“单击延迟 300ms 后打开面板”的逻辑需要被替换。面板入口不再绑定在悬浮球单击行为上。

#### 1.2 管理入口迁移

位置：`mcode-app/src/pages/profile/index.vue`

在“我的”页面新增 `宠物管理` 菜单项：

- 点击后打开现有 `PetPanel`
- 保留现有面板内容结构，避免重新设计成长页
- 悬浮宠物仍然可以存在于全局，但管理入口改为显式菜单

推荐把该菜单放在独立的“宠物”或“互动陪伴”分组中，避免混入“关于”区。

### 2. Speech and Audio

#### 2.1 TTS Provider

位置：新建宠物语音服务模块，供 `petEngine.ts` 和 `PetFloat.vue` 调用

TTS 统一接入 `up-tts`：

- 运行平台支持时，调用 `speak()` 朗读当前文案
- 语音默认开启
- 每次新触发前取消上一次未完成的宠物朗读，避免多段文案叠加
- TTS 失败只记录并降级，不向用户弹错误

实现层面需要封装一层服务，而不是在组件里直接散落调用插件。这样可以集中处理：

- `isAvailable()` 检测
- `speak()` 调用
- 重复播放打断策略
- 平台差异和异常回退

#### 2.2 点击音效

位置：宠物音频服务或 `PetFloat.vue` 内部的统一触发逻辑

增加一个轻量本地点击音效，用于：

- 单击互动
- 双击互动

要求：

- 音效极短，不与 TTS 抢占太久
- 音效播放失败时不能影响 TTS 或气泡
- 如果平台策略导致自动播放受限，至少保证气泡和动画仍然触发

#### 2.3 语音开关

位置：`mcode-app/src/stores/pet.ts` 和 `mcode-app/src/types/pet.d.ts`

在宠物状态中新增持久化字段，例如：

- `voiceEnabled: boolean`

默认值：

- `true`

该开关与现有 `bubbleMuted` 分离：

- `bubbleMuted` 仅控制气泡显示
- `voiceEnabled` 仅控制 TTS

快捷菜单或宠物管理面板中应提供该开关的入口。

### 3. Bubble and Copywriting System

#### 3.1 模板扩充

位置：`mcode-app/src/services/petConfig.ts`

在现有 `BUBBLE_TEMPLATES` 基础上扩充以下触发类型：

- `pet_interact`
- `pet_interact_excited`
- `morning`
- `afternoon`
- `evening`
- `turn_complete`
- `level_up`
- 保留 `waiting_permission_long`
- 保留 `error`

每组模板至少准备 3 到 6 条文案，减少重复感。

#### 3.2 文案风格

文案风格采用“轻提醒 + 陪伴感”，不做过度卖萌，也不做太强的游戏化夸张。

示例方向：

- 点击互动：
  - “别调皮啦，快工作吧。”
  - “先专心一会儿，我陪你。”
  - “摸一下就行啦，继续写代码。”
- 双击互动：
  - “好嘛好嘛，我陪你冲一把。”
  - “今天状态不错，继续推。”
  - “这下精神了，开干。”
- 早安开工：
  - “早上好，今天也把事情做漂亮点。”
  - “该开工啦，我已经醒了。”
- 午后提醒：
  - “下午别走神，先把这一段收尾。”
  - “再坚持一下，快做完了。”
- 夜间提醒：
  - “已经很晚了，该休息啦。”
  - “今天先到这里吧，别太拼。”
- 完成任务：
  - “这次做得不错。”
  - “收工一个，继续下一个。”

### 4. Animation Behavior

#### 4.1 长态与瞬时态分离

位置：`mcode-app/src/components/pet/PetFloat.vue`、`mcode-app/src/components/pet/PetSprite.vue`

当前宠物主要通过 `EmotionState` 表达持续状态。为了避免点击互动污染长态，需要新增一层瞬时交互表现：

- 普通互动：短促放大、轻弹、摇摆或发光
- 强化互动：更明显的弹跳或旋转

这层交互态持续时间很短，结束后恢复到底层 emotion 对应的长期动画。

这样可以避免把点击互动硬塞进 `happy` / `excited` 长态，导致状态语义混乱。

#### 4.2 与现有情绪引擎配合

`petEngine.ts` 继续负责：

- 运行状态映射到 emotion
- 空闲计时
- 气泡时机

交互瞬时态由悬浮球侧局部控制。两者关系：

- 引擎决定底层情绪
- 组件决定短时“点击特效”

### 5. Pet Engine Updates

位置：`mcode-app/src/services/petEngine.ts`

需要把“只出气泡”的触发函数升级成“统一互动事件”机制。建议把以下能力集中到引擎或其相邻服务：

- 触发文案并返回本次实际选择的文本
- 设置当前气泡
- 根据触发类型决定是否朗读
- 对外暴露普通互动和强化互动两个入口

推荐新增或调整的接口方向：

- `petInteract()` 返回本次互动的文案和升级结果
- `petInteractExcited()` 返回更强互动的文案和升级结果
- `showGreeting()` 在早上、下午、晚上可同时触发语音

关键要求：

- 气泡文本和 TTS 文本必须一致
- 一次触发只选一条文案，避免气泡和语音不一致

### 6. Profile Integration

位置：`mcode-app/src/pages/profile/index.vue`

增加“宠物管理”菜单项，职责如下：

- 打开现有宠物面板
- 为未来扩展宠物设置保留稳定入口

本次不要求把 `PetPanel` 彻底重构成页面，但需要让它可以从“我的”页被稳定打开。实现可以是：

- 在 profile 页面挂载 `PetPanel`
- 菜单点击时控制其 `show`

### 7. Data Model

位置：`mcode-app/src/types/pet.d.ts`、`mcode-app/src/stores/pet.ts`

新增字段：

```ts
voiceEnabled: boolean
```

默认值：

```ts
true
```

保留现有字段不变：

- `bubbleMuted`
- `hidden`
- `position`

这样不会破坏旧状态迁移，Pinia 持久化在缺省值补齐后可以兼容已有用户数据。

### 8. Error Handling and Fallbacks

必须覆盖以下失败路径：

- `up-tts` 不可用
- 浏览器不支持 `speechSynthesis`
- 系统未安装可用中文 TTS 语音
- 音效资源加载失败
- 用户关闭了语音开关
- 用户关闭了气泡但保留语音

回退规则：

- `voiceEnabled = false`：只显示气泡、动画、点击音效
- `bubbleMuted = true`：允许只发声、不出气泡
- TTS 调用失败：安静失败，不弹窗；本次互动至少保留动画和可见反馈
- 音效失败：不影响 TTS 和气泡

## Data Flow

### 单击互动

1. 用户单击宠物悬浮球
2. `PetFloat.vue` 判断为普通互动
3. 调用互动入口，从模板中选出一条实际文案
4. 同步触发：
   - 设置气泡
   - 启动瞬时动画
   - 播放点击音效
   - 若允许则调用 TTS
5. 若本次经验升级，则追加升级庆祝逻辑

### 双击互动

1. 用户双击宠物悬浮球
2. `PetFloat.vue` 判断为强化互动
3. 调用强化互动入口，从兴奋模板中选文案
4. 同步触发更强的动画、音效和 TTS

### 早晚提醒

1. 宠物引擎按时段决定问候类型
2. 选定单条文案
3. 显示气泡
4. 若语音开启且 TTS 可用，则朗读同一条文案

## Files

- Modify: `mcode-app/src/components/pet/PetFloat.vue`
- Modify: `mcode-app/src/components/pet/PetSprite.vue`
- Modify: `mcode-app/src/components/pet/PetPanel.vue`
- Modify: `mcode-app/src/pages/profile/index.vue`
- Modify: `mcode-app/src/services/petEngine.ts`
- Modify: `mcode-app/src/services/petConfig.ts`
- Modify: `mcode-app/src/stores/pet.ts`
- Modify: `mcode-app/src/types/pet.d.ts`
- Add: `mcode-app/src/services/petVoice.ts`
- Add: `mcode-app/src/services/petAudio.ts`
- Add: `mcode-app/uni_modules/uts-plugin-tts` or equivalent plugin integration path
- Add: local short audio asset for click feedback

## Testing

### Functional

- 单击宠物时不再打开面板，而是触发互动
- 双击宠物时触发更强互动
- 长按菜单仍可正常使用
- “我的”页可打开宠物管理面板
- 语音开关关闭后不再朗读
- 气泡静音后可验证是否仍允许发声

### Compatibility

- H5 支持 `speechSynthesis` 时可正常朗读
- H5 不支持时能优雅回退
- Android / iOS / Harmony 的插件调用不阻塞界面
- 连续快速点击时不会造成大量语音重叠

### Regression

- 拖拽、吸边、隐藏宠物、经验增长、升级庆祝不退化
- 现有运行状态 emotion 映射不被点击交互打乱
- 首次选宠物流程不受影响

## Open Questions Resolved

- `单击` 是否优先用于互动发声：**是**
- 宠物面板是否仍保留在悬浮球点击上：**否，迁移到“我的”页**
- 语音开关默认值：**开启**
- 语音是否使用 `up-tts` 实时生成：**是**

## Implementation Notes

- 先完成入口分离和统一互动链，再补语音和音效，能降低联调复杂度
- TTS 封装必须独立，避免插件调用散落在多个组件
- 文案选择逻辑应返回“本次实际文本”，供气泡与 TTS 共用
- 如果当前项目的 H5 开发环境对 `uni_modules` 有路径要求，应按 UniApp 插件目录规范放置 `up-tts`
