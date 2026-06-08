import type {
  ConversationOverviewConversation,
  ConversationOverviewProject,
} from "@/services/conversation/conversationOverviewSnapshot"

export interface HistoryProjectSection {
  projectId: number
  title: string
  path: string
  count: number
  conversations: ConversationOverviewConversation[]
}

function getProjectTitle(project: ConversationOverviewProject): string {
  return String(project.name || project.path || "未命名项目").trim()
}

function normalizeKeyword(keyword: string): string {
  return keyword.trim().toLowerCase()
}

export function formatHistoryConversationMeta(
  conversation: ConversationOverviewConversation,
  formatAgentLabel: (agentType: string) => string,
  formatTimeLabel: (updatedAt?: string) => string
): string {
  const agent = formatAgentLabel(conversation.agent_type || "")
  const time = formatTimeLabel(conversation.updated_at)
  return [agent, time].filter(Boolean).join(" · ")
}

export function buildHistoryProjectSections(
  projects: ConversationOverviewProject[],
  keyword: string
): HistoryProjectSection[] {
  const normalizedKeyword = normalizeKeyword(keyword)

  return projects
    .map((project) => {
      const sourceConversations = Array.isArray(project.conversations)
        ? project.conversations
        : []
      const conversations = sourceConversations.filter((conversation) => {
        if (!normalizedKeyword) return true
        const haystack = [
          conversation.title || "",
          conversation.agent_type || "",
          project.name || "",
          project.path || "",
        ]
          .join(" ")
          .toLowerCase()
        return haystack.includes(normalizedKeyword)
      })

      return {
        projectId: project.id,
        title: getProjectTitle(project),
        path: project.path || "",
        count: conversations.length,
        conversations,
      }
    })
    .filter((section) => section.conversations.length > 0)
}
