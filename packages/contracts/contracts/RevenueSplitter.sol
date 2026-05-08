// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';

/// @title RevenueSplitter
/// @notice Per-agent revenue splitter configured in basis points.
contract RevenueSplitter is Ownable {
    struct Split {
        address recipient;
        uint16 amountBp;
    }

    error NotAgentOwner();
    error InvalidSplit();
    error NoSplits();
    error DistributionFailed();

    mapping(uint256 agentId => address owner) public agentOwners;
    mapping(uint256 agentId => Split[] splits) private configuredSplits;

    event AgentOwnerSet(uint256 indexed agentId, address indexed owner);
    event SplitsConfigured(uint256 indexed agentId);
    event Distributed(uint256 indexed agentId, address indexed recipient, uint16 amountBp, uint256 amountWei);

    constructor(address initialOwner) Ownable(initialOwner) {}

    receive() external payable {}

    function setAgentOwner(uint256 agentId, address agentOwner) external onlyOwner {
        if (agentOwner == address(0)) revert InvalidSplit();
        agentOwners[agentId] = agentOwner;
        emit AgentOwnerSet(agentId, agentOwner);
    }

    function configure(uint256 agentId, Split[] calldata splits) external {
        if (msg.sender != agentOwners[agentId]) revert NotAgentOwner();
        if (splits.length == 0) revert InvalidSplit();
        delete configuredSplits[agentId];
        uint256 totalBp;
        for (uint256 i = 0; i < splits.length; i++) {
            if (splits[i].recipient == address(0) || splits[i].amountBp == 0) revert InvalidSplit();
            totalBp += splits[i].amountBp;
            configuredSplits[agentId].push(splits[i]);
        }
        if (totalBp != 10_000) revert InvalidSplit();
        emit SplitsConfigured(agentId);
    }

    function hasSplits(uint256 agentId) external view returns (bool) {
        return configuredSplits[agentId].length != 0;
    }

    function getSplits(uint256 agentId) external view returns (Split[] memory) {
        return configuredSplits[agentId];
    }

    function distribute(uint256 agentId) external payable {
        Split[] memory splits = configuredSplits[agentId];
        if (splits.length == 0) revert NoSplits();
        uint256 remaining = msg.value;
        for (uint256 i = 0; i < splits.length; i++) {
            uint256 amount = i == splits.length - 1 ? remaining : (msg.value * splits[i].amountBp) / 10_000;
            remaining -= amount;
            (bool ok,) = splits[i].recipient.call{value: amount}('');
            if (!ok) revert DistributionFailed();
            emit Distributed(agentId, splits[i].recipient, splits[i].amountBp, amount);
        }
    }
}
