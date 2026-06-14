export type AchievementTitleLevel = "bronze" | "silver" | "gold" | "diamond"
export type AchievementRarity = "normal" | "rare" | "epic" | "legend"
export type AchievementRankScope = "national" | "city" | "friends"
export type AchievementMetric = "response_count" | "response_speed" | "streak_days"

export interface AchievementEntrySummary {
  hasNew: boolean
  unlockedCount: number
  totalCount: number
  title: string
  highlightText: string
  percentile: number
}

export interface AchievementHeroStat {
  key: string
  label: string
  value: number
  unit: string
  compareText: string
}

export interface AchievementSummary {
  userId: string
  nickname: string
  title: {
    name: string
    level: AchievementTitleLevel
    icon: string
  }
  percentile: number
  nationalRank: number
  cityRank: number
  friendRank: number
  score: number
  streakDays: number
  responseCount: number
  avgResponseSeconds: number
  beatTags: string[]
  heroMessage: string
  heroSubMessage: string
  shareCardText: string
  stats: AchievementHeroStat[]
}

export interface AchievementBadge {
  id: string
  code: string
  name: string
  desc: string
  rarity: AchievementRarity
  icon: string
  progress: number
  unlocked: boolean
  current?: number
  target?: number
  unlockedAt?: string
  shareText?: string
}

export interface AchievementRankingUser {
  rank: number
  userId: string
  nickname: string
  avatar: string
  score: number
  title: string
  percentile?: number
  isSelf?: boolean
}

export interface AchievementRankingResponse {
  scope: AchievementRankScope
  metric: AchievementMetric
  updatedAt: string
  self: AchievementRankingUser
  list: AchievementRankingUser[]
}

export interface AchievementFeedItem {
  id: string
  type: "unlock" | "rank_up" | "streak" | "share"
  text: string
  time: string
}

export interface AchievementCenterData {
  summary: AchievementSummary
  unlocked: AchievementBadge[]
  locked: AchievementBadge[]
  feed: AchievementFeedItem[]
}

const entrySummary: AchievementEntrySummary = {
  hasNew: true,
  unlockedCount: 12,
  totalCount: 36,
  title: "金牌 Yes 工程师",
  highlightText: "你的回应次数与速度击败了全国 90% 的用户",
  percentile: 90,
}

