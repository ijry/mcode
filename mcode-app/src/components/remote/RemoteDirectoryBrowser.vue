<template>
  <up-popup :show="show" mode="bottom" :round="28" @close="close">
    <view class="remote-dir" :style="upThemeCardStyle">
      <view class="remote-dir__head">
        <view class="remote-dir__title-block">
          <text class="remote-dir__eyebrow">REMOTE FOLDER</text>
          <text class="remote-dir__title">{{ title || "添加文件夹" }}</text>
        </view>
        <view class="remote-dir__close" @click="close">
          <up-icon name="close" size="16" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
        </view>
      </view>

      <view class="remote-dir__toolbar">
        <view class="remote-dir__tool" @click="goHome">
          <up-icon name="home" size="15" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
        </view>
        <view class="remote-dir__tool" @click="goParent">
          <up-icon name="arrow-upward" size="15" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
        </view>
        <view class="remote-dir__tool" @click="toggleCreatePanel">
          <up-icon name="plus" size="15" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
        </view>
        <input
          class="remote-dir__input"
          :value="pathInput"
          placeholder="输入远端目录路径"
          placeholder-class="remote-dir__placeholder"
          @input="handleInput"
          @confirm="navigateInput"
        />
      </view>
      <view v-if="createPanelOpen" class="remote-dir__create">
        <input
          class="remote-dir__create-input"
          :value="newFolderName"
          placeholder="新建文件夹名称"
          placeholder-class="remote-dir__placeholder"
          :disabled="creatingDirectory"
          @input="handleNewFolderInput"
          @confirm="createDirectory"
        />
        <view
          class="remote-dir__create-submit"
          :class="{ 'remote-dir__create-submit--disabled': creatingDirectory }"
          @click="createDirectory"
        >
          <up-loading-icon
            v-if="creatingDirectory"
            mode="circle"
            size="15"
            :color="upThemeVar('--up-primary', '#2979ff')"
          ></up-loading-icon>
          <text v-else class="remote-dir__create-submit-text">创建</text>
        </view>
      </view>

      <view v-if="errorMessage" class="remote-dir__error">
        <text class="remote-dir__error-text">{{ errorMessage }}</text>
      </view>

      <view class="remote-dir__body">
        <view v-if="loading" class="remote-dir__state">
          <up-loading-icon mode="circle" size="26" :color="upThemeVar('--up-primary', '#2979ff')"></up-loading-icon>
          <text class="remote-dir__state-text">正在读取目录...</text>
        </view>
        <view v-else-if="entries.length === 0" class="remote-dir__state">
          <text class="remote-dir__state-title">没有子目录</text>
          <text class="remote-dir__state-text">可以直接选择当前目录。</text>
        </view>
        <scroll-view v-else class="remote-dir__list" scroll-y enhanced>
          <view
            v-for="entry in entries"
            :key="entry.path"
            class="remote-dir__row"
            :class="{ 'remote-dir__row--selected': isSelectedPath(entry.path) }"
            @click="navigateTo(entry.path)"
          >
            <view
              class="remote-dir__select"
              :class="{ 'remote-dir__select--checked': isSelectedPath(entry.path) }"
              @click.stop="selectEntry(entry.path)"
            >
              <view v-if="isSelectedPath(entry.path)" class="remote-dir__select-dot"></view>
            </view>
            <view class="remote-dir__folder">
              <up-icon name="folder" size="18" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
            </view>
            <view class="remote-dir__row-main">
              <text class="remote-dir__row-name u-line-1">{{ entry.name }}</text>
              <text class="remote-dir__row-path u-line-1">{{ entry.path }}</text>
            </view>
            <view class="remote-dir__row-action" @click.stop="navigateTo(entry.path)">
              <up-icon name="arrow-right" size="13" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
            </view>
          </view>
        </scroll-view>
      </view>

      <view class="remote-dir__footer">
        <text class="remote-dir__selected u-line-1">{{ selectedPath || "请选择目录" }}</text>
        <up-button
          type="primary"
          shape="circle"
          :loading="confirming"
          :disabled="!selectedPath || confirming"
          @click="confirmSelection"
        >选择此文件夹</up-button>
      </view>
    </view>
  </up-popup>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch } from "vue"
import type { CodegGateway } from "@/services/gateway"
import {
  childDirectoryPath,
  createRemoteDirectory,
  getHomeDirectory,
  listDirectoryEntries,
  parentDirectoryPath,
  type RemoteDirectoryEntry,
} from "@/services/remoteDirectoryBrowser"

const props = defineProps<{
  show: boolean
  gateway: CodegGateway | null
  title?: string
}>()

const emit = defineEmits<{
  (event: "update:show", value: boolean): void
  (event: "select", path: string): void
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})

