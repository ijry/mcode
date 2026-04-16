<template>
  <view class="page">
    <view class="section col">
      <view class="title">Pair</view>
      <view class="row">
        <button class="btn" @click="mode = 'relay'">Relay</button>
        <button class="btn" @click="mode = 'direct'">Direct</button>
      </view>

      <view v-if="mode === 'relay'" class="col">
        <input v-model="relayUrl" placeholder="Relay URL" />
        <input v-model="pairCode" placeholder="Pairing code" />
        <input v-model="pairSecret" type="password" placeholder="Pairing secret" />
      </view>

      <view v-else class="col">
        <input v-model="directBaseUrl" placeholder="Codeg base URL" />
        <input v-model="directToken" type="password" placeholder="Access token" />
      </view>

      <button class="btn primary" @click="submit">{{ mode === 'relay' ? 'Pair' : 'Save direct config' }}</button>
      <text class="muted">{{ status }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue"
import { useAuthStore } from "@/stores/auth"

const auth = useAuthStore()
const mode = ref<"relay" | "direct">("relay")
const relayUrl = ref("")
const pairCode = ref("")
const pairSecret = ref("")
const directBaseUrl = ref("")
const directToken = ref("")
const status = ref("Ready")

async function submit() {
  const gateway = auth.gateway()
  if (mode.value === "relay") {
    const session = await gateway.pair({
      relayUrl: relayUrl.value,
      code: pairCode.value,
      secret: pairSecret.value,
    })
    if (session) {
      auth.setRelayMode(relayUrl.value, session)
    }
    status.value = "Relay paired"
  } else {
    await gateway.pair({
      directBaseUrl: directBaseUrl.value,
      token: directToken.value,
    })
    auth.setDirectMode(directBaseUrl.value, directToken.value)
    status.value = "Direct config saved"
  }
}
</script>
