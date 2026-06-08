# Circle Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mock-first `圈子` mobile tab and a backend `circle` content plugin skeleton that reuses common `action` and `comment` modules.

**Architecture:** The frontend adds a focused tab page plus a small mock-state helper that is unit tested. The backend adds an independent `_content/circle` plugin modeled on `_content/forum`, with `circle_post` and `circle_topic` tables and service enrichment through `action` and `comment`.

**Tech Stack:** uni-app Vue 3, uView Plus, Jest, ThinkPHP-style xycloud modules, PHP 8 attributes.

---

## Worktrees

- Frontend worktree: `D:\Repos\xyito\lingyun\mcode\.worktrees\circle-tab`
- Backend worktree: `D:\Repos\xystack\.worktrees\circle-plugin`
- Frontend branch: `feature/circle-tab`
- Backend branch: `feature/circle-plugin`

## File Structure

Frontend files:

- Create `mcode-app/src/pages/circles/circleMock.ts`: typed mock data and pure toggle helpers.
- Create `mcode-app/src/pages/circles/index.vue`: circle tab UI using the mock helper.
- Modify `mcode-app/src/pages.json`: register `pages/circles/index` and add the tabBar entry.
- Create `mcode-app/src/static/tabbar/circles.png`: inactive tab icon.
- Create `mcode-app/src/static/tabbar/circles-active.png`: active tab icon.
- Create `mcode-app/tests/pages/circles/circleMock.spec.ts`: unit tests for mock interaction state.

Backend files:

- Create `back-end/xycloud/app/_content/circle/install/install.json`: plugin metadata and table DDL.
- Create `back-end/xycloud/app/_content/circle/install/install.php`: export config.
- Create `back-end/xycloud/app/_content/circle/model/Post.php`: `circle_post` model with soft delete and scoped autoincrement id.
- Create `back-end/xycloud/app/_content/circle/model/Topic.php`: `circle_topic` model with soft delete and scoped autoincrement id.
- Create `back-end/xycloud/app/_content/circle/service/Post.php`: post enrichment and lookup.
- Create `back-end/xycloud/app/_content/circle/service/Topic.php`: topic enrichment and lookup.
- Create `back-end/xycloud/app/_content/circle/controller/Post.php`: public list, info, add endpoints.
- Create `back-end/xycloud/app/_content/circle/controller/Topic.php`: public list and info endpoints.
- Create `back-end/xycloud/app/_content/circle/admin/Post.php`: thin admin list/add/edit/delete scaffold.
- Create `back-end/xycloud/app/_content/circle/admin/Topic.php`: thin admin list/add/edit/delete scaffold.

---

### Task 1: Frontend Mock State

**Files:**
- Create: `mcode-app/src/pages/circles/circleMock.ts`
- Create: `mcode-app/tests/pages/circles/circleMock.spec.ts`

- [ ] **Step 1: Write the failing unit tests**

Create `mcode-app/tests/pages/circles/circleMock.spec.ts`:

```ts
import {
  cloneCirclePosts,
  toggleCirclePostFavorite,
  toggleCirclePostLike,
} from "../../../src/pages/circles/circleMock"

describe("circle mock state", () => {
  it("clones posts so page mutations do not mutate source mocks", () => {
    const first = cloneCirclePosts()
    const second = cloneCirclePosts()

    first[0].liked = !first[0].liked

    expect(second[0].liked).toBe(false)
  })

  it("toggles like state and keeps counts non-negative", () => {
    const posts = cloneCirclePosts()
    const firstId = posts[0].id

    toggleCirclePostLike(posts, firstId)
    expect(posts[0].liked).toBe(true)
    expect(posts[0].likeCount).toBe(129)

    toggleCirclePostLike(posts, firstId)
    expect(posts[0].liked).toBe(false)
    expect(posts[0].likeCount).toBe(128)
  })

  it("toggles favorite state and keeps counts non-negative", () => {
    const posts = cloneCirclePosts()
    const firstId = posts[0].id

    toggleCirclePostFavorite(posts, firstId)
    expect(posts[0].favorited).toBe(true)
    expect(posts[0].favoriteCount).toBe(37)

    toggleCirclePostFavorite(posts, firstId)
    expect(posts[0].favorited).toBe(false)
    expect(posts[0].favoriteCount).toBe(36)
  })
})
```

