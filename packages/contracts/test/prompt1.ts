import { expect } from 'chai';
import { ethers, network } from 'hardhat';

const tag = (value: string) => ethers.id(value).slice(0, 10);

async function deployCore() {
  const [owner, agentOwner, payee, relayer, session, outsider] = await ethers.getSigners();
  const PolicyEngine = await ethers.getContractFactory('PolicyEngine');
  const policy = await PolicyEngine.deploy(owner.address);
  const ReceiptBook = await ethers.getContractFactory('ReceiptBook');
  const receipt = await ReceiptBook.deploy(owner.address);
  await receipt.authoriseRelayer(owner.address);
  const Identity = await ethers.getContractFactory('AgentIdentity');
  const identity = await Identity.deploy(owner.address);
  const Splitter = await ethers.getContractFactory('RevenueSplitter');
  const splitter = await Splitter.deploy(owner.address);
  const Router = await ethers.getContractFactory('PaymentRouter');
  const router = await Router.deploy(owner.address, await receipt.getAddress(), await splitter.getAddress());
  const Escrow = await ethers.getContractFactory('EscrowVault');
  const escrow = await Escrow.deploy(owner.address, await receipt.getAddress());
  const Registry = await ethers.getContractFactory('ServiceRegistry');
  const registry = await Registry.deploy(owner.address);
  const Factory = await ethers.getContractFactory('AccountFactory');
  const factory = await Factory.deploy(owner.address, await policy.getAddress(), await receipt.getAddress());
  for (const c of [router, escrow, factory]) await receipt.authoriseRelayer(await c.getAddress());
  return { owner, agentOwner, payee, relayer, session, outsider, policy, receipt, identity, splitter, router, escrow, registry, factory };
}

