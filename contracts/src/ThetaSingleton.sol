// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import {IAzuroCore} from "./interfaces/IAzuroCore.sol";
import {IAzuroLP} from "./interfaces/IAzuroLP.sol";
import {IERC1271} from "./interfaces/IERC1271.sol";
import {PolygonConfig} from "./config/PolygonConfig.sol";
import {TipsterVault} from "./TipsterVault.sol";

/// @title ThetaSingleton
/// @notice Custodies all Bet Token, deploys tipster vaults, and is the sole Azuro caller.
contract ThetaSingleton is ReentrancyGuard, IERC1271 {
    using SafeERC20 for IERC20;

    enum BetLifecycle {
        Open,
        WonClaimable,
        Lost,
        Canceled,
        Claimed
    }

    struct VaultBet {
        uint256 vaultId;
        address core;
        uint256 tokenId;
        uint128 stake;
        uint256 conditionId;
        uint128 outcomeId;
        BetLifecycle lifecycle;
    }

    IERC20 public immutable betToken;
    IAzuroLP public immutable azuroLP;
    IAzuroCore public immutable defaultCore;
    address public immutable azuroRelayer;

    bytes4 private constant ERC1271_MAGIC = 0x1626ba7e;

    struct PendingVaultBet {
        address tipster;
        uint128 stake;
        uint128 relayerFee;
        bytes32 orderHash;
        uint64 expiresAt;
        bool active;
    }

    uint256 public vaultCount;

    mapping(uint256 vaultId => address vault) public vaultOf;
    mapping(uint256 vaultId => address tipster) public tipsterOf;
    mapping(address tipster => uint256 vaultId) public vaultIdOfTipster;
    mapping(uint256 vaultId => uint256 balance) public vaultFreeBalance;
    mapping(uint256 betId => VaultBet) public bets;
    mapping(uint256 tokenId => uint256 betId) public betIdByToken;
    mapping(uint256 vaultId => uint256[]) private _vaultBetIds;
    mapping(uint256 vaultId => PendingVaultBet) public pendingVaultBets;

    bool private _relayerApproved;

    /// @notice Permissionless tipster display names (lowercase `[a-z0-9_]`, 3–20 chars).
    mapping(address tipster => string name) public tipsterNames;
    mapping(bytes32 nameHash => address owner) public tipsterNameOwner;
    /// @notice Uncompressed secp256k1 public key (x, y) for Pear / DH discovery.
    mapping(address tipster => bytes32 pubKeyX) public tipsterPubKeyX;
    mapping(address tipster => bytes32 pubKeyY) public tipsterPubKeyY;

    /// @notice Closed mainnet test gate — only whitelisted EOAs may use user-facing entry points.
    address public immutable deployer;
    mapping(address account => bool allowed) public whitelisted;

    /// @notice Emitted when a tipster creates their vault (one per tipster).
    event VaultCreated(
        uint256 indexed vaultId,
        address indexed vault,
        address indexed tipster,
        string name,
        string symbol
    );

    /// @notice Fan deposits Bet Token into a vault via the share contract.
    event VaultDeposit(
        uint256 indexed vaultId,
        address indexed vault,
        address indexed investor,
        uint256 assets,
        uint256 sharesMinted,
        uint256 freeBalance,
        uint256 totalAssets,
        uint256 shareSupply
    );

    /// @notice Fan redeems vault shares for Bet Token.
    event VaultWithdraw(
        uint256 indexed vaultId,
        address indexed vault,
        address indexed investor,
        uint256 sharesBurned,
        uint256 assetsOut,
        uint256 freeBalance,
        uint256 totalAssets,
        uint256 shareSupply
    );

    /// @notice Tipster placed an Azuro bet from vault liquidity.
    event VaultBetOpened(
        uint256 indexed vaultId,
        address indexed vault,
        address indexed tipster,
        uint256 betId,
        uint256 azuroTokenId,
        address core,
        uint256 conditionId,
        uint128 outcomeId,
        uint128 stake,
        uint256 freeBalance,
        uint256 totalAssets
    );

    /// @notice Bet resolved or payout claimed — used for W/L and ROI indexing.
    event VaultBetClosed(
        uint256 indexed vaultId,
        uint256 indexed betId,
        uint256 indexed azuroTokenId,
        uint8 lifecycle,
        uint128 stake,
        uint128 payout,
        uint256 freeBalance,
        uint256 totalAssets
    );

    /// @notice Periodic vault accounting snapshot (after sync / material state changes).
    event VaultMetrics(
        uint256 indexed vaultId,
        address indexed vault,
        uint256 freeBalance,
        uint256 totalAssets,
        uint256 shareSupply,
        uint256 openBets,
        uint256 pendingClaimable,
        uint256 settledWins,
        uint256 settledLosses
    );

    /// @notice Tipster claimed a unique @handle and published a secp256k1 public key for messaging.
    event TipsterNameRegistered(
        address indexed tipster, string name, bytes32 pubKeyX, bytes32 pubKeyY
    );

    /// @notice Vault liquidity reserved for an Azuro relayer bet (USDT stays in singleton).
    event VaultBetPrepared(
        uint256 indexed vaultId,
        address indexed tipster,
        uint128 stake,
        uint128 relayerFee,
        bytes32 orderHash,
        uint64 expiresAt
    );

    /// @notice Tipster canceled a prepared vault bet before the relayer executed it.
    event VaultBetPreparationCanceled(uint256 indexed vaultId, address indexed tipster);

    /// @notice Deployer updated the closed-test access list.
    event WhitelistUpdated(address indexed account, bool allowed);

    error OneVaultPerTipster();
    error UnknownVault();
    error OnlyVault();
    error OnlyTipster();
    error InsufficientFreeBalance();
    error InsufficientLiquidity();
    error ZeroAmount();
    error InvalidBetToken();
    error BetNotFound();
    error InvalidTipsterName();
    error TipsterNameTaken();
    error InvalidPublicKey();
    error NotWhitelisted();
    error OnlyDeployer();
    error ZeroAddress();
    error NoPendingVaultBet();
    error PendingVaultBetActive();
    error PendingVaultBetExpired();
    error InvalidVaultBetAuthorization();
    error BetAlreadyRecorded();

    modifier onlyVault(uint256 vaultId) {
        if (msg.sender != vaultOf[vaultId]) revert OnlyVault();
        _;
    }

    modifier onlyWhitelisted() {
        if (!whitelisted[msg.sender]) revert NotWhitelisted();
        _;
    }

    modifier onlyDeployer() {
        if (msg.sender != deployer) revert OnlyDeployer();
        _;
    }

    constructor(
        address betToken_,
        address azuroLP_,
        address defaultCore_,
        address azuroRelayer_,
        address initialWhitelist_
    ) {
        if (
            betToken_ == address(0) || azuroLP_ == address(0) || defaultCore_ == address(0)
                || azuroRelayer_ == address(0)
        ) {
            revert InvalidBetToken();
        }
        if (IAzuroLP(azuroLP_).token() != betToken_) revert InvalidBetToken();

        betToken = IERC20(betToken_);
        azuroLP = IAzuroLP(azuroLP_);
        defaultCore = IAzuroCore(defaultCore_);
        azuroRelayer = azuroRelayer_;
        deployer = msg.sender;

        if (initialWhitelist_ != address(0)) {
            _setWhitelisted(initialWhitelist_, true);
        }
    }

    /// @notice Allow a wallet to create vaults, register names, deposit, bet, etc.
    function whitelistAddress(address account) external onlyDeployer {
        _setWhitelisted(account, true);
    }

    /// @notice Revoke closed-test access for a wallet.
    function removeWhitelistAddress(address account) external onlyDeployer {
        _setWhitelisted(account, false);
    }

    function isWhitelisted(address account) external view returns (bool) {
        return whitelisted[account];
    }

    function _setWhitelisted(address account, bool allowed) internal {
        if (account == address(0)) revert ZeroAddress();
        whitelisted[account] = allowed;
        emit WhitelistUpdated(account, allowed);
    }

    function createVault(string calldata name, string calldata symbol)
        external
        onlyWhitelisted
        returns (address vault)
    {
        if (vaultIdOfTipster[msg.sender] != 0) revert OneVaultPerTipster();

        uint256 vaultId = ++vaultCount;
        TipsterVault deployed = new TipsterVault(address(this), vaultId, msg.sender, name, symbol);
        vault = address(deployed);

        vaultOf[vaultId] = vault;
        tipsterOf[vaultId] = msg.sender;
        vaultIdOfTipster[msg.sender] = vaultId;

        _ensureRelayerAllowance();

        emit VaultCreated(vaultId, vault, msg.sender, name, symbol);
        _emitVaultMetrics(vaultId);
    }

    function _ensureRelayerAllowance() internal {
        if (_relayerApproved) return;
        betToken.forceApprove(azuroRelayer, type(uint256).max);
        _relayerApproved = true;
    }

    /// @notice Claim a unique display name shown as @name in the app.
    /// @param pubKeyX First 32 bytes of the uncompressed secp256k1 public key.
    /// @param pubKeyY Second 32 bytes of the uncompressed secp256k1 public key.
    function registerTipsterName(string calldata name, bytes32 pubKeyX, bytes32 pubKeyY) external onlyWhitelisted {
        if (pubKeyX == bytes32(0) || pubKeyY == bytes32(0)) revert InvalidPublicKey();

        bytes32 nameHash = _nameHash(name);

        address existingOwner = tipsterNameOwner[nameHash];
        if (existingOwner != address(0) && existingOwner != msg.sender) revert TipsterNameTaken();

        string memory previous = tipsterNames[msg.sender];
        if (bytes(previous).length > 0) {
            delete tipsterNameOwner[keccak256(bytes(previous))];
        }

        tipsterNameOwner[nameHash] = msg.sender;
        tipsterNames[msg.sender] = name;
        tipsterPubKeyX[msg.sender] = pubKeyX;
        tipsterPubKeyY[msg.sender] = pubKeyY;

        emit TipsterNameRegistered(msg.sender, name, pubKeyX, pubKeyY);
    }

    /// @notice Resolve a registered tipster handle to a wallet address.
    function lookupTipsterByName(string calldata name) external view returns (address tipster) {
        return tipsterNameOwner[_nameHash(name)];
    }

    function _nameHash(string calldata name) internal pure returns (bytes32) {
        bytes memory b = bytes(name);
        uint256 len = b.length;
        if (len < 3 || len > 20) revert InvalidTipsterName();

        for (uint256 i = 0; i < len; i++) {
            bytes1 c = b[i];
            bool isLower = c >= 0x61 && c <= 0x7A;
            bool isDigit = c >= 0x30 && c <= 0x39;
            bool isUnderscore = c == 0x5F;
            if (!isLower && !isDigit && !isUnderscore) revert InvalidTipsterName();
        }

        if (b[0] == 0x5F || b[len - 1] == 0x5F) revert InvalidTipsterName();

        return keccak256(b);
    }

    function depositFor(uint256 vaultId, address fan, uint256 amount)
        external
        onlyVault(vaultId)
        returns (uint256 shares)
    {
        if (amount == 0) revert ZeroAmount();

        uint256 totalBefore = vaultTotalAssets(vaultId);
        uint256 supply = TipsterVault(vaultOf[vaultId]).totalSupply();

        vaultFreeBalance[vaultId] += amount;

        if (supply == 0) {
            shares = amount;
        } else {
            shares = (amount * supply) / totalBefore;
        }
        if (shares == 0) revert ZeroAmount();

        (uint256 freeBalance, uint256 totalAssets, uint256 shareSupply) = _vaultBalances(vaultId);
        emit VaultDeposit(vaultId, vaultOf[vaultId], fan, amount, shares, freeBalance, totalAssets, shareSupply);
        _emitVaultMetrics(vaultId);
    }

    function withdrawAssets(uint256 vaultId, address fan, uint256 sharesBurned, uint256 amount)
        external
        onlyVault(vaultId)
        nonReentrant
    {
        if (amount == 0) revert ZeroAmount();

        syncVault(vaultId);

        if (vaultFreeBalance[vaultId] < amount) revert InsufficientLiquidity();
        vaultFreeBalance[vaultId] -= amount;
        betToken.safeTransfer(fan, amount);

        (uint256 freeBalance, uint256 totalAssets, uint256 shareSupply) = _vaultBalances(vaultId);
        emit VaultWithdraw(
            vaultId, vaultOf[vaultId], fan, sharesBurned, amount, freeBalance, totalAssets, shareSupply
        );
        _emitVaultMetrics(vaultId);
    }

    function placeBet(
        uint256 vaultId,
        address core,
        uint128 amount,
        IAzuroLP.OrderData calldata order,
        bytes calldata data
    ) external onlyWhitelisted nonReentrant returns (uint256[] memory tokenIds) {
        if (tipsterOf[vaultId] != msg.sender) revert OnlyTipster();
        if (amount == 0) revert ZeroAmount();
        if (vaultFreeBalance[vaultId] < amount) revert InsufficientFreeBalance();

        vaultFreeBalance[vaultId] -= amount;
        betToken.forceApprove(address(azuroLP), amount);

        tokenIds = azuroLP.betOrder(core, order, address(this), data);
        if (tokenIds.length == 0) revert BetNotFound();

        uint256 conditionId = order.conditionDatas[0].conditionId;
        uint128 outcomeId = order.conditionDatas[0].outcomes[0];

        for (uint256 i = 0; i < tokenIds.length; i++) {
            _recordVaultBet(vaultId, msg.sender, tokenIds[i], core, conditionId, outcomeId, amount);
        }

        _emitVaultMetrics(vaultId);
    }

    /// @notice Reserve vault liquidity for an Azuro V3 relayer bet (`bettor` = this contract).
    /// @dev USDT never leaves the singleton. The tipster signs the EIP-712 order off-chain;
    ///      Azuro Core validates via `isValidSignature` on this contract.
    /// @param orderHash `hashTypedData` digest of the Azuro `ClientBetData` the tipster will sign.
    function prepareVaultBet(
        uint256 vaultId,
        uint128 stake,
        uint128 relayerFee,
        bytes32 orderHash,
        uint64 expiresAt
    ) external onlyWhitelisted nonReentrant {
        if (tipsterOf[vaultId] != msg.sender) revert OnlyTipster();
        if (stake == 0) revert ZeroAmount();
        if (orderHash == bytes32(0)) revert InvalidVaultBetAuthorization();
        if (expiresAt <= block.timestamp) revert PendingVaultBetExpired();

        uint256 total = uint256(stake) + uint256(relayerFee);
        if (vaultFreeBalance[vaultId] < total) revert InsufficientFreeBalance();
        if (betToken.balanceOf(address(this)) < total) revert InsufficientFreeBalance();

        _ensureRelayerAllowance();

        vaultFreeBalance[vaultId] -= total;
        pendingVaultBets[vaultId] = PendingVaultBet({
            tipster: msg.sender,
            stake: stake,
            relayerFee: relayerFee,
            orderHash: orderHash,
            expiresAt: expiresAt,
            active: true
        });

        emit VaultBetPrepared(vaultId, msg.sender, stake, relayerFee, orderHash, expiresAt);
        _emitVaultMetrics(vaultId);
    }

    /// @notice Cancel a prepared vault bet and restore vault free balance.
    function cancelVaultBetPreparation(uint256 vaultId) external onlyWhitelisted nonReentrant {
        if (tipsterOf[vaultId] != msg.sender) revert OnlyTipster();
        _cancelVaultBetPreparation(vaultId);
    }

    /// @inheritdoc IERC1271
    /// @dev Azuro V3 calls this when `bettor` is this singleton. `signature` is the tipster EOA
    ///      signature over the EIP-712 order digest (`orderHash`).
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        PendingVaultBet memory pending = _findPendingVaultBet(hash);
        if (!pending.active) return bytes4(0xffffffff);
        if (pending.expiresAt <= block.timestamp) return bytes4(0xffffffff);

        address signer = ECDSA.recover(hash, signature);
        if (signer != pending.tipster) return bytes4(0xffffffff);

        return ERC1271_MAGIC;
    }

    /// @notice Record an Azuro bet NFT that the relayer minted to this singleton.
    function completeVaultBet(
        uint256 vaultId,
        address core,
        uint256 azuroTokenId,
        uint256 conditionId,
        uint128 outcomeId,
        uint128 stake
    ) external onlyWhitelisted nonReentrant {
        if (tipsterOf[vaultId] != msg.sender) revert OnlyTipster();
        if (stake == 0) revert ZeroAmount();

        IERC721 azuroBetNft = IERC721(PolygonConfig.AZURO_BET_NFT);
        if (azuroBetNft.ownerOf(azuroTokenId) != address(this)) revert BetNotFound();

        PendingVaultBet memory pending = pendingVaultBets[vaultId];
        if (!pending.active || pending.tipster != msg.sender || pending.stake != stake) {
            revert InvalidVaultBetAuthorization();
        }

        delete pendingVaultBets[vaultId];

        _recordVaultBet(vaultId, msg.sender, azuroTokenId, core, conditionId, outcomeId, stake);
        _emitVaultMetrics(vaultId);
    }

    /// @notice Link an Azuro bet NFT already minted to this singleton when preparation was
    ///         cancelled after the relayer accepted (e.g. client failed to read `betId`).
    function recoverOrphanVaultBet(
        uint256 vaultId,
        address core,
        uint256 azuroTokenId,
        uint256 conditionId,
        uint128 outcomeId,
        uint128 stake,
        uint128 relayerFee
    ) external onlyWhitelisted nonReentrant {
        if (tipsterOf[vaultId] != msg.sender) revert OnlyTipster();
        if (stake == 0) revert ZeroAmount();
        if (betIdByToken[azuroTokenId] != 0) revert BetAlreadyRecorded();
        if (pendingVaultBets[vaultId].active) revert PendingVaultBetActive();

        IERC721 azuroBetNft = IERC721(PolygonConfig.AZURO_BET_NFT);
        if (azuroBetNft.ownerOf(azuroTokenId) != address(this)) revert BetNotFound();

        uint256 restoreDebit = uint256(stake) + uint256(relayerFee);
        if (vaultFreeBalance[vaultId] < restoreDebit) revert InsufficientFreeBalance();
        vaultFreeBalance[vaultId] -= restoreDebit;

        _recordVaultBet(vaultId, msg.sender, azuroTokenId, core, conditionId, outcomeId, stake);
        _emitVaultMetrics(vaultId);
    }

    function _findPendingVaultBet(bytes32 hash) internal view returns (PendingVaultBet memory pending) {
        uint256 count = vaultCount;
        for (uint256 vaultId = 1; vaultId <= count; vaultId++) {
            pending = pendingVaultBets[vaultId];
            if (pending.active && pending.orderHash == hash) {
                return pending;
            }
        }
        return PendingVaultBet({
            tipster: address(0),
            stake: 0,
            relayerFee: 0,
            orderHash: bytes32(0),
            expiresAt: 0,
            active: false
        });
    }

    function _cancelVaultBetPreparation(uint256 vaultId) internal {
        PendingVaultBet memory pending = pendingVaultBets[vaultId];
        if (!pending.active) revert NoPendingVaultBet();

        vaultFreeBalance[vaultId] += pending.stake + pending.relayerFee;
        delete pendingVaultBets[vaultId];

        emit VaultBetPreparationCanceled(vaultId, msg.sender);
        _emitVaultMetrics(vaultId);
    }

    function _recordVaultBet(
        uint256 vaultId,
        address tipster,
        uint256 tokenId,
        address core,
        uint256 conditionId,
        uint128 outcomeId,
        uint128 stake
    ) internal returns (uint256 betId) {
        betId = ++_betNonce;
        bets[betId] = VaultBet({
            vaultId: vaultId,
            core: core,
            tokenId: tokenId,
            stake: stake,
            conditionId: conditionId,
            outcomeId: outcomeId,
            lifecycle: BetLifecycle.Open
        });
        betIdByToken[tokenId] = betId;
        _vaultBetIds[vaultId].push(betId);

        (uint256 freeBalance, uint256 totalAssets,) = _vaultBalances(vaultId);
        emit VaultBetOpened(
            vaultId,
            vaultOf[vaultId],
            tipster,
            betId,
            tokenId,
            core,
            conditionId,
            outcomeId,
            stake,
            freeBalance,
            totalAssets
        );
    }

    uint256 private _betNonce;

    function syncVault(uint256 vaultId) public {
        uint256[] storage ids = _vaultBetIds[vaultId];
        for (uint256 i = 0; i < ids.length; i++) {
            _syncBet(ids[i]);
        }
        _emitVaultMetrics(vaultId);
    }

    function settleBet(uint256 vaultId, uint256 betId) external nonReentrant returns (uint128 payout) {
        VaultBet storage bet = bets[betId];
        if (bet.vaultId != vaultId) revert BetNotFound();
        payout = _claimIfWon(betId);
        _emitVaultMetrics(vaultId);
    }

    function vaultTotalAssets(uint256 vaultId) public view returns (uint256 total) {
        total = vaultFreeBalance[vaultId];
        uint256[] storage ids = _vaultBetIds[vaultId];
        for (uint256 i = 0; i < ids.length; i++) {
            total += _betAssetValue(ids[i]);
        }
    }

    function getVaultBetIds(uint256 vaultId) external view returns (uint256[] memory) {
        return _vaultBetIds[vaultId];
    }

    function getVaultBet(uint256 betId) external view returns (VaultBet memory) {
        return bets[betId];
    }

    function _vaultBalances(uint256 vaultId)
        internal
        view
        returns (uint256 freeBalance, uint256 totalAssets, uint256 shareSupply)
    {
        freeBalance = vaultFreeBalance[vaultId];
        totalAssets = vaultTotalAssets(vaultId);
        shareSupply = TipsterVault(vaultOf[vaultId]).totalSupply();
    }

    function _emitVaultMetrics(uint256 vaultId) internal {
        (uint256 freeBalance, uint256 totalAssets, uint256 shareSupply) = _vaultBalances(vaultId);

        uint256 openBets;
        uint256 pendingClaimable;
        uint256 settledWins;
        uint256 settledLosses;

        uint256[] storage ids = _vaultBetIds[vaultId];
        for (uint256 i = 0; i < ids.length; i++) {
            VaultBet storage bet = bets[ids[i]];
            if (bet.lifecycle == BetLifecycle.Open) {
                openBets++;
            }
            if (bet.lifecycle == BetLifecycle.WonClaimable) {
                openBets++;
                pendingClaimable += azuroLP.viewPayout(bet.core, bet.tokenId);
            }
            if (bet.lifecycle == BetLifecycle.Claimed) {
                settledWins++;
            }
            if (bet.lifecycle == BetLifecycle.Lost) {
                settledLosses++;
            }
        }

        emit VaultMetrics(
            vaultId,
            vaultOf[vaultId],
            freeBalance,
            totalAssets,
            shareSupply,
            openBets,
            pendingClaimable,
            settledWins,
            settledLosses
        );
    }

    function _syncBet(uint256 betId) internal {
        VaultBet storage bet = bets[betId];
        if (bet.lifecycle == BetLifecycle.Claimed || bet.lifecycle == BetLifecycle.Lost
            || bet.lifecycle == BetLifecycle.Canceled) {
            return;
        }

        IAzuroCore core = IAzuroCore(bet.core);
        if (core.isConditionCanceled(bet.conditionId)) {
            bet.lifecycle = BetLifecycle.Canceled;
            vaultFreeBalance[bet.vaultId] += bet.stake;
            _emitBetClosed(betId, bet, bet.stake);
            return;
        }

        (, , , uint64 settledAt, , , IAzuroCore.ConditionState state,) = core.getCondition(bet.conditionId);

        if (state != IAzuroCore.ConditionState.RESOLVED && settledAt == 0) {
            return;
        }

        uint128 payout = azuroLP.viewPayout(bet.core, bet.tokenId);
        if (payout > 0) {
            if (bet.lifecycle != BetLifecycle.Claimed) {
                bet.lifecycle = BetLifecycle.WonClaimable;
                _claimIfWon(betId);
            }
            return;
        }

        bool won = core.isOutcomeWinning(bet.conditionId, bet.outcomeId);
        if (won) {
            bet.lifecycle = BetLifecycle.WonClaimable;
            _claimIfWon(betId);
        } else {
            bet.lifecycle = BetLifecycle.Lost;
            _emitBetClosed(betId, bet, 0);
        }
    }

    function _claimIfWon(uint256 betId) internal returns (uint128 payout) {
        VaultBet storage bet = bets[betId];
        if (bet.lifecycle == BetLifecycle.Claimed || bet.lifecycle == BetLifecycle.Lost) {
            return 0;
        }

        payout = azuroLP.viewPayout(bet.core, bet.tokenId);
        if (payout == 0) {
            return 0;
        }

        uint128 received = azuroLP.withdrawPayout(bet.core, bet.tokenId);
        bet.lifecycle = BetLifecycle.Claimed;
        vaultFreeBalance[bet.vaultId] += received;
        _emitBetClosed(betId, bet, received);
    }

    function _emitBetClosed(uint256 betId, VaultBet storage bet, uint128 payout) internal {
        (uint256 freeBalance, uint256 totalAssets,) = _vaultBalances(bet.vaultId);
        emit VaultBetClosed(
            bet.vaultId,
            betId,
            bet.tokenId,
            uint8(bet.lifecycle),
            bet.stake,
            payout,
            freeBalance,
            totalAssets
        );
    }

    function _betAssetValue(uint256 betId) internal view returns (uint256) {
        VaultBet storage bet = bets[betId];
        if (bet.lifecycle == BetLifecycle.Lost) {
            return 0;
        }
        if (bet.lifecycle == BetLifecycle.Claimed || bet.lifecycle == BetLifecycle.Canceled) {
            return 0;
        }

        IAzuroCore core = IAzuroCore(bet.core);
        if (core.isConditionCanceled(bet.conditionId)) {
            return bet.stake;
        }

        (, , , uint64 settledAt, , , IAzuroCore.ConditionState state,) = core.getCondition(bet.conditionId);

        // Azuro LP `viewPayout` reverts for unresolved/open bets — return stake at risk
        // without touching the LP until the condition is resolved.
        if (state != IAzuroCore.ConditionState.RESOLVED && settledAt == 0) {
            return bet.stake;
        }

        uint128 payout = azuroLP.viewPayout(bet.core, bet.tokenId);
        if (payout > 0) {
            return payout;
        }

        if (core.isOutcomeWinning(bet.conditionId, bet.outcomeId)) {
            return uint256(core.viewPayout(bet.tokenId));
        }
        return 0;
    }
}
