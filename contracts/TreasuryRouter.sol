// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IUSDH {
    function burn(uint256 amount) external;
    function mint(address to, uint256 amount) external;
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title TreasuryRouter — passed as _usdh to LendingPool constructor.
///
/// Revenue model (MakerDAO-style):
///   100% of repayment/liquidation flows go to the protocol treasury.
///   USDH is a stablecoin — burning it destroys borrowing capacity for
///   zero token-value benefit. Instead, treasury governance directs funds to:
///     Phase 1 (testnet):  operations, hackathon prizes, liquidity
///     Phase 2 (mainnet):  buy DOT/vDOT on open market → distribute to stakers
///     Phase 3 (token):    buy DOTLEND governance token → burn
///
/// Intercept strategy:
///   LendingPool.repay() calls in order:
///     (A) usdh.transferFrom(user, address(this), amount)  — pull from user
///     (B) usdh.burn(amount)                               — burn from pool
///
///   We intercept at (A): when transferFrom(user, lendingPool, amount) is called,
///   the router pulls USDH from user directly into itself, sends 100% to
///   treasury. When (B) usdh.burn(amount) is called, it's a no-op.
///
/// Deploy order:
///   1. Deploy TreasuryRouter(usdhAddress, treasuryAddress)
///   2. Deploy CollateralVault(collateral, oracle)
///   3. Deploy LendingPool(vault, ROUTER_ADDRESS, oracle, collateral)
///   4. vault.setLendingPool(pool)
///   5. router.setLendingPool(pool)  ← so router knows pool address
contract TreasuryRouter is Ownable {
    IUSDH public immutable usdh;
    address public treasury;
    address public lendingPool;

    uint256 public totalFeesCollected;

    event ProtocolFeeCollected(uint256 amount);
    event TreasuryUpdated(address indexed newTreasury);
    event LendingPoolSet(address indexed pool);

    constructor(address _usdh, address _treasury) {
        require(_usdh   != address(0), "TR: zero usdh");
        require(_treasury != address(0), "TR: zero treasury");
        usdh   = IUSDH(_usdh);
        treasury = _treasury;
    }

    function setLendingPool(address _pool) external onlyOwner {
        require(_pool != address(0), "TR: zero pool");
        lendingPool = _pool;
        emit LendingPoolSet(_pool);
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "TR: zero addr");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /// @notice Called by LendingPool as "transferFrom(user, lendingPool, amount)".
    ///         If `to` == lendingPool, this is a repay/liquidation — intercept
    ///         and route 100% to treasury. Otherwise forward transparently.
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (to == lendingPool && amount > 0) {
            // Intercept: pull from user into router, send 100% to treasury
            usdh.transferFrom(from, address(this), amount);
            usdh.transfer(treasury, amount);
            totalFeesCollected += amount;
            emit ProtocolFeeCollected(amount);
            return true;
        }
        return usdh.transferFrom(from, to, amount);
    }

    /// @notice Called by LendingPool after transferFrom — already handled, no-op.
    function burn(uint256) external {
        // Revenue already routed to treasury in transferFrom() — nothing to burn
    }

    /// @notice Forwards mint() to real USDH
    function mint(address to, uint256 amount) external {
        usdh.mint(to, amount);
    }
}
