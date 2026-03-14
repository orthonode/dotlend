// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface ISolvencyVerifier {
    function verifySolvency(bytes calldata proof, uint256[] calldata publicInputs) external view returns (bool);
}

/// @title SolvencyGateway
/// @notice Standalone contract for publishing ZK solvency proofs.
///         Decoupled from LendingPool to stay within PolkaVM initcode limits.
///
/// Public inputs layout:
///   [0] total_collateral_value  -- sum of all collateral values (USDH-wei)
///   [1] total_debt              -- sum of all debts (USDH-wei)
///   [2] oracle_timestamp        -- UNIX timestamp of price snapshot
///
/// Anyone can call publishSolvencyProof — permissionless.
/// Owner sets the verifier once (immutable after that).
contract SolvencyGateway is Ownable {
    ISolvencyVerifier public solvencyVerifier;

    event SolvencyProven(
        uint256 totalCollateral,
        uint256 totalDebt,
        uint256 timestamp
    );
    event SolvencyVerifierSet(address indexed verifier);

    /// @notice Set the verifier — owner only, one-time
    function setSolvencyVerifier(address _verifier) external onlyOwner {
        require(address(solvencyVerifier) == address(0), "Gateway: verifier already set");
        require(_verifier != address(0), "Gateway: zero verifier");
        solvencyVerifier = ISolvencyVerifier(_verifier);
        emit SolvencyVerifierSet(_verifier);
    }

    /// @notice Publish a ZK solvency proof — permissionless
    function publishSolvencyProof(
        bytes calldata proof,
        uint256[] calldata publicInputs
    ) external {
        require(address(solvencyVerifier) != address(0), "Gateway: verifier not set");
        require(publicInputs.length == 3, "Gateway: wrong input count");
        require(
            solvencyVerifier.verifySolvency(proof, publicInputs),
            "Gateway: invalid solvency proof"
        );
        emit SolvencyProven(publicInputs[0], publicInputs[1], publicInputs[2]);
    }
}
