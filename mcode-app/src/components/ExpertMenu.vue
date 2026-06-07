<template>
  <view class="expert-menu">
    <!-- 触发按钮 -->
    <view class="menu-trigger" @click="showMenu = true">
      <up-icon name="list-dot" size="18" :color="upThemeVar('--up-warning', '#ff9900')"></up-icon>
      <text class="trigger-label">命令</text>
    </view>

    <up-popup v-model:show="showMenu" mode="bottom" :round="20">
      <view class="menu-wrap">
        <!-- 头部 -->
        <view class="menu-hd">
          <text class="menu-hd__title">专家命令</text>
          <view class="menu-close" @click="showMenu = false">
            <up-icon name="close" size="20" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
          </view>
        </view>

        <!-- 搜索 -->
        <view class="search-wrap">
          <up-search
            v-model="searchKeyword"
            placeholder="搜索命令..."
            :show-action="false"
            shape="round"
          ></up-search>
        </view>

        <!-- 命令分类 -->
        <scroll-view scroll-y class="category-scroll">
          <view
            v-for="category in filteredCategories"
            :key="category.name"
            class="category-block"
          >
            <text class="category-title">{{ category.name }}</text>
            <view class="cmd-grid">
              <view
                v-for="cmd in category.commands"
                :key="cmd.id"
                class="cmd-card"
                @click="selectCommand(cmd)"
              >
                <view class="cmd-icon" :style="{ backgroundColor: cmd.color + '18' }">
                  <up-icon :name="cmd.icon" size="22" :color="cmd.color"></up-icon>
                </view>
                <view class="cmd-info">
                  <text class="cmd-info__name">{{ cmd.name }}</text>
                  <text class="cmd-info__desc">{{ cmd.description }}</text>
                </view>
              </view>
            </view>
          </view>

          <view v-if="filteredCategories.length === 0" class="empty-result">
            <up-empty text="没有找到匹配的命令"></up-empty>
          </view>

          <view class="safe-bottom"></view>
        </scroll-view>
      </view>
    </up-popup>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from "vue"

interface Command {
  id: string
  name: string
  description: string
  prompt: string
  icon: string
  color: string
}

interface Category {
  name: string
  commands: Command[]
}

const emit = defineEmits<{
  select: [command: Command]
}>()

const showMenu = ref(false)
const searchKeyword = ref("")

const categories: Category[] = [
  {
    name: "代码相关",
    commands: [
      { id: "code_review",   name: "代码审查", description: "审查质量、安全性和最佳实践",   prompt: "请审查以下代码，关注代码质量、安全性、性能和最佳实践：", icon: "eye",               color: "#2979ff" },
      { id: "code_explain",  name: "解释代码", description: "详细解释代码的功能和实现",     prompt: "请详细解释以下代码的功能、实现原理和关键逻辑：",         icon: "info-circle",       color: "#19be6b" },
      { id: "code_optimize", name: "优化代码", description: "提供性能与可读性优化建议",     prompt: "请分析以下代码并提供优化建议，包括性能、可读性和可维护性：", icon: "setting",           color: "#ff9900" },
      { id: "code_refactor", name: "重构代码", description: "重构以提高代码质量",           prompt: "请重构以下代码，提高其可读性、可维护性和代码质量：",       icon: "reload",            color: "#9c27b0" },
      { id: "add_tests",     name: "添加测试", description: "为代码生成单元测试",           prompt: "请为以下代码编写完整的单元测试，包括边界情况和异常处理：", icon: "checkmark-circle",  color: "#00bcd4" },
      { id: "fix_bug",       name: "修复Bug",  description: "分析并修复代码中的问题",       prompt: "请分析以下代码中的问题并提供修复方案：",                 icon: "close-circle",      color: "#fa3534" },
    ],
  },
  {
    name: "文档相关",
    commands: [
      { id: "add_comments", name: "添加注释",   description: "为代码添加详细注释",         prompt: "请为以下代码添加详细的注释，解释关键逻辑和参数：",         icon: "chat",       color: "#2979ff" },
      { id: "write_docs",   name: "编写文档",   description: "生成API文档或使用说明",       prompt: "请为以下代码编写详细的文档，包括功能说明、参数、返回值和使用示例：", icon: "file-text", color: "#19be6b" },
      { id: "write_readme", name: "编写README", description: "生成项目README文档",         prompt: "请为这个项目编写一个完整的README文档：",                 icon: "book",       color: "#ff9900" },
    ],
  },
  {
    name: "Git相关",
    commands: [
      { id: "commit_message", name: "提交信息", description: "根据更改生成提交信息", prompt: "请根据以下代码更改生成一个清晰、规范的Git提交信息：", icon: "checkmark", color: "#2979ff" },
      { id: "pr_description", name: "PR描述",   description: "生成Pull Request描述", prompt: "请根据以下更改生成一个详细的Pull Request描述：",       icon: "share",     color: "#19be6b" },
    ],
  },
  {
    name: "其他",
    commands: [
      { id: "translate",  name: "翻译",     description: "翻译文本到其他语言", prompt: "请将以下内容翻译成",               icon: "globe", color: "#00bcd4" },
      { id: "summarize",  name: "总结",     description: "总结长文本的要点",   prompt: "请总结以下内容的关键要点：",       icon: "list",  color: "#9c27b0" },
      { id: "brainstorm", name: "头脑风暴", description: "生成创意和想法",     prompt: "请针对以下主题进行头脑风暴：",     icon: "bulb",  color: "#ff9900" },
    ],
  },
]

