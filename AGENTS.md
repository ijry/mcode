# Agent Instructions

## mcode-app Theme Variables

- Prefer `uview-plus` runtime theme variables with the `--up-*` prefix for dark-mode styling.
- Do not introduce new `--mcode-*` theme aliases for colors, backgrounds, borders, or shadows unless there is a concrete platform limitation and the reason is documented next to the code.
- When binding component props through `upThemeVar(...)`, only pass variables that exist in the uview runtime theme table, such as `--up-page-bg-color`, `--up-card-bg-color`, `--up-main-color`, `--up-content-color`, `--up-tips-color`, `--up-border-color`, and `--up-primary`.
