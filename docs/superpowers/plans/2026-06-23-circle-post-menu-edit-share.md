# Circle Post Menu Edit Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add share/edit post menus to circle posts, enforce author-only editing through xycloud backend validation, reuse the publish page for editing, and sync the `up-markdown` passthrough patch into the upstream `uview-plus` repository.

**Architecture:** The work splits into three bounded units: xycloud exposes a front-end circle post edit API with ownership checks; mcode-app adds share/menu helpers plus a dual-mode publish page and menu entry points; `uview-plus` source gets the same `linktap`/`copyLink`/`domain` passthrough already patched in the app-local install. Frontend authorization hints remain convenience only, while backend ownership remains authoritative.

**Tech Stack:** Vue 3 + uni-app + TypeScript, xycloud PHP controllers/models/services, Jest unit tests, `uview-plus`.

## Global Constraints

- Reuse the existing publish page for edit mode instead of creating a second editor screen.
- Share behavior copies deterministic text to clipboard; no system-native share sheet integration.
- Backend must enforce author ownership; frontend visibility is not sufficient authorization.
- Existing create-post flow remains unchanged when no `id` route param exists.
- Existing post detail route remains the share target.
- The action menu must not break tap propagation for likes/comments/favorites.
- The ownership check must not rely on author display name, only stable user id.
- Every mcode change must include or update a Markdown note under `docs/mcode-architecture-notes/`.
- Prefer `--up-*` runtime theme variables; do not introduce new `--mcode-*` color aliases.

---

## File Structure

- `D:\Repos\xystack\back-end\xycloud\app\_content\circle\controller\Post.php`
  - Front-end circle API controller; add the mobile-facing edit endpoint and ownership validation flow.
- `D:\Repos\xystack\back-end\xycloud\app\_content\circle\service\Post.php`
  - Existing normalization/persistence helpers; extend only if controller needs a focused update helper.
- `D:\Repos\xyito\lingyun\mcode\mcode-app\src\services\circle.ts`
  - Frontend circle API client; add `updateCirclePost`.
- `D:\Repos\xyito\lingyun\mcode\mcode-app\src\pages\circles/postActions.ts`
  - New helper file for share text generation, menu item resolution, and route helpers.
- `D:\Repos\xyito\lingyun\mcode\mcode-app\src\pages\circles/index.vue`
  - Feed card menu trigger and action handling.
- `D:\Repos\xyito\lingyun\mcode\mcode-app\src\pages\circles/detail.vue`
  - Detail-page share/edit entry integration.
- `D:\Repos\xyito\lingyun\mcode\mcode-app\src\pages\circles/publish.vue`
  - Create/edit dual-mode editor flow and submit behavior.
- `D:\Repos\xyito\lingyun\mcode\mcode-app\tests\services\circle.spec.ts`
  - Extend with `updateCirclePost` API test.
- `D:\Repos\xyito\lingyun\mcode\mcode-app\tests\pages\circles\postActions.spec.ts`
  - New tests for share text and menu items.
- `D:\Repos\xyito\lingyun\mcode\docs\mcode-architecture-notes\2026-06-23-circle-post-menu-edit-share.md`
  - New architecture note for native reimplementation guidance.
- `D:\Repos\xyito\open\uview-plus\src\uni_modules\uview-plus\components\u-markdown\u-markdown.vue`
  - Upstream source sync for Vue/uni module build.
- `D:\Repos\xyito\open\uview-plus\uni-app-x\uni_modules\uview-plus\components\u-markdown\u-markdown.vue`
  - Upstream source sync for uni-app-x build.

### Task 1: Add Backend Circle Post Edit API

**Files:**
- Modify: `D:\Repos\xystack\back-end\xycloud\app\_content\circle\controller\Post.php`
- Modify: `D:\Repos\xystack\back-end\xycloud\app\_content\circle\service\Post.php` (only if a dedicated update helper is needed)
- Test: backend circle post tests in the existing xycloud test location if present; otherwise verify with focused manual request steps documented in the task notes

