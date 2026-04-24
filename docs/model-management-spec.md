# 模型管理模块规范（Model Management Module Specification）

> 将本文档提供给编程智能体，即可完整复现模型管理功能及界面。

---

## 1. 数据模型

### 1.1 存储位置
`config.json` 中的 `models` 数组。

### 1.2 模型数据结构

```json
{
  "id": "a1b2c3d4",          // 8位UUID，唯一标识
  "name": "我的DeepSeek",    // 用户自定义的显示名称
  "type": "public",          // "public" | "local"
  "model": "deepseek-chat",  // 调用API时使用的model名
  "url": "https://api.deepseek.com/v1",  // API base URL
  "api_key": "YXNkZm...=",  // Base64编码后的API Key（原文明文不可存储）
  "preset": "deepseek",      // 公共模型的预设标识，本地模型为空字符串
}
```

### 1.3 公共模型预设

```json
{
  "deepseek": { "model": "deepseek-chat", "url": "https://api.deepseek.com/v1" },
  "kimi":     { "model": "moonshot-v1-8k", "url": "https://api.moonshot.cn/v1" },
  "minimax":  { "model": "MiniMax-Text-01", "url": "https://api.minimax.chat/v1" }
}
```

### 1.4 API Key 编码规则
- **存储时**：`base64(utf8(api_key))` → 存入 `api_key` 字段
- **使用时**：`utf8_decode(base64_decode(api_key))` → 还原为明文
- **GET 接口不返回**原始 API Key，仅返回 `has_api_key: bool` 标识
- **编辑时**：通过专用 `/api/models/<id>/apikey` 接口获取解码后的 Key

---

## 2. API 接口

### 2.1 获取模型列表
```
GET /api/models
Response: [
  { "id", "name", "model", "url", "type", "preset", "has_api_key" }
]
```
注意：不返回 `api_key` 字段，用 `has_api_key` 替代。

### 2.2 添加模型
```
POST /api/models
Body (公共): { "type":"public", "name":"...", "preset":"deepseek", "api_key":"明文key" }
Body (本地): { "type":"local", "name":"...", "model_id":"qwen35-35b", "base_url":"http://...", "api_key":"明文key或空" }
Response: { "success":true, "model": { "id", "name", "model", "url", "type", "preset", "has_api_key" } }
```
后端逻辑：公共模型根据 preset 填充 model/url；本地模型直接使用传入的 model_id/base_url；api_key 一律 Base64 编码后存储。

### 2.3 更新模型
```
PUT /api/models/<id>
Body: { "name":"...", "type":"public"|"local", ...同添加的字段 }
Response: { "success":true, "model": {...} }
```
- 公共模型：preset 变更时更新 model/url；api_key 非空时更新，空则保持不变
- 本地模型：model_id/base_url 非空时更新；api_key 传入则更新

### 2.4 删除模型
```
DELETE /api/models/<id>
Response: { "success":true }
```

### 2.5 获取模型 API Key（编辑专用）
```
GET /api/models/<id>/apikey
Response: { "api_key": "解码后的明文key" }
```

### 2.6 验证模型连接
```
POST /api/verify-model
Body (公共): { "type":"public", "name":"...", "preset":"deepseek", "api_key":"明文" }
Body (本地): { "type":"local", "name":"...", "model_id":"...", "base_url":"...", "api_key":"明文或空" }
Response: { "success":true } | { "success":false, "error":"错误描述" }
```
后端逻辑：使用 OpenAI 兼容接口发送一条 `messages=[{role:user, content:"Hi"}], max_tokens=5` 请求。若返回 auth/model not found 类错误则报告具体原因，其他错误视为连接成功（模型可能不支持短回复但连接正常）。

---

## 3. 前端界面

### 3.1 主页面 - 模型选择下拉菜单

位于输入框底部工具栏左侧第一个位置。

```
<select id="modelSelect">
  <option value="" disabled selected>选择模型</option>
  <!-- 动态：每个已添加模型 -->
  <option value="{model.id}">{model.name}</option>
  <!-- 最后一项固定 -->
  <option value="__manage__">⚙ 管理模型</option>
</select>
```

- 选择模型 → 记录 `currentModelId`
- 选择"⚙ 管理模型" → 打开管理弹窗，select 回退到之前选中的模型

### 3.2 管理模型弹窗（manageModelModal）

