<script setup lang="ts">
import { computed, getCurrentInstance } from "vue"
import {
  hasTaskAgentConfigChoices,
  selectableTaskConfigOptions,
} from "../taskAgentConfig"
import { hasSessionModeOptions } from "@/services/conversation/composerTools"
import type { DetailAgentConfigState } from "@/services/conversation/composerTools"

/**
 * 智能体选项（授权模式 / 模型 / 推理程度……）的选择弹层。
 *
 * 编辑弹层与设置弹层**共用**这一个组件：两处要选的是同一套东西（`mode_id` +
 * `config_values`），只是落点不同。做成纯受控（状态由父层持有，这里只 emit 选择）
 * 是因为父层还要拿这份状态去算保存载荷 —— 状态若归组件，一个值会被两处写。
 *
 * 形态跟新建会话弹层的「智能体配置」二级弹层一致（chip 网格，不是 picker）：一屏能
 * 看完全部可选项，而 picker 一次只露一列、还要多点一次确认。chip 样式取
 * `pages/tasks/index.scss` 里已有的 `.task-chip`，不从会话页搬一份 `.config-chip`。
 */
const props = defineProps<{
  show: boolean
  /** 探测状态与当前选择，由父层持有。 */
  state: DetailAgentConfigState
  /** 标题下方那行说明（例如「仅对本任务生效」）。 */
  hint?: string
}>()

const emit = defineEmits<{
  (event: "update:show", value: boolean): void
  (event: "selectMode", modeId: string): void
  (event: "selectConfigValue", payload: { configId: string; valueId: string }): void
  (event: "reload"): void
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

const showModes = computed(() => hasSessionModeOptions(props.state.modes))
/** 没有取值列表的选项会渲染成一个空分组标题 —— 过滤掉，见 `taskAgentConfig.ts`。 */
const configOptions = computed(() => selectableTaskConfigOptions(props.state.configOptions))
const hasChoices = computed(() => hasTaskAgentConfigChoices(props.state))

function closeSheet() {
  emit("update:show", false)
}
</script>

<template>
  <up-popup :show="props.show" mode="bottom" :round="28" @close="closeSheet">
    <view class="task-sheet" :style="upThemeCardStyle">
      <view class="task-sheet__hd">
        <view class="task-agent-config__title-block">
          <text class="task-sheet__title">智能体选项</text>
          <text v-if="props.hint" class="task-sheet__desc">{{ props.hint }}</text>
        </view>
        <view class="task-sheet__close" @click="closeSheet">
          <up-icon name="close" size="20" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
        </view>
      </view>

      <view v-if="props.state.status === 'loading'" class="task-agent-config__state">
        <up-loading-icon mode="circle" size="26" :color="upThemeVar('--up-primary', '#2979ff')"></up-loading-icon>
        <text class="task-form-helper">正在读取可用配置...</text>
      </view>

      <template v-else>
        <!-- 探测失败可以重试：这些选项要现拉一个 agent 才知道，一次网络抖动不该让
             用户只能关掉弹层重开。 -->
        <view v-if="props.state.status === 'failed'" class="task-notice task-notice--warning">
          <text class="task-notice__text">{{ props.state.message || "读取失败，将使用远端默认配置" }}</text>
          <view class="task-agent-config__retry" @click="emit('reload')">
            <text class="task-agent-config__retry-text">重试</text>
          </view>
        </view>

        <scroll-view v-if="hasChoices" class="task-sheet__scroll" scroll-y enhanced>
          <view v-if="showModes" class="task-form-group">
            <text class="task-form-label">授权类型</text>
            <view class="task-chip-row">
              <view
                v-for="mode in props.state.modes?.available_modes || []"
                :key="mode.id"
                :class="['task-chip', props.state.selectedModeId === mode.id && 'task-chip--active']"
                @click="emit('selectMode', mode.id)"
              >
                <text class="task-chip__text">{{ mode.name }}</text>
              </view>
            </view>
          </view>

          <view v-for="option in configOptions" :key="option.id" class="task-form-group">
            <text class="task-form-label">{{ option.name }}</text>
            <text v-if="option.description" class="task-form-helper">{{ option.description }}</text>
            <view class="task-chip-row task-agent-config__values">
              <view
                v-for="value in option.kind.options"
                :key="value.value"
                :class="[
                  'task-chip',
                  props.state.selectedValues[option.id] === value.value && 'task-chip--active',
                ]"
                @click="emit('selectConfigValue', { configId: option.id, valueId: value.value })"
              >
                <text class="task-chip__text">{{ value.name }}</text>
              </view>
            </view>
          </view>
        </scroll-view>

        <view v-else-if="props.state.status === 'ready'" class="task-notice">
          <text class="task-notice__text">该智能体将使用远端默认配置。</text>
        </view>
      </template>

      <view class="task-safe-bottom"></view>
    </view>
  </up-popup>
</template>

<style scoped lang="scss">
@import "../index.scss";

.task-agent-config__title-block {
  flex: 1;
  min-width: 0;
}

.task-agent-config__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14rpx;
  padding: 60rpx 0;
}

.task-agent-config__retry {
  flex-shrink: 0;
  padding: 6rpx 20rpx;
  border-radius: 999rpx;
  background: var(--up-card-bg-color, #ffffff);
}

.task-agent-config__retry-text {
  font-size: 22rpx;
  font-weight: 600;
  color: var(--up-primary, #2979ff);
}

.task-agent-config__values {
  margin-top: 12rpx;
}
</style>
