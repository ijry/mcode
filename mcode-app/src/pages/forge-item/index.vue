<template>
  <view class="page forge-item-page" :style="[upThemeVars, upThemePageStyle]">
    <view class="forge-item-shell">
      <ProjectUnsupportedState
        v-if="unsupportedText"
        title="仓库面板不可用"
        :text="unsupportedText"
        icon="info-circle"
        actionText="返回"
        @action="goBack"
      />

      <view v-else-if="loading && !row" class="forge-inline-loading">
        <up-loading-icon
          mode="circle"
          size="28"
          :color="upThemeVar('--up-primary', '#2979ff')"
        ></up-loading-icon>
        <text class="forge-inline-loading__text">正在读取...</text>
      </view>

      <ProjectUnsupportedState
        v-else-if="!row"
        title="读取失败"
        :text="errorText || '没有找到这个条目，它可能已经被删除。'"
        icon="info-circle"
        actionText="重试"
        @action="reload"
      />

      <template v-else>
        <!-- 头部：状态词 + 标题 + 元信息 + 全部标签（列表行只显示前两个）。 -->
        <view class="forge-card forge-item-header">
          <view class="forge-item-header__state">
            <ForgeStateChip :row="row" :showLabel="true" :size="18" />
            <text class="forge-item-header__number">#{{ row.number }}</text>
          </view>
          <text class="forge-item-header__title">{{ row.title }}</text>
          <text class="forge-muted">{{ metaText }}</text>
          <view v-if="row.labels.length > 0" class="forge-item-header__labels">
            <ForgeLabelChip v-for="label in row.labels" :key="label.name" :label="label" />
          </view>
        </view>

        <!-- PR 才有三个分区。issue 只有对话 —— 给它画两个空 tab 是把「这里没有内容」
             伪装成「你还没看」。 -->
        <view v-if="tabs.length > 1" class="forge-item-tabs">
          <u-subsection
            :list="tabLabels"
            :current="activeTabIndex"
            :activeColor="upThemeVar('--up-primary', '#2979ff')"
            @change="handleTabChange"
          ></u-subsection>
        </view>

        <!-- `v-if=mounted` + `v-show=active`：只用 v-if 会在切 tab 时丢掉已加载的评论页
             （用户往回一切，刚发的评论没了）；全挂 v-show 会给只想看讨论的人预先花掉
             另外两次请求。 -->
        <view v-if="mounted.has('conversation')" v-show="activeTab === 'conversation'">
          <ForgeConversationPane
            :row="row"
            :comments="comments"
            :commentCount="row.comments"
            :loading="commentsLoading"
            :loadingMore="commentsLoadingMore"
            :hasNext="commentsHasNext"
            :errorText="commentsError"
            :now="now"
            @refresh="reloadComments"
            @loadMore="loadMoreComments"
            @openComment="openExternal"
          />
        </view>

        <view v-if="mounted.has('checks')" v-show="activeTab === 'checks'">
          <ForgeChecksPane
            :detail="changeDetail"
            :loading="detailLoading"
            :errorText="detailError"
            @refresh="reloadChangeDetail"
            @openCheck="openExternal"
          />
        </view>

        <view v-if="mounted.has('files')" v-show="activeTab === 'files'">
          <ForgeFilesPane
            :files="changedFiles"
            :loading="filesLoading"
            :loadingMore="filesLoadingMore"
            :hasNext="filesHasNext"
            :errorText="filesError"
            @refresh="reloadChangeFiles"
            @loadMore="loadMoreChangeFiles"
          />
        </view>

        <view class="forge-item-safe-bottom"></view>
      </template>
    </view>

    <!-- 底部固定条：发评论 + 状态动作。放在最下面是因为它们是「看完之后做什么」。 -->
    <view v-if="row" class="forge-item-footer" :style="upThemeCardStyle">
      <ForgeCommentComposer
        ref="composerRef"
        :identity="identity"
        :submitting="posting"
        :errorText="postError"
        @submit="submitComment"
      />
      <view class="forge-item-footer__actions">
        <view class="forge-item-footer__action" @click="openExternal(row.html_url)">
          <text>在浏览器中打开</text>
        </view>
        <view
          v-if="stateAction"
          class="forge-item-footer__action"
          :class="{ 'forge-item-footer__action--busy': stateChanging }"
          @click="confirmStateChange"
        >
          <text>{{ stateChanging ? "处理中..." : stateActionLabel }}</text>
        </view>
        <!-- 合并只在 PR 且还开着时出现。已合并 / 已关闭的没有这颗按钮。 -->
        <view
          v-if="canMerge"
          class="forge-item-footer__action forge-item-footer__action--primary"
          @click="openMergeSheet"
        >
          <text>合并</text>
        </view>
      </view>
    </view>

    <ForgeMergeSheet
      v-model:show="showMergeSheet"
      :detail="changeDetail"
      :options="mergeOptions"
      :headSha="capturedHeadSha"
      :submitting="merging"
      :optionsLoading="mergeOptionsLoading"
      :errorText="mergeError"
      @confirm="confirmMerge"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref } from "vue"
