// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {ThetaSingleton} from "./ThetaSingleton.sol";

/// @title TipsterVault
/// @notice ERC-4626-style share token; Bet Token custody lives in the singleton.
contract TipsterVault is ERC20, IERC4626, ReentrancyGuard {
    using SafeERC20 for IERC20;

    ThetaSingleton public immutable singleton;
    uint256 public immutable vaultId;
    address public immutable tipster;
    IERC20 private immutable _asset;

    error OnlySingleton();
    error NotWhitelisted();

    modifier onlyWhitelisted() {
        if (!singleton.isWhitelisted(msg.sender)) revert NotWhitelisted();
        _;
    }

    constructor(
        address singleton_,
        uint256 vaultId_,
        address tipster_,
        string memory name_,
        string memory symbol_
    ) ERC20(name_, symbol_) {
        singleton = ThetaSingleton(singleton_);
        vaultId = vaultId_;
        tipster = tipster_;
        _asset = IERC20(singleton.betToken());
    }

    function asset() public view returns (address) {
        return address(_asset);
    }

    function totalAssets() public view returns (uint256) {
        return singleton.vaultTotalAssets(vaultId);
    }

    function deposit(uint256 assets, address receiver) public onlyWhitelisted nonReentrant returns (uint256 shares) {
        shares = previewDeposit(assets);
        _deposit(assets, receiver, shares);
    }

    function mint(uint256 shares, address receiver) public onlyWhitelisted nonReentrant returns (uint256 assets) {
        assets = previewMint(shares);
        _deposit(assets, receiver, shares);
    }

    function withdraw(uint256 assets, address receiver, address owner)
        public
        onlyWhitelisted
        nonReentrant
        returns (uint256 shares)
    {
        shares = previewWithdraw(assets);
        _withdraw(shares, receiver, owner);
    }

    function redeem(uint256 shares, address receiver, address owner)
        public
        onlyWhitelisted
        nonReentrant
        returns (uint256 assets)
    {
        assets = previewRedeem(shares);
        _withdraw(shares, receiver, owner);
    }

    function previewDeposit(uint256 assets) public view returns (uint256) {
        return _convertToShares(assets, totalAssets(), totalSupply());
    }

    function previewMint(uint256 shares) public view returns (uint256) {
        uint256 supply = totalSupply();
        uint256 total = totalAssets();
        if (supply == 0) return shares;
        return _mulDivUp(shares, total, supply);
    }

    function previewWithdraw(uint256 assets) public view returns (uint256) {
        return _convertToShares(assets, totalAssets(), totalSupply());
    }

    function previewRedeem(uint256 shares) public view returns (uint256) {
        return _convertToAssets(shares, totalAssets(), totalSupply());
    }

    function convertToShares(uint256 assets) external view returns (uint256) {
        return _convertToShares(assets, totalAssets(), totalSupply());
    }

    function convertToAssets(uint256 shares) external view returns (uint256) {
        return _convertToAssets(shares, totalAssets(), totalSupply());
    }

    function maxDeposit(address) external pure returns (uint256) {
        return type(uint256).max;
    }

    function maxMint(address) external pure returns (uint256) {
        return type(uint256).max;
    }

    function maxWithdraw(address owner) external view returns (uint256) {
        return _convertToAssets(balanceOf(owner), singleton.vaultFreeBalance(vaultId), totalSupply());
    }

    function maxRedeem(address owner) external view returns (uint256) {
        uint256 liquid = singleton.vaultFreeBalance(vaultId);
        uint256 assets = _convertToAssets(balanceOf(owner), totalAssets(), totalSupply());
        if (assets == 0) return 0;
        return (balanceOf(owner) * liquid) / assets;
    }

    function _deposit(uint256 assets, address receiver, uint256 shares) internal {
        _asset.safeTransferFrom(msg.sender, address(singleton), assets);
        uint256 minted = singleton.depositFor(vaultId, receiver, assets);
        require(minted == shares, "share mismatch");
        _mint(receiver, shares);
    }

    function _withdraw(uint256 shares, address receiver, address owner) internal {
        uint256 assets = previewRedeem(shares);
        if (msg.sender != owner) {
            _spendAllowance(owner, msg.sender, shares);
        }
        _burn(owner, shares);
        singleton.withdrawAssets(vaultId, receiver, shares, assets);
    }

    function _convertToShares(uint256 assets, uint256 total, uint256 supply) internal pure returns (uint256) {
        if (supply == 0) return assets;
        if (total == 0) return 0;
        return (assets * supply) / total;
    }

    function _convertToAssets(uint256 shares, uint256 total, uint256 supply) internal pure returns (uint256) {
        if (supply == 0) return 0;
        return (shares * total) / supply;
    }

    function _mulDivUp(uint256 x, uint256 y, uint256 denominator) internal pure returns (uint256) {
        return (x * y + denominator - 1) / denominator;
    }
}
