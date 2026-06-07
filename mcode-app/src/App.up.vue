<template>
  <view
    class="up-root-wrap"
    :style="[upThemeVars, upThemePageStyle, { color: upThemeVar('--up-main-color', '#303133') }]"
  >
    <UpRootView />
    <component :is="petComp" v-if="petReady" />
  </view>
</template>

<script setup lang="ts">
import { shallowRef, onMounted } from 'vue'

const petComp = shallowRef<any>(null)
const petReady = shallowRef(false)

onMounted(async () => {
  const mod = await import('./components/pet/PetFloat.vue')
  petComp.value = mod.default
  petReady.value = true
})
</script>

<style scoped>
.up-root-wrap {
  min-height: 100vh;
}
</style>
