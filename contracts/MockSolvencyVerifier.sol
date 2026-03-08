// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MockSolvencyVerifier
/// @notice Test double for SolvencyVerifier — no actual ZK verification.
///         Controlled by shouldAccept flag for positive/negative test paths.
/// @dev Deploy instead of SolvencyVerifier in hardhat tests only.

contract MockSolvencyVerifier {
    bool public shouldAccept;

    constructor(bool _shouldAccept) {
        shouldAccept = _shouldAccept;
    }

    function setShouldAccept(bool _value) external {
        shouldAccept = _value;
    }

    function verifySolvency(
        bytes calldata, /* proof */
        uint256[] calldata publicInputs
    ) external view returns (bool) {
        require(publicInputs.length == 3, "MockVerifier: wrong input count");
        return shouldAccept;
    }
}