import { onLoad, onPullDownRefresh, onReachBottom, onUnload } from "@dcloudio/uni-app"
import ForgeConversationPane from "./components/ForgeConversationPane.vue"
import ForgeCommentComposer from "./components/ForgeCommentComposer.vue"
import ForgeChecksPane from "./components/ForgeChecksPane.vue"
import ForgeFilesPane from "./components/ForgeFilesPane.vue"
import ForgeMergeSheet from "./components/ForgeMergeSheet.vue"
import ForgeStateChip from "@/pages/forge/components/ForgeStateChip.vue"
import ForgeLabelChip from "@/pages/forge/components/ForgeLabelChip.vue"
import ProjectUnsupportedState from "@/pages/project-detail/components/ProjectUnsupportedState.vue"
import { openConnectionGateway } from "@/services/connection/connectionAccess"
import {
  buildConnectionKey,
  decodeConnectionContext,
  findStoredConnectionById,
  type ConnectionContext,
} from "@/services/connectionContext"
import { openGuardedExternalUrl } from "@/services/externalLinkGuard"
import {
  createForgeComment,
  fetchForgeChangeDetail,
  fetchForgeIdentity,
  fetchForgeMergeOptions,
  listForgeChangeFiles,
  listForgeComments,
  listForgeIssues,
  mergeForgeChange,
  setForgeItemState,
} from "@/services/forge/forgeApi"
import { classifyForgeError } from "@/services/forge/forgeErrors"
import {
  forgeUnsupportedText,
  isForgeCapableConnection,
  parseForgeItemRouteOptions,
} from "@/services/forge/forgeRoute"
import {
  mergeForgeRowUpdate,
  publishForgeRowUpdate,
  takeForgeSeed,
} from "@/services/forge/forgeRowInbox"
import { rowMetaText } from "@/pages/forge/forgeRowPresentation"
import {
  appendForgeComments,
  appendPostedForgeComment,
  forgeCommentFailureText,
  forgeDetailTabLabel,
  forgeDetailTabsFor,
  forgeStateActionFor,
  forgeStateActionLabel,
  forgeStateConfirmText,
  type ForgeDetailTab,
} from "./forgeItemPresentation"
import { FORGE_DEFAULT_COMMENT_PER_PAGE, FORGE_DEFAULT_FILES_PER_PAGE } from "@/types/forge"
import { forgeMergeConfirmText } from "./forgeChangePresentation"
import type { CodegGateway } from "@/services/gateway"
import type {
  ForgeChangeDetail,
  ForgeChangedFile,
  ForgeComment,
  ForgeIdentity,
  ForgeIssueRow,
  ForgeItemKind,
  ForgeMergeMethod,
  ForgeMergeOptions,
} from "@/types/forge"

/**
 * 条目详情页（issue 或 PR）。
 *
 * 桌面端这里是一个**非模态右侧抽屉**，与列表页共享 React state。手机端屏幕太窄装不下
 * 双栏，所以它是一个独立页面 —— 代价是列表 ↔ 详情之间的双向数据线断了，补法是
 * `services/forge/forgeRowInbox`：
 *
 * - **下行**：列表页在 navigateTo 之前放下这一行当 seed（首屏不用等请求，且 issue body
 *   上限 16000 字符，塞进 URL 会超长）；
 * - **上行**：关闭 / 重开拿到的**权威行**交回信箱，列表在 onShow 排空并原地替换 ——
 *   而**不是**让列表重拉（GitHub 的列表来自 search 索引，落后写入几秒到几分钟，重拉
 *   会把刚改完的状态盖回旧值）。
 *
 * 三个分区用 `v-if=mounted` + `v-show=active`（见模板注释）。M4 只实现对话分区。
 */

