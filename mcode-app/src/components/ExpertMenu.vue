<template>
  <view class="expert-menu">
    <view class="menu-trigger" @click="showMenu = true">
      <u-icon name="lightning" size="20" color="#ff9900"></u-icon>
      <text class="trigger-text">快捷命令</text>
    </view>

    <u-popup v-model:show="showMenu" mode="bottom" :round="10">
      <view class="menu-content">
        <view class="menu-header">
          <text class="menu-title">专家命令</text>
          <u-icon name="close" size="24" @click="showMenu = false"></u-icon>
        </view>

        <view class="search-bar">
          <u-search
            v-model="searchKeyword"
            placeholder="搜索命令..."
            :show-action="false"
          ></u-search>
        </view>

        <view class="command-categories">
          <view
            v-for="category in filteredCategories"
            :key="category.name"
            class="category-section"
          >
            <text class="category-title">{{ category.name }}</text>
            <view class="command-list">
              <view
                v-for="cmd in category.commands"
                :key="cmd.id"
                class="command-item"
                @click="selectCommand(cmd)"
              >
                <view class="command-icon" :style="{ backgroundColor: cmd.color + '20' }">
                  <u-icon :name="cmd.icon" size="20" :color="cmd.color"></u-icon>
                </view>
                <view class="command-content">
                  <text class="command-name">{{ cmd.name }}</text>
                  <text class="command-desc">{{ cmd.description }}</text>
                </view>
                <u-icon name="arrow-right" size="14" color="#c0c4cc"></u-icon>
              </view>
            </view>
          </view>
        </view>
      </view>
    </u-popup>
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
      {
        id: "code_review",
        name: "代码审查",
        description: "审查代码质量、安全性和最佳实践",
        prompt: "请审查以下代码，关注代码质量、安全性、性能和最佳实践：",
        icon: "eye",
        color: "#2979ff",
      },
      {
        id: "code_explain",
        name: "解释代码",
        description: "详细解释代码的功能和实现",
        prompt: "请详细解释以下代码的功能、实现原理和关键逻辑：",
        icon: "info-circle",
        color: "#19be6b",
      },
      {
        id: "code_optimize",
        name: "优化代码",
        description: "提供代码优化建议",
        prompt: "请分析以下代码并提供优化建议，包括性能、可读性和可维护性：",
        icon: "setting",
        color: "#ff9900",
      },
      {
        id: "code_refactor",
        name: "重构代码",
        description: "重构代码以提高质量",
        prompt: "请重构以下代码，提高其可读性、可维护性和代码质量：",
        icon: "reload",
        color: "#9c27b0",
      },
      {
        id: "add_tests",
        name: "添加测试",
        description: "为代码生成单元测试",
        prompt: "请为以下代码编写完整的单元测试，包括边界情况和异常处理：",
        icon: "checkmark-circle",
        color: "#00bcd4",
      },
      {
        id: "fix_bug",
        name: "修复Bug",
        description: "分析并修复代码中的问题",
        prompt: "请分析以下代码中的问题并提供修复方案：",
        icon: "bug",
        color: "#fa3534",
      },
    ],
  },
  {
    name: "文档相关",
    commands: [
      {
        id: "add_comments",
        name: "添加注释",
        description: "为代码添加详细注释",
        prompt: "请为以下代码添加详细的注释，解释关键逻辑和参数：",
        icon: "chat",
        color: "#2979ff",
      },
      {
        id: "write_docs",
        name: "编写文档",
        description: "生成API文档或使用说明",
        prompt: "请为以下代码编写详细的文档，包括功能说明、参数、返回值和使用示例：",
        icon: "file-text",
        color: "#19be6b",
      },
      {
        id: "write_readme",
        name: "编写README",
        description: "生成项目README文档",
        prompt: "请为这个项目编写一个完整的README文档，包括项目介绍、安装、使用和贡献指南：",
        icon: "book",
        color: "#ff9900",
      },
    ],
  },
  {
    name: "Git相关",
    commands: [
      {
        id: "commit_message",
        name: "生成提交信息",
        description: "根据更改生成提交信息",
        prompt: "请根据以下代码更改生成一个清晰、规范的Git提交信息：",
        icon: "checkmark",
        color: "#2979ff",
      },
      {
        id: "pr_description",
        name: "生成PR描述",
        description: "生成Pull Request描述",
        prompt: "请根据以下更改生成一个详细的Pull Request描述，包括更改摘要、测试计划和影响范围：",
        icon: "share",
        color: "#19be6b",
      },
    ],
  },
  {
    name: "其他",
    commands: [
      {
        id: "translate",
        name: "翻译",
        description: "翻译文本到其他语言",
        prompt: "请将以下内容翻译成",
        icon: "globe",
        color: "#00bcd4",
      },
      {
        id: "summarize",
        name: "总结",
        description: "总结长文本的要点",
        prompt: "请总结以下内容的关键要点：",
        icon: "list",
        color: "#9c27b0",
      },
      {
        id: "brainstorm",
        name: "头脑风暴",
        description: "生成创意和想法",
        prompt: "请针对以下主题进行头脑风暴，提供创意想法和建议：",
        icon: "bulb",
        color: "#ff9900",
      },
    ],
  },
]

const filteredCategories = computed(() => {
  if (!searchKeyword.value) return categories

  return categories
    .map((category) => ({
      ...category,
      commands: category.commands.filter(
        (cmd) =>
          cmd.name.toLowerCase().includes(searchKeyword.value.toLowerCase()) ||
          cmd.description.toLowerCase().includes(searchKeyword.value.toLowerCase())
      ),
    }))
    .filter((category) => category.commands.length > 0)
})

function selectCommand(cmd: Command) {
  emit("select", cmd)
  showMenu.value = false
}
</script>

<style scoped lang="scss">
.expert-menu {
  display: inline-block;
}

.menu-trigger {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 12rpx 24rpx;
  background-color: #fff7e6;
  border-radius: 12rpx;
  cursor: pointer;
  transition: background-color 0.2s;

  &:active {
    background-color: #ffe7ba;
  }
}

.trigger-text {
  font-size: 28rpx;
  font-weight: 500;
  color: #ff9900;
}

.menu-content {
  padding: 40rpx 30rpx;
  background-color: #ffffff;
  border-radius: 20rpx 20rpx 0 0;
  max-height: 80vh;
  overflow-y: auto;
}

.menu-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 30rpx;
}

.menu-title {
  font-size: 36rpx;
  font-weight: 600;
  color: #303133;
}

.search-bar {
  margin-bottom: 30rpx;
}

.command-categories {
  display: flex;
  flex-direction: column;
  gap: 40rpx;
}

.category-section {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.category-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #606266;
  padding-left: 12rpx;
  border-left: 6rpx solid #2979ff;
}

.command-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.command-item {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 24rpx;
  background-color: #f8f8f8;
  border-radius: 16rpx;
  transition: all 0.2s;

  &:active {
    transform: scale(0.98);
    background-color: #e4e7ed;
  }
}

.command-icon {
  width: 72rpx;
  height: 72rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12rpx;
  flex-shrink: 0;
}

.command-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.command-name {
  font-size: 30rpx;
  font-weight: 500;
  color: #303133;
}

.command-desc {
  font-size: 24rpx;
  color: #909399;
  line-height: 1.4;
}
</style>
