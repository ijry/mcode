export type ConnectionHostKind = "laptop" | "desktop" | "mini-pc" | "cloud-server" | "computer"

export interface ConnectionHostModel {
  id: string
  brand: string
  model: string
  displayName: string
  kind: ConnectionHostKind
  filters: string[]
  keywords: string[]
  image: string
  logo?: string
  sourceUrl: string
}

export interface ConnectionHostFilter {
  id: string
  label: string
}

export const DEFAULT_CONNECTION_HOST_MODEL_ID = "other-computer"

export const CONNECTION_HOST_FILTERS: ConnectionHostFilter[] = [
  { id: "all", label: "全部" },
  { id: "apple", label: "Apple" },
  { id: "lenovo", label: "联想" },
  { id: "dell", label: "戴尔" },
  { id: "hp", label: "惠普" },
  { id: "gaming", label: "游戏本" },
  { id: "mini-pc", label: "Mini PC" },
  { id: "cloud", label: "云服务器" },
  { id: "other", label: "其他" },
]

export const CONNECTION_HOST_MODELS: ConnectionHostModel[] = [
  host("apple-macbook-air", "Apple", "MacBook Air", "laptop", ["apple"], ["macbook", "air", "苹果"], "https://www.apple.com/macbook-air/"),
  host("apple-mac-mini", "Apple", "Mac mini", "mini-pc", ["apple", "mini-pc"], ["macmini", "mini", "苹果"], "https://www.apple.com/mac-mini/"),
  host("apple-imac", "Apple", "iMac", "desktop", ["apple"], ["imac", "一体机", "苹果"], "https://www.apple.com/imac/"),
  host("dell-xps", "Dell", "XPS", "laptop", ["dell"], ["戴尔", "xps"], "https://www.dell.com/en-us/shop/dell-laptops/scr/laptops/xps"),
  host("dell-alienware", "Dell", "Alienware", "laptop", ["dell", "gaming"], ["外星人", "alienware", "游戏本"], "https://www.dell.com/en-us/gaming/alienware-laptops"),
  host("lenovo-thinkpad", "Lenovo", "ThinkPad", "laptop", ["lenovo"], ["联想", "thinkpad", "小黑"], "https://www.lenovo.com/us/en/c/laptops/thinkpad/"),
  host("lenovo-legion", "Lenovo", "Legion / 拯救者", "laptop", ["lenovo", "gaming"], ["联想", "legion", "拯救者", "游戏本"], "https://www.lenovo.com/us/en/c/laptops/legion-laptops/"),
  host("hp-omen", "HP", "OMEN / 暗影精灵", "laptop", ["hp", "gaming"], ["惠普", "omen", "暗影精灵", "游戏本"], "https://www.hp.com/us-en/shop/mdp/omen-gaming"),
  host("beelink-mini-pc", "Beelink", "Mini PC / 零刻", "mini-pc", ["mini-pc"], ["零刻", "beelink", "迷你主机"], "https://www.bee-link.com/"),
  host("mechrevo-laptop", "MECHREVO", "机械革命", "laptop", ["gaming"], ["mechrevo", "机械革命", "游戏本"], "https://www.mechrevo.com/"),
  host("asus-rog", "ASUS", "ROG", "laptop", ["gaming"], ["华硕", "rog", "玩家国度", "游戏本"], "https://rog.asus.com/laptops/"),
  host("msi-gaming", "MSI", "Gaming Laptop", "laptop", ["gaming"], ["微星", "msi", "游戏本"], "https://www.msi.com/Laptops"),
  host("microsoft-surface", "Microsoft", "Surface", "laptop", [], ["微软", "surface"], "https://www.microsoft.com/surface"),
  host("framework-laptop", "Framework", "Laptop", "laptop", [], ["framework", "模块化"], "https://frame.work/products/laptop13-diy-intel-ultra-1"),
  host("alibaba-cloud-ecs", "Alibaba Cloud", "ECS", "cloud-server", ["cloud"], ["阿里云", "aliyun", "alibaba", "ecs", "云服务器"], "https://www.alibabacloud.com/product/ecs"),
  host("aws-ec2", "AWS", "EC2", "cloud-server", ["cloud"], ["amazon", "aws", "ec2", "云服务器"], "https://aws.amazon.com/ec2/"),
  host("tencent-cloud-cvm", "Tencent Cloud", "CVM", "cloud-server", ["cloud"], ["腾讯云", "tencent", "cvm", "云服务器"], "https://www.tencentcloud.com/products/cvm"),
  host("huawei-cloud-ecs", "Huawei Cloud", "ECS", "cloud-server", ["cloud"], ["华为云", "huawei", "ecs", "云服务器"], "https://www.huaweicloud.com/intl/en-us/product/ecs.html"),
  host("azure-vm", "Azure", "Virtual Machines", "cloud-server", ["cloud"], ["azure", "microsoft", "vm", "云服务器"], "https://azure.microsoft.com/en-us/products/virtual-machines"),
  host("google-compute-engine", "Google Cloud", "Compute Engine", "cloud-server", ["cloud"], ["gcp", "google", "compute", "云服务器"], "https://cloud.google.com/compute"),
  host("oracle-cloud-compute", "Oracle Cloud", "Compute", "cloud-server", ["cloud"], ["oracle", "oci", "compute", "云服务器"], "https://www.oracle.com/cloud/compute/"),
  host("digitalocean-droplet", "DigitalOcean", "Droplet", "cloud-server", ["cloud"], ["digitalocean", "droplet", "云服务器"], "https://www.digitalocean.com/products/droplets"),
  host("other-computer", "Other", "Computer", "computer", ["other"], ["其他", "电脑", "主机"], "local"),
]

