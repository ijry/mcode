# MCode P1-P6 Roadmap Status

## Purpose

This file reconciles the original conversation-level P1-P6 roadmap with the implementation plans that were later split across `2026-06-25` and `2026-06-26`.

The important distinction:

- `docs/superpowers/plans/2026-06-25-mcode-multi-provider-connection-routing.md` implements the foundation: P1, P2, and the initial desktop scaffold.
- `docs/superpowers/plans/2026-06-26-mcode-desktop-p3-basic.md` through `docs/superpowers/plans/2026-06-26-mcode-relay-p6-enterprise-gateway.md` implement the P3-P6 first slices.
- `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md` is the rolling architecture note that records implemented behavior and explicit follow-up limits.

## Roadmap Status

| Phase | Original Goal | Current Status | Main Implementation Commits |
| --- | --- | --- | --- |
| P1 | Connection model and add-connection UI: `targetAgent`, `routeMode`, `gatewayProvider`, direct vs gateway, v1 compatibility. | Implemented first version. | `fd4e6d1`, `d046452`, `1aa146c`, `71056f1` |
| P2 | Upgrade `mcode-relay` protocol for multiple target agents, target metadata, capabilities, version, proxy compatibility, and tunnel frame reservation. | Implemented first version. Relay now handles target metadata, replayable events, proxy requests, and HTTP tunnel frames. | `196b7c8`, `71056f1`, `2a8765f` |
| P3 | `mcode-desktop` basic Tauri host: tray/UI, gateway config, pairing, health, capabilities, local service config. | Implemented first version. | `389efb1`, `78ca778`, `43532af`, `0e14c25` |
| P4 | Desktop local port access / intranet tunnel through relay. | Implemented HTTP first version. Raw TCP byte-stream tunnel is not implemented. | `63977ec`, `2a8765f` |
| P5 | Official CLI proxy through desktop for Codex/Claude, credentials local only. | Implemented adapter foundation. Includes CLI detection, capability publication, proxy routing, Codex non-interactive `exec`; full sessions/permissions/streaming are not implemented. | `ceeb3a0`, `d02d100` |
| P6 | Enterprise gateway self-hosting and operations capability. | Implemented self-hosted metadata/health first version. Tenant/device management, revocation, and policy admin are not implemented. | `1d280d0`, `dd8ba8f`, `8584608` |

## Why The Plans Are Split

The first implementation plan was written as a broad multi-provider foundation plan. It should have included the full P1-P6 roadmap as an explicit top-level status section, but it did not. Later work corrected the implementation by adding P3-P6 plans, but the documentation structure made the later phases look like ad-hoc extensions.

This status file is the canonical index for the current P1-P6 implementation state.

## Follow-Up Work Not Done Yet

- P4 raw TCP byte-stream tunnel frames and port proxying.
- P5 full official CLI ACP session lifecycle: `acp_connect`, restore/resume, permission mediation, cancellation, and normalized streaming events.
- P6 enterprise operations backend: tenants, devices, connection revocation, audit storage, and gateway access policies.
- Optional client diagnostics that read `/v1/gateway/info` before pairing.

## Verification Baseline

The latest P6 implementation was verified with:

```bash
cd mcode-relay && npm test
cd mcode-relay && npm run typecheck
cd mcode-desktop && npm test
cd mcode-desktop && npm run build
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml
```
