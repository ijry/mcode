export {};

declare module "vue" {
  type Hooks = App.AppInstance & Page.PageInstance;
  interface ComponentCustomOptions extends Hooks {}
  interface ComponentCustomProperties {
    upThemeIsDark: boolean
    upThemeVars: Record<string, string>
    upThemePageStyle: Record<string, string>
    upThemeCardStyle: Record<string, string>
    upThemeVar: (varName: string, fallbackColor?: string) => string
    upApplyNativeThemeUI: () => void
  }
}
