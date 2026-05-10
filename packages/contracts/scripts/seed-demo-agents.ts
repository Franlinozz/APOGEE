/**
 * Seed Aurora, Vesper, and Helix demo agents on a live network.
 *
 * Usage:
 *   pnpm -F @apogee/contracts seed:demo-agents             # uses aristotle.json
 *   pnpm -F @apogee/contracts seed:demo-agents --testnet   # uses galileo.json
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ethers, network } from 'hardhat';

const TESTNET = process.argv.includes('--testnet');
const NETWORK_FILE = TESTNET ? 'galileo' : 'aristotle';
const FUND_AMOUNT = ethers.parseEther('0.05');
const SELF_BILL_WEI = ethers.parseEther('0.0005');
const PAY_AURORA_WEI = ethers.parseEther('0.0002');

type DeploymentRecord = { name: string; address: string };

type AgentSeed = {
  name: string;
  slug: string;
  skills: string[];
  description: string;
};

const AGENTS: AgentSeed[] = [
  {
    name: 'Aurora',
    slug: 'aurora',
    description: 'News analysis and market intelligence agent',
    skills: ['web.search', 'news.aggregate', 'summarize.long', 'chat.embed', 'memory.write', 'chain.send'],
  },
  {
    name: 'Vesper',
    slug: 'vesper',
    description: 'Creative media generation agent (registered service)',
    skills: ['memory.search', 'image.generate', 'storage.upload', 'nft.mint', 'chain.send'],
  },
  {
    name: 'Helix',
    slug: 'helix',
    description: 'On-chain analytics and reporting agent',
    skills: ['chain.query', 'chat.completion', 'memory.write', 'chain.send'],
  },
];

async function loadDeployments(): Promise<Record<string, string>> {
  const raw = await readFile(join(process.cwd(), 'deployments', `${NETWORK_FILE}.json`), 'utf8');
  const records = JSON.parse(raw) as DeploymentRecord[];
  return Object.fromEntries(records.map(r => [r.name, r.address]));
}

async function main() {
  const expectedChain = TESTNET ? 16602 : 16661;
  if (network.config.chainId !== expectedChain) {
    throw new Error(`Expected chainId ${expectedChain} but connected to ${network.config.chainId ?? 'unknown'}.`);
  }

  const addrs = await loadDeployments();
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error('No signer. Set DEPLOYER_PRIVATE_KEY.');

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`\nDeployer: ${deployer.address} (${ethers.formatEther(balance)} 0G)\n`);

  const af = await ethers.getContractAt('AccountFactory', addrs['AccountFactory'] ?? '');
  const identity = await ethers.getContractAt('AgentIdentity', addrs['AgentIdentity'] ?? '');
  const policy = await ethers.getContractAt('PolicyEngine', addrs['PolicyEngine'] ?? '');
  const registry = await ethers.getContractAt('ServiceRegistry', addrs['ServiceRegistry'] ?? '');

  const seeded: Record<string, { address: string; tokenId: string; policyId: string }> = {};
  const allAddresses: string[] = [];

  // ── Phase 1: Deploy AgentAccounts + mint iNFTs ──────────────────────────

  for (const agent of AGENTS) {
    console.log(`Seeding ${agent.name}…`);

    const salt = ethers.id(`apogee-demo-${agent.slug}`);
    const predicted = await af.predict(deployer.address, salt);

    const existing = await ethers.provider.getCode(predicted);
    if (existing !== '0x') {
      console.log(`  ↩ AgentAccount already deployed at ${predicted}`);
    } else {
      const createTx = await af.createAccount(deployer.address, salt);
      await createTx.wait(2);
      console.log(`  ✓ AgentAccount: ${predicted}`);
    }

    // Mint iNFT
    const nextId = await identity.nextTokenId();
    const metadataRoot = ethers.id(`apogee-demo-${agent.slug}-meta`);
    const publicKey = ethers.id(`apogee-demo-${agent.slug}-pubkey`);
    const mintTx = await identity.mint(predicted, metadataRoot, publicKey, deployer.address);
    await mintTx.wait(2);
    const tokenId = nextId.toString();
    console.log(`  ✓ iNFT #${tokenId}`);

    // Fund the agent account
    const fundTx = await deployer.sendTransaction({ to: predicted, value: FUND_AMOUNT });
    await fundTx.wait(2);
    console.log(`  ✓ Funded ${ethers.formatEther(FUND_AMOUNT)} 0G`);

    allAddresses.push(predicted);
    seeded[agent.slug] = { address: predicted, tokenId, policyId: '' };
  }

  // ── Phase 2: Register policies (allowlist = all trio addresses + core contracts) ──

  const coreContracts = [
    addrs['PaymentRouter'] ?? '',
    addrs['ReceiptBook'] ?? '',
    addrs['AgentIdentity'] ?? '',
    addrs['ServiceRegistry'] ?? '',
  ];

  for (const agent of AGENTS) {
    const allowlist = [...allAddresses, ...coreContracts].filter(Boolean);
    const allowlistRoot = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(['address[]'], [allowlist])
    );

    const registerTx = await policy.registerPolicy({
      maxPerTx:           ethers.parseEther('0.001'),
      maxPerDayWei:       ethers.parseEther('0.05'),
      allowlistRoot,
      denylistRoot:       ethers.ZeroHash,
      allowedSelectors:   ['0x00000000'],
      windowStart:        0,
      windowEnd:          0,
      multiSigThresholdWei: 0,
      active:             true,
    });
    const receipt = await registerTx.wait(2);
    // Extract policyId from event logs (PolicyRegistered event)
    const iface = policy.interface;
    const policyId = (() => {
      for (const log of receipt?.logs ?? []) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === 'PolicyRegistered') return String(parsed.args[0] as bigint);
        } catch {}
      }
      return '0';
    })();

    seeded[agent.slug]!.policyId = policyId;
    console.log(`  ✓ ${agent.name} policy #${policyId} registered`);
  }

  // ── Phase 3: Register Vesper as a paid service ───────────────────────────

  const vesper = seeded['vesper']!;
  const registerServiceTx = await registry.register(
    vesper.address,
    'vesper.media',
    ['image', 'nft', 'storage'],
    ethers.parseEther('0.001'),
    'AI-generated media, image synthesis, and NFT minting service.'
  );
  await registerServiceTx.wait(2);
  console.log(`\n  ✓ Vesper registered in ServiceRegistry as 'vesper.media'\n`);

  // ── Write seed manifest ────────────────────────────────────────────────────

  const manifest = {
    network: NETWORK_FILE,
    chainId: expectedChain,
    seededAt: new Date().toISOString(),
    agents: Object.fromEntries(
      AGENTS.map(a => [a.slug, {
        ...seeded[a.slug],
        name: a.name,
        skills: a.skills,
        description: a.description,
      }])
    ),
  };

  const outPath = join(process.cwd(), 'deployments', `demo-agents-${NETWORK_FILE}.json`);
  await mkdir(join(process.cwd(), 'deployments'), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${outPath}\n`);
  console.log(JSON.stringify(manifest, null, 2));

  console.log('\n=== Demo agents seeded ===');
  console.log('IMPORTANT: Set HEARTBEATS_PAUSED=false after manual smoke-test, then run: pnpm runtime:start');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
