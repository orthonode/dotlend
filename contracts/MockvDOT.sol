// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockvDOT — testnet mock of Bifrost vDOT
/// @notice Yield-bearing liquid staking token mock for Westend Asset Hub testing
/// @dev mint() is public for testnet faucet purposes only
contract MockvDOT is ERC20, Ownable {
    uint8 private constant _DECIMALS = 18;

    constructor() ERC20("Mock vDOT", "vDOT") {}

    /// @notice Mint vDOT tokens — testnet faucet
    /// @param to Recipient address
    /// @param amount Amount in wei (1e18 = 1 vDOT)
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }
}
