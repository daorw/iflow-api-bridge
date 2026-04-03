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

export function generateId(): string {
  return `chatcmpl-${Date.now().toString(36)}${Math.random().toString(36).substring(2, 10)}`;
}

export function getTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

export function messagesToIFlowPrompt(messages: ChatCompletionMessage[]): string {
  return messages.map(msg => {
    if (typeof msg.content === 'string') {
      return `${msg.role}: ${msg.content}`;
    }
    return `${msg.role}: [复杂内容]`;
  }).join('\n\n');
}

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

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function calculateUsage(prompt: string, completion: string): UsageInfo {
  const promptTokens = estimateTokens(prompt);
  const completionTokens = estimateTokens(completion);

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  };
}

export function formatSSE(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export const SSE_DONE = 'data: [DONE]\n\n';

/**
 * iFlow 支持的模型列表
 * 基于用户实际的 iflow CLI 配置
 */
export const AVAILABLE_MODELS = [
  { id: 'glm-4.7', name: 'GLM-4.7 (Default)' },
  { id: 'iflow-rome-30ba3b', name: 'iFlow-ROME-30BA3B (Preview)' },
  { id: 'deepseek-v3.2', name: 'DeepSeek-V3.2' },
  { id: 'glm-5', name: 'GLM-5' },
  { id: 'qwen3-coder-plus', name: 'Qwen3-Coder-Plus' },
  { id: 'kimi-k2-thinking', name: 'Kimi-K2-Thinking' },
  { id: 'minimax-m2.5', name: 'MiniMax-M2.5' },
  { id: 'kimi-k2.5', name: 'Kimi-K2.5' },
  { id: 'kimi-k2-0905', name: 'Kimi-K2-0905' },
];

export function getDefaultModel(): string {
  return 'glm-4.7';
}