const loading = ref(false)
const confirming = ref(false)
const creatingDirectory = ref(false)
const errorMessage = ref("")
const pathInput = ref("")
const selectedPath = ref("")
const newFolderName = ref("")
const createPanelOpen = ref(false)
const entries = ref<RemoteDirectoryEntry[]>([])
let sessionSeq = 0
let navSeq = 0

watch(
  () => props.show,
  (open) => {
    sessionSeq += 1
    if (!open) {
      resetState()
      return
    }
    void initialize()
  }
)

function upThemeVar(name: string, fallback: string) {
  const vars = currentInstance?.proxy?.upThemeVars || {}
  return (vars as Record<string, string>)[name] || `var(${name}, ${fallback})`
}

function resetState() {
  loading.value = false
  confirming.value = false
  creatingDirectory.value = false
  errorMessage.value = ""
  pathInput.value = ""
  selectedPath.value = ""
  newFolderName.value = ""
  createPanelOpen.value = false
  entries.value = []
}

function close() {
  emit("update:show", false)
}

async function initialize() {
  const seq = sessionSeq
  resetState()
  if (!props.gateway) {
    errorMessage.value = "连接不可用"
    return
  }
  loading.value = true
  try {
    const home = await getHomeDirectory(props.gateway)
    if (seq !== sessionSeq) return
    await navigateTo(home)
  } catch (error) {
    if (seq !== sessionSeq) return
    errorMessage.value = toErrorMessage(error, "读取主目录失败")
  } finally {
    if (seq === sessionSeq) loading.value = false
  }
}

async function navigateTo(path: string) {
  const target = String(path || "").trim()
  if (!target || !props.gateway) return
  const seq = sessionSeq
  const currentNav = ++navSeq
  loading.value = true
  errorMessage.value = ""
  try {
    const nextEntries = await listDirectoryEntries(props.gateway, target)
    if (seq !== sessionSeq || currentNav !== navSeq) return
    pathInput.value = target
    selectedPath.value = target
    entries.value = nextEntries
  } catch (error) {
    if (seq !== sessionSeq || currentNav !== navSeq) return
    errorMessage.value = toErrorMessage(error, "读取目录失败")
  } finally {
    if (seq === sessionSeq && currentNav === navSeq) loading.value = false
  }
}

function selectEntry(path: string) {
  selectedPath.value = path
}

function handleInput(event: Event) {
  pathInput.value = readInputValue(event)
  selectedPath.value = pathInput.value
}

function navigateInput() {
  void navigateTo(pathInput.value)
}

function goHome() {
  if (!props.gateway) return
  void (async () => {
    try {
      await navigateTo(await getHomeDirectory(props.gateway!))
    } catch (error) {
      errorMessage.value = toErrorMessage(error, "读取主目录失败")
    }
  })()
}

function goParent() {
  const parent = parentDirectoryPath(pathInput.value || selectedPath.value)
  if (!parent) return
  void navigateTo(parent)
}

function toggleCreatePanel() {
  createPanelOpen.value = !createPanelOpen.value
  errorMessage.value = ""
}

function handleNewFolderInput(event: Event) {
  newFolderName.value = readInputValue(event)
}

async function createDirectory() {
  const parent = pathInput.value.trim()
  const name = newFolderName.value.trim()
  if (!props.gateway || creatingDirectory.value) return
  if (!parent) {
    errorMessage.value = "请先进入一个父目录"
    return
  }
  if (!isValidFolderName(name)) {
    errorMessage.value = "文件夹名称不能为空，且不能包含路径分隔符"
    return
  }

  const target = childDirectoryPath(parent, name)
  const seq = sessionSeq
  const currentNav = ++navSeq
  creatingDirectory.value = true
  errorMessage.value = ""
  try {
    await createRemoteDirectory(props.gateway, target)
    const nextEntries = await listDirectoryEntries(props.gateway, parent)
    if (seq !== sessionSeq || currentNav !== navSeq) return
    entries.value = nextEntries
    selectedPath.value = target
    newFolderName.value = ""
    createPanelOpen.value = false
  } catch (error) {
    if (seq !== sessionSeq || currentNav !== navSeq) return
    errorMessage.value = toErrorMessage(error, "新建文件夹失败")
  } finally {
    if (seq === sessionSeq) creatingDirectory.value = false
  }
}

async function confirmSelection() {
  const target = selectedPath.value.trim()
  if (!target || !props.gateway || confirming.value) return
  const seq = sessionSeq
  confirming.value = true
  errorMessage.value = ""
  try {
    await listDirectoryEntries(props.gateway, target)
    if (seq !== sessionSeq) return
    emit("select", target)
  } catch (error) {
    if (seq !== sessionSeq) return
    errorMessage.value = toErrorMessage(error, "该目录不可读取")
  } finally {
    if (seq === sessionSeq) confirming.value = false
  }
}

function normalizePath(path: string) {
  return String(path || "").replace(/[\\/]+$/, "") || path
}

