// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Script, console2} from "forge-std/Script.sol";

import {ThetaSingleton} from "../src/ThetaSingleton.sol";
import {AmoyConfig} from "../src/config/AmoyConfig.sol";
import {PolygonConfig} from "../src/config/PolygonConfig.sol";

/// @notice Deploy ThetaSingleton on Polygon Amoy testnet.
/// @dev Use Foundry keystore (e.g. ~/.foundry/keystores/kondor):
///   ./script/deploy-amoy.sh
contract DeployAmoy is Script {
    function run() external returns (ThetaSingleton deployed) {
        vm.startBroadcast();

        deployed = new ThetaSingleton(
            AmoyConfig.BET_TOKEN,
            AmoyConfig.AZURO_LP,
            AmoyConfig.CLIENT_CORE,
            PolygonConfig.INITIAL_WHITELISTED_USER
        );

        vm.stopBroadcast();

        console2.log("ThetaSingleton", address(deployed));
        console2.log("BetToken", AmoyConfig.BET_TOKEN);
        console2.log("AzuroLP", AmoyConfig.AZURO_LP);
        console2.log("ClientCore", AmoyConfig.CLIENT_CORE);
        console2.log("chainId", block.chainid);
        console2.log("startBlock", block.number);

        _writeDeployment(address(deployed), block.number);
    }

    function _writeDeployment(address singleton, uint256 startBlock) internal {
        string memory path = string.concat(vm.projectRoot(), "/../ponder/deployments/amoy.json");
        string memory json = string.concat(
            "{\n",
            '  "chainId": ',
            Strings.toString(block.chainid),
            ",\n",
            '  "startBlock": ',
            Strings.toString(startBlock),
            ",\n",
            '  "network": "polygonAmoy",\n',
            '  "deployer": "0xDD7D64BFd13EF3b733374Fc8DE9B9C651487a15D",\n',
            '  "thetaSingleton": "',
            Strings.toHexString(singleton),
            '",\n',
            '  "betToken": "',
            Strings.toHexString(AmoyConfig.BET_TOKEN),
            '",\n',
            '  "azuroLP": "',
            Strings.toHexString(AmoyConfig.AZURO_LP),
            '",\n',
            '  "azuroCore": "',
            Strings.toHexString(AmoyConfig.CLIENT_CORE),
            '",\n',
            '  "rpcUrl": "https://rpc-amoy.polygon.technology"\n',
            "}"
        );
        vm.writeFile(path, json);
        console2.log("Wrote deployment", path);
    }
}
