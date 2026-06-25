# mcode-desktop

Tauri desktop host for MCode P3.

## P3 Scope

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

## Not In P3

- Raw TCP byte-stream tunnel transport.
- Claude official CLI adapter.
- Codex official CLI adapter.
- Enterprise gateway operations features.

## Commands

- `npm run dev`
- `npm run build`
- `npm test`
- `cargo test --manifest-path src-tauri/Cargo.toml`
