export type CirclePostMenuItem = "share" | "edit"

export function buildCircleDetailRoute(postId: number): string {
  return `/pages/circles/detail?id=${Math.max(0, Math.trunc(Number(postId || 0)))}`
}

export function buildCircleShareText(post: {
  id: number
  title?: string
  content?: string
}): string {
  const title = String(post.title || "").trim()
  const content = String(post.content || "").replace(/\s+/g, " ").trim()
  const excerpt = content.length > 48 ? `${content.slice(0, 48)}...` : content
  const summary = title || excerpt || "圈子动态"
  return `${summary}\n${buildCircleDetailRoute(post.id)}`
}

export function resolveCirclePostMenuItems(input: {
  post: { uid?: number }
  currentUserId: number
}): CirclePostMenuItem[] {
  if (Number(input.post.uid || 0) === Number(input.currentUserId || 0) && Number(input.currentUserId || 0) > 0) {
    return ["share", "edit"]
  }
  return ["share"]
}
