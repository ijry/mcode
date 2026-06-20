import type { ContentPart, MessageTurn, ToolCall } from "@/types/acp"
import { firstString, getTurnContentParts, toObject } from "./detailDataNormalization"

export type PlanTaskStatus = "pending" | "in_progress" | "completed" | "failed"

export interface PlanTask {
  id: string
  subject: string
  description?: string
  status: PlanTaskStatus
  order: number
}

export type PlanTaskFilter = "all" | PlanTaskStatus

export function buildPlanTasks(input: {
  messages: MessageTurn[]
  liveContent?: ContentPart[]
}): PlanTask[] {
  const taskMap = new Map<string, PlanTask>()
  let order = 0

  const nextOrder = () => {
    order += 1
    return order
  }

  for (const msg of input.messages || []) {
    getTurnContentParts(msg).forEach((part, partIndex) => {
      if (part.type === "plan" && part.plan) {
        mergeTaskFromPlanPart(taskMap, part.plan, nextOrder, `${msg.id}-${partIndex}`)
        return
      }
      if (part.type === "tool_call" && part.tool_call) {
        mergeTaskFromToolCall(taskMap, part.tool_call, nextOrder)
      }
    })
  }

  if (taskMap.size === 0) {
    ;(input.liveContent || []).forEach((part, partIndex) => {
      if (part.type === "plan" && part.plan) {
        mergeTaskFromPlanPart(taskMap, part.plan, nextOrder, `live-${partIndex}`)
      }
    })
  }

  return Array.from(taskMap.values()).sort((a, b) => a.order - b.order)
}

function mergeTaskFromToolCall(
  taskMap: Map<string, PlanTask>,
  toolCall: ToolCall,
  nextOrder: () => number
) {
  const name = normalizeToolName(toolCall.name)
  if (!name.includes("task") && !name.includes("todo")) return

  const input = (toolCall.input || {}) as Record<string, any>

  if (name === "tasklist" || name === "task_list") {
    const outputObj = toObject(toolCall.output)
    const taskList =
      (outputObj?.tasks as any[]) ||
      (outputObj?.todos as any[]) ||
      (outputObj?.list as any[]) ||
      []

    taskList.forEach((item, index) => {
      if (!item || typeof item !== "object") return
      const id = firstString(item.taskId, item.task_id, item.id) || `tasklist-${index}`
      upsertTask(taskMap, id, nextOrder, {
        subject:
          firstString(item.subject, item.title, item.content, item.description) ||
          `任务 ${index + 1}`,
        description: firstString(item.description, item.activeForm),
        status: normalizeTaskStatus(item.status),
      })
    })
    return
  }

  if (name === "todowrite" && Array.isArray(input.todos)) {
    input.todos.forEach((item: Record<string, any>, index: number) => {
      if (!item || typeof item !== "object") return
      const id = firstString(item.id, item.taskId) || `todo-${index}`
      upsertTask(taskMap, id, nextOrder, {
        subject:
          firstString(item.content, item.subject, item.title, item.description) ||
          `任务 ${index + 1}`,
        description: firstString(item.activeForm),
        status: normalizeTaskStatus(item.status),
      })
    })
    return
  }

  if (name === "taskcreate" || name === "task_create") {
    const outputObj = toObject(toolCall.output)
    const id =
      firstString(input.taskId, input.task_id, outputObj?.taskId, outputObj?.task_id, outputObj?.id) ||
      `task-create-${toolCall.id}`
    upsertTask(taskMap, id, nextOrder, {
      subject:
        firstString(input.subject, input.title, input.content, input.description) ||
        "新任务",
      description: firstString(input.description, input.activeForm),
      status: normalizeTaskStatus(input.status || outputObj?.status),
    })
    return
  }

  if (name === "taskupdate" || name === "task_update") {
    const id =
      firstString(input.taskId, input.task_id, input.id) || `task-update-${toolCall.id}`
    upsertTask(taskMap, id, nextOrder, {
      subject: firstString(input.subject),
      description: firstString(input.description, input.activeForm),
      status: normalizeTaskStatus(input.status),
    })
  }
}

function mergeTaskFromPlanPart(
  taskMap: Map<string, PlanTask>,
  plan: ContentPart["plan"],
  nextOrder: () => number,
  keyPrefix: string
) {
  const steps = Array.isArray(plan?.steps) ? plan.steps : []
  steps.forEach((step, index) => {
    const subject = firstString(step?.description) || `任务 ${index + 1}`
    const normalizedKey = normalizePlanStepKey(subject)
    const id = normalizedKey ? `plan-${normalizedKey}` : `plan-${keyPrefix}-${index}`
    upsertTask(taskMap, id, nextOrder, {
      subject,
      status: step?.completed ? "completed" : "pending",
    })
  })
}

function upsertTask(
  taskMap: Map<string, PlanTask>,
  id: string,
  nextOrder: () => number,
  patch: Partial<Omit<PlanTask, "id" | "order">>
) {
  const existing = taskMap.get(id)
  if (!existing) {
    taskMap.set(id, {
      id,
      subject: patch.subject || "任务",
      description: patch.description,
      status: patch.status || "pending",
      order: nextOrder(),
    })
    return
  }

  if (patch.subject) existing.subject = patch.subject
  if (patch.description) existing.description = patch.description
  if (patch.status) existing.status = patch.status
}

function normalizeToolName(name?: string): string {
  return String(name || "").trim().toLowerCase().replace(/[\s_-]/g, "")
}

function normalizePlanStepKey(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

export function normalizeTaskStatus(value: unknown): PlanTaskStatus {
  const status = String(value || "").trim().toLowerCase()
  if (
    status === "in_progress" ||
    status === "inprogress" ||
    status === "running" ||
    status === "active" ||
    status === "processing"
  ) {
    return "in_progress"
  }
  if (
    status === "completed" ||
    status === "done" ||
    status === "success" ||
    status === "finished"
  ) {
    return "completed"
  }
  if (
    status === "failed" ||
    status === "error" ||
    status === "cancelled" ||
    status === "canceled"
  ) {
    return "failed"
  }
  return "pending"
}

export function taskStatusLabel(status: PlanTaskStatus): string {
  if (status === "in_progress") return "进行中"
  if (status === "completed") return "已完成"
  if (status === "failed") return "失败"
  return "待处理"
}

export function countPlanTasksByStatus(tasks: PlanTask[], status: PlanTaskStatus): number {
  return tasks.filter((task) => task.status === status).length
}

export function buildPlanFilterItems(tasks: PlanTask[]) {
  return [
    { key: "all" as const, label: "全部", count: tasks.length },
    { key: "in_progress" as const, label: "进行中", count: countPlanTasksByStatus(tasks, "in_progress") },
    { key: "pending" as const, label: "待处理", count: countPlanTasksByStatus(tasks, "pending") },
    { key: "completed" as const, label: "已完成", count: countPlanTasksByStatus(tasks, "completed") },
    { key: "failed" as const, label: "失败", count: countPlanTasksByStatus(tasks, "failed") },
  ]
}
