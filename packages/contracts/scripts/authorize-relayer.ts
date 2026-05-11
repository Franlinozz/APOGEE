/**
 * Authorizes the EDGE service account as a relayer on the ReceiptBook contract.
 * Run with the deployer (contract owner) key:
 *
 *   DEPLOYER_PRIVATE_KEY=<owner_key> \
 *   RECEIPT_BOOK_ADDRESS=0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53 \
 *   RELAYER_ADDRESS=0x78e36E804520FcCB090EED4Ba89b73Ead17F9483 \
 *   pnpm -F @apogee/contracts exec hardhat run scripts/authorize-relayer.ts --network aristotle
 */

import { ethers } from 'hardhat';

async function main() {
  const receiptBookAddress = process.env['RECEIPT_BOOK_ADDRESS'];
  const relayerAddress = process.env['RELAYER_ADDRESS'];

  if (!receiptBookAddress) throw new Error('RECEIPT_BOOK_ADDRESS env var required');
  if (!relayerAddress) throw new Error('RELAYER_ADDRESS env var required');

  const [signer] = await ethers.getSigners();
  if (!signer) throw new Error('DEPLOYER_PRIVATE_KEY required');

  console.log(`Signer: ${signer.address}`);
  console.log(`ReceiptBook: ${receiptBookAddress}`);
  console.log(`Relayer to authorize: ${relayerAddress}`);

  const rb = await ethers.getContractAt('ReceiptBook', receiptBookAddress, signer);

  const owner = await rb.owner();
  console.log(`Contract owner: ${owner}`);
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`Signer ${signer.address} is not the contract owner ${owner}`);
  }

  const alreadyAuthorized = await rb.authorisedRelayers(relayerAddress);
  if (alreadyAuthorized) {
    console.log('Relayer is already authorized — nothing to do.');
    return;
  }

  const tx = await rb.authoriseRelayer(relayerAddress);
  console.log(`tx sent: ${tx.hash}`);
  await tx.wait(2);
  console.log('✓ Relayer authorized successfully');

  const confirmed = await rb.authorisedRelayers(relayerAddress);
  console.log(`Confirmed: authorisedRelayers[${relayerAddress}] = ${confirmed}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
