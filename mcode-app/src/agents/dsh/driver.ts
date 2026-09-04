/**
 * DSH 连接的 driver。
 *
 * 与其它 agent 目录一样只做一件事：把一条 `ConnectionRecordV2` 变成一个可用的
 * gateway。DSH 的特别之处只有一处 —— 直连地址配一次性配对码，而不是配一个长期
 * token。Bearer token 不能放进任何人都能拍下来的二维码里，所以第一次连接时用
 * `pairCode`/`pairSecret` 去桥上换一对令牌，之后就只带令牌。
 *
 * 换回来的令牌必须落盘：配对码是一次性的，丢了它就得回到桌面上重新出码。
 *
 * @module agents/dsh/driver
 */
import type { ConnectionDriver, DriverResolvedConnectionContext } from "@/agents/shared/driverTypes"
import { toConnectionRuntimeContext, withRegisteredDescriptor } from "@/agents/shared/driverTypes"
import { normalizeRelaySessionInfo, type ConnectionRecordV2 } from "@/services/connectionSchema"
import { buildRemoteInstanceKey } from "@/services/realtime/instance-key"
import { DshBridgeGateway } from "./bridgeGateway"
import { normalizeDshBaseUrl, withDshRoutePrefix } from "./protocol"

/**
 * 候选地址：主地址在前，二维码里带的备用地址在后。
 *
 * 换网络之后主地址会失效（笔记本换 Wi-Fi 不会通知任何人），而备用地址常常还通。
 * 逐个试一遍比让用户重新扫码好，代价是失败时要等每个地址各自超时一次 —— 所以
 * 候选表在桥那侧就被限制成最多两条。
 */
function candidateUrls(connection: ConnectionRecordV2): string[] {
  // `candidates` 是二维码带来的备用地址，不是 ConnectionRecordV2 的字段：它只在
  // 导入那一刻存在，所以这里从记录上宽松地读，读不到就当没有。
  const loose = connection as unknown as { candidates?: unknown }
  const extra = Array.isArray(loose.candidates) ? loose.candidates : []
  const urls = [connection.directBaseUrl, ...extra]
    .map((url) => withDshRoutePrefix(normalizeDshBaseUrl(url)))
    .filter((url) => url !== "")
  return Array.from(new Set(urls))
}

export const dshDirectDriver: ConnectionDriver = {
  id: "dsh-direct",

  async connect(connection: ConnectionRecordV2): Promise<DriverResolvedConnectionContext> {
    const urls = candidateUrls(connection)
    if (urls.length === 0) throw new Error(`${connection.name} 缺少 DeepSeek Harness 手机桥地址`)

    const stored = normalizeRelaySessionInfo(connection.gatewaySession)
    const hasToken = Boolean(stored?.accessToken)
    if (!hasToken && !(connection.pairCode && connection.pairSecret)) {
      throw new Error(`${connection.name} 缺少配对码，请在 dsh 的「手机遥控」面板里重新出码`)
    }

    const failures: string[] = []
    for (const baseUrl of urls) {
      const gateway = withRegisteredDescriptor(
        new DshBridgeGateway(baseUrl, stored ?? { accessToken: "" })
      ) as DshBridgeGateway
      try {
        // 有令牌时 pair() 不会烧掉配对码，只是确认地址可用。
        await gateway.pair({
          directBaseUrl: baseUrl,
          ...(hasToken ? {} : { code: connection.pairCode, secret: connection.pairSecret }),
        })
        const descriptor = gateway.getRemoteInstanceDescriptor()
        const session = gateway.currentSession()

        return {
          connection: toConnectionRuntimeContext({
            ...connection,
            targetAgent: "dsh",
            routeMode: "direct",
            directBaseUrl: baseUrl,
            // 令牌换到手就落盘，并且把用掉的配对码清掉：留着它只会让下一次连接
            // 拿一张已经失效的码去试。
            gatewaySession: session,
            pairCode: hasToken ? connection.pairCode : undefined,
            pairSecret: undefined,
            targetProfile: gateway.describeTarget(),
          }),
          gateway,
          instanceKey:
            descriptor.instanceKey ||
            buildRemoteInstanceKey({ mode: "direct", baseUrl, principal: `dsh:${session.targetId ?? "unknown"}` }),
        }
      } catch (error) {
        failures.push(`${baseUrl}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    throw new Error(`${connection.name} 连不上 DeepSeek Harness 手机桥\n${failures.join("\n")}`)
  },
}
