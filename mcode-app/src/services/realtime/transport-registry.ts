import { InstanceEventStream } from "./event-stream"
import type {
  RealtimeTransport,
  RealtimeTransportHost,
  RemoteInstanceDescriptor,
} from "./types"

const registry = new Map<string, RealtimeTransport>()

export function getOrCreateRealtimeTransport(
  descriptor: RemoteInstanceDescriptor,
  host?: RealtimeTransportHost
) {
  const existing = registry.get(descriptor.instanceKey)
  if (existing) {
    if (host) {
      existing.rebindHost(host)
    }
    return existing
  }
  const created = new InstanceEventStream(descriptor, host)
  registry.set(descriptor.instanceKey, created)
  return created
}

export function getRealtimeTransport(instanceKey: string) {
  return registry.get(instanceKey) ?? null
}

export function destroyRealtimeTransport(instanceKey: string) {
  const transport = registry.get(instanceKey)
  if (!transport) return
  transport.destroy()
  registry.delete(instanceKey)
}

export function clearRealtimeTransportRegistry() {
  for (const [instanceKey, transport] of registry.entries()) {
    transport.destroy()
    registry.delete(instanceKey)
  }
}
