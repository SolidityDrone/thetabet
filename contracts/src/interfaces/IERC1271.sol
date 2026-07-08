// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev ERC-1271 — Azuro V3 validates contract bettors via `isValidSignature`.
interface IERC1271 {
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4 magicValue);
}
