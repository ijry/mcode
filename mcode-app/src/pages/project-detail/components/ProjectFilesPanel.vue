<template>
  <view class="project-files-panel">
    <ProjectUnsupportedState
      v-if="unsupportedText"
      title="文件暂不可用"
      :text="unsupportedText"
      icon="file-text"
    />

    <view v-else class="project-files-layout">
      <view class="project-files-tree-card" :style="upThemeCardStyle">
        <view class="project-files-card__head">
          <view class="project-files-card__copy">
            <text class="project-files-card__title">文件</text>
            <text class="project-files-card__subtitle">{{ visibleNodes.length }} 项</text>
          </view>
          <view class="project-files-card__actions">
            <view class="project-files-icon-btn" @click="loadTree">
              <up-icon name="reload" size="16" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
            </view>
            <view class="project-files-icon-btn" @click="openCreate('file')">
              <up-icon name="plus-circle" size="16" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
            </view>
            <view class="project-files-icon-btn" @click="openCreate('directory')">
              <up-icon name="folder" size="16" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
            </view>
          </view>
        </view>

        <view v-if="loading" class="project-files-state">
          <u-loading-icon
            mode="circle"
            size="24"
            :color="upThemeVar('--up-primary', '#2979ff')"
          ></u-loading-icon>
          <text>正在读取文件...</text>
        </view>

        <view v-else-if="errorMessage" class="project-files-state project-files-state--error">
          <text class="project-files-state__title">加载失败</text>
          <text>{{ errorMessage }}</text>
          <view class="project-files-action" @click="loadTree">
            <text>重试</text>
          </view>
        </view>

        <view v-else-if="visibleNodes.length === 0" class="project-files-state">
          <text>暂无文件。</text>
        </view>

        <scroll-view v-else scroll-y class="project-files-tree">
          <up-tree
            :data="treeNodes"
            :props="treeProps"
            node-key="id"
            highlight-current
            :current-node-key="selectedFile?.path || ''"
            :default-expanded-keys="expandedPaths"
            :indent="30"
            :expand-on-click-node="true"
            @node-click="handleTreeNodeClick"
            @node-expand="handleTreeNodeExpand"
            @node-collapse="handleTreeNodeCollapse"
          >
            <template #default="{ data }">
              <view
                class="project-files-tree-node"
                :class="{
                  'project-files-tree-node--placeholder': data.isPlaceholder,
                }"
              >
                <up-icon
                  v-if="!data.isPlaceholder"
                  :name="data.kind === 'directory' ? 'folder' : 'file-text'"
                  size="15"
                  :color="data.kind === 'directory' ? upThemeVar('--up-warning', '#f9ae3d') : upThemeVar('--up-primary', '#2979ff')"
                ></up-icon>
                <u-loading-icon
                  v-else-if="isFolderLoading(data.parentPath)"
                  mode="circle"
                  size="14"
                  :color="upThemeVar('--up-primary', '#2979ff')"
                ></u-loading-icon>
                <text class="project-files-tree-node__name">{{ data.label }}</text>
                <text
                  v-if="!data.isPlaceholder && isFolderLoading(data.path)"
                  class="project-files-tree-node__meta"
                >加载中</text>
                <text
                  v-else-if="!data.isPlaceholder && isLoadedEmptyFolder(data)"
                  class="project-files-tree-node__meta"
                >空</text>
              </view>
            </template>
          </up-tree>
        </scroll-view>
      </view>

      <view class="project-files-preview-card" :style="upThemeCardStyle">
        <view class="project-files-card__head">
          <view class="project-files-card__copy">
            <text class="project-files-card__title">{{ selectedFile?.name || "预览" }}</text>
            <text class="project-files-card__subtitle">{{ selectedFile?.path || "选择文件查看内容" }}</text>
          </view>
          <view class="project-files-card__actions">
            <view
              class="project-files-icon-btn"
              :class="{ 'project-files-icon-btn--disabled': !selectedFile }"
              @click="copySelectedPath"
            >
              <up-icon name="order" size="16" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
            </view>
            <view
              class="project-files-icon-btn"
              :class="{ 'project-files-icon-btn--disabled': !preview }"
              @click="copyPreviewContent"
            >
              <up-icon name="file-text" size="16" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
            </view>
          </view>
        </view>

        <view v-if="previewLoading" class="project-files-state">
          <u-loading-icon
            mode="circle"
            size="24"
            :color="upThemeVar('--up-primary', '#2979ff')"
          ></u-loading-icon>
          <text>正在读取内容...</text>
        </view>

        <view v-else-if="previewError" class="project-files-state project-files-state--error">
          <text class="project-files-state__title">读取失败</text>
          <text>{{ previewError }}</text>
        </view>

        <scroll-view v-else-if="preview" scroll-y class="project-files-preview">
          <text class="project-files-preview__code">{{ preview.content }}</text>
        </scroll-view>

        <view v-else class="project-files-state">
          <text>未选择文件。</text>
        </view>
      </view>
    </view>

    <up-popup :show="showCreatePopup" mode="center" :round="24" @close="showCreatePopup = false">
      <view class="project-files-popup" :style="upThemeCardStyle">
        <text class="project-files-popup__title">
          {{ createKind === "directory" ? "新建文件夹" : "新建文件" }}
        </text>
        <text class="project-files-popup__path">{{ createParentPath || "项目根目录" }}</text>
        <view class="project-files-kind-toggle">
          <view
            class="project-files-kind-toggle__item"
            :class="{ 'project-files-kind-toggle__item--active': createKind === 'file' }"
            @click="createKind = 'file'"
          >
            <text>文件</text>
          </view>
          <view
            class="project-files-kind-toggle__item"
            :class="{ 'project-files-kind-toggle__item--active': createKind === 'directory' }"
            @click="createKind = 'directory'"
          >
            <text>文件夹</text>
          </view>
        </view>
        <up-input v-model="createName" placeholder="名称"></up-input>
        <view class="project-files-popup__actions">
          <up-button type="primary" block :loading="creating" @click="submitCreate">创建</up-button>
        </view>
      </view>
    </up-popup>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch } from "vue"