Run: `npm run test:unit -- tests/pages/circles/circleMock.spec.ts --runInBand`

Expected: FAIL because `circleMock.ts` does not exist.

- [ ] **Step 2: Implement typed mock data and pure helpers**

Create `mcode-app/src/pages/circles/circleMock.ts` with:

```ts
export interface CircleTopic {
  id: number
  title: string
  subtitle: string
  accent: string
  heat: string
}

export interface CircleRankingItem {
  id: number
  title: string
  meta: string
  trend: "up" | "hot" | "new"
}

export interface CirclePost {
  id: number
  author: string
  avatarText: string
  role: string
  time: string
  title: string
  content: string
  images: string[]
  tags: string[]
  topic: string
  likeCount: number
  commentCount: number
  favoriteCount: number
  liked: boolean
  favorited: boolean
}

export const mockTopics: CircleTopic[] = [
  { id: 1, title: "产品共创", subtitle: "128 条新动态", accent: "#2f7cf6", heat: "8.9k" },
  { id: 2, title: "远程工作流", subtitle: "效率方案集合", accent: "#34c759", heat: "6.2k" },
  { id: 3, title: "AI 编程现场", subtitle: "实战复盘", accent: "#ff9f0a", heat: "5.1k" },
]

export const mockRankingItems: CircleRankingItem[] = [
  { id: 1, title: "手机接管电脑 AI 的最佳场景", meta: "2.4k 讨论", trend: "hot" },
  { id: 2, title: "Codex 与 Claude 的协作边界", meta: "968 收藏", trend: "up" },
  { id: 3, title: "待办如何沉淀成可执行计划", meta: "新话题", trend: "new" },
]

export const mockPosts: CirclePost[] = [
  {
    id: 101,
    author: "林屿",
    avatarText: "林",
    role: "产品设计师",
    time: "12 分钟前",
    title: "把手机变成 AI 工作台后，最明显的变化是什么？",
    content: "我现在会把碎片时间里的想法先丢到移动端，再回桌面继续执行。关键不是多一个入口，而是上下文能不能稳定接住。",
    images: ["/static/illustrations/connection-ai-coding-hero.svg"],
    tags: ["远程控制", "工作流", "MCode"],
    topic: "产品共创",
    likeCount: 128,
    commentCount: 24,
    favoriteCount: 36,
    liked: false,
    favorited: false,
  },
  {
    id: 102,
    author: "南川",
    avatarText: "南",
    role: "全栈工程师",
    time: "48 分钟前",
    title: "今天用移动端处理了一次线上小故障",
    content: "连接、会话、待办已经能串起来。圈子如果能沉淀真实案例，会比普通社区更有价值。",
    images: [],
    tags: ["案例复盘", "移动开发"],
    topic: "AI 编程现场",
    likeCount: 76,
    commentCount: 11,
    favoriteCount: 19,
    liked: false,
    favorited: true,
  },
  {
    id: 103,
    author: "青禾",
    avatarText: "青",
    role: "独立开发者",
    time: "昨天",
    title: "我想要一个产品话题榜，而不是泛泛的信息流",
    content: "榜单可以帮新用户快速知道大家在讨论什么，动态流负责承接深度内容。两者结合会更像产品社区。",
    images: [],
    tags: ["话题榜", "社区"],
    topic: "产品共创",
    likeCount: 93,
    commentCount: 18,
    favoriteCount: 27,
    liked: false,
    favorited: false,
  },
]

export function cloneCirclePosts(): CirclePost[] {
  return mockPosts.map((post) => ({
    ...post,
    images: [...post.images],
    tags: [...post.tags],
  }))
}

export function toggleCirclePostLike(posts: CirclePost[], id: number): void {
  const post = posts.find((item) => item.id === id)
  if (!post) return
  post.liked = !post.liked
  post.likeCount = Math.max(0, post.likeCount + (post.liked ? 1 : -1))
}

export function toggleCirclePostFavorite(posts: CirclePost[], id: number): void {
  const post = posts.find((item) => item.id === id)
  if (!post) return
  post.favorited = !post.favorited
  post.favoriteCount = Math.max(0, post.favoriteCount + (post.favorited ? 1 : -1))
}
```

