<template>
  <view class="section col">
    <view class="title">{{ resolvedTitle }}</view>
    <input
      :value="messageText"
      placeholder="Send a message"
      @input="handleInput"
    />
    <button class="btn primary" :disabled="sendDisabled" @click="emit('send')">Send</button>
    <button class="btn" :disabled="stopDisabled" @click="emit('stop')">Stop</button>
    <button class="btn" :disabled="approveDisabled" @click="emit('approve')">Approve</button>
    <view
      v-for="(item, index) in events"
      :key="getSessionDetailEventKey(item, index)"
      class="section"
    >
      <text>{{ JSON.stringify(item) }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue"
import {
  getSessionDetailEventKey,
  type SessionDetailBodyProps,
} from "@/pages/session-detail/sessionDetailBodyContract"

const props = withDefaults(defineProps<SessionDetailBodyProps>(), {
  title: "Session Detail",
  sendDisabled: false,
  stopDisabled: false,
  approveDisabled: false,
})

const emit = defineEmits<{
  "update:messageText": [value: string]
  send: []
  stop: []
  approve: []
}>()

const resolvedTitle = computed(() => props.title || "Session Detail")

function handleInput(event: Event) {
  const detailValue = (event as Event & { detail?: { value?: string } }).detail?.value
  const targetValue = (event.target as HTMLInputElement | null)?.value
  emit("update:messageText", detailValue ?? targetValue ?? "")
}
</script>
