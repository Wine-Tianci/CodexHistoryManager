# AI Agent Deck

AI Agent Deck 是一个零依赖的本地网页工具，用来管理当前 Windows 用户目录下的 Codex 与 Claude Code 本地数据。

工具现在只有两个主要页面：

- `历史管理`：在同一个页面查看 Codex 与 Claude 会话历史，通过页面内的 `AI 类型` 下拉框切换。
- `方案管理`：在同一个页面管理 Codex 与 Claude 接口方案，通过页面内的 `AI 类型` 下拉框切换。

后端 API 仍然保持分离：Codex 使用 `/api/...`，Claude 使用 `/api/claude/...`。这样可以统一前端体验，同时降低后端迁移风险。
两个页面会分别记住上一次选择的 `AI 类型`：历史管理和方案管理互不影响，刷新页面或来回跳转后会恢复各自最近一次的选择。

## 启动

在项目根目录执行：

```powershell
node .\server.js
```

Windows 也可以直接双击根目录脚本：

```bat
start-server.bat
```

默认优先监听：

```text
http://localhost:4173
```

如果 `4173` 已被占用，服务会自动尝试后续端口，并在命令行打印实际 URL。

页面入口：

- 历史管理：`http://localhost:4173/`
- 方案管理：`http://localhost:4173/profiles.html`

旧入口 `claude.html` 与 `claude-profiles.html` 会跳转到统一页面，作为兼容入口保留。

## 历史管理

历史管理页用于浏览、检查和删除本机历史会话。

主要功能：

- 通过 `AI 类型` 在 `Codex` 与 `Claude` 之间切换。
- Codex 模式读取 `/api/sessions`，Claude 模式读取 `/api/claude/sessions`。
- 搜索会话标题、会话 ID、项目或模型信息。
- 每一行都会显示清晰的 `Codex` 或 `Claude` 标签。
- 切换 AI 类型时会清空当前选中项和详情，避免跨类型误操作。
- 历史管理会在浏览器本地记住上一次选择的 AI 类型，使用 `localStorage` key `ai-agent-deck.history.aiType`。
- Codex 模式保留重命名和 `codex resume <session_id>` 切换会话能力。
- Claude 模式提供查看、删除和 `claude --resume <session_id>` 切换会话能力。

Codex 会话涉及的数据：

```text
C:\Users\<当前用户>\.codex\session_index.jsonl
C:\Users\<当前用户>\.codex\history.jsonl
C:\Users\<当前用户>\.codex\sessions\**\*.jsonl
C:\Users\<当前用户>\.codex\archived_sessions\*.jsonl
```

Claude 会话涉及的数据：

```text
C:\Users\<当前用户>\.claude\history.jsonl
C:\Users\<当前用户>\.claude\projects\**\*.jsonl
```

## 方案管理

方案管理页用于保存多个接口方案，查看当前生效配置，并一键切换到指定方案。

主要功能：

- 通过 `AI 类型` 在 `Codex` 与 `Claude` 之间切换。
- Codex 模式使用 `/api/profiles`。
- Claude 模式使用 `/api/claude/profiles`。
- 方案卡片和当前配置摘要会隐藏密钥中间部分。
- 切换 AI 类型时会重新加载对应类型的方案列表、当前配置和表单字段。
- 方案管理会在浏览器本地记住上一次选择的 AI 类型，使用 `localStorage` key `ai-agent-deck.profiles.aiType`。

### Codex 方案字段

Codex 方案保存这些字段：

- `name`
- `provider`
- `baseUrl`
- `apiKey`
- `model`
- `modelReasoningEffort`

Codex 方案文件：

```text
C:\Users\<当前用户>\.codex\ai-agent-deck.profiles.json
```

切换 Codex 方案时会改写：

- `config.toml` 顶层 `model_provider`
- `config.toml` 顶层 `model`
- `config.toml` 顶层 `model_reasoning_effort`
- `config.toml` 中目标 provider 的 `base_url`
- `auth.json` 中的 `OPENAI_API_KEY`

如果某个方案的 `model` 或 `modelReasoningEffort` 留空，切换方案时会保留当前 `config.toml` 中对应设置的原值。

### Claude 方案字段

Claude 方案保存业务字段，而不是直接暴露原始环境变量编辑器：

- `name`
- `baseUrl`
- `apiKey`
- `defaultModel`

Claude 方案文件：

```text
C:\Users\<当前用户>\.claude\ai-agent-deck.profiles.json
```

切换 Claude 方案时会改写 `.claude\settings.json` 中这些受管理字段：

- `baseUrl` -> `env.ANTHROPIC_BEDROCK_BASE_URL`
- `apiKey` -> `env.ANTHROPIC_AUTH_TOKEN`
- `defaultModel` -> `env.ANTHROPIC_MODEL`

同时会根据 `defaultModel` 自动同步顶层 `model` 短别名：

- 包含 `haiku` 时写入 `haiku`
- 包含 `sonnet` 时写入 `sonnet`
- 包含 `opus` 时写入 `opus`
- 否则保留已有顶层 `model`，没有已有值时使用完整模型字符串

Claude 方案激活会保留 `.claude\settings.json` 中不属于本工具管理的其他顶层字段和其他 `env` 字段，例如 hooks、permissions、plugins、`AWS_REGION` 等。

## 配置文件

AI Agent Deck 自己的根配置文件：

```text
D:\soft\AIAgentDeck\ai-agent-deck.config.json
```

当前支持字段：

- `terminalPath`：手动指定“切换到当前会话”动作使用的终端程序。

示例：

```json
{
  "terminalPath": "C:\\Users\\<current-user>\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe"
}
```

如果 `ai-agent-deck.config.json` 不存在，工具会使用内置默认值。

## 环境变量

- `PORT`：覆盖默认端口。
- `CODEX_ROOT`：覆盖默认 Codex 数据目录。
- `CLAUDE_ROOT`：覆盖默认 Claude 数据目录。

默认目录：

```text
C:\Users\<当前用户>\.codex
C:\Users\<当前用户>\.claude
```

## 停止服务

查看端口占用：

```powershell
netstat -ano | Select-String ':4173'
```

强制停止指定进程：

```powershell
Stop-Process -Id <PID> -Force
```

## 运行说明

- 后端和前端都不依赖第三方 npm 包，适合无网络环境直接运行。
- 删除会话是永久删除，不会移入回收站。
- 删除方案只会删除保存记录，不会自动回滚当前已经生效的配置。
- Codex 和 Claude 的数据目录彼此独立，统一页面只改变前端入口和交互方式。
- 页面选择记忆只保存在当前浏览器的 `localStorage` 中，不会写入 Codex、Claude 或 AI Agent Deck 的后端配置文件。