const currentInstance = getCurrentInstance()
const upThemeVars = computed(() => currentInstance?.proxy?.upThemeVars || {})
const upThemePageStyle = computed(() => currentInstance?.proxy?.upThemePageStyle || {})
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

const route = ref({ connectionKey: "", folderId: 0, kind: "issue" as ForgeItemKind, number: 0 })
const connection = ref<ConnectionContext | null>(null)
const gateway = ref<CodegGateway | null>(null)
const row = ref<ForgeIssueRow | null>(null)
const identity = ref<ForgeIdentity | null>(null)
const comments = ref<ForgeComment[]>([])
const changeDetail = ref<ForgeChangeDetail | null>(null)
const changedFiles = ref<ForgeChangedFile[]>([])
const mergeOptions = ref<ForgeMergeOptions | null>(null)

const loading = ref(false)
const errorText = ref("")
const commentsLoading = ref(false)
const commentsLoadingMore = ref(false)
const commentsHasNext = ref(false)
const commentsError = ref("")
const commentsPage = ref(0)
const posting = ref(false)
const postError = ref("")
const stateChanging = ref(false)

const detailLoading = ref(false)
const detailError = ref("")
const filesLoading = ref(false)
const filesLoadingMore = ref(false)
const filesHasNext = ref(false)
const filesError = ref("")
const filesPage = ref(0)

const showMergeSheet = ref(false)
const merging = ref(false)
const mergeError = ref("")
const mergeOptionsLoading = ref(false)
/**
 * 打开合并弹层那一刻的 head sha。
 *
 * **必须捕获而不是在确认时重读**：面板是拿着一份 diff、一份文件表和一组检查项（都在
 * 描述同一个提交）做的决定。弹层开着时如果详情被刷新过，确认仍按旧 sha 走 —— forge
 * 会以 409 拒绝，而那是正确的：分支动了，用户看过的东西已经不是要合并的东西。
 */
const capturedHeadSha = ref<string | null>(null)

const now = ref(Date.now())

const activeTab = ref<ForgeDetailTab>("conversation")
/** 访问过的分区永久留在树上（见模板注释）。 */
const mounted = ref(new Set<ForgeDetailTab>(["conversation"]))

const composerRef = ref<{ reset: () => void } | null>(null)

/** 两条独立代际：条目本身与评论线程由不同动作触发，共用一个会互相取消。 */
let rowSeq = 0
let commentsSeq = 0
/** 检查项与文件各有自己的代际 —— 三个分区的刷新按钮互不相干。 */
let detailSeq = 0
let filesSeq = 0
let nowTimer: ReturnType<typeof setInterval> | null = null

const unsupportedText = computed(() => {
  if (!connection.value) return ""
  return forgeUnsupportedText(connection.value)
})

const tabs = computed(() => forgeDetailTabsFor(route.value.kind))
const tabLabels = computed(() => tabs.value.map(forgeDetailTabLabel))
const activeTabIndex = computed(() => {
  const index = tabs.value.indexOf(activeTab.value)
  return index >= 0 ? index : 0
})

const metaText = computed(() => (row.value ? rowMetaText(row.value, now.value) : ""))
const stateAction = computed(() => (row.value ? forgeStateActionFor(row.value) : null))
const stateActionLabel = computed(() =>
  stateAction.value ? forgeStateActionLabel(stateAction.value) : ""
)

/**
 * 合并按钮出不出。
 *
 * 只对**还开着的 PR**出。已合并 / 已关闭的没有 —— 给一颗必然失败的按钮比不给更糟。
 * 草稿仍然出（弹层里会说明它被草稿状态挡着），因为那是用户能去远端解决的一件事。
 */
const canMerge = computed(
  () => route.value.kind === "pr" && row.value?.state === "open"
)

onLoad((options) => {
  const parsed = parseForgeItemRouteOptions(options)
  const resolved =
    findStoredConnectionById(parsed.connectionId) || decodeConnectionContext(parsed.connection)
  connection.value = resolved
  route.value = {
    connectionKey: resolved ? buildConnectionKey(resolved) : "",
    folderId: parsed.folderId,
    kind: parsed.kind,
    number: parsed.number,
  }
  // seed 让首屏立刻有内容 —— 取完即删，一个留着的 seed 会在下次冷启动直达时被当成
  // 那一条的内容显示出来。
  row.value = takeForgeSeed(
    route.value.connectionKey,
    route.value.folderId,
    route.value.kind,
    route.value.number
  )
  void reload()
  nowTimer = setInterval(() => {
    now.value = Date.now()
  }, 60_000)
})

