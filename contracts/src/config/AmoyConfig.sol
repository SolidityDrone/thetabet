// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Azuro v3.0.13 deployment addresses on Polygon Amoy (from SPEC / @azuro-org/toolkit).
library AmoyConfig {
    uint256 internal constant CHAIN_ID = 80_002;

    address internal constant BET_TOKEN = 0xCf1b86ceD971b88C042C64A9c099377e2738073C;
    address internal constant AZURO_LP = 0x0a75395Ff15d9557424b632cEBCac448D66F9779;
    address internal constant AZURO_BET_NFT = 0x4B75c071dFA5d537979E8b0615Bb97B6337dbFef;
    address internal constant CLIENT_CORE = 0xCD0Db5ef28C3Bd3a69283372dE923Eb4DA0585F6;
    address internal constant AZURO_VAULT = 0x1Ed6CEEDf7033461a189FD7c3381C34846D7b25a;
    address internal constant RELAYER = 0x48c9bE88706F22838070eE7C4bC74Ad7A8eeF114;
}
