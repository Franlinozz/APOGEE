// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IPolicyEngine {
    function check(
        uint256 policyId,
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 allowlistProof,
        bytes32 denylistProof
    ) external view returns (bool);

    function recordSpend(uint256 policyId, address account, uint256 value) external;
}
