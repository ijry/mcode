# Todo Tab iOS Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `mcode-app`'s todo tab into the approved iOS-style local/cloud layout while preserving local todo storage and the existing "send to new conversation" workflow.

**Architecture:** Keep the network, picker, and send-to-conversation logic inside `mcode-app/src/pages/todos/index.vue`, but extract local todo state transitions into a pure TypeScript helper and move the new shell into page-local Vue components. This keeps the high-risk remote behavior in one place, makes the local todo rules unit-testable with Jest, and lets the UI evolve toward the new conversations-page visual language without introducing a new store.

**Tech Stack:** Vue 3, uni-app, uview-plus, TypeScript, Jest, pnpm, H5 build smoke checks

---

## File Structure

- `mcode-app/src/pages/todos/todoState.ts`
  - Pure local todo model helpers: normalization, creation, filtering, completion toggles, edit application, hide-completed action.
- `mcode-app/tests/pages/todos/todoState.spec.ts`
  - Jest coverage for the local todo rules extracted from the page.
- `mcode-app/src/pages/todos/components/TodoPageHeader.vue`
  - New page title, search field, local/cloud segmented control, and create button.
- `mcode-app/src/pages/todos/components/TodoSectionBlock.vue`
  - Section heading row with optional action button such as `清除全部`.
- `mcode-app/src/pages/todos/components/TodoCardList.vue`
  - Todo card rendering for local in-progress, local completed, and cloud-placeholder modes.
- `mcode-app/src/pages/todos/components/TodoCreatePopup.vue`
  - `up-popup` sheet for creating a new local todo.
- `mcode-app/src/pages/todos/index.vue`
  - Page container that owns local state, persistence, send-sheet/picker flow, and wires the new components together.

---

### Task 1: Extract local todo state helpers and lock them with unit tests

**Files:**
- Create: `mcode-app/src/pages/todos/todoState.ts`
- Create: `mcode-app/tests/pages/todos/todoState.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `mcode-app/tests/pages/todos/todoState.spec.ts`:

```ts
import {
  applyTodoEdit,
  createTodoItem,
  getVisibleTodoSections,
  hideCompletedTodos,
  normalizeStoredTodos,
  toggleTodoCompletion,
} from "@/pages/todos/todoState"

