declare module "*uni_modules/up-scanner" {
  export type ScanResult = {
    content: string
    scanType: string
    charSet?: string
  }

  export type ScanFailResult = {
    errCode: number
    errMsg: string
    errSubject?: string
  }

  export type ScanOptions = {
    onlyFromCamera?: boolean
    scanType?: string[]
    autoZoom?: boolean
    success?: (res: ScanResult) => void
    fail?: (res: ScanFailResult) => void
    complete?: (res: any) => void
  }

  export function scanCode(options: ScanOptions): void
}