function isSelectedPath(path: string) {
  return normalizePath(path) === normalizePath(selectedPath.value)
}

function isValidFolderName(name: string) {
  return Boolean(name) && name !== "." && name !== ".." && !/[\\/]/.test(name)
}

function readInputValue(event: unknown) {
  const raw = event && typeof event === "object" ? (event as Record<string, any>) : null
  return String(raw?.detail?.value ?? raw?.target?.value ?? raw?.currentTarget?.value ?? "")
}

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  return fallback
}
</script>

<style scoped lang="scss">
.remote-dir {
  max-height: 86vh;
  padding: 32rpx 24rpx calc(24rpx + env(safe-area-inset-bottom));
  background: var(--up-card-bg-color, #ffffff);
  border-radius: 28rpx 28rpx 0 0;
  display: flex;
  flex-direction: column;
  gap: 22rpx;
}

.remote-dir__head,
.remote-dir__toolbar,
.remote-dir__row,
.remote-dir__footer {
  display: flex;
  align-items: center;
}

.remote-dir__head {
  justify-content: space-between;
}

.remote-dir__title-block {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.remote-dir__eyebrow {
  font-size: 20rpx;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--up-primary, #2979ff);
}

.remote-dir__title {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.remote-dir__close,
.remote-dir__tool,
.remote-dir__select,
.remote-dir__folder,
.remote-dir__row-action {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.remote-dir__close,
.remote-dir__tool {
  width: 58rpx;
  height: 58rpx;
  border-radius: 999rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.remote-dir__toolbar {
  gap: 12rpx;
}

.remote-dir__create {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 12rpx;
  border-radius: 22rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.remote-dir__input {
  flex: 1;
  min-width: 0;
  height: 64rpx;
  padding: 0 20rpx;
  border-radius: 999rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  color: var(--up-main-color, #303133);
  font-size: 24rpx;
}

.remote-dir__create-input {
  flex: 1;
  min-width: 0;
  height: 58rpx;
  padding: 0 18rpx;
  border-radius: 18rpx;
  background: var(--up-card-bg-color, #ffffff);
  color: var(--up-main-color, #303133);
  font-size: 24rpx;
}

.remote-dir__create-submit {
  flex-shrink: 0;
  min-width: 92rpx;
  height: 58rpx;
  padding: 0 18rpx;
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 12%, var(--up-card-bg-color, #ffffff) 88%);
}

.remote-dir__create-submit--disabled {
  opacity: 0.6;
}

.remote-dir__create-submit-text {
  font-size: 24rpx;
  font-weight: 700;
  color: var(--up-primary, #2979ff);
}

.remote-dir__placeholder {
  color: var(--up-tips-color, #909193);
}

.remote-dir__error {
  padding: 16rpx 18rpx;
  border-radius: 18rpx;
  background: color-mix(in srgb, var(--up-error, #fa3534) 10%, var(--up-card-bg-color, #ffffff) 90%);
}

.remote-dir__error-text {
  font-size: 23rpx;
  color: var(--up-error, #fa3534);
}

.remote-dir__body {
  min-height: 360rpx;
  max-height: 52vh;
}

.remote-dir__list {
  height: 52vh;
}

.remote-dir__state {
  min-height: 360rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  text-align: center;
}

.remote-dir__state-title {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.remote-dir__state-text,
.remote-dir__row-path,
.remote-dir__selected {
  font-size: 22rpx;
  color: var(--up-tips-color, #909193);
}

.remote-dir__row {
  gap: 16rpx;
  padding: 18rpx 8rpx;
  border-bottom: 1rpx solid var(--up-border-color, #dadbde);
}

.remote-dir__row--selected {
  background: color-mix(in srgb, var(--up-primary, #2979ff) 8%, transparent);
}

.remote-dir__select {
  width: 44rpx;
  height: 44rpx;
  border-radius: 999rpx;
  border: 2rpx solid var(--up-border-color, #dadbde);
  background: var(--up-card-bg-color, #ffffff);
}

.remote-dir__select--checked {
  border-color: var(--up-primary, #2979ff);
  background: color-mix(in srgb, var(--up-primary, #2979ff) 12%, var(--up-card-bg-color, #ffffff) 88%);
}

.remote-dir__select-dot {
  width: 18rpx;
  height: 18rpx;
  border-radius: 999rpx;
  background: var(--up-primary, #2979ff);
}

.remote-dir__folder {
  width: 52rpx;
  height: 52rpx;
  border-radius: 16rpx;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%);
}

.remote-dir__row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.remote-dir__row-name {
  font-size: 27rpx;
  font-weight: 600;
  color: var(--up-main-color, #303133);
}

.remote-dir__row-action {
  width: 48rpx;
  height: 48rpx;
}

.remote-dir__footer {
  gap: 16rpx;
}

.remote-dir__selected {
  flex: 1;
  min-width: 0;
}
</style>
