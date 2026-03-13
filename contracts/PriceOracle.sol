// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title PriceOracle — authorized price feed for DotLend
/// @notice Testnet: authorized address posts prices manually.
///         Mainnet path: replace with Hyperbridge ISMP for trustless XCM price feeds.
contract PriceOracle is Ownable {
    /// @notice Stale price threshold — 1 hour
    uint256 public constant STALE_THRESHOLD = 3600;

    /// @notice Price for each token in USD, scaled to 1e18
    ///         e.g. vDOT at $8.50 → 8.5e18
    ///              USDH at $1.00 → 1e18
    mapping(address => uint256) public prices;

    /// @notice Timestamp of last price update per token
    mapping(address => uint256) public lastUpdated;

    /// @notice Address authorized to post prices
    address public authorizedOracle;

    /// @notice Maximum allowed price deviation in basis points — default 20%
    uint256 public maxDeviationBps = 2000;

    event PriceUpdated(address indexed token, uint256 price, uint256 timestamp);
    event AuthorizedOracleSet(address indexed oracle);
    event MaxDeviationUpdated(uint256 bps);

    modifier onlyOracle() {
        require(msg.sender == authorizedOracle, "PriceOracle: unauthorized");
        _;
    }

    /// @notice Post prices for a token
    /// @param token Token address
    /// @param price USD price scaled to 1e18
    function submitPrice(address token, uint256 price) external onlyOracle {
        require(token != address(0), "PriceOracle: zero address");
        require(price > 0, "PriceOracle: zero price");
        if (prices[token] > 0) {
            uint256 diff = price > prices[token] ? price - prices[token] : prices[token] - price;
            require(diff * 10000 / prices[token] <= maxDeviationBps, "Price deviation too large");
        }
        prices[token] = price;
        lastUpdated[token] = block.timestamp;
        emit PriceUpdated(token, price, block.timestamp);
    }

    /// @notice Get current price for a token — reverts if stale or not set
    /// @param token Token address
    /// @return price USD price scaled to 1e18
    function getPrice(address token) external view returns (uint256) {
        require(lastUpdated[token] != 0, "PriceOracle: no price");
        require(
            block.timestamp - lastUpdated[token] <= STALE_THRESHOLD,
            "PriceOracle: stale price"
        );
        return prices[token];
    }

    /// @notice Set the authorized oracle address — owner only
    /// @param oracle New oracle address
    function setAuthorizedOracle(address oracle) external onlyOwner {
        require(oracle != address(0), "PriceOracle: zero address");
        authorizedOracle = oracle;
        emit AuthorizedOracleSet(oracle);
    }

    /// @notice Set max allowed price deviation — 10000 = 100% (disables check)
    function setMaxDeviationBps(uint256 bps) external onlyOwner {
        require(bps <= 10000, "Max 100%");
        maxDeviationBps = bps;
        emit MaxDeviationUpdated(bps);
    }
}
