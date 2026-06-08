# Conversations History Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the history-mode `up-cate-tab` UI with a custom project-grouped scroll list that matches the lightweight first-screen conversation cards.

**Architecture:** Extract history-mode data shaping into a small, testable presentation helper, then simplify `pages/conversations/index.vue` so history mode renders grouped project sections directly from `projects`. Keep the existing remote loading, open, delete, rename, and create behaviors; remove only the tab-specific view state and layout.

**Tech Stack:** Vue 3 `<script setup>`, uni-app, uView Plus, TypeScript, Jest

---

## File Structure

- Create: `mcode-app/src/pages/conversations/historyPresentation.ts` — pure helpers for filtering/grouping project history data into renderable sections.
- Create: `mcode-app/tests/pages/conversations/historyPresentation.spec.ts` — Jest coverage for the helper module.
- Modify: `mcode-app/src/pages/conversations/index.vue` — replace the history-mode `up-cate-tab` template, remove tab-only state, and restyle the history list to match the overview cards.

### Task 1: Add a testable history presentation helper

**Files:**
- Create: `mcode-app/src/pages/conversations/historyPresentation.ts`
- Create: `mcode-app/tests/pages/conversations/historyPresentation.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import {
  buildHistoryProjectSections,
  formatHistoryConversationMeta,
} from "@/pages/conversations/historyPresentation"

const conversation = (overrides: Record<string, unknown> = {}) => ({
  id: 101,
  title: "重构历史会话页",
  agent_type: "claude_code",
  updated_at: "2026-06-08T08:00:00.000Z",
  ...overrides,
}) as any

const project = (overrides: Record<string, unknown> = {}) => ({
  id: 7,
  name: "mcode",
  path: "D:/Repos/xyito/lingyun/mcode",
  conversations: [conversation()],
  ...overrides,
}) as any

describe("historyPresentation", () => {
  it("keeps only projects that still have matching history conversations", () => {
    const sections = buildHistoryProjectSections(
      [
        project({ id: 1, name: "mcode" }),
        project({ id: 2, name: "empty", conversations: [] }),
      ],
      "重构"
    )

    expect(sections).toEqual([
      expect.objectContaining({
        projectId: 1,
        title: "mcode",
        count: 1,
      }),
    ])
  })

  it("filters conversations by keyword across title, agent, project name, and path", () => {
    const sections = buildHistoryProjectSections(
      [
        project({
          id: 3,
          name: "xyview-vue",
          path: "D:/Repos/xyito/xyview-vue",
          conversations: [
            conversation({ title: "Pinia 替换 Vuex", agent_type: "codex" }),
            conversation({ title: "无关会话", agent_type: "claude_code" }),
          ],
        }),
      ],
      "codex"
    )

    expect(sections[0].conversations).toHaveLength(1)
    expect(sections[0].conversations[0].title).toBe("Pinia 替换 Vuex")
  })

  it("formats the history card meta line from agent label and time label", () => {
    const meta = formatHistoryConversationMeta(
      conversation({ agent_type: "codex", updated_at: "2026-06-08T08:00:00.000Z" }),
      (agentType) => (agentType === "codex" ? "Codex" : agentType),
      () => "31分钟前"
    )

    expect(meta).toBe("Codex · 31分钟前")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/pages/conversations/historyPresentation.spec.ts
```

Expected: FAIL with a module resolution error for `@/pages/conversations/historyPresentation`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type {
  ConversationOverviewConversation,
  ConversationOverviewProject,
} from "@/services/conversation/conversationOverviewSnapshot"

export interface HistoryProjectSection {
  projectId: number
  title: string
  path: string
  count: number
  conversations: ConversationOverviewConversation[]
}

function getProjectTitle(project: ConversationOverviewProject): string {
  return String(project.name || project.path || "未命名项目").trim()
}

function normalizeKeyword(keyword: string): string {
  return keyword.trim().toLowerCase()
}

