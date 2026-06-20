# Profile Achievement Entry Gate

## Architecture

The profile page keeps the achievement center route and card implementation, but
the profile entry card is now gated for rollout. It is visible only when the
account store reports a successful login and the normalized logged-in user ID is
`3`.

## Data Flow

`pages/profile/index.vue` reads `useAccountStore()`. The computed
`showAchievementEntry` returns true only when:

- `account.isLoggedIn` is true.
- `Number(account.userInfo?.id) === 3`.

The achievement summary request is skipped unless this gate is true, so users
outside the rollout do not fetch achievement data from the profile page. The
page also watches the gate so a successful login to user `3` while the profile
page is alive loads the entry summary once.

## UI Behavior

Eligible user `id=3` sees the existing “成就中心” card and can navigate to
`/pages/achievement/index`. Other users, including logged-out users, do not see
the card.

## Compatibility And Native Guidance

This is a temporary client-side rollout gate, not a protocol change. Native
iOS/Android clients should apply the same profile-card visibility rule if they
ship the achievement entry before backend-driven feature flags are available.
