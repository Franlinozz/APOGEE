// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IAgentAccount {
    function owner() external view returns (address);
    function linkedAgentId() external view returns (uint256);
    function isAuthorizedSigner(address signer, bytes32 scopeHash) external view returns (bool);
}
