// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockHOLLAR — testnet mock of Hydration HOLLAR stablecoin
/// @notice USD-pegged stablecoin mock for Westend Asset Hub testing
/// @dev mint() is public for testnet faucet purposes; burn() via ERC20Burnable for LendingPool
contract MockHOLLAR is ERC20, ERC20Burnable, Ownable {
    uint8 private constant _DECIMALS = 18;

    constructor() ERC20("Mock HOLLAR", "HOLLAR") {}

    /// @notice Mint HOLLAR tokens — testnet faucet
    /// @param to Recipient address
    /// @param amount Amount in wei (1e18 = 1 HOLLAR = $1.00)
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }
}