**Interfaces:**
- Consumes: existing circle post model fields `uid`, `title`, `content`, `topicIds`, `images`
- Produces: `POST /v1/circle/post/edit/<id>` accepting `{ title: string, content: string, topicIds: array, images: array }` and returning xycloud-standard success/failure payloads

- [ ] **Step 1: Inspect the current circle front-end controller add/info implementations and author id access pattern**

```powershell
Get-Content D:\Repos\xystack\back-end\xycloud\app\_content\circle\controller\Post.php -TotalCount 260
Get-Content D:\Repos\xystack\back-end\xycloud\app\_content\circle\service\Post.php -TotalCount 260
```

Expected: existing add/info/list logic and a clear way to read the current user id from the controller base class.

- [ ] **Step 2: Add a failing backend probe or manual request contract note for non-author edit**

```text
Request: POST /v1/circle/post/edit/123
Body: {"title":"x","content":"y","topicIds":[],"images":[]}
Expected before implementation: route missing or not allowed for front-end users.
```

Expected: confirms the mobile-facing edit path is not already available in the correct form.

- [ ] **Step 3: Implement the front-end edit endpoint with ownership validation**

```php
public function edit($id)
{
    $userId = (int) $this->userId;
    if ($userId <= 0) {
        return $this->jsonError('未登录');
    }

    $post = \app\_content\circle\model\Post::find((int) $id);
    if (!$post) {
        return $this->jsonError('动态不存在');
    }
    if ((int) $post['uid'] !== $userId) {
        return $this->jsonError('只能编辑自己的动态');
    }

    $data = [
        'title' => trim((string) input('title', '')),
        'content' => trim((string) input('content', '')),
        'topicIds' => input('topicIds/a', []),
        'images' => input('images/a', []),
    ];

    if ($data['content'] === '') {
        return $this->jsonError('请填写正文');
    }

    $post->save([
        'title' => $data['title'],
        'content' => $data['content'],
        'images' => json_encode($data['images'], JSON_UNESCAPED_UNICODE),
    ]);

    // keep topic relation update aligned with existing add flow
    \app\_content\circle\service\Post::updateTopics((int) $post['id'], $data['topicIds']);

    return $this->jsonSuccess('保存成功', ['id' => (int) $post['id']]);
}
```

Expected: route exists, rejects unauthenticated and non-author edits, persists editable fields, and returns success for the author.

- [ ] **Step 4: Verify author and non-author behavior**

```powershell
rg -n "circle/post/edit|只能编辑自己的动态|保存成功" D:\Repos\xystack\back-end\xycloud\app\_content\circle\controller\Post.php D:\Repos\xystack\back-end\xycloud\app\_content\circle\service\Post.php
```

Expected: the new endpoint and ownership message appear in the controller or delegated service path.

- [ ] **Step 5: Commit**

```bash
git -C D:\Repos\xystack\back-end\xycloud add app/_content/circle/controller/Post.php app/_content/circle/service/Post.php
git -C D:\Repos\xystack\back-end\xycloud commit -m "feat: add circle post author edit api"
```

### Task 2: Extend Frontend Circle Service With Update API

**Files:**
- Modify: `D:\Repos\xyito\lingyun\mcode\mcode-app\src\services\circle.ts`
- Modify: `D:\Repos\xyito\lingyun\mcode\mcode-app\tests\services\circle.spec.ts`

**Interfaces:**
- Consumes: `requestCircle(method, path, data)` internal helper and current `CirclePublishPayload` conventions
- Produces: `updateCirclePost(payload: { id: number; title: string; content: string; topicIds: number[]; images: string[] }): Promise<{ id: number }>`

- [ ] **Step 1: Add a failing service test for post update**

```ts
it("updates a circle post through the edit API", async () => {
  uni.request.mockResolvedValue({
    statusCode: 200,
    data: { code: 200, msg: "ok", data: { id: 101 } },
  })

  const result = await updateCirclePost({
    id: 101,
    title: "更新标题",
    content: "更新正文",
    topicIds: [1, 3],
    images: ["https://cdn.example.com/a.png"],
  })

  expect(uni.request).toHaveBeenCalledWith(expect.objectContaining({
    url: "https://xycloud.example.com/v1/circle/post/edit/101",
    method: "POST",
  }))
  expect(result).toEqual({ id: 101 })
})
```

