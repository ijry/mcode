# 2026-07-02 Detail Navbar Status Bar Background

## Architecture

Conversation detail uses `up-navbar` as the fixed top chrome. The navbar now
passes `statusBarBgColor` explicitly, using the same value as `bgColor`.

Both values resolve from the uview runtime variable `--up-card-bg-color`. This
keeps the phone status bar and the visible navigation bar as one continuous
surface and avoids relying on translucent CSS expressions in the native status
bar area.

## Protocol And Data Flow

No backend, database, or runtime protocol changes. This is a local presentation
change in the conversation detail page.

## UI Behavior

The status bar area above the title row is no longer transparent. It inherits
the same themed card background as the navbar, so the page atmosphere and
message area do not show behind the device status icons.

## Compatibility

`u-navbar` already renders a `u-status-bar` when `safeAreaInsetTop` is enabled.
Passing `statusBarBgColor` makes that behavior explicit across H5, app, and
mini-program targets. The color uses an existing `--up-*` variable and does not
introduce new mcode theme aliases.

## Native iOS/Android Replication

Native clients should set the system status bar backing view and the top
navigation bar background to the same theme card color. Do not use a translucent
or page-atmosphere background behind status icons unless the native page has a
dedicated transparent-navigation design.
