<template>
  <view class="page">
    <SessionDetailBody
      v-model:message-text="messageText"
      :events="events"
      @send="sendMessage"
      @stop="stopSession"
      @approve="approve"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import SessionDetailBody from "@/components/session/SessionDetailBody.vue"
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