onPullDownRefresh(() => {
  void reload().finally(() => {
    uni.stopPullDownRefresh()
  })
})

onReachBottom(() => {
  // 按当前分区派发 —— 三个分区各有自己的分页，全都触发会一次花掉三次请求。
  if (activeTab.value === "conversation") void loadMoreComments()
  else if (activeTab.value === "files") void loadMoreChangeFiles()
})

onUnload(() => {
  if (nowTimer) {
    clearInterval(nowTimer)
    nowTimer = null
  }
})

/* ===== 加载 ===== */

async function reload() {
  const target = connection.value
  if (!target || !isForgeCapableConnection(target)) return
  if (route.value.folderId <= 0 || route.value.number <= 0) {
    errorText.value = "缺少条目坐标，请返回列表重新进入。"
    return
  }
  const seq = ++rowSeq
  loading.value = true
  errorText.value = ""
  try {
    const resolvedGateway = await openConnectionGateway(target)
    gateway.value = resolvedGateway
    // 连接键要在 openConnectionGateway 之后重算（它会就地补 id / baseUrl）—— 写回
    // 信箱按连接键分格，用旧键会把写回投进一个没人读的格子。
    route.value.connectionKey = buildConnectionKey(target)

    // 没有 seed 时才去拉行本身（冷启动直达）。有 seed 就省下这一次 —— 它来自列表
    // 响应，与详情要显示的东西完全一样。
    if (!row.value) {
      const fetched = await fetchRow(resolvedGateway)
      if (seq !== rowSeq) return
      if (!fetched) {
        errorText.value = "没有找到这个条目，它可能已经被删除或不在当前筛选范围内。"
        return
      }
      row.value = fetched
    }
    // 身份是本地解析（不花 forge 请求），失败静默 —— 评论框少一行署名而已。
    void loadIdentity(resolvedGateway)
    await reloadComments()
  } catch (error) {
    if (seq !== rowSeq) return
    errorText.value = classifyForgeError(error).message
  } finally {
    if (seq === rowSeq) loading.value = false
  }
}

/**
 * 冷启动直达时拉这一行。
 *
 * 后端**没有**单条目的读取命令（issue 的正文随列表行白送，这是设计如此），所以只能
 * 用一次窄查询：`state: "all"` 是必须的 —— 用户可能从通知直达一个已关闭的条目，
 * 默认的 open 筛选会让它「不存在」。
 */
async function fetchRow(activeGateway: CodegGateway): Promise<ForgeIssueRow | null> {
  const list = await listForgeIssues(activeGateway, route.value.folderId, {
    tab: route.value.kind === "pr" ? "prs" : "issues",
    state: "all",
    assignedMe: false,
    labels: [],
    search: null,
    sort: "newest",
    page: 1,
    perPage: 100,
    accountId: null,
  })
  return list.rows.find((item) => item.number === route.value.number) || null
}

async function loadIdentity(activeGateway: CodegGateway) {
  try {
    identity.value = await fetchForgeIdentity(activeGateway, route.value.folderId)
  } catch (error) {
    console.warn("forge identity failed:", error)
  }
}

async function reloadComments() {
  const activeGateway = gateway.value
  if (!activeGateway) return
  const seq = ++commentsSeq
  commentsLoading.value = true
  commentsError.value = ""
  try {
    const list = await listForgeComments(activeGateway, route.value.folderId, {
      kind: route.value.kind,
      number: route.value.number,
      page: 1,
      perPage: FORGE_DEFAULT_COMMENT_PER_PAGE,
      accountId: null,
    })
    if (seq !== commentsSeq) return
    comments.value = list.comments
    commentsPage.value = list.page
    commentsHasNext.value = list.has_next
  } catch (error) {
    if (seq !== commentsSeq) return
    commentsError.value = classifyForgeError(error).message
  } finally {
    if (seq === commentsSeq) commentsLoading.value = false
  }
}

