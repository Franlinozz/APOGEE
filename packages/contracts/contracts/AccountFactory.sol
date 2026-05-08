// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import {AgentAccount} from './AgentAccount.sol';

/// @title AccountFactory
/// @notice CREATE2 deployer for deterministic Apogee agent accounts.
contract AccountFactory is Ownable {
    error DeploymentFailed();
    error ZeroOwner();

    address public immutable policyEngine;
    address public immutable receiptBook;
    uint256 public nextAgentId = 1;
    mapping(address account => uint256 agentId) public agentIds;
    mapping(bytes32 salt => bool used) public usedSalts;

    event AgentAccountCreated(address indexed owner, address indexed account, bytes32 indexed salt);

    constructor(address initialOwner, address policyEngine_, address receiptBook_) Ownable(initialOwner) {
        policyEngine = policyEngine_;
        receiptBook = receiptBook_;
    }

    function createAccount(address owner, bytes32 salt) external returns (address deployed) {
        if (owner == address(0)) revert ZeroOwner();
        if (usedSalts[salt]) revert DeploymentFailed();
        usedSalts[salt] = true;
        uint256 agentId = nextAgentId++;
        address[3] memory guardians = [owner, owner, owner];
        bytes memory bytecode = abi.encodePacked(type(AgentAccount).creationCode, abi.encode(owner, policyEngine, receiptBook, agentId, guardians));
        assembly {
            deployed := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        if (deployed == address(0)) revert DeploymentFailed();
        agentIds[deployed] = agentId;
        emit AgentAccountCreated(owner, deployed, salt);
    }

    function predict(address owner, bytes32 salt) external view returns (address predicted) {
        if (owner == address(0)) revert ZeroOwner();
        uint256 agentId = nextAgentId;
        address[3] memory guardians = [owner, owner, owner];
        bytes memory bytecode = abi.encodePacked(type(AgentAccount).creationCode, abi.encode(owner, policyEngine, receiptBook, agentId, guardians));
        bytes32 hash = keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(bytecode)));
        predicted = address(uint160(uint256(hash)));
    }
}
