#!/usr/bin/env node

const baseUrl = (process.env.APOGEE_BASE_URL || 'https://apogee-red.vercel.app').replace(/\/$/, '');
const edgeUrl = (process.env.APOGEE_EDGE_URL || 'https://apogeeedge-production.up.railway.app').replace(/\/$/, '');

const pages = ['/', '/dashboard', '/agents', '/agents/new', '/marketplace', '/receipts', '/memory', '/proofs', '/docs'];
const forbiddenHtml = [
  'Application error',
  'Invalid Date',
  'No skills found',
  'notfound/1',
  'notfound/2',
  'notfound/aurora',
  'notfound/vesper',
];
const txUrlPattern = /https:\/\/chainscan\.0g\.ai\/tx\/(0x[a-fA-F0-9]{64})/g;
const anyChainscanTxPattern = /https?:\/\/[^\s"'<>]*chainscan[^\s"'<>]*\/tx\/([^\s"'<>]+)/g;
const txHashPattern = /^0x[a-fA-F0-9]{64}$/;

const failures = [];

function fail(message) {
  failures.push(message);
  console.error(`✗ ${message}`);
}

function pass(message) {
  console.log(`✓ ${message}`);
}

async function get(url, options = {}) {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(options.timeoutMs ?? 15000),
    headers: { 'user-agent': 'apogee-production-smoke/1.0' },
  });
  const contentType = res.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await res.json() : await res.text();
  return { res, body, contentType, finalUrl: res.url };
}

function inspectTxLinks(label, text) {
  for (const match of text.matchAll(anyChainscanTxPattern)) {
    const full = match[0];
    const hash = match[1].replace(/[).,;]+$/, '');
    if (!full.startsWith('https://chainscan.0g.ai/tx/')) {
      fail(`${label}: non-production Chainscan tx link found: ${full}`);
    }
    if (!txHashPattern.test(hash)) {
      fail(`${label}: malformed Chainscan tx hash in link: ${full}`);
    }
  }

  for (const match of text.matchAll(txUrlPattern)) {
    if (!txHashPattern.test(match[1])) {
      fail(`${label}: malformed tx hash: ${match[1]}`);
    }
  }
}

function inspectReceiptTxHashes(label, value) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => inspectReceiptTxHashes(`${label}[${i}]`, item));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if ((key === 'txHash' || key === 'storageTxHash') && child != null && child !== '') {
      if (typeof child !== 'string' || !txHashPattern.test(child)) {
        fail(`${label}.${key}: malformed transaction hash ${String(child)}`);
      }
    }
    if (child && typeof child === 'object') inspectReceiptTxHashes(`${label}.${key}`, child);
  }
}

async function checkPages() {
  for (const path of pages) {
    try {
      const { res, body, finalUrl } = await get(`${baseUrl}${path}`);
      if (res.status !== 200) {
        fail(`${path}: expected HTTP 200 after redirects, got ${res.status} (${finalUrl})`);
        continue;
      }
      const html = String(body);
      for (const needle of forbiddenHtml) {
        if (html.includes(needle)) fail(`${path}: rendered forbidden text "${needle}"`);
      }
      inspectTxLinks(path, html);
      pass(`${path}: HTTP 200 (${finalUrl})`);
    } catch (error) {
      fail(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function checkJson(name, url, validate) {
  try {
    const { res, body } = await get(url);
    if (res.status !== 200) return fail(`${name}: expected HTTP 200, got ${res.status}`);
    validate(body);
    inspectReceiptTxHashes(name, body);
    pass(`${name}: valid JSON semantics`);
  } catch (error) {
    fail(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

await checkPages();

await checkJson('web /api/stats', `${baseUrl}/api/stats`, (json) => {
  for (const key of ['totalAgents', 'activeAgents', 'totalReceipts', 'totalVolumeWei']) {
    if (!(key in json)) throw new Error(`missing ${key}`);
  }
});

let totalReceipts = 0;
await checkJson('edge /v1/stats', `${edgeUrl}/v1/stats`, (json) => {
  for (const key of ['totalAgents', 'activeAgents', 'totalReceipts', 'totalVolumeWei']) {
    if (!(key in json)) throw new Error(`missing ${key}`);
  }
  totalReceipts = Number(json.totalReceipts || 0);
});

await checkJson('edge /v1/receipts', `${edgeUrl}/v1/receipts?scope=global&limit=10`, (json) => {
  if (!Array.isArray(json.items)) throw new Error('missing items[]');
  if (totalReceipts > 0 && json.items.length === 0) throw new Error('totalReceipts > 0 but no receipt rows returned');
});

await checkJson('edge /v1/skills', `${edgeUrl}/v1/skills`, (json) => {
  if (!Array.isArray(json) || json.length === 0) throw new Error('expected seeded skills array');
});

await checkJson('edge /v1/services', `${edgeUrl}/v1/services`, (json) => {
  if (!Array.isArray(json) || json.length === 0) throw new Error('expected services array');
});

await checkJson('edge /v1/receipts/heatmap', `${edgeUrl}/v1/receipts/heatmap`, (json) => {
  if (!Array.isArray(json)) throw new Error('expected heatmap array');
});

if (failures.length) {
  console.error(`\nProduction smoke failed with ${failures.length} issue(s).`);
  process.exit(1);
}

console.log(`\nProduction smoke passed for ${baseUrl}`);
