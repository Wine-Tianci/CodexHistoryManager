# CodexManager

CodexManager 是一个零依赖的本地网页工具，用来管理当前 Windows 用户目录下的 Codex 本地数据。项目包含两个独立但互相关联的页面：

- `Codex History Manager`：管理 Codex 会话历史。
- `Codex Profile Manager`：管理 Codex 接口方案和当前生效配置。

## 启动

在项目根目录执行：

```powershell
node .\server.js
```

Windows 也可以直接双击根目录脚本：

```bat
start-server.bat
```

默认监听：

```text
http://localhost:4173
```

页面入口：

- `Codex History Manager`：`http://localhost:4173/`
- `Codex Profile Manager`：`http://localhost:4173/profiles.html`

## Codex History Manager

会话管理页面用于浏览、检查、重命名、恢复和删除本机 Codex 会话。

入口：

```text
/
```

主要功能：

- 列出会话概要，包括来源、会话 ID、更新时间、token 用量和标题。
- 查看会话详情，包括摘要时间线、会话元信息和原始记录整理后的内容。
- 重命名会话标题，并同步写回 `session_index.jsonl`。
- 多选永久删除会话文件，并同步清理 `session_index.jsonl` 与 `history.jsonl`。
- 从会话详情中启动 `codex resume <session_id>`，快速切换到当前会话。
- 在页面右上角通过 `方案管理` 进入 `Codex Profile Manager`。

使用的数据：

- `C:\Users\<当前用户>\.codex\session_index.jsonl`
- `C:\Users\<当前用户>\.codex\history.jsonl`
- `C:\Users\<当前用户>\.codex\sessions\**\*.jsonl`
- `C:\Users\<当前用户>\.codex\archived_sessions\*.jsonl`

会话相关注意事项：

- 删除是永久删除，不会移入回收站。
- 如果某条索引记录存在但详情文件缺失，页面会把它显示成孤儿会话。
- 启动会话恢复功能时，后端会调用 Windows Terminal 或配置的终端路径打开新会话。

## Codex Profile Manager

方案管理页面用于保存多个 Codex 接口方案，查看当前生效配置，并一键切换到指定方案。

入口：

```text
/profiles.html
```

主要功能：

- 查看当前本机 Codex 配置，包括 provider、base URL、API key、model 和 reasoning effort。
- 新增、编辑、删除已保存的接口方案。
- 将某个方案切换为当前生效方案。
- 支持为方案保存可选默认模型设置。
- 在页面右上角通过 `会话管理` 返回 `Codex History Manager`。

方案文件：

```text
C:\Users\<当前用户>\.codex\codex-manager.profiles.json
```

方案文件只保存本工具自己的多方案配置，不覆盖 Codex 官方结构。每个方案包含：

- `name`
- `provider`
- `baseUrl`
- `apiKey`
- `model`
- `modelReasoningEffort`

切换方案时会实际改写：

- `config.toml` 顶层的 `model_provider`
- `config.toml` 顶层的 `model`
- `config.toml` 顶层的 `model_reasoning_effort`
- `config.toml` 中目标 provider 的 `base_url`
- `auth.json` 中的 `OPENAI_API_KEY`

如果某个方案的 `model` 或 `modelReasoningEffort` 留空，切换方案时会保留当前 `config.toml` 中对应设置的原值。例如，可以把某个方案的 `model` 设置为 `gpt-5.5`，把 `modelReasoningEffort` 设置为 `high`，这样切换到该方案时也会把 Codex 切换为：

```toml
model = "gpt-5.5"
model_reasoning_effort = "high"
```

方案相关注意事项：

- 删除方案只会删除保存记录，不会自动回滚当前已经生效的 Codex 配置。
- API key 会写入 `auth.json` 的 `OPENAI_API_KEY` 字段。
- `codex-manager.profiles.json` 是本工具自己的数据文件，和 Codex 官方配置文件分开保存。

## 配置文件

CodexManager 自己的根配置文件：

```text
D:\soft\CodexManager\codex-manager.config.json
```

当前支持字段：

- `terminalPath`：手动指定“切换到当前会话”动作使用的终端程序。

示例：

```json
{
  "terminalPath": "C:\\Users\\<current-user>\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe"
}
```

如果 `codex-manager.config.json` 不存在，工具会使用内置默认值。为了兼容旧版本，程序仍会尝试读取旧文件名 `codex-history-manager.config.json`。

## 数据目录

默认读取当前 Windows 用户目录下的 Codex 数据：

```text
C:\Users\<当前用户>\.codex
```

主要涉及文件：

- `config.toml`
- `auth.json`
- `session_index.jsonl`
- `history.jsonl`
- `sessions\**\*.jsonl`
- `archived_sessions\*.jsonl`
- `codex-manager.profiles.json`

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
- 默认端口是 `4173`，也可以通过环境变量 `PORT` 覆盖。
- 默认 Codex 数据目录是当前用户的 `.codex`，也可以通过环境变量 `CODEX_ROOT` 覆盖。