import ProjectUnsupportedState from "./ProjectUnsupportedState.vue"
import {
  createRemoteProjectFileEntry,
  getRemoteProjectFileChildren,
  getRemoteProjectFileTree,
  readRemoteProjectFilePreview,
  type ProjectFileKind,
  type ProjectFileNode,
  type ProjectFilePreview,
} from "@/services/projectFiles"
import type { CodegGateway } from "@/services/gateway"

const props = defineProps<{
  gateway: CodegGateway | null
  projectPath: string
  unsupportedText?: string
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (name: string, fallback: string) =>
  currentInstance?.proxy?.upThemeVar?.(name, fallback) ?? `var(${name}, ${fallback})`

const loading = ref(false)
const previewLoading = ref(false)
const creating = ref(false)
const errorMessage = ref("")
const previewError = ref("")
const nodes = ref<ProjectFileNode[]>([])
const selectedFile = ref<ProjectFileNode | null>(null)
const preview = ref<ProjectFilePreview | null>(null)
const showCreatePopup = ref(false)
const createName = ref("")
const createKind = ref<ProjectFileKind>("file")
const createParentPath = ref("")
const expandedPaths = ref<string[]>([])
const loadedFolderPaths = ref<string[]>([])
const loadingFolderPaths = ref<string[]>([])
const treeProps = {
  label: "label",
  children: "children",
  nodeKey: "id",
  disabled: "disabled",
}

const visibleNodes = computed(() => flattenVisibleFileNodes(nodes.value))
const treeNodes = computed(() => buildTreeNodes(nodes.value))

watch(
  () => [props.gateway, props.projectPath, props.unsupportedText || ""],
  () => {
    void loadTree()
  },
  { immediate: true }
)

async function loadTree() {
  if (!props.gateway || !props.projectPath || props.unsupportedText) {
    nodes.value = []
    selectedFile.value = null
    preview.value = null
    return
  }
  loading.value = true
  errorMessage.value = ""
  try {
    nodes.value = await getRemoteProjectFileTree(props.gateway, props.projectPath, 2)
    expandedPaths.value = []
    loadedFolderPaths.value = []
    loadingFolderPaths.value = []
  } catch (error) {
    errorMessage.value = toErrorMessage(error, "读取文件树失败")
    nodes.value = []
  } finally {
    loading.value = false
  }
}

function handleTreeNodeClick(node: ProjectFileTreeNode) {
  if (node.isPlaceholder) return
  if (node.kind === "directory") {
    selectedFile.value = toProjectFileNode(node)
    preview.value = null
    previewError.value = ""
    return
  }
  void openFile(toProjectFileNode(node))
}

function handleTreeNodeExpand(node: ProjectFileTreeNode) {
  if (node.isPlaceholder || node.kind !== "directory") return
  selectedFile.value = toProjectFileNode(node)
  preview.value = null
  previewError.value = ""
  expandedPaths.value = Array.from(new Set([...expandedPaths.value, node.path]))
  if (loadedFolderPaths.value.includes(node.path) || loadingFolderPaths.value.includes(node.path)) {
    return
  }
  void loadFolderChildren(toProjectFileNode(node))
}

function handleTreeNodeCollapse(node: ProjectFileTreeNode) {
  if (node.isPlaceholder) return
  if (node.kind === "directory") {
    selectedFile.value = toProjectFileNode(node)
    preview.value = null
    previewError.value = ""
  }
  expandedPaths.value = expandedPaths.value.filter((path) => path !== node.path)
}

async function loadFolderChildren(node: ProjectFileNode) {
  if (!props.gateway || !props.projectPath) return
  loadingFolderPaths.value = [...loadingFolderPaths.value, node.path]
  try {
    const children = await getRemoteProjectFileChildren(
      props.gateway,
      props.projectPath,
      node.path,
      node.depth + 1
    )
    nodes.value = replaceNodeChildren(nodes.value, node.path, children)
    loadedFolderPaths.value = Array.from(new Set([...loadedFolderPaths.value, node.path]))
  } catch (error) {
    uni.showToast({ title: toErrorMessage(error, "读取文件夹失败"), icon: "none" })
    expandedPaths.value = expandedPaths.value.filter((path) => path !== node.path)
  } finally {
    loadingFolderPaths.value = loadingFolderPaths.value.filter((path) => path !== node.path)
  }
}

async function openFile(node: ProjectFileNode) {
  if (node.kind !== "file" || !props.gateway) return
  selectedFile.value = node
  preview.value = null
  previewError.value = ""
  previewLoading.value = true
  try {
    preview.value = await readRemoteProjectFilePreview(props.gateway, props.projectPath, node.path)
  } catch (error) {
    previewError.value = toErrorMessage(error, "读取文件失败")
  } finally {
    previewLoading.value = false
  }
}

function openCreate(kind: ProjectFileKind) {
  createKind.value = kind
  createName.value = ""
  createParentPath.value = selectedFile.value
    ? selectedFile.value.kind === "directory"
      ? selectedFile.value.path
      : getParentPath(selectedFile.value.path)
    : ""
  showCreatePopup.value = true
}

async function submitCreate() {
  if (!props.gateway || !createName.value.trim() || creating.value) return
  creating.value = true
  try {
    await createRemoteProjectFileEntry(
      props.gateway,
      props.projectPath,
      createParentPath.value,
      createName.value.trim(),
      createKind.value
    )
    showCreatePopup.value = false
    createName.value = ""
    await refreshAfterCreate()
  } catch (error) {
    uni.showToast({ title: toErrorMessage(error, "创建失败"), icon: "none" })
  } finally {
    creating.value = false
  }
}

function copySelectedPath() {
  if (!selectedFile.value) return
  copyText(selectedFile.value.path)
}

function copyPreviewContent() {
  if (!preview.value) return
  copyText(preview.value.content)
}

function copyText(text: string) {
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: "已复制", icon: "success" }),
    fail: () => uni.showToast({ title: "复制失败", icon: "none" }),
  })
}

