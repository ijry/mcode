<template>
  <view class="agent-selector">
    <view class="selector-trigger" @click="showPicker = true">
      <view class="agent-info">
        <u-icon :name="currentAgent.icon" size="20" :color="currentAgent.color"></u-icon>
        <text class="agent-name">{{ currentAgent.name }}</text>
      </view>
      <u-icon name="arrow-down" size="14" color="#909399"></u-icon>
    </view>

    <u-popup v-model:show="showPicker" mode="bottom" :round="10">
      <view class="agent-picker">
        <view class="picker-header">
          <text class="picker-title">选择智能体</text>
          <u-icon name="close" size="24" @click="showPicker = false"></u-icon>
        </view>

        <view class="agent-list">
          <view
            v-for="agent in agents"
            :key="agent.type"
            class="agent-item"
            :class="{ active: agent.type === modelValue }"
            @click="selectAgent(agent)"
          >
            <view class="agent-left">
              <view class="agent-icon" :style="{ backgroundColor: agent.color + '20' }">
                <u-icon :name="agent.icon" size="24" :color="agent.color"></u-icon>
              </view>
              <view class="agent-content">
                <text class="agent-title">{{ agent.name }}</text>
                <text class="agent-desc">{{ agent.description }}</text>
              </view>
            </view>
            <u-icon
              v-if="agent.type === modelValue"
              name="checkbox-mark"
              size="20"
              color="#2979ff"
            ></u-icon>
          </view>
        </view>
      </view>
    </u-popup>
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
  {
    type: "general",
    name: "通用助手",
    description: "适用于各种日常任务和问题",
    icon: "star",
    color: "#2979ff",
  },
  {
    type: "code",
    name: "代码助手",
    description: "专注于编程、调试和代码审查",
    icon: "code",
    color: "#19be6b",
  },
  {
    type: "writing",
    name: "写作助手",
    description: "帮助撰写文章、文档和创意内容",
    icon: "edit",
    color: "#ff9900",
  },
  {
    type: "analysis",
    name: "分析助手",
    description: "数据分析、研究和洞察",
    icon: "chart",
    color: "#9c27b0",
  },
  {
    type: "translation",
    name: "翻译助手",
    description: "多语言翻译和本地化",
    icon: "globe",
    color: "#00bcd4",
  },
  {
    type: "creative",
    name: "创意助手",
    description: "头脑风暴、创意生成和设计",
    icon: "bulb",
    color: "#ff5722",
  },
]

const currentAgent = computed(() => {
  return agents.find((a) => a.type === props.modelValue) || agents[0]
})

function selectAgent(agent: Agent) {
  emit("update:modelValue", agent.type)
  emit("change", agent)
  showPicker.value = false
}
</script>

<style scoped lang="scss">
.agent-selector {
  display: inline-block;
}

.selector-trigger {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 12rpx 24rpx;
  background-color: #f5f7fa;
  border-radius: 12rpx;
  cursor: pointer;
  transition: background-color 0.2s;

  &:active {
    background-color: #e4e7ed;
  }
}

.agent-info {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.agent-name {
  font-size: 28rpx;
  font-weight: 500;
  color: #303133;
}

.agent-picker {
  padding: 40rpx 30rpx;
  background-color: #ffffff;
  border-radius: 20rpx 20rpx 0 0;
  max-height: 80vh;
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 30rpx;
}

.picker-title {
  font-size: 36rpx;
  font-weight: 600;
  color: #303133;
}

.agent-list {
  max-height: 60vh;
  overflow-y: auto;
}

.agent-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx;
  margin-bottom: 16rpx;
  background-color: #f8f8f8;
  border-radius: 16rpx;
  transition: all 0.2s;

  &:active {
    transform: scale(0.98);
  }

  &.active {
    background-color: #e3f2fd;
    border: 2rpx solid #2979ff;
  }
}

.agent-left {
  display: flex;
  align-items: center;
  gap: 20rpx;
  flex: 1;
}

.agent-icon {
  width: 80rpx;
  height: 80rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16rpx;
}

.agent-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.agent-title {
  font-size: 30rpx;
  font-weight: 500;
  color: #303133;
}

.agent-desc {
  font-size: 24rpx;
  color: #909399;
  line-height: 1.4;
}
</style>
