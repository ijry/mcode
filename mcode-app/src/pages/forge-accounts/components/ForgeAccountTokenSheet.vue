<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch } from "vue"
import {
  forgeProviderLabel,
  forgeScopeSummary,
  guessForgeProvider,
  normalizeForgeServerUrl,
  type ForgeTokenSubmitPayload,
  type ForgeTokenValidatePayload,
} from "../forgeAccountForm"
import type { GitHubTokenValidation } from "@/types/forgeAccount"

/**
 * 录入 / 替换一个 forge 账号的 token。
 *
 * 两种模式：
 * - **新增**：可以改服务器地址与 provider；
 * - **替换 token**：地址与 provider **锁死**。改地址等于换了一台主机，那不是「替换
 *   token」而是「另一个账号」；而账号 id 必须保持不变（每个 forge 触发的任务都把它
 *   钉在 `source_meta.account_id` 上，换 id 会让那些任务失去可交付的身份）。
 *
 * 校验（`validate_*_token`）是**必须的**而不是体贴：账号行里的 username / avatar /
 * scopes 全部来自它，没有校验就只能让用户自己填一个可能拼错的用户名 —— 而那个名字
 * 会被当成 git 推送时的凭据用户名。
 *
 * 失败显示在**弹层内部**，不用 toast：模态背后弹出的 toast 是用户唯一读不到的消息。
 */
const props = defineProps<{
  show: boolean
  /** 空串 = 新增；非空 = 替换这个账号的 token。 */
  accountId: string
  /** 预填的服务器地址（新增时来自错误里的 host，替换时是账号自己的）。 */
  serverUrl: string
  provider: "github" | "gitlab" | ""
  /** 替换模式下显示的既有用户名，让用户确认自己在改哪一个。 */
  username: string
  submitting?: boolean
  /** 校验结果，由页面持有（弹层不发请求）。 */
  validation: GitHubTokenValidation | null
  validating?: boolean
  /** 弹层内的错误文案。 */
  errorText: string
}>()

