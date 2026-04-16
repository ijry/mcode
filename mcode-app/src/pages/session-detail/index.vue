<template>
  <view class="page">
    <view class="section col">
      <view class="title">Session Detail</view>
      <input v-model="messageText" placeholder="Send a message" />
      <button class="btn primary" @click="sendMessage">Send</button>
      <button class="btn" @click="stopSession">Stop</button>
      <button class="btn" @click="approve">Approve</button>
      <view v-for="(item, index) in events" :key="String(item.time ?? index)" class="section">
        <text>{{ JSON.stringify(item) }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import { useAuthStore } from "@/stores/auth"
import { useSessionStore } from "@/stores/session"

const auth = useAuthStore()
const session = useSessionStore()
const messageText = ref("")
const events = computed(() => session.events)

async function sendMessage() {
  const gateway = auth.gateway()
  await gateway.call("acp_prompt", {
    connectionId: session.currentSessionId || "current",
    blocks: [{ type: "text", text: messageText.value }],
  })
  session.pushEvent({ type: "sent", text: messageText.value })
  messageText.value = ""
}

async function stopSession() {
  const gateway = auth.gateway()
  await gateway.call("acp_cancel", { connectionId: session.currentSessionId || "current" })
}

async function approve() {
  const gateway = auth.gateway()
  await gateway.call("acp_respond_permission", {
    connectionId: session.currentSessionId || "current",
    requestId: "request",
    optionId: "allow",
  })
}
</script>
