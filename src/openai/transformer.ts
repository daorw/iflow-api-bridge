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

/**
 * 提取 System 消息和 User 消息
 * 兼容 opencode 的各种消息格式（包括 plan 模式）
 */
export function extractMessages(messages: ChatCompletionMessage[]): {
  systemMessage: string | undefined;
  userMessage: string;
} {
  console.log('[extractMessages] 原始消息:', JSON.stringify(messages.map(m => ({ role: m.role, contentLength: typeof m.content === 'string' ? m.content.length : 0 }))));
  
  let systemMessage: string | undefined;
  let userMessage = '';

  // 第一步：查找 system 消息
  for (const msg of messages) {
    if (typeof msg.content !== 'string') continue;
    if (msg.role === 'system') {
      systemMessage = msg.content;
    }
  }

  // 第二步：查找有内容的 user 消息（plan 模式下 user 可能是空的）
  for (const msg of messages) {
    if (typeof msg.content !== 'string') continue;
    if (msg.role === 'user' && msg.content.trim()) {
      userMessage = msg.content;
      break;
    }
  }

  // 第三步：如果没有找到有内容的 user 消息，尝试其他非 system 角色
  if (!userMessage) {
    for (const msg of messages) {
      if (typeof msg.content !== 'string') continue;
      const role = msg.role || 'unknown';
      // 任何非 system 角色且有内容的都可以作为 user 消息
      if (role !== 'system' && msg.content.trim()) {
        userMessage = msg.content;
        console.log(`[extractMessages] 使用 role="${role}" 作为 user 消息`);
        break;
      }
    }
  }

  // 第四步：如果还是没有，使用最后一条非 system 消息（即使 role 是 user 但内容为空的情况）
  if (!userMessage) {
    const nonSystemMessages = messages
      .filter(msg => msg.role !== 'system' && typeof msg.content === 'string');
    if (nonSystemMessages.length > 0) {
      // 使用最后一条非 system 消息
      const lastMsg = nonSystemMessages[nonSystemMessages.length - 1];
      if (lastMsg.content) {
        userMessage = lastMsg.content;
        console.log(`[extractMessages] 使用最后一条非 system 消息, role="${lastMsg.role}"`);
      }
    }
  }

  console.log(`[extractMessages] 结果: system=${systemMessage ? '有' : '无'}, user=${userMessage ? '有' : '无'}, user长度=${userMessage.length}`);
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
