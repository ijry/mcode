# Account API Domain

## Architecture

The mcode account integration now has a built-in production API base URL:
`https://getmcode.lingyun.net/api`. `mcode-app/src/services/xycloudAuth.ts`
owns this endpoint decision for login, email/mobile registration, and
email/mobile verification code requests.

The service still supports a runtime override through `setXycloudBaseUrl()`.
App startup passes `VITE_XYCLOUD_BASE_URL` into that setter, so development,
test, and private deployments can redirect the account API without changing
call sites.

`src/services/xycloudAuth.ts` is the single source of truth for this behavior.
Do not keep a sibling `xycloudAuth.js` companion file: uni-app/H5 module
resolution can hit the `.js` file first, causing stale default-base logic and
relative `/v1/...` requests against the dev server origin.

## Data Flow

Account pages and verification components call the auth service methods:

- `login()` -> `POST /v1/core/user/login`
- `registerEmail()` -> `POST /v1/reg_email/user/register`
- `registerMobile()` -> `POST /v1/reg_mobile/user/register`
- `sendEmailVerifyCode()` -> `POST /v1/email/verify/send`
- `sendMobileVerifyCode()` -> `POST /v1/sms/verify/send`

For each request, the service resolves the API base URL in this order:

1. Use a non-empty normalized runtime override from `setXycloudBaseUrl()`.
2. Fall back to `https://getmcode.lingyun.net/api`.

Resolved base URLs are trimmed and stripped of trailing slashes before the API
path is appended.

## Compatibility

Existing environments that define `VITE_XYCLOUD_BASE_URL` keep their previous
behavior because runtime overrides take precedence. Environments with no
configured value now use the production account API base URL instead of failing
with "请先配置 Xycloud 后端地址".

The response protocol is unchanged: successful responses use `code: 200`, the
session normalizer reads token fields from `token`, `accessToken`, or
`authToken`, and safety verification requirements continue to surface through
`XycloudApiError.verifyList`.

## Native iOS/Android Replication Guidance

Native clients should centralize account API base URL resolution in their
account auth client, not in individual screens. Use
`https://getmcode.lingyun.net/api` as the default base URL and allow an
app-config override for development or private deployments. Normalize the chosen
base URL by trimming whitespace and removing trailing slashes before appending
endpoint paths.

Preserve the same request and response behavior as the uni-app client: send
JSON `POST` bodies, treat `code == 200` as success, normalize token/user-info
fields from the response data object, and surface server-provided safety
verification lists so the UI can request email, mobile, authenticator, pay
password, or password verification when required.
