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
import PetFloat from './components/pet/PetFloat.vue'

const petComp = shallowRef<any>(null)
const petReady = shallowRef(false)

onMounted(async () => {
  petComp.value = PetFloat
  petReady.value = true
})
</script>

<style scoped>
.up-root-wrap {
  min-height: 100vh;
  background: var(--up-page-bg-color, var(--up-bg-color, #f3f4f6));
  color: var(--up-main-color, #303133);
}
</style>