async function refreshAfterCreate() {
  const parentPath = createParentPath.value
  if (!parentPath) {
    await loadTree()
    return
  }
  const parentNode = findNode(nodes.value, parentPath)
  if (!parentNode || !loadedFolderPaths.value.includes(parentPath)) {
    await loadTree()
    return
  }
  await loadFolderChildren({ ...parentNode, children: [] })
}

function flattenVisibleFileNodes(list: ProjectFileNode[]) {
  const result: ProjectFileNode[] = []
  const visit = (items: ProjectFileNode[]) => {
    for (const item of items) {
      result.push(item)
      if (item.kind === "directory" && isFolderExpanded(item.path) && item.children.length > 0) {
        visit(item.children)
      }
    }
  }
  visit(list)
  return result
}

type ProjectFileTreeNode = Omit<ProjectFileNode, "kind" | "children"> & {
  kind: ProjectFileKind | "placeholder"
  label: string
  children: ProjectFileTreeNode[]
  disabled?: boolean
  expanded?: boolean
  isPlaceholder?: boolean
  parentPath?: string
}

function buildTreeNodes(list: ProjectFileNode[]): ProjectFileTreeNode[] {
  return list.map((node) => {
    const children = buildTreeNodes(node.children)
    const needsLazyPlaceholder =
      node.kind === "directory" &&
      !loadedFolderPaths.value.includes(node.path) &&
      children.length === 0
    return {
      ...node,
      label: node.name,
      expanded: isFolderExpanded(node.path),
      children: needsLazyPlaceholder ? [createLazyPlaceholderNode(node)] : children,
    }
  })
}

function createLazyPlaceholderNode(parent: ProjectFileNode): ProjectFileTreeNode {
  return {
    id: `${parent.path}::__lazy`,
    name: isFolderLoading(parent.path) ? "正在加载..." : "点击加载",
    label: isFolderLoading(parent.path) ? "正在加载..." : "点击加载",
    path: `${parent.path}::__lazy`,
    kind: "placeholder",
    depth: parent.depth + 1,
    children: [],
    disabled: true,
    isPlaceholder: true,
    parentPath: parent.path,
  }
}

