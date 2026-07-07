// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal Azuro v3 LP surface for on-chain betting and settlement.
interface IAzuroLP {
    struct ConditionData {
        uint256 gameId;
        uint256 conditionId;
        uint8 conditionKind;
        uint64[] odds;
        uint128[] outcomes;
        uint128 potentialLossLimit;
        uint8 winningOutcomesCount;
    }

    struct OrderData {
        address betOwner;
        ConditionData[] conditionDatas;
        uint8 betType;
        address oracle;
        bytes clientBetData;
        bytes bettorSignature;
        bytes oracleSignature;
    }

    function token() external view returns (address);

    function betOrder(address core, OrderData calldata order, address betOwner, bytes calldata data)
        external
        returns (uint256[] memory tokenIds);

    function viewPayout(address core, uint256 tokenId) external view returns (uint128);

    function withdrawPayout(address core, uint256 tokenId) external returns (uint128);
}
