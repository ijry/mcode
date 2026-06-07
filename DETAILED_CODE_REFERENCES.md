# 详细代码参考 (Detailed Code References)

## 📂 会话详情页面 (Conversation Detail Panel)

### 1. 主组件位置
**文件**: `codeg-main/src/components/conversations/conversation-detail-panel.tsx`

#### 关键行号范围：
- **1031-1472**: `ConversationDetailPanel()` 主函数
  - 1161-1169: 活跃会话标签获取
  - 1169-1176: handleReloadActiveConversation 重新加载逻辑
  - 1252-1265: getExportData 导出数据获取
  - 1268-1313: 导出函数 (Markdown/HTML/Image)
  - 1346-1392: 标签元素映射渲染
  - 1394-1471: 右键菜单内容定义

---

## 📂 消息输入和Plus弹窗 (Message Input & Plus Button)

### 2. Plus按钮弹窗代码

**文件**: `codeg-main/src/components/chat/message-input.tsx`

#### Plus按钮位置：
- **2410-2418**: Plus按钮定义
- **2420-2610**: 弹窗菜单内容

主要菜单项：
1. 附加文件 (Paperclip) - 2425-2461
2. 快速消息 (QuickMessages) 子菜单 - 2462-2500
3. 专家技能 (Expert Skills) 子菜单 - 2501-2550
4. 命令菜单 (Commands) - 后续部分

---

## 📂 模型选择和授权 (Model Selection & Authorization)

### 3. 智能体选择器 (Agent Selector)

**文件**: `codeg-main/src/components/chat/agent-selector.tsx`
- **28-180**: AgentSelector 组件定义
- **50-57**: 选择优先级逻辑
- **134-148**: 智能体变更通知回调

---

### 4. 模型提供者设置 (Model Provider Settings)

**文件**: `codeg-main/src/components/settings/model-provider-settings.tsx`
- **38-95**: 主组件初始化
- **49-62**: 加载提供者列表函数
- **64-67**: 过滤逻辑 (按 agent_type)
- **125-132**: Plus按钮UI
- **145-186**: 提供者列表渲染

---

### 5. ACP智能体设置 - 最关键部分

**文件**: `codeg-main/src/components/settings/acp-agent-settings.tsx`

#### 关键数据结构 (109-147)：
```typescript
interface AgentDraft {
  modelProviderId: number | null  // 关键字段
  claudeAuthMode: ClaudeAuthMode
  // ... 其他字段
}
```

#### 认证模式定义：
- **102-107**: CLAUDE_AUTH_MODES (包括 "model_provider")
- **289-299**: GEMINI_AUTH_MODES (包括 "model_provider")
- **Codex**: 类似结构

#### 关键逻辑：
1. **获取模型列表** (~4000-4010)
   - 调用 listModelProviders() API
   
2. **过滤列表** (~4015-4025)
   - filter(p => p.agent_type === selectedAgent.agent_type)
   
3. **处理选择** (~4080-4110)
   - handleModelProviderSelect() 更新 modelProviderId
   
4. **自动选择** (~4115-4125)
   - useEffect 自动选择列表第一项
   
5. **UI渲染** (~5838-5873)
   - Select 组件显示过滤后的列表

---

## 🔗 完整数据流

```
用户打开Settings > Agents
    ↓
加载模型提供者列表 (listModelProviders API)
    ↓
选择特定智能体 (Claude/Gemini/Codex)
    ↓
选择认证模式为 "model_provider"
    ↓
前端按 agent_type 过滤列表
    ↓
用户在 Select 中选择提供者
    ↓
更新 modelProviderId 和配置字段
    ↓
保存配置 (acpUpdateAgentConfig)
```

---

## 🎯 关键字段和函数

### 字段：
- `modelProviderId` - 选中的模型提供者ID
- `agent_type` - 智能体类型 (用于过滤)
- `selectedModelProviders` - 过滤后的提供者列表

### 函数：
- `listModelProviders()` - 获取所有提供者
- `handleModelProviderSelect()` - 处理选择
- `acpUpdateAgentConfig()` - 保存配置

### API：
- GET `/api/model-providers` - 列出模型提供者
- PUT `/api/agents/:agent_type/config` - 更新配置

