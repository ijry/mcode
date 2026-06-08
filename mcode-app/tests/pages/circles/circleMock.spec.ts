import {
  cloneCirclePosts,
  toggleCirclePostFavorite,
  toggleCirclePostLike,
} from "../../../src/pages/circles/circleMock"

describe("circle mock state", () => {
  it("clones posts so page mutations do not mutate source mocks", () => {
    const first = cloneCirclePosts()
    const second = cloneCirclePosts()

    first[0].liked = !first[0].liked

    expect(second[0].liked).toBe(false)
  })

  it("toggles like state and keeps counts non-negative", () => {
    const posts = cloneCirclePosts()
    const firstId = posts[0].id

    toggleCirclePostLike(posts, firstId)
    expect(posts[0].liked).toBe(true)
    expect(posts[0].likeCount).toBe(129)

    toggleCirclePostLike(posts, firstId)
    expect(posts[0].liked).toBe(false)
    expect(posts[0].likeCount).toBe(128)
  })

  it("toggles favorite state and keeps counts non-negative", () => {
    const posts = cloneCirclePosts()
    const firstId = posts[0].id

    toggleCirclePostFavorite(posts, firstId)
    expect(posts[0].favorited).toBe(true)
    expect(posts[0].favoriteCount).toBe(37)

    toggleCirclePostFavorite(posts, firstId)
    expect(posts[0].favorited).toBe(false)
    expect(posts[0].favoriteCount).toBe(36)
  })
})
