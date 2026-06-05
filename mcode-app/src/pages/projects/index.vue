<template>
  <view class="page">
    <view class="section col">
      <view class="title">Projects</view>
      <button class="btn" @click="loadProjects">Load</button>
      <view v-for="item in projects" :key="String(item.id ?? item.name)" class="section">
        <text>{{ String(item.name ?? item.path ?? item.id ?? 'Project') }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useAuthStore } from "@/stores/auth"
import { useSessionStore } from "@/stores/session"

const auth = useAuthStore()
const session = useSessionStore()
const projects = computed(() => session.projects)

async function loadProjects() {
  const gateway = auth.gateway()
  const result = await gateway.call<unknown[]>("list_open_folder_details")
  session.setProjects(result as Record<string, unknown>[])
}
</script>