const centerData: AchievementCenterData = {
  summary: {
    userId: "u_1001",
    nickname: "你",
    title: {
      name: "金牌 Yes 工程师",
      level: "gold",
      icon: "star-fill",
    },
    percentile: 90,
    nationalRank: 87,
    cityRank: 18,
    friendRank: 3,
    score: 4280,
    streakDays: 18,
    responseCount: 328,
    avgResponseSeconds: 12,
    beatTags: ["全国前 10%", "同城第 18 名", "好友榜第 3 名"],
    heroMessage: "恭喜你，你的回应次数与速度击败了全国 90% 的用户",
    heroSubMessage: "你就是金牌 Yes 工程师，队友的安全感来源之一",
    shareCardText: "恭喜你，你的回应次数与速度击败了全国 90% 的用户，你就是金牌 Yes 工程师。",
    stats: [
      { key: "response_count", label: "回应次数", value: 328, unit: "次", compareText: "超过全国 90% 用户" },
      { key: "response_speed", label: "平均回应速度", value: 12, unit: "秒", compareText: "快过全国 84% 用户" },
      { key: "streak_days", label: "连续活跃", value: 18, unit: "天", compareText: "再坚持 2 天升级头衔" },
      { key: "likes", label: "收获认可", value: 86, unit: "次", compareText: "本周增长 14%" },
    ],
  },
  unlocked: [
    {
      id: "achv_001",
      code: "yes_engineer_gold",
      name: "金牌 Yes 工程师",
      desc: "回应次数与速度综合表现进入全国前 10%",
      rarity: "legend",
      icon: "star-fill",
      progress: 100,
      unlocked: true,
      unlockedAt: "2026-06-14 09:20:00",
      shareText: "我已获得「金牌 Yes 工程师」，回应表现击败全国 90% 用户。",
    },
    {
      id: "achv_002",
      code: "fast_responder",
      name: "闪电回应王",
      desc: "近 7 天平均回应速度保持在 20 秒以内",
      rarity: "epic",
      icon: "clock-fill",
      progress: 100,
      unlocked: true,
      unlockedAt: "2026-06-13 18:40:00",
      shareText: "我刚解锁了「闪电回应王」，近 7 天响应速度击败了 84% 用户。",
    },
    {
      id: "achv_003",
      code: "social_engine",
      name: "社交发动机",
      desc: "累计收获 80 次认可，让协作气氛持续升温",
      rarity: "rare",
      icon: "heart-fill",
      progress: 100,
      unlocked: true,
      unlockedAt: "2026-06-12 10:08:00",
    },
  ],
  locked: [
    {
      id: "achv_101",
      code: "diamond_yes_engineer",
      name: "钻石 Yes 工程师",
      desc: "回应次数与速度进入全国前 5%",
      rarity: "legend",
      icon: "star",
      progress: 82,
      unlocked: false,
      current: 90,
      target: 95,
    },
    {
      id: "achv_102",
      code: "streak_king",
      name: "连续在线王",
      desc: "连续活跃 30 天，让稳定输出成为习惯",
      rarity: "epic",
      icon: "calendar-fill",
      progress: 60,
      unlocked: false,
      current: 18,
      target: 30,
    },
    {
      id: "achv_103",
      code: "night_guard",
      name: "深夜守护者",
      desc: "深夜时段高质量回应 30 次",
      rarity: "rare",
      icon: "chat-fill",
      progress: 46,
      unlocked: false,
      current: 14,
      target: 30,
    },
  ],
  feed: [
    { id: "feed_1", type: "unlock", text: "你刚刚解锁了「金牌 Yes 工程师」", time: "2 分钟前" },
    { id: "feed_2", type: "rank_up", text: "本周响应速度提升 2 秒，城市榜前进了 6 名", time: "今天 10:26" },
    { id: "feed_3", type: "streak", text: "你已经连续活跃 18 天，再坚持 2 天解锁新称号", time: "今天 09:10" },
  ],
}

