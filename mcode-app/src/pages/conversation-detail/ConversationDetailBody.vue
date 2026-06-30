<template>
  <view class="detail-body">
    <slot name="status"></slot>
    <slot name="history"></slot>
    <view class="message-list" :style="messageListPageStyle">
      <view class="message-list__content">
        <slot name="content"></slot>
      </view>
    </view>
    <view class="input-wrap" :style="inputWrapStyle">
      <slot name="composer"></slot>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { StyleValue } from "vue"

defineProps<{
  messageListPageStyle?: StyleValue
  inputWrapStyle?: StyleValue
}>()
</script>
