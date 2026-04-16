<template>
  <view class="page">
    <view class="section col">
      <view class="title">Targets</view>
      <view v-for="item in targets.targets" :key="item.id" class="section">
        <view class="row" style="justify-content: space-between;">
          <text>{{ item.name }}</text>
          <text class="muted">{{ item.mode }}</text>
        </view>
        <view class="row">
          <button class="btn" @click="activate(item.id)">Use</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { useTargetsStore } from "@/stores/targets"

const targets = useTargetsStore()

function activate(targetId: string) {
  targets.setActiveTarget(targetId)
}
</script>
