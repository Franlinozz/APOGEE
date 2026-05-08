import { ethers } from 'ethers';
import { z } from 'zod';

export const chatMessageSchema = z.object({ role: z.enum(['system', 'user', 'assistant']), content: z.string().min(1) });
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export async function createComputeBroker(input: { rpcUrl: string; privateKey: string }) {
  const { createZGComputeNetworkBroker } = await import('@0glabs/0g-serving-broker');
  const provider = new ethers.JsonRpcProvider(input.rpcUrl);
  const wallet = new ethers.Wallet(input.privateKey, provider);
  return createZGComputeNetworkBroker(wallet as any);
}

export async function runZeroGChatCompletion(input: {
  broker: any;
  providerAddress: string;
  messages: ChatMessage[];
  model?: string;
}): Promise<unknown> {
  const messages = z.array(chatMessageSchema).min(1).parse(input.messages);
  const { endpoint, model } = await input.broker.inference.getServiceMetadata(input.providerAddress);
  const body = { messages, model: input.model ?? model, stream: false };
  const headers = await input.broker.inference.getRequestHeaders(input.providerAddress);

  const response = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(`0G Compute request failed (${response.status}): ${JSON.stringify(data)}`);

  const chatId = response.headers.get('ZG-Res-Key') ?? response.headers.get('zg-res-key') ?? data?.id;
  await input.broker.inference.processResponse(input.providerAddress, chatId, JSON.stringify(data?.usage ?? {}));
  return data;
}
