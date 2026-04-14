# Codex History Manager

本项目是一个零依赖的本地网页工具，用来管理当前 Windows 用户目录下的 Codex 会话历史：

- 列出会话概要：来源、会话 ID、更新时间、标题
- 查看会话详情：摘要时间线 + 原始 JSONL 事件
- 重命名会话
- 多选永久删除会话，并同步清理 `session_index.jsonl` 与 `history.jsonl`
- 管理多个 Codex 接口方案
- 查看当前正在生效的本地 Codex 配置
- 一键切换已保存方案并写回 `config.toml` 与 `auth.json`

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

- 会话管理：`/`
- 方案管理：`/profiles.html`

## 停止旧的

- 查看占用 netstat -ano | Select-String ':4173'
- 强制停止 Stop-Process -Id <PID> -Force

## 数据源

默认读取：

```text
C:\Users\<当前用户>\.codex
```

主要使用：

- `session_index.jsonl`
- `history.jsonl`
- `sessions\**\*.jsonl`
- `archived_sessions\*.jsonl`
- `codex-history-manager.profiles.json`

方案文件说明：

- 位置：`C:\Users\<当前用户>\.codex\codex-history-manager.profiles.json`
- 用途：保存工具自己的多方案配置，不覆盖官方结构
- 每个方案包含：`name`、`provider`、`baseUrl`、`apiKey`
- 切换方案时会实际改写：
  - `config.toml` 中的 `model_provider`
  - `config.toml` 中目标 provider 的 `base_url`
  - `auth.json` 中的 `OPENAI_API_KEY`

## 注意

- 删除是永久删除，不会移入回收站。
- 如果某条索引记录存在但详情文件缺失，页面会把它显示成孤儿会话。
- 删除方案只会删除保存记录，不会自动回滚当前已生效的 Codex 配置。
- 后端和前端都不依赖第三方 npm 包，适合当前无网络环境直接运行。
## Tool Config

- Root config file: `D:\soft\CodexHistoryManager\codex-history-manager.config.json`
- Current supported field: `terminalPath`
- Purpose: manually control which terminal executable is used by the "switch to current session" action

Example:

```json
{
  "terminalPath": "C:\\Users\\<current-user>\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe"
}
```
