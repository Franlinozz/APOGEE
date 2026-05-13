#!/usr/bin/env node
/**
 * Smoke-test the agent deploy path without a browser.
 * Usage: node apps/edge/scripts/smoke-deploy.mjs
 * Requires env vars: ZERO_G_ARISTOTLE_RPC_URL, ACCOUNT_FACTORY_ADDRESS, AGENT_IDENTITY_ADDRESS,
 *                    PAYMENT_ROUTER_ADDRESS, RECEIPT_BOOK_ADDRESS, EDGE_SERVICE_PRIVATE_KEY
 *
 * Source a .env file first if needed:
 *   set -a; source apps/edge/.env; set +a; node apps/edge/scripts/smoke-deploy.mjs
 */

import { JsonRpcProvider, Contract, Wallet, getAddress } from 'ethers';

const rpcUrl = process.env.ZERO_G_ARISTOTLE_RPC_URL ?? 'https://evmrpc.0g.ai';
const CHAIN_ID = 16661;

const CONTRACTS = {
  ACCOUNT_FACTORY:  { env: 'ACCOUNT_FACTORY_ADDRESS',  abi: ['function predict(address owner,bytes32 salt) view returns (address)'] },
  AGENT_IDENTITY:   { env: 'AGENT_IDENTITY_ADDRESS',   abi: ['function nextTokenId() view returns (uint256)'] },
  PAYMENT_ROUTER:   { env: 'PAYMENT_ROUTER_ADDRESS',   abi: [] },
  RECEIPT_BOOK:     { env: 'RECEIPT_BOOK_ADDRESS',     abi: [] },
};

let pass = true;
const fail = (msg) => { console.error('  ✗ FAIL:', msg); pass = false; };
const ok   = (msg) => console.log('  ✓', msg);

async function main() {
  console.log('═══ Apogee deploy smoke-test ═══');
  console.log('RPC:', rpcUrl, '  expected chainId:', CHAIN_ID);
  console.log();

  const provider = new JsonRpcProvider(rpcUrl, CHAIN_ID, { staticNetwork: true });

  // 1. Check chain ID
  console.log('[1] Chain ID');
  try {
    const network = await provider.getNetwork();
    const cid = Number(network.chainId);
    if (cid === CHAIN_ID) ok(`chainId = ${cid}`);
    else fail(`chainId = ${cid}, expected ${CHAIN_ID}`);
  } catch (e) { fail(e.message); }

  // 2. Check block height (RPC liveness)
  console.log('\n[2] RPC liveness');
  try {
    const block = await provider.getBlockNumber();
    ok(`latest block = ${block}`);
  } catch (e) { fail(e.message); }

  // 3. Bytecode check for every contract
  console.log('\n[3] Contract bytecode');
  const addresses = {};
  for (const [name, { env }] of Object.entries(CONTRACTS)) {
    const raw = process.env[env];
    if (!raw) { fail(`${env} not set`); continue; }
    let addr;
    try { addr = getAddress(raw.toLowerCase()); } catch { fail(`${env} = "${raw}" is not a valid address`); continue; }
    addresses[name] = addr;
    try {
      const code = await provider.getCode(addr);
      if (code === '0x') fail(`${name} (${addr}) has NO bytecode — wrong chain or address?`);
      else ok(`${name} (${addr}) has bytecode (${Math.floor(code.length / 2)} bytes)`);
    } catch (e) { fail(`${name}: ${e.message}`); }
  }

  // 4. Static call: predict(owner, salt)
  console.log('\n[4] predict() static call');
  const factoryAddr = addresses['ACCOUNT_FACTORY'];
  if (factoryAddr) {
    const testOwner = '0x000000000000000000000000000000000000dead';
    const testSalt  = '0x' + '00'.repeat(32);
    try {
      const factory = new Contract(factoryAddr, ['function predict(address owner,bytes32 salt) view returns (address)'], provider);
      const predicted = await factory.predict(testOwner, testSalt);
      ok(`predict(dead, 0x00…) = ${predicted}`);
    } catch (e) { fail(`predict() failed: ${e.message}`); }
  }

  // 5. nextTokenId() on AgentIdentity
  console.log('\n[5] nextTokenId() static call');
  const identityAddr = addresses['AGENT_IDENTITY'];
  if (identityAddr) {
    try {
      const identity = new Contract(identityAddr, ['function nextTokenId() view returns (uint256)'], provider);
      const nextId = await identity.nextTokenId();
      ok(`nextTokenId() = ${nextId}`);
    } catch (e) { fail(`nextTokenId() failed: ${e.message}`); }
  }

  // 6. Signer balance
  console.log('\n[6] Signer balance');
  const key = process.env.EDGE_SERVICE_PRIVATE_KEY;
  if (key) {
    try {
      const wallet = new Wallet(key, provider);
      const bal = await provider.getBalance(wallet.address);
      const eth = Number(bal) / 1e18;
      if (eth < 0.001) fail(`Signer ${wallet.address} balance = ${eth.toFixed(6)} 0G (too low for gas!)`);
      else ok(`Signer ${wallet.address} balance = ${eth.toFixed(6)} 0G`);
    } catch (e) { fail(e.message); }
  } else {
    console.log('  (skipped — EDGE_SERVICE_PRIVATE_KEY not set)');
  }

  console.log('\n' + '═'.repeat(40));
  if (pass) console.log('ALL CHECKS PASSED — deploy path looks healthy.');
  else { console.log('SOME CHECKS FAILED — see ✗ lines above.'); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
