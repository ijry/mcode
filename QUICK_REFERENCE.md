# 快速参考 (Quick Reference)

## 🎯 一句话总结

| 功能 | 文件 | 行号 | 关键代码 |
|------|------|------|---------|
| **会话详情页面** | conversation-detail-panel.tsx | 1031-1472 | ConversationDetailPanel() |
| **Plus按钮** | message-input.tsx | 2410-2418 | `<Plus className="size-4" />` |
| **Plus弹窗菜单** | message-input.tsx | 2420-2610 | `<DropdownMenuContent>` |
| **智能体选择** | agent-selector.tsx | 28-180 | AgentSelector() |
| **模型提供者管理** | model-provider-settings.tsx | 38-200+ | ModelProviderSettings() |
| **模型提供者选择** | acp-agent-settings.tsx | 5838-5873 | `<Select>` 组件 |
| **获取提供者列表** | acp-agent-settings.tsx | ~4000-4010 | `listModelProviders()` |
| **过滤列表逻辑** | acp-agent-settings.tsx | ~4015-4025 | `.filter(p => p.agent_type === ...)` |
| **处理选择** | acp-agent-settings.tsx | ~4080-4110 | `handleModelProviderSelect()` |
| **自动选择首项** | acp-agent-settings.tsx | ~4115-4125 | `useEffect` 回调 |

---

## 🔍 文件导航速查

### 前端组件 (Frontend Components)

```
codeg-main/src/components/
├── conversations/
│   └── conversation-detail-panel.tsx (会话详情页 ⭐)
├── chat/
│   ├── message-input.tsx (Plus弹窗 ⭐)
│   └── agent-selector.tsx (智能体选择)
└── settings/
    ├── acp-agent-settings.tsx (模型提供者选择 ⭐⭐⭐)
    └── model-provider-settings.tsx (模型提供者管理)
```

### Hooks
```
codeg-main/src/hooks/
└── use-conversation-detail.ts (会话详情数据)
```

### 数据类型
```
codeg-main/src/lib/
└── types.ts (ModelProviderInfo, AgentType 等)
```

### API客户端
```
codeg-main/src/lib/
└── api.ts (listModelProviders 等)
```

---

## 🚀 关键代码片段速查

### 1️⃣ 获取模型提供者列表
```typescript
import { listModelProviders } from "@/lib/api"

const modelProviders = await listModelProviders()
// 返回 ModelProviderInfo[]
```

### 2️⃣ 按 agent_type 过滤
```typescript
const selectedModelProviders = modelProviders.filter(
  p => p.agent_type === selectedAgent.agent_type
)
```

### 3️⃣ 显示 Select 组件
```tsx
<Select
  value={selectedDraft.modelProviderId?.toString() ?? ""}
  onValueChange={handleModelProviderSelect}
>
  <SelectTrigger>
    <SelectValue placeholder={t("selectModelProvider")} />
  </SelectTrigger>
  <SelectContent>
    {selectedModelProviders.map(provider => (
      <SelectItem key={provider.id} value={String(provider.id)}>
        {provider.name}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

### 4️⃣ 处理选择事件
```typescript
const handleModelProviderSelect = useCallback(
  (providerId: string) => {
    updateSelectedDraft(current => ({
      ...current,
      modelProviderId: Number(providerId),
    }))
  },
  [updateSelectedDraft]
)
```

### 5️⃣ 认证模式定义
```typescript
// Claude
const CLAUDE_AUTH_MODES = ["official_subscription", "custom", "model_provider"]

// Gemini
const GEMINI_AUTH_MODES = [..., "model_provider"]

// Codex
const CODEX_AUTH_MODES = ["api_key", "model_provider"]
```

---

## 🔗 数据结构速查

### ModelProviderInfo
```typescript
{
  id: number              // 唯一ID
  name: string            // 提供者名称
  agent_type: AgentType   // 关联的AI类型
  api_url: string         // API端点
  api_key?: string        // API密钥
  model?: string          // 模型名称
  created_at: string      // 创建时间
  updated_at: string      // 更新时间
}
```

### AgentType
```typescript
type AgentType = 
  | "claude"      // Claude
  | "gemini"      // Gemini
  | "codex"       // OpenAI Codex
  | "cline"       // Cline
  | "opencode"    // OpenCode
  | "openclaw"    // OpenClaw
```

### AgentDraft (关键字段)
```typescript
{
  modelProviderId: number | null  // ⭐ 模型提供者ID
  claudeAuthMode: "official_subscription" | "custom" | "model_provider"
  // ... 其他字段
}
```

---

## 📡 API端点速查

```
GET  /api/model-providers           列出所有模型提供者
POST /api/model-providers           创建新提供者
PUT  /api/model-providers/:id       更新提供者
DELETE /api/model-providers/:id     删除提供者

PUT  /api/agents/:agent_type/config 更新智能体配置
```

---

## 🔑 关键变量命名

```typescript
modelProviders              // 所有模型提供者
selectedModelProviders      // 过滤后的列表
selectedDraft.modelProviderId  // 选中的ID
agent_type                  // 智能体类型 (用于过滤)
claudeAuthMode / geminiAuthMode / codexAuthMode  // 认证模式
```

---

## ⚡ 快速搜索技巧

### 在代码中搜索：
```bash
# 查找所有模型提供者相关代码
grep -r "modelProviderId" codeg-main/src/

# 查找认证模式定义
grep -r "AUTH_MODES" codeg-main/src/

# 查找列表过滤逻辑
grep -r "filter.*agent_type" codeg-main/src/

# 查找Plus按钮
grep -n "Plus className" codeg-main/src/components/chat/message-input.tsx
```

---

## 🎯 核心逻辑流

```
1. 用户进入Settings > Agents → 加载 listModelProviders()
2. 选择AI类型 (Claude/Gemini/Codex) → 设置 selectedAgent
3. 选择认证模式 "model_provider" → 触发UI显示
4. 前端过滤: selectedModelProviders = modelProviders.filter(...)
5. 用户选择提供者 → 调用 handleModelProviderSelect()
6. 更新 selectedDraft.modelProviderId
7. 保存配置 → acpUpdateAgentConfig()
```

---

## ⚠️ 常见陷阱

1. **忘记过滤**: 显示所有提供者而不是按 agent_type 过滤
2. **类型转换**: ID 需要转换为 string 用于 Select 组件
3. **初始值**: 空选择时不能传 undefined，应该传空字符串 ""
4. **自动选择**: useEffect 依赖项必须包含 selectedNeedsModelProvider
5. **保存时机**: 需要等待 listModelProviders() 完成后才能获取完整列表

