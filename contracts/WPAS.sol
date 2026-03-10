// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title WPAS — Wrapped PAS (native Polkadot Asset token)
/// @notice Identical in design to WETH9: deposit native PAS to mint WPAS 1:1,
///         withdraw WPAS to receive native PAS back.
///         WPAS can then be deposited into DotLend's CollateralVault as collateral,
///         enabling native DOT/PAS to back USDH loans without modifying any
///         existing DotLend contracts.
/// @dev No owner or admin — fully permissionless and non-upgradeable.
contract WPAS is ERC20 {
    // ── Events ──────────────────────────────────────────────────────────────

    /// @notice Emitted when native PAS is wrapped into WPAS
    event Deposit(address indexed dst, uint256 wad);

    /// @notice Emitted when WPAS is unwrapped back to native PAS
    event Withdrawal(address indexed src, uint256 wad);

    // ── Constructor ──────────────────────────────────────────────────────────

    constructor() ERC20("Wrapped PAS", "WPAS") {}

    // ── Core ─────────────────────────────────────────────────────────────────

    /// @notice Wrap native PAS into WPAS — sends PAS, receives WPAS 1:1
    /// @dev Can also be triggered by sending PAS directly to this contract
    function deposit() external payable {
        _mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value);
    }

    /// @notice Unwrap WPAS back to native PAS — burns WPAS, sends PAS 1:1
    /// @param wad Amount of WPAS to unwrap (in wei)
    function withdraw(uint256 wad) external {
        require(balanceOf(msg.sender) >= wad, "WPAS: insufficient balance");
        _burn(msg.sender, wad);
        (bool success, ) = payable(msg.sender).call{value: wad}("");
        require(success, "WPAS: transfer failed");
        emit Withdrawal(msg.sender, wad);
    }

    /// @notice Fallback — calling contract with no data wraps native PAS
    receive() external payable {
        _mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value);
    }
}
