# MCode Conversation Overview Recent Active Design

**Problem**

当前 `mcode-app` 会话列表页的总览卡片只依赖 `list_opened_tabs`：

- 连接分组下展示的是“当前在 codeg 中打开成 tab 的会话”
- 如果新建会话后没有在 codeg 内实际打开 tab，这个会话不会出现在总览里
- 用户只能进入每个连接下的“历史会话”页，才能看到这条新会话

这导致移动端会出现明显错觉：创建成功了，但会话仿佛“消失了”。

同时，总览页和“历史会话”页目前走的是两套数据口径：

- 总览卡片只看打开中的 tabs
- 历史模式才看本地 SQLite conversation summary 与远端会话列表

这种口径分裂会继续制造边缘问题，例如：

- 总览里看不到今天刚创建或刚交互过、但未开 tab 的会话
- 历史模式能看到的数据，总览模式不一定能看到
- 后续任何列表修复都要分别在两套路径上补丁

**Goal**

统一总览与历史模式的数据口径，并让总览页在每个连接分组下同时显示：

1. 打开中的 tab 会话
2. 今天内有过交互、但当前未开 tab 的会话

具体目标：

- 打开中的 tab 仍排在前面
- 今天活跃会话排在后面
- 同一会话不重复显示
- 新建会话即使没有被 codeg 打开成 tab，也应在总览页立即可见
- “历史会话”页缺少数据的问题与本次统一口径一起收敛

**Non-Goals**

- 不新增后端专用“最近会话”接口
- 不改变现有“历史会话”页按项目分组的交互结构
- 不把总览页做成无限复杂的多分区面板
- 不引入新的全局响应式 store 作为会话列表主数据源
- 不修改 `conversation detail` 页的消息加载与滚动恢复逻辑

**Options Considered**

1. **只补总览页展示层**
   - 保持总览页继续以 opened tabs 为主
   - 额外拼接“今天活跃且未开 tab”的会话
   - 优点：改动小
   - 缺点：历史模式和总览模式仍是两套装配逻辑，数据口径继续分裂

2. **统一总览与历史模式到同一个连接会话摘要模型（采用）**
   - 每个连接统一读取：项目、opened tabs、本地 summary、远端会话摘要
   - 一次装配出总览卡片与历史项目数据
   - 优点：一次收敛“新建后不见了”和“历史缺数据”两类问题
   - 缺点：比只补展示层多一些重构工作

3. **新增远端最近会话接口**
   - 后端直接返回“最近会话”给总览页
   - 优点：接口语义最直接
   - 缺点：当前前端已有本地 summary 与全量会话读取链路，为此新增接口收益不足

**Chosen Design**

采用方案 2：统一总览与历史模式到同一个连接会话摘要模型。

核心思路：

1. 连接分组加载时，不再只构造 opened tab 卡片
2. 同时装配该连接的会话摘要数据
3. 用一套共享模型同时驱动：
   - 总览页的连接分组卡片
   - “历史会话”页的项目分组列表

这样总览页和历史模式都建立在相同的会话摘要基础之上，只是展示方式不同。

**User-Visible Behavior**

每个连接分组的总览区按以下顺序渲染：

1. 当前打开中的 tab 会话
2. 今天活跃但未开 tab 的会话
3. 历史会话入口卡片

其中：

- 打开中的 tab 会话继续保持最高优先级
- 今天活跃会话按更新时间倒序排列
- 打开中的 tab 与今天活跃会话之间按 `conversationId` 去重

这意味着：

- 正在 codeg 中打开的会话永远优先显示
- 同一个会话不会在总览里出现两次
- 新建后没开 tab 的会话也会在今天活跃区出现

**Definition Of "Today Active"**

“今天活跃会话”定义为：

- 会话属于当前连接
- 会话未被标记删除
- 会话不在当前 opened tabs 去重集合中
- 会话的最近活跃时间位于设备本地当天 `00:00:00` 之后

最近活跃时间字段优先级：

1. `lastMessageAt`
2. `updatedAt`

两者都已经存在于本地 `conversation summary` 记录中。

“今天”的判断使用设备本地时间，不引入服务端时区换算。这样行为与移动端用户的时间感知一致。

**Shared Data Model**

为每个连接分组统一装配以下结构：

```ts
interface ConnectionConversationSnapshot {
  key: string
  name: string
  mode: string
  url: string
  projects: ProjectWithConversations[]
  openTabCards: LiveSessionCard[]
  recentActiveCards: LiveSessionCard[]
  loadError: string | null
}
```

说明：

- `projects` 提供给“历史会话”页使用
- `openTabCards` 和 `recentActiveCards` 提供给总览页使用
- 当前 `ConnectionGroup.cards` 不再只表示 opened tabs，而是由两段卡片合并而成的渲染结果

为避免大范围模板改造，允许在页面层保留最终 `cards` 字段，但其来源必须是：

- `openTabCards` 在前
- `recentActiveCards` 在后

**Data Loading Flow**

连接分组加载改为以下顺序：

