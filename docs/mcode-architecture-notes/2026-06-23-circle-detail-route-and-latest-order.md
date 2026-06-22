# Circle Detail Route And Latest Order

## Architecture

The mcode circle detail page now calls the backend detail route using a path
segment instead of a query parameter. The frontend service resolves detail data
through `GET /v1/circle/post/info/<postId>`, matching the circle controller's
declared `/:id` API suffix.

The `最新` feed ordering is now treated as a backend responsibility. mcode does
not locally reshuffle paginated results, because pagination must stay consistent
across pages and clients.

## Protocol And Data Flow

- Circle detail read: `GET /v1/circle/post/info/<postId>`
- Circle latest feed: `GET /v1/circle/post/lists?order=latest`

The backend latest feed must sort by `postTime desc, id desc`. This ensures a
newly published post appears at the top of the latest feed regardless of
default `sortnum` values. Hot feed ordering remains independent.

## UI Behavior

Opening a post from the circle feed now resolves successfully against the real
detail route instead of showing the generic "动态加载失败" state caused by the
wrong query-style URL.

After publishing a post and returning to the circle tab, the latest feed refresh
still uses the existing storage flag flow, but the backend now returns the new
post first, so the refreshed list places it at the top without client-side
reordering.

## Compatibility

Native iOS and Android clients should use the same path-style detail endpoint
and should not rely on query-style `info?id=` calls for circle post detail.

Clients should also treat latest ordering as server-authoritative and not apply
post-refresh local sorting that could break pagination consistency.
