import type {
  SpeciesDef,
  SkinDef,
  AccessoryDef,
  AchievementDef,
  SpeciesId,
} from '@/types/pet'

// ── Species ──

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  fox: {
    id: 'fox',
    name: '小狐狸',
    personality: '机灵、好奇',
    colors: ['#FF6B35', '#FFE0B2', '#E65100'],
  },
  owl: {
    id: 'owl',
    name: '小猫头鹰',
    personality: '沉稳、智慧',
    colors: ['#795548', '#D7CCC8', '#3E2723'],
  },
  otter: {
    id: 'otter',
    name: '小水獭',
    personality: '活泼、乐观',
    colors: ['#8D6E63', '#BCAAA4', '#4E342E'],
  },
  octopus: {
    id: 'octopus',
    name: '小章鱼',
    personality: '多线程、高效',
    colors: ['#E040FB', '#F3E5F5', '#7B1FA2'],
  },
  cactus: {
    id: 'cactus',
    name: '小仙人掌',
    personality: '佛系、耐心',
    colors: ['#66BB6A', '#C8E6C9', '#2E7D32'],
  },
  ghost: {
    id: 'ghost',
    name: '小幽灵',
    personality: '调皮、神秘',
    colors: ['#B0BEC5', '#ECEFF1', '#546E7A'],
  },
}

export const SPECIES_LIST: SpeciesDef[] = Object.values(SPECIES)

// ── Skins ──

export const SKINS: SkinDef[] = [
  {
    id: 'default',
    name: '默认原色',
    description: '物种本身的标准配色',
    unlockCondition: { type: 'default' },
    colorPalette: [],  // uses species default
  },
  {
    id: 'dark-night',
    name: '暗夜模式',
    description: '深色调重绘，呼应 app 深色模式',
    unlockCondition: { type: 'level', level: 15 },
    colorPalette: ['#263238', '#37474F', '#78909C'],
  },
  {
    id: 'code-green',
    name: '代码绿',
    description: '终端绿 + 黑色主题，致敬编程文化',
    unlockCondition: { type: 'stat', stat: 'totalConversations', value: 100 },
    colorPalette: ['#00E676', '#1B5E20', '#76FF03'],
  },
]

// ── Accessories ──

export const ACCESSORIES: AccessoryDef[] = [
  {
    id: 'claude-hat',
    name: 'Claude 紫帽',
    slot: 'head',
    unlockCondition: { type: 'stat', stat: 'agentConversations.claude_code', value: 50 },
    svgAsset: '/static/pet-accessories/claude-hat.svg',
    anchor: { x: 0.5, y: 0 },
  },
  {
    id: 'codex-hat',
    name: 'Codex 绿帽',
    slot: 'head',
    unlockCondition: { type: 'stat', stat: 'agentConversations.codex', value: 50 },
    svgAsset: '/static/pet-accessories/codex-hat.svg',
    anchor: { x: 0.5, y: 0 },
  },
  {
    id: 'sunglasses',
    name: '小墨镜',
    slot: 'head',
    unlockCondition: { type: 'level', level: 10 },
    svgAsset: '/static/pet-accessories/sunglasses.svg',
    anchor: { x: 0.5, y: 0.35 },
  },
  {
    id: 'plaid-shirt',
    name: '程序员格衫',
    slot: 'body',
    unlockCondition: { type: 'level', level: 20 },
    svgAsset: '/static/pet-accessories/plaid-shirt.svg',
    anchor: { x: 0.5, y: 0.6 },
  },
  {
    id: 'lightning-scarf',
    name: '闪电围巾',
    slot: 'body',
    unlockCondition: { type: 'achievement', achievementId: 'streak-30' },
    svgAsset: '/static/pet-accessories/lightning-scarf.svg',
    anchor: { x: 0.5, y: 0.45 },
  },
  {
    id: 'star-trail',
    name: '星光尾迹',
    slot: 'effect',
    unlockCondition: { type: 'level', level: 35 },
    svgAsset: '/static/pet-accessories/star-trail.svg',
    anchor: { x: 0.5, y: 0.5 },
  },
]

