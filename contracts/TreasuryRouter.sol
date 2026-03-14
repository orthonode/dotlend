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
///   Only accrued stability fee goes to treasury.
///   Principal is burned — correct USDH peg mechanics.
///
/// Principal tracking:
///   mint(user, amount) is called on borrow — we record principal here.
///   On repay, transferFrom intercepts and splits:
///     principalPortion → burned
///     feePortion (interest) → treasury
contract TreasuryRouter is Ownable {
    IUSDH public immutable usdh;
    address public treasury;
    address public lendingPool;

    /// @notice Tracks original borrowed principal per user
    mapping(address => uint256) public principalDebt;

    uint256 public totalFeesCollected;
    uint256 public totalBurned;

    event ProtocolFeeCollected(address indexed user, uint256 feeAmount);
    event PrincipalBurned(address indexed user, uint256 burnAmount);
    event TreasuryUpdated(address indexed newTreasury);
    event LendingPoolSet(address indexed pool);

    constructor(address _usdh, address _treasury) {
        require(_usdh     != address(0), "TR: zero usdh");
        require(_treasury != address(0), "TR: zero treasury");
        usdh     = IUSDH(_usdh);
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

    /// @notice Called by LendingPool.borrow() — intercept to record principal.
    function mint(address to, uint256 amount) external {
        principalDebt[to] += amount;
        usdh.mint(to, amount);
    }

    /// @notice Called by LendingPool.repay() via transferFrom.
    ///         Splits: principal → burn, interest → treasury.
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (to == lendingPool && amount > 0) {
            // Pull USDH from user into router
            usdh.transferFrom(from, address(this), amount);

            // Split principal vs fee
            uint256 principal = principalDebt[from];
            uint256 principalPortion = amount <= principal ? amount : principal;
            uint256 feePortion = amount - principalPortion;

            // Update tracked principal
            if (principalPortion > 0) {
                principalDebt[from] = principal - principalPortion;
            }

            // Burn the principal
            if (principalPortion > 0) {
                usdh.burn(principalPortion);
                totalBurned += principalPortion;
                emit PrincipalBurned(from, principalPortion);
            }

            // Send fee to treasury
            if (feePortion > 0) {
                usdh.transfer(treasury, feePortion);
                totalFeesCollected += feePortion;
                emit ProtocolFeeCollected(from, feePortion);
            }

            return true;
        }
        return usdh.transferFrom(from, to, amount);
    }

    /// @notice Called by LendingPool after transferFrom — already handled.
    function burn(uint256) external {
        // Principal already burned in transferFrom() — no-op
    }
}
