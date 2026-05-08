// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import {ReentrancyGuard} from '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import {IReceiptBook} from './interfaces/IReceiptBook.sol';

/// @title EscrowVault
/// @notice Holds task funds until completion proof, refund, or challenge.
contract EscrowVault is Ownable, ReentrancyGuard {
    struct Task {
        address payer;
        address payee;
        bytes32 serviceId;
        uint256 amount;
        uint64 deadline;
        bool released;
        bool refunded;
        bool challenged;
        uint64 challengeEndsAt;
    }

    error InvalidEscrow();
    error UnknownTask();
    error DeadlineNotReached();
    error DeadlinePassed();
    error AlreadyFinalised();
    error TransferFailed();
    error ChallengeOpen();

    IReceiptBook public immutable receiptBook;
    uint256 public nextTaskId = 1;
    mapping(uint256 taskId => Task task) public tasks;

    event EscrowOpened(uint256 indexed taskId, address indexed payer, address indexed payee, bytes32 serviceId, uint256 amount);
    event EscrowReleased(uint256 indexed taskId, address indexed payee, uint256 amount);
    event EscrowRefunded(uint256 indexed taskId, address indexed payer, uint256 amount);
    event EscrowChallenged(uint256 indexed taskId, uint64 challengeEndsAt);

    constructor(address initialOwner, address receiptBook_) Ownable(initialOwner) {
        receiptBook = IReceiptBook(receiptBook_);
    }

    function open(address payee, bytes32 serviceId, uint64 deadline) external payable returns (uint256 taskId) {
        if (payee == address(0) || msg.value == 0 || deadline <= block.timestamp) revert InvalidEscrow();
        taskId = nextTaskId++;
        tasks[taskId] = Task(msg.sender, payee, serviceId, msg.value, deadline, false, false, false, 0);
        emit EscrowOpened(taskId, msg.sender, payee, serviceId, msg.value);
    }

    function proveCompletion(uint256 taskId, bytes calldata proof) external nonReentrant {
        Task storage task = tasks[taskId];
        if (task.payer == address(0)) revert UnknownTask();
        if (task.released || task.refunded) revert AlreadyFinalised();
        if (task.deadline < block.timestamp) revert DeadlinePassed();
        if (task.challenged && block.timestamp < task.challengeEndsAt) revert ChallengeOpen();
        bytes32 proofHash = keccak256(proof);
        task.released = true;
        (bool ok,) = task.payee.call{value: task.amount}('');
        if (!ok) revert TransferFailed();
        receiptBook.emitReceipt(0, bytes4(keccak256('ESCR')), proofHash, bytes32(0), task.amount);
        emit EscrowReleased(taskId, task.payee, task.amount);
    }

    function refund(uint256 taskId) external nonReentrant {
        Task storage task = tasks[taskId];
        if (task.payer == address(0)) revert UnknownTask();
        if (task.released || task.refunded) revert AlreadyFinalised();
        if (block.timestamp <= task.deadline) revert DeadlineNotReached();
        task.refunded = true;
        (bool ok,) = task.payer.call{value: task.amount}('');
        if (!ok) revert TransferFailed();
        emit EscrowRefunded(taskId, task.payer, task.amount);
    }

    function challenge(uint256 taskId) external {
        Task storage task = tasks[taskId];
        if (task.payer == address(0)) revert UnknownTask();
        if (task.released || task.refunded) revert AlreadyFinalised();
        task.challenged = true;
        task.challengeEndsAt = uint64(block.timestamp + 24 hours);
        emit EscrowChallenged(taskId, task.challengeEndsAt);
    }
}