async function loadMoreComments() {
  const activeGateway = gateway.value
  if (!activeGateway) return
  if (!commentsHasNext.value || commentsLoading.value || commentsLoadingMore.value) return
  const seq = ++commentsSeq
  commentsLoadingMore.value = true
  try {
    const list = await listForgeComments(activeGateway, route.value.folderId, {
      kind: route.value.kind,
      number: route.value.number,
      page: commentsPage.value + 1,
      perPage: FORGE_DEFAULT_COMMENT_PER_PAGE,
      accountId: null,
    })
    if (seq !== commentsSeq) return
    // 按 id 去重：两次请求之间可能有人发了新评论，把上一页的末条挤下来。
    comments.value = appendForgeComments(comments.value, list.comments)
    commentsPage.value = list.page
    commentsHasNext.value = list.has_next
  } catch (error) {
    if (seq !== commentsSeq) return
    commentsError.value = classifyForgeError(error).message
  } finally {
    if (seq === commentsSeq) commentsLoadingMore.value = false
  }
}

/* ===== 变更（只有 PR） ===== */

/**
 * 变更详情：分支对、规模、可合并性、CI。
 *
 * 只在**检查项分区第一次被挂载**或用户按刷新时拉 —— 一页列表三十行，每行都问一次
 * 是三十次请求换用户不会读的信息。
 */
async function reloadChangeDetail() {
  const activeGateway = gateway.value
  if (!activeGateway || route.value.kind !== "pr") return
  const seq = ++detailSeq
  detailLoading.value = true
  detailError.value = ""
  try {
    const detail = await fetchForgeChangeDetail(activeGateway, route.value.folderId, {
      number: route.value.number,
      accountId: null,
    })
    if (seq !== detailSeq) return
    changeDetail.value = detail
    if (!detail) detailError.value = "服务端没有返回这个变更的信息。"
  } catch (error) {
    if (seq !== detailSeq) return
    detailError.value = classifyForgeError(error).message
  } finally {
    if (seq === detailSeq) detailLoading.value = false
  }
}

async function reloadChangeFiles() {
  const activeGateway = gateway.value
  if (!activeGateway || route.value.kind !== "pr") return
  const seq = ++filesSeq
  filesLoading.value = true
  filesError.value = ""
  try {
    const list = await listForgeChangeFiles(activeGateway, route.value.folderId, {
      number: route.value.number,
      page: 1,
      perPage: FORGE_DEFAULT_FILES_PER_PAGE,
      accountId: null,
    })
    if (seq !== filesSeq) return
    changedFiles.value = list.files
    filesPage.value = list.page
    filesHasNext.value = list.has_next
  } catch (error) {
    if (seq !== filesSeq) return
    filesError.value = classifyForgeError(error).message
  } finally {
    if (seq === filesSeq) filesLoading.value = false
  }
}

async function loadMoreChangeFiles() {
  const activeGateway = gateway.value
  if (!activeGateway) return
  if (!filesHasNext.value || filesLoading.value || filesLoadingMore.value) return
  const seq = ++filesSeq
  filesLoadingMore.value = true
  try {
    const list = await listForgeChangeFiles(activeGateway, route.value.folderId, {
      number: route.value.number,
      page: filesPage.value + 1,
      perPage: FORGE_DEFAULT_FILES_PER_PAGE,
      accountId: null,
    })
    if (seq !== filesSeq) return
    // 按路径去重：一个变更里同一个文件只会出现一次，重复只能是分页错位。
    const seen = new Set(changedFiles.value.map((file) => file.path))
    changedFiles.value = [
      ...changedFiles.value,
      ...list.files.filter((file) => !seen.has(file.path)),
    ]
    filesPage.value = list.page
    filesHasNext.value = list.has_next
  } catch (error) {
    if (seq !== filesSeq) return
    filesError.value = classifyForgeError(error).message
  } finally {
    if (seq === filesSeq) filesLoadingMore.value = false
  }
}

/* ===== 写 ===== */
/**
 * 发一条评论。
 *
 * **永不自动重试**：一次 POST 可能已经到达 forge 而只是响应丢了，重试就是发两遍到一个
 * 别人在读的线程里。失败时保留用户写的内容并让他自己确认。
 */
