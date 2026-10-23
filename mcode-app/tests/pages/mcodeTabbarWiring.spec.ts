import fs from "node:fs"
import path from "node:path"

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8")
}

const COMPONENT = "../../src/components/McodeTabBar.vue"
const PAGES_JSON = "../../src/pages.json"

/** 5 个 tab 页：`pages.json` 的 `tabBar.list` 决定了哪些页面必须出现悬浮胶囊底栏。 */
const TAB_PAGES = [
  { name: "connections", pagePath: "pages/connections/index" },
  { name: "conversations", pagePath: "pages/conversations/index" },
  { name: "tasks", pagePath: "pages/tasks/index" },
  { name: "circles", pagePath: "pages/circles/index" },
  { name: "profile", pagePath: "pages/profile/index" },
]

/**
 * 悬浮胶囊底栏（自定义 tabBar）的**接线**契约。
 *
 * 症状（用户报的）：「自定义 tabbar 没生效」—— 5 个 tab 页底部只看到原生 tabBar，
 * 设计稿那颗悬浮胶囊完全不出现，控制台也没有报错。
 *
 * 根因：`<McodeTabBar />` 在 5 个页面的模板里直接写了，但**没有任何一处 import**。
 * 自定义的 `.vue` 组件不是 `u-` / `up-` 前缀，`pages.json` 的 easycom custom 规则
 * 匹配不到；autoscan 的约定又要求 `components/组件名/组件名.vue` 这种**目录结构**，
 * 而本文件是扁平的 `components/McodeTabBar.vue`，同样命中不了。
 *
 * 于是 `<McodeTabBar />` 落到 Vue 手上就是一个**未解析组件**：不抛错、不中断渲染，
 * 只在 dev 版打一条 "Failed to resolve component" 警告 —— 发布版里这条警告也没有，
 * 症状就表现为「页面正常、底栏凭空消失」，很难查。
 *
 * 项目里其它共享组件（`MarqueeText` / `PetPanel` / `GitDiffViewer` / `ProjectFolderList`）
 * 一律是显式 import：底部浮层不生效时也不报错，靠 Review 发现不可靠，所以这里用源码
 * 断言把「模板里用了就必须 import」固定下来。
 */
describe("McodeTabBar wiring contract", () => {
  it("imports McodeTabBar wherever it is rendered in a template", () => {
    // 扫描全部页面：任何写了 <McodeTabBar 的 .vue，都必须有一条对应的 import。
    // 只覆盖 tabBar 列表防不住 —— 将来底栏挂到别的页面上，同样会静默失效。
    const pagesRoot = path.resolve(__dirname, "../../src/pages")
    const offenders: string[] = []

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
          continue
        }
        if (!entry.name.endsWith(".vue")) continue

        const source = fs.readFileSync(full, "utf8")
        if (!/<McodeTabBar[\s/>]/.test(source)) continue
        if (/import\s+McodeTabBar\s+from\s+["'][^"']*McodeTabBar\.vue["']/.test(source)) continue
        offenders.push(path.relative(pagesRoot, full))
      }
    }
    walk(pagesRoot)

    expect(offenders).toEqual([])
  })

  it("mounts the tabbar on every tab page declared in pages.json", () => {
    // pages.json 的 tabBar.list 是 switchTab 的路由表，也是「哪些页面该有底栏」的权威来源。
    // 漏一页的表现是该页底部空一块（原生栏已被 hideTabBar 压掉）。
    const declared = TAB_PAGES.map((item) => item.pagePath)
    const configured = read(PAGES_JSON).match(/"pagePath":\s*"([^"]+)"/g) || []

    expect(configured.map((line) => line.replace(/"pagePath":\s*"|"/g, ""))).toEqual(declared)

    for (const item of TAB_PAGES) {
      const source = read(`../../src/pages/${item.name}/index.vue`)
      expect(source).toContain(`<McodeTabBar current="${item.name}" />`)
    }
  })

  it("keeps the tab order aligned with pages.json because badges are addressed by index", () => {
    // setTabBarBadge / conversationTabBadgeService 按**索引**定位 tab。两处顺序一旦错位，
    // 会话未读数会长到「连接」或「任务」头上。
    const source = read(COMPONENT)
    const order = [...source.matchAll(/name:\s*"(\w+)",\s*text:/g)].map((match) => match[1])

    expect(order).toEqual(TAB_PAGES.map((item) => item.name))
  })

  it("hides the native tabbar, which would otherwise render under the floating pill", () => {
    const source = read(COMPONENT)

    // 保留 pages.json 的原生 tabBar 配置（switchTab 路由表 + setTabBarBadge 依赖它），
    // 所以必须**运行时压掉**原生栏，而不是删配置。
    expect(source).toContain("uni.hideTabBar?.(")
    // animation:false 必须断言在**函数体**里，不能对整份文件做 toContain ——
    // 上面「为什么 animation:false 是关键」那段注释里也有这个字符串，注释会替看起来
    // 消失的选项挡下断言（变异试过：删掉实参，全文件断言照样是绿的）。
    const fn = source.slice(source.indexOf("function hideNativeTabBar()"))
    expect(fn.slice(0, fn.indexOf("}"))).toContain("animation: false")
    // switchTab 会让原生栏重新露出来，因此每次进入页面都得再压一遍：
    // 组件内的 onShow 对所在页生效，挂一次等于 5 个页面各自都有。
    expect(source).toContain("onShow(() => {")
  })

  it("reserves bottom space so the fixed pill does not cover the last row", () => {
    // 胶囊是 position: fixed，脱离文档流 —— 页面不自己留白的话，
    // 最后一行会被压在胶囊底下（看得见一半、点不到）。
    // 两个实现都接受：其它页统一用 .page--with-tabbar，连接页用自己的 .connections-shell。
    //
    // 留白值**从组件几何算出来**而不是写死一个 70：光断言「5 个页面都有 70px」防不住
    // 最常见的改法 —— 把胶囊调矮了却忘了同步留白（或反过来），底部就凭空多一条空白 /
    // 最后一行被压住。所以这里从 `McodeTabBar` 读出「上内距 + 胶囊高 + 下内距」再比对。
    const component = read(COMPONENT)
    const padding = /\.mc-tabbar\s*\{[\s\S]*?padding:\s*(\d+)px\s+\d+px\s+calc\((\d+)px/.exec(component)
    const height = /&__bar\s*\{[\s\S]*?height:\s*(\d+)px/.exec(component)
    expect(padding).not.toBeNull()
    expect(height).not.toBeNull()

    const reserve = Number(padding![1]) + Number(height![1]) + Number(padding![2])
    // 反算出的占位 = 12(上内距) + 62(胶囊高) + 0(下内距，按 iOS 标准已交给安全区)。
    // 在带 Home 指示条的机型上安全区≈34px，所以胶囊实际离屏底 34px（系统 tabBar 同位置）；
    // 反算值 74 只是「无安全区兜底」下的几何，上限 82 仍留缓冲，不能再往上加。
    expect(reserve).toBeLessThanOrEqual(82)

    for (const item of TAB_PAGES) {
      const source = read(`../../src/pages/${item.name}/index.vue`)
      expect(source).toContain(`calc(${reserve}px + env(safe-area-inset-bottom))`)
    }
  })
})