export function formatHistoryConversationMeta(
  conversation: ConversationOverviewConversation,
  formatAgentLabel: (agentType: string) => string,
  formatTimeLabel: (updatedAt?: string) => string
): string {
  const agent = formatAgentLabel(conversation.agent_type || "")
  const time = formatTimeLabel(conversation.updated_at)
  return [agent, time].filter(Boolean).join(" · ")
}

export function buildHistoryProjectSections(
  projects: ConversationOverviewProject[],
  keyword: string
): HistoryProjectSection[] {
  const normalizedKeyword = normalizeKeyword(keyword)

  return projects
    .map((project) => {
      const conversations = Array.isArray((project as any).conversations)
        ? ((project as any).conversations as ConversationOverviewConversation[]).filter(
            (conversation) => {
              if (!normalizedKeyword) return true
              const haystack = [
                conversation.title || "",
                conversation.agent_type || "",
                project.name || "",
                project.path || "",
              ]
                .join(" ")
                .toLowerCase()
              return haystack.includes(normalizedKeyword)
            }
          )
        : []

      return {
        projectId: project.id,
        title: getProjectTitle(project),
        path: project.path || "",
        count: conversations.length,
        conversations,
      }
    })
    .filter((section) => section.conversations.length > 0)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- tests/pages/conversations/historyPresentation.spec.ts
```

Expected: PASS with 3 passing tests in `historyPresentation.spec.ts`.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/conversations/historyPresentation.ts mcode-app/tests/pages/conversations/historyPresentation.spec.ts
git commit -m "refactor: add history presentation helpers"
```

### Task 2: Replace `up-cate-tab` with a custom grouped history list

**Files:**
- Modify: `mcode-app/src/pages/conversations/index.vue`
- Modify: `mcode-app/src/pages/conversations/historyPresentation.ts`
- Modify: `mcode-app/tests/pages/conversations/historyPresentation.spec.ts`

- [ ] **Step 1: Extend the failing helper test for the history empty-state path**

```ts
it("returns an empty section list when the keyword removes every conversation", () => {
  const sections = buildHistoryProjectSections(
    [project({ conversations: [conversation({ title: "只保留这个标题" })] })],
    "不存在的关键字"
  )

  expect(sections).toEqual([])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit -- tests/pages/conversations/historyPresentation.spec.ts
```

Expected: FAIL if the helper still returns a non-empty section list for the empty-filter case.

- [ ] **Step 3: Update the helper and page integration**

In `mcode-app/src/pages/conversations/historyPresentation.ts`, keep `buildHistoryProjectSections` returning an empty array when all conversations are filtered out, and export the already-added `formatHistoryConversationMeta` for page use.

In `mcode-app/src/pages/conversations/index.vue`, make these script changes:

```ts
import {
  buildHistoryProjectSections,
  formatHistoryConversationMeta,
} from "@/pages/conversations/historyPresentation"

const historyProjectSections = computed(() =>
  buildHistoryProjectSections(projects.value, searchKeyword.value)
)

function getHistoryConversationMeta(conversation: Conversation): string {
  return formatHistoryConversationMeta(conversation, formatAgentType, formatTime)
}

function openHistoryPanel(group: ConnectionGroup) {
  historyGroupKey.value = group.key
  historyGroupTitle.value = group.name
  projects.value = group.projects
  showHistoryPanel.value = true
  void ensureHistoryProjectsLoaded(group)
}

function closeHistoryPanel() {
  showHistoryPanel.value = false
  historyGroupKey.value = ""
  historyGroupTitle.value = ""
  projects.value = []
}
```

Remove these `up-cate-tab`-only members from the same file because the new layout no longer needs them:

```ts
const currentTab = ref(0)
const cateTabHeight = ref("calc(100vh - 160rpx)")
const tabList = computed(() => { /* remove entire computed */ })

function syncCateTabHeight() { /* remove */ }
function getConversationList(item: any): Conversation[] { /* remove */ }
function getCurrentTabLabel(slotTabList: any): string { /* remove */ }
function getCurrentTabProjectId(slotTabList: any): number | undefined { /* remove */ }
```

Replace the history-mode template block with a single-column layout:

```vue
<view v-else class="history-list">
  <view class="history-mode-bar" :style="upThemeCardStyle">
    <view class="history-mode-back" @click="closeHistoryPanel">
      <up-icon name="arrow-left" size="14" color="#2979ff"></up-icon>
      <text class="history-mode-back__text">返回分组</text>
    </view>
    <text class="history-mode-title u-line-1">{{ historyGroupTitle }}</text>
    <view
      v-if="canCreateInHistory"
      class="history-mode-create"
      @click="createConversation()"
    >
      <up-icon name="plus" size="14" color="#2979ff"></up-icon>
      <text class="history-mode-create__text">新建</text>
    </view>
  </view>

  <view v-if="historyLoading && historyProjectSections.length === 0" class="inline-loading">
    <up-loading-icon color="#2979ff" size="28"></up-loading-icon>
    <text class="inline-loading__text">加载中...</text>
  </view>
  <view v-else-if="historyProjectSections.length === 0" class="empty-fullpage">
    <up-empty mode="list" text="暂无历史会话"></up-empty>
  </view>

  <scroll-view v-else class="history-scroll" scroll-y enhanced>
    <view
      v-for="section in historyProjectSections"
      :key="section.projectId"
      class="history-section"
    >
      <text class="history-section__title u-line-1">{{ section.title }}</text>
      <view class="conv-list conv-list--history">
        <view
          v-for="conv in section.conversations"
          :key="conv.id"
          class="conv-card conv-card--history"
          :style="upThemeCardStyle"
          @click="openConversation(conv, historyGroupKey)"
        >
          <view class="conv-card__icon">
            <up-icon name="chat-fill" size="17" color="#2979ff"></up-icon>
          </view>
          <view class="conv-card__body">
            <text class="conv-card__title u-line-1">{{ conv.title || "未命名会话" }}</text>
            <text class="conv-card__subtitle u-line-1">{{ getHistoryConversationMeta(conv) }}</text>
          </view>
          <view class="conv-card__actions">
            <view class="conv-card__menu" @click.stop="showConversationMenu(conv)">
              <up-icon name="more-dot-fill" size="16" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
            </view>
            <up-icon name="arrow-right" size="12" :color="upThemeVar('--up-light-color', '#c0c4cc')"></up-icon>
          </view>
        </view>
      </view>
    </view>
    <view class="safe-bottom"></view>
  </scroll-view>
</view>
```

Add or adjust the matching styles in the same Vue file:

```scss
.history-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.history-scroll {
  flex: 1;
  min-height: 0;
}

.history-mode-bar {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 14rpx 16rpx;
  border-radius: 20rpx;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 8rpx 24rpx rgba(15, 23, 42, 0.06) !important;
}

.history-mode-create {
  display: inline-flex;
  align-items: center;
  gap: 4rpx;
  padding: 8rpx 12rpx;
  border-radius: 999rpx;
  background: rgba(47, 124, 246, 0.1);
}

.history-section {
  margin-top: 24rpx;
}

.history-section__title {
  display: block;
  padding: 0 8rpx 12rpx;
  font-size: 22rpx;
  font-weight: 600;
  color: #9198a8;
}

.conv-list--history {
  gap: 12rpx;
}

.conv-card--history {
  border-radius: 22rpx;
  box-shadow: 0 10rpx 26rpx rgba(15, 23, 42, 0.06) !important;
}

.conv-card__subtitle {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #6b7280;
  line-height: 1.3;
}
```

- [ ] **Step 4: Run the targeted tests and the H5 build**

Run:

```bash
npm run test:unit -- tests/pages/conversations/historyPresentation.spec.ts
npm run build:h5
```

Expected:
- Jest: PASS with 4 passing tests in `historyPresentation.spec.ts`
- H5 build: `DONE  Build complete.`

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/conversations/historyPresentation.ts mcode-app/tests/pages/conversations/historyPresentation.spec.ts mcode-app/src/pages/conversations/index.vue
git commit -m "feat: redesign conversations history mode"
```
