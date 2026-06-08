<template>
  <view class="agent-sel">
    <view class="sel-trigger" @click="showPicker = true">
      <view class="sel-dot" :style="{ backgroundColor: currentAgent.color }"></view>
      <text class="sel-name">{{ currentAgent.name }}</text>
      <up-icon name="arrow-down-fill" size="11" :color="upThemeVar('--up-light-color', '#c0c4cc')"></up-icon>
    </view>

    <up-popup v-model:show="showPicker" mode="bottom" :round="20">
      <view class="picker-wrap">
        <!-- 头部 -->
        <view class="picker-hd">
          <text class="picker-hd__title">选择智能体</text>
          <view class="picker-close" @click="showPicker = false">
            <up-icon name="close" size="20" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
          </view>
        </view>

        <!-- 列表 -->
        <scroll-view scroll-y class="picker-list">
          <view
            v-for="agent in agents"
            :key="agent.type"
            :class="['agent-row', agent.type === modelValue && 'agent-row--active']"
            @click="selectAgent(agent)"
          >
            <view class="agent-icon" :style="{ backgroundColor: agent.color + '18' }">
              <up-icon :name="agent.icon" size="24" :color="agent.color"></up-icon>
            </view>
            <view class="agent-info">
              <text class="agent-info__name">{{ agent.name }}</text>
              <text class="agent-info__desc">{{ agent.description }}</text>
            </view>
            <view v-if="agent.type === modelValue" class="check-mark">
              <up-icon name="checkmark" size="16" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
            </view>
          </view>
        </scroll-view>

        <!-- 底部安全区 -->
        <view class="safe-bottom"></view>
      </view>
    </up-popup>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from "vue"

interface Agent {
  type: string
  name: string
  description: string
  icon: string
  color: string
}

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  "update:modelValue": [value: string]
  change: [agent: Agent]
}>()

const showPicker = ref(false)

const agents: Agent[] = [
  { type: "general",     name: "通用助手", description: "适用于各种日常任务和问题",     icon: "star",     color: "#2979ff" },
  { type: "code",        name: "代码助手", description: "专注于编程、调试和代码审查",     icon: "code",     color: "#19be6b" },
  { type: "writing",     name: "写作助手", description: "帮助撰写文章、文档和创意内容", icon: "edit",     color: "#ff9900" },
  { type: "analysis",    name: "分析助手", description: "数据分析、研究和洞察",         icon: "chart",    color: "#9c27b0" },
  { type: "translation", name: "翻译助手", description: "多语言翻译和本地化",           icon: "globe",    color: "#00bcd4" },
  { type: "creative",    name: "创意助手", description: "头脑风暴、创意生成和设计",     icon: "bulb",     color: "#ff5722" },
]

const currentAgent = computed(() => agents.find((a) => a.type === props.modelValue) || agents[0])

function selectAgent(agent: Agent) {
  emit("update:modelValue", agent.type)
  emit("change", agent)
  showPicker.value = false
}
</script>

<style scoped lang="scss">
/* ===== 触发器 ===== */
.agent-sel {
  display: inline-flex;
}

.sel-trigger {
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 14rpx 20rpx;
  background-color: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  border-radius: 20rpx;
  transition: background-color 0.15s;

  &:active { background-color: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6)); }
}

.sel-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  flex-shrink: 0;
}

.sel-name {
  font-size: 26rpx;
  font-weight: 500;
  color: var(--up-main-color, #303133);
}

/* ===== 弹层 ===== */
.picker-wrap {
  background-color: var(--up-card-bg-color, #ffffff);
  padding: 0 0 0;
}

.picker-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 36rpx 32rpx 24rpx;
}

.picker-hd__title {
  font-size: 34rpx;
  font-weight: 600;
  color: var(--up-main-color, #303133);
}

.picker-close {
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  border-radius: 50%;
}

.picker-list {
  max-height: 65vh;
  padding: 0 24rpx;
}

/* ===== 智能体行 ===== */
.agent-row {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 20rpx 16rpx;
  border-radius: 16rpx;
  margin-bottom: 10rpx;
  transition: background-color 0.15s;

  &:active { background-color: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6)); }

  &--active {
    background-color: color-mix(in srgb, var(--up-primary, #2979ff) 10%, var(--up-card-bg-color, #ffffff) 90%);
  }
}

.agent-icon {
  width: 76rpx;
  height: 76rpx;
  border-radius: 18rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.agent-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.agent-info__name {
  font-size: 30rpx;
  font-weight: 500;
  color: var(--up-main-color, #303133);
}

.agent-info__desc {
  font-size: 24rpx;
  color: var(--up-tips-color, #909193);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.check-mark {
  width: 40rpx;
  height: 40rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.safe-bottom {
  height: calc(24rpx + env(safe-area-inset-bottom));
}
</style>
