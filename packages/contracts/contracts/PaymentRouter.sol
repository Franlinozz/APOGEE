// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ECDSA} from '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import {EIP712} from '@openzeppelin/contracts/utils/cryptography/EIP712.sol';
import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import {ReentrancyGuard} from '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import {IAgentAccount} from './interfaces/IAgentAccount.sol';
import {IReceiptBook} from './interfaces/IReceiptBook.sol';

interface IRevenueSplitter {
    function hasSplits(uint256 agentId) external view returns (bool);
    function distribute(uint256 agentId) external payable;
}

/// @title PaymentRouter
/// @notice EIP-712 quote settlement router for agent-to-agent payments.
contract PaymentRouter is EIP712, Ownable, ReentrancyGuard {
    struct Quote {
        uint256 amount;
        uint256 nonce;
        uint64 deadline;
        address payeeReceiver;
        bytes32 quoteHash;
        uint256 payerAgent;
        uint256 payeeAgent;
        bytes32 serviceId;
    }

    error QuoteExpired();
    error QuoteUnknown();
    error QuoteAlreadyPaid();
    error IncorrectPayment();
    error InvalidSignature();
    error TransferFailed();

    bytes32 public constant QUOTE_TYPEHASH = keccak256('Quote(uint256 amount,uint256 nonce,uint64 deadline,address payeeReceiver,uint256 payerAgent,uint256 payeeAgent,bytes32 serviceId)');

    IReceiptBook public immutable receiptBook;
    IRevenueSplitter public immutable revenueSplitter;
    uint256 public nextNonce = 1;
    mapping(bytes32 quoteHash => Quote quote) public quotes;
    mapping(bytes32 quoteHash => bool paid) public paidQuotes;
    mapping(uint256 agentId => address account) public agentAccounts;

    event AgentAccountSet(uint256 indexed agentId, address indexed account);
    event QuoteRequested(uint256 indexed payerAgent, uint256 indexed payeeAgent, bytes32 indexed quoteHash, uint256 amount);
    event PaymentSettled(uint256 indexed payerAgent, uint256 indexed payeeAgent, bytes32 indexed serviceId, uint256 amount, uint256 txReceiptId);

    constructor(address initialOwner, address receiptBook_, address revenueSplitter_) EIP712('ApogeePaymentRouter', '1') Ownable(initialOwner) {
        receiptBook = IReceiptBook(receiptBook_);
        revenueSplitter = IRevenueSplitter(revenueSplitter_);
    }

    function setAgentAccount(uint256 agentId, address account) external onlyOwner {
        agentAccounts[agentId] = account;
        emit AgentAccountSet(agentId, account);
    }

    function requestQuote(address payee, bytes32 serviceId, uint256 amount) external returns (Quote memory quote) {
        uint256 payerAgent = IAgentAccount(msg.sender).linkedAgentId();
        uint256 payeeAgent = IAgentAccount(payee).linkedAgentId();
        quote = Quote(amount, nextNonce++, uint64(block.timestamp + 15 minutes), payee, bytes32(0), payerAgent, payeeAgent, serviceId);
        quote.quoteHash = _hashTypedDataV4(keccak256(abi.encode(QUOTE_TYPEHASH, quote.amount, quote.nonce, quote.deadline, quote.payeeReceiver, quote.payerAgent, quote.payeeAgent, quote.serviceId)));
        quotes[quote.quoteHash] = quote;
        emit QuoteRequested(payerAgent, payeeAgent, quote.quoteHash, amount);
    }

    function pay(bytes32 quoteHash, bytes calldata signature) external payable nonReentrant {
        Quote memory quote = quotes[quoteHash];
        if (quote.quoteHash == bytes32(0)) revert QuoteUnknown();
        if (paidQuotes[quoteHash]) revert QuoteAlreadyPaid();
        if (quote.deadline < block.timestamp) revert QuoteExpired();
        if (msg.value != quote.amount) revert IncorrectPayment();

        address payerAccount = agentAccounts[quote.payerAgent];
        address signer = ECDSA.recover(quoteHash, signature);
        if (!IAgentAccount(payerAccount).isAuthorizedSigner(signer, quote.serviceId)) revert InvalidSignature();

        paidQuotes[quoteHash] = true;
        if (revenueSplitter.hasSplits(quote.payeeAgent)) {
            revenueSplitter.distribute{value: msg.value}(quote.payeeAgent);
        } else {
            (bool ok,) = quote.payeeReceiver.call{value: msg.value}('');
            if (!ok) revert TransferFailed();
        }
        uint256 receiptId = receiptBook.emitReceipt(quote.payerAgent, bytes4(keccak256('PAYM')), quoteHash, bytes32(0), msg.value);
        emit PaymentSettled(quote.payerAgent, quote.payeeAgent, quote.serviceId, msg.value, receiptId);
    }
}