const emit = defineEmits<{
  (event: "update:show", value: boolean): void
  (event: "validate", payload: ForgeTokenValidatePayload): void
  (event: "submit", payload: ForgeTokenSubmitPayload): void
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

const serverUrlInput = ref("")
const providerInput = ref<"github" | "gitlab">("github")
const tokenInput = ref("")
const isDefault = ref(true)

const isReplacing = computed(() => Boolean(props.accountId))

watch(
  () => props.show,
  (show) => {
    if (!show) {
      // 关闭时清 token，但**不清**地址与 provider —— 重新打开通常是因为上一次
      // 校验失败，让用户重新填一遍已经填对的东西是多余的。
      tokenInput.value = ""
      return
    }
    serverUrlInput.value = props.serverUrl || ""
    providerInput.value =
      props.provider || guessForgeProvider(props.serverUrl || "")
    isDefault.value = true
  },
  { immediate: true }
)

// 地址变了就重新猜 provider —— 但只在新增模式下，且只在用户没手动改过时
// （手动改过之后 providerInput 与猜测值不同，此时不覆盖他的选择）。
watch(serverUrlInput, (next, previous) => {
  if (isReplacing.value) return
  if (providerInput.value !== guessForgeProvider(previous || "")) return
  providerInput.value = guessForgeProvider(next)
})

const normalizedUrl = computed(() => normalizeForgeServerUrl(serverUrlInput.value))
const canSubmit = computed(
  () =>
    Boolean(normalizedUrl.value) &&
    tokenInput.value.trim().length > 0 &&
    !props.submitting &&
    !props.validating
)

function closeSheet() {
  emit("update:show", false)
}

function handleValidate() {
  if (!normalizedUrl.value || !tokenInput.value.trim()) return
  emit("validate", {
    serverUrl: normalizedUrl.value,
    provider: providerInput.value,
    token: tokenInput.value.trim(),
  })
}

function handleSubmit() {
  if (!canSubmit.value) return
  emit("submit", {
    serverUrl: normalizedUrl.value,
    provider: providerInput.value,
    token: tokenInput.value.trim(),
    isDefault: isDefault.value,
  })
}
</script>

<template>
  <up-popup :show="props.show" mode="bottom" :round="28" @close="closeSheet">
    <view class="forge-sheet" :style="upThemeCardStyle">
      <view class="forge-sheet__hd">
        <view class="forge-sheet__title-block">
          <text class="forge-sheet__title">{{ isReplacing ? "替换 Token" : "添加账号" }}</text>
          <text class="forge-sheet__desc">
            {{
              isReplacing
                ? `为 ${props.username || "这个账号"} 换一个新的访问令牌，账号身份保持不变。`
                : "Token 会保存在桌面端的凭据存储里，不会留在手机上。"
            }}
          </text>
        </view>
        <view class="forge-sheet__close" @click="closeSheet">
          <up-icon name="close" size="20" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
        </view>
      </view>

      <scroll-view scroll-y class="forge-sheet__body">
        <view class="forge-token">
          <view class="forge-sheet__group">
            <text class="forge-sheet__group-title">服务器地址</text>
            <!-- 替换模式锁死：改地址等于换了一台主机，那是「另一个账号」而不是
                 「替换 token」。 -->
            <up-input
              v-if="!isReplacing"
              v-model="serverUrlInput"
              placeholder="https://github.com"
              border="surround"
              clearable
            ></up-input>
            <view v-else class="forge-token__locked">
              <text class="forge-option__title">{{ props.serverUrl }}</text>
            </view>
            <text v-if="serverUrlInput && !normalizedUrl" class="forge-token__hint forge-token__hint--error">
              这不是一个可用的地址，请填 `https://github.com` 这样的形式。
            </text>
          </view>

          <view class="forge-sheet__group">
            <text class="forge-sheet__group-title">代码托管平台</text>
            <view v-if="!isReplacing" class="forge-token__row">
              <view
                v-for="option in (['github', 'gitlab'] as const)"
                :key="option"
                class="forge-token__pill"
                :class="{ 'forge-token__pill--active': option === providerInput }"
                @click="providerInput = option"
              >
                <text>{{ forgeProviderLabel(option) }}</text>
              </view>
            </view>
            <view v-else class="forge-token__locked">
              <text class="forge-option__title">{{ forgeProviderLabel(props.provider || null) }}</text>
            </view>
            <text class="forge-token__hint">
              自建实例靠这里说明 token 是给哪个 API 的 —— 主机名看不出来。
            </text>
          </view>

          <view class="forge-sheet__group">
            <text class="forge-sheet__group-title">访问令牌</text>
            <up-input
              v-model="tokenInput"
              type="password"
              placeholder="粘贴 Personal Access Token"
              border="surround"
              clearable
            ></up-input>
            <text class="forge-token__hint">
              需要 repo（GitLab 为 api）权限才能读写 Issue 与 PR。
            </text>
          </view>

          <!-- 校验结果：成功时把身份亮出来让用户确认自己粘对了 token。 -->
          <view
            v-if="props.validation"
            class="forge-notice"
            :class="props.validation.success ? 'forge-notice--info' : 'forge-notice--error'"
          >
            <template v-if="props.validation.success">
              <text class="forge-notice__text">
                将以 {{ props.validation.username || "未知用户" }} 的身份访问。
              </text>
              <text class="forge-notice__text">
                权限范围：{{ forgeScopeSummary(props.validation.scopes) }}
              </text>
            </template>
            <text v-else class="forge-notice__text">
              {{ props.validation.message || "令牌校验失败，请确认它没有过期。" }}
            </text>
          </view>

          <view class="forge-sheet__group">
            <view class="forge-token__switch">
              <view class="forge-option__copy">
                <text class="forge-option__title">设为这台主机的默认账号</text>
                <text class="forge-option__desc">同一主机有多个账号时优先用它。</text>
              </view>
              <up-switch
                v-model="isDefault"
                size="20"
                :activeColor="upThemeVar('--up-primary', '#2979ff')"
              ></up-switch>
            </view>
          </view>

          <!-- 失败显示在弹层内部：模态背后弹出的 toast 是用户唯一读不到的消息。 -->
          <view v-if="props.errorText" class="forge-notice forge-notice--error">
            <text class="forge-notice__text">{{ props.errorText }}</text>
          </view>
        </view>
      </scroll-view>

      <view class="forge-sheet__ft">
        <view
          class="forge-sheet__btn forge-sheet__btn--ghost"
          :class="{ 'forge-sheet__btn--disabled': !canSubmit }"
          @click="handleValidate"
        >
          <text>{{ props.validating ? "校验中..." : "校验" }}</text>
        </view>
        <view
          class="forge-sheet__btn forge-sheet__btn--primary"
          :class="{ 'forge-sheet__btn--disabled': !canSubmit }"
          @click="handleSubmit"
        >
          <text>{{ props.submitting ? "保存中..." : "保存" }}</text>
        </view>
      </view>
    </view>
  </up-popup>
</template>

<style scoped lang="scss">
@import "@/pages/forge/index.scss";

.forge-token {
  display: flex;
  flex-direction: column;
  gap: 26rpx;
  padding-bottom: 8rpx;
}

.forge-token__row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.forge-token__pill {
  padding: 12rpx 30rpx;
  border-radius: 999rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  border: 1rpx solid transparent;
  font-size: 24rpx;
  color: var(--up-content-color, #606266);
}

.forge-token__pill--active {
  border-color: var(--up-primary, #2979ff);
  background: color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%);
  color: var(--up-primary, #2979ff);
  font-weight: 700;
}

.forge-token__locked {
  padding: 20rpx;
  border-radius: 20rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.forge-token__hint {
  font-size: 21rpx;
  line-height: 1.5;
  color: var(--up-tips-color, #909193);
}

.forge-token__hint--error {
  color: var(--up-error, #fa3534);
}

.forge-token__switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 20rpx;
  border-radius: 20rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}
</style>
