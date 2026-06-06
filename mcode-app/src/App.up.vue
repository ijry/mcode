<template>
  <view class="up-root-wrap">
    <UpRootView />
    <PetFloat />
  </view>
</template>

<script setup lang="ts">
import PetFloat from './components/pet/PetFloat.vue'
</script>

<style scoped>
.up-root-wrap {
  min-height: 100vh;
}
</style>
