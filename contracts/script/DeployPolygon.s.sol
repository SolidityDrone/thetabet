// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Script, console2} from "forge-std/Script.sol";

import {ThetaSingleton} from "../src/ThetaSingleton.sol";
import {PolygonConfig} from "../src/config/PolygonConfig.sol";

/// @notice Deploy ThetaSingleton on Polygon mainnet.
/// @dev Use Foundry keystore (e.g. ~/.foundry/keystores/kondor):
///   ./script/deploy-polygon.sh
contract DeployPolygon is Script {
    function run() external returns (ThetaSingleton deployed) {
        vm.startBroadcast();

        deployed = new ThetaSingleton(
            PolygonConfig.BET_TOKEN,
            PolygonConfig.AZURO_LP,
            PolygonConfig.CLIENT_CORE,
            PolygonConfig.RELAYER,
            PolygonConfig.INITIAL_WHITELISTED_USER
        );

        vm.stopBroadcast();

        console2.log("ThetaSingleton", address(deployed));
        console2.log("BetToken", PolygonConfig.BET_TOKEN);
        console2.log("AzuroLP", PolygonConfig.AZURO_LP);
        console2.log("ClientCore", PolygonConfig.CLIENT_CORE);
        console2.log("chainId", block.chainid);
        console2.log("startBlock", block.number);

        _writeDeployment(address(deployed), block.number);
    }

    function _writeDeployment(address singleton, uint256 startBlock) internal {
        string memory path = string.concat(vm.projectRoot(), "/../ponder/deployments/polygon.json");
        string memory json = string.concat(
            "{\n",
            '  "chainId": ',
            Strings.toString(block.chainid),
            ",\n",
            '  "startBlock": ',
            Strings.toString(startBlock),
            ",\n",
            '  "network": "polygon",\n',
            '  "deployer": "0xDD7D64BFd13EF3b733374Fc8DE9B9C651487a15D",\n',
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
            '  "rpcUrl": "https://polygon-bor-rpc.publicnode.com"\n',
            "}"
        );
        vm.writeFile(path, json);
        console2.log("Wrote deployment", path);
    }
}
