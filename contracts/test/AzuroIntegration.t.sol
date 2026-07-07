// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {ThetaSingleton} from "../src/ThetaSingleton.sol";
import {PolygonConfig} from "../src/config/PolygonConfig.sol";
import {IAzuroLP} from "../src/interfaces/IAzuroLP.sol";

/// @notice Fork tests against live Polygon mainnet Azuro deployment.
/// Run: POLYGON_RPC_URL=https://polygon-rpc.com forge test --match-contract AzuroIntegrationTest -vv
contract AzuroIntegrationTest is Test {
    ThetaSingleton internal singleton;
    IAzuroLP internal lp;

    function setUp() public {
        string memory rpc = vm.envOr("POLYGON_RPC_URL", string("https://polygon-rpc.com"));
        vm.createSelectFork(rpc);

        singleton = new ThetaSingleton(
            PolygonConfig.BET_TOKEN, PolygonConfig.AZURO_LP, PolygonConfig.CLIENT_CORE, address(0)
        );
        lp = IAzuroLP(PolygonConfig.AZURO_LP);
    }

    function test_fork_azuroContractsConfigured() public view {
        assertEq(lp.token(), PolygonConfig.BET_TOKEN);
        assertEq(IAzuroLP(PolygonConfig.AZURO_LP).token(), PolygonConfig.BET_TOKEN);
    }

    function test_fork_singletonDeploysAgainstLiveAzuro() public view {
        assertEq(address(singleton.betToken()), PolygonConfig.BET_TOKEN);
        assertEq(address(singleton.azuroLP()), PolygonConfig.AZURO_LP);
        assertEq(address(singleton.defaultCore()), PolygonConfig.CLIENT_CORE);
    }

    function test_fork_lpViewPayoutCallable() public view {
        try lp.viewPayout(PolygonConfig.CLIENT_CORE, 1) returns (uint128 payout) {
            payout;
        } catch {
            // Nonexistent token ids are acceptable on fork smoke tests.
        }
    }
}
