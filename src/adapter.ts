/**
 * iFlow SDK 适配器（使用子进程模式）
 * 封装与 iFlow CLI 的通信，支持对话上下文管理
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
  maxHistoryLength?: number;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface Conversation {
  messages: Message[];
  lastAccessTime: number;
}

export class IFlowAdapter {
  private options: IFlowAdapterOptions;
  private defaultTimeout = 300000;
  private conversations: Map<string, Conversation> = new Map();
  private readonly maxHistoryLength: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(options: IFlowAdapterOptions = {}) {
    this.options = options;
    this.maxHistoryLength = options.maxHistoryLength || 20;
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredConversations();
    }, 30 * 60 * 1000);
  }

  private getConversation(conversationId: string): Conversation {
    let conversation = this.conversations.get(conversationId);
    if (!conversation) {
      conversation = {
        messages: [],
        lastAccessTime: Date.now(),
      };
      this.conversations.set(conversationId, conversation);
    } else {
      conversation.lastAccessTime = Date.now();
    }
    return conversation;
  }

  private buildPromptWithHistory(
    conversationId: string,
    systemMessage: string | undefined,
    userMessage: string
  ): string {
    const conversation = this.getConversation(conversationId);
    const parts: string[] = [];

    if (systemMessage) {
      parts.push(`System: ${systemMessage}`);
    }

    for (const msg of conversation.messages) {
      if (msg.role === 'user') {
        parts.push(`User: ${msg.content}`);
      } else if (msg.role === 'assistant') {
        parts.push(`Assistant: ${msg.content}`);
      }
    }

    parts.push(`User: ${userMessage}`);
    return parts.join('\n\n');
  }

  private saveMessage(conversationId: string, role: 'user' | 'assistant', content: string): void {
    const conversation = this.getConversation(conversationId);
    conversation.messages.push({ role, content });

    if (conversation.messages.length > this.maxHistoryLength) {
      const systemMessages = conversation.messages.filter(m => m.role === 'system');
      const otherMessages = conversation.messages.filter(m => m.role !== 'system');
      const keepCount = this.maxHistoryLength - systemMessages.length;
      conversation.messages = [
        ...systemMessages,
        ...otherMessages.slice(-keepCount),
      ];
    }
    conversation.lastAccessTime = Date.now();
  }

  private cleanupExpiredConversations(): void {
    const now = Date.now();
    const expireTime = 24 * 60 * 60 * 1000;
    let cleaned = 0;

    for (const [id, conversation] of this.conversations.entries()) {
      if (now - conversation.lastAccessTime > expireTime) {
        this.conversations.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[Adapter] 清理了 ${cleaned} 个过期会话`);
    }
  }

  async sendMessage(
    conversationId: string,
    systemMessage: string | undefined,
    userMessage: string
  ): Promise<IFlowResponse> {
    const prompt = this.buildPromptWithHistory(conversationId, systemMessage, userMessage);
    console.log(`[Adapter] 发送消息（非流式）会话: ${conversationId}`);
    console.log(`[Adapter] 历史消息数: ${this.getConversation(conversationId).messages.length}`);

    this.saveMessage(conversationId, 'user', userMessage);

    return new Promise((resolve, reject) => {
      const args = ['-p', prompt];
      if (this.options.model) {
        args.push('-m', this.options.model);
      }

      console.log('[Adapter] 启动 iflow:', args.slice(0, 3).join(' ') + '...');
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
          console.error('[Adapter] iFlow stderr:', stderr.substring(0, 500));
        }

        const content = this.parseResponse(stdout);
        this.saveMessage(conversationId, 'assistant', content);

        resolve({
          content,
          stopReason: code === 0 ? 'end_turn' : 'error',
        });
      });
    });
  }

  async *sendMessageStream(
    conversationId: string,
    systemMessage: string | undefined,
    userMessage: string
  ): AsyncGenerator<StreamChunk> {
    const prompt = this.buildPromptWithHistory(conversationId, systemMessage, userMessage);
    console.log(`[Adapter] 发送消息（流式）会话: ${conversationId}`);
    console.log(`[Adapter] 历史消息数: ${this.getConversation(conversationId).messages.length}`);

    this.saveMessage(conversationId, 'user', userMessage);

    const args = ['-p', prompt];
    if (this.options.model) {
      args.push('-m', this.options.model);
    }

    console.log('[Adapter] 启动 iflow:', args.slice(0, 3).join(' ') + '...');
    const child = spawn('iflow', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let buffer = '';
    let isDone = false;
    let fullContent = '';
    
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
      console.log('[Adapter] iFlow stderr:', msg.trim().substring(0, 200));
    });

    let lastSentIndex = 0;
    while (!isDone) {
      if (child.exitCode !== null) {
        isDone = true;
      }

      if (buffer.length > lastSentIndex) {
        const newContent = buffer.slice(lastSentIndex);
        lastSentIndex = buffer.length;
        fullContent += newContent;
        
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
    
    if (buffer.length > lastSentIndex) {
      const remaining = buffer.slice(lastSentIndex);
      fullContent += remaining;
      yield {
        type: 'content',
        content: remaining,
      };
    }

    const finalContent = this.parseResponse(fullContent);
    this.saveMessage(conversationId, 'assistant', finalContent);

    yield { type: 'done' };
  }

  private parseResponse(stdout: string): string {
    const executionInfoMatch = stdout.match(/<Execution Info>[\s\S]*$/);
    if (executionInfoMatch) {
      return stdout.substring(0, executionInfoMatch.index).trim();
    }

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

  async connect(): Promise<void> {
    console.log('[Adapter] 子进程模式已就绪，支持上下文管理');
  }

  disconnect(): void {
    console.log('[Adapter] 子进程模式断开，清理资源...');
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.conversations.clear();
  }

  isConnected(): boolean {
    return true;
  }

  getStats(): { conversationCount: number; totalMessages: number } {
    let totalMessages = 0;
    for (const conv of this.conversations.values()) {
      totalMessages += conv.messages.length;
    }
    return {
      conversationCount: this.conversations.size,
      totalMessages,
    };
  }
}

export default IFlowAdapter;
