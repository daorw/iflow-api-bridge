# @userdaoo/iflow-api-bridge

iFlow API 桥接服务 - 将 iFlow CLI 封装为 OpenAI 兼容的 API

## 特性

- ✅ OpenAI API 兼容 (`/v1/chat/completions`)
- ✅ 支持流式 (SSE) 和非流式响应
- ✅ 多模型支持 (GLM、DeepSeek、Kimi、Qwen、MiniMax 等)
- ✅ 上下文管理 - 超时后仍能保持对话连续性
- ✅ 支持自定义对话 ID 追踪会话

## 安装

```bash
npm install -g @userdaoo/iflow-api-bridge
```

或使用 npx:

```bash
npx @userdaoo/iflow-api-bridge --port 8080
```

## 使用方法

### 1. 启动服务

```bash
# 使用默认模型 (GLM-4.7)
iflow-api-server --port 8080

# 指定模型
iflow-api-server --port 8080 --model kimi-k2.5
```

### 2. 配置客户端

**Claude Code / OpenCode:**

```bash
export OPENAI_BASE_URL=http://localhost:8080/v1
export OPENAI_API_KEY=sk-anything
claude
```

### 3. API 调用

```bash
# 非流式请求
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kimi-k2.5",
    "messages": [{"role": "user", "content": "你好"}]
  }'

# 流式请求
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kimi-k2.5",
    "stream": true,
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

## 支持的模型

实际可用模型取决于你的 iFlow CLI 配置：

| 模型 ID | 名称 |
|---------|------|
| `glm-4.7` | GLM-4.7 (默认) |
| `iflow-rome-30ba3b` | iFlow-ROME-30BA3B (预览版) |
| `deepseek-v3.2` | DeepSeek-V3.2 |
| `glm-5` | GLM-5 |
| `qwen3-coder-plus` | Qwen3-Coder-Plus |
| `kimi-k2-thinking` | Kimi-K2-Thinking |
| `minimax-m2.5` | MiniMax-M2.5 |
| `kimi-k2.5` | Kimi-K2.5 |
| `kimi-k2-0905` | Kimi-K2-0905 |

获取最新模型列表:

```bash
curl http://localhost:8080/v1/models
```

## 上下文管理

桥接器支持通过 HTTP Header `X-Conversation-Id` 追踪会话：

```bash
# 第一轮对话
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Conversation-Id: my-session-123" \
  -d '{"messages": [{"role": "user", "content": "我叫 Alice"}]}'

# 第二轮对话（即使第一轮超时，仍能记住上下文）
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Conversation-Id: my-session-123" \
  -d '{"messages": [{"role": "user", "content": "我叫什么名字？"}]}'
```

### 上下文特性

- 每个会话独立保存历史消息
- 最多保留 20 条历史消息（可配置）
- 24 小时未访问的会话自动清理
- 超时后重试不会丢失上下文

## API 端点

| 端点 | 描述 |
|------|------|
| `GET /health` | 健康检查，返回会话统计 |
| `GET /v1/models` | 获取可用模型列表 |
| `POST /v1/chat/completions` | 聊天完成 |

## 命令行选项

```
Options:
  -p, --port <port>        服务端口 (默认: 8080)
  -h, --host <host>        服务主机 (默认: 0.0.0.0)
  --no-cors                禁用 CORS
  -k, --api-key <key>      API Key 认证
  -m, --model <model>      默认模型 (默认: glm-4.7)
  -c, --config <path>      配置文件路径
  --log-level <level>      日志级别 (DEBUG|INFO|WARN|ERROR)
  --help                   显示帮助
```

## 配置优先级

1. 命令行参数 (最高优先级)
2. 环境变量
3. 配置文件
4. 默认值

## 环境变量

```bash
export IFLOW_API_PORT=8080
export IFLOW_API_HOST=0.0.0.0
export IFLOW_API_KEY=your-secret-key
export IFLOW_MODEL=glm-4.7
export IFLOW_LOG_LEVEL=INFO
```

## 注意事项

1. **模型选择**: 实际可用模型取决于 iFlow CLI 的配置和 API key
2. **超时设置**: 默认 5 分钟超时，防止长时间等待
3. **上下文保持**: 即使客户端断开，服务端仍保留会话上下文
4. **资源清理**: 定期清理 24 小时未使用的会话

## 依赖

- Node.js >= 22
- iFlow CLI (必须已安装并可运行 `iflow` 命令)

## License

MIT