- [ ] **Step 2: Run the targeted service test to verify it fails**

```bash
npm run test:unit -- --runTestsByPath tests/services/circle.spec.ts
```

Expected: FAIL because `updateCirclePost` does not exist yet.

- [ ] **Step 3: Implement the minimal service method**

```ts
export async function updateCirclePost(payload: CirclePublishPayload & { id: number }): Promise<{ id: number }> {
  const id = Math.max(0, Math.trunc(Number(payload.id || 0)))
  const data = await requestCircle("POST", `/v1/circle/post/edit/${id}`, {
    title: payload.title || "",
    content: payload.content || "",
    topicIds: payload.topicIds || [],
    images: payload.images || [],
  })
  return { id: toNumber((data as Record<string, unknown>)?.id) || id }
}
```

- [ ] **Step 4: Run the service test again**

```bash
npm run test:unit -- --runTestsByPath tests/services/circle.spec.ts
```

Expected: PASS for the new update test and no regression in existing circle service tests.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/services/circle.ts mcode-app/tests/services/circle.spec.ts
git commit -m "feat: add circle post update service"
```

### Task 3: Add Share/Menu Helper Layer

**Files:**
- Create: `D:\Repos\xyito\lingyun\mcode\mcode-app\src\pages\circles/postActions.ts`
- Create: `D:\Repos\xyito\lingyun\mcode\mcode-app\tests\pages\circles\postActions.spec.ts`

**Interfaces:**
- Consumes: `CirclePost` shape and current-user id value
- Produces:
  - `buildCircleShareText(post: Pick<CirclePost, "title" | "content" | "id">): string`
  - `buildCircleDetailRoute(postId: number): string`
  - `resolveCirclePostMenuItems(input: { post: Pick<CirclePost, "id" | "uid">; currentUserId: number }): Array<"share" | "edit">`

- [ ] **Step 1: Write failing helper tests**

```ts
it("builds share text from title and detail route", () => {
  expect(buildCircleShareText({
    id: 101,
    title: "详情标题",
    content: "正文内容",
  } as any)).toBe("详情标题\n/pages/circles/detail?id=101")
})

it("falls back to content excerpt when title is blank", () => {
  expect(buildCircleShareText({
    id: 101,
    title: " ",
    content: "这里是一段很长的正文内容",
  } as any)).toContain("/pages/circles/detail?id=101")
})

it("shows edit only for the author", () => {
  expect(resolveCirclePostMenuItems({
    post: { id: 101, uid: 7 } as any,
    currentUserId: 7,
  })).toEqual(["share", "edit"])
  expect(resolveCirclePostMenuItems({
    post: { id: 101, uid: 7 } as any,
    currentUserId: 8,
  })).toEqual(["share"])
})
```

- [ ] **Step 2: Run the helper tests to verify they fail**

```bash
npm run test:unit -- --runTestsByPath tests/pages/circles/postActions.spec.ts
```

Expected: FAIL because the helper file does not exist yet.

- [ ] **Step 3: Implement the helper file**

```ts
export function buildCircleDetailRoute(postId: number): string {
  return `/pages/circles/detail?id=${Math.max(0, Math.trunc(Number(postId || 0)))}`
}

export function buildCircleShareText(post: { id: number; title?: string; content?: string }): string {
  const title = String(post.title || "").trim()
  const content = String(post.content || "").replace(/\s+/g, " ").trim()
  const summary = title || (content.length > 48 ? `${content.slice(0, 48)}...` : content) || "圈子动态"
  return `${summary}\n${buildCircleDetailRoute(post.id)}`
}

