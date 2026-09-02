<template>
  <view class="page forge-accounts-page" :style="[upThemeVars, upThemePageStyle]">
    <view class="forge-accounts-shell">
      <view class="forge-card forge-accounts-header">
        <view class="forge-accounts-header__copy">
          <text class="forge-accounts-header__title">代码托管账号</text>
          <text class="forge-muted">
            仓库面板用这些账号读写 Issue 与 PR。Token 保存在桌面端的凭据存储里，不会留在手机上。
          </text>
        </view>
        <view class="forge-accounts-header__action" @click="openCreateSheet">
          <up-icon name="plus" size="16" color="#ffffff"></up-icon>
        </view>
      </view>

      <ProjectUnsupportedState
        v-if="unsupportedText"
        title="账号管理不可用"
        :text="unsupportedText"
        icon="info-circle"
        actionText="返回"
        @action="goBack"
      />

      <view v-else-if="loading" class="forge-inline-loading">
        <up-loading-icon
          mode="circle"
          size="28"
          :color="upThemeVar('--up-primary', '#2979ff')"
        ></up-loading-icon>
        <text class="forge-inline-loading__text">正在读取账号...</text>
      </view>

      <ProjectUnsupportedState
        v-else-if="errorMessage && accounts.length === 0"
        title="加载失败"
        :text="errorMessage"
        icon="info-circle"
        actionText="重试"
        @action="reload"
      />

      <template v-else>
        <!-- 从「没有账号」跳过来时，直接说清楚要为哪个域名加 —— 用户是因为这个被送来的。 -->
        <view v-if="pendingHost" class="forge-notice forge-notice--info">
          <text class="forge-notice__text">
            仓库面板需要 {{ pendingHost }} 的账号。添加之后返回即可继续。
          </text>
        </view>

        <view v-if="accounts.length === 0" class="forge-empty">
          <up-empty mode="data" text="还没有配置任何账号">
            <template #bottom>
              <up-button
                type="primary"
                size="normal"
                customStyle="margin-top:32rpx"
                @click="openCreateSheet"
              >添加账号</up-button>
            </template>
          </up-empty>
        </view>

        <view v-else class="forge-accounts-list">
          <view
            v-for="account in accounts"
            :key="account.id"
            class="forge-card forge-account-row"
          >
            <view class="forge-account-row__main">
              <image
                v-if="account.avatar_url"
                class="forge-account-row__avatar"
                :src="account.avatar_url"
                mode="aspectFill"
              ></image>
              <view v-else class="forge-account-row__avatar forge-account-row__avatar--text">
                <text>{{ initialOf(account.username) }}</text>
              </view>
              <view class="forge-account-row__copy">
                <view class="forge-account-row__head">
                  <text class="forge-account-row__name">{{ account.username || "未知用户" }}</text>
                  <view v-if="account.is_default" class="forge-account-row__badge">
                    <text>默认</text>
                  </view>
                </view>
                <text class="forge-account-row__host">{{ account.server_url }}</text>
                <text class="forge-muted">
                  {{ providerLabel(account.provider) }} · {{ scopeSummary(account.scopes) }}
                </text>
              </view>
            </view>

            <view class="forge-account-row__actions">
              <view
                v-if="!account.is_default"
                class="forge-account-row__action"
                @click="makeDefault(account.id)"
              >
                <text>设为默认</text>
              </view>
              <view class="forge-account-row__action" @click="openReplaceSheet(account)">
                <text>替换 Token</text>
              </view>
              <view
                class="forge-account-row__action forge-account-row__action--danger"
                @click="confirmRemove(account)"
              >
                <text>删除</text>
              </view>
            </view>
          </view>
        </view>

        <view v-if="errorMessage && accounts.length > 0" class="forge-notice forge-notice--error">
          <text class="forge-notice__text">{{ errorMessage }}</text>
        </view>

        <!-- git 可执行文件设置。放在账号下面是因为它们同属「版本控制设置」这一面
             后端（`commands/version_control.rs`），而用户在这里才会想到它。 -->
        <view class="forge-card forge-accounts-git">
          <text class="forge-section-title">Git 可执行文件</text>
          <text class="forge-muted">
            {{ gitDetectText }}
          </text>
          <view class="forge-accounts-git__row">
            <up-input
              v-model="gitPathInput"
              placeholder="留空使用系统 PATH 里的 git"
              border="surround"
              clearable
            ></up-input>
          </view>
          <view class="forge-accounts-git__action" @click="saveGitPath">
            <text>{{ savingGitPath ? "保存中..." : "保存路径" }}</text>
          </view>
        </view>
      </template>

      <view class="forge-safe-bottom"></view>
    </view>

    <ForgeAccountTokenSheet
      v-model:show="showTokenSheet"
      :accountId="editingId"
      :serverUrl="editingServerUrl"
      :provider="editingProvider"
      :username="editingUsername"
      :submitting="submitting"
      :validation="validation"
      :validating="validating"
      :errorText="sheetError"
      @validate="handleValidate"
      @submit="handleSubmit"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref } from "vue"
