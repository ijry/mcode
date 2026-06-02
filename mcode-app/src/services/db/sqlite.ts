export interface SqliteDriver {
  open(): Promise<void>
  execute(sql: string, params?: unknown[]): Promise<void>
  query<T>(sql: string, params?: unknown[]): Promise<T[]>
  transaction<T>(run: () => Promise<T>): Promise<T>
}

let opened = false

async function ensureOpen() {
  if (opened) return
  opened = true
}

export const sqliteDriver: SqliteDriver = {
  async open() {
    await ensureOpen()
  },
  async execute(_sql: string, _params?: unknown[]) {
    await ensureOpen()
    throw new Error("sqlite execute is not wired to a concrete uni-app driver yet")
  },
  async query<T>(_sql: string, _params?: unknown[]) {
    await ensureOpen()
    throw new Error("sqlite query is not wired to a concrete uni-app driver yet") as never
  },
  async transaction<T>(run: () => Promise<T>) {
    await ensureOpen()
    return await run()
  },
}

