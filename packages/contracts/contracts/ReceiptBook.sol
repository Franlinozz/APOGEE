// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable2Step, Ownable} from '@openzeppelin/contracts/access/Ownable2Step.sol';

/// @title ReceiptBook
/// @notice Append-only audit log for billable and non-payment Apogee actions.
contract ReceiptBook is Ownable2Step {
    struct Receipt {
        uint256 receiptId;
        uint256 agentId;
        bytes4 actionTag;
        bytes32 payloadHash;
        bytes32 storageRoot;
        uint256 valueWei;
        uint64 timestamp;
    }

    error NotAuthorisedRelayer();
    error ZeroRelayer();

    uint256 public nextReceiptId = 1;
    mapping(uint256 receiptId => Receipt receipt) public receipts;
    mapping(address caller => bool authorised) public authorisedRelayers;

    event ReceiptEmitted(
        uint256 indexed receiptId,
        uint256 indexed agentId,
        bytes4 indexed actionTag,
        bytes32 payloadHash,
        bytes32 storageRoot,
        uint256 valueWei,
        uint64 timestamp
    );
    event RelayerAuthorised(address indexed relayer);
    event RelayerRevoked(address indexed relayer);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function authoriseRelayer(address relayer) external onlyOwner {
        if (relayer == address(0)) revert ZeroRelayer();
        authorisedRelayers[relayer] = true;
        emit RelayerAuthorised(relayer);
    }

    function revokeRelayer(address relayer) external onlyOwner {
        authorisedRelayers[relayer] = false;
        emit RelayerRevoked(relayer);
    }

    function emitReceipt(
        uint256 agentId,
        bytes4 actionTag,
        bytes32 payloadHash,
        bytes32 storageRoot,
        uint256 valueWei
    ) external returns (uint256 receiptId) {
        if (!authorisedRelayers[msg.sender]) revert NotAuthorisedRelayer();
        receiptId = nextReceiptId++;
        uint64 timestamp = uint64(block.timestamp);
        receipts[receiptId] = Receipt(receiptId, agentId, actionTag, payloadHash, storageRoot, valueWei, timestamp);
        emit ReceiptEmitted(receiptId, agentId, actionTag, payloadHash, storageRoot, valueWei, timestamp);
    }
}