export function resolveCirclePostMenuItems(input: { post: { uid?: number }; currentUserId: number }): Array<"share" | "edit"> {
  return Number(input.post.uid || 0) === Number(input.currentUserId || 0)
    ? ["share", "edit"]
    : ["share"]
}
```

- [ ] **Step 4: Run the helper tests again**

```bash
npm run test:unit -- --runTestsByPath tests/pages/circles/postActions.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/circles/postActions.ts mcode-app/tests/pages/circles/postActions.spec.ts
git commit -m "feat: add circle post share and menu helpers"
```

### Task 4: Add Feed And Detail Post Menus

**Files:**
- Modify: `D:\Repos\xyito\lingyun\mcode\mcode-app\src\pages\circles/index.vue`
- Modify: `D:\Repos\xyito\lingyun\mcode\mcode-app\src\pages\circles/detail.vue`

**Interfaces:**
- Consumes:
  - `buildCircleShareText(post)`
  - `resolveCirclePostMenuItems({ post, currentUserId })`
  - `useAccountStore().userInfo` or equivalent current-user source
- Produces:
  - feed/detail action sheet behavior
  - share clipboard action
  - edit navigation to `/pages/circles/publish?id=<post id>`

- [ ] **Step 1: Inspect current current-user source and right-top menu patterns**

```powershell
rg -n "useAccountStore|showActionSheet|setClipboardData|more-dot-fill" mcode-app/src/pages/circles/index.vue mcode-app/src/pages/circles/detail.vue mcode-app/src/pages/connections/index.vue
```

Expected: identifies the app's current user store shape and an existing action-sheet pattern to mimic.

- [ ] **Step 2: Add feed card menu state and handlers**

```ts
const showPostActionSheet = ref(false)
const actionPost = ref<CirclePost | null>(null)
const actionItems = computed(() => {
  if (!actionPost.value) return []
  return resolveCirclePostMenuItems({
    post: actionPost.value,
    currentUserId: currentUserId.value,
  }).map((key) => ({ key, name: key === "share" ? "分享" : "编辑" }))
})

function openPostActions(post: CirclePost) {
  actionPost.value = post
  showPostActionSheet.value = true
}

function handlePostActionSelect(item: { key?: string; name?: string }) {
  if (!actionPost.value) return
  if (item.key === "share") return copyPostShareText(actionPost.value)
  if (item.key === "edit") {
    uni.navigateTo({ url: `/pages/circles/publish?id=${actionPost.value.id}` })
  }
}
```

- [ ] **Step 3: Wire the feed template so the three-dot tap stops navigation**

```vue
<view class="post-card__author-actions" @click.stop="openPostActions(post)">
  <up-icon name="more-dot-fill" size="18" :color="upThemeVar('--up-tips-color', '#8b93a5')"></up-icon>
</view>

<up-action-sheet
  :show="showPostActionSheet"
  :actions="actionItems"
  @select="handlePostActionSelect"
  @close="showPostActionSheet = false"
></up-action-sheet>
```

- [ ] **Step 4: Add the same action handling to detail page**

```vue
<view class="detail-navbar__share" @click="copyPostShareText(post!)">
  <up-icon name="share-square" size="17" :color="upThemeVar('--up-main-color', '#303133')"></up-icon>
</view>
<view class="detail-author__menu" @click="openPostActions(post)">
  <up-icon name="more-dot-fill" size="18" :color="upThemeVar('--up-tips-color', '#8b93a5')"></up-icon>
