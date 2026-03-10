// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IHOLLAR {
    function burn(uint256 amount) external;
    function mint(address to, uint256 amount) external;
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title TreasuryRouter — passed as _hollar to LendingPool constructor.
///
/// Intercept strategy:
///   LendingPool.repay() calls in order:
///     (A) hollar.transferFrom(user, address(this), amount)  — pull from user
///     (B) hollar.burn(amount)                               — burn from pool
///
///   We intercept at (A): when transferFrom(user, lendingPool, amount) is called,
///   the router pulls HOLLAR from user directly into itself, does the split
///   immediately (burn 90%, treasury 10%), then transfers 0 to lendingPool.
///   When (B) hollar.burn(0) is called, it's a no-op.
///
///   This works because:
///   - LendingPool calls burn(repayAmount) on address(this) = router
///   - router.burn() just checks balance and ignores (or burns 0)
///   - All the real action already happened in transferFrom()
///
/// Deploy order:
///   1. Deploy TreasuryRouter(hollarAddress, treasuryAddress)
///   2. Deploy CollateralVault(vdot, oracle)
///   3. Deploy LendingPool(vault, ROUTER_ADDRESS, oracle, vdot)
///   4. vault.setLendingPool(pool)
///   5. router.setLendingPool(pool)  ← so router knows pool address
contract TreasuryRouter is Ownable {
    IHOLLAR public immutable hollar;
    address public treasury;
    address public lendingPool;

    uint256 public totalFeesCollected;
    uint256 public totalHollarBurned;

    event ProtocolFeeCollected(uint256 amount);
    event TreasuryUpdated(address indexed newTreasury);

    constructor(address _hollar, address _treasury) {
        require(_hollar   != address(0), "TR: zero hollar");
        require(_treasury != address(0), "TR: zero treasury");
        hollar   = IHOLLAR(_hollar);
        treasury = _treasury;
    }

    function setLendingPool(address _pool) external onlyOwner {
        require(_pool != address(0), "TR: zero pool");
        lendingPool = _pool;
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "TR: zero addr");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /// @notice Called by LendingPool as "transferFrom(user, lendingPool, amount)".
    ///         If `to` == lendingPool, this is a repay/liquidation — intercept and split.
    ///         Otherwise (approval checks, etc.) forward transparently.
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (to == lendingPool && amount > 0) {
            // Intercept: pull from user into router, split immediately
            hollar.transferFrom(from, address(this), amount);
            uint256 fee     = amount / 10;
            uint256 burnAmt = amount - fee;
            hollar.burn(burnAmt);
            totalHollarBurned += burnAmt;
            if (fee > 0) {
                hollar.transfer(treasury, fee);
                totalFeesCollected += fee;
                emit ProtocolFeeCollected(fee);
            }
            // LendingPool thinks it received `amount` — it will call burn(amount) next
            return true;
        }
        return hollar.transferFrom(from, to, amount);
    }

    /// @notice Called by LendingPool after transferFrom — already handled, no-op.
    function burn(uint256) external {
        // Split already done in transferFrom() intercept — nothing to do
    }

    /// @notice Forwards mint() to real HOLLAR
    function mint(address to, uint256 amount) external {
        hollar.mint(to, amount);
    }
}
