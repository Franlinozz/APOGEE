// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';

/// @title AgentIdentity
/// @notice ERC-721 identity with ERC-7857-style encrypted metadata and ERC-8004-style service hooks.
contract AgentIdentity is ERC721, Ownable {
    struct AgentMeta {
        bytes32 metadataRoot;
        bytes32 publicKey;
        address controller;
        bool serviceRegistered;
        uint64 createdAt;
    }

    error NotTokenOwner();
    error ZeroController();
    error EmptyMetadata();
    error UnknownToken();

    uint256 public nextTokenId = 1;
    mapping(uint256 tokenId => AgentMeta meta) public agentMeta;

    event MetadataRotated(uint256 indexed tokenId, bytes32 indexed newRoot);
    event ServiceRegistered(uint256 indexed tokenId, bytes32 indexed serviceManifestHash);
    event CompletionProven(uint256 indexed tokenId, bytes32 indexed taskId, bytes proof);
    event VerificationRequested(uint256 indexed tokenId, bytes32 indexed taskId);
    event TransferWithReencryption(uint256 indexed tokenId, address indexed from, address indexed to, bytes32 publicKey);

    constructor(address initialOwner) ERC721('Apogee Agent Identity', 'APOGEE') Ownable(initialOwner) {}

    function mint(address to, bytes32 metadataRoot, bytes32 publicKey, address controller) external onlyOwner returns (uint256 tokenId) {
        if (metadataRoot == bytes32(0)) revert EmptyMetadata();
        if (controller == address(0)) revert ZeroController();
        tokenId = nextTokenId++;
        _safeMint(to, tokenId);
        agentMeta[tokenId] = AgentMeta(metadataRoot, publicKey, controller, false, uint64(block.timestamp));
    }

    function rotateMetadata(uint256 tokenId, bytes32 newRoot) external {
        _requireTokenOwner(tokenId);
        if (newRoot == bytes32(0)) revert EmptyMetadata();
        agentMeta[tokenId].metadataRoot = newRoot;
        emit MetadataRotated(tokenId, newRoot);
    }

    function registerService(uint256 tokenId, bytes32 serviceManifestHash) external {
        _requireTokenOwner(tokenId);
        agentMeta[tokenId].serviceRegistered = true;
        emit ServiceRegistered(tokenId, serviceManifestHash);
    }

    function proveCompletion(uint256 tokenId, bytes32 taskId, bytes calldata proof) external {
        if (_ownerOf(tokenId) == address(0)) revert UnknownToken();
        emit CompletionProven(tokenId, taskId, proof);
    }

    function requestVerification(uint256 tokenId, bytes32 taskId) external {
        if (_ownerOf(tokenId) == address(0)) revert UnknownToken();
        emit VerificationRequested(tokenId, taskId);
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        // Placeholder ERC-8004 interface id until the standard is ratified.
        return interfaceId == 0x8004beef || super.supportsInterface(interfaceId);
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = super._update(to, tokenId, auth);
        if (from != address(0) && to != address(0)) {
            emit TransferWithReencryption(tokenId, from, to, agentMeta[tokenId].publicKey);
        }
    }

    function _requireTokenOwner(uint256 tokenId) internal view {
        if (_ownerOf(tokenId) == address(0)) revert UnknownToken();
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
    }
}
