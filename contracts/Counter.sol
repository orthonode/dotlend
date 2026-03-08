// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Counter — scaffold verification contract
/// @notice Minimal counter to verify Hardhat + PolkaVM deployment pipeline
contract Counter {
    uint256 public count;

    event Incremented(address indexed caller, uint256 newCount);

    function increment() external {
        count += 1;
        emit Incremented(msg.sender, count);
    }

    function reset() external {
        count = 0;
    }
}
