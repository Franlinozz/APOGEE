/**
 * Transfers ownership of AgentIdentity and PaymentRouter to the edge service signer.
 * Run with the deployer (current contract owner) key:
 *
 *   DEPLOYER_PRIVATE_KEY=<current_owner_key> \
 *   AGENT_IDENTITY_ADDRESS=0xC6060a0f261cc50B903E37fA7d1E923bfAf08ff3 \
 *   PAYMENT_ROUTER_ADDRESS=0xDafcdb130596cd0cD555F722c8a8547ccE2B4D0c \
 *   NEW_OWNER=0x78e36E804520FcCB090EED4Ba89b73Ead17F9483 \
 *   pnpm -F @apogee/contracts exec hardhat run scripts/transfer-deploy-ownership.ts --network aristotle
 *
 * This makes the edge signer the owner of both onlyOwner contracts so agent
 * provisioning works without a separate AGENT_DEPLOYER_PRIVATE_KEY in Railway.
 *
 * After this runs, verify on-chain:
 *   AgentIdentity.owner()  === NEW_OWNER
 *   PaymentRouter.owner()  === NEW_OWNER
 */

import { ethers } from 'hardhat';

const AGENT_IDENTITY_ABI = ['function owner() view returns (address)', 'function transferOwnership(address newOwner)'];
const PAYMENT_ROUTER_ABI = ['function owner() view returns (address)', 'function transferOwnership(address newOwner)'];

async function main() {
  const agentIdentityAddress = process.env['AGENT_IDENTITY_ADDRESS'];
  const paymentRouterAddress = process.env['PAYMENT_ROUTER_ADDRESS'];
  const newOwner             = process.env['NEW_OWNER'];

  if (!agentIdentityAddress) throw new Error('AGENT_IDENTITY_ADDRESS env var required');
  if (!paymentRouterAddress) throw new Error('PAYMENT_ROUTER_ADDRESS env var required');
  if (!newOwner)             throw new Error('NEW_OWNER env var required');

  const [signer] = await ethers.getSigners();
  if (!signer) throw new Error('DEPLOYER_PRIVATE_KEY required — set as DEPLOYER_PRIVATE_KEY env var');

  console.log(`Signer (current owner): ${signer.address}`);
  console.log(`AgentIdentity:          ${agentIdentityAddress}`);
  console.log(`PaymentRouter:          ${paymentRouterAddress}`);
  console.log(`New owner (edge signer): ${newOwner}`);
  console.log('');

  const identity = new ethers.Contract(agentIdentityAddress, AGENT_IDENTITY_ABI, signer);
  const router   = new ethers.Contract(paymentRouterAddress,  PAYMENT_ROUTER_ABI, signer);

  const [identityOwner, routerOwner] = await Promise.all([
    identity.owner() as Promise<string>,
    router.owner()   as Promise<string>,
  ]);

  console.log(`AgentIdentity.owner()  = ${identityOwner}`);
  console.log(`PaymentRouter.owner()  = ${routerOwner}`);
  console.log('');

  if (identityOwner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`Signer ${signer.address} is not AgentIdentity owner (${identityOwner})`);
  }
  if (routerOwner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`Signer ${signer.address} is not PaymentRouter owner (${routerOwner})`);
  }

  // AgentIdentity
  if (identityOwner.toLowerCase() === newOwner.toLowerCase()) {
    console.log('AgentIdentity ownership already transferred — skipping.');
  } else {
    const tx1 = await identity.transferOwnership(newOwner) as { hash: string; wait(n: number): Promise<unknown> };
    console.log(`AgentIdentity.transferOwnership tx: ${tx1.hash}`);
    await tx1.wait(2);
    const confirmed1 = await identity.owner() as string;
    if (confirmed1.toLowerCase() !== newOwner.toLowerCase()) throw new Error('AgentIdentity ownership transfer failed');
    console.log(`✓ AgentIdentity.owner() = ${confirmed1}`);
  }

  // PaymentRouter
  if (routerOwner.toLowerCase() === newOwner.toLowerCase()) {
    console.log('PaymentRouter ownership already transferred — skipping.');
  } else {
    const tx2 = await router.transferOwnership(newOwner) as { hash: string; wait(n: number): Promise<unknown> };
    console.log(`PaymentRouter.transferOwnership tx: ${tx2.hash}`);
    await tx2.wait(2);
    const confirmed2 = await router.owner() as string;
    if (confirmed2.toLowerCase() !== newOwner.toLowerCase()) throw new Error('PaymentRouter ownership transfer failed');
    console.log(`✓ PaymentRouter.owner() = ${confirmed2}`);
  }

  console.log('');
  console.log('Done. Edge signer is now the owner of both contracts.');
  console.log('Agent provisioning will work without AGENT_DEPLOYER_PRIVATE_KEY.');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
