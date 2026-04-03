# iFlow API Bridge

将 iFlow（心流）CLI 的无限 LLM 服务暴露为 OpenAI 兼容的 API，使 Claude Code、OpenCode 等 Agent 可以直接使用。

## 特性

- 🚀 **OpenAI API 兼容**：支持 `OPENAI_BASE_URL` 环境变量配置
- 🔄 **流式输出**：完整的 SSE 流式响应支持
- 🔌 **零配置**：自动检测和启动 iFlow 进程
- 🌐 **CORS 支持**：开箱即用的跨域支持
- 🔐 **可选认证**：支持 API Key 认证
- 📦 **无状态**：不存储会话状态，每次请求独立处理

## 安装

```bash
npm install -g @iflow-ai/iflow-api-bridge
```

## 快速开始

### 1. 启动服务

```bash
# 使用默认配置（端口 8080）
iflow-api-server

# 自定义端口
iflow-api-server --port 3000

# 指定模型（用于API标识，需在iFlow中预先配置）
iflow-api-server --model claude

# 启用 API Key 认证
iflow-api-server --api-key sk-your-secret-key
```

### 2. 在其他 Agent 中配置

```bash
# 设置环境变量
export OPENAI_BASE_URL=http://localhost:8080/v1
export OPENAI_API_KEY=sk-anything  # 如果没有启用认证，可以填任意值

# 启动 Claude Code
claude

# 或使用 OpenCode
opencode
```

## API 端点

### 聊天完成

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-anything" \
  -d '{
    "model": "iflow-default",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'
```

### 流式响应

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-anything" \
  -d '{
    "model": "iflow-default",
    "messages": [{"role": "user", "content": "讲个故事"}],
    "stream": true
  }'
```

### 模型列表

```bash
curl http://localhost:8080/v1/models
```

### 健康检查

```bash
curl http://localhost:8080/health
```

## CLI 选项

```
选项:
  -p, --port <port>       服务端口 (默认: 8080)
  -h, --host <host>       服务主机 (默认: 0.0.0.0)
  --no-cors               禁用 CORS
  -k, --api-key <key>     API Key 认证
  -m, --model <model>     指定使用的模型 (如 claude, gpt-4)
  -c, --config <path>     配置文件路径
  --log-level <level>     日志级别 (DEBUG|INFO|WARN|ERROR) (默认: INFO)
  -V, --version           显示版本号
  --help                  显示帮助信息
```

## 配置文件

创建 `iflow-api.config.json`：

```json
{
  "port": 8080,
  "host": "0.0.0.0",
  "cors": true,
  "apiKey": "sk-your-secret-key",
  "model": "claude",
  "logLevel": "INFO"
}
```

配置文件优先级（从高到低）：
1. CLI 参数
2. 环境变量
3. 配置文件
4. 默认值

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `IFLOW_API_PORT` | 服务端口 | `8080` |
| `IFLOW_API_HOST` | 服务主机 | `0.0.0.0` |
| `IFLOW_API_KEY` | API Key | - |
| `IFLOW_API_MODEL` | 指定模型名称 | - |
| `IFLOW_API_LOG_LEVEL` | 日志级别 | `INFO` |
| `IFLOW_API_CORS` | 启用 CORS | `true` |

## 模型配置

**注意**：`--model` 参数（或 `IFLOW_API_MODEL` 环境变量）主要用于 API 响应标识，实际的模型选择需要在 iFlow CLI 中配置：

1. **启动桥接服务时指定模型名称**（用于 API 响应）：
   ```bash
   iflow-api-server --model claude-3-opus
   ```

2. **在 iFlow CLI 中配置实际模型**：
   - 运行 `iflow` 进入交互界面
   - 使用 `/model` 或相关命令切换模型
   - 或使用 iFlow 的配置文件指定默认模型

3. **客户端请求时指定模型**：
   ```bash
   curl http://localhost:8080/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{
       "model": "claude-3-opus",
       "messages": [{"role": "user", "content": "Hello!"}]
     }'
   ```

桥接服务会将模型信息传递给 iFlow，但实际使用的模型取决于 iFlow 的配置。

## 与 Claude Code 集成

1. 启动 iflow-api-server：
   ```bash
   iflow-api-server --port 8080
   ```

2. 配置 Claude Code：
   ```bash
   export OPENAI_BASE_URL=http://localhost:8080/v1
   export OPENAI_API_KEY=sk-iflow
   ```

3. 启动 Claude Code 并选择 OpenAI 模型：
   ```bash
   claude
   # 在 Claude Code 中选择使用 OpenAI 模型
   ```

## 架构

```
┌─────────────┐      HTTP/OpenAI API      ┌─────────────┐      WebSocket      ┌─────────┐
│ Claude Code │ ─────────────────────────> │ iflow-api   │ ──────────────────> │ iFlow   │
│ OpenCode    │                            │ -server     │                     │  CLI    │
└─────────────┘                            └─────────────┘                     └─────────┘
```

## 许可证

MIT