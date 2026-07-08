// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Script, console2} from "forge-std/Script.sol";

import {ThetaSingleton} from "../src/ThetaSingleton.sol";
import {PolygonConfig} from "../src/config/PolygonConfig.sol";
import {MockBetToken} from "../test/mocks/MockBetToken.sol";
import {MockAzuroCore} from "../test/mocks/MockAzuroCore.sol";
import {MockAzuroLP} from "../test/mocks/MockAzuroLP.sol";

/// @notice Deploy ThetaSingleton with mock Azuro on a Polygon-forked Anvil.
/// @dev Use this for full indexer smoke tests (instant win/loss via mock LP).
///      Writes ponder/deployments/anvil.json with `"useMocks": true`.
contract DeployAnvilMocks is Script {
    error NotPolygonFork();

    function run()
        external
        returns (
            ThetaSingleton singleton,
            MockBetToken betToken,
            MockAzuroLP lp,
            MockAzuroCore core
        )
    {
        if (block.chainid != PolygonConfig.CHAIN_ID) revert NotPolygonFork();

        address deployer = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
        vm.deal(deployer, 10_000 ether);

        vm.startBroadcast(deployer);

        betToken = new MockBetToken();
        core = new MockAzuroCore();
        lp = new MockAzuroLP(betToken, core);
        singleton = new ThetaSingleton(
            address(betToken), address(lp), address(core), PolygonConfig.RELAYER, address(0)
        );

        singleton.whitelistAddress(0x70997970c51812dc3A010c7D01B50C0D17Dc79C8);
        singleton.whitelistAddress(0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC);

        vm.stopBroadcast();

        console2.log("ThetaSingleton", address(singleton));
        console2.log("BetToken (mock)", address(betToken));
        console2.log("AzuroLP (mock)", address(lp));
        console2.log("AzuroCore (mock)", address(core));

        _writeDeployment(address(singleton), address(betToken), address(lp), address(core), block.number);
    }

    function _writeDeployment(
        address singleton,
        address betToken,
        address azuroLP,
        address azuroCore,
        uint256 startBlock
    ) internal {
        string memory path = string.concat(vm.projectRoot(), "/../ponder/deployments/anvil.json");
        string memory json = string.concat(
            "{\n",
            '  "chainId": ',
            Strings.toString(block.chainid),
            ",\n",
            '  "startBlock": ',
            Strings.toString(startBlock),
            ",\n",
            '  "useMocks": true,\n',
            '  "thetaSingleton": "',
            Strings.toHexString(singleton),
            '",\n',
            '  "betToken": "',
            Strings.toHexString(betToken),
            '",\n',
            '  "azuroLP": "',
            Strings.toHexString(azuroLP),
            '",\n',
            '  "azuroCore": "',
            Strings.toHexString(azuroCore),
            '",\n',
            '  "rpcUrl": "http://127.0.0.1:8545",\n',
            '  "forkUrl": "https://polygon-rpc.com",\n',
            '  "network": "polygonFork"\n',
            "}"
        );
        vm.writeFile(path, json);
        console2.log("Wrote mock deployment", path);
    }
}
