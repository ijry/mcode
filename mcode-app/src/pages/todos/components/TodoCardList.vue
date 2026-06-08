<script setup lang="ts">
import type { TodoItem } from "../todoState"

const props = defineProps<{
  items: TodoItem[]
  mode: "in-progress" | "completed" | "cloud-placeholder"
  emptyText: string
}>()

const emit = defineEmits<{
  (e: "toggle", id: string): void
  (e: "edit", item: TodoItem): void
  (e: "send", item: TodoItem): void
  (e: "menu", item: TodoItem): void
  (e: "placeholderAction"): void
}>()
</script>

<template>
  <view v-if="props.items.length > 0" class="todo-card-list">
    <view
      v-for="item in props.items"
      :key="item.id"
      :class="['todo-card', props.mode === 'completed' && 'todo-card--completed']"
    >
      <view class="todo-card__check" @click="emit('toggle', item.id)">
        <view :class="['todo-card__check-circle', item.completed && 'todo-card__check-circle--checked']">
          <up-icon v-if="item.completed" name="checkmark" size="14" color="#ffffff"></up-icon>
        </view>
      </view>

      <view class="todo-card__body" @click="props.mode === 'in-progress' && emit('edit', item)">
        <text class="todo-card__title">{{ item.text }}</text>
        <text class="todo-card__meta">
          {{ props.mode === 'completed' ? '已完成' : '点击编辑或发送到新会话' }}
        </text>
      </view>

      <view class="todo-card__side">
        <view v-if="props.mode === 'completed'" class="todo-card__badge todo-card__badge--completed">
          <text class="todo-card__badge-text">已完成</text>
        </view>
        <view class="todo-card__icon-btn" @click.stop="emit('send', item)">
          <up-icon name="chat" size="18" color="#2f7cf6"></up-icon>
        </view>
        <view class="todo-card__icon-btn" @click.stop="emit('menu', item)">
          <up-icon name="more-dot-fill" size="16" color="#b0b7c3"></up-icon>
        </view>
      </view>
    </view>
  </view>

  <view
    v-else-if="props.mode === 'cloud-placeholder'"
    class="todo-empty-card todo-empty-card--actionable"
    @click="emit('placeholderAction')"
  >
    <text class="todo-empty-card__title">云端待办即将上线</text>
    <text class="todo-empty-card__desc">这里会显示同步到云端的进行中与已完成待办。</text>
  </view>

  <view v-else class="todo-empty-card">
    <text class="todo-empty-card__title">{{ props.emptyText }}</text>
  </view>
</template>

<style scoped lang="scss">
.todo-card-list {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.todo-card {
  display: flex;
  align-items: center;
  gap: 18rpx;
  padding: 18rpx 16rpx;
  border-radius: 22rpx;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 10rpx 26rpx rgba(15, 23, 42, 0.06);
}

.todo-card--completed {
  opacity: 0.96;
}

.todo-card__check {
  flex-shrink: 0;
}

.todo-card__check-circle {
  width: 46rpx;
  height: 46rpx;
  border-radius: 50%;
  border: 3rpx solid #d4d8e1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.todo-card__check-circle--checked {
  border-color: #2f7cf6;
  background: #2f7cf6;
}

.todo-card__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.todo-card__title {
  font-size: 30rpx;
  font-weight: 600;
  color: #20242f;
  line-height: 1.3;
}

.todo-card__meta {
  font-size: 22rpx;
  color: #8b93a5;
  line-height: 1.3;
}

.todo-card__side {
  display: flex;
  align-items: center;
  gap: 6rpx;
  flex-shrink: 0;
}

.todo-card__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34rpx;
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  background: rgba(142, 142, 147, 0.12);
}

.todo-card__badge--completed {
  background: rgba(47, 124, 246, 0.12);
}

.todo-card__badge-text {
  font-size: 18rpx;
  font-weight: 600;
  color: #2f7cf6;
}

.todo-card__icon-btn {
  width: 52rpx;
  height: 52rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.todo-empty-card {
  padding: 28rpx 24rpx;
  border-radius: 22rpx;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 10rpx 26rpx rgba(15, 23, 42, 0.04);
  text-align: center;
}

.todo-empty-card--actionable {
  border: 2rpx dashed #d4d8e1;
}

.todo-empty-card__title {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
  color: #5f6778;
  line-height: 1.3;
}

.todo-empty-card__desc {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  color: #98a1b3;
  line-height: 1.5;
}
</style>