- [ ] **Step 3: Run the focused unit tests**

Run: `npm run test:unit -- tests/pages/circles/circleMock.spec.ts --runInBand`

Expected: PASS with 3 tests.

- [ ] **Step 4: Commit frontend mock state**

Run:

```powershell
git add -- mcode-app/src/pages/circles/circleMock.ts mcode-app/tests/pages/circles/circleMock.spec.ts
git commit -m "feat(app): add circle mock state"
```

---

### Task 2: Frontend Circle Tab Page

**Files:**
- Create: `mcode-app/src/pages/circles/index.vue`
- Modify: `mcode-app/src/pages.json`
- Create: `mcode-app/src/static/tabbar/circles.png`
- Create: `mcode-app/src/static/tabbar/circles-active.png`

- [ ] **Step 1: Add the page and tabBar registration**

Modify `mcode-app/src/pages.json`:

```json
{
  "path": "pages/circles/index",
  "style": {
    "navigationStyle": "custom",
    "navigationBarTitleText": "圈子",
    "enablePullDownRefresh": false
  }
}
```

Insert the page after `pages/todos/index`. Insert this tabBar item between `待办` and `我的`:

```json
{
  "pagePath": "pages/circles/index",
  "text": "圈子",
  "iconPath": "static/tabbar/circles.png",
  "selectedIconPath": "static/tabbar/circles-active.png"
}
```

- [ ] **Step 2: Add generated tab icons**

Create `circles.png` and `circles-active.png` as 64x64 PNGs with a simple two-person circle glyph. Use inactive color `#8f8f94` and active color `#2979ff`.

Run to verify files exist:

```powershell
Test-Path src\static\tabbar\circles.png
Test-Path src\static\tabbar\circles-active.png
```

Expected: both commands print `True`.

- [ ] **Step 3: Implement the circle page**

Create `mcode-app/src/pages/circles/index.vue` with:

```vue
<template>
  <view class="page circles-page" :style="[upThemeVars, upThemePageStyle]">
    <view class="circles-shell">
      <up-sticky class="circles-sticky" :offset-top="0" :custom-nav-height="0" :bg-color="upThemeVar('--mcode-page-bg', '#f5f5f7')" z-index="20">
        <view class="circles-header">
          <view class="circles-header__copy">
            <text class="circles-header__eyebrow">COMMUNITY</text>
            <text class="circles-header__title">圈子</text>
          </view>
          <view class="circles-header__action" @click="showReservedToast('发布入口即将接入')">
            <up-icon name="plus" size="16" color="#ffffff"></up-icon>
          </view>
        </view>

        <view class="circles-searchbar">
          <up-search
            v-model="searchKeyword"
            placeholder="搜索话题、动态和案例"
            :show-action="false"
            shape="round"
            :bgColor="upThemeVar('--mcode-field-bg', '#e9eaee')"
            borderColor="transparent"
            :color="upThemeVar('--mcode-text-primary', '#1a1b1f')"
            :placeholderColor="upThemeVar('--mcode-text-tertiary', '#9ca3af')"
            :searchIconColor="upThemeVar('--mcode-text-tertiary', '#8b93a5')"
            :height="44"
          ></up-search>
        </view>
      </up-sticky>

      <view class="circle-hero" :style="upThemeCardStyle">
        <view class="circle-hero__copy">
          <text class="circle-hero__label">今日共创现场</text>
          <text class="circle-hero__title">把移动端的 AI 工作流沉淀成真实案例</text>
          <text class="circle-hero__desc">分享远程控制、会话接续、待办执行和产品反馈。</text>
        </view>
        <view class="circle-hero__stats">
          <view class="circle-hero__stat">
            <text class="circle-hero__stat-value">2.8k</text>
            <text class="circle-hero__stat-label">成员</text>
          </view>
          <view class="circle-hero__stat">
            <text class="circle-hero__stat-value">128</text>
            <text class="circle-hero__stat-label">今日动态</text>
          </view>
        </view>
      </view>

      <scroll-view class="topic-scroll" scroll-x show-scrollbar="false" enhanced>
        <view class="topic-row">
          <view
            v-for="topic in mockTopics"
            :key="topic.id"
            class="topic-card"
            :style="{ '--topic-accent': topic.accent }"
            @click="showReservedToast(`${topic.title} 话题页即将接入`)"
          >
            <text class="topic-card__title">{{ topic.title }}</text>
            <text class="topic-card__subtitle">{{ topic.subtitle }}</text>
            <text class="topic-card__heat">{{ topic.heat }} 热度</text>
          </view>
        </view>
      </scroll-view>

      <view class="ranking-card" :style="upThemeCardStyle">
        <view class="section-head">
          <text class="section-head__title">热榜</text>
          <text class="section-head__action" @click="showReservedToast('热榜详情即将接入')">全部</text>
        </view>
        <view class="ranking-list">
          <view v-for="item in mockRankingItems" :key="item.id" class="ranking-item">
            <text class="ranking-item__index">{{ item.id }}</text>
            <view class="ranking-item__body">
              <text class="ranking-item__title u-line-1">{{ item.title }}</text>
              <text class="ranking-item__meta">{{ item.meta }}</text>
            </view>
            <text :class="['ranking-item__trend', `ranking-item__trend--${item.trend}`]">{{ trendLabel(item.trend) }}</text>
          </view>
        </view>
      </view>

      <view class="feed-section">
        <view class="section-head section-head--feed">
          <text class="section-head__title">动态</text>
          <text class="section-head__hint">{{ filteredPosts.length }} 条</text>
        </view>

        <view v-for="post in filteredPosts" :key="post.id" class="post-card" :style="upThemeCardStyle">
          <view class="post-card__author">
            <view class="post-card__avatar">
              <text class="post-card__avatar-text">{{ post.avatarText }}</text>
            </view>
            <view class="post-card__author-main">
              <view class="post-card__author-line">
                <text class="post-card__author-name">{{ post.author }}</text>
                <text class="post-card__role">{{ post.role }}</text>
              </view>
              <text class="post-card__time">{{ post.time }} · #{{ post.topic }}</text>
            </view>
            <up-icon name="more-dot-fill" size="18" :color="upThemeVar('--mcode-text-tertiary', '#8b93a5')"></up-icon>
          </view>

          <text class="post-card__title">{{ post.title }}</text>
          <text class="post-card__content">{{ post.content }}</text>

          <view v-if="post.images.length" class="post-card__image-wrap">
            <image class="post-card__image" :src="post.images[0]" mode="aspectFit" />
          </view>

          <view class="post-card__tags">
            <text v-for="tag in post.tags" :key="tag" class="post-card__tag">#{{ tag }}</text>
          </view>

          <view class="post-card__actions">
            <view :class="['post-action', post.liked && 'post-action--active']" @click="toggleLike(post.id)">
              <up-icon :name="post.liked ? 'heart-fill' : 'heart'" size="16" :color="post.liked ? '#ff3b30' : upThemeVar('--mcode-text-tertiary', '#8b93a5')"></up-icon>
              <text>{{ post.likeCount }}</text>
            </view>
            <view class="post-action" @click="showReservedToast('评论面板即将接入')">
              <up-icon name="chat" size="16" :color="upThemeVar('--mcode-text-tertiary', '#8b93a5')"></up-icon>
              <text>{{ post.commentCount }}</text>
            </view>
            <view :class="['post-action', post.favorited && 'post-action--active']" @click="toggleFavorite(post.id)">
              <up-icon :name="post.favorited ? 'star-fill' : 'star'" size="16" :color="post.favorited ? '#ff9f0a' : upThemeVar('--mcode-text-tertiary', '#8b93a5')"></up-icon>
              <text>{{ post.favoriteCount }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import {
  cloneCirclePosts,
  mockRankingItems,
  mockTopics,
  toggleCirclePostFavorite,
  toggleCirclePostLike,
} from "./circleMock"

const searchKeyword = ref("")
const posts = ref(cloneCirclePosts())

const filteredPosts = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return posts.value
  return posts.value.filter((post) =>
    [post.title, post.content, post.topic, ...post.tags]
      .join(" ")
      .toLowerCase()
      .includes(keyword)
  )
})

function trendLabel(trend: "up" | "hot" | "new") {
  if (trend === "up") return "上升"
  if (trend === "new") return "新"
  return "热"
}

function toggleLike(id: number) {
  toggleCirclePostLike(posts.value, id)
}

function toggleFavorite(id: number) {
  toggleCirclePostFavorite(posts.value, id)
}

function showReservedToast(title: string) {
  uni.showToast({ title, icon: "none" })
}
</script>
```