const rankingTable: Record<AchievementRankScope, Record<AchievementMetric, AchievementRankingResponse>> = {
  national: {
    response_count: {
      scope: "national",
      metric: "response_count",
      updatedAt: "2026-06-14 20:30:00",
      self: { rank: 87, userId: "u_1001", nickname: "你", avatar: "", score: 328, title: "金牌 Yes 工程师", percentile: 90, isSelf: true },
      list: [
        { rank: 1, userId: "u_2001", nickname: "秒回王", avatar: "", score: 908, title: "传说级回应机" },
        { rank: 2, userId: "u_2002", nickname: "回复永动机", avatar: "", score: 882, title: "白金协作官" },
        { rank: 3, userId: "u_2003", nickname: "今天也在接球", avatar: "", score: 835, title: "协作推进器" },
        { rank: 87, userId: "u_1001", nickname: "你", avatar: "", score: 328, title: "金牌 Yes 工程师", percentile: 90, isSelf: true },
      ],
    },
    response_speed: {
      scope: "national",
      metric: "response_speed",
      updatedAt: "2026-06-14 20:30:00",
      self: { rank: 128, userId: "u_1001", nickname: "你", avatar: "", score: 12, title: "闪电回应王", percentile: 84, isSelf: true },
      list: [
        { rank: 1, userId: "u_3001", nickname: "快门工程师", avatar: "", score: 5, title: "秒回之神" },
        { rank: 2, userId: "u_3002", nickname: "这条我来", avatar: "", score: 6, title: "响应节奏大师" },
        { rank: 3, userId: "u_3003", nickname: "已读就回", avatar: "", score: 7, title: "夜班守护者" },
        { rank: 128, userId: "u_1001", nickname: "你", avatar: "", score: 12, title: "闪电回应王", percentile: 84, isSelf: true },
      ],
    },
    streak_days: {
      scope: "national",
      metric: "streak_days",
      updatedAt: "2026-06-14 20:30:00",
      self: { rank: 206, userId: "u_1001", nickname: "你", avatar: "", score: 18, title: "稳定输出机", percentile: 76, isSelf: true },
      list: [
        { rank: 1, userId: "u_4001", nickname: "从不掉线", avatar: "", score: 126, title: "连续在线王" },
        { rank: 2, userId: "u_4002", nickname: "本周全勤", avatar: "", score: 99, title: "坚持系天花板" },
        { rank: 3, userId: "u_4003", nickname: "凌晨三点也在线", avatar: "", score: 88, title: "超长待机官" },
        { rank: 206, userId: "u_1001", nickname: "你", avatar: "", score: 18, title: "稳定输出机", percentile: 76, isSelf: true },
      ],
    },
  },
  city: {
    response_count: {
      scope: "city",
      metric: "response_count",
      updatedAt: "2026-06-14 20:30:00",
      self: { rank: 18, userId: "u_1001", nickname: "你", avatar: "", score: 328, title: "金牌 Yes 工程师", percentile: 94, isSelf: true },
      list: [
        { rank: 1, userId: "u_5001", nickname: "沪上秒回组长", avatar: "", score: 516, title: "城市推进器" },
        { rank: 2, userId: "u_5002", nickname: "今天也不鸽", avatar: "", score: 492, title: "协作主力" },
        { rank: 3, userId: "u_5003", nickname: "消息接力员", avatar: "", score: 455, title: "白金 Yes 工程师" },
        { rank: 18, userId: "u_1001", nickname: "你", avatar: "", score: 328, title: "金牌 Yes 工程师", percentile: 94, isSelf: true },
      ],
    },
    response_speed: {
      scope: "city",
      metric: "response_speed",
      updatedAt: "2026-06-14 20:30:00",
      self: { rank: 12, userId: "u_1001", nickname: "你", avatar: "", score: 12, title: "闪电回应王", percentile: 96, isSelf: true },
      list: [
        { rank: 1, userId: "u_5101", nickname: "上海超快回", avatar: "", score: 4, title: "城市闪电体" },
        { rank: 2, userId: "u_5102", nickname: "需求秒接", avatar: "", score: 5, title: "即时响应官" },
        { rank: 3, userId: "u_5103", nickname: "外卖到前先回完", avatar: "", score: 6, title: "节奏指挥官" },
        { rank: 12, userId: "u_1001", nickname: "你", avatar: "", score: 12, title: "闪电回应王", percentile: 96, isSelf: true },
      ],
    },
    streak_days: {
      scope: "city",
      metric: "streak_days",
      updatedAt: "2026-06-14 20:30:00",
      self: { rank: 36, userId: "u_1001", nickname: "你", avatar: "", score: 18, title: "稳定输出机", percentile: 88, isSelf: true },
      list: [
        { rank: 1, userId: "u_5201", nickname: "不掉线选手", avatar: "", score: 120, title: "超长待机官" },
        { rank: 2, userId: "u_5202", nickname: "一天不缺席", avatar: "", score: 98, title: "连续在线王" },
        { rank: 3, userId: "u_5203", nickname: "城市自律代表", avatar: "", score: 80, title: "全勤执行者" },
        { rank: 36, userId: "u_1001", nickname: "你", avatar: "", score: 18, title: "稳定输出机", percentile: 88, isSelf: true },
      ],
    },
  },
  friends: {
    response_count: {
      scope: "friends",
      metric: "response_count",
      updatedAt: "2026-06-14 20:30:00",
      self: { rank: 3, userId: "u_1001", nickname: "你", avatar: "", score: 328, title: "金牌 Yes 工程师", percentile: 82, isSelf: true },
      list: [
        { rank: 1, userId: "u_6001", nickname: "阿周", avatar: "", score: 468, title: "铂金沟通大师" },
        { rank: 2, userId: "u_6002", nickname: "Momo", avatar: "", score: 410, title: "钻石协作官" },
        { rank: 3, userId: "u_1001", nickname: "你", avatar: "", score: 328, title: "金牌 Yes 工程师", percentile: 82, isSelf: true },
        { rank: 4, userId: "u_6003", nickname: "阿青", avatar: "", score: 286, title: "稳定接球手" },
      ],
    },
    response_speed: {
      scope: "friends",
      metric: "response_speed",
      updatedAt: "2026-06-14 20:30:00",
      self: { rank: 2, userId: "u_1001", nickname: "你", avatar: "", score: 12, title: "闪电回应王", percentile: 91, isSelf: true },
      list: [
        { rank: 1, userId: "u_6101", nickname: "今夜必回", avatar: "", score: 10, title: "好友嘴替之王" },
        { rank: 2, userId: "u_1001", nickname: "你", avatar: "", score: 12, title: "闪电回应王", percentile: 91, isSelf: true },
        { rank: 3, userId: "u_6102", nickname: "消息不隔夜", avatar: "", score: 18, title: "夜班守护者" },
        { rank: 4, userId: "u_6103", nickname: "一会就回", avatar: "", score: 24, title: "高能响应王" },
      ],
    },
    streak_days: {
      scope: "friends",
      metric: "streak_days",
      updatedAt: "2026-06-14 20:30:00",
      self: { rank: 4, userId: "u_1001", nickname: "你", avatar: "", score: 18, title: "稳定输出机", percentile: 74, isSelf: true },
      list: [
        { rank: 1, userId: "u_6201", nickname: "周周在线", avatar: "", score: 45, title: "超长待机官" },
        { rank: 2, userId: "u_6202", nickname: "阿狸", avatar: "", score: 32, title: "连续在线王" },
        { rank: 3, userId: "u_6203", nickname: "永远绿色", avatar: "", score: 21, title: "坚持系选手" },
        { rank: 4, userId: "u_1001", nickname: "你", avatar: "", score: 18, title: "稳定输出机", percentile: 74, isSelf: true },
      ],
    },
  },
}

