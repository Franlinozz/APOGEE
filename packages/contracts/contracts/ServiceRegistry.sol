// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';

/// @title ServiceRegistry
/// @notice Agent service catalogue. Reputation is derived off-chain from ReceiptBook events and surfaced via the API.
contract ServiceRegistry is Ownable {
    struct Service {
        uint256 agentId;
        string name;
        string endpoint;
        uint256 pricePerCall;
        bytes32 schemaHash;
        string[] tags;
        bool active;
    }

    error NotAgentOwner();
    error InvalidService();
    error UnknownService();

    uint256 public nextServiceId = 1;
    mapping(uint256 agentId => address owner) public agentOwners;
    mapping(uint256 serviceId => Service service) private services;

    event AgentOwnerSet(uint256 indexed agentId, address indexed owner);
    event ServiceRegistered(uint256 indexed agentId, uint256 indexed serviceId, string name, uint256 pricePerCall);
    event ServiceUpdated(uint256 indexed agentId, uint256 indexed serviceId, string name, uint256 pricePerCall);
    event ServiceDeregistered(uint256 indexed agentId, uint256 indexed serviceId);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setAgentOwner(uint256 agentId, address agentOwner) external onlyOwner {
        if (agentOwner == address(0)) revert InvalidService();
        agentOwners[agentId] = agentOwner;
        emit AgentOwnerSet(agentId, agentOwner);
    }

    function register(
        uint256 agentId,
        string calldata name,
        string calldata endpoint,
        uint256 pricePerCall,
        bytes32 schemaHash,
        string[] calldata tags
    ) external returns (uint256 serviceId) {
        _requireAgentOwner(agentId);
        if (bytes(name).length == 0 || bytes(endpoint).length == 0 || schemaHash == bytes32(0)) revert InvalidService();
        serviceId = nextServiceId++;
        services[serviceId] = Service(agentId, name, endpoint, pricePerCall, schemaHash, tags, true);
        emit ServiceRegistered(agentId, serviceId, name, pricePerCall);
    }

    function update(
        uint256 serviceId,
        string calldata name,
        string calldata endpoint,
        uint256 pricePerCall,
        bytes32 schemaHash,
        string[] calldata tags
    ) external {
        Service storage service = services[serviceId];
        if (!service.active) revert UnknownService();
        _requireAgentOwner(service.agentId);
        service.name = name;
        service.endpoint = endpoint;
        service.pricePerCall = pricePerCall;
        service.schemaHash = schemaHash;
        delete service.tags;
        for (uint256 i = 0; i < tags.length; i++) service.tags.push(tags[i]);
        emit ServiceUpdated(service.agentId, serviceId, name, pricePerCall);
    }

    function deregister(uint256 serviceId) external {
        Service storage service = services[serviceId];
        if (!service.active) revert UnknownService();
        _requireAgentOwner(service.agentId);
        service.active = false;
        emit ServiceDeregistered(service.agentId, serviceId);
    }

    function getService(uint256 serviceId) external view returns (Service memory) {
        return services[serviceId];
    }

    function _requireAgentOwner(uint256 agentId) internal view {
        if (msg.sender != agentOwners[agentId]) revert NotAgentOwner();
    }
}
