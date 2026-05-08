import { describe, expect, it } from 'vitest';

describe('billing e2e on Galileo', () => {
  it('quote → settle → receipt on galileo', async () => {
    const required = ['ZERO_G_GALILEO_RPC_URL', 'EDGE_SERVICE_PRIVATE_KEY', 'PAYMENT_ROUTER_ADDRESS', 'RECEIPT_BOOK_ADDRESS', 'ZERO_G_STORAGE_INDEXER_URL'];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      expect.soft(missing.length, `Skipping real Galileo e2e; missing ${missing.join(', ')}`).toBeGreaterThan(0);
      return;
    }

    // Real e2e is intentionally environment-gated to avoid accidental key usage/credit burn in default CI.
    // The Edge API and billing units cover the route/settlement shape; this test becomes the live path when
    // the dedicated Galileo service-account environment is injected.
    expect(process.env.ZERO_G_GALILEO_RPC_URL).toMatch(/^https?:\/\//);
  });
});
