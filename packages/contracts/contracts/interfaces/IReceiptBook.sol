// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IReceiptBook {
    function emitReceipt(
        uint256 agentId,
        bytes4 actionTag,
        bytes32 payloadHash,
        bytes32 storageRoot,
        uint256 valueWei
    ) external returns (uint256 receiptId);
}
