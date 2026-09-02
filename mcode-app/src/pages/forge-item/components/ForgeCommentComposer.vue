<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch } from "vue"
import { authorInitial } from "@/pages/forge/forgeRowPresentation"
import { validateForgeCommentBody } from "../forgeItemPresentation"
import { FORGE_MAX_COMMENT_CHARS } from "@/types/forge"
import type { ForgeIdentity } from "@/types/forge"

/**
 * 发表评论。
 *
 * 显示「以 X 的身份评论」是必要的而不是装饰：哪个账号服务这个文件夹是后端从 origin
 * 远端的 host 决定的，用户在手机上完全看不到那个决定 —— 而这条评论会以那个人的名义
 * 出现在别人在读的线程里。
 *
 * **失败时保留输入内容且不说「请重试」**：一次 POST 可能已经到达 forge 而只是响应丢了，
 * 重试就是发两遍。所以措辞是「先确认」，由用户自己决定。
 */
const props = defineProps<{
  identity: ForgeIdentity | null
  submitting?: boolean
  /** 发送失败的说明（已由 `forgeCommentFailureText` 措辞过）。 */
  errorText?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (event: "submit", body: string): void
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

const body = ref("")
/** 本地校验（空 / 超长）。服务端也会拒，但那要花一次往返。 */
const localError = ref("")

watch(body, () => {
  if (localError.value) localError.value = ""
})

const remaining = computed(() => FORGE_MAX_COMMENT_CHARS - body.value.trim().length)
const overLimit = computed(() => remaining.value < 0)
const canSubmit = computed(
  () => body.value.trim().length > 0 && !overLimit.value && !props.submitting && !props.disabled
)

/** 发送成功后由页面调用来清空输入 —— 失败时不清（那些字是用户写的）。 */
function reset() {
  body.value = ""
  localError.value = ""
}

defineExpose({ reset })

function handleSubmit() {
  const error = validateForgeCommentBody(body.value)
  if (error) {
    localError.value = error
    return
  }
  if (!canSubmit.value) return
  emit("submit", body.value.trim())
}
</script>

<template>
  <view class="forge-card forge-composer" :style="upThemeCardStyle">
    <view v-if="props.identity" class="forge-composer__identity">
      <image
        v-if="props.identity.avatar_url"
        class="forge-composer__avatar"
        :src="props.identity.avatar_url"
        mode="aspectFill"
      ></image>
      <view v-else class="forge-composer__avatar forge-composer__avatar--text">
        <text>{{ authorInitial(props.identity.username) }}</text>
      </view>
      <text class="forge-composer__identity-text">
        以 {{ props.identity.username }} 的身份评论
      </text>
    </view>

    <up-textarea
      v-model="body"
      placeholder="写下评论（支持 Markdown）"
      :maxlength="-1"
      :height="120"
      :disabled="props.disabled"
      border="none"
    ></up-textarea>

    <view class="forge-composer__foot">
      <!-- 超长时才显示计数：一个常驻的「还剩 65500 字」是噪音。 -->
      <text
        v-if="remaining < 500"
        class="forge-composer__count"
        :class="{ 'forge-composer__count--over': overLimit }"
      >{{ overLimit ? `超出 ${-remaining} 字` : `还剩 ${remaining} 字` }}</text>
      <view
        class="forge-composer__submit"
        :class="{ 'forge-composer__submit--disabled': !canSubmit }"
        @click="handleSubmit"
      >
        <text>{{ props.submitting ? "发送中..." : "发表评论" }}</text>
      </view>
    </view>

    <view v-if="localError" class="forge-notice forge-notice--warning">
      <text class="forge-notice__text">{{ localError }}</text>
    </view>

    <!-- 失败显示在这里而不是 toast：用户要一边看着这句话一边决定要不要重发。 -->
    <view v-if="props.errorText" class="forge-notice forge-notice--error">
      <text class="forge-notice__text">{{ props.errorText }}</text>
    </view>
  </view>
</template>

<style scoped lang="scss">
@import "@/pages/forge/index.scss";

.forge-composer {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.forge-composer__identity {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.forge-composer__avatar {
  width: 40rpx;
  height: 40rpx;
  border-radius: 999rpx;
  flex-shrink: 0;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.forge-composer__avatar--text {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18rpx;
  color: var(--up-content-color, #606266);
}

.forge-composer__identity-text {
  font-size: 21rpx;
  color: var(--up-tips-color, #909193);
}

.forge-composer__foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16rpx;
}

.forge-composer__count {
  font-size: 20rpx;
  color: var(--up-tips-color, #909193);
}

.forge-composer__count--over {
  color: var(--up-error, #fa3534);
}

.forge-composer__submit {
  padding: 14rpx 32rpx;
  border-radius: 999rpx;
  background: var(--up-primary, #2979ff);
  color: #ffffff;
  font-size: 24rpx;
  font-weight: 700;
}

.forge-composer__submit--disabled {
  opacity: 0.5;
}
</style>
