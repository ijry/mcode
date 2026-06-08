<script setup lang="ts">
import { computed, ref, watch } from "vue"

const props = defineProps<{ show: boolean }>()

const emit = defineEmits<{
  (e: "update:show", value: boolean): void
  (e: "submit", value: string): void
}>()

const draftText = ref("")
const canSubmit = computed(() => draftText.value.trim().length > 0)

watch(
  () => props.show,
  (visible) => {
    if (!visible) draftText.value = ""
  }
)

function closePopup() {
  emit("update:show", false)
}

function submit() {
  if (!canSubmit.value) return
  emit("submit", draftText.value.trim())
  emit("update:show", false)
}
</script>

<template>
  <up-popup :show="props.show" mode="bottom" :round="28" @close="closePopup">
    <view class="todo-create-sheet">
      <view class="todo-create-sheet__hd">
        <text class="todo-create-sheet__title">新建待办</text>
        <view class="todo-create-sheet__close" @click="closePopup">
          <up-icon name="close" size="18" color="#909193"></up-icon>
        </view>
      </view>

      <up-textarea
        v-model="draftText"
        placeholder="输入待办事项..."
        autoHeight
        :maxlength="-1"
        :count="false"
      ></up-textarea>

      <up-button
        type="primary"
        shape="circle"
        :disabled="!canSubmit"
        customStyle="margin-top:16rpx"
        @click="submit"
      >添加待办</up-button>

      <view class="todo-create-sheet__safe"></view>
    </view>
  </up-popup>
</template>

<style scoped lang="scss">
.todo-create-sheet {
  padding: 36rpx 20rpx 0;
  background: #ffffff;
  border-radius: 28rpx 28rpx 0 0;
}

.todo-create-sheet__hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 32rpx;
}

.todo-create-sheet__title {
  font-size: 34rpx;
  font-weight: 600;
  color: #20242f;
}

.todo-create-sheet__close {
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #f1f2f5;
}

.todo-create-sheet__safe {
  height: calc(32rpx + env(safe-area-inset-bottom));
}
</style>
