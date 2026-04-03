/**
 * OpenAI API 与 iFlow 消息格式转换器
 */

import type {
  ChatCompletionMessage,
  ChatCompletionResponse,
  ChatCompletionStreamResponse,
  ChatCompletionStreamChoice,
  ChatCompletionChoice,
  UsageInfo,
  ToolCall,
} from './types.js';

/**
 * 生成唯一 ID
 */
export function generateId(): string {
  return `chatcmpl-${Date.now().toString(36)}${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * 获取当前时间戳
 */
export function getTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * 将 OpenAI 消息格式转换为 iFlow 文本格式
 */
export function messagesToIFlowPrompt(messages: ChatCompletionMessage[]): string {
  return messages.map(msg => {
    if (typeof msg.content === 'string') {
      return `${msg.role}: ${msg.content}`;
    }
    return `${msg.role}: [复杂内容]`;
  }).join('\n\n');
}

/**
 * 提取 System 消息和最后一条 User 消息
 * 用于上下文管理
 */
export function extractMessages(messages: ChatCompletionMessage[]): {
  systemMessage: string | undefined;
  userMessage: string;
} {
  let systemMessage: string | undefined;
  let userMessage = '';

  for (const msg of messages) {
    if (typeof msg.content !== 'string') continue;

    if (msg.role === 'system') {
      systemMessage = msg.content;
    } else if (msg.role === 'user') {
      userMessage = msg.content;
    }
  }

  return { systemMessage, userMessage };
}

/**
 * 创建流式响应块
 */
export function createStreamChunk(
  id: string,
  model: string,
  content: string,
  finishReason: 'stop' | 'length' | null = null
): ChatCompletionStreamResponse {
  const choice: ChatCompletionStreamChoice = {
    index: 0,
    delta: content ? { content } : {},
    finish_reason: finishReason,
  };

  return {
    id,
    object: 'chat.completion.chunk',
    created: getTimestamp(),
    model,
    choices: [choice],
  };
}

/**
 * 创建完整响应
 */
export function createCompletionResponse(
  id: string,
  model: string,
  content: string,
  usage: UsageInfo,
  finishReason: 'stop' | 'length' = 'stop'
): ChatCompletionResponse {
  const choice: ChatCompletionChoice = {
    index: 0,
    message: {
      role: 'assistant',
      content,
    },
    finish_reason: finishReason,
  };

  return {
    id,
    object: 'chat.completion',
    created: getTimestamp(),
    model,
    choices: [choice],
    usage,
  };
}

/**
 * 估算 token 数量（简化版）
 */
export function estimateTokens(text: string): number {
  // 简化估算：假设平均每 4 个字符一个 token
  return Math.ceil(text.length / 4);
}

/**
 * 计算使用量
 */
export function calculateUsage(prompt: string, completion: string): UsageInfo {
  const promptTokens = estimateTokens(prompt);
  const completionTokens = estimateTokens(completion);

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  };
}

/**
 * SSE 格式化
 */
export function formatSSE(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * SSE 结束标记
 */
export const SSE_DONE = 'data: [DONE]\n\n';

/**
 * 支持的模型列表
 */
export const AVAILABLE_MODELS = [
  { id: 'iflow-default', name: 'iFlow Default' },
  { id: 'iflow-claude', name: 'iFlow Claude' },
  { id: 'iflow-gpt-4', name: 'iFlow GPT-4' },
];

/**
 * 获取默认模型 ID
 */
export function getDefaultModel(): string {
  return 'kimi-k2.5';
}
