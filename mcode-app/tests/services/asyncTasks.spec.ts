import {
  adoptUnknownAsyncTasks,
  isAsyncTaskTerminal,
  liveAsyncTasks,
  mergeAsyncTasks,
  normalizeAsyncTaskDelta,
  normalizeAsyncTaskRecord,
  upsertAsyncTask,
} from "@/services/conversation/asyncTasks"
import type { AsyncTaskRecord } from "@/types/acp"

function spawnDelta(taskId: string, extra: Record<string, any> = {}) {
  return normalizeAsyncTaskDelta({
    task_id: taskId,
    spawned: true,
    name: `任务 ${taskId}`,
    task_type: "shell",
    can_stop: true,
    ...extra,
  })
}

describe("asyncTasks 归一化", () => {
  it("同时吃 snake_case 与 camelCase", () => {
    const snake = normalizeAsyncTaskDelta({
      task_id: "t1",
      spawned: true,
      task_type: "workflow",
      last_tool_name: "Bash",
      output_file_path: "/tmp/a.output",
      tool_call_id: "toolu_1",
      show_in_transcript: false,
      can_stop: true,
    })
    const camel = normalizeAsyncTaskDelta({
      taskId: "t1",
      spawned: true,
      taskType: "workflow",
      lastToolName: "Bash",
      outputFilePath: "/tmp/a.output",
      toolCallId: "toolu_1",
      showInTranscript: false,
      canStop: true,
    })
    expect(camel).toEqual(snake)
    expect(snake?.showInTranscript).toBe(false)
  })

  it("接受包着 delta 的载荷，缺 taskId 时返回 null", () => {
    expect(normalizeAsyncTaskDelta({ delta: { task_id: "t9", spawned: true } })?.taskId).toBe("t9")
    expect(normalizeAsyncTaskDelta({ spawned: true })).toBeNull()
    expect(normalizeAsyncTaskDelta(null)).toBeNull()
  })

  it("spawned 缺省时为 false —— 不能让一条进度帧建行", () => {
    expect(normalizeAsyncTaskDelta({ task_id: "t1" })?.spawned).toBe(false)
    expect(normalizeAsyncTaskDelta({ task_id: "t1", spawned: "true" })?.spawned).toBe(false)
  })

  it("usage 整体判定：缺任何一个字段就整份丢掉", () => {
    const full = normalizeAsyncTaskDelta({
      task_id: "t1",
      usage: { total_tokens: 10, tool_uses: 2, duration_ms: 300 },
    })
    expect(full?.usage).toEqual({ totalTokens: 10, toolUses: 2, durationMs: 300 })
    const partial = normalizeAsyncTaskDelta({
      task_id: "t1",
      usage: { total_tokens: 10, tool_uses: 2 },
    })
    expect(partial?.usage).toBeUndefined()
  })

  it("快照整行用与 spawned 相同的默认值", () => {
    const record = normalizeAsyncTaskRecord({ task_id: "t1" })
    expect(record).toEqual({
      taskId: "t1",
      name: "后台任务",
      taskType: "task",
      description: "",
      showInTranscript: true,
      canStop: false,
      state: "running",
      summary: null,
      lastToolName: null,
      usage: null,
      outputFilePath: null,
      toolCallId: null,
    })
  })
})

describe("asyncTasks 合并规则", () => {
  it("只有 spawned 能建行；未知 id 的进度帧被丢弃", () => {
    const spawned = upsertAsyncTask([], spawnDelta("t1"))
    expect(spawned).toHaveLength(1)

    const current = [...spawned]
    const ignored = upsertAsyncTask(current, normalizeAsyncTaskDelta({ task_id: "t2", state: "running" }))
    // 同一个引用 = 空转，调用方据此跳过 reactive 写入。
    expect(ignored).toBe(current)
  })

  it("缺省字段保持原值，不会把名字擦掉", () => {
    const table = upsertAsyncTask([], spawnDelta("t1"))
    const next = upsertAsyncTask(
      table,
      normalizeAsyncTaskDelta({ task_id: "t1", last_tool_name: "Grep" })
    )
    expect(next[0].name).toBe("任务 t1")
    expect(next[0].taskType).toBe("shell")
    expect(next[0].lastToolName).toBe("Grep")
  })

  it("显式 false 会落地（与「缺省」区分）", () => {
    const table = upsertAsyncTask([], spawnDelta("t1"))
    const next = upsertAsyncTask(table, normalizeAsyncTaskDelta({ task_id: "t1", can_stop: false }))
    expect(next[0].canStop).toBe(false)
  })

  it("终态行保留在表里，但不参与展示", () => {
    let table = upsertAsyncTask([], spawnDelta("t1"))
    table = upsertAsyncTask(table, normalizeAsyncTaskDelta({ task_id: "t1", state: "completed" }))
    expect(table).toHaveLength(1)
    expect(isAsyncTaskTerminal(table[0])).toBe(true)
    expect(liveAsyncTasks(table)).toHaveLength(0)

    // 迟到的修订能贴到保留的那一行上 —— 这正是不删行的理由。
    const revised = upsertAsyncTask(
      table,
      normalizeAsyncTaskDelta({ task_id: "t1", output_file_path: "/tmp/late.output" })
    )
    expect(revised[0].outputFilePath).toBe("/tmp/late.output")
    expect(revised[0].name).toBe("任务 t1")
  })

  it("paused 仍算活着", () => {
    let table = upsertAsyncTask([], spawnDelta("t1"))
    table = upsertAsyncTask(table, normalizeAsyncTaskDelta({ task_id: "t1", state: "paused" }))
    expect(liveAsyncTasks(table)).toHaveLength(1)
  })
})

describe("asyncTasks 快照水合", () => {
  const stored: AsyncTaskRecord[] = [
    normalizeAsyncTaskRecord({ task_id: "t1", state: "completed", name: "本地更新" })!,
  ]

  it("更新的快照按 id 替换整行", () => {
    const incoming = [normalizeAsyncTaskRecord({ task_id: "t1", state: "running", name: "快照" })!]
    const merged = mergeAsyncTasks(stored, incoming)
    expect(merged[0].state).toBe("running")
    expect(merged[0].name).toBe("快照")
  })

  it("陈旧快照只增不改 —— 不把已完成的任务走回 running", () => {
    const incoming = [
      normalizeAsyncTaskRecord({ task_id: "t1", state: "running", name: "旧快照" })!,
      normalizeAsyncTaskRecord({ task_id: "t2", state: "running", name: "没见过的" })!,
    ]
    const adopted = adoptUnknownAsyncTasks(stored, incoming)
    expect(adopted).toHaveLength(2)
    expect(adopted[0].state).toBe("completed")
    expect(adopted[0].name).toBe("本地更新")
    expect(adopted[1].taskId).toBe("t2")
  })

  it("空表 / 空入参返回同一个引用", () => {
    expect(mergeAsyncTasks(stored, [])).toBe(stored)
    expect(mergeAsyncTasks(stored, null)).toBe(stored)
    expect(adoptUnknownAsyncTasks(stored, undefined)).toBe(stored)
    expect(adoptUnknownAsyncTasks(stored, [stored[0]])).toBe(stored)
  })
})