async function submitComment(body: string) {
  const activeGateway = gateway.value
  if (!activeGateway) return
  posting.value = true
  postError.value = ""
  try {
    const posted = await createForgeComment(activeGateway, route.value.folderId, {
      kind: route.value.kind,
      number: route.value.number,
      body,
      accountId: null,
    })
    if (!posted) {
      postError.value = forgeCommentFailureText("服务端没有返回这条评论")
      return
    }
    // 用 forge 返回的那一条（带真实 id / 时间 / 永久链接），而不是本地拼一个乐观条目
    // —— 后者没有 id，会在下一次翻页时和真的那条重复出现。
    comments.value = appendPostedForgeComment(comments.value, posted)
    composerRef.value?.reset()
    // 评论数 +1 并写回列表：那个数字在列表行上，用户返回时要看到它变了。
    if (row.value) {
      const next = { ...row.value, comments: row.value.comments + 1 }
      row.value = next
      publishRow(next)
    }
  } catch (error) {
    postError.value = forgeCommentFailureText(classifyForgeError(error).message)
  } finally {
    posting.value = false
  }
}

function confirmStateChange() {
  const current = row.value
  const action = stateAction.value
  if (!current || !action || stateChanging.value) return
  // 没有表单字段，用系统模态而不是 bottom sheet。文案要说清这会发生在**远端仓库**上，
  // 所有关注者都会看到 —— 手机上误触的代价在这里是一群人的通知。
  const copy = forgeStateConfirmText(action, current.title, route.value.kind)
  uni.showModal({
    title: copy.title,
    content: copy.content,
    confirmText: forgeStateActionLabel(action),
    cancelText: "取消",
    success: (result) => {
      if (result.confirm) void applyStateChange(action)
    },
  })
}

async function applyStateChange(action: "close" | "reopen") {
  const activeGateway = gateway.value
  const current = row.value
  if (!activeGateway || !current) return
  stateChanging.value = true
  try {
    const updated = await setForgeItemState(activeGateway, route.value.folderId, {
      kind: route.value.kind,
      number: route.value.number,
      action,
      accountId: null,
    })
    if (!updated) {
      uni.showToast({ title: "服务端没有返回更新后的条目", icon: "none", duration: 3000 })
      return
    }
    // 返回的行是**权威的**（一个刚在浏览器里被合并的 PR 会以 merged 回来），但要补回
    // 它没带的标签颜色 —— GitLab 单条目响应只给标签名。
    const merged = mergeForgeRowUpdate(current, updated)
    row.value = merged
    publishRow(merged)
    uni.showToast({ title: action === "close" ? "已关闭" : "已重新打开", icon: "success" })
  } catch (error) {
    uni.showToast({
      title: classifyForgeError(error).message,
      icon: "none",
      duration: 3000,
    })
  } finally {
    stateChanging.value = false
  }
}

/** 把权威的那一行交回信箱，列表在 onShow 排空并原地替换（而不是重拉）。 */
function publishRow(next: ForgeIssueRow) {
  if (!route.value.connectionKey || route.value.folderId <= 0) return
  publishForgeRowUpdate(route.value.connectionKey, route.value.folderId, next)
}

/* ===== 合并 ===== */

/**
 * 打开合并弹层。
 *
 * 这一刻做三件事：
 * 1. **捕获 `head_sha`** —— 确认时原样送出，不重读（见 `capturedHeadSha` 的注释）；
 * 2. 按需拉合并方式（仓库级事实，一次就够）；
 * 3. 按需拉详情（用户可能没打开过检查项分区，而弹层要显示可合并性与检查项）。
 */
async function openMergeSheet() {
  mergeError.value = ""
  showMergeSheet.value = true
  if (!changeDetail.value) await reloadChangeDetail()
  // 捕获必须在详情就绪之后 —— 在那之前 head_sha 还不知道。
  capturedHeadSha.value = changeDetail.value?.head_sha || null
  void ensureMergeOptions()
}

/** 合并方式是**仓库**的事实，一次就够 —— 折进 detail 会让每个只为读打开的变更都白花一次。 */
async function ensureMergeOptions() {
  const activeGateway = gateway.value
  if (!activeGateway || mergeOptions.value) return
  mergeOptionsLoading.value = true
  try {
    mergeOptions.value = await fetchForgeMergeOptions(activeGateway, route.value.folderId)
  } catch (error) {
    // 读不到就让弹层退化成只提供「创建合并提交」（与后端的 unknown() 一致），
    // 而不是拦住整个合并 —— forge 仍然会给出准确的答复。
    console.warn("forge merge options failed:", error)
  } finally {
    mergeOptionsLoading.value = false
  }
}