Add scoped SCSS in the same file using existing tokens:

```scss
<style scoped lang="scss">
.page { min-height: 100vh; padding: 0 !important; }
.circles-page { background: var(--mcode-page-bg); }
.circles-shell { min-height: 100vh; padding: 0 24rpx 40rpx; box-sizing: border-box; }
.circles-sticky { position: relative; z-index: 20; }
.circles-sticky :deep(.u-sticky__content) { padding-top: 28rpx; background: var(--mcode-page-bg); }
.circles-header { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; margin-bottom: 18rpx; }
.circles-header__copy { display: flex; flex-direction: column; gap: 6rpx; }
.circles-header__eyebrow { font-size: 20rpx; font-weight: 800; letter-spacing: 0.18em; color: var(--mcode-primary); }
.circles-header__title { font-size: 60rpx; font-weight: 800; line-height: 1.06; letter-spacing: -0.05em; color: var(--mcode-text-primary); }
.circles-header__action { width: 58rpx; height: 58rpx; border-radius: 999rpx; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #0a84ff, #2f7cf6); box-shadow: 0 18rpx 36rpx rgba(47, 124, 246, 0.24); }
.circles-searchbar { margin-bottom: 24rpx; }
.circles-searchbar :deep(.u-search__content) { border: none !important; border-radius: 24rpx !important; background-color: var(--mcode-field-bg) !important; }
.circle-hero, .ranking-card, .post-card { border-radius: 32rpx; background: var(--mcode-card-bg) !important; border: var(--mcode-surface-border); box-shadow: var(--mcode-soft-shadow) !important; }
.circle-hero { display: flex; justify-content: space-between; gap: 24rpx; padding: 30rpx; overflow: hidden; background: linear-gradient(135deg, color-mix(in srgb, var(--mcode-primary) 14%, var(--mcode-card-bg) 86%), var(--mcode-card-bg)) !important; }
.circle-hero__copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12rpx; }
.circle-hero__label { font-size: 20rpx; font-weight: 800; letter-spacing: 0.16em; color: var(--mcode-primary); }
.circle-hero__title { font-size: 36rpx; line-height: 1.25; font-weight: 800; color: var(--mcode-text-primary); }
.circle-hero__desc { font-size: 24rpx; line-height: 1.5; color: var(--mcode-text-secondary); }
.circle-hero__stats { display: flex; flex-direction: column; gap: 14rpx; flex-shrink: 0; }
.circle-hero__stat { min-width: 118rpx; padding: 16rpx 18rpx; border-radius: 24rpx; background: rgba(255, 255, 255, 0.58); }
.circle-hero__stat-value { display: block; font-size: 30rpx; font-weight: 800; color: var(--mcode-text-primary); }
.circle-hero__stat-label { display: block; margin-top: 4rpx; font-size: 20rpx; color: var(--mcode-text-tertiary); }
.topic-scroll { width: 100%; margin: 24rpx 0; white-space: nowrap; }
.topic-row { display: flex; gap: 16rpx; padding-right: 8rpx; }
.topic-card { width: 230rpx; flex-shrink: 0; padding: 22rpx; border-radius: 28rpx; background: color-mix(in srgb, var(--topic-accent) 10%, var(--mcode-card-bg) 90%); border: 1rpx solid color-mix(in srgb, var(--topic-accent) 22%, var(--mcode-card-bg) 78%); }
.topic-card__title, .topic-card__subtitle, .topic-card__heat { display: block; }
.topic-card__title { font-size: 28rpx; font-weight: 800; color: var(--mcode-text-primary); }
.topic-card__subtitle { margin-top: 10rpx; font-size: 22rpx; color: var(--mcode-text-secondary); }
.topic-card__heat { margin-top: 18rpx; font-size: 20rpx; font-weight: 700; color: var(--topic-accent); }
.ranking-card { padding: 24rpx; margin-bottom: 28rpx; }
.section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18rpx; }
.section-head--feed { padding: 0 8rpx; }
.section-head__title { font-size: 32rpx; font-weight: 800; color: var(--mcode-text-primary); }
.section-head__action, .section-head__hint { font-size: 22rpx; font-weight: 700; color: var(--mcode-primary); }
.ranking-list { display: flex; flex-direction: column; gap: 16rpx; }
.ranking-item { display: flex; align-items: center; gap: 16rpx; }
.ranking-item__index { width: 42rpx; height: 42rpx; border-radius: 14rpx; background: var(--mcode-primary-soft-bg); color: var(--mcode-primary); text-align: center; line-height: 42rpx; font-size: 22rpx; font-weight: 800; }
.ranking-item__body { flex: 1; min-width: 0; }
.ranking-item__title { display: block; font-size: 26rpx; font-weight: 700; color: var(--mcode-text-primary); }
.ranking-item__meta { display: block; margin-top: 6rpx; font-size: 20rpx; color: var(--mcode-text-tertiary); }
.ranking-item__trend { padding: 7rpx 12rpx; border-radius: 999rpx; font-size: 18rpx; font-weight: 800; background: var(--mcode-card-soft-bg); color: var(--mcode-text-tertiary); }
.ranking-item__trend--hot { background: rgba(255, 59, 48, 0.12); color: #ff3b30; }
.ranking-item__trend--up { background: rgba(52, 199, 89, 0.14); color: #22a957; }
.ranking-item__trend--new { background: rgba(47, 124, 246, 0.12); color: var(--mcode-primary); }
.feed-section { display: flex; flex-direction: column; gap: 18rpx; padding-bottom: calc(36rpx + env(safe-area-inset-bottom)); }
.post-card { padding: 24rpx; }
.post-card__author { display: flex; align-items: center; gap: 16rpx; margin-bottom: 20rpx; }
.post-card__avatar { width: 72rpx; height: 72rpx; border-radius: 24rpx; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--mcode-primary), #64d2ff); }
.post-card__avatar-text { font-size: 28rpx; font-weight: 800; color: #fff; }
.post-card__author-main { flex: 1; min-width: 0; }
.post-card__author-line { display: flex; align-items: center; gap: 10rpx; }
.post-card__author-name { font-size: 28rpx; font-weight: 800; color: var(--mcode-text-primary); }
.post-card__role { padding: 5rpx 10rpx; border-radius: 999rpx; font-size: 18rpx; font-weight: 700; color: var(--mcode-primary); background: var(--mcode-primary-soft-bg); }
.post-card__time { display: block; margin-top: 6rpx; font-size: 21rpx; color: var(--mcode-text-tertiary); }
.post-card__title { display: block; margin-bottom: 12rpx; font-size: 32rpx; line-height: 1.35; font-weight: 800; color: var(--mcode-text-primary); }
.post-card__content { display: block; font-size: 26rpx; line-height: 1.62; color: var(--mcode-text-secondary); }
.post-card__image-wrap { margin-top: 20rpx; border-radius: 26rpx; overflow: hidden; background: var(--mcode-card-soft-bg); }
.post-card__image { width: 100%; height: 260rpx; display: block; }
.post-card__tags { display: flex; flex-wrap: wrap; gap: 10rpx; margin-top: 20rpx; }
.post-card__tag { padding: 8rpx 14rpx; border-radius: 999rpx; font-size: 20rpx; font-weight: 700; background: var(--mcode-card-soft-bg); color: var(--mcode-text-secondary); }
.post-card__actions { display: flex; align-items: center; justify-content: space-around; gap: 10rpx; margin-top: 22rpx; padding-top: 18rpx; border-top: var(--mcode-surface-border); }
.post-action { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8rpx; min-height: 48rpx; border-radius: 999rpx; color: var(--mcode-text-tertiary); font-size: 22rpx; font-weight: 700; }
.post-action--active { background: var(--mcode-card-soft-bg); color: var(--mcode-text-primary); }
@media (max-width: 750rpx) {
  .circles-shell { padding-left: 16rpx; padding-right: 16rpx; }
  .circle-hero { padding: 24rpx; }
  .circle-hero__stats { display: none; }
}
</style>
```