```
┌─────────────────────────────────────────┐
│  管理模型                                │
│                                         │
│  ┌─ 已添加模型列表 ────────────────────┐ │
│  │ [模型名] [类型/Model详情] [编辑][删除]│ │
│  │ [模型名] [类型/Model详情] [编辑][删除]│ │
│  └─────────────────────────────────────┘ │
│  ───────────── 分隔线 ─────────────────  │
│  添加模型                                │
│  [公共模型] [本地模型]  ← 选项卡切换      │
│                                         │
│  --- 公共模型表单 ---                     │
│  模型名称（用户自定义）: [________]       │
│  选择公共模型: [DeepSeek ▾]              │
│  API Key: [••••••••]                    │
│                                         │
│  --- 本地模型表单 ---                     │
│  模型名称（用户自定义）: [________]       │
│  Model ID: [________]                   │
│  Base URL: [________]                   │
│  API Key（可选）: [••••••••]             │
│                                         │
│  [验证连接]  ✓ 连接成功                  │
│                                         │
│              [返回]  [保存]（验证后启用）   │
└─────────────────────────────────────────┘
```

**添加流程**：
1. 切换公共/本地选项卡，填写表单
2. 点击"验证连接" → 调用 `/api/verify-model`
3. 验证成功 → 显示"✓ 连接成功"，启用"保存"按钮
4. 点击"保存" → 调用 `POST /api/models`，刷新列表

**列表操作**：
- 编辑：调用 `openEditModel(id)` → 打开编辑弹窗
- 删除：确认后调用 `DELETE /api/models/<id>`

### 3.3 编辑模型弹窗（editModelModal）

```
┌─────────────────────────────────────────┐
│  编辑模型                                │
│                                         │
│  模型名称: [________]                    │
│  --- 公共模型字段（type=public时显示）---  │
│  公共模型类型: [DeepSeek ▾]              │
│  API Key: [••••••••]（预填原值）         │
│  --- 本地模型字段（type=local时显示）---   │
│  Model ID: [________]                   │
│  Base URL: [________]                   │
│  API Key: [••••••••]（预填原值）         │
│                                         │
│  [验证连接]（修改后启用） [验证状态]       │
│                                         │
│           [取消]  [保存]（验证后启用）     │
└─────────────────────────────────────────┘
```

**编辑流程状态机**：

```
打开弹窗 → 记录所有字段初始值（从 /api/models/<id>/apikey 获取API Key预填）
         → 验证按钮=灰，保存按钮=灰

用户修改任意字段 → 检测是否有变化
  ├─ 有变化 → 验证按钮=启用，保存按钮=灰
  └─ 无变化 → 验证按钮=灰，保存按钮=灰

用户点击"验证连接" → 调用 /api/verify-model
  ├─ 成功 → 保存按钮=启用
  └─ 失败 → 保存按钮=灰

用户再次修改字段 → 保存按钮=灰（需重新验证）

用户点击"保存" → 调用 PUT /api/models/<id> → 成功则关闭弹窗并刷新列表

用户点击"取消" → 直接关闭弹窗
```

**变化检测逻辑**：打开弹窗时快照所有字段的当前值存入 `editModelInitialValues` 对象。每次字段 input/change 事件时，将当前值与快照逐一比对。公共模型比对 name/preset/apiKey；本地模型比对 name/modelId/baseUrl/apiKey。

---

## 4. 千问（Qwen）系列 Thinking 控制

调用 LLM 时需根据模型名自动处理 thinking 开关：

### 4.1 千问3.5系列（含 QwQ）
**检测关键字**：model 名称中包含 `qwen3.5`、`qwen35`、`qwq-`（不区分大小写）

**处理方式**：在 `chat.completions.create()` 中添加 `extra_body`：
```python
extra_body = {
    "chat_template_kwargs": {
        "enable_thinking": False,
        "thinking": False
    }
}
# 传入方式
client.chat.completions.create(
    ...,
    extra_body=extra_body
)
```

### 4.2 千问3系列（非3.5）
**检测关键字**：model 名称中包含 `qwen3` 或 `qwen-3`，且不匹配3.5

**处理方式**：在用户提示词末尾追加 ` /no_thinking`
```python
user_prompt = prompt + ' /no_thinking'
```

---

## 5. 样式规范

- 弹窗使用 `.modal-overlay`（全屏遮罩 + 居中）+ `.modal`（卡片样式）
- 模型列表使用 `.manage-list`（max-height:200px, overflow-y:auto）
- 列表项使用 `.manage-item`（flex 布局，左信息右按钮）
- 验证按钮使用 `.btn-verify`（绿色调），验证状态使用 `.verify-status`（.success/.error）
- 选项卡使用 `.model-type-tab`（底部边框高亮当前项）
- 所有弹窗按钮统一：`.btn-secondary`（取消/返回）、`.btn-primary`（保存/确认）、disabled 时 `opacity:0.5; cursor:not-allowed`
