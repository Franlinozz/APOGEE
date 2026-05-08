import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('ApogeeReceipts', function () {
  it('records and retrieves a receipt', async function () {
    const [agent, payer] = await ethers.getSigners();
    const contract = await ethers.deployContract('ApogeeReceipts');
    const actionHash = ethers.id('agent.skill.invoke');
    const storageRoot = ethers.ZeroHash;

    const tx = await contract.recordReceipt(agent.address, payer.address, actionHash, storageRoot, 100n);
    const receipt = await tx.wait();
    const event = receipt?.logs.map((log) => contract.interface.parseLog(log)).find((log) => log?.name === 'ReceiptRecorded');
    const receiptHash = event?.args.receiptHash;

    const stored = await contract.getReceipt(receiptHash);
    expect(stored.agent).to.equal(agent.address);
    expect(stored.amountWei).to.equal(100n);
  });

  it('rejects duplicate receipts', async function () {
    const [agent, payer] = await ethers.getSigners();
    const contract = await ethers.deployContract('ApogeeReceipts');
    const actionHash = ethers.id('duplicate');

    await contract.recordReceipt(agent.address, payer.address, actionHash, ethers.ZeroHash, 1n);
    await expect(contract.recordReceipt(agent.address, payer.address, actionHash, ethers.ZeroHash, 1n)).to.be.revertedWithCustomError(contract, 'DuplicateReceipt');
  });
});