</view>
```

Expected: detail supports both direct share action and the same edit menu for authors.

- [ ] **Step 5: Verify menu behavior manually and commit**

```bash
npm run test:unit -- --runTestsByPath tests/pages/circles/postActions.spec.ts
git add mcode-app/src/pages/circles/index.vue mcode-app/src/pages/circles/detail.vue
git commit -m "feat: add circle post share and edit menus"
```

Expected: helper tests still pass; UI code compiles by inspection and follows existing action-sheet pattern.

### Task 5: Convert Publish Page To Create/Edit Dual Mode

**Files:**
- Modify: `D:\Repos\xyito\lingyun\mcode\mcode-app\src\pages\circles/publish.vue`

**Interfaces:**
- Consumes:
  - `fetchCirclePost(postId)`
  - `publishCirclePost(payload)`
  - `updateCirclePost(payload)`
  - `buildCircleDetailRoute(postId)` only if post-save route handling uses it
- Produces:
  - publish page create/edit mode determined by route `id`
  - edit-mode prefill and save flow

- [ ] **Step 1: Add route-mode state and a loading state for edit prefill**

```ts
const editingPostId = ref(0)
const loadingPost = ref(false)
const isEditMode = computed(() => editingPostId.value > 0)
const navbarTitle = computed(() => isEditMode.value ? "编辑动态" : "发布动态")
const submitButtonText = computed(() => isEditMode.value ? "保存" : "发布")

onLoad((options) => {
  editingPostId.value = normalizeId(options?.id)
  void loadTopics()
  if (editingPostId.value) void loadEditingPost()
})
```

- [ ] **Step 2: Implement prefill loader**

```ts
async function loadEditingPost() {
  loadingPost.value = true
  try {
    const post = await fetchCirclePost(editingPostId.value)
    title.value = post.title || ""
    content.value = post.content || ""
    selectedTopicIds.value = [...post.topicIds]
    images.value = [...post.images]
  } catch (error) {
    uni.showToast({ title: normalizeErrorMessage(error), icon: "none" })
  } finally {
    loadingPost.value = false
  }
}
```

- [ ] **Step 3: Switch submit behavior by mode**

```ts
if (isEditMode.value) {
  await updateCirclePost({
    id: editingPostId.value,
    title: showTitleInput.value ? title.value.trim() : "",
    content: normalizedContent,
    topicIds: selectedTopicIds.value,
    images: images.value,
  })
  uni.showToast({ title: "保存成功", icon: "success" })
} else {
  await publishCirclePost({
    title: showTitleInput.value ? title.value.trim() : "",
    content: normalizedContent,
    topicIds: selectedTopicIds.value,
    images: images.value,
  })
  uni.showToast({ title: "发布成功", icon: "success" })
}
```

- [ ] **Step 4: Update the template copy for dual mode**

```vue
<text class="publish-navbar__title">{{ navbarTitle }}</text>
<up-button type="primary" shape="circle" :loading="submitting || uploadingImages || markdownImageUploading" @click="submitPost">
  {{ submitting ? (isEditMode ? "保存中..." : "发布中...") : uploadingImages || markdownImageUploading ? "图片上传中..." : submitButtonText }}
</up-button>
```

- [ ] **Step 5: Run targeted circle tests and commit**

```bash
npm run test:unit -- --runTestsByPath tests/services/circle.spec.ts tests/pages/circles/postActions.spec.ts
git add mcode-app/src/pages/circles/publish.vue
git commit -m "feat: reuse circle publish page for editing"
```

### Task 6: Add Architecture Note For mcode

**Files:**
- Create: `D:\Repos\xyito\lingyun\mcode\docs\mcode-architecture-notes\2026-06-23-circle-post-menu-edit-share.md`

**Interfaces:**
- Consumes: validated implementation details from Tasks 1-5
- Produces: concise native reimplementation note covering architecture, protocol, UI behavior, compatibility, iOS/Android guidance

- [ ] **Step 1: Write the architecture note**

```md
# Circle Post Menu Edit And Share

## Architecture

Circle posts now expose a shared action menu in feed and detail. Share is
clipboard-based. Edit reuses the publish screen in edit mode and is server-side
authorized by post owner id.

## Protocol And Data Flow

- `POST /v1/circle/post/edit/<id>`
- Existing `GET /v1/circle/post/info/<id>`

## UI Behavior

- Feed/detail menu always shows `分享`
- Only authors see `编辑`
- Edit mode pre-fills title/content/topics/images

## Compatibility

- Create mode remains default when route has no `id`
- Share target remains `/pages/circles/detail?id=<id>`

## Native iOS And Android Replication

