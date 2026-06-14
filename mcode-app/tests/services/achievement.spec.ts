import {
  getAchievementCenterData,
  getAchievementEntrySummary,
  getAchievementRanking,
} from "../../src/services/achievement"

describe("achievement service mocks", () => {
  it("returns entry summary for the profile entry card", async () => {
    const entry = await getAchievementEntrySummary()

    expect(entry.hasNew).toBe(true)
    expect(entry.unlockedCount).toBe(12)
    expect(entry.percentile).toBe(90)
    expect(entry.highlightText).toContain("击败了全国 90%")
  })

  it("clones center data so consumer mutations do not leak back into the source mock", async () => {
    const first = await getAchievementCenterData()
    const second = await getAchievementCenterData()

    first.summary.title.name = "临时头衔"
    first.unlocked[0].name = "临时成就"
    first.feed[0].text = "临时动态"

    expect(second.summary.title.name).toBe("金牌 Yes 工程师")
    expect(second.unlocked[0].name).toBe("金牌 Yes 工程师")
    expect(second.feed[0].text).toContain("金牌 Yes 工程师")
  })

  it("returns cloned ranking payloads for different scopes and metrics", async () => {
    const citySpeed = await getAchievementRanking("city", "response_speed")
    const friendsCount = await getAchievementRanking("friends", "response_count")

    expect(citySpeed.scope).toBe("city")
    expect(citySpeed.metric).toBe("response_speed")
    expect(citySpeed.self.rank).toBe(12)
    expect(citySpeed.list[0].rank).toBe(1)

    friendsCount.list[0].nickname = "临时用户"
    const nextFriendsCount = await getAchievementRanking("friends", "response_count")
    expect(nextFriendsCount.list[0].nickname).toBe("阿周")
  })
})
