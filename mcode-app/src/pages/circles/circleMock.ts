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
