declare module "sql.js" {
  export interface QueryExecResult {
    columns: string[]
    values: unknown[][]
  }

  export interface Statement {
    bind(params?: unknown[]): void
    step(): boolean
    getAsObject(): Record<string, unknown>
    free(): void
  }

  export interface Database {
    run(sql: string, params?: unknown[]): void
    exec(sql: string, params?: unknown[]): QueryExecResult[]
    prepare(sql: string): Statement
    export(): Uint8Array
    close(): void
  }

  export interface SqlJsStatic {
    Database: new (data?: Uint8Array | ArrayLike<number> | Buffer | null) => Database
  }

  export default function initSqlJs(config?: {
    locateFile?: (file: string) => string
  }): Promise<SqlJsStatic>
}

declare module "sql.js/dist/sql-wasm.wasm?url" {
  const url: string
  export default url
}
