/**
 * HTTP 服务器和 OpenAI API 路由
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { IFlowAdapter } from './adapter.js';
import {
  type ChatCompletionRequest,
  type ChatCompletionResponse,
  type ChatCompletionStreamResponse,
  type ModelsResponse,
  type ErrorResponse,
} from './openai/types.js';
import {
  generateId,
  getTimestamp,
  messagesToIFlowPrompt,
  createCompletionResponse,
  createStreamChunk,
  calculateUsage,
  formatSSE,
  SSE_DONE,
  AVAILABLE_MODELS,
  getDefaultModel,
} from './openai/transformer.js';

export interface ServerOptions {
  port: number;
  host?: string;
  cors?: boolean;
  apiKey?: string;
  model?: string;
}

export class IFlowAPIServer {
  private app: express.Application;
  private adapter: IFlowAdapter;
  private options: ServerOptions;

  constructor(options: ServerOptions) {
    this.options = options;
    this.app = express();
    this.adapter = new IFlowAdapter({
      model: options.model,
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandler();
  }

  /**
   * 设置中间件
   */
  private setupMiddleware(): void {
    // JSON 解析
    this.app.use(express.json({ limit: '10mb' }));

    // CORS
    if (this.options.cors !== false) {
      this.app.use(cors({
        origin: '*',
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      }));
    }

    // API Key 验证（如果配置了）
    if (this.options.apiKey) {
      this.app.use((req: Request, res: Response, next: NextFunction) => {
        // 健康检查端点不需要认证
        if (req.path === '/health') {
          return next();
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json(this.createError('未提供 API Key', 'authentication_error'));
        }

        const token = authHeader.substring(7);
        if (token !== this.options.apiKey) {
          return res.status(401).json(this.createError('API Key 无效', 'authentication_error'));
        }

        next();
      });
    }
  }

  /**
   * 设置路由
   */
  private setupRoutes(): void {
    // 健康检查
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        connected: this.adapter.isConnected(),
        timestamp: new Date().toISOString(),
      });
    });

    // 模型列表
    this.app.get('/v1/models', async (req: Request, res: Response) => {
      const response: ModelsResponse = {
        object: 'list',
        data: AVAILABLE_MODELS.map(model => ({
          id: model.id,
          object: 'model',
          created: getTimestamp(),
          owned_by: 'iflow',
        })),
      };
      res.json(response);
    });

    // 聊天完成
    this.app.post('/v1/chat/completions', async (req: Request, res: Response) => {
      console.log(`[${new Date().toISOString()}] 收到聊天请求`);
      console.log('请求体:', JSON.stringify(req.body, null, 2));

      try {
        const body = req.body as ChatCompletionRequest;

        // 验证请求
        if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
          console.log('请求验证失败: messages 为空');
          return res.status(400).json(this.createError('messages 不能为空', 'invalid_request_error'));
        }

        const isStream = body.stream === true;
        const model = body.model || getDefaultModel();

        console.log(`流式: ${isStream}, 模型: ${model}`);

        // 转换消息为 iFlow 提示词
        const prompt = messagesToIFlowPrompt(body.messages);
        console.log('提示词:', prompt.substring(0, 100) + '...');

        if (isStream) {
          console.log('处理流式响应...');
          await this.handleStreamResponse(res, prompt, model);
        } else {
          console.log('处理非流式响应...');
          await this.handleNonStreamResponse(res, prompt, model);
        }
      } catch (error) {
        console.error('处理请求错误:', error);
        res.status(500).json(this.createError('内部服务器错误', 'internal_error'));
      }
    });
  }

  /**
   * 处理流式响应
   */
  private async handleStreamResponse(res: Response, prompt: string, model: string): Promise<void> {
    const id = generateId();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 设置 60 秒超时
    const timeout = setTimeout(() => {
      res.write(formatSSE(this.createError('请求超时', 'timeout_error')));
      res.end();
    }, 60000);

    try {
      // 发送开始标记（角色）
      const startChunk: ChatCompletionStreamResponse = {
        id,
        object: 'chat.completion.chunk',
        created: getTimestamp(),
        model,
        choices: [{
          index: 0,
          delta: { role: 'assistant' },
          finish_reason: null,
        }],
      };
      res.write(formatSSE(startChunk));

      // 流式发送内容
      let fullContent = '';
      let isDone = false;
      for await (const chunk of this.adapter.sendMessageStream(prompt)) {
        if (isDone) break;

        switch (chunk.type) {
          case 'content':
            if (chunk.content) {
              fullContent += chunk.content;
              const streamChunk = createStreamChunk(id, model, chunk.content);
              res.write(formatSSE(streamChunk));
            }
            break;

          case 'tool_call':
            // 工具调用信息可以记录日志，但不发送到客户端
            console.log(`工具调用: ${chunk.toolName} - ${chunk.toolStatus}`);
            break;

          case 'done':
            // 收到完成信号，标记结束
            isDone = true;
            break;

          case 'error':
            console.error('流式处理错误:', chunk.error);
            res.write(formatSSE(this.createError(
              chunk.error || '流式响应错误',
              'streaming_error',
              'streaming_error'
            )));
            isDone = true;
            break;
        }
      }

      // 发送结束标记
      const endChunk = createStreamChunk(id, model, '', 'stop');
      res.write(formatSSE(endChunk));
      res.write(SSE_DONE);
      res.end();
    } catch (error) {
      console.error('流式响应错误:', error);
      res.write(formatSSE(this.createError('流式响应失败', 'streaming_error')));
      res.end();
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * 处理非流式响应
   */
  private async handleNonStreamResponse(res: Response, prompt: string, model: string): Promise<void> {
    const id = generateId();

    // 设置 60 秒超时
    const timeout = setTimeout(() => {
      res.status(504).json(this.createError('请求超时', 'timeout_error'));
    }, 60000);

    try {
      const response = await this.adapter.sendMessage(prompt);
      clearTimeout(timeout);

      const usage = calculateUsage(prompt, response.content);

      const completionResponse = createCompletionResponse(
        id,
        model,
        response.content,
        usage,
        response.stopReason === 'max_tokens' ? 'length' : 'stop'
      );

      res.json(completionResponse);
    } catch (error) {
      clearTimeout(timeout);
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('处理请求错误:', errorMsg);
      
      // 区分超时错误和其他错误
      if (errorMsg.includes('超时') || errorMsg.includes('timeout')) {
        res.status(504).json(this.createError(errorMsg, 'timeout_error', 'timeout'));
      } else {
        res.status(500).json(this.createError(errorMsg, 'internal_error', 'internal_error'));
      }
    }
  }

  /**
   * 设置错误处理
   */
  private setupErrorHandler(): void {
    this.app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
      console.error('服务器错误:', err);
      res.status(500).json(this.createError('服务器内部错误', 'internal_error'));
    });
  }

  /**
   * 创建错误响应
   */
  private createError(message: string, type: string, code: string = 'unknown_error'): ErrorResponse {
    return {
      error: {
        message,
        type,
        code,
      },
    };
  }

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    // 连接 iFlow
    console.log('正在连接 iFlow...');
    await this.adapter.connect();
    console.log('iFlow 连接成功');

    // 启动 HTTP 服务器
    const host = this.options.host || '0.0.0.0';
    const port = this.options.port;

    return new Promise((resolve, reject) => {
      this.app.listen(port, host, () => {
        const model = this.options.model || 'iFlow 默认';
        console.log(`\n🚀 iFlow API 桥接服务已启动`);
        console.log(`📍 服务地址: http://${host}:${port}`);
        console.log(`🤖 使用模型: ${model}`);
        console.log(`🔗 OpenAI API: http://${host}:${port}/v1/chat/completions`);
        console.log(`📋 模型列表: http://${host}:${port}/v1/models`);
        console.log(`❤️  健康检查: http://${host}:${port}/health`);
        console.log(`\n💡 使用示例:`);
        console.log(`   export OPENAI_BASE_URL=http://${host}:${port}/v1`);
        console.log(`   export OPENAI_API_KEY=sk-iflow`);
        console.log(`   claude`);
        console.log();
        resolve();
      }).on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
    await this.adapter.disconnect();
  }
}