// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title ApogeeReceipts
/// @notice Immutable receipt registry for billable autonomous-agent actions.
contract ApogeeReceipts {
    struct Receipt {
        address agent;
        address payer;
        bytes32 actionHash;
        bytes32 storageRoot;
        uint256 amountWei;
        uint64 createdAt;
    }

    mapping(bytes32 receiptHash => Receipt receipt) private receipts;

    event ReceiptRecorded(
        bytes32 indexed receiptHash,
        address indexed agent,
        address indexed payer,
        bytes32 actionHash,
        bytes32 storageRoot,
        uint256 amountWei
    );

    error InvalidAgent();
    error InvalidPayer();
    error InvalidAction();
    error DuplicateReceipt(bytes32 receiptHash);

    function recordReceipt(
        address agent,
        address payer,
        bytes32 actionHash,
        bytes32 storageRoot,
        uint256 amountWei
    ) external returns (bytes32 receiptHash) {
        if (agent == address(0)) revert InvalidAgent();
        if (payer == address(0)) revert InvalidPayer();
        if (actionHash == bytes32(0)) revert InvalidAction();

        receiptHash = keccak256(abi.encode(block.chainid, address(this), agent, payer, actionHash, storageRoot, amountWei));
        if (receipts[receiptHash].createdAt != 0) revert DuplicateReceipt(receiptHash);

        receipts[receiptHash] = Receipt({
            agent: agent,
            payer: payer,
            actionHash: actionHash,
            storageRoot: storageRoot,
            amountWei: amountWei,
            createdAt: uint64(block.timestamp)
        });

        emit ReceiptRecorded(receiptHash, agent, payer, actionHash, storageRoot, amountWei);
    }

    function getReceipt(bytes32 receiptHash) external view returns (Receipt memory receipt) {
        return receipts[receiptHash];
    }
}