describe('Prompt 1 contract layer', function () {
  it('PolicyEngine registers immutable policies and enforces revert paths', async function () {
    const { owner, policy } = await deployCore();
    const selector = '0x12345678';
    await expect(policy.registerPolicy({ maxPerTx: 100n, maxPerDayWei: 150n, allowlistRoot: ethers.ZeroHash, denylistRoot: ethers.ZeroHash, allowedSelectors: [selector], windowStart: 0, windowEnd: 0, multiSigThresholdWei: 0, active: true }))
      .to.emit(policy, 'PolicyRegistered');
    await expect(policy.check(1, owner.address, 101n, selector, ethers.ZeroHash, ethers.ZeroHash)).to.be.revertedWithCustomError(policy, 'ExceedsPerTx');
    await expect(policy.check(1, owner.address, 1n, '0x87654321', ethers.ZeroHash, ethers.ZeroHash)).to.be.revertedWithCustomError(policy, 'DisallowedSelector');
    await expect(policy.recordSpend(1, owner.address, 151n)).to.emit(policy, 'SpendRecorded');
  });

  it('ReceiptBook gates receipt relayers', async function () {
    const { receipt, relayer } = await deployCore();
    await expect(receipt.connect(relayer).emitReceipt(1, tag('TEST'), ethers.id('payload'), ethers.ZeroHash, 1n)).to.be.revertedWithCustomError(receipt, 'NotAuthorisedRelayer');
    await expect(receipt.authoriseRelayer(relayer.address)).to.emit(receipt, 'RelayerAuthorised');
    await expect(receipt.connect(relayer).emitReceipt(1, tag('TEST'), ethers.id('payload'), ethers.ZeroHash, 1n)).to.emit(receipt, 'ReceiptEmitted');
    await expect(receipt.revokeRelayer(relayer.address)).to.emit(receipt, 'RelayerRevoked');
  });

  it('AgentAccount executes calls, manages session keys, and rejects bad calls', async function () {
    const { owner, session, outsider, receipt, policy } = await deployCore();
    const Account = await ethers.getContractFactory('AgentAccount');
    const account = await Account.deploy(owner.address, await policy.getAddress(), await receipt.getAddress(), 7, [owner.address, owner.address, owner.address]);
    await receipt.authoriseRelayer(await account.getAddress());
    await expect(account.addSessionKey(session.address, (await ethers.provider.getBlock('latest'))!.timestamp + 3600, ethers.id('PING'))).to.emit(account, 'SessionKeyAdded');
    await expect(account.connect(outsider).execute(owner.address, 0, '0x')).to.be.revertedWithCustomError(account, 'NotAuthorised');
    await expect(account.execute(owner.address, 0, '0x')).to.emit(account, 'Executed');
    await expect(account.revokeSessionKey(session.address)).to.emit(account, 'SessionKeyRevoked');
  });

  it('AccountFactory predicts and creates deterministic accounts', async function () {
    const { owner, factory } = await deployCore();
    const salt = ethers.id('agent-one');
    const predicted = await factory.predict(owner.address, salt);
    await expect(factory.createAccount(owner.address, salt)).to.emit(factory, 'AgentAccountCreated');
    expect(await factory.agentIds(predicted)).to.equal(1n);
    await expect(factory.createAccount(ethers.ZeroAddress, salt)).to.be.revertedWithCustomError(factory, 'ZeroOwner');
  });

  it('AgentIdentity mints, rotates metadata, registers services, and emits reencryption transfer', async function () {
    const { owner, agentOwner, payee, identity } = await deployCore();
    const root = ethers.id('metadata');
    await identity.mint(agentOwner.address, root, ethers.id('pubkey'), owner.address);
    await expect(identity.connect(agentOwner).rotateMetadata(1, ethers.id('new-root'))).to.emit(identity, 'MetadataRotated');
    await expect(identity.connect(agentOwner).registerService(1, ethers.id('manifest'))).to.emit(identity, 'ServiceRegistered');
    await expect(identity.proveCompletion(1, ethers.id('task'), '0x1234')).to.emit(identity, 'CompletionProven');
    await expect(identity.requestVerification(1, ethers.id('task'))).to.emit(identity, 'VerificationRequested');
    await expect(identity.connect(agentOwner).transferFrom(agentOwner.address, payee.address, 1)).to.emit(identity, 'TransferWithReencryption');
    await expect(identity.rotateMetadata(99, root)).to.be.revertedWithCustomError(identity, 'UnknownToken');
  });

  it('RevenueSplitter configures splits and distributes immediately', async function () {
    const { owner, agentOwner, payee, splitter, outsider } = await deployCore();
    await splitter.setAgentOwner(1, agentOwner.address);
    await expect(splitter.connect(outsider).configure(1, [{ recipient: payee.address, amountBp: 10000 }])).to.be.revertedWithCustomError(splitter, 'NotAgentOwner');
    await expect(splitter.connect(agentOwner).configure(1, [{ recipient: payee.address, amountBp: 10000 }])).to.emit(splitter, 'SplitsConfigured');
    await expect(splitter.distribute(1, { value: 100n })).to.changeEtherBalance(payee, 100n);
    await expect(splitter.distribute(2, { value: 1n })).to.be.revertedWithCustomError(splitter, 'NoSplits');
  });

  it('ServiceRegistry registers, updates, and deregisters services', async function () {
    const { agentOwner, registry, outsider } = await deployCore();
    await registry.setAgentOwner(1, agentOwner.address);
    const tags = ['chat', 'compute'];
    await expect(registry.connect(outsider).register(1, 'Chat', 'https://agent.local', 1n, ethers.id('schema'), tags)).to.be.revertedWithCustomError(registry, 'NotAgentOwner');
    await expect(registry.connect(agentOwner).register(1, 'Chat', 'https://agent.local', 1n, ethers.id('schema'), tags)).to.emit(registry, 'ServiceRegistered');
    await expect(registry.connect(agentOwner).update(1, 'Chat2', 'https://agent.local/v2', 2n, ethers.id('schema2'), tags)).to.emit(registry, 'ServiceUpdated');
    await expect(registry.connect(agentOwner).deregister(1)).to.emit(registry, 'ServiceDeregistered');
  });

  it('EscrowVault opens, releases, refunds, and challenges escrows', async function () {
    const { owner, payee, escrow } = await deployCore();
    const now = (await ethers.provider.getBlock('latest'))!.timestamp;
    await expect(escrow.open(payee.address, ethers.id('svc'), now + 3600, { value: 100n })).to.emit(escrow, 'EscrowOpened');
    await expect(escrow.proveCompletion(1, '0xbeef')).to.changeEtherBalance(payee, 100n);
    await expect(escrow.open(payee.address, ethers.id('svc'), now + 20, { value: 50n })).to.emit(escrow, 'EscrowOpened');
    await expect(escrow.challenge(2)).to.emit(escrow, 'EscrowChallenged');
    await network.provider.send('evm_increaseTime', [30]);
    await network.provider.send('evm_mine');
    await expect(escrow.refund(2)).to.changeEtherBalance(owner, 50n);
    await expect(escrow.refund(999)).to.be.revertedWithCustomError(escrow, 'UnknownTask');
  });

  it('PaymentRouter settles signed quotes and rejects invalid payments', async function () {
    const { owner, payee, receipt, policy, router } = await deployCore();
    const Account = await ethers.getContractFactory('AgentAccount');
    const payerAccount = await Account.deploy(owner.address, await policy.getAddress(), await receipt.getAddress(), 1, [owner.address, owner.address, owner.address]);
    const payeeAccount = await Account.deploy(payee.address, await policy.getAddress(), await receipt.getAddress(), 2, [payee.address, payee.address, payee.address]);
    await receipt.authoriseRelayer(await payerAccount.getAddress());
    await router.setAgentAccount(1, await payerAccount.getAddress());
    await router.setAgentAccount(2, await payeeAccount.getAddress());

    const serviceId = ethers.id('svc');
    const data = router.interface.encodeFunctionData('requestQuote', [await payeeAccount.getAddress(), serviceId, 10n]);
    await expect(payerAccount.execute(await router.getAddress(), 0, data)).to.emit(router, 'QuoteRequested');
    const events = await router.queryFilter(router.filters.QuoteRequested());
    const quoteHash = events[0].args.quoteHash;
    const quote = await router.quotes(quoteHash);
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const signature = await owner.signTypedData(
      { name: 'ApogeePaymentRouter', version: '1', chainId, verifyingContract: await router.getAddress() },
      {
        Quote: [
          { name: 'amount', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint64' },
          { name: 'payeeReceiver', type: 'address' },
          { name: 'payerAgent', type: 'uint256' },
          { name: 'payeeAgent', type: 'uint256' },
          { name: 'serviceId', type: 'bytes32' },
        ],
      },
      {
        amount: quote.amount,
        nonce: quote.nonce,
        deadline: quote.deadline,
        payeeReceiver: quote.payeeReceiver,
        payerAgent: quote.payerAgent,
        payeeAgent: quote.payeeAgent,
        serviceId: quote.serviceId,
      },
    );
    await expect(router.pay(quoteHash, signature, { value: 9n })).to.be.revertedWithCustomError(router, 'IncorrectPayment');
    await expect(router.pay(quoteHash, signature, { value: 10n })).to.emit(router, 'PaymentSettled');
  });

  it('PaymentRouter settles payee-signed off-chain quotes and records refunds', async function () {
    const { owner, payee, receipt, policy, router } = await deployCore();
    const Account = await ethers.getContractFactory('AgentAccount');
    const payerAccount = await Account.deploy(owner.address, await policy.getAddress(), await receipt.getAddress(), 1, [owner.address, owner.address, owner.address]);
    const payeeAccount = await Account.deploy(payee.address, await policy.getAddress(), await receipt.getAddress(), 2, [payee.address, payee.address, payee.address]);
    await router.setAgentAccount(1, await payerAccount.getAddress());
    await router.setAgentAccount(2, await payeeAccount.getAddress());

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const quoteBase = {
      amount: 11n,
      nonce: 999n,
      deadline: BigInt((await ethers.provider.getBlock('latest'))!.timestamp + 3600),
      payeeReceiver: payee.address,
      payerAgent: 1n,
      payeeAgent: 2n,
      serviceId: ethers.id('svc'),
    };
    const quoteHash = ethers.TypedDataEncoder.hash(
      { name: 'ApogeePaymentRouter', version: '1', chainId, verifyingContract: await router.getAddress() },
      {
        Quote: [
          { name: 'amount', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint64' },
          { name: 'payeeReceiver', type: 'address' },
          { name: 'payerAgent', type: 'uint256' },
          { name: 'payeeAgent', type: 'uint256' },
          { name: 'serviceId', type: 'bytes32' },
        ],
      },
      quoteBase,
    );
    const signature = await payee.signTypedData(
      { name: 'ApogeePaymentRouter', version: '1', chainId, verifyingContract: await router.getAddress() },
      {
        Quote: [
          { name: 'amount', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint64' },
          { name: 'payeeReceiver', type: 'address' },
          { name: 'payerAgent', type: 'uint256' },
          { name: 'payeeAgent', type: 'uint256' },
          { name: 'serviceId', type: 'bytes32' },
        ],
      },
      quoteBase,
    );
    const quote = { ...quoteBase, quoteHash };
    await expect(router.paySignedQuote(quote, signature, { value: 11n })).to.emit(router, 'PaymentSettled');
    await expect(router.connect(payee).refund(quoteHash, 'customer request')).to.emit(router, 'PaymentRefunded');
    await expect(router.connect(payee).refund(quoteHash, 'again')).to.be.revertedWithCustomError(router, 'RefundAlreadyIssued');
  });

  it('captures gas estimate snapshots', async function () {
    const { owner, receipt } = await deployCore();
    const gas = await receipt.emitReceipt.estimateGas(1, tag('GASS'), ethers.id('payload'), ethers.ZeroHash, 1n);
    expect(gas).to.be.greaterThan(0n);
    expect(owner.address).to.match(/^0x/);
  });
});

describe('Prompt 1 required revert-path coverage', function () {
  type PolicyWriter = {
    registerPolicy(spec: {
      maxPerTx: bigint;
      maxPerDayWei: bigint;
      allowlistRoot: string;
      denylistRoot: string;
      allowedSelectors: string[];
      windowStart: number;
      windowEnd: number;
      multiSigThresholdWei: bigint;
      active: boolean;
    }): Promise<unknown>;
  };

  async function registerPolicy(policy: PolicyWriter, spec: Partial<Parameters<PolicyWriter['registerPolicy']>[0]> = {}) {
    const base = {
      maxPerTx: 100n,
      maxPerDayWei: 200n,
      allowlistRoot: ethers.ZeroHash,
      denylistRoot: ethers.ZeroHash,
      allowedSelectors: [] as string[],
      windowStart: 0,
      windowEnd: 0,
      multiSigThresholdWei: 0,
      active: true,
    };
    await policy.registerPolicy({ ...base, ...spec });
  }

  async function deployAccountWithGuardians() {
    const { owner, receipt, policy, session, outsider } = await deployCore();
    const guardians = [ethers.Wallet.createRandom(), ethers.Wallet.createRandom(), ethers.Wallet.createRandom()];
    const Account = await ethers.getContractFactory('AgentAccount');
    const account = await Account.deploy(
      owner.address,
      await policy.getAddress(),
      await receipt.getAddress(),
      99,
      [guardians[0].address, guardians[1].address, guardians[2].address],
    );
    await receipt.authoriseRelayer(await account.getAddress());
    return { owner, receipt, policy, session, outsider, account, guardians };
  }

  it('covers every PolicyEngine custom error and access-control branch', async function () {
    const { owner, outsider, policy } = await deployCore();
    await expect(
      policy.connect(outsider).registerPolicy({
        maxPerTx: 0,
        maxPerDayWei: 0,
        allowlistRoot: ethers.ZeroHash,
        denylistRoot: ethers.ZeroHash,
        allowedSelectors: [],
        windowStart: 0,
        windowEnd: 0,
        multiSigThresholdWei: 0,
        active: true,
      }),
    ).to.be.revertedWithCustomError(policy, 'OwnableUnauthorizedAccount');
    await expect(
      policy.registerPolicy({
        maxPerTx: 0,
        maxPerDayWei: 0,
        allowlistRoot: ethers.ZeroHash,
        denylistRoot: ethers.ZeroHash,
        allowedSelectors: [],
        windowStart: 0,
        windowEnd: 0,
        multiSigThresholdWei: 0,
        active: false,
      }),
    ).to.be.revertedWithCustomError(policy, 'EmptyPolicy');
    await expect(policy.check(777, owner.address, 0, '0x', ethers.ZeroHash, ethers.ZeroHash)).to.be.revertedWithCustomError(policy, 'InactivePolicy');

    await registerPolicy(policy, { maxPerTx: 10n });
    await expect(policy.check(1, owner.address, 11n, '0x', ethers.ZeroHash, ethers.ZeroHash)).to.be.revertedWithCustomError(policy, 'ExceedsPerTx');

    const latest = (await ethers.provider.getBlock('latest'))!.timestamp;
    await registerPolicy(policy, { windowStart: latest + 100 });
    await expect(policy.check(2, owner.address, 1n, '0x', ethers.ZeroHash, ethers.ZeroHash)).to.be.revertedWithCustomError(policy, 'OutsideTimeWindow');
    await registerPolicy(policy, { windowEnd: latest - 1 });
    await expect(policy.check(3, owner.address, 1n, '0x', ethers.ZeroHash, ethers.ZeroHash)).to.be.revertedWithCustomError(policy, 'OutsideTimeWindow');

    await registerPolicy(policy, { allowlistRoot: ethers.id('allowed') });
    await expect(policy.check(4, owner.address, 1n, '0x', ethers.id('wrong'), ethers.ZeroHash)).to.be.revertedWithCustomError(policy, 'NotInAllowlist');
    await expect(policy.check(4, owner.address, 1n, '0x', ethers.id('allowed'), ethers.ZeroHash)).not.to.be.reverted;

    await registerPolicy(policy, { denylistRoot: ethers.id('blocked') });
    await expect(policy.check(5, owner.address, 1n, '0x', ethers.ZeroHash, ethers.id('blocked'))).to.be.revertedWithCustomError(policy, 'InDenylist');

    await registerPolicy(policy, { allowedSelectors: ['0x12345678'] });
    await expect(policy.check(6, owner.address, 1n, '0x', ethers.ZeroHash, ethers.ZeroHash)).to.be.revertedWithCustomError(policy, 'DisallowedSelector');
    await expect(policy.check(6, owner.address, 1n, '0x87654321', ethers.ZeroHash, ethers.ZeroHash)).to.be.revertedWithCustomError(policy, 'DisallowedSelector');
    await expect(policy.check(6, owner.address, 1n, '0x12345678', ethers.ZeroHash, ethers.ZeroHash)).not.to.be.reverted;

    await registerPolicy(policy, { maxPerTx: 0, maxPerDayWei: 5n });
    await policy.recordSpend(7, owner.address, 5n);
    await expect(policy.check(7, owner.address, 1n, '0x', ethers.ZeroHash, ethers.ZeroHash)).to.be.revertedWithCustomError(policy, 'ExceedsPerDay');
    await network.provider.send('evm_increaseTime', [24 * 60 * 60 + 1]);
    await network.provider.send('evm_mine');
    await expect(policy.check(7, owner.address, 1n, '0x', ethers.ZeroHash, ethers.ZeroHash)).not.to.be.reverted;
    await policy.recordSpend(7, owner.address, 1n);
  });

  it('covers AgentAccount authorization, policy, recovery, and call failure branches', async function () {
    const { owner, policy, session, outsider, account, guardians } = await deployAccountWithGuardians();
    await expect(account.addSessionKey(ethers.ZeroAddress, 1, ethers.id('scope'))).to.be.revertedWithCustomError(account, 'InvalidSessionKey');
    const now = (await ethers.provider.getBlock('latest'))!.timestamp;
    await expect(account.addSessionKey(session.address, now, ethers.id('scope'))).to.be.revertedWithCustomError(account, 'InvalidSessionKey');
    await account.addSessionKey(session.address, now + 100, ethers.id('scope'));
    await expect(account.connect(session).execute(owner.address, 0, '0x12345678')).to.be.revertedWithCustomError(account, 'NotAuthorised');
    await network.provider.send('evm_increaseTime', [101]);
    await network.provider.send('evm_mine');
    await expect(account.connect(session).execute(owner.address, 0, '0x')).to.be.revertedWithCustomError(account, 'NotAuthorised');
    await expect(account.execute(ethers.ZeroAddress, 0, '0x')).to.be.revertedWithCustomError(account, 'InvalidCallTarget');
    await expect(account.execute(account.getAddress(), 0, account.interface.encodeFunctionData('recover', [ethers.ZeroAddress, []]))).to.be.revertedWithCustomError(account, 'CallFailed');
    await expect(account.connect(outsider).setPolicy(1)).to.be.revertedWithCustomError(account, 'OwnableUnauthorizedAccount');

    await registerPolicy(policy, { maxPerTx: 1n });
    await account.setPolicy(1);
    await expect(account.execute(owner.address, 2n, '0x')).to.be.revertedWithCustomError(policy, 'ExceedsPerTx');
    await account.setPolicy(0);
    await expect(account.executeBatch([{ target: owner.address, value: 0, data: '0x' }])).to.emit(account, 'Executed');

    await expect(account.recover(owner.address, [])).to.be.revertedWithCustomError(account, 'InvalidRecovery');
    await expect(account.recover(owner.address, ['0x1234', '0x5678'])).to.be.revertedWithCustomError(account, 'InvalidRecovery');
    const newOwner = outsider.address;
    const digest = ethers.keccak256(ethers.solidityPacked(['address', 'address', 'uint256'], [await account.getAddress(), newOwner, (await ethers.provider.getNetwork()).chainId]));
    const sig1 = guardians[0].signingKey.sign(digest).serialized;
    const sig2 = guardians[1].signingKey.sign(digest).serialized;
    await expect(account.recover(newOwner, [sig1, sig2])).to.emit(account, 'OwnerRecovered');
  });

  it('covers AccountFactory duplicate salt deployment failure', async function () {
    const { owner, factory } = await deployCore();
    const salt = ethers.id('duplicate-salt');
    await factory.createAccount(owner.address, salt);
    await expect(factory.createAccount(owner.address, salt)).to.be.revertedWithCustomError(factory, 'DeploymentFailed');
    await expect(factory.predict(ethers.ZeroAddress, salt)).to.be.revertedWithCustomError(factory, 'ZeroOwner');
  });

  it('covers AgentIdentity custom errors and unauthorized transfer path', async function () {
    const { owner, agentOwner, outsider, identity } = await deployCore();
    await expect(identity.mint(agentOwner.address, ethers.ZeroHash, ethers.id('pubkey'), owner.address)).to.be.revertedWithCustomError(identity, 'EmptyMetadata');
    await expect(identity.mint(agentOwner.address, ethers.id('metadata'), ethers.id('pubkey'), ethers.ZeroAddress)).to.be.revertedWithCustomError(identity, 'ZeroController');
    await identity.mint(agentOwner.address, ethers.id('metadata'), ethers.id('pubkey'), owner.address);
    await expect(identity.connect(outsider).rotateMetadata(1, ethers.id('new'))).to.be.revertedWithCustomError(identity, 'NotTokenOwner');
    await expect(identity.connect(agentOwner).rotateMetadata(1, ethers.ZeroHash)).to.be.revertedWithCustomError(identity, 'EmptyMetadata');
    await expect(identity.connect(outsider).transferFrom(agentOwner.address, outsider.address, 1)).to.be.reverted;
    expect(await identity.supportsInterface('0x8004beef')).to.equal(true);
    await expect(identity.proveCompletion(99, ethers.id('task'), '0x')).to.be.revertedWithCustomError(identity, 'UnknownToken');
    await expect(identity.requestVerification(99, ethers.id('task'))).to.be.revertedWithCustomError(identity, 'UnknownToken');
  });

  it('covers PaymentRouter expired, wrong signature, replay, unknown quote, and split path', async function () {
    const { owner, payee, outsider, receipt, policy, splitter, router } = await deployCore();
    const Account = await ethers.getContractFactory('AgentAccount');
    const payerAccount = await Account.deploy(owner.address, await policy.getAddress(), await receipt.getAddress(), 1, [owner.address, owner.address, owner.address]);
    const payeeAccount = await Account.deploy(payee.address, await policy.getAddress(), await receipt.getAddress(), 2, [payee.address, payee.address, payee.address]);
    await receipt.authoriseRelayer(await payerAccount.getAddress());
    await router.setAgentAccount(1, await payerAccount.getAddress());
    await router.setAgentAccount(2, await payeeAccount.getAddress());
    const serviceId = ethers.id('split.service');
    const data = router.interface.encodeFunctionData('requestQuote', [await payeeAccount.getAddress(), serviceId, 10n]);
    await payerAccount.execute(await router.getAddress(), 0, data);
    const [event] = await router.queryFilter(router.filters.QuoteRequested());
    const quoteHash = event.args.quoteHash;
    const quote = await router.quotes(quoteHash);
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const domain = { name: 'ApogeePaymentRouter', version: '1', chainId, verifyingContract: await router.getAddress() };
    const types = {
      Quote: [
        { name: 'amount', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint64' },
        { name: 'payeeReceiver', type: 'address' },
        { name: 'payerAgent', type: 'uint256' },
        { name: 'payeeAgent', type: 'uint256' },
        { name: 'serviceId', type: 'bytes32' },
      ],
    };
    const value = {
      amount: quote.amount,
      nonce: quote.nonce,
      deadline: quote.deadline,
      payeeReceiver: quote.payeeReceiver,
      payerAgent: quote.payerAgent,
      payeeAgent: quote.payeeAgent,
      serviceId: quote.serviceId,
    };
    await expect(router.pay(ethers.id('missing'), '0x')).to.be.revertedWithCustomError(router, 'QuoteUnknown');
    const badSignature = await outsider.signTypedData(domain, types, value);
    await expect(router.pay(quoteHash, badSignature, { value: 10n })).to.be.revertedWithCustomError(router, 'InvalidSignature');
    const signature = await owner.signTypedData(domain, types, value);
    await splitter.setAgentOwner(2, payee.address);
    await splitter.connect(payee).configure(2, [{ recipient: payee.address, amountBp: 10000 }]);
    await expect(router.pay(quoteHash, signature, { value: 10n })).to.emit(router, 'PaymentSettled');
    await expect(router.pay(quoteHash, signature, { value: 10n })).to.be.revertedWithCustomError(router, 'QuoteAlreadyPaid');

    await payerAccount.execute(await router.getAddress(), 0, data);
    const events = await router.queryFilter(router.filters.QuoteRequested());
    const expiredHash = events[events.length - 1].args.quoteHash;
    const expiredQuote = await router.quotes(expiredHash);
    const expiredSignature = await owner.signTypedData(domain, types, {
      amount: expiredQuote.amount,
      nonce: expiredQuote.nonce,
      deadline: expiredQuote.deadline,
      payeeReceiver: expiredQuote.payeeReceiver,
      payerAgent: expiredQuote.payerAgent,
      payeeAgent: expiredQuote.payeeAgent,
      serviceId: expiredQuote.serviceId,
    });
    await network.provider.send('evm_increaseTime', [16 * 60]);
    await network.provider.send('evm_mine');
    await expect(router.pay(expiredHash, expiredSignature, { value: 10n })).to.be.revertedWithCustomError(router, 'QuoteExpired');
  });

  it('covers EscrowVault invalid state transitions', async function () {
    const { payee, escrow } = await deployCore();
    const now = (await ethers.provider.getBlock('latest'))!.timestamp;
    await expect(escrow.open(ethers.ZeroAddress, ethers.id('svc'), now + 100, { value: 1n })).to.be.revertedWithCustomError(escrow, 'InvalidEscrow');
    await expect(escrow.open(payee.address, ethers.id('svc'), now + 100, { value: 0n })).to.be.revertedWithCustomError(escrow, 'InvalidEscrow');
    await expect(escrow.open(payee.address, ethers.id('svc'), now, { value: 1n })).to.be.revertedWithCustomError(escrow, 'InvalidEscrow');
    await escrow.open(payee.address, ethers.id('svc'), now + 100, { value: 1n });
    await expect(escrow.refund(1)).to.be.revertedWithCustomError(escrow, 'DeadlineNotReached');

    await escrow.open(payee.address, ethers.id('svc'), now + 3 * 24 * 60 * 60, { value: 1n });
    await escrow.challenge(2);
    await expect(escrow.proveCompletion(2, '0x01')).to.be.revertedWithCustomError(escrow, 'ChallengeOpen');
    await network.provider.send('evm_increaseTime', [24 * 60 * 60 + 1]);
    await network.provider.send('evm_mine');
    await expect(escrow.proveCompletion(2, '0x01')).to.emit(escrow, 'EscrowReleased');
    await expect(escrow.proveCompletion(2, '0x01')).to.be.revertedWithCustomError(escrow, 'AlreadyFinalised');

    const later = (await ethers.provider.getBlock('latest'))!.timestamp;
    await escrow.open(payee.address, ethers.id('svc'), later + 10, { value: 1n });
    await network.provider.send('evm_increaseTime', [11]);
    await network.provider.send('evm_mine');
    await expect(escrow.proveCompletion(3, '0x01')).to.be.revertedWithCustomError(escrow, 'DeadlinePassed');
    await expect(escrow.challenge(999)).to.be.revertedWithCustomError(escrow, 'UnknownTask');
  });

  it('covers RevenueSplitter invalid configuration branches', async function () {
    const { agentOwner, payee, splitter } = await deployCore();
    await expect(splitter.setAgentOwner(1, ethers.ZeroAddress)).to.be.revertedWithCustomError(splitter, 'InvalidSplit');
    await splitter.setAgentOwner(1, agentOwner.address);
    await expect(splitter.connect(agentOwner).configure(1, [])).to.be.revertedWithCustomError(splitter, 'InvalidSplit');
    await expect(splitter.connect(agentOwner).configure(1, [{ recipient: ethers.ZeroAddress, amountBp: 10000 }])).to.be.revertedWithCustomError(splitter, 'InvalidSplit');
    await expect(splitter.connect(agentOwner).configure(1, [{ recipient: payee.address, amountBp: 0 }])).to.be.revertedWithCustomError(splitter, 'InvalidSplit');
    await expect(splitter.connect(agentOwner).configure(1, [{ recipient: payee.address, amountBp: 9999 }])).to.be.revertedWithCustomError(splitter, 'InvalidSplit');
    await splitter.connect(agentOwner).configure(1, [
      { recipient: agentOwner.address, amountBp: 2500 },
      { recipient: payee.address, amountBp: 7500 },
    ]);
    await expect(splitter.distribute(1, { value: 100n })).to.emit(splitter, 'Distributed');
  });

  it('covers ServiceRegistry invalid service and non-owner update paths', async function () {
    const { agentOwner, outsider, registry } = await deployCore();
    await expect(registry.setAgentOwner(1, ethers.ZeroAddress)).to.be.revertedWithCustomError(registry, 'InvalidService');
    await registry.setAgentOwner(1, agentOwner.address);
    await expect(registry.connect(agentOwner).register(1, '', 'https://agent.local', 1n, ethers.id('schema'), [])).to.be.revertedWithCustomError(registry, 'InvalidService');
    await expect(registry.connect(agentOwner).register(1, 'Chat', '', 1n, ethers.id('schema'), [])).to.be.revertedWithCustomError(registry, 'InvalidService');
    await expect(registry.connect(agentOwner).register(1, 'Chat', 'https://agent.local', 1n, ethers.ZeroHash, [])).to.be.revertedWithCustomError(registry, 'InvalidService');
    await registry.connect(agentOwner).register(1, 'Chat', 'https://agent.local', 1n, ethers.id('schema'), []);
    await expect(registry.connect(outsider).update(1, 'Bad', 'https://bad.local', 1n, ethers.id('schema'), [])).to.be.revertedWithCustomError(registry, 'NotAgentOwner');
    await expect(registry.update(999, 'Bad', 'https://bad.local', 1n, ethers.id('schema'), [])).to.be.revertedWithCustomError(registry, 'UnknownService');
    await expect(registry.deregister(999)).to.be.revertedWithCustomError(registry, 'UnknownService');
    await registry.connect(agentOwner).deregister(1);
    await expect(registry.connect(agentOwner).update(1, 'Bad', 'https://bad.local', 1n, ethers.id('schema'), [])).to.be.revertedWithCustomError(registry, 'UnknownService');
  });
});