import { onLoad, onPullDownRefresh } from "@dcloudio/uni-app"
import ForgeAccountTokenSheet from "./components/ForgeAccountTokenSheet.vue"
import ProjectUnsupportedState from "@/pages/project-detail/components/ProjectUnsupportedState.vue"
import { openConnectionGateway } from "@/services/connection/connectionAccess"
import {
  decodeConnectionContext,
  findStoredConnectionById,
  type ConnectionContext,
} from "@/services/connectionContext"
import { toErrorMessage } from "@/services/gateway/error"
import {
  deleteForgeAccountToken,
  detectGit,
  getGitSettings,
  listForgeAccounts,
  saveForgeAccounts,
  saveForgeAccountToken,
  setGitSettings,
  validateForgeToken,
} from "@/services/forge/forgeAccountApi"
import {
  forgeUnsupportedText,
  isForgeCapableConnection,
  parseForgeAccountsRouteOptions,
} from "@/services/forge/forgeRoute"
import {
  applyDefaultForgeAccount,
  buildForgeAccountId,
  findConflictingAccount,
  forgeProviderLabel,
  forgeScopeSummary,
  forgeServerHost,
  removeForgeAccount,
  type ForgeTokenSubmitPayload,
  type ForgeTokenValidatePayload,
} from "./forgeAccountForm"
import type { CodegGateway } from "@/services/gateway"
import type { GitHubAccount, GitHubTokenValidation } from "@/types/forgeAccount"

/**
 * forge 账号管理页。
 *
 * 形状与 `pages/model-providers/index.vue` 同构：列表 + 增删改 + 校验。它是
 * 「从一个错误态跳过来修一件事然后返回」的目标，所以必须能 `navigateBack`，
 * 而列表页的 `onShow` 会在失败态下自动重拉（见 `pages/forge/index.vue` 文件头）。
 *
 * ## 保存一个账号是两次调用，顺序不能颠倒
 *
 * `update_github_accounts` 写的是账号**元信息**，token 走独立的
 * `save_account_token`。必须**先存 token 再写 accounts**：反过来的话中间失败会留下
 * 一个有身份、没凭据的账号行 —— 而 forge 会挑中它然后以 401 失败，用户看到的是
 * 「token 无效」而不是「保存没成功」。
 *
 * ## 替换 token 必须保留 account.id
 *
 * 每个 forge 触发的任务都把 id 钉在 `source_meta.account_id` 上。删了重加会让那些
 * 任务失去可交付的身份（推分支、建 PR、回写评论全部失败），而且失败发生在几小时后
 * 任务跑完的时候 —— 那时没人会想到是换 token 引起的。
 */

