<template>
  <view class="project-todos-panel">
    <view class="project-todos-tools" :style="upThemeCardStyle">
      <view class="project-todos-search">
        <up-icon name="search" size="16" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
        <input
          v-model="searchKeyword"
          class="project-todos-search__input"
          placeholder="搜索待办"
          placeholder-class="project-todos-search__placeholder"
        />
      </view>
      <view class="project-todos-create" @click="openCreatePopup">
        <up-icon name="plus" size="16" color="#ffffff"></up-icon>
      </view>
    </view>

    <TodoSectionBlock title="进行中">
      <TodoCardList
        :items="inProgressTodos"
        mode="in-progress"
        emptyText="暂无进行中的待办"
        @toggle="toggleTodo"
        @edit="startEdit"
        @send="showSendHint"
        @menu="openTodoMenu"
      />
    </TodoSectionBlock>

    <TodoSectionBlock
      title="已完成"
      actionText="清除全部"
      :disabled="completedTodos.length === 0"
      @action="clearCompletedTodos"
    >
      <TodoCardList
        :items="completedTodos"
        mode="completed"
        emptyText="暂无已完成待办"
        @toggle="toggleTodo"
        @send="showSendHint"
        @menu="openTodoMenu"
      />
    </TodoSectionBlock>

    <TodoCreatePopup v-model:show="showCreatePopup" @submit="createTodoFromPopup" />
    <TodoCreatePopup
      v-model:show="showEditPopup"
      title="编辑待办"
      submitLabel="保存"
      :initialValue="editingText"
      @submit="finishEdit"
    />

    <up-action-sheet
      :show="showTodoActionSheet"
      :actions="todoActions"
      @select="handleTodoActionSelect"
      @close="showTodoActionSheet = false"
    ></up-action-sheet>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, onMounted, ref, watch } from "vue"
import TodoCardList from "@/pages/todos/components/TodoCardList.vue"
import TodoCreatePopup from "@/pages/todos/components/TodoCreatePopup.vue"
import TodoSectionBlock from "@/pages/todos/components/TodoSectionBlock.vue"
import {
  applyTodoEdit,
  createProjectTodoItem,
  getProjectTodoSections,
  hideCompletedTodos,
  normalizeStoredTodos,
  toggleTodoCompletion,
  type TodoItem,
} from "@/pages/todos/todoState"

const STORAGE_KEY = "mcode_todos"

const props = defineProps<{
  connectionId: string
  folderId: number
  projectName: string
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (name: string, fallback: string) =>
  currentInstance?.proxy?.upThemeVar?.(name, fallback) ?? `var(${name}, ${fallback})`

const todos = ref<TodoItem[]>([])
const searchKeyword = ref("")
const editingId = ref<string | null>(null)
const editingText = ref("")
const showCreatePopup = ref(false)
const showEditPopup = ref(false)
const showTodoActionSheet = ref(false)
const currentTodo = ref<TodoItem | null>(null)
const todoActions = [
  { name: "复制", color: "#2979ff" },
  { name: "删除", color: "#fa3534" },
]

const binding = computed(() => ({
  connectionId: props.connectionId,
  projectId: props.folderId,
  projectName: props.projectName,
}))

const sections = computed(() =>
  getProjectTodoSections(todos.value, binding.value, searchKeyword.value)
)
const inProgressTodos = computed(() => sections.value.inProgress)
const completedTodos = computed(() => sections.value.completed)

onMounted(() => {
  loadTodos()
})

watch(
  () => [props.connectionId, props.folderId],
  () => {
    loadTodos()
  }
)

function loadTodos() {
  try {
    todos.value = normalizeStoredTodos(uni.getStorageSync(STORAGE_KEY))
  } catch (error) {
    console.warn("load project todos failed:", error)
    todos.value = []
  }
}

function saveTodos() {
  try {
    uni.setStorageSync(STORAGE_KEY, todos.value)
  } catch (error) {
    console.warn("save project todos failed:", error)
    uni.showToast({ title: "保存失败", icon: "none" })
  }
}

function openCreatePopup() {
  showCreatePopup.value = true
}

function createTodoFromPopup(text: string) {
  todos.value.unshift(createProjectTodoItem(text, binding.value, Date.now()))
  saveTodos()
}

function toggleTodo(id: string) {
  todos.value = toggleTodoCompletion(todos.value, id, Date.now())
  saveTodos()
}

function startEdit(item: TodoItem) {
  if (item.completed) return
  editingId.value = item.id
  editingText.value = item.text
  showEditPopup.value = true
}

function finishEdit(value: string) {
  if (!editingId.value) return
  editingText.value = value
  todos.value = applyTodoEdit(todos.value, editingId.value, editingText.value)
  saveTodos()
  editingId.value = null
  editingText.value = ""
  showEditPopup.value = false
}

function clearCompletedTodos() {
  uni.showModal({
    title: "清除已完成",
    content: "这些待办会被标记隐藏，之后不再显示。",
    success: (res) => {
      if (!res.confirm) return
      const visibleCompletedIds = completedTodos.value.map((item) => item.id)
      todos.value = hideCompletedTodos(todos.value, visibleCompletedIds, Date.now())
      saveTodos()
    },
  })
}

function openTodoMenu(item: TodoItem) {
  currentTodo.value = item
  showTodoActionSheet.value = true
}

function handleTodoActionSelect(e: any) {
  const item = currentTodo.value
  const action = resolveTodoActionName(e)
  showTodoActionSheet.value = false
  if (!item || !action) return
  if (action === "复制") {
    copyTodoText(item.text)
    return
  }
  if (action === "删除") {
    confirmDeleteTodo(item)
  }
}

function resolveTodoActionName(e: any) {
  if (typeof e === "string") return e
  if (e && typeof e.name === "string") return e.name
  if (e && typeof e.index === "number") {
    return todoActions[e.index]?.name || ""
  }
  return ""
}

function copyTodoText(text: string) {
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: "已复制", icon: "success" }),
    fail: () => uni.showToast({ title: "复制失败", icon: "none" }),
  })
}

function confirmDeleteTodo(item: TodoItem) {
  uni.showModal({
    title: "确认删除",
    content: "确定要删除这个待办吗？此操作不可恢复。",
    success: (res) => {
      if (!res.confirm) return
      todos.value = todos.value.filter((todo) => todo.id !== item.id)
      saveTodos()
      uni.showToast({ title: "删除成功", icon: "success" })
    },
  })
}

function showSendHint() {
  uni.showToast({ title: "请在全局待办页发送到新会话", icon: "none" })
}

defineExpose({ reload: loadTodos })
</script>

<style scoped lang="scss">
.project-todos-panel {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.project-todos-tools {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 18rpx;
  border-radius: 24rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.project-todos-search {
  flex: 1;
  min-width: 0;
  height: 68rpx;
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 0 20rpx;
  border-radius: 999rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.project-todos-search__input {
  flex: 1;
  min-width: 0;
  height: 68rpx;
  font-size: 26rpx;
  color: var(--up-main-color, #303133);
}

.project-todos-search__placeholder {
  color: var(--up-tips-color, #909193);
}

.project-todos-create {
  width: 68rpx;
  height: 68rpx;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--up-primary, #2979ff);
}
</style>
