// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import {ThetaSingleton} from "../src/ThetaSingleton.sol";
import {TipsterVault} from "../src/TipsterVault.sol";
import {IAzuroLP} from "../src/interfaces/IAzuroLP.sol";
import {MockBetToken} from "./mocks/MockBetToken.sol";
import {MockAzuroCore} from "./mocks/MockAzuroCore.sol";
import {MockAzuroLP} from "./mocks/MockAzuroLP.sol";

contract SingletonTest is Test {
    MockBetToken internal token;
    MockAzuroCore internal core;
    MockAzuroLP internal lp;
    ThetaSingleton internal singleton;

    uint256 internal tipsterPrivateKey = 0xA11CE;
    address internal tipster;
    address internal fan = makeAddr("fan");

    address internal relayer = makeAddr("azuroRelayer");

    function setUp() public {
        tipster = vm.addr(tipsterPrivateKey);
        token = new MockBetToken();
        core = new MockAzuroCore();
        lp = new MockAzuroLP(token, core);
        singleton = new ThetaSingleton(address(token), address(lp), address(core), relayer, address(0));

        singleton.whitelistAddress(tipster);
        singleton.whitelistAddress(fan);

        token.mint(fan, 10_000e6);
        token.mint(tipster, 1_000e6);
    }

    function test_registerTipsterName_uniqueAndUpdatable() public {
        bytes32 pubKeyX = bytes32(uint256(0x1111));
        bytes32 pubKeyY = bytes32(uint256(0x2222));
        bytes32 pubKeyX2 = bytes32(uint256(0x3333));
        bytes32 pubKeyY2 = bytes32(uint256(0x4444));

        vm.prank(tipster);
        singleton.registerTipsterName("pitch_king", pubKeyX, pubKeyY);
        assertEq(singleton.tipsterNames(tipster), "pitch_king");
        assertEq(singleton.tipsterPubKeyX(tipster), pubKeyX);
        assertEq(singleton.tipsterPubKeyY(tipster), pubKeyY);
        assertEq(singleton.lookupTipsterByName("pitch_king"), tipster);

        address other = makeAddr("other");
        singleton.whitelistAddress(other);
        vm.prank(other);
        vm.expectRevert(ThetaSingleton.TipsterNameTaken.selector);
        singleton.registerTipsterName("pitch_king", pubKeyX, pubKeyY);

        vm.prank(tipster);
        singleton.registerTipsterName("new_handle", pubKeyX2, pubKeyY2);
        assertEq(singleton.lookupTipsterByName("pitch_king"), address(0));
        assertEq(singleton.lookupTipsterByName("new_handle"), tipster);
        assertEq(singleton.tipsterPubKeyX(tipster), pubKeyX2);
        assertEq(singleton.tipsterPubKeyY(tipster), pubKeyY2);
    }

    function test_registerTipsterName_revertsOnZeroPublicKey() public {
        vm.prank(tipster);
        vm.expectRevert(ThetaSingleton.InvalidPublicKey.selector);
        singleton.registerTipsterName("pitch_king", bytes32(0), bytes32(uint256(1)));
    }

    function test_whitelist_blocksUnlistedUsers() public {
        address outsider = makeAddr("outsider");

        vm.prank(outsider);
        vm.expectRevert(ThetaSingleton.NotWhitelisted.selector);
        singleton.createVault("Blocked", "BLK");
    }

    function test_whitelist_onlyDeployerCanManage() public {
        address outsider = makeAddr("outsider");

        vm.prank(outsider);
        vm.expectRevert(ThetaSingleton.OnlyDeployer.selector);
        singleton.whitelistAddress(outsider);

        singleton.whitelistAddress(outsider);
        assertTrue(singleton.isWhitelisted(outsider));

        singleton.removeWhitelistAddress(outsider);
        assertFalse(singleton.isWhitelisted(outsider));
    }

    function test_constructorSeedsInitialWhitelist() public {
        ThetaSingleton gated = new ThetaSingleton(address(token), address(lp), address(core), relayer, tipster);
        assertTrue(gated.isWhitelisted(tipster));
        assertFalse(gated.isWhitelisted(fan));
    }

    function test_createVault_permissionless_onePerTipster() public {
        vm.prank(tipster);
        address vaultAddr = singleton.createVault("PitchKing", "PK");
        assertEq(singleton.vaultCount(), 1);
        assertEq(singleton.vaultIdOfTipster(tipster), 1);
        assertEq(singleton.tipsterOf(1), tipster);

        vm.prank(tipster);
        vm.expectRevert(ThetaSingleton.OneVaultPerTipster.selector);
        singleton.createVault("Again", "AG");
    }

    function test_deposit_redeem_without_bets() public {
        TipsterVault vault = _createVault();

        vm.startPrank(fan);
        token.approve(address(vault), type(uint256).max);
        uint256 shares = vault.deposit(1_000e6, fan);
        vm.stopPrank();

        assertEq(shares, 1_000e6);
        assertEq(vault.balanceOf(fan), 1_000e6);
        assertEq(singleton.vaultFreeBalance(1), 1_000e6);

        uint256 before = token.balanceOf(fan);
        vm.prank(fan);
        vault.redeem(shares, fan, fan);
        assertEq(token.balanceOf(fan), before + 1_000e6);
    }

    function test_placeBet_onlyTipster_and_losingBetReducesNav() public {
        TipsterVault vault = _createVault();

        vm.startPrank(fan);
        token.approve(address(vault), type(uint256).max);
        vault.deposit(1_000e6, fan);
        vm.stopPrank();

        uint256 betId = _placeBet(vault, 250e6, 42, 1);

        assertEq(singleton.vaultFreeBalance(1), 750e6);
        assertEq(singleton.vaultTotalAssets(1), 1_000e6);

        lp.resolveLoss(1);
        singleton.syncVault(1);

        assertEq(singleton.vaultTotalAssets(1), 750e6);
        assertEq(uint8(singleton.getVaultBet(betId).lifecycle), uint8(ThetaSingleton.BetLifecycle.Lost));
    }

    function test_winningBet_claimedOnSync_increasesNav() public {
        TipsterVault vault = _createVault();

        vm.startPrank(fan);
        token.approve(address(vault), type(uint256).max);
        vault.deposit(1_000e6, fan);
        vm.stopPrank();

        _placeBet(vault, 200e6, 99, 7);
        token.mint(address(lp), 500e6);
        lp.resolveWin(1, 500e6);

        singleton.syncVault(1);

        assertEq(singleton.vaultFreeBalance(1), 1_300e6);
        assertEq(singleton.vaultTotalAssets(1), 1_300e6);
    }

    function test_redeem_claims_winnings_before_payout() public {
        TipsterVault vault = _createVault();

        vm.startPrank(fan);
        token.approve(address(vault), type(uint256).max);
        uint256 shares = vault.deposit(1_000e6, fan);
        vm.stopPrank();

        _placeBet(vault, 200e6, 5, 1);
        token.mint(address(lp), 400e6);
        lp.resolveWin(1, 400e6);

        uint256 before = token.balanceOf(fan);
        vm.prank(fan);
        vault.redeem(shares, fan, fan);
        assertEq(token.balanceOf(fan), before + 1_200e6);
    }

    function test_redeem_reverts_when_liquidity_locked_in_open_bet() public {
        TipsterVault vault = _createVault();

        vm.startPrank(fan);
        token.approve(address(vault), type(uint256).max);
        uint256 shares = vault.deposit(1_000e6, fan);
        vm.stopPrank();

        _placeBet(vault, 900e6, 1, 1);

        vm.prank(fan);
        vm.expectRevert(ThetaSingleton.InsufficientLiquidity.selector);
        vault.redeem(shares, fan, fan);
    }

    function test_prepareVaultBet_debitsVault_keepsUsdtInSingleton() public {
        TipsterVault vault = _createVault();

        vm.startPrank(fan);
        token.approve(address(vault), type(uint256).max);
        vault.deposit(1_000e6, fan);
        vm.stopPrank();

        uint256 tipsterBefore = token.balanceOf(tipster);
        uint256 singletonBefore = token.balanceOf(address(singleton));

        bytes32 orderHash = keccak256("azuro-order-1");
        uint64 expiresAt = uint64(block.timestamp + 300);

        vm.prank(tipster);
        singleton.prepareVaultBet(1, 250e6, 1e6, orderHash, expiresAt);

        assertEq(singleton.vaultFreeBalance(1), 749e6);
        assertEq(token.balanceOf(tipster), tipsterBefore);
        assertEq(token.balanceOf(address(singleton)), singletonBefore);
        assertEq(token.allowance(address(singleton), relayer), type(uint256).max);

        (address pendingTipster, uint128 stake, uint128 relayerFee, bytes32 storedHash, uint64 storedExpiry, bool active) =
            singleton.pendingVaultBets(1);
        assertEq(pendingTipster, tipster);
        assertEq(stake, 250e6);
        assertEq(relayerFee, 1e6);
        assertEq(storedHash, orderHash);
        assertEq(storedExpiry, expiresAt);
        assertTrue(active);
    }

    function test_isValidSignature_acceptsPreparedTipsterOrder() public {
        TipsterVault vault = _createVault();

        vm.startPrank(fan);
        token.approve(address(vault), type(uint256).max);
        vault.deposit(1_000e6, fan);
        vm.stopPrank();

        bytes32 orderHash = keccak256("azuro-order-2");
        uint64 expiresAt = uint64(block.timestamp + 300);

        vm.prank(tipster);
        singleton.prepareVaultBet(1, 250e6, 1e6, orderHash, expiresAt);

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(tipsterPrivateKey, orderHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        assertEq(singleton.isValidSignature(orderHash, signature), bytes4(0x1626ba7e));
    }

    function test_isValidSignature_rejectsWrongSigner() public {
        TipsterVault vault = _createVault();

        vm.startPrank(fan);
        token.approve(address(vault), type(uint256).max);
        vault.deposit(1_000e6, fan);
        vm.stopPrank();

        bytes32 orderHash = keccak256("azuro-order-3");
        vm.prank(tipster);
        singleton.prepareVaultBet(1, 250e6, 1e6, orderHash, uint64(block.timestamp + 300));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(2, orderHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        assertEq(singleton.isValidSignature(orderHash, signature), bytes4(0xffffffff));
    }

    function test_cancelVaultBetPreparation_restoresFreeBalance() public {
        TipsterVault vault = _createVault();

        vm.startPrank(fan);
        token.approve(address(vault), type(uint256).max);
        vault.deposit(1_000e6, fan);
        vm.stopPrank();

        bytes32 orderHash = keccak256("azuro-order-4");
        vm.prank(tipster);
        singleton.prepareVaultBet(1, 250e6, 1e6, orderHash, uint64(block.timestamp + 300));
        assertEq(singleton.vaultFreeBalance(1), 749e6);

        vm.prank(tipster);
        singleton.cancelVaultBetPreparation(1);
        assertEq(singleton.vaultFreeBalance(1), 1_000e6);
        (, , , , , bool active) = singleton.pendingVaultBets(1);
        assertFalse(active);
    }

    function test_recoverOrphanVaultBet_linksNftAfterErroneousCancel() public {
        TipsterVault vault = _createVault();

        vm.startPrank(fan);
        token.approve(address(vault), type(uint256).max);
        vault.deposit(1_000e6, fan);
        vm.stopPrank();

        bytes32 orderHash = keccak256("azuro-order-orphan");
        uint128 stake = 250e6;
        uint128 relayerFee = 1e6;

        vm.prank(tipster);
        singleton.prepareVaultBet(1, stake, relayerFee, orderHash, uint64(block.timestamp + 300));
        assertEq(singleton.vaultFreeBalance(1), 749e6);

        vm.prank(tipster);
        singleton.cancelVaultBetPreparation(1);
        assertEq(singleton.vaultFreeBalance(1), 1_000e6);

        uint256 azuroTokenId = 42;
        address azuroBetNft = 0x7A1c3FEf712753374C4DCe34254B96faF2B7265B;
        vm.mockCall(
            azuroBetNft,
            abi.encodeWithSelector(IERC721.ownerOf.selector, azuroTokenId),
            abi.encode(address(singleton))
        );

        vm.prank(tipster);
        singleton.recoverOrphanVaultBet(1, address(core), azuroTokenId, 99, 7, stake, relayerFee);

        assertEq(singleton.vaultFreeBalance(1), 749e6);
        assertEq(singleton.betIdByToken(azuroTokenId), 1);
        assertEq(singleton.getVaultBetIds(1).length, 1);
    }

    function test_completeVaultBet_doesNotRevert_whenViewPayoutRevertsForOpenBet() public {
        TipsterVault vault = _createVault();

        vm.startPrank(fan);
        token.approve(address(vault), type(uint256).max);
        vault.deposit(1_000e6, fan);
        vm.stopPrank();

        // Place a bet via the direct LP path (unresolved/open). MockAzuroLP.viewPayout now
        // reverts for unresolved bets, matching real Azuro — vaultTotalAssets/_emitVaultMetrics
        // must not call viewPayout for open bets.
        _placeBet(vault, 250e6, 7, 3);

        // If _betAssetValue still called viewPayout, this would revert.
        assertEq(singleton.vaultTotalAssets(1), 1_000e6);
        assertEq(singleton.getVaultBetIds(1).length, 1);
    }

    function _createVault() internal returns (TipsterVault vault) {
        vm.prank(tipster);
        address vaultAddr = singleton.createVault("Tipster", "TIP");
        vault = TipsterVault(vaultAddr);
    }

    function _placeBet(TipsterVault vault, uint128 amount, uint256 conditionId, uint128 outcomeId)
        internal
        returns (uint256 betId)
    {
        IAzuroLP.ConditionData[] memory conditions = new IAzuroLP.ConditionData[](1);
        conditions[0] = IAzuroLP.ConditionData({
            gameId: 1,
            conditionId: conditionId,
            conditionKind: 0,
            odds: new uint64[](0),
            outcomes: _asArray(outcomeId),
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

        vm.prank(tipster);
        uint256[] memory tokenIds = singleton.placeBet(1, address(core), amount, order, abi.encode(amount));
        betId = singleton.betIdByToken(tokenIds[0]);
        assertEq(tokenIds[0], 1);
        assertEq(singleton.getVaultBetIds(1).length, 1);
    }

    function _asArray(uint128 value) private pure returns (uint128[] memory arr) {
        arr = new uint128[](1);
        arr[0] = value;
    }
}
