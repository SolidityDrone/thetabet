// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ThetaSingleton} from "../src/ThetaSingleton.sol";
import {TipsterVault} from "../src/TipsterVault.sol";
import {IAzuroLP} from "../src/interfaces/IAzuroLP.sol";
import {MockAzuroLP} from "../test/mocks/MockAzuroLP.sol";
import {MockBetToken} from "../test/mocks/MockBetToken.sol";

/// @notice Broadcast a full vault → deposit → bet → forced win flow for indexer testing.
/// @dev Requires `deploy-anvil-mocks.sh` and mock deployment in ponder/deployments/anvil.json.
contract SmokeIndexer is Script {
    using stdJson for string;

    address internal constant TIPSTER = 0x70997970c51812dc3A010c7D01B50C0D17Dc79C8;
    address internal constant FAN = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;

    function run() external {
        string memory path = string.concat(vm.projectRoot(), "/../ponder/deployments/anvil.json");
        string memory json = vm.readFile(path);
        require(json.readBool(".useMocks"), "SmokeIndexer: deploy mocks first");

        ThetaSingleton singleton = ThetaSingleton(payable(json.readAddress(".thetaSingleton")));
        MockBetToken betToken = MockBetToken(json.readAddress(".betToken"));
        MockAzuroLP lp = MockAzuroLP(json.readAddress(".azuroLP"));
        address core = json.readAddress(".azuroCore");

        address deployer = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

        vm.startBroadcast(deployer);
        betToken.mint(TIPSTER, 1_000_000e6);
        betToken.mint(FAN, 1_000_000e6);
        vm.stopBroadcast();

        vm.startBroadcast(TIPSTER);
        address vaultAddr = singleton.createVault("Smoke Vault", "SMK");
        singleton.registerTipsterName(
            "smoke_tipster",
            bytes32(uint256(0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa)),
            bytes32(uint256(0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb))
        );
        vm.stopBroadcast();

        TipsterVault vault = TipsterVault(vaultAddr);

        vm.startBroadcast(FAN);
        IERC20(address(betToken)).approve(vaultAddr, type(uint256).max);
        vault.deposit(1_000e6, FAN);
        vm.stopBroadcast();

        IAzuroLP.ConditionData[] memory conditions = new IAzuroLP.ConditionData[](1);
        conditions[0] = IAzuroLP.ConditionData({
            gameId: 1,
            conditionId: 4242,
            conditionKind: 0,
            odds: new uint64[](0),
            outcomes: _asArray(1),
            potentialLossLimit: 0,
            winningOutcomesCount: 1
        });

        IAzuroLP.OrderData memory order = IAzuroLP.OrderData({
            betOwner: address(singleton),
            conditionDatas: conditions,
            betType: 0,
            oracle: address(0),
            clientBetData: "",
            bettorSignature: "",
            oracleSignature: ""
        });

        vm.startBroadcast(TIPSTER);
        uint256[] memory tokenIds =
            singleton.placeBet(1, core, 250e6, order, abi.encode(uint128(250e6)));
        vm.stopBroadcast();

        vm.startBroadcast(TIPSTER);
        betToken.mint(address(lp), 500e6);
        lp.resolveWin(tokenIds[0], 500e6);
        singleton.syncVault(1);
        vm.stopBroadcast();

        console2.log("Vault", vaultAddr);
        console2.log("BetTokenId", tokenIds[0]);
        console2.log("VaultAssets", singleton.vaultTotalAssets(1));
        console2.log("FanShares", vault.balanceOf(FAN));
    }

    function _asArray(uint128 value) private pure returns (uint128[] memory arr) {
        arr = new uint128[](1);
        arr[0] = value;
    }
}