- [ ] **Step 4: Verify pages JSON and run frontend tests**

Run:

```powershell
node -e "JSON.parse(require('fs').readFileSync('src/pages.json','utf8')); console.log('pages.json ok')"
npm run test:unit -- tests/pages/circles/circleMock.spec.ts --runInBand
```

Expected: `pages.json ok`, focused tests pass.

- [ ] **Step 5: Commit frontend tab UI**

Run:

```powershell
git add -- mcode-app/src/pages.json mcode-app/src/pages/circles/index.vue mcode-app/src/static/tabbar/circles.png mcode-app/src/static/tabbar/circles-active.png
git commit -m "feat(app): add circle tab"
```

---

### Task 3: Backend Circle Models and Services

**Files:**
- Create: `back-end/xycloud/app/_content/circle/model/Post.php`
- Create: `back-end/xycloud/app/_content/circle/model/Topic.php`
- Create: `back-end/xycloud/app/_content/circle/service/Post.php`
- Create: `back-end/xycloud/app/_content/circle/service/Topic.php`

- [ ] **Step 1: Create models**

Create `Post.php` and `Topic.php` under `model` with `protected $table = DB_PREFIX . 'circle_post'` and `protected $table = DB_PREFIX . 'circle_topic'`, `protected $pk = 'gid'`, `SoftDelete`, and `onBeforeInsert` matching the scoped id logic from `forum`.

