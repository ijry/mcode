import { acpApi } from "@/api/acp"

/**
 * 事件归一化的**线上形状**契约。
 *
 * 服务端 `EventEnvelope` 用 `#[serde(flatten)]`（`codeg-plus/src-tauri/src/acp/types.rs:56`），
 * 所以线上是**平铺**的 `{seq, connection_id, type, ...变体字段}` —— 没有 `data` 包装层。
 *
 * 这件事有个静默失败的坑：`normalizeEventEnvelope` 对未识别的 type 有一条兜底透传，
 * 但那条兜底要求 `"data" in record`。平铺事件永远不满足，所以**没有显式 case 的平铺
 * 事件会被直接丢弃，不报错、不告警**。这一组测试就是钉住这一点 —— 删掉
 * `normalizeAcpEventRecord` 里对应的 case，它们会立刻变红（已验证）。
 */
describe("flat-wire feedback events", () => {
  it("normalizes a flat feedback_submitted frame", () => {
    const out = acpApi.normalizeRealtimeEvent({
      seq: 42,
      connection_id: "conn-1",
      type: "feedback_submitted",
      item: {
        id: "f1",
        text: "用 UserService",
        created_at: "2026-08-27T00:00:00.000Z",
        status: "delivered",
        delivered_at: "2026-08-27T00:00:00.000Z",
      },
    })

    expect(out).toMatchObject({
      connectionId: "conn-1",
      type: "feedback_submitted",
      seq: 42,
    })
    expect((out as any).data.item.id).toBe("f1")
  })

  it("normalizes a flat feedback_consumed frame", () => {
    const out = acpApi.normalizeRealtimeEvent({
      seq: 43,
      connection_id: "conn-1",
      type: "feedback_consumed",
      ids: ["f1", "f2"],
      delivered_at: "2026-08-27T00:00:05.000Z",
    })

    expect(out).toMatchObject({ connectionId: "conn-1", type: "feedback_consumed" })
    expect((out as any).data.ids).toEqual(["f1", "f2"])
    expect((out as any).data.deliveredAt).toBe("2026-08-27T00:00:05.000Z")
  })

  it("drops a submitted frame with no item", () => {
    // 没有 item 的 submitted 帧无从归一化。返回 null 让它止步于此，而不是让一条
    // 空便签流进 store 再在渲染层暴露。
    expect(acpApi.normalizeRealtimeEvent({
      seq: 44,
      connection_id: "conn-1",
      type: "feedback_submitted",
    })).toBeNull()
  })

  it("drops a consumed frame with no ids", () => {
    expect(acpApi.normalizeRealtimeEvent({
      seq: 45,
      connection_id: "conn-1",
      type: "feedback_consumed",
      ids: [],
    })).toBeNull()
  })
})
