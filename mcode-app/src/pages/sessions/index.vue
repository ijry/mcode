<template>
  <view class="page">
    <view class="section col">
      <view class="title">Sessions</view>
      <input v-model="folderId" placeholder="Folder ID" />
      <button class="btn" @click="loadSessions">Load</button>
      <view v-for="item in sessions" :key="String(item.id ?? item.external_id ?? item.title)" class="section">
        <text>{{ String(item.title ?? item.id ?? 'Session') }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { ref } from "vue"
import { useAuthStore } from "@/stores/auth"
import { useSessionStore } from "@/stores/session"

const auth = useAuthStore()
const session = useSessionStore()
const sessions = computed(() => session.sessions)
const folderId = ref("")

async function loadSessions() {
  const gateway = auth.gateway()
  const result = await gateway.call<unknown[]>("list_folder_conversations", {
    folderId: Number(folderId.value || session.projects[0]?.id || 1),
  })
  session.setSessions(result as Record<string, unknown>[])
}
</script>