const filteredCategories = computed(() => {
  if (!searchKeyword.value) return categories
  const kw = searchKeyword.value.toLowerCase()
  return categories
    .map((c) => ({
      ...c,
      commands: c.commands.filter(
        (cmd) => cmd.name.includes(kw) || cmd.description.includes(kw)
      ),
    }))
    .filter((c) => c.commands.length > 0)
})

function selectCommand(cmd: Command) {
  emit("select", cmd)
  showMenu.value = false
}
</script>

<style scoped lang="scss">
/* ===== 触发 ===== */
.expert-menu {
  display: inline-flex;
}

.menu-trigger {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 14rpx 20rpx;
  background-color: color-mix(in srgb, var(--mcode-warning) 14%, var(--mcode-card-bg) 86%);
  border-radius: 20rpx;
  transition: background-color 0.15s;

  &:active { background-color: color-mix(in srgb, var(--mcode-warning) 22%, var(--mcode-card-bg) 78%); }
}

.trigger-label {
  font-size: 26rpx;
  font-weight: 500;
  color: var(--mcode-warning);
}

/* ===== 弹层容器 ===== */
.menu-wrap {
  background-color: var(--mcode-card-bg);
  display: flex;
  flex-direction: column;
  max-height: 85vh;
}

.menu-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 36rpx 32rpx 20rpx;
  flex-shrink: 0;
}

.menu-hd__title {
  font-size: 34rpx;
  font-weight: 600;
  color: var(--mcode-text-primary);
}

.menu-close {
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--mcode-card-soft-bg);
  border-radius: 50%;
}

.search-wrap {
  padding: 0 24rpx 20rpx;
  flex-shrink: 0;
}

.category-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0 24rpx;
}

/* ===== 分类 ===== */
.category-block {
  margin-bottom: 32rpx;
}

.category-title {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
  color: var(--mcode-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 1rpx;
  margin-bottom: 16rpx;
  padding-left: 4rpx;
}

/* ===== 命令网格 ===== */
.cmd-grid {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.cmd-card {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 20rpx 16rpx;
  background-color: var(--mcode-card-soft-bg);
  border-radius: 16rpx;
  transition: background-color 0.15s;

  &:active {
    background-color: var(--mcode-card-muted-bg);
  }

  &--active {
    background-color: color-mix(in srgb, var(--mcode-primary) 10%, var(--mcode-card-bg) 90%);
  }
}

.cmd-icon {
  width: 76rpx;
  height: 76rpx;
  border-radius: 18rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.cmd-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.cmd-info__name {
  font-size: 30rpx;
  font-weight: 500;
  color: var(--mcode-text-primary);
}

.cmd-info__desc {
  font-size: 24rpx;
  color: var(--mcode-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-result {
  padding: 60rpx 0;
}

.safe-bottom {
  height: calc(24rpx + env(safe-area-inset-bottom));
}
</style>