function toProjectFileNode(node: ProjectFileTreeNode): ProjectFileNode {
  return {
    id: node.id,
    name: node.name,
    path: node.path,
    kind: node.kind === "directory" ? "directory" : "file",
    depth: node.depth,
    children: [],
  }
}

function replaceNodeChildren(
  list: ProjectFileNode[],
  path: string,
  children: ProjectFileNode[]
): ProjectFileNode[] {
  return list.map((item) => {
    if (item.path === path) return { ...item, children }
    if (item.children.length === 0) return item
    return { ...item, children: replaceNodeChildren(item.children, path, children) }
  })
}

function findNode(list: ProjectFileNode[], path: string): ProjectFileNode | null {
  for (const item of list) {
    if (item.path === path) return item
    const child = findNode(item.children, path)
    if (child) return child
  }
  return null
}

function isFolderExpanded(path: string) {
  return expandedPaths.value.includes(path)
}

function isFolderLoading(path: string) {
  return loadingFolderPaths.value.includes(path)
}

function isLoadedEmptyFolder(node: ProjectFileNode | ProjectFileTreeNode) {
  return (
    node.kind === "directory" &&
    loadedFolderPaths.value.includes(node.path) &&
    node.children.length === 0
  )
}

function getParentPath(path: string) {
  const normalized = String(path || "").replace(/\\/g, "/")
  const index = normalized.lastIndexOf("/")
  return index > 0 ? normalized.slice(0, index) : ""
}

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (typeof error === "string" && error.trim()) return error.trim()
  return fallback
}

defineExpose({ reload: loadTree })
</script>

<style scoped lang="scss">
.project-files-panel,
.project-files-layout {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.project-files-tree-card,
.project-files-preview-card,
.project-files-popup {
  border-radius: 24rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.project-files-tree-card,
.project-files-preview-card {
  padding: 24rpx;
}

.project-files-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 20rpx;
}

.project-files-card__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.project-files-card__title,
.project-files-state__title,
.project-files-popup__title {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.project-files-card__subtitle,
.project-files-state,
.project-files-popup__path {
  font-size: 24rpx;
  line-height: 1.5;
  color: var(--up-content-color, #606266);
}

.project-files-card__subtitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-files-card__actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.project-files-icon-btn {
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.project-files-icon-btn--disabled {
  opacity: 0.42;
}

.project-files-state {
  min-height: 180rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14rpx;
  text-align: center;
}

.project-files-state--error {
  align-items: stretch;
}

.project-files-action {
  align-self: center;
  padding: 12rpx 24rpx;
  border-radius: 999rpx;
  background: var(--up-primary, #2979ff);
  color: #ffffff;
  font-size: 22rpx;
  font-weight: 700;
}

.project-files-tree {
  max-height: 560rpx;
}

.project-files-tree :deep(.u-tree-node__content) {
  min-height: 64rpx;
  border-radius: 16rpx;
}

.project-files-tree :deep(.u-tree-node--current .u-tree-node__content) {
  background: color-mix(
    in srgb,
    var(--up-primary, #2979ff) 10%,
    var(--up-card-bg-color, #ffffff) 90%
  );
}

.project-files-tree-node {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding-right: 16rpx;
  box-sizing: border-box;
}

.project-files-tree-node--placeholder {
  color: var(--up-tips-color, #909193);
}

.project-files-tree-node__name {
  flex: 1;
  min-width: 0;
  font-size: 24rpx;
  color: var(--up-main-color, #303133);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-files-tree-node--placeholder .project-files-tree-node__name,
.project-files-tree-node__meta {
  flex-shrink: 0;
  font-size: 20rpx;
  color: var(--up-tips-color, #909193);
}

.project-files-preview {
  min-height: 420rpx;
  max-height: 640rpx;
  padding: 20rpx;
  border-radius: 16rpx;
  background: #0f172a;
  box-sizing: border-box;
}

.project-files-preview__code {
  display: block;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 22rpx;
  line-height: 1.6;
  color: #dbeafe;
  white-space: pre-wrap;
  word-break: break-all;
}

.project-files-popup {
  width: 640rpx;
  max-width: calc(100vw - 48rpx);
  padding: 28rpx;
}

.project-files-popup__title,
.project-files-popup__path {
  display: block;
}

.project-files-popup__path {
  margin: 8rpx 0 18rpx;
  word-break: break-all;
}

.project-files-kind-toggle {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10rpx;
  margin-bottom: 18rpx;
  padding: 6rpx;
  border-radius: 18rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.project-files-kind-toggle__item {
  min-height: 58rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14rpx;
  font-size: 24rpx;
  font-weight: 700;
  color: var(--up-content-color, #606266);
}

.project-files-kind-toggle__item--active {
  background: var(--up-card-bg-color, #ffffff);
  color: var(--up-primary, #2979ff);
}

.project-files-popup__actions {
  margin-top: 20rpx;
}
</style>
