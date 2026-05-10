export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

export type SSEEvent =
  | { event: 'token'; data: string }
  | { event: 'tool_call'; data: { name: string; args: Record<string, unknown> } }
  | { event: 'tool_result'; data: { name: string; result: unknown } }
  | { event: 'done'; data: { chatId: string; tokensUsed: number } }
  | { event: 'error'; data: { message: string } };
