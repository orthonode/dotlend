// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IPriceOracle {
    function getPrice(address token) external view returns (uint256);
}

/// @title CollateralVault — vDOT deposit and health factor management
/// @notice Users deposit MockvDOT as collateral. LendingPool updates debt balances.
///         Health factor = (collateralUSD * LIQUIDATION_THRESHOLD * 1e18) / (debtUSD * 100)
///         Health factor < 1e18 → position is liquidatable
contract CollateralVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    /// @notice Loan-to-value ratio — users borrow up to 70% of collateral USD value
    uint256 public constant LTV = 70;

    /// @notice Liquidation threshold — positions liquidatable when debt/collateral > 80%
    uint256 public constant LIQUIDATION_THRESHOLD = 80;

    IERC20 public immutable vdot;
    IPriceOracle public immutable oracle;

    /// @notice Address of LendingPool — only it can set debt and seize collateral
    address public lendingPool;

    /// @notice vDOT collateral balance per user
    mapping(address => uint256) public collateralBalance;

    /// @notice HOLLAR debt balance per user (in 1e18, set by LendingPool)
    mapping(address => uint256) public debtBalance;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event LendingPoolSet(address indexed pool);

    modifier onlyLendingPool() {
        require(msg.sender == lendingPool, "Vault: only lending pool");
        _;
    }

    constructor(address _vdot, address _oracle) {
        require(_vdot != address(0), "Vault: zero vdot");
        require(_oracle != address(0), "Vault: zero oracle");
        vdot = IERC20(_vdot);
        oracle = IPriceOracle(_oracle);
    }

    /// @notice Set the LendingPool address — owner only, called once after deployment
    function setLendingPool(address pool) external onlyOwner {
        require(pool != address(0), "Vault: zero pool");
        lendingPool = pool;
        emit LendingPoolSet(pool);
    }

    /// @notice Deposit vDOT as collateral
    /// @param amount Amount of vDOT in 1e18
    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "Vault: zero amount");
        vdot.safeTransferFrom(msg.sender, address(this), amount);
        collateralBalance[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    /// @notice Withdraw vDOT collateral — reverts if withdrawal would breach LTV
    /// @param amount Amount of vDOT in 1e18
    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "Vault: zero amount");
        require(collateralBalance[msg.sender] >= amount, "Vault: insufficient collateral");

        uint256 newCollateral = collateralBalance[msg.sender] - amount;

        if (debtBalance[msg.sender] > 0) {
            uint256 vdotPrice = oracle.getPrice(address(vdot));
            uint256 newCollateralUSD = (newCollateral * vdotPrice) / 1e18;
            // Enforce LTV: debt <= collateral * LTV / 100
            require(
                debtBalance[msg.sender] * 100 <= newCollateralUSD * LTV,
                "Vault: below LTV after withdrawal"
            );
        }

        collateralBalance[msg.sender] = newCollateral;
        vdot.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Get USD value of a user's collateral — 1e18 scaled
    /// @param user User address
    /// @return USD value of collateral
    function getCollateralValue(address user) external view returns (uint256) {
        if (collateralBalance[user] == 0) return 0;
        uint256 vdotPrice = oracle.getPrice(address(vdot));
        return (collateralBalance[user] * vdotPrice) / 1e18;
    }

    /// @notice Get health factor for a user
    ///         Returns type(uint256).max if no debt (fully healthy)
    ///         Returns < 1e18 if liquidatable
    /// @param user User address
    /// @return Health factor scaled to 1e18
    function getHealthFactor(address user) external view returns (uint256) {
        if (debtBalance[user] == 0) return type(uint256).max;
        uint256 vdotPrice = oracle.getPrice(address(vdot));
        uint256 collateralUSD = (collateralBalance[user] * vdotPrice) / 1e18;
        // healthFactor = (collateralUSD * LIQUIDATION_THRESHOLD * 1e18) / (debtUSD * 100)
        return (collateralUSD * LIQUIDATION_THRESHOLD * 1e18) / (debtBalance[user] * 100);
    }

    /// @notice Update a user's debt — called by LendingPool only
    /// @param user User address
    /// @param debt New debt amount in 1e18
    function setDebt(address user, uint256 debt) external onlyLendingPool {
        debtBalance[user] = debt;
    }

    /// @notice Seize collateral during liquidation — called by LendingPool only
    /// @param user Borrower address
    /// @param amount Amount of vDOT to seize
    /// @param recipient Address to receive the seized vDOT (liquidator)
    function seizeCollateral(address user, uint256 amount, address recipient) external onlyLendingPool {
        require(collateralBalance[user] >= amount, "Vault: insufficient collateral to seize");
        collateralBalance[user] -= amount;
        vdot.safeTransfer(recipient, amount);
    }
}
