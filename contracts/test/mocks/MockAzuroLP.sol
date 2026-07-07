// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IAzuroLP} from "../../src/interfaces/IAzuroLP.sol";
import {MockAzuroCore} from "./MockAzuroCore.sol";

/// @notice Simulates Azuro LP bet placement and payout settlement for tests.
contract MockAzuroLP is IAzuroLP {
    using SafeERC20 for IERC20;

    struct Bet {
        address core;
        uint128 stake;
        uint256 conditionId;
        uint128 outcomeId;
        uint128 payout;
        bool claimed;
        bool resolved;
        bool won;
    }

    IERC20 internal immutable _token;
    MockAzuroCore public immutable core;

    uint256 public nextTokenId = 1;
    mapping(uint256 tokenId => Bet) public bets;

    constructor(IERC20 token_, MockAzuroCore core_) {
        _token = token_;
        core = core_;
    }

    function token() external view returns (address) {
        return address(_token);
    }

    function betOrder(address core_, OrderData calldata order, address, bytes calldata data)
        external
        returns (uint256[] memory tokenIds)
    {
        uint128 amount = abi.decode(data, (uint128));
        _token.safeTransferFrom(msg.sender, address(this), amount);

        uint256 tokenId = nextTokenId++;
        uint256 conditionId = order.conditionDatas[0].conditionId;
        uint128 outcomeId = order.conditionDatas[0].outcomes[0];

        bets[tokenId] = Bet({
            core: core_,
            stake: amount,
            conditionId: conditionId,
            outcomeId: outcomeId,
            payout: 0,
            claimed: false,
            resolved: false,
            won: false
        });

        tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;
    }

    function resolveWin(uint256 tokenId, uint128 payout) external {
        Bet storage bet = bets[tokenId];
        bet.resolved = true;
        bet.won = true;
        bet.payout = payout;
        core.setResolved(bet.conditionId, true, payout);
    }

    function resolveLoss(uint256 tokenId) external {
        Bet storage bet = bets[tokenId];
        bet.resolved = true;
        bet.won = false;
        bet.payout = 0;
        core.setResolved(bet.conditionId, false, 0);
    }

    function viewPayout(address, uint256 tokenId) external view returns (uint128) {
        Bet storage bet = bets[tokenId];
        if (bet.claimed || !bet.resolved || !bet.won) return 0;
        return bet.payout;
    }

    function withdrawPayout(address, uint256 tokenId) external returns (uint128) {
        Bet storage bet = bets[tokenId];
        require(!bet.claimed && bet.resolved && bet.won, "not payable");
        bet.claimed = true;
        _token.safeTransfer(msg.sender, bet.payout);
        return bet.payout;
    }
}
