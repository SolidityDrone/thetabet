// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAzuroCore} from "../../src/interfaces/IAzuroCore.sol";

/// @notice Lightweight Azuro core mock for unit / local integration tests.
contract MockAzuroCore is IAzuroCore {
    struct Resolution {
        bool resolved;
        bool canceled;
        bool outcomeWon;
        uint128 payout;
    }

    mapping(uint256 conditionId => Resolution) public resolutions;

    function setResolved(uint256 conditionId, bool outcomeWon, uint128 payout) external {
        resolutions[conditionId] = Resolution({
            resolved: true,
            canceled: false,
            outcomeWon: outcomeWon,
            payout: payout
        });
    }

    function setCanceled(uint256 conditionId) external {
        resolutions[conditionId] = Resolution({
            resolved: true,
            canceled: true,
            outcomeWon: false,
            payout: 0
        });
    }

    function getCondition(uint256 conditionId)
        external
        view
        returns (
            bytes memory,
            uint128[] memory,
            uint128,
            uint64 settledAt,
            uint48,
            uint8,
            ConditionState state,
            address
        )
    {
        Resolution memory r = resolutions[conditionId];
        if (r.canceled) {
            return ("", new uint128[](0), 0, 1, 0, 0, ConditionState.CANCELED, address(0));
        }
        if (r.resolved) {
            return ("", new uint128[](0), 0, 1, 0, 1, ConditionState.RESOLVED, address(0));
        }
        return ("", new uint128[](0), 0, 0, 0, 0, ConditionState.CREATED, address(0));
    }

    function isOutcomeWinning(uint256 conditionId, uint128) external view returns (bool) {
        return resolutions[conditionId].outcomeWon;
    }

    function isConditionCanceled(uint256 conditionId) external view returns (bool) {
        return resolutions[conditionId].canceled;
    }

    function viewPayout(uint256) external pure returns (uint128) {
        return 0;
    }
}
