/**
 * iFlow SDK 适配器（使用子进程模式）
 * 封装与 iFlow CLI 的通信
 */

import { spawn, type ChildProcess } from 'child_process';

export interface IFlowResponse {
  content: string;
  toolCalls?: Array<{
    name: string;
    status: string;
  }>;
  stopReason: 'end_turn' | 'max_tokens' | 'error';
}

export interface StreamChunk {
  type: 'content' | 'tool_call' | 'done' | 'error';
  content?: string;
  toolName?: string;
  toolStatus?: string;
  error?: string;
}

export interface IFlowAdapterOptions {
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
}

/**
 * iFlow 适配器 - 使用子进程模式
 */
export class IFlowAdapter {
  private options: IFlowAdapterOptions;
  private defaultTimeout = 120000; // 2分钟默认超时

  constructor(options: IFlowAdapterOptions = {}) {
    this.options = options;
  }

  /**
   * 发送消息并获取完整响应（非流式）
   */
  async sendMessage(prompt: string): Promise<IFlowResponse> {
    console.log('[Adapter] 发送消息（非流式）:', prompt.substring(0, 100));

    return new Promise((resolve, reject) => {
      const args = ['-p', prompt];
      if (this.options.model) {
        args.push('-m', this.options.model);
      }

      console.log('[Adapter] 启动 iflow:', args.join(' '));
      const child = spawn('iflow', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`iFlow 响应超时 (${this.defaultTimeout}ms)`));
      }, this.options.timeout || this.defaultTimeout);

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`启动 iFlow 失败: ${err.message}`));
      });

      child.on('exit', (code) => {
        clearTimeout(timeout);
        console.log('[Adapter] iFlow 退出，code:', code);

        if (code !== 0 && code !== null) {
          console.error('[Adapter] iFlow stderr:', stderr);
        }

        // 解析响应
        const content = this.parseResponse(stdout);
        resolve({
          content,
          stopReason: code === 0 ? 'end_turn' : 'error',
        });
      });
    });
  }

  /**
   * 发送消息并获取流式响应
   */
  async *sendMessageStream(prompt: string): AsyncGenerator<StreamChunk> {
    console.log('[Adapter] 发送消息（流式）:', prompt.substring(0, 100));

    const args = ['-p', prompt];
    if (this.options.model) {
      args.push('-m', this.options.model);
    }

    console.log('[Adapter] 启动 iflow:', args.join(' '));
    const child = spawn('iflow', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let buffer = '';
    let isDone = false;
    const timeout = setTimeout(() => {
      if (!isDone) {
        child.kill('SIGTERM');
        isDone = true;
        console.error('[Adapter] 流式响应超时');
      }
    }, this.options.timeout || this.defaultTimeout);

    child.stdout?.on('data', (data) => {
      buffer += data.toString();
    });

    child.stderr?.on('data', (data) => {
      const msg = data.toString();
      console.log('[Adapter] iFlow stderr:', msg.trim());
    });

    // 模拟流式输出 - 逐字符发送
    let lastSentIndex = 0;
    while (!isDone) {
      // 检查进程是否结束
      if (child.exitCode !== null) {
        isDone = true;
      }

      // 发送新内容
      if (buffer.length > lastSentIndex) {
        const newContent = buffer.slice(lastSentIndex);
        lastSentIndex = buffer.length;
        
        // 逐行或逐字符发送
        const lines = newContent.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            yield {
              type: 'content',
              content: line + '\n',
            };
          }
        }
      }

      if (!isDone) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    clearTimeout(timeout);
    
    // 发送剩余内容
    if (buffer.length > lastSentIndex) {
      yield {
        type: 'content',
        content: buffer.slice(lastSentIndex),
      };
    }

    yield { type: 'done' };
  }

  /**
   * 解析 iFlow 输出，提取实际回复内容
   */
  private parseResponse(stdout: string): string {
    // 尝试提取 <Execution Info> 之前的内容作为回复
    const executionInfoMatch = stdout.match(/<Execution Info>[\s\S]*$/);
    if (executionInfoMatch) {
      return stdout.substring(0, executionInfoMatch.index).trim();
    }

    // 如果没有 Execution Info，返回全部内容（去掉开头的警告）
    const lines = stdout.split('\n');
    const startIndex = lines.findIndex((line) => 
      !line.includes('DeprecationWarning') && 
      !line.includes('node:') &&
      line.trim()
    );
    
    if (startIndex >= 0) {
      return lines.slice(startIndex).join('\n').trim();
    }

    return stdout.trim();
  }

  /**
   * 连接到 iFlow
   */
  async connect(): Promise<void> {
    // 子进程模式不需要持久连接
    console.log('[Adapter] 子进程模式已就绪');
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    // 子进程模式不需要断开连接
    console.log('[Adapter] 子进程模式断开（无操作）');
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    // 子进程模式总是"已连接"
    return true;
  }
}

export default IFlowAdapter;

