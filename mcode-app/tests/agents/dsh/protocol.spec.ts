/**
 * DSH 桥协议镜像的守卫。
 *
 * `src/agents/dsh/protocol.ts` 是 `dsh-plugin-mobile-bridge/src/shared/protocol.js`
 * 的手抄本（两个仓库不能互相依赖，理由写在那个文件顶部）。字段名或错误码一旦漂移，
 * 症状是「连上了但什么都收不到」——最难查的一类。所以这里把跨仓库的常量逐个钉住。
 */
import {
  DSH_APPROVAL_OUTCOME,
  DSH_CAPABILITY,
  DSH_ERR,
  DSH_EVENTS_SSE_PATH,
  DSH_EVENTS_WS_PATH,
  DSH_FRAME,
  DSH_PROTOCOL_VERSION,
  DSH_ROUTE_PREFIX,
  DSH_STREAM_PROTOCOL,
  DSH_TARGET_AGENT,
  DSH_TOKEN_PROTOCOL_PREFIX,
  buildDshEventsWsUrl,
  buildDshTokenProtocol,
  normalizeDshBaseUrl,
  withDshRoutePrefix,
} from "@/agents/dsh/protocol"

describe("dsh bridge protocol mirror", () => {
  it("pins every value the bridge also declares", () => {
    expect(DSH_PROTOCOL_VERSION).toBe("1")
    expect(DSH_ROUTE_PREFIX).toBe("/dsh-mobile-bridge")
    expect(DSH_TARGET_AGENT).toBe("dsh")
    expect(DSH_EVENTS_WS_PATH).toBe("/ws")
    expect(DSH_EVENTS_SSE_PATH).toBe("/events")
    expect(DSH_STREAM_PROTOCOL).toBe("dshm-events")
    expect(DSH_TOKEN_PROTOCOL_PREFIX).toBe("dshm-token.")

    expect(DSH_CAPABILITY).toEqual({
      sessions: "dsh.bridge.sessions",
      events: "dsh.bridge.events",
      answers: "dsh.bridge.answers",
      workspaces: "dsh.bridge.workspaces",
      models: "dsh.bridge.models",
      images: "dsh.bridge.images",
    })

    expect(DSH_ERR.unauthorized).toBe("unauthorized")
    expect(DSH_ERR.pairingFailed).toBe("pairing_failed")
    expect(DSH_ERR.rateLimited).toBe("rate_limited")
    expect(DSH_ERR.dshError).toBe("dsh_error")

    // 只有这两个结论是客户端能给的；cancelled / unavailable 是宿主侧结果。
    expect(DSH_APPROVAL_OUTCOME).toEqual({ allow: "allowed-once", deny: "rejected" })

    expect(Object.values(DSH_FRAME)).toEqual([
      "hello",
      "session/added",
      "session/removed",
      "session/status",
      "session/title",
      "message/start",
      "message/delta",
      "message/end",
      "tool/call",
      "tool/result",
      "approval/requested",
      "approval/resolved",
      "question/requested",
      "question/resolved",
      "turn/end",
      "error",
    ])
  })

  it("normalizes a base url the way the bridge does", () => {
    expect(normalizeDshBaseUrl("http://10.0.0.2:8790/dsh-mobile-bridge/")).toBe(
      "http://10.0.0.2:8790/dsh-mobile-bridge"
    )
    expect(normalizeDshBaseUrl("https://x.trycloudflare.com/p?a=1#f")).toBe("https://x.trycloudflare.com/p")
    expect(normalizeDshBaseUrl("ws://10.0.0.2")).toBe("")
    expect(normalizeDshBaseUrl("10.0.0.2:8790")).toBe("")
    expect(normalizeDshBaseUrl(undefined)).toBe("")
  })

  it("adds the route prefix once, and only at the end", () => {
    expect(withDshRoutePrefix("http://10.0.0.2:8790")).toBe("http://10.0.0.2:8790/dsh-mobile-bridge")
    expect(withDshRoutePrefix("http://10.0.0.2:8790/dsh-mobile-bridge")).toBe(
      "http://10.0.0.2:8790/dsh-mobile-bridge"
    )
    // 前缀恰好写在中间的反代路径不该被当成已经补过。
    expect(withDshRoutePrefix("https://x.example.com/dsh-mobile-bridge/inner")).toBe(
      "https://x.example.com/dsh-mobile-bridge/inner/dsh-mobile-bridge"
    )
  })

  it("builds a ws url with only the parameters that carry information", () => {
    expect(buildDshEventsWsUrl("http://10.0.0.2:8790")).toBe("ws://10.0.0.2:8790/dsh-mobile-bridge/ws")
    expect(buildDshEventsWsUrl("https://x.example.com/dsh-mobile-bridge")).toBe(
      "wss://x.example.com/dsh-mobile-bridge/ws"
    )
    expect(buildDshEventsWsUrl("http://h:1", { sessionId: "s1", lastEventId: 12 })).toBe(
      "ws://h:1/dsh-mobile-bridge/ws?sessionId=s1&lastEventId=12"
    )
    // 0 与 null 都表示「从头开始」，不该出现在 URL 里。
    expect(buildDshEventsWsUrl("http://h:1", { lastEventId: 0 })).toBe("ws://h:1/dsh-mobile-bridge/ws")
  })

  it("encodes the token subprotocol as url-safe base64 with no padding", () => {
    const encoded = buildDshTokenProtocol("dshm_abc-_123")
    expect(encoded.startsWith(DSH_TOKEN_PROTOCOL_PREFIX)).toBe(true)
    const body = encoded.slice(DSH_TOKEN_PROTOCOL_PREFIX.length)
    expect(body).not.toMatch(/[+/=]/)
    // 与 Node 的 base64url 逐字节一致，桥那侧就是用它解的。
    expect(body).toBe(Buffer.from("dshm_abc-_123", "utf8").toString("base64url"))
    for (const token of ["", "a", "ab", "abc", "abcd", "手机遥控"]) {
      expect(buildDshTokenProtocol(token).slice(DSH_TOKEN_PROTOCOL_PREFIX.length)).toBe(
        Buffer.from(token, "utf8").toString("base64url")
      )
    }
  })
})
