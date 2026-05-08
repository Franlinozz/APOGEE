// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';

/// @title PolicyEngine
/// @notice Immutable spending and selector policies for Apogee agent accounts.
contract PolicyEngine is Ownable {
    struct Policy {
        uint256 maxPerTx;
        uint256 maxPerDayWei;
        bytes32 allowlistRoot;
        bytes32 denylistRoot;
        bytes4[] allowedSelectors;
        uint64 windowStart;
        uint64 windowEnd;
        uint256 multiSigThresholdWei;
        bool active;
    }

    struct SpendWindow {
        uint64 windowStart;
        uint256 spentInWindow;
    }

    error InactivePolicy();
    error ExceedsPerTx();
    error ExceedsPerDay();
    error NotInAllowlist();
    error InDenylist();
    error DisallowedSelector();
    error OutsideTimeWindow();
    error EmptyPolicy();

    uint256 public nextPolicyId = 1;
    mapping(uint256 policyId => Policy policy) private policies;
    mapping(address account => mapping(uint256 policyId => SpendWindow window)) public spendWindows;

    event PolicyRegistered(uint256 indexed policyId, uint256 maxPerTx, uint256 maxPerDayWei);
    event SpendRecorded(uint256 indexed policyId, address indexed account, uint256 amountWei);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function registerPolicy(Policy calldata spec) external onlyOwner returns (uint256 policyId) {
        if (!spec.active) revert EmptyPolicy();
        policyId = nextPolicyId++;
        Policy storage stored = policies[policyId];
        stored.maxPerTx = spec.maxPerTx;
        stored.maxPerDayWei = spec.maxPerDayWei;
        stored.allowlistRoot = spec.allowlistRoot;
        stored.denylistRoot = spec.denylistRoot;
        stored.windowStart = spec.windowStart;
        stored.windowEnd = spec.windowEnd;
        stored.multiSigThresholdWei = spec.multiSigThresholdWei;
        stored.active = spec.active;
        for (uint256 i = 0; i < spec.allowedSelectors.length; i++) {
            stored.allowedSelectors.push(spec.allowedSelectors[i]);
        }
        emit PolicyRegistered(policyId, spec.maxPerTx, spec.maxPerDayWei);
    }

    function getPolicy(uint256 policyId) external view returns (Policy memory) {
        return policies[policyId];
    }

    function check(
        uint256 policyId,
        address,
        uint256 value,
        bytes calldata data,
        bytes32 allowlistProof,
        bytes32 denylistProof
    ) external view returns (bool) {
        Policy storage policy = policies[policyId];
        if (!policy.active) revert InactivePolicy();
        if (policy.maxPerTx != 0 && value > policy.maxPerTx) revert ExceedsPerTx();
        if (policy.windowStart != 0 && block.timestamp < policy.windowStart) revert OutsideTimeWindow();
        if (policy.windowEnd != 0 && block.timestamp > policy.windowEnd) revert OutsideTimeWindow();
        if (policy.allowlistRoot != bytes32(0) && allowlistProof != policy.allowlistRoot) revert NotInAllowlist();
        if (policy.denylistRoot != bytes32(0) && denylistProof == policy.denylistRoot) revert InDenylist();
        if (policy.allowedSelectors.length != 0) {
            bytes4 selector = data.length >= 4 ? bytes4(data[:4]) : bytes4(0);
            bool allowed = false;
            for (uint256 i = 0; i < policy.allowedSelectors.length; i++) {
                if (policy.allowedSelectors[i] == selector) allowed = true;
            }
            if (!allowed) revert DisallowedSelector();
        }
        SpendWindow memory window = spendWindows[msg.sender][policyId];
        uint256 spent = block.timestamp >= window.windowStart + 24 hours ? 0 : window.spentInWindow;
        if (policy.maxPerDayWei != 0 && spent + value > policy.maxPerDayWei) revert ExceedsPerDay();
        return true;
    }

    function recordSpend(uint256 policyId, address account, uint256 value) external {
        Policy storage policy = policies[policyId];
        if (!policy.active) revert InactivePolicy();
        SpendWindow storage window = spendWindows[account][policyId];
        if (window.windowStart == 0 || block.timestamp >= window.windowStart + 24 hours) {
            window.windowStart = uint64(block.timestamp);
            window.spentInWindow = 0;
        }
        window.spentInWindow += value;
        emit SpendRecorded(policyId, account, value);
    }
}
