// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface ICollateralVault {
    function getCollateralValue(address user) external view returns (uint256);
    function getHealthFactor(address user) external view returns (uint256);
    function setDebt(address user, uint256 debt) external;
    function seizeCollateral(address user, uint256 amount, address recipient) external;
    function debtBalance(address user) external view returns (uint256);
    function collateralBalance(address user) external view returns (uint256);
}

interface IPriceOracle {
    function getPrice(address token) external view returns (uint256);
}

interface IMintBurn {
    function mint(address to, uint256 amount) external;
    function burn(uint256 amount) external;
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}


/// @title LendingPool — borrow, repay, and liquidate USDH against vDOT collateral
/// @notice Stability fee accrues on every interaction via block.timestamp.
///         No cron needed — interest is lazily updated per user.
contract LendingPool is Ownable, ReentrancyGuard {
    /// @notice Stability fee in basis points — 5 bps = 0.5% per year
    uint256 public constant STABILITY_FEE = 5;
    uint256 public constant FEE_PRECISION = 10000;
    uint256 public constant SECONDS_PER_YEAR = 365 days;

    /// @notice Liquidation bonus — liquidator receives 5% extra collateral
    uint256 public constant LIQUIDATION_BONUS = 5;
    uint256 public constant BONUS_PRECISION = 100;

    ICollateralVault public immutable vault;
    IMintBurn public immutable usdh;
    IPriceOracle public immutable oracle;
    address public immutable vdot;

    /// @notice Timestamp of last interest accrual per user
    mapping(address => uint256) public lastAccrualTime;

    event Borrowed(address indexed user, uint256 usdhAmount);
    event Repaid(address indexed user, uint256 usdhAmount);
    event Liquidated(
        address indexed borrower,
        address indexed liquidator,
        uint256 debtRepaid,
        uint256 collateralSeized
    );
    event InterestAccrued(address indexed user, uint256 interest);

    constructor(
        address _vault,
        address _usdh,
        address _oracle,
        address _vdot
    ) {
        require(_vault != address(0), "Pool: zero vault");
        require(_usdh != address(0), "Pool: zero usdh");
        require(_oracle != address(0), "Pool: zero oracle");
        require(_vdot != address(0), "Pool: zero vdot");
        vault = ICollateralVault(_vault);
        usdh = IMintBurn(_usdh);
        oracle = IPriceOracle(_oracle);
        vdot = _vdot;
    }

    /// @notice Accrue stability fee interest for a user
    function accrueInterest(address user) public {
        uint256 debt = vault.debtBalance(user);
        if (debt == 0) {
            lastAccrualTime[user] = block.timestamp;
            return;
        }
        uint256 last = lastAccrualTime[user];
        if (last == 0 || block.timestamp <= last) return;

        uint256 elapsed = block.timestamp - last;
        uint256 interest = (debt * STABILITY_FEE * elapsed) / (FEE_PRECISION * SECONDS_PER_YEAR);

        if (interest > 0) {
            vault.setDebt(user, debt + interest);
            emit InterestAccrued(user, interest);
        }
        lastAccrualTime[user] = block.timestamp;
    }

    /// @notice Borrow USDH against deposited vDOT collateral
    function borrow(uint256 usdhAmount) external nonReentrant {
        require(usdhAmount > 0, "Pool: zero amount");
        accrueInterest(msg.sender);

        uint256 collateralUSD = vault.getCollateralValue(msg.sender);
        require(collateralUSD > 0, "Pool: no collateral");

        uint256 currentDebt = vault.debtBalance(msg.sender);
        uint256 newDebt = currentDebt + usdhAmount;

        require(newDebt * 100 <= collateralUSD * 70, "Pool: exceeds LTV");

        vault.setDebt(msg.sender, newDebt);
        if (lastAccrualTime[msg.sender] == 0) {
            lastAccrualTime[msg.sender] = block.timestamp;
        }

        usdh.mint(msg.sender, usdhAmount);
        emit Borrowed(msg.sender, usdhAmount);
    }

    /// @notice Repay USDH debt
    function repay(uint256 usdhAmount) external nonReentrant {
        require(usdhAmount > 0, "Pool: zero amount");
        accrueInterest(msg.sender);

        uint256 debt = vault.debtBalance(msg.sender);
        require(debt > 0, "Pool: no debt");

        uint256 repayAmount = usdhAmount > debt ? debt : usdhAmount;

        usdh.transferFrom(msg.sender, address(this), repayAmount);
        usdh.burn(repayAmount);

        vault.setDebt(msg.sender, debt - repayAmount);
        lastAccrualTime[msg.sender] = block.timestamp;

        emit Repaid(msg.sender, repayAmount);
    }

    /// @notice Liquidate an undercollateralized position
    function liquidate(address borrower) external nonReentrant {
        accrueInterest(borrower);

        uint256 healthFactor = vault.getHealthFactor(borrower);
        require(healthFactor < 1e18, "Pool: position healthy");

        uint256 debt = vault.debtBalance(borrower);
        require(debt > 0, "Pool: no debt");

        usdh.transferFrom(msg.sender, address(this), debt);
        usdh.burn(debt);

        uint256 vdotPrice = oracle.getPrice(vdot);
        uint256 debtInVdot = (debt * 1e18) / vdotPrice;
        uint256 collateralToSeize = debtInVdot + (debtInVdot * LIQUIDATION_BONUS) / BONUS_PRECISION;

        uint256 actualCollateral = vault.collateralBalance(borrower);
        if (collateralToSeize > actualCollateral) {
            collateralToSeize = actualCollateral;
        }

        vault.setDebt(borrower, 0);
        // Vault sends vDOT directly to liquidator — no IERC20 needed in this contract
        vault.seizeCollateral(borrower, collateralToSeize, msg.sender);

        emit Liquidated(borrower, msg.sender, debt, collateralToSeize);
    }
}