function confirmMerge(method: ForgeMergeMethod) {
  const current = row.value
  const detail = changeDetail.value
  if (!current || merging.value) return
  const copy = forgeMergeConfirmText(current.title, detail?.base_ref || "", method)
  uni.showModal({
    title: copy.title,
    content: copy.content,
    confirmText: "合并",
    cancelText: "取消",
    success: (result) => {
      if (result.confirm) void applyMerge(method)
    },
  })
}

/**
 * 执行合并。
 *
 * **返回 `null` 是成功**（合并成功但回读那一行失败）—— GitHub 的合并响应不包含 PR
 * 本身，所以那一行要花第二次请求而它可以独立失败。报成失败会让人去把一个不可逆的
 * 操作再做一遍。
 */
async function applyMerge(method: ForgeMergeMethod) {
  const activeGateway = gateway.value
  const current = row.value
  if (!activeGateway || !current) return
  merging.value = true
  mergeError.value = ""
  try {
    const updated = await mergeForgeChange(activeGateway, route.value.folderId, {
      number: route.value.number,
      method,
      headSha: capturedHeadSha.value,
      accountId: null,
    })
    // `null` = 合并成功了，只是回读失败。本地置 merged 而不是报错。
    const merged = updated
      ? mergeForgeRowUpdate(current, updated)
      : { ...current, state: "merged" }
    row.value = merged
    publishRow(merged)
    showMergeSheet.value = false
    uni.showToast({ title: "已合并", icon: "success" })
    // 重读详情：合并之后 state / mergeable 都变了，而检查项分区可能还开着。
    void reloadChangeDetail()
  } catch (error) {
    mergeError.value = classifyForgeError(error).message
  } finally {
    merging.value = false
  }
}

/* ===== 交互 ===== */

function handleTabChange(payload: any) {
  const index =
    typeof payload === "number"
      ? payload
      : typeof payload?.index === "number"
        ? payload.index
        : Number(payload)
  const next = tabs.value[index]
  if (!next || next === activeTab.value) return
  const firstVisit = !mounted.value.has(next)
  activeTab.value = next
  // 第一次访问才挂 —— 之后一直留在树上，保住它自己的分页状态。
  if (firstVisit) {
    mounted.value = new Set([...mounted.value, next])
    // 分区的数据也**只在第一次访问时**拉：预先拉会给只想看讨论的人白花两次请求。
    if (next === "checks") void reloadChangeDetail()
    else if (next === "files") void reloadChangeFiles()
  }
}

async function openExternal(url: string) {
  if (!url) return
  await openGuardedExternalUrl(url)
}

function goBack() {
  uni.navigateBack()
}
</script>

<style scoped lang="scss">
@import "@/pages/forge/index.scss";
@import "./index.scss";

.page {
  min-height: 100vh;
}

.forge-item-page {
  background: var(--up-page-bg-color, var(--up-bg-color, #f3f4f6));
}

.forge-item-shell {
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.forge-item-header {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.forge-item-header__state {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.forge-item-header__number {
  font-size: 22rpx;
  color: var(--up-tips-color, #909193);
}

.forge-item-header__title {
  font-size: 34rpx;
  font-weight: 700;
  line-height: 1.35;
  color: var(--up-main-color, #303133);
  word-break: break-word;
}

.forge-item-header__labels {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10rpx;
}

.forge-item-tabs {
  padding: 4rpx 0;
}

/* 底部条不是 fixed：详情页内容很长，一个盖在最后一条评论上的输入框会挡住讨论。
   放在文档流末尾，用户滚到底就是「读完了，该说点什么」。 */
.forge-item-footer {
  padding: 20rpx 24rpx calc(24rpx + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  background: var(--up-card-bg-color, #ffffff);
  border-top: 1rpx solid var(--up-border-color, #dadbde);
}

.forge-item-footer__actions {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.forge-item-footer__action {
  flex: 1;
  padding: 18rpx 0;
  border-radius: 20rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  font-size: 24rpx;
  color: var(--up-content-color, #606266);
  text-align: center;
}

.forge-item-footer__action--busy {
  opacity: 0.6;
}

.forge-item-footer__action--primary {
  background: var(--up-primary, #2979ff);
  color: #ffffff;
  font-weight: 700;
}

.forge-item-safe-bottom {
  height: 12rpx;
}
</style>
