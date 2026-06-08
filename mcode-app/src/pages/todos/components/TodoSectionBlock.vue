<script setup lang="ts">
const props = defineProps<{
  title: string
  actionText?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: "action"): void
}>()
</script>

<template>
  <view class="todo-section">
    <view class="todo-section__head">
      <text class="todo-section__title">{{ props.title }}</text>
      <text
        v-if="props.actionText"
        :class="['todo-section__action', props.disabled && 'todo-section__action--disabled']"
        @click="!props.disabled && emit('action')"
      >{{ props.actionText }}</text>
    </view>
    <slot></slot>
  </view>
</template>

<style scoped lang="scss">
.todo-section {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.todo-section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 0 4rpx;
}

.todo-section__title {
  font-size: 28rpx;
  font-weight: 600;
  color: #6b7280;
}

.todo-section__action {
  font-size: 24rpx;
  font-weight: 600;
  color: #2f7cf6;
}

.todo-section__action--disabled {
  color: #b6bdc9;
}
</style>