- Gate edit UI by current user id for convenience only
- Enforce ownership from backend response
- Use the same clipboard share text format
```

- [ ] **Step 2: Sanity-check the note against AGENTS.md and commit**

```bash
git add docs/mcode-architecture-notes/2026-06-23-circle-post-menu-edit-share.md
git commit -m "docs: add circle post menu edit share note"
```

Expected: note exists and covers architecture, protocol/data-flow, UI, compatibility, and native replication guidance.

### Task 7: Sync up-markdown Patch To Upstream uview-plus

**Files:**
- Modify: `D:\Repos\xyito\open\uview-plus\src\uni_modules\uview-plus\components\u-markdown\u-markdown.vue`
- Modify: `D:\Repos\xyito\open\uview-plus\uni-app-x\uni_modules\uview-plus\components\u-markdown\u-markdown.vue`

**Interfaces:**
- Consumes: current app-local `up-markdown` patch behavior
- Produces: upstream `up-markdown` components that re-emit `linktap`, `imgtap`, `load`, `ready`, `play`, `error` and pass through `copyLink` and `domain`

- [ ] **Step 1: Compare the app-local patched file with upstream source**

```powershell
Get-Content D:\Repos\xyito\lingyun\mcode\mcode-app\node_modules\uview-plus\components\u-markdown\u-markdown.vue -TotalCount 120
Get-Content D:\Repos\xyito\open\uview-plus\src\uni_modules\uview-plus\components\u-markdown\u-markdown.vue -TotalCount 120
Get-Content D:\Repos\xyito\open\uview-plus\uni-app-x\uni_modules\uview-plus\components\u-markdown\u-markdown.vue -TotalCount 120
```

Expected: identify exact template/prop/emits differences to sync.

- [ ] **Step 2: Patch the upstream Vue source**

```vue
<up-parse
  :content="parsedContent"
  :previewImg="previewImg"
  :copyLink="copyLink"
  :domain="domain"
  @linktap="$emit('linktap', $event)"
  @imgtap="$emit('imgtap', $event)"
  @load="$emit('load', $event)"
  @ready="$emit('ready', $event)"
  @play="$emit('play', $event)"
  @error="$emit('error', $event)"
></up-parse>
```

And add:

```js
emits: ['load', 'ready', 'imgtap', 'linktap', 'play', 'error'],
copyLink: { type: [Boolean, String], default: true },
domain: { type: String, default: '' },
```

- [ ] **Step 3: Apply the equivalent patch to the uni-app-x source**

```text
Mirror the same public API surface in the uni-app-x implementation so app and x builds stay aligned.
```

- [ ] **Step 4: Verify the upstream repo diff**

```bash
git -C D:\Repos\xyito\open\uview-plus diff -- src/uni_modules/uview-plus/components/u-markdown/u-markdown.vue uni-app-x/uni_modules/uview-plus/components/u-markdown/u-markdown.vue
```

Expected: only the intended passthrough and emits changes appear.

- [ ] **Step 5: Commit**

```bash
git -C D:\Repos\xyito\open\uview-plus add src/uni_modules/uview-plus/components/u-markdown/u-markdown.vue uni-app-x/uni_modules/uview-plus/components/u-markdown/u-markdown.vue
git -C D:\Repos\xyito\open\uview-plus commit -m "feat: forward markdown parse link events"
```

## Self-Review

- Spec coverage:
  - Share menu in feed/detail: Tasks 3-4
  - Author-only edit with backend enforcement: Tasks 1, 4, 5
  - Publish page reuse: Task 5
  - Clipboard share text: Tasks 3-4
  - `uview-plus` upstream sync: Task 7
  - mcode architecture note: Task 6
- Placeholder scan: no `TODO`/`TBD` markers remain; each task includes concrete paths, code, and commands.
- Type consistency:
  - `updateCirclePost(payload)` is introduced in Task 2 and consumed in Task 5.
  - `buildCircleShareText`, `buildCircleDetailRoute`, and `resolveCirclePostMenuItems` are introduced in Task 3 and consumed in Task 4.

