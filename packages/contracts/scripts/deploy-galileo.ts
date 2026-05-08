import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ethers, network, run } from 'hardhat';
import { BaseContract, ContractTransactionReceipt } from 'ethers';

type DeploymentRecord = {
  name: string;
  address: string;
  txHash: string;
  blockNumber: number;
  verified: boolean;
};

async function waitReceipt(contract: BaseContract): Promise<ContractTransactionReceipt> {
  const deployment = contract.deploymentTransaction();
  if (!deployment) throw new Error(`Missing deployment transaction for ${await contract.getAddress()}`);
  const receipt = await deployment.wait(2);
  if (!receipt) throw new Error(`Missing receipt for ${deployment.hash}`);
  return receipt;
}

async function deploy(name: string, args: readonly unknown[]): Promise<{ contract: BaseContract; record: DeploymentRecord; args: readonly unknown[] }> {
  const factory = await ethers.getContractFactory(name);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  const receipt = await waitReceipt(contract);
  const address = await contract.getAddress();
  return {
    contract,
    args,
    record: { name, address, txHash: receipt.hash, blockNumber: receipt.blockNumber, verified: false },
  };
}

async function verify(record: DeploymentRecord, args: readonly unknown[]): Promise<DeploymentRecord> {
  try {
    await run('verify:verify', { address: record.address, constructorArguments: [...args] });
    return { ...record, verified: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('already verified')) return { ...record, verified: true };
    console.error(`Verification failed for ${record.name} at ${record.address}: ${message}`);
    return record;
  }
}

async function main() {
  if (network.config.chainId !== 16602) throw new Error('Prompt 1 deploy is Galileo-only. Refusing non-16602 network.');
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error('DEPLOYER_PRIVATE_KEY is required for Galileo deployment.');

  const records: DeploymentRecord[] = [];
  const deployed: Array<{ record: DeploymentRecord; args: readonly unknown[] }> = [];

  const policy = await deploy('PolicyEngine', [deployer.address]);
  records.push(policy.record); deployed.push(policy);
  const receiptBook = await deploy('ReceiptBook', [deployer.address]);
  records.push(receiptBook.record); deployed.push(receiptBook);
  const identity = await deploy('AgentIdentity', [deployer.address]);
  records.push(identity.record); deployed.push(identity);
  const registry = await deploy('ServiceRegistry', [deployer.address]);
  records.push(registry.record); deployed.push(registry);
  const splitter = await deploy('RevenueSplitter', [deployer.address]);
  records.push(splitter.record); deployed.push(splitter);
  const router = await deploy('PaymentRouter', [deployer.address, receiptBook.record.address, splitter.record.address]);
  records.push(router.record); deployed.push(router);
  const escrow = await deploy('EscrowVault', [deployer.address, receiptBook.record.address]);
  records.push(escrow.record); deployed.push(escrow);
  const factory = await deploy('AccountFactory', [deployer.address, policy.record.address, receiptBook.record.address]);
  records.push(factory.record); deployed.push(factory);

  const receipt = await ethers.getContractAt('ReceiptBook', receiptBook.record.address);
  for (const relayer of [identity.record.address, registry.record.address, router.record.address, escrow.record.address, factory.record.address]) {
    const tx = await receipt.authoriseRelayer(relayer);
    await tx.wait(2);
  }
  if (process.env.RECEIPT_RELAYER) {
    const tx = await receipt.authoriseRelayer(process.env.RECEIPT_RELAYER);
    await tx.wait(2);
  }

  const accountFactory = await ethers.getContractAt('AccountFactory', factory.record.address);
  const salt = ethers.id('apogee-genesis-agent');
  const predicted = await accountFactory.predict(deployer.address, salt);
  const createTx = await accountFactory.createAccount(deployer.address, salt);
  const createReceipt = await createTx.wait(2);
  if (!createReceipt) throw new Error('Missing AgentAccount creation receipt.');
  records.push({ name: 'AgentAccount', address: predicted, txHash: createReceipt.hash, blockNumber: createReceipt.blockNumber, verified: false });
  deployed.push({ record: records[records.length - 1], args: [deployer.address, policy.record.address, receiptBook.record.address, 1, [deployer.address, deployer.address, deployer.address]] });
  const authAccountTx = await receipt.authoriseRelayer(predicted);
  await authAccountTx.wait(2);

  for (const item of deployed) {
    const verified = await verify(item.record, item.args);
    const idx = records.findIndex((record) => record.name === verified.name && record.address === verified.address);
    if (idx >= 0) records[idx] = verified;
  }

  const out = join('deployments', 'galileo.json');
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(records, null, 2)}\n`);
  console.log(JSON.stringify(records, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
