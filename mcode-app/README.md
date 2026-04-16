# MCode App

uni-app mobile client for Codeg remote control.

Assumptions:

1. This project is intended to be built with the uni-app CLI/Vite toolchain.
2. The relay service is external and reachable by HTTPS/WSS.
3. Direct mode connects to a `codeg-main` web service that already exposes `/api/*` and `/ws/events`.

Scripts:

- `pnpm dev:h5`
- `pnpm dev:mp-weixin`
- `pnpm build:h5`
- `pnpm build:mp-weixin`
- `pnpm typecheck`
