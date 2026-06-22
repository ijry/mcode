<template>
  <up-markdown
    class="guarded-markdown"
    v-bind="$attrs"
    :content="content"
    :previewImg="previewImg"
    :showLineNumber="showLineNumber"
    :theme="theme"
    :copyLink="false"
    @linktap="handleLinkTap"
  ></up-markdown>
</template>

<script setup lang="ts">
import { openGuardedExternalUrl } from "@/services/externalLinkGuard"

defineOptions({
  inheritAttrs: false,
})

const props = defineProps<{
  content: string
  previewImg?: boolean
  showLineNumber?: boolean
  theme?: "light" | "dark" | string
}>()

async function handleLinkTap(attrs: { href?: string }) {
  if (!attrs?.href) return
  await openGuardedExternalUrl(attrs.href)
}
</script>

<style scoped lang="scss">
.guarded-markdown :deep(.up-markdown ._a) {
  color: var(--guarded-markdown-link-color, var(--up-primary, #2979ff)) !important;
  font-weight: 700;
  text-decoration: underline;
  text-decoration-thickness: 0.08em;
  text-underline-offset: 0.12em;
}
</style>
