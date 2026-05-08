// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import {IPolicyEngine} from './interfaces/IPolicyEngine.sol';
import {IReceiptBook} from './interfaces/IReceiptBook.sol';

/// @title AgentAccount
/// @notice Minimal self-custodial account for an autonomous Apogee agent.
contract AgentAccount is Ownable {
    struct SessionKey {
        uint64 expiresAt;
        bytes32 scopeHash;
        bool active;
    }

    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    error PolicyDenied();
    error InvalidSessionKey();
    error InvalidCallTarget();
    error CallFailed();
    error NotAuthorised();
    error InvalidRecovery();

    uint256 public nonce;
    mapping(address key => SessionKey sessionKey) public sessionKeys;
    uint256 public policyId;
    uint256 public linkedAgentId;
    IPolicyEngine public immutable policyEngine;
    IReceiptBook public immutable receiptBook;
    address[3] public guardians;

    event Executed(address indexed target, uint256 value, bytes data, bytes result);
    event SessionKeyAdded(address indexed key, uint64 expiresAt, bytes32 scopeHash);
    event SessionKeyRevoked(address indexed key);
    event PolicySet(uint256 indexed policyId);
    event OwnerRecovered(address indexed oldOwner, address indexed newOwner);

    constructor(
        address initialOwner,
        address policyEngine_,
        address receiptBook_,
        uint256 linkedAgentId_,
        address[3] memory guardians_
    ) Ownable(initialOwner) {
        policyEngine = IPolicyEngine(policyEngine_);
        receiptBook = IReceiptBook(receiptBook_);
        linkedAgentId = linkedAgentId_;
        guardians = guardians_;
    }

    receive() external payable {}

    function execute(address target, uint256 value, bytes calldata data) external returns (bytes memory result) {
        _requireAuthorised(bytes4(data.length >= 4 ? bytes4(data[:4]) : bytes4(0)));
        result = _execute(target, value, data);
    }

    function executeBatch(Call[] calldata calls) external returns (bytes[] memory results) {
        _requireAuthorised(bytes4(0));
        results = new bytes[](calls.length);
        for (uint256 i = 0; i < calls.length; i++) {
            results[i] = _execute(calls[i].target, calls[i].value, calls[i].data);
        }
    }

    function addSessionKey(address key, uint64 expiresAt, bytes32 scopeHash) external onlyOwner {
        if (key == address(0) || expiresAt <= block.timestamp) revert InvalidSessionKey();
        sessionKeys[key] = SessionKey(expiresAt, scopeHash, true);
        emit SessionKeyAdded(key, expiresAt, scopeHash);
    }

    function revokeSessionKey(address key) external onlyOwner {
        sessionKeys[key].active = false;
        emit SessionKeyRevoked(key);
    }

    function setPolicy(uint256 policyId_) external onlyOwner {
        policyId = policyId_;
        emit PolicySet(policyId_);
    }

    function recover(address newOwner, bytes[] calldata attestations) external {
        if (newOwner == address(0) || attestations.length < 2) revert InvalidRecovery();
        bool[3] memory seen;
        uint256 valid;
        bytes32 digest = keccak256(abi.encodePacked(address(this), newOwner, block.chainid));
        for (uint256 i = 0; i < attestations.length; i++) {
            address signer = _recoverSigner(digest, attestations[i]);
            for (uint256 j = 0; j < guardians.length; j++) {
                if (!seen[j] && signer == guardians[j]) {
                    seen[j] = true;
                    valid++;
                }
            }
        }
        if (valid < 2) revert InvalidRecovery();
        address oldOwner = owner();
        _transferOwnership(newOwner);
        emit OwnerRecovered(oldOwner, newOwner);
    }

    function isAuthorizedSigner(address signer, bytes32 scopeHash) external view returns (bool) {
        if (signer == owner()) return true;
        SessionKey memory key = sessionKeys[signer];
        return key.active && key.expiresAt >= block.timestamp && key.scopeHash == scopeHash;
    }

    function _execute(address target, uint256 value, bytes calldata data) internal returns (bytes memory result) {
        if (target == address(0)) revert InvalidCallTarget();
        if (policyId != 0) {
            bool allowed = policyEngine.check(policyId, target, value, data, bytes32(0), bytes32(0));
            if (!allowed) revert PolicyDenied();
            policyEngine.recordSpend(policyId, address(this), value);
        }
        nonce++;
        (bool ok, bytes memory returned) = target.call{value: value}(data);
        if (!ok) revert CallFailed();
        receiptBook.emitReceipt(linkedAgentId, bytes4(keccak256('EXEC')), keccak256(abi.encode(target, value, data, nonce)), bytes32(0), value);
        emit Executed(target, value, data, returned);
        return returned;
    }

    function _requireAuthorised(bytes4 selector) internal view {
        if (msg.sender == owner()) return;
        SessionKey memory key = sessionKeys[msg.sender];
        if (!key.active || key.expiresAt < block.timestamp || key.scopeHash != bytes32(selector)) revert NotAuthorised();
    }

    function _recoverSigner(bytes32 digest, bytes memory signature) internal pure returns (address) {
        if (signature.length != 65) revert InvalidRecovery();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        return ecrecover(digest, v, r, s);
    }
}