// ── Achievements ──

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first-conversation',
    name: '初次对话',
    description: '完成第一次 AI 对话',
    unlockCondition: { type: 'stat', stat: 'totalConversations', value: 1 },
  },
  {
    id: 'hundred-turns',
    name: '百轮老手',
    description: '累计完成 100 个 turn',
    unlockCondition: { type: 'stat', stat: 'totalTurns', value: 100 },
  },
  {
    id: 'streak-7',
    name: '坚持一周',
    description: '连续签到 7 天',
    unlockCondition: { type: 'achievement', achievementId: 'streak-7' },
  },
  {
    id: 'streak-30',
    name: '月度坚持',
    description: '连续签到 30 天',
    unlockCondition: { type: 'achievement', achievementId: 'streak-30' },
  },
  {
    id: 'level-10',
    name: '初窥门径',
    description: '宠物达到 10 级',
    unlockCondition: { type: 'level', level: 10 },
  },
  {
    id: 'level-25',
    name: '渐入佳境',
    description: '宠物达到 25 级',
    unlockCondition: { type: 'level', level: 25 },
  },
  {
    id: 'level-50',
    name: '登峰造极',
    description: '宠物达到 50 级',
    unlockCondition: { type: 'level', level: 50 },
  },
]

// ── Experience tables ──

/** EXP needed to go from `level` to `level + 1` */
export function expForLevel(level: number): number {
  return 100 + level * 20
}

/** Total EXP needed to reach a given level from level 1 */
export function totalExpForLevel(level: number): number {
  if (level <= 1) return 0
  const n = level - 1
  return n * 100 + 20 * n * (n + 1) / 2
}

export const MAX_LEVEL = 50

/** Daily exp caps per source */
export const DAILY_EXP_CAPS: Record<string, number> = {
  user: 200,
  agent: 300,
  task: 100,
}

/** Level range titles */
export function getLevelTitle(level: number): string {
  if (level <= 10) return '新生'
  if (level <= 20) return '成长'
  if (level <= 30) return '熟练'
  if (level <= 40) return '精通'
  return '传说'
}

/** Level range star count (for display) */
export function getLevelStars(level: number): number {
  if (level <= 10) return 1
  if (level <= 20) return 2
  if (level <= 30) return 3
  if (level <= 40) return 4
  return 5
}

// ── Bubble messages ──

export interface BubbleTemplate {
  trigger: string
  texts: string[]
  duration: number
  flash?: boolean
}

export const BUBBLE_TEMPLATES: BubbleTemplate[] = [
  { trigger: 'turn_complete', texts: ['搞定啦!', '完成!', '好了~'], duration: 3000 },
  { trigger: 'waiting_permission_long', texts: ['主人快来看看~', '需要你的审批!'], duration: 5000, flash: true },
  { trigger: 'error', texts: ['呜...出错了', '似乎有问题...'], duration: 4000 },
  { trigger: 'morning', texts: ['早上好!', '新的一天~'], duration: 3000 },
  { trigger: 'afternoon', texts: ['下午好!', '继续加油!'], duration: 3000 },
  { trigger: 'evening', texts: ['晚上好!', '辛苦啦~'], duration: 3000 },
  { trigger: 'level_up', texts: ['我变强了!', '升级啦!'], duration: 4000 },
  { trigger: 'pet_interact', texts: ['嘻嘻~', '好舒服~', '再摸摸!'], duration: 2000 },
]

export function pickBubbleText(trigger: string): string | null {
  const template = BUBBLE_TEMPLATES.find(t => t.trigger === trigger)
  if (!template) return null
  return template.texts[Math.floor(Math.random() * template.texts.length)]
}

export function getBubbleTemplate(trigger: string): BubbleTemplate | null {
  return BUBBLE_TEMPLATES.find(t => t.trigger === trigger) ?? null
}
