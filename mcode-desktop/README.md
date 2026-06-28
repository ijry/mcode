# mcode-desktop

Tauri desktop host for MCode gateway pairing, local tunnels, and optional official CLI adapters.

## Scope

- Connect to an official or custom MCode gateway.
- Generate MCode v2 gateway QR payloads for `targetAgent = "mcode-desktop"`.
- Register desktop metadata through the gateway WebSocket at `/v1/tunnel/desktop`.
- Report desktop health, version, gateway state, capabilities, pair offer, and local service config.
- Configure loopback-only HTTP services such as `127.0.0.1:1080`.

## P4 HTTP Tunnel

- Relay sends `tunnel_request` frames to the desktop upstream WebSocket.
- Desktop validates the requested port against enabled loopback services.
- Desktop proxies HTTP requests to `http://127.0.0.1:<port>` and replies with `tunnel_response`.
- Recent proxy success/error entries are exposed through desktop health diagnostics.

## P5 Official CLI Adapter Foundation

- `desktop_refresh_cli_status` detects `codex --version` and `claude --version`.
- Health snapshots include `cliRuntimes` and installed runtime capabilities.
- Relay `proxy_request` frames are routed to desktop adapters and answered with `proxy_response`.
- `acp_list_agents` and `acp_describe_agent_options` expose Codex/Claude entries through the same gateway proxy path.
- Codex prompt execution uses `codex exec --json` for a basic non-interactive first slice.
- Claude prompt execution is intentionally not enabled until its command semantics are verified.
- Official CLI credentials stay local to the desktop machine.

## Not Included Yet

- Raw TCP byte-stream tunnel transport.
- Full ACP session lifecycle for official CLIs.
- Streaming event normalization from Codex/Claude output.
- Permission request mediation and session restore for official CLIs.
- Enterprise gateway operations features.

## Commands

- `npm run dev`
- `npm run build`
- `npm test`
- `cargo test --manifest-path src-tauri/Cargo.toml`
