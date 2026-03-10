/// DotLend -- ZK Solvency Circuit
///
/// Proves: sum(collateral_value_i) > sum(debt_i)
/// WITHOUT revealing individual user positions.
///
/// Private inputs:
///   collateral_values[N] -- each user's collateral value in USDH-wei
///                           (i.e. collateral_amount * price / 1e18, already scaled)
///   debt_amounts[N]      -- each user's outstanding debt in USDH-wei
///
/// Public inputs:
///   total_collateral_value -- sum of all collateral values (verifiable by anyone)
///   total_debt             -- sum of all debts (verifiable by anyone)
///   oracle_timestamp       -- timestamp of price used, to detect stale proofs
///
/// Constraints:
///   1. sum(collateral_values) == total_collateral_value  (soundness)
///   2. sum(debt_amounts) == total_debt                   (soundness)
///   3. total_collateral_value > total_debt               (solvency)
///
/// MAX_USERS = 64 -- covers DotLend's user base for hackathon phase.
/// Pad unused slots with (0, 0).

global MAX_USERS: u32 = 64;

fn main(
    // Private: individual positions (hidden from verifier)
    collateral_values: [u64; 64],
    debt_amounts: [u64; 64],
    // Public: aggregate totals and oracle timestamp
    total_collateral_value: pub u64,
    total_debt: pub u64,
    oracle_timestamp: pub u64,
) {
    // Suppress unused variable warning -- timestamp is a public input checked
    // by the on-chain verifier against block.timestamp for staleness.
    let _ = oracle_timestamp;

    // Accumulate sums
    let mut sum_collateral: u64 = 0;
    let mut sum_debt: u64 = 0;

    for i in 0..MAX_USERS {
        sum_collateral = sum_collateral + collateral_values[i];
        sum_debt = sum_debt + debt_amounts[i];
    }

    // Constraint 1 & 2: prover's private data matches public totals
    assert(sum_collateral == total_collateral_value, "collateral mismatch");
    assert(sum_debt == total_debt, "debt mismatch");

    // Constraint 3: protocol is solvent
    assert(sum_collateral > sum_debt, "protocol insolvent");
}
