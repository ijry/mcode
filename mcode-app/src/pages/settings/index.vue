<template>
  <view class="page">
    <view class="section col">
      <view class="title">Settings</view>
      <input v-model="relayUrl" placeholder="Relay URL" />
      <input v-model="directBaseUrl" placeholder="Direct base URL" />
      <input v-model="token" type="password" placeholder="Direct token" />
      <button class="btn" @click="saveRelay">Save relay</button>
      <button class="btn" @click="saveDirect">Save direct</button>
      <text class="muted">{{ status }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue"
import { useAuthStore } from "@/stores/auth"

const auth = useAuthStore()
const relayUrl = ref("")
const directBaseUrl = ref("")
const token = ref("")
const status = ref("")

function saveRelay() {
  auth.setRelayMode(relayUrl.value, auth.relaySession ?? { accessToken: "" })
  status.value = "Relay settings saved"
}

function saveDirect() {
  auth.setDirectMode(directBaseUrl.value, token.value)
  status.value = "Direct settings saved"
}
</script>