- [ ] **Step 2: Create `Topic` service**

Create `service/Topic.php` with `getExtend()` and `getByIdOrName()`:

```php
public function getExtend($value)
{
    if ($value['name']) {
        $value['nameAlias'] = $value['name'];
    } else {
        $value['nameAlias'] = $value['id'];
    }
    $value['href'] = url('circle/post/lists', ['topicId' => $value['id']]);
    if (isset($value['siteRec']) && $value['siteRec']) {
        $value['siteRec'] = explode(',', $value['siteRec']);
    } else {
        $value['siteRec'] = [];
    }
    return $value;
}
```

- [ ] **Step 3: Create `Post` service**

Create `service/Post.php` with `getExtend()` and `getByIdOrName()`. In `getExtend()`, compute:

```php
$value['likeCount'] = actionModel::where('cloudId', '=', $value['cloudId'])
    ->where('dataModel', 'circle_post')
    ->where('dataId', $value['id'])
    ->where('actionType', 1)
    ->where('actionValue', 1)
    ->count();
$value['favoriteCount'] = actionModel::where('cloudId', '=', $value['cloudId'])
    ->where('dataModel', 'circle_post')
    ->where('dataId', $value['id'])
    ->where('actionType', 2)
    ->where('actionValue', 1)
    ->count();
$value['commentCount'] = commentModel::where('cloudId', '=', $value['cloudId'])
    ->where('dataModel', 'circle_post')
    ->where('dataId', $value['id'])
    ->where('status', 1)
    ->where('reviewStatus', 1)
    ->count();
```

Also decode `images`, split `tags`, attach `topicInfo`, attach `userInfo`, and read current-user `actionStates` from `action`.

- [ ] **Step 4: Commit backend models and services**

Run in `D:\Repos\xystack\.worktrees\circle-plugin`:

```powershell
git add -- back-end/xycloud/app/_content/circle/model back-end/xycloud/app/_content/circle/service
git commit -m "feat(content): add circle models and services"
```

---

### Task 4: Backend Circle Controllers

**Files:**
- Create: `back-end/xycloud/app/_content/circle/controller/Post.php`
- Create: `back-end/xycloud/app/_content/circle/controller/Topic.php`

- [ ] **Step 1: Create topic controller**

Create `controller/Topic.php` with:

- `lists()`: accepts `siteRec`, `page`, `limit`, filters `status = 1`, `cloudId = $this->cloudId`, optional `eid`, returns `dataList` and `dataPage`.
- `info($id)`: uses `uiadmin\circle\service\Topic()->getByIdOrName($id)` and returns `info`.

- [ ] **Step 2: Create post controller**

Create `controller/Post.php` with:

