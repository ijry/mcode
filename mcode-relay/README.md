# mcode-relay

Standalone relay service for MCode remote control.

## Scripts

- `pnpm dev`
- `pnpm build`
- `pnpm test`
- `pnpm typecheck`

## Environment

- `PORT` default `8787`
- `HOST` default `0.0.0.0`
- `JWT_SECRET` default `dev-secret`
- `PAIRING_CODE_TTL_SECONDS` default `300`
- `ACCESS_TOKEN_TTL_SECONDS` default `900`
- `REFRESH_TOKEN_TTL_SECONDS` default `1209600`

## Pair Response Contract

`POST /v1/pair` and `POST /v1/session/refresh` return target metadata when the paired target is known:

- `target.targetId`
- `target.targetAgent`
- `target.displayName`
- `target.capabilities`
- `target.protocolVersion`

Legacy clients can keep using `target.targetName`, `target.relayUrl`, `target.preferredMode`, and `target.online`. Missing target metadata defaults to `codeg` and protocol version `1` at the store boundary.

## Events And Tunnel

- `/v1/events` emits replayable frames shaped as `{ eventId, channel, payload, controllerId? }`.
- Mobile clients may reconnect with `lastEventId` or `last_event_id` to replay buffered frames.
- `/v1/tunnel/:targetId/:port/*` validates the access token target before forwarding a `tunnel_request` to the desktop upstream.
- Desktop upstreams respond with `tunnel_response` containing `requestId`, `ok`, `status`, `headers`, `body`, and optional `error`.
