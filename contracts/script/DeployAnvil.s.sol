// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Script, console2} from "forge-std/Script.sol";

import {ThetaSingleton} from "../src/ThetaSingleton.sol";
import {PolygonConfig} from "../src/config/PolygonConfig.sol";

/// @notice Deploy ThetaSingleton on Anvil forked from Polygon mainnet.
/// @dev Requires `anvil --fork-url <polygon-rpc> --chain-id 137`.
///
///   ./script/start-anvil-fork.sh
///   ./script/deploy-anvil.sh
contract DeployAnvil is Script {
    error NotPolygonFork();

    function run() external returns (ThetaSingleton singleton) {
        if (block.chainid != PolygonConfig.CHAIN_ID) revert NotPolygonFork();

        address deployer = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
        vm.deal(deployer, 10_000 ether);

        vm.startBroadcast(deployer);

        singleton = new ThetaSingleton(
            PolygonConfig.BET_TOKEN,
            PolygonConfig.AZURO_LP,
            PolygonConfig.CLIENT_CORE,
            PolygonConfig.RELAYER,
            address(0)
        );

        // Local fork dev — open the default Anvil accounts used in smoke tests.
        singleton.whitelistAddress(0x70997970c51812dc3A010c7D01B50C0D17Dc79C8);
        singleton.whitelistAddress(0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC);

        vm.stopBroadcast();

        console2.log("ThetaSingleton", address(singleton));
        console2.log("BetToken", PolygonConfig.BET_TOKEN);
        console2.log("AzuroLP", PolygonConfig.AZURO_LP);
        console2.log("ClientCore", PolygonConfig.CLIENT_CORE);
        console2.log("chainId", block.chainid);
        console2.log("startBlock", block.number);

        _writeDeployment(address(singleton), block.number);
    }

    function _writeDeployment(address singleton, uint256 startBlock) internal {
        string memory path = string.concat(vm.projectRoot(), "/../ponder/deployments/anvil.json");
        string memory json = string.concat(
            "{\n",
            '  "chainId": ',
            Strings.toString(block.chainid),
            ",\n",
            '  "startBlock": ',
            Strings.toString(startBlock),
            ",\n",
            '  "thetaSingleton": "',
            Strings.toHexString(singleton),
            '",\n',
            '  "betToken": "',
            Strings.toHexString(PolygonConfig.BET_TOKEN),
            '",\n',
            '  "azuroLP": "',
            Strings.toHexString(PolygonConfig.AZURO_LP),
            '",\n',
            '  "azuroCore": "',
            Strings.toHexString(PolygonConfig.CLIENT_CORE),
            '",\n',
            '  "rpcUrl": "http://127.0.0.1:8545",\n',
            '  "forkUrl": "https://polygon-rpc.com",\n',
            '  "network": "polygonFork"\n',
            "}"
        );
        vm.writeFile(path, json);
        console2.log("Wrote deployment", path);
    }
}