const HOST_MODEL_MAP = new Map(CONNECTION_HOST_MODELS.map((item) => [item.id, item]))

export function isKnownConnectionHostModelId(value: unknown): value is string {
  return typeof value === "string" && HOST_MODEL_MAP.has(value.trim())
}

export function normalizeConnectionHostModelId(value: unknown): string | undefined {
  if (!isKnownConnectionHostModelId(value)) return undefined
  return value.trim()
}

export function getConnectionHostModel(value: unknown): ConnectionHostModel {
  const id = normalizeConnectionHostModelId(value) || DEFAULT_CONNECTION_HOST_MODEL_ID
  return HOST_MODEL_MAP.get(id) || HOST_MODEL_MAP.get(DEFAULT_CONNECTION_HOST_MODEL_ID)!
}

export function searchConnectionHostModels(query = "", filterId = "all"): ConnectionHostModel[] {
  const normalizedQuery = normalizeSearchText(query)
  const normalizedFilter = String(filterId || "all").trim()

  return CONNECTION_HOST_MODELS.filter((item) => {
    const matchesFilter = normalizedFilter === "all" || item.filters.includes(normalizedFilter)
    if (!matchesFilter) return false
    if (!normalizedQuery) return true

    return normalizeSearchText([
      item.brand,
      item.model,
      item.displayName,
      item.kind,
      ...item.keywords,
    ].join(" ")).includes(normalizedQuery)
  })
}

function host(
  id: string,
  brand: string,
  model: string,
  kind: ConnectionHostKind,
  filters: string[],
  keywords: string[],
  sourceUrl: string
): ConnectionHostModel {
  return {
    id,
    brand,
    model,
    displayName: `${brand} ${model}`,
    kind,
    filters,
    keywords,
    image: `/static/connection-hosts/${id}.svg`,
    logo: `/static/connection-hosts/${brandLogoName(brand)}.svg`,
    sourceUrl,
  }
}

function brandLogoName(brand: string) {
  return brand
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function normalizeSearchText(value: string) {
  return String(value || "").trim().toLowerCase()
}