- `lists()`: accepts `topicId`, `siteRec`, `keyword`, `page`, `limit`; filters active reviewed posts and returns enriched `dataList`, `hotTopics`, `dataPage`.
- `info($id)`: uses `uiadmin\circle\service\Post()->getByIdOrName($id)`, increments `viewCount`, returns `info`.
- `add()`: requires login, validates `content` length 1-2000, accepts optional `title`, `topicId`, `images`, `tags`, writes only `circle_post`.

The controller must not call comment add or action set.

- [ ] **Step 3: Commit backend controllers**

Run:

```powershell
git add -- back-end/xycloud/app/_content/circle/controller
git commit -m "feat(content): add circle public APIs"
```

---

### Task 5: Backend Install and Admin Scaffold

**Files:**
- Create: `back-end/xycloud/app/_content/circle/install/install.json`
- Create: `back-end/xycloud/app/_content/circle/install/install.php`
- Create: `back-end/xycloud/app/_content/circle/admin/Post.php`
- Create: `back-end/xycloud/app/_content/circle/admin/Topic.php`

- [ ] **Step 1: Create install metadata and DDL**

Create `install/install.json` with plugin name `circle`, title `圈子`, and tables `xy_circle_topic` and `xy_circle_post`. Include seed topics:

```json
[
  { "id": 1, "name": "product", "title": "产品共创", "description": "产品反馈与共创讨论", "status": 1 },
  { "id": 2, "name": "workflow", "title": "远程工作流", "description": "移动端远程 AI 工作流", "status": 1 },
  { "id": 3, "name": "coding", "title": "AI 编程现场", "description": "AI 编程实战复盘", "status": 1 }
]
```

Create `install/install.php` returning export row limits for `circle_topic` and `circle_post`.

- [ ] **Step 2: Create thin admin classes**

Create `admin/Topic.php` and `admin/Post.php` using `BaseAdmin`, `MenuItem`, `XyBuilderList`, and `XyBuilderForm`. Keep fields to topic title/name/status/sort and post topic/title/content/status/sort.

- [ ] **Step 3: Validate JSON**

Run:

```powershell
php -v
node -e "JSON.parse(require('fs').readFileSync('back-end/xycloud/app/_content/circle/install/install.json','utf8')); console.log('install json ok')"
```

Expected: `php -v` may fail if PHP is unavailable in the shell; JSON validation must print `install json ok`.

- [ ] **Step 4: Commit backend install and admin scaffold**

Run:

```powershell
git add -- back-end/xycloud/app/_content/circle/install back-end/xycloud/app/_content/circle/admin
git commit -m "feat(content): add circle install and admin"
```

---

### Task 6: Final Verification

**Files:**
- Verify frontend worktree.
- Verify backend worktree.

- [ ] **Step 1: Run frontend verification**

Run in `D:\Repos\xyito\lingyun\mcode\.worktrees\circle-tab\mcode-app`:

```powershell
node -e "JSON.parse(require('fs').readFileSync('src/pages.json','utf8')); console.log('pages.json ok')"
npm run test:unit
npm run build:h5
```

Expected:

- `pages.json ok`
- `17+` Jest suites pass, including `circleMock.spec.ts`
- H5 build completes

- [ ] **Step 2: Run backend verification**

Run in `D:\Repos\xystack\.worktrees\circle-plugin`:

```powershell
node -e "JSON.parse(require('fs').readFileSync('back-end/xycloud/app/_content/circle/install/install.json','utf8')); console.log('install json ok')"
rg "commentModel::create|actionModel::create|/comment/comment/add|/action/action/set" back-end/xycloud/app/_content/circle
php -l back-end/xycloud/app/_content/circle/model/Post.php
```

Expected:

- JSON validation prints `install json ok`.
- `rg` finds no direct writes or endpoint calls for action/comment.
- `php -l` reports no syntax errors if PHP is available. If PHP is unavailable, record that environment limitation.

- [ ] **Step 3: Report git state**

Run:

```powershell
git -C D:\Repos\xyito\lingyun\mcode\.worktrees\circle-tab status --short
git -C D:\Repos\xystack\.worktrees\circle-plugin status --short
```

Expected: both worktrees are clean except ignored dependency folders.
