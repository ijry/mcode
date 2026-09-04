import {
  buildVersionMarkerUrl,
  H5_UPDATE_GUARD_STORAGE_KEY,
  H5_UPDATE_GUARD_TTL_MS,
  H5UpdateGuardRecord,
  H5UpdateStorage,
  parseVersionMarker,
  readUpdateGuardRecord,
  runH5UpdateCheck,
  shouldReloadH5ForUpdate,
  writeUpdateGuardRecord,
} from "@/services/h5UpdateGuard"

function createStorage(initial: Record<string, string> = {}): H5UpdateStorage & { dump(): Record<string, string> } {
  const entries = new Map<string, string>(Object.entries(initial))
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value)
    },
    dump: () => Object.fromEntries(entries),
  }
}

function createFetch(body: unknown, ok = true) {
  return jest.fn(async () => ({
    ok,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  }))
}

describe("h5 update guard", () => {
  it("parses the version marker from object or plain string forms", () => {
    expect(parseVersionMarker({ buildTime: "2026-09-04T00:00:00.000Z" })).toBe("2026-09-04T00:00:00.000Z")
    expect(parseVersionMarker("2026-09-04T00:00:00.000Z")).toBe("2026-09-04T00:00:00.000Z")
    expect(parseVersionMarker({ buildTime: "  " })).toBe("")
    expect(parseVersionMarker({})).toBe("")
    expect(parseVersionMarker(null)).toBe("")
    expect(parseVersionMarker(undefined)).toBe("")
    expect(parseVersionMarker(["2026-09-04T00:00:00.000Z"])).toBe("")
  })

  it("reloads only when the deployed build differs from the running build", () => {
    const running = "build-a"
    expect(
      shouldReloadH5ForUpdate({ runningBuildTime: running, deployedBuildTime: running, now: 1000 }),
    ).toBe(false)
    expect(
      shouldReloadH5ForUpdate({ runningBuildTime: "", deployedBuildTime: "build-b", now: 1000 }),
    ).toBe(false)
    expect(
      shouldReloadH5ForUpdate({ runningBuildTime: running, deployedBuildTime: "", now: 1000 }),
    ).toBe(false)
    expect(
      shouldReloadH5ForUpdate({ runningBuildTime: running, deployedBuildTime: "build-b", now: 1000 }),
    ).toBe(true)
    expect(
      shouldReloadH5ForUpdate({ runningBuildTime: running, deployedBuildTime: " build-b ", now: 1000 }),
    ).toBe(true)
  })

  it("does not reload twice for the same deploy inside the TTL window", () => {
    const now = 10_000
    const lastReload: H5UpdateGuardRecord = { buildTime: "build-b", at: now - 1_000 }
    const options = {
      runningBuildTime: "build-a",
      deployedBuildTime: "build-b",
      lastReload,
      now,
    }
    expect(shouldReloadH5ForUpdate(options)).toBe(false)

    expect(
      shouldReloadH5ForUpdate({ ...options, lastReload: null }),
    ).toBe(true)

    expect(
      shouldReloadH5ForUpdate({
        ...options,
        lastReload: { buildTime: "build-c", at: now - 1_000 },
      }),
    ).toBe(true)

    expect(
      shouldReloadH5ForUpdate({
        ...options,
        lastReload: { buildTime: "build-b", at: now - H5_UPDATE_GUARD_TTL_MS - 1 },
      }),
    ).toBe(true)
  })

  it("round-trips the reload guard record through storage", () => {
    const storage = createStorage()
    expect(readUpdateGuardRecord(storage)).toBeNull()

    writeUpdateGuardRecord("build-b", 1234, storage)
    expect(readUpdateGuardRecord(storage)).toEqual({ buildTime: "build-b", at: 1234 })
    expect(storage.dump()[H5_UPDATE_GUARD_STORAGE_KEY]).toContain("build-b")
  })

  it("ignores corrupt or malformed guard records", () => {
    const storage = createStorage({ [H5_UPDATE_GUARD_STORAGE_KEY]: "{oops" })
    expect(readUpdateGuardRecord(storage)).toBeNull()

    const emptyStorage = createStorage({ [H5_UPDATE_GUARD_STORAGE_KEY]: '{"at":123}' })
    expect(readUpdateGuardRecord(emptyStorage)).toBeNull()
    expect(readUpdateGuardRecord(undefined)).toBeNull()
  })

  it("appends a unique cache-busting query to the marker URL", () => {
    expect(buildVersionMarkerUrl("/version.json", 1)).toBe("/version.json?_=1")
    expect(buildVersionMarkerUrl("/version.json", 2)).not.toBe("/version.json?_=1")
    expect(buildVersionMarkerUrl("/version.json?v=1", 2)).toBe("/version.json?v=1&_=2")
  })

  it("skips the check when there is no running build time or fetch", async () => {
    const fetchMock = createFetch({ buildTime: "build-b" })
    await expect(
      runH5UpdateCheck({ runningBuildTime: "", fetch: fetchMock }),
    ).resolves.toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()

    await expect(
      runH5UpdateCheck({ runningBuildTime: "build-a" }),
    ).resolves.toBe(false)
  })

  it("reloads once when the deployed build is newer and records the guard", async () => {
    const storage = createStorage()
    const reload = jest.fn()
    const fetchMock = createFetch({ buildTime: "build-b" })

    const reloaded = await runH5UpdateCheck({
      runningBuildTime: "build-a",
      storage,
      fetch: fetchMock,
      reload,
      now: () => 5000,
    })

    expect(reloaded).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith("/version.json?_=5000")
    expect(readUpdateGuardRecord(storage)).toEqual({ buildTime: "build-b", at: 5000 })
  })

  it("stays quiet when the deployed marker matches the running build", async () => {
    const storage = createStorage()
    const reload = jest.fn()

    const reloaded = await runH5UpdateCheck({
      runningBuildTime: "build-a",
      storage,
      fetch: createFetch({ buildTime: "build-a" }),
      reload,
      now: () => 5000,
    })

    expect(reloaded).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    expect(readUpdateGuardRecord(storage)).toBeNull()
  })

  it("does not reload again for the same deploy while the guard is fresh", async () => {
    const storage = createStorage({
      [H5_UPDATE_GUARD_STORAGE_KEY]: JSON.stringify({ buildTime: "build-b", at: 4000 }),
    })
    const reload = jest.fn()

    const reloaded = await runH5UpdateCheck({
      runningBuildTime: "build-a",
      storage,
      fetch: createFetch({ buildTime: "build-b" }),
      reload,
      now: () => 4500,
    })

    expect(reloaded).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it("retries an expired guard so a missed reload can recover", async () => {
    const expiredAt = 0
    const storage = createStorage({
      [H5_UPDATE_GUARD_STORAGE_KEY]: JSON.stringify({ buildTime: "build-b", at: expiredAt }),
    })
    const reload = jest.fn()

    const reloaded = await runH5UpdateCheck({
      runningBuildTime: "build-a",
      storage,
      fetch: createFetch({ buildTime: "build-b" }),
      reload,
      now: () => H5_UPDATE_GUARD_TTL_MS + 1,
    })

    expect(reloaded).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("silently survives marker fetch or parse failures", async () => {
    const reload = jest.fn()
    const storage = createStorage()

    await expect(
      runH5UpdateCheck({
        runningBuildTime: "build-a",
        storage,
        fetch: createFetch({}, false),
        reload,
      }),
    ).resolves.toBe(false)
    await expect(
      runH5UpdateCheck({
        runningBuildTime: "build-a",
        storage,
        fetch: jest.fn(async () => {
          throw new Error("network down")
        }),
        reload,
      }),
    ).resolves.toBe(false)
    await expect(
      runH5UpdateCheck({
        runningBuildTime: "build-a",
        storage,
        fetch: createFetch("not-json"),
        reload,
      }),
    ).resolves.toBe(false)
    await expect(
      runH5UpdateCheck({
        runningBuildTime: "build-a",
        storage,
        fetch: createFetch({ nope: true }),
        reload,
      }),
    ).resolves.toBe(false)
    expect(reload).not.toHaveBeenCalled()
    expect(readUpdateGuardRecord(storage)).toBeNull()
  })
})