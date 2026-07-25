const DETAIL_DEBUG_QUERY_KEY = "mcode_detail_debug"

export function isDetailDebugEnabled(url = resolveH5LocationHref()) {
  const normalizedUrl = String(url || "").trim()
  if (!normalizedUrl) return false

  const directQuery = normalizedUrl.split("#", 1)[0].split("?", 2)[1] || ""
  const hashQuery = normalizedUrl.split("#", 2)[1]?.split("?", 2)[1] || ""
  return [directQuery, hashQuery].some((query) => {
    const value = new URLSearchParams(query).get(DETAIL_DEBUG_QUERY_KEY)
    return value === "1" || value === "true"
  })
}

function resolveH5LocationHref() {
  // #ifdef H5
  return window.location.href
  // #endif
  return ""
}