function cloneBadge(badge: AchievementBadge): AchievementBadge {
  return { ...badge }
}

function cloneSummary(summary: AchievementSummary): AchievementSummary {
  return {
    ...summary,
    title: { ...summary.title },
    beatTags: [...summary.beatTags],
    stats: summary.stats.map((item) => ({ ...item })),
  }
}

function cloneRankingUser(user: AchievementRankingUser): AchievementRankingUser {
  return { ...user }
}

function cloneRankingResponse(ranking: AchievementRankingResponse): AchievementRankingResponse {
  return {
    ...ranking,
    self: cloneRankingUser(ranking.self),
    list: ranking.list.map(cloneRankingUser),
  }
}

function cloneFeedItem(item: AchievementFeedItem): AchievementFeedItem {
  return { ...item }
}

export function getAchievementEntrySummary(): Promise<AchievementEntrySummary> {
  return Promise.resolve({ ...entrySummary })
}

export function getAchievementCenterData(): Promise<AchievementCenterData> {
  return Promise.resolve({
    summary: cloneSummary(centerData.summary),
    unlocked: centerData.unlocked.map(cloneBadge),
    locked: centerData.locked.map(cloneBadge),
    feed: centerData.feed.map(cloneFeedItem),
  })
}

export function getAchievementRanking(
  scope: AchievementRankScope,
  metric: AchievementMetric
): Promise<AchievementRankingResponse> {
  return Promise.resolve(cloneRankingResponse(rankingTable[scope][metric]))
}
