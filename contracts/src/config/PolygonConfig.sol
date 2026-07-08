// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Azuro v3 deployment addresses on Polygon mainnet (from @azuro-org/toolkit chainsData).
library PolygonConfig {
    uint256 internal constant CHAIN_ID = 137;

    /// @dev Native USDT on Polygon (6 decimals).
    address internal constant BET_TOKEN = 0xc2132D05D31c914a87C6611C10748AEb04B58e8F;
    address internal constant AZURO_LP = 0x0FA7FB5407eA971694652E6E16C12A52625DE1b8;
    address internal constant AZURO_BET_NFT = 0x7A1c3FEf712753374C4DCe34254B96faF2B7265B;
    address internal constant CLIENT_CORE = 0xF9548Be470A4e130c90ceA8b179FCD66D2972AC7;
    address internal constant AZURO_VAULT = 0x1a0612FE7D0Def35559a1f71Ff155e344Ae69d2C;
    address internal constant RELAYER = 0x8dA05c0021e6b35865FDC959c54dCeF3A4AbBa9d;

    /// @dev Closed mainnet test — only this wallet may interact until deployer whitelists more.
    address internal constant INITIAL_WHITELISTED_USER = 0xe257cf8ECa1aF94117bEe3809F705bC6e51CbD5c;
}