describe("todoState", () => {
  it("normalizes legacy rows and drops invalid items", () => {
    const now = 1710000000000
    const normalized = normalizeStoredTodos(
      [
        { id: 1, text: "  写日报  ", completed: false, createdAt: now - 10 },
        { id: "2", text: "已完成任务", completed: true, createdAt: now - 5 },
        { id: "3", text: "   ", completed: false, createdAt: now },
      ],
      now
    )

    expect(normalized).toEqual([
      {
        id: "1",
        text: "写日报",
        completed: false,
        createdAt: now - 10,
        completedAt: null,
        hidden: false,
        hiddenAt: null,
      },
      {
        id: "2",
        text: "已完成任务",
        completed: true,
        createdAt: now - 5,
        completedAt: null,
        hidden: false,
        hiddenAt: null,
      },
    ])
  })

  it("creates visible sections and excludes hidden completed items", () => {
    const sections = getVisibleTodoSections(
      [
        createTodoItem("整理需求", 10),
        {
          ...createTodoItem("预约健身房", 20),
          completed: true,
          completedAt: 30,
        },
        {
          ...createTodoItem("隐藏旧任务", 40),
          completed: true,
          completedAt: 50,
          hidden: true,
          hiddenAt: 60,
        },
      ],
      "健身"
    )

    expect(sections.inProgress).toEqual([])
    expect(sections.completed.map((item) => item.text)).toEqual(["预约健身房"])
  })

  it("toggles a todo into completed and then restores it back to local active state", () => {
    const seed = [createTodoItem("补测试", 100)]
    const completed = toggleTodoCompletion(seed, seed[0].id, 200)
    expect(completed[0]).toMatchObject({
      completed: true,
      completedAt: 200,
      hidden: false,
      hiddenAt: null,
    })

    const reopened = toggleTodoCompletion(
      [{ ...completed[0], hidden: true, hiddenAt: 300 }],
      seed[0].id,
      400
    )
    expect(reopened[0]).toMatchObject({
      completed: false,
      completedAt: null,
      hidden: false,
      hiddenAt: null,
    })
  })

  it("hides only the completed ids passed in from the visible section", () => {
    const items = [
      { ...createTodoItem("进行中任务", 1), completed: false },
      { ...createTodoItem("已完成 A", 2), completed: true, completedAt: 20 },
      { ...createTodoItem("已完成 B", 3), completed: true, completedAt: 21 },
      {
        ...createTodoItem("已隐藏 C", 4),
        completed: true,
        completedAt: 30,
        hidden: true,
        hiddenAt: 31,
      },
    ]

    const hidden = hideCompletedTodos(items, ["2"], 500)

    expect(hidden[0]).toMatchObject({ hidden: false })
    expect(hidden[1]).toMatchObject({ hidden: true, hiddenAt: 500 })
    expect(hidden[2]).toMatchObject({ hidden: false, hiddenAt: null })
    expect(hidden[3]).toMatchObject({ hidden: true, hiddenAt: 31 })
  })

  it("updates todo text and removes a row when the edited text becomes empty", () => {
    const items = [createTodoItem("原始文案", 1)]

    expect(applyTodoEdit(items, items[0].id, "新文案")).toEqual([
      expect.objectContaining({ text: "新文案" }),
    ])
    expect(applyTodoEdit(items, items[0].id, "   ")).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run in `mcode-app`:

```bash
pnpm test:unit -- --runInBand tests/pages/todos/todoState.spec.ts
```

Expected: fail because `src/pages/todos/todoState.ts` does not exist yet.

- [ ] **Step 3: Implement the helper**

Create `mcode-app/src/pages/todos/todoState.ts`:

```ts
export type TodoTab = "local" | "cloud"

export interface TodoItem {
  id: string
  text: string
  completed: boolean
  createdAt: number
  completedAt: number | null
  hidden: boolean
  hiddenAt: number | null
}

function toTimestamp(value: unknown, fallback: number | null = null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

export function createTodoItem(text: string, now = Date.now()): TodoItem {
  return {
    id: String(now),
    text: text.trim(),
    completed: false,
    createdAt: now,
    completedAt: null,
    hidden: false,
    hiddenAt: null,
  }
}

export function normalizeStoredTodos(raw: unknown, now = Date.now()): TodoItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null
      const row = entry as Record<string, unknown>
      const text = String(row.text || "").trim()
      if (!text) return null
      return {
        id: String(row.id ?? now),
        text,
        completed: Boolean(row.completed),
        createdAt: toTimestamp(row.createdAt, now) ?? now,
        completedAt: toTimestamp(row.completedAt),
        hidden: Boolean(row.hidden),
        hiddenAt: toTimestamp(row.hiddenAt),
      } satisfies TodoItem
    })
    .filter((item): item is TodoItem => Boolean(item))
}

export function getVisibleTodoSections(items: TodoItem[], keyword: string) {
  const needle = keyword.trim().toLowerCase()
  const visible = items.filter((item) => {
    if (item.hidden) return false
    if (!needle) return true
    return item.text.toLowerCase().includes(needle)
  })
  return {
    inProgress: visible.filter((item) => !item.completed),
    completed: visible.filter((item) => item.completed),
  }
}

export function toggleTodoCompletion(items: TodoItem[], id: string, now = Date.now()): TodoItem[] {
  return items.map((item) => {
    if (item.id !== id) return item
    if (!item.completed) {
      return { ...item, completed: true, completedAt: now, hidden: false, hiddenAt: null }
    }
    return { ...item, completed: false, completedAt: null, hidden: false, hiddenAt: null }
  })
}

export function applyTodoEdit(items: TodoItem[], id: string, nextText: string): TodoItem[] {
  const text = nextText.trim()
  if (!text) return items.filter((item) => item.id !== id)
  return items.map((item) => (item.id === id ? { ...item, text } : item))
}

export function hideCompletedTodos(
  items: TodoItem[],
  idsToHide: string[],
  now = Date.now()
): TodoItem[] {
  const idSet = new Set(idsToHide)
  return items.map((item) => {
    if (!item.completed || item.hidden || !idSet.has(item.id)) return item
    return { ...item, hidden: true, hiddenAt: now }
  })
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run in `mcode-app`:

```bash
pnpm test:unit -- --runInBand tests/pages/todos/todoState.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/todos/todoState.ts mcode-app/tests/pages/todos/todoState.spec.ts
git commit -m "feat(app): extract todo state helpers"
```

---

### Task 2: Introduce the new header and create-popup components

**Files:**
- Create: `mcode-app/src/pages/todos/components/TodoPageHeader.vue`
- Create: `mcode-app/src/pages/todos/components/TodoCreatePopup.vue`
- Modify: `mcode-app/src/pages/todos/index.vue`

- [ ] **Step 1: Build the reusable page header**

Create `mcode-app/src/pages/todos/components/TodoPageHeader.vue`:

```vue
<script setup lang="ts">
import type { TodoTab } from "../todoState"

const props = defineProps<{
  activeTab: TodoTab
  searchKeyword: string
}>()

const emit = defineEmits<{
  (e: "update:activeTab", value: TodoTab): void
  (e: "update:searchKeyword", value: string): void
  (e: "create"): void
}>()
</script>

<template>
  <view class="todo-header">
    <view class="todo-header__top">
      <text class="todo-header__title">待办</text>
      <view class="todo-header__action" @click="emit('create')">
        <up-icon name="plus" size="16" color="#ffffff"></up-icon>
      </view>
    </view>

    <view class="todo-header__search">
      <up-search
        :modelValue="props.searchKeyword"
        placeholder="搜索"
        :show-action="false"
        shape="round"
        bgColor="#e9eaee"
        borderColor="transparent"
        color="#1a1b1f"
        placeholderColor="#9ca3af"
        searchIconColor="#8b93a5"
        :height="44"
        @update:modelValue="emit('update:searchKeyword', $event)"
      ></up-search>
    </view>

    <view class="todo-header__segmented">
      <view
        :class="['todo-header__segment', props.activeTab === 'local' && 'todo-header__segment--active']"
        @click="emit('update:activeTab', 'local')"
      >
        <text class="todo-header__segment-text">本地</text>
      </view>
      <view
        :class="['todo-header__segment', props.activeTab === 'cloud' && 'todo-header__segment--active']"
        @click="emit('update:activeTab', 'cloud')"
      >
        <text class="todo-header__segment-text">云端</text>
      </view>
    </view>
  </view>
</template>
```

- [ ] **Step 2: Build the create sheet component**

Create `mcode-app/src/pages/todos/components/TodoCreatePopup.vue`:

```vue
<script setup lang="ts">
import { computed, ref, watch } from "vue"

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{
  (e: "update:show", value: boolean): void
  (e: "submit", value: string): void
}>()

const draftText = ref("")
const canSubmit = computed(() => draftText.value.trim().length > 0)

watch(
  () => props.show,
  (visible) => {
    if (!visible) draftText.value = ""
  }
)

function closePopup() {
  emit("update:show", false)
}

function submit() {
  if (!canSubmit.value) return
  emit("submit", draftText.value.trim())
  emit("update:show", false)
}
</script>

<template>
  <up-popup :show="props.show" mode="bottom" :round="28" @close="closePopup">
    <view class="todo-create-sheet">
      <view class="todo-create-sheet__hd">
        <text class="todo-create-sheet__title">新建待办</text>
        <view class="todo-create-sheet__close" @click="closePopup">
          <up-icon name="close" size="18" color="#909193"></up-icon>
        </view>
      </view>

      <up-textarea
        v-model="draftText"
        placeholder="输入待办事项..."
        autoHeight
        :maxlength="-1"
        :count="false"
      ></up-textarea>

      <up-button
        type="primary"
        shape="circle"
        :disabled="!canSubmit"
        customStyle="margin-top:16rpx"
        @click="submit"
      >添加待办</up-button>

      <view class="todo-create-sheet__safe"></view>
    </view>
  </up-popup>
</template>
```

- [ ] **Step 3: Swap the old inline add bar for the new header and create popup**

Update `mcode-app/src/pages/todos/index.vue` to remove `newTodoText` from the inline toolbar, add `activeTab`, `searchKeyword`, and `showCreatePopup`, and render the new components:

```vue
<template>
  <view class="page todo-page" :style="[upThemeVars, upThemePageStyle]">
    <view class="todo-shell">
      <TodoPageHeader
        v-model:activeTab="activeTab"
        v-model:searchKeyword="searchKeyword"
        @create="openCreatePopup"
      />

      <!-- keep the existing list area for now; it will be rebuilt in Task 3 -->
    </view>

    <TodoCreatePopup
      v-model:show="showCreatePopup"
      @submit="createTodoFromPopup"
    />
  </view>
</template>

<script setup lang="ts">
import TodoCreatePopup from "./components/TodoCreatePopup.vue"
import TodoPageHeader from "./components/TodoPageHeader.vue"
import { createTodoItem, normalizeStoredTodos, type TodoItem, type TodoTab } from "./todoState"

const activeTab = ref<TodoTab>("local")
const searchKeyword = ref("")
const showCreatePopup = ref(false)

function openCreatePopup() {
  if (activeTab.value === "cloud") {
    uni.showToast({ title: "云端待办即将上线", icon: "none" })
    return
  }
  showCreatePopup.value = true
}

function createTodoFromPopup(text: string) {
  todos.value.unshift(createTodoItem(text, Date.now()))
  saveTodos()
}

function loadTodos() {
  todos.value = normalizeStoredTodos(uni.getStorageSync(STORAGE_KEY))
}
</script>
```

- [ ] **Step 4: Run a build smoke check**

Run in `mcode-app`:

```bash
pnpm build:h5
```

Expected: build succeeds and the page compiles with the new header and popup components.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/todos/components/TodoPageHeader.vue mcode-app/src/pages/todos/components/TodoCreatePopup.vue mcode-app/src/pages/todos/index.vue
git commit -m "feat(app): add todo page shell components"
```

---

### Task 3: Replace the flat list with section blocks and card-list components

**Files:**
- Create: `mcode-app/src/pages/todos/components/TodoSectionBlock.vue`
- Create: `mcode-app/src/pages/todos/components/TodoCardList.vue`
- Modify: `mcode-app/src/pages/todos/index.vue`

- [ ] **Step 1: Add the section-block wrapper**

Create `mcode-app/src/pages/todos/components/TodoSectionBlock.vue`:

```vue
<script setup lang="ts">
const props = defineProps<{
  title: string
  actionText?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: "action"): void
}>()
</script>

<template>
  <view class="todo-section">
    <view class="todo-section__head">
      <text class="todo-section__title">{{ props.title }}</text>
      <text
        v-if="props.actionText"
        :class="['todo-section__action', props.disabled && 'todo-section__action--disabled']"
        @click="!props.disabled && emit('action')"
      >{{ props.actionText }}</text>
    </view>
    <slot></slot>
  </view>
</template>
```

- [ ] **Step 2: Add the card-list renderer for local and cloud modes**

Create `mcode-app/src/pages/todos/components/TodoCardList.vue`:

```vue
<script setup lang="ts">
import type { TodoItem } from "../todoState"

const props = defineProps<{
  items: TodoItem[]
  mode: "in-progress" | "completed" | "cloud-placeholder"
  emptyText: string
}>()

const emit = defineEmits<{
  (e: "toggle", id: string): void
  (e: "edit", item: TodoItem): void
  (e: "send", item: TodoItem): void
  (e: "menu", item: TodoItem): void
  (e: "placeholderAction"): void
}>()
</script>

<template>
  <view v-if="props.items.length > 0" class="todo-card-list">
    <view
      v-for="item in props.items"
      :key="item.id"
      :class="['todo-card', props.mode === 'completed' && 'todo-card--completed']"
    >
      <view class="todo-card__check" @click="emit('toggle', item.id)">
        <view :class="['todo-card__check-circle', item.completed && 'todo-card__check-circle--checked']">
          <up-icon v-if="item.completed" name="checkmark" size="14" color="#ffffff"></up-icon>
        </view>
      </view>

      <view class="todo-card__body" @click="props.mode === 'in-progress' && emit('edit', item)">
        <text class="todo-card__title">{{ item.text }}</text>
        <text class="todo-card__meta">
          {{ props.mode === 'completed' ? '已完成' : '点击编辑或发送到新会话' }}
        </text>
      </view>

      <view class="todo-card__side">
        <view v-if="props.mode === 'completed'" class="todo-card__badge todo-card__badge--completed">
          <text class="todo-card__badge-text">已完成</text>
        </view>
        <view class="todo-card__icon-btn" @click.stop="emit('send', item)">
          <up-icon name="chat" size="18" color="#2f7cf6"></up-icon>
        </view>
        <view class="todo-card__icon-btn" @click.stop="emit('menu', item)">
          <up-icon name="more-dot-fill" size="16" color="#b0b7c3"></up-icon>
        </view>
      </view>
    </view>
  </view>

  <view v-else-if="props.mode === 'cloud-placeholder'" class="todo-empty-card" @click="emit('placeholderAction')">
    <text class="todo-empty-card__title">云端待办即将上线</text>
    <text class="todo-empty-card__desc">这里会显示同步到云端的进行中与已完成待办。</text>
  </view>

  <view v-else class="todo-empty-card">
    <text class="todo-empty-card__title">{{ props.emptyText }}</text>
  </view>
</template>
```

- [ ] **Step 3: Split the page into local sections and a cloud placeholder shell**

Update `mcode-app/src/pages/todos/index.vue` to consume the helper selectors and new section/list components:

```ts
import TodoCardList from "./components/TodoCardList.vue"
import TodoSectionBlock from "./components/TodoSectionBlock.vue"
import {
  getVisibleTodoSections,
  hideCompletedTodos,
  toggleTodoCompletion,
} from "./todoState"

const localSections = computed(() =>
  getVisibleTodoSections(todos.value, searchKeyword.value)
)

const localInProgressTodos = computed(() => localSections.value.inProgress)
const localCompletedTodos = computed(() => localSections.value.completed)

function toggleTodo(id: string) {
  todos.value = toggleTodoCompletion(todos.value, id, Date.now())
  saveTodos()
}

function clearCompletedTodos() {
  if (activeTab.value === "cloud") {
    uni.showToast({ title: "云端待办即将上线", icon: "none" })
    return
  }
  uni.showModal({
    title: "清除已完成",
    content: "这些待办会被标记隐藏，之后不再显示。",
    success: (res) => {
      if (!res.confirm) return
      const visibleCompletedIds = localCompletedTodos.value.map((item) => item.id)
      todos.value = hideCompletedTodos(todos.value, visibleCompletedIds, Date.now())
      saveTodos()
    },
  })
}
```

Render the page body like this:

```vue
<view v-if="activeTab === 'local'" class="todo-body">
  <TodoSectionBlock title="进行中">
    <TodoCardList
      :items="localInProgressTodos"
      mode="in-progress"
      emptyText="暂无进行中的待办"
      @toggle="toggleTodo"
      @edit="startEdit"
      @send="openSendSheet"
      @menu="openTodoMenu"
    />
  </TodoSectionBlock>

  <TodoSectionBlock
    title="已完成"
    actionText="清除全部"
    :disabled="localCompletedTodos.length === 0"
    @action="clearCompletedTodos"
  >
    <TodoCardList
      :items="localCompletedTodos"
      mode="completed"
      emptyText="暂无已完成待办"
      @toggle="toggleTodo"
      @send="openSendSheet"
      @menu="openTodoMenu"
    />
  </TodoSectionBlock>
</view>

<view v-else class="todo-body">
  <TodoSectionBlock title="进行中">
    <TodoCardList
      :items="[]"
      mode="cloud-placeholder"
      emptyText=""
      @placeholderAction="openCreatePopup"
    />
  </TodoSectionBlock>

  <TodoSectionBlock title="已完成" actionText="清除全部" @action="clearCompletedTodos">
    <TodoCardList
      :items="[]"
      mode="cloud-placeholder"
      emptyText=""
      @placeholderAction="clearCompletedTodos"
    />
  </TodoSectionBlock>
</view>
```

- [ ] **Step 4: Run unit tests and a build smoke check**

Run in `mcode-app`:

```bash
pnpm test:unit -- --runInBand tests/pages/todos/todoState.spec.ts
pnpm build:h5
```

Expected: the todo-state tests still pass and the new page shell compiles.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/todos/components/TodoSectionBlock.vue mcode-app/src/pages/todos/components/TodoCardList.vue mcode-app/src/pages/todos/index.vue
git commit -m "feat(app): rebuild todo tab sections and cards"
```

---

### Task 4: Rewire editing, pet progression, persistence guards, and popup styling inside the new layout

**Files:**
- Modify: `mcode-app/src/pages/todos/index.vue`
- Modify: `mcode-app/src/pages/todos/components/TodoCardList.vue`
- Modify: `mcode-app/src/pages/todos/components/TodoCreatePopup.vue`

- [ ] **Step 1: Preserve inline edit behavior for local in-progress cards**

Update the page so edit state still lives in `index.vue`, but the card list renders an inline textarea when the current row matches `editingId`:

```vue
<TodoCardList
  :items="localInProgressTodos"
  mode="in-progress"
  :editingId="editingId"
  :editingText="editingText"
  emptyText="暂无进行中的待办"
  @toggle="toggleTodo"
  @edit="startEdit"
  @update:editingText="editingText = $event"
  @finishEdit="finishEdit"
  @send="openSendSheet"
  @menu="openTodoMenu"
/>
```

Expand `TodoCardList.vue` props/emits to support:

```ts
const props = defineProps<{
  items: TodoItem[]
  mode: "in-progress" | "completed" | "cloud-placeholder"
  emptyText: string
  editingId?: string | null
  editingText?: string
}>()

const emit = defineEmits<{
  (e: "toggle", id: string): void
  (e: "edit", item: TodoItem): void
  (e: "update:editingText", value: string): void
  (e: "finishEdit", item: TodoItem, value?: string): void
  (e: "send", item: TodoItem): void
  (e: "menu", item: TodoItem): void
  (e: "placeholderAction"): void
}>()
```

- [ ] **Step 2: Move edit persistence onto the helper and keep the current action menu behavior**

Update `finishEdit` in `index.vue` to use `applyTodoEdit` from `todoState.ts`:

```ts
import { applyTodoEdit } from "./todoState"

function finishEdit(item: TodoItem, value?: string) {
  if (typeof value === "string") {
    editingText.value = value
  }
  todos.value = applyTodoEdit(todos.value, item.id, editingText.value)
  saveTodos()
  editingId.value = null
  editingText.value = ""
}
```

Keep the current pet reward behavior inside `toggleTodo` when a row moves from incomplete to completed:

```ts
function toggleTodo(id: string) {
  const before = todos.value.find((item) => item.id === id)
  const wasIncomplete = Boolean(before && !before.completed)
  todos.value = toggleTodoCompletion(todos.value, id, Date.now())
  saveTodos()
  if (wasIncomplete) {
    const petStore = usePetStore()
    petStore.addExp("user", 15)
    petStore.recordStat("totalTodosCompleted")
  }
}
```

Wrap persistence in guards that preserve the page instead of throwing:

```ts
function loadTodos() {
  try {
    todos.value = normalizeStoredTodos(uni.getStorageSync(STORAGE_KEY))
  } catch (error) {
    console.warn("load todos failed:", error)
    todos.value = []
  }
}

function saveTodos() {
  try {
    uni.setStorageSync(STORAGE_KEY, todos.value)
  } catch (error) {
    console.warn("save todos failed:", error)
    uni.showToast({ title: "保存失败", icon: "none" })
  }
}
```

Leave `openSendSheet`, `confirmSend`, `openTodoMenu`, `handleTodoActionSelect`, picker loading, and gateway calls unchanged except for any event-parameter updates required by the new card component. Completed local cards should continue to expose copy/delete/send actions; only inline text editing remains restricted to in-progress cards.

- [ ] **Step 3: Finish the iOS-style page and popup styling**

Add or replace styles in `index.vue`, `TodoCardList.vue`, and `TodoCreatePopup.vue` so the page matches the conversations-page language:

```scss
.todo-page {
  min-height: 100vh;
  background: #f5f5f7;
}

.todo-shell {
  min-height: 100vh;
  padding: 28rpx 24rpx 40rpx;
}

.todo-body {
  display: flex;
  flex-direction: column;
  gap: 28rpx;
  padding-bottom: calc(36rpx + env(safe-area-inset-bottom));
}

.todo-card {
  display: flex;
  align-items: center;
  gap: 18rpx;
  padding: 18rpx 16rpx;
  border-radius: 22rpx;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 10rpx 26rpx rgba(15, 23, 42, 0.06);
}

.todo-create-sheet {
  padding: 36rpx 20rpx 0;
  background: #ffffff;
  border-radius: 28rpx 28rpx 0 0;
}
```

- [ ] **Step 4: Run unit tests and a build smoke check**

Run in `mcode-app`:

```bash
pnpm test:unit -- --runInBand tests/pages/todos/todoState.spec.ts
pnpm build:h5
```

Expected: tests pass and the rebuilt todo page still compiles after the edit/action wiring.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/todos/index.vue mcode-app/src/pages/todos/components/TodoCardList.vue mcode-app/src/pages/todos/components/TodoCreatePopup.vue
git commit -m "feat(app): wire todo interactions into new ios layout"
```

---

### Task 5: Final verification and handoff

**Files:**
- Validate: `mcode-app/src/pages/todos/index.vue`
- Validate: `mcode-app/src/pages/todos/todoState.ts`
- Validate: `mcode-app/src/pages/todos/components/TodoPageHeader.vue`
- Validate: `mcode-app/src/pages/todos/components/TodoSectionBlock.vue`
- Validate: `mcode-app/src/pages/todos/components/TodoCardList.vue`
- Validate: `mcode-app/src/pages/todos/components/TodoCreatePopup.vue`
- Validate: `mcode-app/tests/pages/todos/todoState.spec.ts`

- [ ] **Step 1: Run the focused unit tests**

Run in `mcode-app`:

```bash
pnpm test:unit -- --runInBand tests/pages/todos/todoState.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run the full H5 build**

Run in `mcode-app`:

```bash
pnpm build:h5
```

Expected: build succeeds with no template, TypeScript, or route errors coming from the todo page.

- [ ] **Step 3: Manually verify the redesigned page**

Check these states in H5 or a device preview:

```text
1. The todo page header matches the new conversations-page title/search/action style.
2. The local/cloud segmented control switches shells without layout jumps.
3. The + button opens the up-popup sheet in local mode and shows "云端待办即将上线" in cloud mode.
4. New todos appear at the top of 进行中.
5. Toggling a todo moves it between 进行中 and 已完成.
6. Marking an in-progress todo complete still grants the existing pet EXP/stat reward once.
7. 清除全部 removes completed cards from view without deleting active cards.
8. In-progress cards still support inline edit, copy, delete, and send-to-new-conversation.
9. Completed cards still support copy, delete, and send-to-new-conversation, but do not enter edit mode.
10. The existing send sheet, connection picker, project picker, and agent picker still work.
11. The cloud tab keeps the full shell but never performs real data writes.
12. No horizontal scroll or clipped safe-area padding appears at mobile widths.
```

- [ ] **Step 4: Leave the workspace ready for execution**

If any small polish issues appear during preview, fix them before handoff, rerun the two commands above, and then leave the branch ready for the next worker.
