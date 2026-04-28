# 通讯稿智能体

基于大语言模型的智能通讯稿生成工具。支持多模型接入、自定义写作主题、文件上传、URL 抓取等能力，通过流式输出实时生成高质量通讯稿。

---

## 主要功能

### 1. 智能通讯稿生成
- 输入写作要求，AI 实时流式生成通讯稿内容
- 支持指定字数（200字 / 500字 / 自定义）
- 生成内容支持一键复制

### 2. 多模型管理
- **公共模型**：内置 DeepSeek、Kimi、MiniMax 预设，填写 API Key 即可使用
- **本地模型**：支持任意 OpenAI 兼容接口的本地/私有模型（如 Ollama、vLLM）
- **连接验证**：添加模型前可验证连接是否通畅
- **安全存储**：API Key 采用 Base64 编码存储，前端列表不暴露明文

### 3. 主题管理
- **内置主题**：繁星计划、专题培训，附带参考范文
- **自定义主题**：支持通过以下三种方式添加：
  - **URL 抓取**：输入网页链接，自动抓取并调用大模型清洗正文内容
  - **文件上传**：支持 txt、doc、docx、pdf、md 格式
  - **直接输入**：手动粘贴参考文本
- 主题支持编辑、删除、临时引用

### 4. 文件上传
- 上传参考资料（txt/doc/docx/pdf/md），AI 自动提取内容作为写作素材

### 5. 千问模型优化
- 自动检测 Qwen 3.5 / QwQ 模型，禁用 thinking 输出
- 对 Qwen 3 系列追加 `/no_thinking` 指令

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Python 3.10 + Flask |
| 前端 | 原生 HTML/CSS/JavaScript |
| LLM 接口 | OpenAI 兼容 API |
| 部署 | Docker + nginx 反向代理 |

---

## 快速开始

### 本地运行

```bash
# 1. 安装依赖
pip install -r requirements.txt

# 2. 启动服务
python app.py

# 3. 浏览器访问 http://localhost:5002
```

### Docker 部署

```bash
# 构建镜像
docker build -t press-release .

# 运行容器
docker run -d -p 5002:5002 --name press-release press-release
```

### Docker Compose

```bash
docker-compose up -d
```

---

## 项目结构

```
.
├── app.py                 # Flask 后端主程序
├── config.json            # 模型/主题配置文件（自动创建）
├── requirements.txt       # Python 依赖
├── Dockerfile             # Docker 构建文件
├── docker-compose.yml     # Docker Compose 配置
├── static/
│   ├── css/style.css      # 前端样式
│   └── js/app.js          # 前端交互逻辑
├── templates/
│   └── index.html         # 主页面
└── docs/                  # 文档
```

---

## API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/models` | GET/POST | 模型列表 / 添加模型 |
| `/api/models/<id>` | PUT/DELETE | 更新 / 删除模型 |
| `/api/models/<id>/apikey` | GET | 获取解码后的 API Key |
| `/api/verify-model` | POST | 验证模型连接 |
| `/api/themes` | GET/POST | 主题列表 / 添加主题 |
| `/api/themes/<id>` | PUT/DELETE | 更新 / 删除主题 |
| `/api/upload` | POST | 文件上传解析 |
| `/api/fetch-url` | POST | URL 内容抓取与清洗 |
| `/api/generate` | POST | 通讯稿生成（SSE 流式） |

---

## 关联 Skill：model-management

本项目中的**模型管理模块**已被抽象为可复用的 CodeBuddy Skill，位于：

```
~/.codebuddycn/skills/model-management/
├── SKILL.md              # Skill 入口说明
└── references/
    └── spec.md           # 完整规范文档
```

### Skill 能力

`model-management` 是一个 **LLM 模型管理模块生成器**，当用户需要在 Web 应用中实现大模型管理功能时触发。

**覆盖范围：**
- 模型的增删改查（CRUD）
- API Key 安全存储（Base64 编码）
- 模型连接验证
- 公共模型预设（DeepSeek / Kimi / MiniMax）与本地模型区分
- 下拉菜单选择模型
- 模型编辑弹窗的**状态机交互**：修改 → 验证 → 保存

**状态机流程：**
```
打开弹窗 → 快照初始值 → 验证按钮灰掉, 保存按钮灰掉
    │
    ├─ 字段被修改 → 验证按钮启用, 保存按钮仍灰掉
    │       │
    │       ├─ 验证成功 → 保存按钮启用
    │       └─ 验证失败 → 保存按钮保持灰掉
    │
    ├─ 字段恢复原始值 → 验证按钮灰掉, 保存按钮灰掉
    │
    └─ 点击保存 → PUT 更新 → 关闭弹窗
```

**技术栈适配：** Flask / FastAPI 后端 + 原生 HTML/CSS/JS 前端

### 如何使用该 Skill

将 `~/.codebuddycn/skills/model-management/` 目录复制到目标项目的 `.codebuddycn/skills/` 下，编程智能体即可根据 `SKILL.md` 和 `references/spec.md` 中的规范，完整复现模型管理的后端 API、前端界面及交互逻辑。

---

## 配置说明

`config.json` 示例：

```json
{
  "models": [
    {
      "id": "a2a5aff4",
      "name": "My DeepSeek",
      "type": "public",
      "model": "deepseek-chat",
      "url": "https://api.deepseek.com/v1",
      "api_key": "c2st...",
      "preset": "deepseek"
    }
  ],
  "themes": [
    {
      "id": "9cc559b2",
      "name": "能力提升系列",
      "content": "..."
    }
  ]
}
```

---

## 许可证

MIT
