// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {SingletonTest} from "./Singleton.t.sol";
import {TipsterVault} from "../src/TipsterVault.sol";
import {MockBetToken} from "./mocks/MockBetToken.sol";

contract VaultTest is SingletonTest {
    function test_previewDeposit_matches_minted_shares() public {
        TipsterVault vault = _createVault();

        assertEq(vault.previewDeposit(500e6), 500e6);

        token.mint(fan, 500e6);
        vm.startPrank(fan);
        token.approve(address(vault), type(uint256).max);
        uint256 shares = vault.deposit(500e6, fan);
        vm.stopPrank();

        assertEq(shares, 500e6);
        assertEq(vault.convertToAssets(shares), 500e6);
    }

    function test_second_depositor_gets_pro_rata_shares() public {
        TipsterVault vault = _createVault();
        address fan2 = makeAddr("fan2");
        token.mint(fan2, 10_000e6);

        vm.startPrank(fan);
        token.approve(address(vault), type(uint256).max);
        vault.deposit(1_000e6, fan);
        vm.stopPrank();

        vm.startPrank(fan2);
        token.approve(address(vault), type(uint256).max);
        uint256 shares = vault.deposit(1_000e6, fan2);
        vm.stopPrank();

        assertEq(shares, 1_000e6);
        assertEq(vault.totalSupply(), 2_000e6);
    }
}
