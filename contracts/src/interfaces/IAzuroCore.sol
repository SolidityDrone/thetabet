// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal Azuro v3 Client/Prematch core surface used for bet resolution.
interface IAzuroCore {
    enum ConditionState {
        UNKNOWN,
        CREATED,
        RESOLVED,
        CANCELED,
        PAUSED
    }

    struct Condition {
        // Packed fields vary by deployment; we only read `state` via getConditionState helper.
        bytes data;
    }

    function getCondition(uint256 conditionId)
        external
        view
        returns (
            bytes memory timeBets,
            uint128[] memory payouts,
            uint128 totalNetBets,
            uint64 settledAt,
            uint48 lastDepositId,
            uint8 winningOutcomesCount,
            ConditionState state,
            address oracle
        );

    function isOutcomeWinning(uint256 conditionId, uint128 outcome) external view returns (bool);

    function isConditionCanceled(uint256 conditionId) external view returns (bool);

    function viewPayout(uint256 tokenId) external view returns (uint128);
}
