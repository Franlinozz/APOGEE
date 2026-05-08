import Fastify from 'fastify';
import { z } from 'zod';
import { zeroGNetworks } from '@apogee/config';

export function buildServer() {
  const server = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

  server.get('/health', async () => ({ status: 'ok', service: 'apogee-api' }));

  server.get('/proofs', async () => ({
    network: zeroGNetworks.galileo,
    receipts: [],
    message: 'Receipt index is ready; contract deployments will populate this feed.'
  }));

  const receiptInput = z.object({
    agentWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    action: z.string().min(3).max(120),
    amountWei: z.string().regex(/^\d+$/),
    storageRoot: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional()
  });

  server.post('/receipts', async (request, reply) => {
    const parsed = receiptInput.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_receipt_input', issues: parsed.error.flatten() });

    return reply.status(202).send({ accepted: true, receipt: parsed.data });
  });

  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { loadServerEnv } = await import('@apogee/config');
  const env = loadServerEnv();
  const server = buildServer();
  await server.listen({ host: env.API_HOST, port: env.API_PORT });
}