const currentInstance = getCurrentInstance()
const upThemeVars = computed(() => currentInstance?.proxy?.upThemeVars || {})
const upThemePageStyle = computed(() => currentInstance?.proxy?.upThemePageStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

const connection = ref<ConnectionContext | null>(null)
const gateway = ref<CodegGateway | null>(null)
const accounts = ref<GitHubAccount[]>([])
const loading = ref(false)
const errorMessage = ref("")

/** 从错误里带过来的主机名 —— 用户是因为「这个 host 没有账号」被送来的。 */
const pendingHost = ref("")
const pendingProvider = ref<"github" | "gitlab" | "">("")

const showTokenSheet = ref(false)
const editingId = ref("")
const editingServerUrl = ref("")
const editingProvider = ref<"github" | "gitlab" | "">("")
const editingUsername = ref("")
const validation = ref<GitHubTokenValidation | null>(null)
const validating = ref(false)
const submitting = ref(false)
const sheetError = ref("")

const gitPathInput = ref("")
const gitDetect = ref<{ installed: boolean; version: string | null; path: string | null } | null>(
  null
)
const savingGitPath = ref(false)

const unsupportedText = computed(() => {
  if (!connection.value) return ""
  return forgeUnsupportedText(connection.value)
})

const gitDetectText = computed(() => {
  const detect = gitDetect.value
  if (!detect) return "正在检测..."
  if (!detect.installed) return "桌面端没有找到 git，请填写它的完整路径。"
  return `已找到 git ${detect.version || ""}${detect.path ? ` · ${detect.path}` : ""}`.trim()
})

onLoad((options) => {
  const route = parseForgeAccountsRouteOptions(options)
  pendingHost.value = route.serverHost
  pendingProvider.value = route.provider
  connection.value =
    findStoredConnectionById(route.connectionId) || decodeConnectionContext(route.connection)
  void reload()
})

onPullDownRefresh(() => {
  void reload().finally(() => {
    uni.stopPullDownRefresh()
  })
})

async function reload() {
  const target = connection.value
  if (!target) {
    errorMessage.value = "缺少连接信息，请返回重试。"
    return
  }
  if (!isForgeCapableConnection(target)) return
  loading.value = true
  errorMessage.value = ""
  try {
    const resolvedGateway = await openConnectionGateway(target)
    gateway.value = resolvedGateway
    const settings = await listForgeAccounts(resolvedGateway)
    accounts.value = settings.accounts
    // git 设置与检测是附带信息，失败不该拖垮账号列表。
    void loadGitSettings(resolvedGateway)
  } catch (error) {
    errorMessage.value = toErrorMessage(error)
  } finally {
    loading.value = false
  }
}

async function loadGitSettings(activeGateway: CodegGateway) {
  try {
    const [settings, detect] = await Promise.all([
      getGitSettings(activeGateway),
      detectGit(activeGateway),
    ])
    gitPathInput.value = settings.custom_path || ""
    gitDetect.value = detect
  } catch (error) {
    console.warn("load git settings failed:", error)
  }
}

/* ===== 账号增删改 ===== */

function openCreateSheet() {
  editingId.value = ""
  // 预填从错误里带来的主机与 provider —— 让他再手打一遍是把一个已知答案伪装成一道题。
  editingServerUrl.value = pendingHost.value ? `https://${pendingHost.value}` : ""
  editingProvider.value = pendingProvider.value
  editingUsername.value = ""
  validation.value = null
  sheetError.value = ""
  showTokenSheet.value = true
}

function openReplaceSheet(account: GitHubAccount) {
  editingId.value = account.id
  editingServerUrl.value = account.server_url
  editingProvider.value = account.provider || "github"
  editingUsername.value = account.username
  validation.value = null
  sheetError.value = ""
  showTokenSheet.value = true
}

async function handleValidate(payload: ForgeTokenValidatePayload) {
  const activeGateway = gateway.value
  if (!activeGateway) return
  validating.value = true
  sheetError.value = ""
  try {
    validation.value = await validateForgeToken(
      activeGateway,
      payload.provider,
      payload.serverUrl,
      payload.token
    )
    if (!validation.value.success) {
      sheetError.value = validation.value.message || "令牌校验失败。"
    }
  } catch (error) {
    validation.value = null
    sheetError.value = toErrorMessage(error)
  } finally {
    validating.value = false
  }
}

async function handleSubmit(payload: ForgeTokenSubmitPayload) {
  const activeGateway = gateway.value
  if (!activeGateway) return
  submitting.value = true
  sheetError.value = ""
  try {
    // 先校验（如果用户没手动点过「校验」）：账号行里的 username / avatar / scopes
    // 全部来自它，跳过校验就只能存一个空身份，而那个名字会被当成 git 凭据用户名。
    let result = validation.value
    if (!result || !result.success) {
      result = await validateForgeToken(
        activeGateway,
        payload.provider,
        payload.serverUrl,
        payload.token
      )
      validation.value = result
    }
    if (!result.success) {
      sheetError.value = result.message || "令牌校验失败，账号未保存。"
      return
    }

    const isReplacing = Boolean(editingId.value)
    if (!isReplacing) {
      const conflict = findConflictingAccount(
        accounts.value,
        payload.serverUrl,
        payload.provider
      )
      if (conflict) {
        sheetError.value = `${forgeServerHost(payload.serverUrl)} 上已经有一个账号（${conflict.username || conflict.id}）。请改用「替换 Token」，那样任务的交付身份不会变。`
        return
      }
    }

    // 替换模式**沿用原 id**（见文件头）。
    const accountId = isReplacing
      ? editingId.value
      : buildForgeAccountId(payload.provider, payload.serverUrl)

    // 先存 token，再写 accounts（顺序见文件头）。
    await saveForgeAccountToken(activeGateway, accountId, payload.token)

    const existing = accounts.value.find((account) => account.id === accountId)
    const nextAccount: GitHubAccount = {
      id: accountId,
      server_url: payload.serverUrl,
      username: result.username || existing?.username || "",
      scopes: result.scopes,
      avatar_url: result.avatar_url || existing?.avatar_url || null,
      is_default: payload.isDefault || Boolean(existing?.is_default),
      created_at: existing?.created_at || new Date().toISOString(),
      provider: payload.provider,
    }

    let next = existing
      ? accounts.value.map((account) => (account.id === accountId ? nextAccount : account))
      : [...accounts.value, nextAccount]
    if (nextAccount.is_default) {
      next = applyDefaultForgeAccount(next, accountId)
    }

    const saved = await saveForgeAccounts(activeGateway, next)
    accounts.value = saved.accounts
    showTokenSheet.value = false
    uni.showToast({ title: isReplacing ? "已替换" : "已添加", icon: "success" })
  } catch (error) {
    sheetError.value = toErrorMessage(error)
  } finally {
    submitting.value = false
  }
}

async function makeDefault(accountId: string) {
  const activeGateway = gateway.value
  if (!activeGateway) return
  try {
    const saved = await saveForgeAccounts(
      activeGateway,
      applyDefaultForgeAccount(accounts.value, accountId)
    )
    accounts.value = saved.accounts
  } catch (error) {
    uni.showToast({ title: toErrorMessage(error), icon: "none", duration: 3000 })
  }
}

function confirmRemove(account: GitHubAccount) {
  uni.showModal({
    title: "删除这个账号？",
    // 说清后果：已经触发过的任务钉在这个 id 上，删掉之后它们没法再交付。
    content: `${account.username || account.id} 会从 ${forgeServerHost(account.server_url)} 移除。已经用它触发过的任务将无法推送分支或回写评论。`,
    confirmText: "删除",
    confirmColor: "#fa3534",
    cancelText: "取消",
    success: (result) => {
      if (result.confirm) void removeAccount(account)
    },
  })
}

async function removeAccount(account: GitHubAccount) {
  const activeGateway = gateway.value
  if (!activeGateway) return
  try {
    // 先写 accounts 再删 token：顺序与保存相反。中间失败留下一个没人引用的孤儿
    // token（无害），而反过来会留下一个有身份没凭据的账号行（会被 forge 挑中并 401）。
    const saved = await saveForgeAccounts(
      activeGateway,
      removeForgeAccount(accounts.value, account.id)
    )
    accounts.value = saved.accounts
    await deleteForgeAccountToken(activeGateway, account.id)
    uni.showToast({ title: "已删除", icon: "success" })
  } catch (error) {
    uni.showToast({ title: toErrorMessage(error), icon: "none", duration: 3000 })
  }
}

async function saveGitPath() {
  const activeGateway = gateway.value
  if (!activeGateway) return
  savingGitPath.value = true
  try {
    const settings = await setGitSettings(activeGateway, gitPathInput.value)
    gitPathInput.value = settings.custom_path || ""
    gitDetect.value = await detectGit(activeGateway)
    uni.showToast({ title: "已保存", icon: "success" })
  } catch (error) {
    uni.showToast({ title: toErrorMessage(error), icon: "none", duration: 3000 })
  } finally {
    savingGitPath.value = false
  }
}

/* ===== 展示 ===== */

function providerLabel(provider: string | null) {
  return forgeProviderLabel(provider)
}

function scopeSummary(scopes: string[]) {
  return forgeScopeSummary(scopes)
}

function initialOf(username: string) {
  const name = String(username || "").trim()
  return name ? name.slice(0, 1).toUpperCase() : "?"
}

function goBack() {
  uni.navigateBack()
}
</script>

<style scoped lang="scss">
@import "@/pages/forge/index.scss";

.page {
  min-height: 100vh;
}

.forge-accounts-page {
  background: var(--up-page-bg-color, var(--up-bg-color, #f3f4f6));
}

.forge-accounts-shell {
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.forge-accounts-header {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
}

.forge-accounts-header__copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.forge-accounts-header__title {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.forge-accounts-header__action {
  width: 58rpx;
  height: 58rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  background: linear-gradient(180deg, #2f7cf6 0%, #1f6ae5 100%);
  flex-shrink: 0;
}

.forge-accounts-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.forge-account-row {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.forge-account-row__main {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
}

.forge-account-row__avatar {
  width: 72rpx;
  height: 72rpx;
  border-radius: 999rpx;
  flex-shrink: 0;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.forge-account-row__avatar--text {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  font-weight: 700;
  color: var(--up-content-color, #606266);
}

.forge-account-row__copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.forge-account-row__head {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.forge-account-row__name {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.forge-account-row__badge {
  padding: 2rpx 12rpx;
  border-radius: 999rpx;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 12%, var(--up-card-bg-color, #ffffff) 88%);
  font-size: 18rpx;
  font-weight: 700;
  color: var(--up-primary, #2979ff);
}

.forge-account-row__host {
  font-size: 22rpx;
  color: var(--up-content-color, #606266);
  word-break: break-all;
}

.forge-account-row__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12rpx;
}

.forge-account-row__action {
  padding: 12rpx 24rpx;
  border-radius: 999rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  font-size: 22rpx;
  color: var(--up-content-color, #606266);
}

.forge-account-row__action--danger {
  color: var(--up-error, #fa3534);
}

.forge-accounts-git {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.forge-accounts-git__row {
  margin-top: 4rpx;
}

.forge-accounts-git__action {
  align-self: flex-start;
  padding: 14rpx 32rpx;
  border-radius: 999rpx;
  background: var(--up-primary, #2979ff);
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 700;
}

.forge-safe-bottom {
  height: calc(36rpx + env(safe-area-inset-bottom));
}
</style>
