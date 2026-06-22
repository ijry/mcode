import { createPinia, setActivePinia } from "pinia"

import {
  fetchCircleComments,
  fetchCirclePost,
  fetchCirclePosts,
  fetchCircleTopics,
  publishCircleComment,
  publishCirclePost,
  toggleCircleAction,
  updateCirclePost,
  uploadCircleImage,
} from "@/services/circle"
import { XYCLOUD_DEFAULT_BASE_URL } from "@/services/xycloudAuth"
import { useAccountStore } from "@/stores/account"

describe("circle service", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    ;(globalThis as any).__XYCLOUD_BASE_URL__ = "https://xycloud.example.com/"
    uni.clearStorageSync()
    const account = useAccountStore()
    account.setSession({
      token: "Bearer token-1",
      userInfo: { name: "Ada" },
    })
  })

  afterEach(() => {
    delete (globalThis as any).__XYCLOUD_BASE_URL__
  })

  it("loads posts from the circle API and normalizes multi-topic data", async () => {
    uni.request.mockResolvedValue({
      statusCode: 200,
      data: {
        code: 200,
        msg: "ok",
        data: {
          dataList: [
            {
              id: "101",
              uid: "2",
              title: "",
              content: "正文",
              images: "[\"/a.png\"]",
              topicIdsFormat: [1, 3],
              topicList: [
                { id: 1, name: "product", title: "产品共创", postCount: 2, memberCount: 10 },
                { id: 3, name: "coding", title: "AI 编程现场", postCount: 1, memberCount: 8 },
              ],
              userInfo: { nickname: "林屿", avatar: "/avatar.png" },
              userTitle: { title: "共创官", bgColor: "#2979ff" },
              likeCount: 12,
              favoriteCount: 3,
              commentCount: 4,
              viewCount: 88,
              liked: true,
              favorited: false,
              postTime: 1781923680,
            },
          ],
          hotTopics: [],
          dataPage: { total: 1, page: 1, limit: 20 },
        },
      },
    })

    const result = await fetchCirclePosts({ order: "latest", keyword: "AI", topicId: 3, limit: 20 })

    expect(uni.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://xycloud.example.com/v1/circle/post/lists?order=latest&page=1&limit=20&keyword=AI&topicId=3",
        method: "GET",
        header: expect.objectContaining({
          Authorization: "Bearer token-1",
        }),
      })
    )
    expect(result.posts[0]).toEqual(
      expect.objectContaining({
        id: 101,
        uid: 2,
        author: "林屿",
        avatar: "/avatar.png",
        title: "",
        topicIds: [1, 3],
        topicTitles: ["产品共创", "AI 编程现场"],
        userTitle: { title: "共创官", bgColor: "#2979ff" },
        liked: true,
        favorited: false,
      })
    )
    expect(result.total).toBe(1)
  })

  it("loads a shareable circle post detail by id", async () => {
    uni.request.mockResolvedValue({
      statusCode: 200,
      data: {
        code: 200,
        msg: "ok",
        data: {
          id: "101",
          uid: "2",
          title: "详情标题",
          content: "正文 **Markdown**",
          images: ["https://cdn.example.com/a.png"],
          topicIdsFormat: "1,3",
          topicList: [
            { id: 1, title: "产品共创" },
            { id: 3, title: "AI 编程现场" },
          ],
          userInfo: { nickname: "林屿" },
          likeCount: 12,
          favoriteCount: 3,
          commentCount: 4,
          viewCount: 88,
          postTime: 1781923680,
        },
      },
    })

    const result = await fetchCirclePost(101)

    expect(uni.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://xycloud.example.com/v1/circle/post/info/101",
        method: "GET",
      })
    )
    expect(result).toEqual(
      expect.objectContaining({
        id: 101,
        title: "详情标题",
        content: "正文 **Markdown**",
        topicIds: [1, 3],
        topicTitles: ["产品共创", "AI 编程现场"],
      })
    )
  })

  it("loads a circle post detail from wrapped info payloads", async () => {
    uni.request.mockResolvedValue({
      statusCode: 200,
      data: {
        code: 200,
        msg: "ok",
        data: {
          info: {
            id: "102",
            uid: "3",
            title: "包装详情",
            content: "包装正文",
            userInfo: { nickname: "南栀" },
          },
        },
      },
    })

    const result = await fetchCirclePost(102)

    expect(result).toEqual(
      expect.objectContaining({
        id: 102,
        author: "南栀",
        title: "包装详情",
        content: "包装正文",
      })
    )
  })

  it("falls back to the production mcode API domain for circle requests", async () => {
    delete (globalThis as any).__XYCLOUD_BASE_URL__
    uni.request.mockResolvedValue({
      statusCode: 200,
      data: {
        code: 200,
        msg: "ok",
        data: {
          dataList: [],
          dataPage: { total: 0, page: 1, limit: 30 },
        },
      },
    })

    await fetchCircleTopics()

    expect(uni.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `${XYCLOUD_DEFAULT_BASE_URL}/v1/circle/topic/lists?page=1&limit=30`,
        method: "GET",
      })
    )
  })

  it("publishes with optional blank title, direct multi-topic ids, and image urls", async () => {
    uni.request.mockResolvedValue({
      statusCode: 200,
      data: { code: 200, msg: "ok", data: { id: 120 } },
    })

    await publishCirclePost({
      title: "",
      content: "  只发正文  ",
      topicIds: [3, 2],
      images: ["https://cdn.example.com/a.png", "https://cdn.example.com/b.png"],
    })

    expect(uni.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://xycloud.example.com/v1/circle/post/add",
        method: "POST",
        data: {
          title: "",
          content: "只发正文",
          topicIds: "3,2",
          images: ["https://cdn.example.com/a.png", "https://cdn.example.com/b.png"],
        },
      })
    )
  })

  it("updates a circle post through the edit API", async () => {
    uni.request.mockResolvedValue({
      statusCode: 200,
      data: { code: 200, msg: "ok", data: { id: 101 } },
    })

    const result = await updateCirclePost({
      id: 101,
      title: "更新标题",
      content: "更新正文",
      topicIds: [1, 3],
      images: ["https://cdn.example.com/a.png"],
    })

    expect(uni.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://xycloud.example.com/v1/circle/post/edit/101",
        method: "POST",
        data: {
          title: "更新标题",
          content: "更新正文",
          topicIds: "1,3",
          images: ["https://cdn.example.com/a.png"],
        },
      })
    )
    expect(result).toEqual({ id: 101 })
  })

  it("uploads circle images through the shared xycloud upload endpoint", async () => {
    uni.uploadFile.mockImplementation((options) => {
      options.success({
        statusCode: 200,
        data: JSON.stringify({
          code: 200,
          msg: "ok",
          data: {
            url: "https://cdn.example.com/a.png",
            path: "/storage/a.png",
            name: "a.png",
          },
        }),
      })
    })

    const result = await uploadCircleImage("/tmp/a.png")

    expect(uni.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://xycloud.example.com/v1/core/index/upload",
        filePath: "/tmp/a.png",
        name: "file",
        header: {
          Authorization: "Bearer token-1",
        },
      })
    )
    expect(result).toEqual({
      url: "https://cdn.example.com/a.png",
      path: "/storage/a.png",
      name: "a.png",
    })
  })

  it("toggles like and favorite through the shared action endpoint", async () => {
    uni.request.mockResolvedValue({
      statusCode: 200,
      data: { code: 200, msg: "ok", data: { currentValue: 1 } },
    })

    await expect(toggleCircleAction(101, 2)).resolves.toBe(true)

    expect(uni.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://xycloud.example.com/v1/action/action/set",
        method: "POST",
        data: {
          dataModel: "circle_post",
          dataId: 101,
          actionType: 2,
        },
      })
    )
  })

  it("loads comments through the shared comment endpoint", async () => {
    uni.request.mockResolvedValue({
      statusCode: 200,
      data: {
        code: 200,
        msg: "ok",
        data: {
          dataList: [
            {
              id: "mcode-circle-101-0001",
              uid: "2",
              content: "这条评论很有价值",
              createTime: 1781923680,
              replyCount: 1,
              zanCount: 2,
              userInfo: { nickname: "林屿", avatar: "/avatar.png" },
              children: [
                {
                  id: "mcode-circle-101-0002",
                  uid: "3",
                  content: "同意",
                  createTime: 1781923700,
                  userInfo: { nickname: "南栀" },
                },
              ],
            },
          ],
          dataPage: { total: 1, page: 1, limit: 20 },
        },
      },
    })

    const result = await fetchCircleComments({ postId: 101, page: 1, limit: 20 })

    expect(uni.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://xycloud.example.com/v1/comment/comment/lists?dataModel=circle_post&dataId=101&page=1&limit=20&sortBy=createTime%20desc",
        method: "GET",
      })
    )
    expect(result.comments[0]).toEqual(
      expect.objectContaining({
        id: "mcode-circle-101-0001",
        uid: 2,
        author: "林屿",
        avatar: "/avatar.png",
        content: "这条评论很有价值",
        replyCount: 1,
        likeCount: 2,
      })
    )
    expect(result.comments[0].children[0]).toEqual(
      expect.objectContaining({
        author: "南栀",
        content: "同意",
      })
    )
  })

  it("publishes a top-level circle comment", async () => {
    uni.request.mockResolvedValue({
      statusCode: 200,
      data: {
        code: 200,
        msg: "ok",
        data: {
          comment: {
            id: "mcode-circle-new",
            uid: "2",
            content: "新的评论内容",
            createTime: 1781923900,
          },
        },
      },
    })

    const result = await publishCircleComment({ postId: 101, content: "  新的评论内容  " })

    expect(uni.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://xycloud.example.com/v1/comment/comment/add",
        method: "POST",
        data: {
          dataModel: "circle_post",
          dataId: 101,
          content: "新的评论内容",
          pid: 0,
          tpid: 0,
        },
      })
    )
    expect(result.content).toBe("新的评论内容")
  })

  it("publishes a nested circle comment reply with parent and thread ids", async () => {
    uni.request.mockResolvedValue({
      statusCode: 200,
      data: {
        code: 200,
        msg: "ok",
        data: {
          comment: {
            id: "mcode-circle-reply",
            uid: "2",
            content: "回复内容",
            createTime: 1781924000,
          },
        },
      },
    })

    await publishCircleComment({
      postId: 101,
      content: "  回复内容  ",
      pid: "reply-parent-1",
      tpid: "top-comment-1",
    })

    expect(uni.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://xycloud.example.com/v1/comment/comment/add",
        method: "POST",
        data: {
          dataModel: "circle_post",
          dataId: 101,
          content: "回复内容",
          pid: "reply-parent-1",
          tpid: "top-comment-1",
        },
      })
    )
  })
})
