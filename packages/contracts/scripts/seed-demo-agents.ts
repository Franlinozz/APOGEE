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

const TESTNET = process.argv.includes('--testnet') || process.env['TESTNET'] === 'true';
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
    // predict() uses nextAgentId which changes on each deployment, so check
    // usedSalts first and recover address from event log on re-runs.
    let predicted: string;
    const saltUsed: boolean = await af.usedSalts(salt);
    if (saltUsed) {
      const filter = af.filters.AgentAccountCreated(deployer.address, undefined, salt);
      const logs = await af.queryFilter(filter);
      if (!logs[0]) throw new Error(`Salt already used for ${agent.slug} but no AgentAccountCreated event found`);
      predicted = logs[0].args.account;
      console.log(`  ↩ AgentAccount already deployed at ${predicted}`);
    } else {
      predicted = await af.predict(deployer.address, salt);
      const createTx = await af.createAccount(deployer.address, salt);
      await createTx.wait(2);
      console.log(`  ✓ AgentAccount: ${predicted}`);
    }

    // Mint iNFT to deployer (operator wallet); controller = AgentAccount.
    // AgentAccount doesn't implement IERC721Receiver so _safeMint to it reverts.
    const metadataRoot = ethers.id(`apogee-demo-${agent.slug}-meta`);
    const publicKey = ethers.id(`apogee-demo-${agent.slug}-pubkey`);
    // Check if already minted by querying Transfer events from this deployer
    const transferFilter = identity.filters.Transfer(ethers.ZeroAddress, deployer.address);
    const transferLogs = await identity.queryFilter(transferFilter);
    const alreadyMintedId = await (async () => {
      for (const log of transferLogs) {
        const tokenId = log.args.tokenId as bigint;
        const meta = await identity.agentMeta(tokenId);
        if (meta.metadataRoot === metadataRoot) return tokenId;
      }
      return null;
    })();
    let tokenId: string;
    if (alreadyMintedId !== null) {
      tokenId = alreadyMintedId.toString();
      console.log(`  ↩ iNFT #${tokenId} already minted`);
    } else {
      const nextId = await identity.nextTokenId();
      const mintTx = await identity.mint(deployer.address, metadataRoot, publicKey, predicted);
      await mintTx.wait(2);
      tokenId = nextId.toString();
      console.log(`  ✓ iNFT #${tokenId} → owner=${deployer.address.slice(0,10)}… controller=${predicted.slice(0,10)}…`);
    }

    // Fund the agent account (skip if already has balance)
    const agentBal = await ethers.provider.getBalance(predicted);
    if (agentBal < FUND_AMOUNT / 2n) {
      const fundTx = await deployer.sendTransaction({ to: predicted, value: FUND_AMOUNT });
      await fundTx.wait(2);
      console.log(`  ✓ Funded ${ethers.formatEther(FUND_AMOUNT)} 0G`);
    } else {
      console.log(`  ↩ Already funded (${ethers.formatEther(agentBal)} 0G)`);
    }

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
  // ServiceRegistry.register requires: (agentId, name, endpoint, pricePerCall, schemaHash, tags[])
  // Must call setAgentOwner first so caller passes _requireAgentOwner.

  const vesper = seeded['vesper']!;
  const vesperAgentId = BigInt(vesper.tokenId);
  const setOwnerTx = await registry.setAgentOwner(vesperAgentId, deployer.address);
  await setOwnerTx.wait(2);
  const schemaHash = ethers.id('vesper.media.schema.v1');
  const registerServiceTx = await registry.register(
    vesperAgentId,
    'vesper.media',
    'https://apogee.ai/agents/vesper',
    ethers.parseEther('0.001'),
    schemaHash,
    ['image', 'nft', 'storage'],
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