1. 读取远端 `list_all_folder_details`
2. 读取远端 `list_opened_tabs`
3. 基于 folder 列表优先读取本地 SQLite summary
4. 用本地 summary 先装配一版共享快照并渲染
5. 再读取远端 `list_all_conversations`
6. 将远端会话摘要回写本地 summary
7. 用远端结果重新装配共享快照并替换当前连接分组

这样有两个直接结果：

- 列表首次进入时仍能优先展示本地缓存，减少空白等待
- 远端校准完成后，总览和历史会话会一起得到最新数据

**Overview Card Assembly**

总览卡片组装规则如下：

1. 先根据 opened tabs 构造 `openTabCards`
   - 保持当前 active tab 优先、其余按 tab 顺序的逻辑

2. 再根据共享 summary 构造 `recentActiveCards`
   - 只包含今天活跃的会话
   - 去掉已经出现在 opened tabs 中的会话
   - 按最近活跃时间倒序

3. 最终总览渲染使用：

```ts
cards = [...openTabCards, ...recentActiveCards]
```

不新增单独的视觉分区标题。通过顺序表达优先级，避免界面被切碎。

**History Page Assembly**

“历史会话”页继续按项目分组展示，但其会话来源也统一切到共享 summary 装配结果：

- 先用本地 summary 生成各项目会话列表
- 再用远端 `list_all_conversations` 校准并覆盖

这意味着“历史会话”页不再是和总览页完全独立的另一条数据装配链，而是共享同一份连接快照来源。

**Deduplication Rules**

去重以 `conversationId` 为准。

规则：

1. 若 opened tab 卡片没有 `conversationId`，它仍可展示，但不会参与最近活跃会话的覆盖
2. 若某个最近活跃会话的 `conversationId` 已存在于 opened tab 卡片集合，则该会话不进入 `recentActiveCards`
3. 历史模式不受 opened tab 去重影响，因为历史模式展示的是项目全量会话

这样可以保证：

- 总览视图不重复
- 历史视图仍然完整

**New Conversation Visibility**

创建会话成功后，除了当前已有的：

- `markConversationListDirty()`
- `loadOverviewData({ force: true })`

还必须保证新会话 summary 已进入本地 SQLite。

最小写入字段：

- `id`
- `instanceKey`
- `folderId`
- `title`
- `agentType`
- `status`
- `lastMessageAt`
- `updatedAt`

时间戳使用创建成功时的本地当前时间即可；后续若远端返回更精确时间，再通过正常 summary upsert 合并覆盖。

这样即使 codeg 没有为该会话真正打开 tab，总览页也能在下一次装配时把它识别为“今天活跃会话”。

**Local/Remote Consistency**

本地 summary 作为首屏缓存，远端结果作为校准真值。

约束：

- 若本地 summary 已存在，则先渲染本地结果
- 若远端校准成功，则必须回写本地 summary 并刷新当前连接分组
- 若远端校准失败，则保留本地结果并沿用现有错误处理

这让页面在离线/弱网时也尽量有可展示内容，同时不会放弃在线校准。

**Error Handling**

- 单个连接读取失败时，保持当前“连接级失败不拖垮整页”的语义
- 若本地 summary 读取失败，则回退到仅 opened tabs + 远端加载流程
- 若远端 `list_all_conversations` 失败：
  - 总览页保留已装配出的 opened tabs 和本地 summary 结果
  - 历史模式保留已装配出的本地项目会话
  - 继续暴露连接级错误提示能力

本次不新增更细粒度的错误状态机。

**Implementation Scope**

预计涉及：

- `mcode-app/src/pages/conversations/index.vue`
- `mcode-app/src/services/db/repositories/conversationRepository.ts`（如需新增按连接/按多项目读取辅助查询）
- 可能新增一个页面内或 service 层的共享装配辅助函数，用于：
  - 构造共享快照
  - 筛选今天活跃会话
  - 组装 overview cards

本次不要求新建独立 store；共享逻辑可以先以内聚辅助函数形式存在。

**Testing Strategy**

手动验证至少覆盖以下场景：

1. 某连接存在打开中的 tab，会话总览仍优先展示这些 tab
2. 新建会话成功，但 codeg 没有为其打开 tab
   - 预期：返回总览后，该会话出现在对应连接下的今天活跃区
3. 某会话既在 opened tabs 中，又满足今天活跃
   - 预期：总览只显示一次
4. 历史模式进入后，项目列表能看到今天刚创建或刚交互过的会话
5. 本地有 summary、远端暂时失败
   - 预期：总览和历史模式仍能看到本地缓存数据
6. 跨天后昨天会话不再进入今天活跃区
   - 预期：总览仅保留 opened tabs，昨天未开 tab 的会话不再出现在今天活跃区

**Acceptance Criteria**

- 会话总览不再只依赖 opened tabs 作为唯一数据来源
- 每个连接分组下，打开中的 tab 仍排在前面
- 今天活跃但未开 tab 的会话会显示在打开 tabs 后面
- 总览页内同一会话不会因“打开中 + 今天活跃”而重复显示
- 新建会话成功后，即使没有在 codeg 中打开 tab，也能在总览页看到
- “历史会话”页与总览页共享同一套会话摘要口径，不再各自维护独立装配逻辑
