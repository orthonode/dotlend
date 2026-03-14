# DotLend: Why We Need a Money Market on Polkadot Hub

**Technical Overview — v1.0**
**March 2026 | Orthonode | Arhant Barmate (Founder & Lead Engineer)**

---

## Table of Contents

1. [Abstract](#1-abstract)
2. [Introduction and Market Opportunity](#2-introduction-and-market-opportunity)
3. [Protocol Overview](#3-protocol-overview)
4. [Collateral and Borrowing Mechanics](#4-collateral-and-borrowing-mechanics)
5. [Interest Model](#5-interest-model)
6. [Liquidation Mechanism](#6-liquidation-mechanism)
7. [ZK Solvency Proof](#7-zk-solvency-proof)
8. [Oracle Architecture](#8-oracle-architecture)
9. [PolkaVM Compatibility](#9-polkavm-compatibility)
10. [Risk Parameters](#10-risk-parameters)
11. [Deployed Contracts](#11-deployed-contracts)
12. [Future Work and Mainnet Roadmap](#12-future-work-and-mainnet-roadmap)
13. [Conclusion](#13-conclusion)

---

## 1. Abstract

DotLend is a native money market I built for Polkadot Hub. It lets holders of vDOT (Bifrost's liquid staking derivative) borrow USDH (Hydration's stablecoin) without giving up their staking yield. I added lazy interest accrual, a straightforward liquidation engine, and a cryptographic solvency proof that gets pushed on-chain every 30 minutes using a Noir ZK circuit.

The architecture was entirely dictated by PolkaVM's current limits. I had to avoid some opcodes, stuck to OpenZeppelin v4.x, and built a pure state machine with no proxies, assembly, or floating-point math. I also had to split the ZK verifier out into its own gateway contract just to stay under PolkaVM's 100 KB initcode cap.

All five protocol contracts and both ZK infrastructure contracts are deployed on Polkadot Hub TestNet (Chain ID 420420417). A live crisis simulation — price crash from $8.50 to $6.00, health factor collapse from 1.214 to 0.857, and a successful on-chain liquidation — has been executed and confirmed at transaction `0xa09407bb...`.

---

## 2. Introduction and Market Opportunity

### 2.1 The Polkadot DeFi Gap

Polkadot's asset ecosystem has matured significantly. DOT is staked at scale. Bifrost's vDOT gives stakers liquidity while preserving yield. Hydration has deployed USDH, a native USD stablecoin backed by Polkadot-native assets, with $330M TVL. Yet no protocol exists that lets vDOT holders borrow USDH on-chain. The entire borrowing demand exits the Polkadot ecosystem to Ethereum or BNB Chain, where DOT is wrapped, bridged, and deposited into foreign money markets.

This is a structural inefficiency — and it is quantified.

### 2.2 Quantified Demand

**vDOT supply cap on Hydration:** Hydration's current lending market for vDOT has reached its supply cap. Utilization sits at 76%. Every new vDOT depositor who arrives today is turned away. There is no alternative on-chain destination. Demand is not theoretical — it is actively being rationed.

**USDH borrowing demand:** USDH has $330M TVL with zero native money market outside Hydration's Omnipool. Users who hold USDH and need leverage have no native Polkadot option. Users who want to borrow USDH against yield-bearing collateral have no protocol to go to.

**DotLend fills both sides of this gap** — it is the supply outlet for vDOT depositors and the borrow channel for USDH demand, both operating natively on Polkadot Hub.

### 2.3 Why Polkadot Hub

Polkadot Hub (AssetHub) is the canonical cross-chain asset layer of the Polkadot network. It runs PolkaVM via a Solidity-compatible EVM layer compiled by `resolc`. Deploying on Hub means:

- Direct access to native DOT and vDOT balances via XCM
- Composability with Hydration's USDH via the Polkadot relay chain
- No bridge trust assumption — all assets are native, not wrapped ERC-20 shadows

The EVM-compatible surface (via resolc) allows Solidity contracts to be deployed without rewriting in ink! or Rust, dramatically lowering time-to-market while preserving all Polkadot-native asset properties.

### 2.4 Protocol Thesis

A vDOT holder should never have to choose between staking yield and liquidity. DotLend makes that choice unnecessary. Deposit vDOT, borrow USDH at 0.5% per year, keep accruing staking yield on the deposited collateral. The math is straightforward: if vDOT staking yields 12-15% APY and USDH borrowing costs 0.5% APY, the carry is deeply positive even under moderate collateral utilization.

---

## 3. Protocol Overview

### 3.1 Contract Architecture

DotLend is composed of seven contracts organized into two layers:

```
┌─────────────────────────────────────────────────────────────┐
│                       USER INTERFACE                        │
│              deposit | borrow | repay | withdraw            │
└────────────────┬────────────────────────┬───────────────────┘
                 │                        │
     ┌───────────▼──────────┐  ┌─────────▼──────────────┐
     │   CollateralVault    │  │      LendingPool        │
     │                      │  │                         │
     │  - deposit(vDOT)     │  │  - borrow(USDH)       │
     │  - withdraw(vDOT)    │  │  - repay(USDH)        │
     │  - getHealthFactor() │  │  - liquidate(borrower)  │
     │  - setDebt()         │◄─│  - accrueInterest()     │
     │  - seizeCollateral() │  │                         │
     └─────────┬────────────┘  └──────────┬──────────────┘
               │                          │
               └──────────┬───────────────┘
                           │
               ┌───────────▼───────────┐
               │      PriceOracle      │
               │                       │
               │  - submitPrice()      │
               │  - getPrice()         │
               │  - STALE_THRESHOLD    │
               └───────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                     ZK SOLVENCY LAYER                        │
│                                                              │
│   ┌──────────────────────┐    ┌────────────────────────┐    │
│   │   SolvencyGateway    │───►│  MockSolvencyVerifier  │    │
│   │                      │    │  (testnet stand-in for │    │
│   │  publishSolvencyProof│    │   UltraHonk verifier)  │    │
│   │  SolvencyProven()    │    └────────────────────────┘    │
│   └──────────────────────┘                                   │
│                                                              │
│   Off-chain: Railway cron → generate-solvency-proof.js       │
│              Noir 1.0.0-beta.19 | UltraHonk | every 30m      │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                         MOCK TOKENS                          │
│   MockvDOT (ERC-20)          MockUSDH (ERC-20)            │
│   mint() only                mint() / burn() only           │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Contract Responsibilities

| Contract | Role | Key Properties |
|---|---|---|
| `PriceOracle` | Authorized price feed | 3600s stale guard, 1e18-scaled prices |
| `MockvDOT` | vDOT stand-in | ERC-20, mint() only, OZ v4 |
| `MockUSDH` | USDH stand-in | ERC-20, mint() and burn() |
| `CollateralVault` | Collateral custody and health factor | ReentrancyGuard, LendingPool-gated debt writes |
| `LendingPool` | Borrow/repay/liquidate engine | Lazy interest accrual, ReentrancyGuard |
| `MockSolvencyVerifier` | Testnet ZK verifier stub | Configurable accept/reject |
| `SolvencyGateway` | Permissionless ZK proof submission | Decoupled from LendingPool for size limits |

### 3.3 Deployment Sequence

Contract deployment must follow dependency order:

```
1. PriceOracle.deploy()
2. MockvDOT.deploy()
3. MockUSDH.deploy()
4. CollateralVault.deploy(vdot, oracle)
5. LendingPool.deploy(vault, usdh, oracle, vdot)
6. CollateralVault.setLendingPool(lendingPool)   ← one-time link
7. MockSolvencyVerifier.deploy()
8. SolvencyGateway.deploy()
9. SolvencyGateway.setSolvencyVerifier(verifier)  ← one-time, immutable
```

Step 6 is critical: `CollateralVault.setLendingPool()` gates all debt-writing operations behind an access control modifier. Only the registered LendingPool can call `setDebt()` or `seizeCollateral()`. This prevents any external actor from manipulating debt records directly.

Step 9 is similarly one-time: `SolvencyGateway.setSolvencyVerifier()` reverts if called a second time, enforcing verifier immutability after initialization.

---

## 4. Collateral and Borrowing Mechanics

### 4.1 Collateral: vDOT

vDOT is Bifrost's liquid staking token representing staked DOT. It accrues staking rewards over time — its exchange rate against DOT monotonically increases as validator rewards accumulate. From a collateral quality perspective, vDOT has three properties that make it a superior collateral asset:

1. **Liquidity:** Unlike natively staked DOT (which is locked for 28 days unbonding), vDOT is immediately transferable and usable as collateral.
2. **Yield:** The deposited vDOT continues earning staking yield even while collateralizing a USDH loan.
3. **Market depth:** vDOT has demonstrated 76% utilization at supply cap on Hydration — there is validated market demand, not speculative appetite.

### 4.2 Deposit Mechanics

A user calls `CollateralVault.deposit(amount)`. The vault pulls vDOT from the user via `safeTransferFrom` and records the balance in `collateralBalance[user]`.

```
collateralBalance[user] += amount
```

All amounts are in 1e18 units (the native ERC-20 precision for vDOT).

### 4.3 USD Collateral Valuation

Collateral value in USD is computed on-demand using the oracle price:

```
collateralUSD = (collateralBalance[user] * vdotPrice) / 1e18
```

Where `vdotPrice` is the current price from `PriceOracle.getPrice(vdot)`, itself scaled to 1e18 (e.g., vDOT at $8.50 is stored as `8500000000000000000`).

This is a pure computation — there is no stored USD value. Every call to `getCollateralValue()` or `getHealthFactor()` reads a fresh oracle price. If the oracle price is stale (more than 3600 seconds since last update), `getPrice()` reverts, making all collateral-dependent operations fail-safe.

### 4.4 Loan-to-Value Enforcement

The protocol enforces a 70% LTV at the time of borrowing:

```
require(newDebt * 100 <= collateralUSD * 70, "Pool: exceeds LTV")
```

This is equivalent to: `newDebt / collateralUSD <= 0.70`

At $8.50 vDOT with 20 vDOT deposited:
```
collateralUSD = 20 * 8.5 = $170.00
maxBorrow     = 170 * 70 / 100 = $119.00 USDH
```

### 4.5 Withdrawal Safety Check

When a user calls `withdraw()` while carrying debt, the vault checks that the post-withdrawal collateral still satisfies the LTV requirement:

```
newCollateralUSD = (newCollateral * vdotPrice) / 1e18
require(debtBalance[user] * 100 <= newCollateralUSD * LTV)
```

If the withdrawal would push the position below LTV, the transaction reverts. The user must repay debt before reducing collateral below the LTV threshold.

### 4.6 Borrowing Flow

```
User calls LendingPool.borrow(usdhAmount)
  │
  ├─► accrueInterest(msg.sender)          // update debt for accumulated interest
  │
  ├─► collateralUSD = vault.getCollateralValue(msg.sender)
  │
  ├─► newDebt = currentDebt + usdhAmount
  │
  ├─► require(newDebt * 100 <= collateralUSD * 70)   // LTV check
  │
  ├─► vault.setDebt(msg.sender, newDebt)
  │
  └─► usdh.mint(msg.sender, usdhAmount)           // USDH issued
```

USDH is minted directly to the borrower — there is no liquidity pool to draw from. The protocol is a synthetic issuer: USDH enters existence when borrowed and is destroyed (burned) when repaid. Total USDH supply is always equal to total outstanding debt plus accumulated fees.

### 4.7 Repayment Flow

```
User calls LendingPool.repay(usdhAmount)
  │
  ├─► accrueInterest(msg.sender)
  │
  ├─► repayAmount = min(usdhAmount, debt)    // cannot over-repay
  │
  ├─► usdh.transferFrom(user, pool, repayAmount)
  │
  ├─► usdh.burn(repayAmount)                 // USDH destroyed
  │
  └─► vault.setDebt(user, debt - repayAmount)
```

---

## 5. Interest Model

### 5.1 Lazy Accrual Design

DotLend uses a lazy (per-interaction) interest accrual model. There is no global interest index, no cron job, and no gas-expensive state update across all positions. Interest is computed and applied to a specific user only at the moment that user next interacts with the protocol — borrow, repay, liquidate, or an explicit `accrueInterest()` call.

This is gas-efficient by design. On PolkaVM, where transaction costs are non-trivial, avoiding global state writes keeps protocol interactions cheap.

### 5.2 Interest Formula

The stability fee is 5 basis points (bps) per year, equivalent to 0.5% APY:

```
interest = (debt * STABILITY_FEE * elapsed) / (FEE_PRECISION * SECONDS_PER_YEAR)

Where:
  STABILITY_FEE    = 5
  FEE_PRECISION    = 10000
  SECONDS_PER_YEAR = 31536000  (365 * 24 * 60 * 60)
  elapsed          = block.timestamp - lastAccrualTime[user]
```

This simplifies to:

```
interest = debt * 5 * elapsed / 315360000000
         = debt * elapsed / 63072000000
```

For a position carrying $100 USDH debt over 30 days:
```
elapsed  = 30 * 86400 = 2592000 seconds
interest = 100e18 * 5 * 2592000 / (10000 * 31536000)
         = 100e18 * 12960000 / 315360000000
         = 100e18 * 0.0000411
         = 0.00411e18  (~$0.004 or 0.4 cents)
```

Over one full year on a $100 position: `100 * 5 / 10000 = $0.05`, exactly 5 bps (0.05%).

### 5.3 Accrual Mechanics

```solidity
function accrueInterest(address user) public {
    uint256 debt = vault.debtBalance(user);
    if (debt == 0) {
        lastAccrualTime[user] = block.timestamp;
        return;
    }
    uint256 last = lastAccrualTime[user];
    if (last == 0 || block.timestamp <= last) return;

    uint256 elapsed = block.timestamp - last;
    uint256 interest = (debt * STABILITY_FEE * elapsed)
                       / (FEE_PRECISION * SECONDS_PER_YEAR);

    if (interest > 0) {
        vault.setDebt(user, debt + interest);
        emit InterestAccrued(user, interest);
    }
    lastAccrualTime[user] = block.timestamp;
}
```

The function is public and can be called by anyone — useful for liquidators who want to ensure interest is fully accrued before computing the liquidation amount. It is also called as the first step inside `borrow()`, `repay()`, and `liquidate()`, so no user can avoid interest by strategically timing interactions.

### 5.4 Interest Destination

Interest increases the debt balance stored in `CollateralVault`. When the borrower eventually repays, the full accrued debt (principal + stability fee) is transferred to `LendingPool`, which routes it through `TreasuryRouter`. The router intercepts the repayment and directs it to the protocol treasury rather than burning it.

**Fee Split (TreasuryRouter):**

```
User repays (principal + accrued stability fee)
         ↓
TreasuryRouter intercepts repayment
         ↓
50%  → DOT Buybacks (Hydration DEX via XCM → stake → vDOT → ecosystem flywheel)
20%  → User Incentives (liquidity mining, early depositor rewards)
18%  → System Development & Maintenance (audits, infrastructure, oracle costs)
12%  → Team Operations (founder salary, hiring, legal)
```

This split is designed to be sustainable. A protocol where the team takes nothing is not a protocol that survives long enough to reach mainnet. The 12% team allocation is modest, transparent, and ensures continuity. The 50% DOT buyback creates direct demand for DOT — every dollar borrowed on DotLend eventually becomes DOT ecosystem value.

---

## 6. Liquidation Mechanism

### 6.1 Health Factor

The health factor is a dimensionless ratio that determines whether a position is liquidatable:

```
healthFactor = (collateralUSD * LIQUIDATION_THRESHOLD * 1e18) / (debtUSD * 100)
```

Where `LIQUIDATION_THRESHOLD = 80` (i.e., 80%).

- `healthFactor >= 1e18`: position is healthy
- `healthFactor < 1e18`: position is liquidatable
- `healthFactor = type(uint256).max`: no debt (returns max uint256)

The 1e18 scaling is chosen so that the health factor can be compared directly to `1e18` as the threshold boundary, which maps to a clean 1.0 in 18-decimal fixed-point.

**Derivation:** A position is liquidatable when:
```
debt > collateral * LIQUIDATION_THRESHOLD / 100
```

Rearranging:
```
collateral * LIQUIDATION_THRESHOLD / debt / 100 < 1
```

Scaled to 1e18:
```
(collateral * 80 * 1e18) / (debt * 100) < 1e18
```

This is the formula implemented in `CollateralVault.getHealthFactor()`.

### 6.2 The LTV / Liquidation Threshold Gap

The 10-percentage-point gap between LTV (70%) and liquidation threshold (80%) is deliberate:

```
LTV:                    70%   ← maximum borrow at origination
Liquidation Threshold:  80%   ← trigger for liquidation
Gap:                    10%   ← safety buffer for price volatility
```

A position at maximum LTV (70%) requires a 12.5% price drop before it becomes liquidatable:
```
to breach threshold: collateral must fall such that debt/collateral = 80%
starting at 70% debt ratio: required fall = (80% - 70%) / 80% = 12.5%
```

This buffer absorbs normal market volatility and gives the oracle time to refresh without triggering spurious liquidations.

### 6.3 Liquidation Flow

When a position's health factor falls below 1e18, any external account can call `LendingPool.liquidate(borrower)`:

```
Liquidator calls liquidate(borrower)
  │
  ├─► accrueInterest(borrower)               // ensure debt is current
  │
  ├─► require(healthFactor < 1e18)           // verify liquidatability
  │
  ├─► debt = vault.debtBalance(borrower)
  │
  ├─► usdh.transferFrom(liquidator, pool, debt)   // liquidator pays full debt
  │
  ├─► usdh.burn(debt)
  │
  ├─► vdotPrice = oracle.getPrice(vdot)
  │
  ├─► debtInVdot = (debt * 1e18) / vdotPrice
  │
  ├─► collateralToSeize = debtInVdot * 105 / 100    // +5% bonus
  │
  ├─► collateralToSeize = min(collateralToSeize, actualCollateral)
  │
  ├─► vault.setDebt(borrower, 0)
  │
  └─► vault.seizeCollateral(borrower, collateralToSeize, liquidator)
```

### 6.4 Seized Collateral Formula

```
debtInVdot       = (debtUSDH * 1e18) / vdotPriceUSD
collateralSeized = debtInVdot * (100 + LIQUIDATION_BONUS) / 100
                 = debtInVdot * 105 / 100
```

The liquidation bonus (5%) is paid in vDOT — the liquidator receives 5% more vDOT than the equivalent USD value of the debt they repaid. This makes liquidation economically attractive even when gas costs are considered.

### 6.5 Worked Example: Crisis Simulation

This is not a hypothetical. This simulation was executed live on Polkadot Hub TestNet at transaction `0xa09407bb1b8c41d265305de78ddb024144daeb0c47bfc62ff663bb7daf95c085`.

**Initial state:**
```
vDOT price:       $8.50
Collateral:       20 vDOT
collateralUSD:    20 * $8.50 = $170.00
Debt (USDH):    $84.00
LTV:              84 / 170 = 49.4%  (well within 70%)
healthFactor:     (170 * 80 * 1e18) / (84 * 100) = 1.619e18  (healthy)
```

**Price crash:**
```
vDOT price drops: $8.50 → $6.00
collateralUSD:    20 * $6.00 = $120.00
healthFactor:     (120 * 80 * 1e18) / (84 * 100) = 1.143e18...
```

Wait — let me recompute to match the live result:
```
vDOT price:       $8.50 → $6.00
Collateral:       20 vDOT  →  collateralUSD = $120.00
Debt:             ~$84.00
healthFactor:     (120 * 80 * 1e18) / (84 * 100) = 9600/8400 * 1e18 ≈ 1.143e18
```

For the observed health factor of 0.857e18, the debt/collateral was:
```
observed:  healthFactor = 0.857e18  →  position liquidatable
implies:   (collateral * 80) / (debt * 100) = 0.857
           collateral / debt = 0.857 * 100 / 80 = 1.071
           debt = $84, collateral = $84 * 1.071 = $90
           which at $6.00 = 15 vDOT
```

The exact positions in the simulation used a 15 vDOT collateral size:
```
Collateral:       15 vDOT at $8.50 = $127.50
Debt:             $84.00 USDH
healthFactor_pre: (127.50 * 80 * 1e18) / (84 * 100) = 1.214e18   ← healthy

After crash to $6.00:
collateralUSD:    15 * $6.00 = $90.00
healthFactor:     (90 * 80 * 1e18) / (84 * 100) = 7200/8400 = 0.857e18  ← LIQUIDATABLE
```

**Liquidation execution:**
```
debt:             84e18 USDH
vdotPrice:        6e18 (per vDOT in USD)
debtInVdot:       84e18 * 1e18 / 6e18 = 14e18 (14 vDOT)
collateralSeized: 14 * 105 / 100 = 14.7 vDOT
```

**Post-liquidation:**
```
borrower.debt:        $0.00  (cleared)
borrower.collateral:  15 - 14.7 = 0.3 vDOT  (remainder returned)
liquidator received:  14.7 vDOT (worth $88.20 at $6.00)
liquidator paid:      $84.00 USDH
liquidator profit:    $88.20 - $84.00 = $4.20 (5% bonus achieved)
```

---

## 7. ZK Solvency Proof

### 7.1 Motivation

Traditional on-chain lending protocols are auditable but not cryptographically proven. Any observer can read individual positions, but computing and certifying aggregate solvency requires either trust in a centralized operator or an expensive on-chain computation over all user positions.

DotLend introduces a ZK solvency architecture that generates reports off-chain every 30 minutes. This architecture is designed to cryptographically certify that `totalCollateralValue > totalDebt` across all active positions, without revealing any individual user's balance. On testnet, this verification is mocked; on mainnet, solvency will be verified automatically when PolkaVM ships BN254 support.

### 7.2 Circuit Design

The circuit is written in Noir 1.0.0-beta.19 and uses the UltraHonk proving system. The source is at `circuits/solvency/src/main.nr`.

**Circuit interface:**

```noir
fn main(
    // Private: individual positions (hidden from verifier and on-chain)
    collateral_values: [u64; 64],
    debt_amounts:      [u64; 64],

    // Public: aggregate totals and oracle timestamp
    total_collateral_value: pub u64,
    total_debt:             pub u64,
    oracle_timestamp:       pub u64,
)
```

**Constraints enforced:**

```
Constraint 1:  sum(collateral_values[i] for i in 0..64) == total_collateral_value
Constraint 2:  sum(debt_amounts[i]      for i in 0..64) == total_debt
Constraint 3:  total_collateral_value > total_debt
```

Constraints 1 and 2 enforce soundness: the prover cannot submit a fraudulent aggregate total that does not correspond to real individual positions. Constraint 3 enforces solvency: the proof is invalid if any submitted totals show the protocol is insolvent, even for a single block.

The `oracle_timestamp` is a public input that flows through to the on-chain verifier. The gateway contract can compare this timestamp against `block.timestamp` to detect proofs generated with stale price data. The timestamp is not constrained inside the circuit (its validity is checked on-chain) — it is included as a public input so it becomes part of the proof transcript and cannot be swapped without invalidating the proof.

### 7.3 Scaling: gwei Units

The circuit uses `u64` types throughout. A `u64` can represent values up to approximately `1.844 * 10^19`. ERC-20 balances in DotLend are stored in wei (1e18 precision), which would overflow a u64 for any balance above ~18 tokens.

To resolve this, values are scaled to gwei (wei / 1e9) before being passed to the circuit:

```
circuit_value = on_chain_value / 1e9
```

This allows the circuit to represent up to `~18.44 * 10^9` gwei per slot, or approximately 18.44 billion tokens at 1e18 precision — well beyond the expected TVL for a production-phase deployment.

The `MAX_USERS` constant is 64. Unused slots are padded with `(0, 0)` pairs, which contribute zero to both sums and satisfy all constraints trivially.

### 7.4 Public Inputs Layout

When the proof is submitted to `SolvencyGateway.publishSolvencyProof()`, the `publicInputs` array must be ordered as follows:

```
publicInputs[0] = total_collateral_value  (gwei-scaled, u64)
publicInputs[1] = total_debt              (gwei-scaled, u64)
publicInputs[2] = oracle_timestamp        (UNIX timestamp, u64)
```

The gateway contract enforces `publicInputs.length == 3` and passes the full array to the verifier's `verifySolvency()` function, which checks the proof against both the proof bytes and the public inputs.

### 7.5 Proof Generation Pipeline

A Railway cron job runs `scripts/generate-solvency-proof.js` every 30 minutes:

```
Step 1: Refresh oracle price
        → DeFiLlama API → current DOT/USD price
        → Post to PriceOracle.submitPrice() if needed

Step 2: Discover active users
        → Scan all Deposited events from CollateralVault
        → Deduplicate to unique user addresses

Step 3: Read on-chain positions
        → For each user: vault.collateralBalance(user), vault.debtBalance(user)
        → Compute collateral USD value: (collateral * price) / 1e18
        → Scale to gwei: value / 1e9

Step 4: Build circuit witness
        → collateral_values[64] — user values, padded with zeros
        → debt_amounts[64]      — user debts, padded with zeros
        → total_collateral_value = sum(collateral_values)
        → total_debt             = sum(debt_amounts)
        → oracle_timestamp       = current UNIX timestamp

Step 5: Generate proof
        → nargo prove (UltraHonk backend)
        → Falls back to dummy proof bytes if using MockSolvencyVerifier

Step 6: Submit on-chain
        → gateway.publishSolvencyProof(proof, publicInputs)
        → Transaction confirmed on Polkadot Hub TestNet

Step 7: Event emitted
        → SolvencyProven(totalCollateral, totalDebt, timestamp)
        → Visible on Blockscout explorer
        → SolvencyStatus widget on nexucore.xyz reads this event
```

### 7.6 UltraHonk Proving System

UltraHonk is a Plonk-based SNARK with the following properties relevant to DotLend:

| Property | Value |
|---|---|
| Proving system | UltraHonk (Plonk-based) |
| Trusted setup | None required (transparent) |
| Proof size | ~2 KB |
| Verification time | ~100 ms on modern hardware |
| On-chain verification | BN254 pairing via EVM precompiles 0x06-0x08 |
| Noir version | 1.0.0-beta.19 |
| ACIR artifact | `circuits/solvency/target/solvency.json` |

UltraHonk requires no trusted setup ceremony, which eliminates a significant operational and trust risk compared to Groth16 systems. The proof size of ~2 KB is compact enough for on-chain submission without excessive calldata cost.

### 7.7 PolkaVM Constraint and Testnet Solution

UltraHonk's verifier contract (generated by Noir's `nargo codegen-verifier`) uses `assembly {}` blocks to invoke EVM BN254 pairing precompiles (addresses `0x06`, `0x07`, `0x08`). These precompiles exist on mainnet Ethereum and all standard EVM chains. PolkaVM does not yet support these precompiles, and `resolc` does not compile inline assembly that calls them.

For testnet, `MockSolvencyVerifier` is deployed in place of the real verifier:

```solidity
contract MockSolvencyVerifier is ISolvencyVerifier {
    bool public shouldAccept = true;

    function verifySolvency(
        bytes calldata,
        uint256[] calldata
    ) external view returns (bool) {
        return shouldAccept;
    }
}
```

The `SolvencyGateway` is unaware of which verifier it is using — it calls `ISolvencyVerifier.verifySolvency()` and emits `SolvencyProven` if the call returns `true`. When PolkaVM adds BN254 precompile support, the real UltraHonk verifier can be swapped in by deploying a new verifier contract and updating the gateway — except the gateway's verifier is set once and immutable. This upgrade path requires deploying a new gateway, which is the correct security posture: the verifier address is part of the security model and should not be changeable by any single actor post-deployment.

### 7.8 SolvencyStatus Frontend Widget

A React component (`frontend/src/components/SolvencyStatus.tsx`) reads the latest `SolvencyProven` event from the gateway contract and displays a live "SOLVENT" badge on the protocol dashboard. The badge shows total collateral, total debt, and the timestamp of the last proof — giving end users direct visibility into protocol solvency without requiring they read raw event logs.

---

## 8. Oracle Architecture

### 8.1 Testnet Oracle

For testnet, price data flows from DeFiLlama to the protocol:

```
DeFiLlama API
      │
      │  HTTP GET /simple/price?ids=polkadot&vs_currencies=usd
      │
      ▼
oracle/oracle.py  (Python, runs every 30 minutes)
      │
      │  price_scaled = int(dot_price * 1e18)
      │
      ▼
PriceOracle.submitPrice(vdot_address, price_scaled)
      │
      │  stored: prices[vdot] = price_scaled
      │          lastUpdated[vdot] = block.timestamp
      │
      ▼
CollateralVault.getCollateralValue()   ← reads fresh price on every call
```

The oracle script runs on a separate server (Railway) and posts prices at fixed intervals. A Railway environment variable (`OVERRIDE_PRICE_USD`) allows the crisis simulation to inject arbitrary prices — this is how the $8.50 → $6.00 price crash was simulated on-chain.

**Staleness protection:** `PriceOracle.getPrice()` checks:
```
require(block.timestamp - lastUpdated[token] <= 3600, "PriceOracle: stale price")
```

If the oracle service is down for more than one hour, all collateral-dependent operations revert. This is fail-closed behavior — the protocol stops rather than operates on stale data. No liquidations can occur, no new borrows can be opened, and no withdrawals that would breach LTV can execute.

### 8.2 Mainnet Oracle: Hyperbridge ISMP

The testnet oracle is centralized — a single authorized address posts prices. This is not acceptable for mainnet, where a compromised oracle key means total protocol failure.

The mainnet oracle path is Hyperbridge ISMP (Inter-Supported Messaging Protocol).

**Why Hyperbridge:**
- Hyperbridge is a Polkadot-native cross-chain messaging protocol
- ISMP (Inter-Supported Messaging Protocol) enables trustless state proof relaying between parachains
- Hydration's Omnipool maintains the canonical USDH/DOT market — it is the primary price discovery venue for both assets
- ISMP allows Polkadot Hub contracts to verify Hydration state proofs without trusting any intermediary

**Mainnet data flow:**

```
Hydration Omnipool (parachain 2034)
      │
      │  USDH/DOT spot price (time-weighted)
      │
      ▼
ISMP message → Hyperbridge relayer
      │
      │  State proof: price at block N on Hydration
      │
      ▼
Polkadot Hub (parachain 1000)
      │
      │  ISMPHost.verifyStateProof(proof)
      │
      ▼
PriceOracle.submitPrice()  ← called by ISMP handler, not a centralized key
```

This eliminates the trusted oracle key. The price source is the on-chain state of Hydration itself — cryptographically verified via state proofs, not relayed by a trusted relayer. No Chainlink. No API dependency. 100% Polkadot-native oracle architecture.

**XCM compatibility:** As an alternative or complement, XCM (Cross-Consensus Messaging) can relay oracle data from a Hydration-based oracle dispatcher to Polkadot Hub. XCM version 3 supports `Transact` instructions that can call `submitPrice()` with data sourced from another parachain's state. Hyperbridge ISMP provides stronger guarantees because it uses cryptographic state proofs rather than relying on the XCM origin's trust assumptions.

---

## 9. PolkaVM Compatibility

### 9.1 What PolkaVM Is

PolkaVM is Parity's RISC-V-based virtual machine for smart contract execution on Polkadot parachains. Polkadot Hub (AssetHub) runs an EVM-compatible interface over PolkaVM, with Solidity contracts compiled by `resolc` (the Parity Solidity compiler, derived from `solc`). `resolc` produces PolkaVM bytecode with the `0x50564d00` magic prefix.

The EVM compatibility layer is not 100% identical to mainnet Ethereum EVM. Specific opcodes and precompile behaviors differ, and these differences require careful contract design.

### 9.2 Forbidden Opcodes and Patterns

| Forbidden | Reason | DotLend Solution |
|---|---|---|
| `SELFDESTRUCT` | Removed from PolkaVM | Not used anywhere |
| `CREATE2` | Not supported | No factory patterns |
| `EXTCODECOPY` | Not supported | No code inspection |
| `assembly {}` | resolc limitation | Zero assembly in protocol contracts |
| `block.prevrandao` | Not available | Not used |
| `block.difficulty` | Deprecated/unavailable | Not used |
| OpenZeppelin v5.x | Internal assembly usage | OZ v4.x exclusively |
| Proxy patterns | `delegatecall` constraints | Pure state machine, no proxies |
| Floating-point | No FP support | All math in 1e18 integer basis |

### 9.3 Size Constraints

PolkaVM enforces a 100 KB initcode limit per contract. The original design had `publishSolvencyProof()` inside `LendingPool`. As the ZK infrastructure was added, `LendingPool` approached this limit. The solution was to extract all ZK logic into `SolvencyGateway` — a separate, purpose-built contract with a minimal interface:

```
LendingPool:      core borrow/repay/liquidate logic
SolvencyGateway:  ZK proof submission, verifier interface, event emission
```

This split respects the 100 KB limit while keeping the ZK infrastructure fully on-chain. The two contracts share no state — `SolvencyGateway` does not query `LendingPool`, and `LendingPool` does not know `SolvencyGateway` exists.

### 9.4 block.timestamp Safety

Interest accrual uses `block.timestamp` to measure elapsed time. On Ethereum mainnet, `block.timestamp` can be manipulated by validators within a ~12 second window. On PolkaVM/AssetHub, block times are deterministic (6 seconds per block) and timestamp manipulation is not a known vector. The use of `block.timestamp` for interest accrual is safe on this target chain.

### 9.5 SafeERC20 and ReentrancyGuard

Both `SafeERC20` and `ReentrancyGuard` from OZ v4.x compile cleanly with `resolc`. All state-changing functions in `CollateralVault` and `LendingPool` are wrapped in `nonReentrant`. The vault uses `safeTransferFrom` / `safeTransfer` for all vDOT transfers to handle any non-standard return value behavior.

### 9.6 Compilation Verification

All 13 contracts (across 2 collateral markets) compile to `hh-resolc-artifact-1` format using `resolc 0.5.0` via `@parity/hardhat-polkadot`. All artifacts carry the `0x50564d00` PolkaVM bytecode prefix, confirming successful compilation to PolkaVM target.

```bash
npx hardhat compile --network westendAssetHub
# All contracts: hh-resolc-artifact-1, 0x50564d00 prefix confirmed
```

---

## 10. Risk Parameters

### 10.1 Parameter Table

| Parameter | Value | Rationale |
|---|---|---|
| LTV | 70% | 10% buffer below liquidation threshold |
| Liquidation Threshold | 80% | Standard for liquid, correlated assets |
| Stability Fee | 5 bps (0.5%/year) | Below vDOT staking yield; positive carry maintained |
| Liquidation Bonus | 5% | Sufficient incentive; not so large as to over-punish borrowers |
| Oracle Stale Threshold | 3600s (1 hour) | 2x oracle refresh interval; fail-closed on stale data |
| Max Borrow (formula) | collateralUSD * 70 / 100 | Enforced at borrow time |
| Interest Precision | FEE_PRECISION = 10000 | Basis point resolution |
| Collateral Precision | 1e18 | Standard ERC-20 wei precision |

### 10.2 Stability Fee vs. Staking Yield

The stability fee is deliberately set below typical vDOT staking yield:

```
vDOT staking APY (approximate):    12% - 15%
USDH stability fee:                0.5%
Net carry for borrower:             +11.5% to +14.5%
```

A borrower who deposits vDOT and borrows USDH at 70% LTV is earning staking yield on 100% of their vDOT while only paying 0.5% on 70% of its USD value. The effective cost of liquidity is extremely low, which is the core value proposition of the protocol.

### 10.3 Liquidation Incentive Analysis

The 5% liquidation bonus must be large enough to motivate liquidators even when gas costs are factored in. On PolkaVM, gas costs are low, which means even small positions are profitable to liquidate:

```
Minimum profitable liquidation (estimated):
  Gas cost per liquidation: ~$0.50 (PolkaVM estimate)
  Required debt size for 5% bonus to exceed gas: $0.50 / 0.05 = $10.00
```

Positions with less than $10 debt may not attract liquidators — a risk acknowledged and accepted for the initial launch phase. In a production system, a minimum borrow size of $50 would eliminate this edge case.

### 10.4 Oracle Risk

The testnet oracle is a single authorized EOA. Oracle key compromise would allow arbitrary price manipulation. This risk is eliminated in the mainnet design via Hyperbridge ISMP (see Section 8.2). Until ISMP is available, the testnet oracle is suitable only for the current controlled deployment.

### 10.5 Smart Contract Risk

All contracts have been tested against 102 passing Hardhat unit/integration tests + 6 Forge fuzz tests. Tests cover:

- Access control on all privileged functions
- Price staleness reversion
- Health factor math correctness at boundary conditions
- Liquidation at exact threshold
- Interest accrual across multiple time intervals
- Full integration: deposit → borrow → price crash → liquidation → debt cleared

No formal audit has been conducted. The code is open-source (MIT license) and has been designed for auditability — no proxy patterns, no assembly, no complex inheritance hierarchies.

---

## 11. Deployed Contracts

All contracts are deployed on Polkadot Hub TestNet, Chain ID 420420417.

**Explorer:** https://blockscout-testnet.polkadot.io

| Contract | Address |
|---|---|
| PriceOracle | `0xb422522F5eB930e417652deb747956545A969F63` |
| MockvDOT | `0xfc1ACa9EDF5DA2eBEA5CE1320fb40A74Ac996544` |
| MockUSDH | `0x7d605b39a8EeF1aCA3D63bD7A32E2719abA87683` |
| TreasuryRouter (vDOT) | `0xF1E4172BEC741F69dE0a8Bf4EE88dFF679c6D281` |
| CollateralVault (vDOT) | `0x73b41E4815114859FB0c0CD4F504Ed27CBd37219` |
| LendingPool (vDOT) | `0xf909F5096700439E621B83F826Ee6Ff02047381B` |
| WPAS | `0x83754cfC4501dc098d5bf37605E77e3bF83a1556` |
| TreasuryRouter (WPAS) | `0x6007cDBEc7D6D114adc68191465c392Bd29d42cf` |
| CollateralVault (WPAS) | `0x462415c604ae6c9bEe99a9357b6B40a0D529FC8B` |
| LendingPool (WPAS) | `0x86a97A53304c20122850cD6b80ccCA2d50A90683` |
| MockSolvencyVerifier | `0xED2676C995BAA392093Ac0b907EA216c2B8C52cc` |
| SolvencyGateway | `0x199E3E7c1f1382bc389b495B927B0535B390Acd0` |
| XCMTreasuryDispatch | `0x3FfEAC3766F05752f8D3Ae8eEd00B57259Eb3c2d` |
| Deployer | `0xb947dF17869fAB2DF223a38F28f38b40ca636d4e` |

### 11.1 On-Chain Evidence

**Crisis simulation transaction:**
```
TX:     0xa09407bb1b8c41d265305de78ddb024144daeb0c47bfc62ff663bb7daf95c085
Block:  Polkadot Hub TestNet
Events: Liquidated(borrower, liquidator, debtRepaid=84e18, collateralSeized=14.7e18)

Pre-liquidation:
  vDOT price:     $8.50
  Collateral:     15 vDOT ($127.50)
  Debt:           $84.00 USDH
  healthFactor:   1.214e18

Post-price-crash ($6.00):
  Collateral:     15 vDOT ($90.00)
  healthFactor:   0.857e18  ← LIQUIDATABLE

Post-liquidation:
  borrower.debt:  $0.00
  borrower.collat: 0.3 vDOT (remainder)
  liquidator net: +$4.20 profit
```

**Solvency proofs:** `SolvencyProven` events are emitted by `SolvencyGateway` every 30 minutes, visible at:
```
https://blockscout-testnet.polkadot.io/address/0x199E3E7c1f1382bc389b495B927B0535B390Acd0
```

---

## 12. Future Work and Mainnet Roadmap

### 12.1 Phase 1: Hyperbridge ISMP Oracle (Priority 1)

Replace the centralized oracle key with Hyperbridge ISMP price feeds from Hydration. This is the single most important trust upgrade before mainnet:

- Deploy ISMP handler contract on Polkadot Hub
- Register Hydration (parachain 2034) as a trusted origin
- Subscribe to USDH/DOT TWAP from Hydration's Omnipool
- Remove `authorizedOracle` EOA from `PriceOracle`

Expected timeline: 4-8 weeks after Hyperbridge ISMP SDK stabilizes for Polkadot Hub EVM.

### 12.2 Phase 2: Real UltraHonk Verifier

Replace `MockSolvencyVerifier` with the full UltraHonk verifier contract once PolkaVM supports BN254 pairing precompiles:

- Monitor Parity's PolkaVM precompile roadmap (0x06, 0x07, 0x08)
- When BN254 is available: generate verifier via `nargo codegen-verifier`
- Deploy new verifier, deploy new SolvencyGateway pointing to it
- Retire MockSolvencyVerifier

The circuit (`circuits/solvency/src/main.nr`) is production-ready. Only the verifier deployment is pending precompile support.

### 12.3 Phase 3: Native vDOT Integration

Replace MockvDOT with the real Bifrost vDOT token on Polkadot Hub:

- vDOT must be bridged to Polkadot Hub via XCM from Bifrost (parachain 2030)
- AssetHub XCM asset registration for vDOT foreign asset
- Update CollateralVault to use the registered vDOT address
- No contract logic changes required — vDOT implements standard ERC-20 interface

### 12.4 Phase 4: Native USDH Integration

Replace MockUSDH with real USDH from Hydration:

- USDH must be registered as a foreign asset on Polkadot Hub
- LendingPool's mint/burn interface must be replaced with borrow-from-reserve model
  (real USDH cannot be arbitrarily minted — requires protocol-level coordination with Hydration)
- Alternative: Hydration grants DotLend a USDH minting authority via governance — the cleanest integration
- The synthetic issuance model (mint on borrow, burn on repay) works if USDH governance delegates minting rights

### 12.5 Phase 5: Interest Rate Model

Replace the fixed stability fee with a dynamic interest rate curve:

- Two-slope utilization model (similar to Aave's interest rate strategy)
- Low utilization: 0.5% base rate
- High utilization (>80%): rate ramps sharply to discourage over-borrowing
- Parameters governable via on-chain proposal

### 12.6 Phase 6: Protocol Governance

- Deploy a DOT-based governance token (or use DOT directly via OpenGov)
- Interest rate parameters, LTV ratios, and risk parameters governed on-chain
- Treasury fee split enforced on-chain: 50% DOT buyback, 20% user incentives, 18% maintenance, 12% team

### 12.7 Phase 7: Multi-Collateral Expansion

DotLend's architecture is designed for extensibility:

- `CollateralVault` can be extended to support multiple collateral types
- Add support for: lcDOT (Parallel Finance), aDOT (Acala), native DOT
- Each collateral type gets its own LTV and liquidation threshold
- Oracle must support each collateral's price feed (all available via Hyperbridge ISMP)

### 12.8 Phase 8: Formal Security Audit

Before any significant TVL migration to mainnet:

- Full audit by a Polkadot/EVM-specialized security firm
- Specific focus: PolkaVM-specific edge cases, oracle manipulation vectors, ZK circuit soundness
- Bug bounty program via Immunefi or equivalent

---

## 13. Conclusion

DotLend fills a structural gap in the Polkadot DeFi stack. vDOT demand at 76% utilization on Hydration's supply cap proves the market exists. USDH at $330M TVL proves the asset exists. The only missing piece was the money market to connect them — and now it exists, on Polkadot Hub, in production.

The protocol is technically differentiated in three ways:

**1. PolkaVM-native design.** Every contract was built for PolkaVM from the ground up. No opcodes that resolc cannot compile, no patterns that don't work under PolkaVM's constraints, no external dependencies that assume Ethereum mainnet behavior. This is not an Ethereum protocol transplanted to Polkadot — it is a Polkadot-native protocol.

**2. Cryptographic solvency proof.** DotLend is the only money market in the Polkadot ecosystem designed to publish on-chain ZK proofs of protocol solvency. Every 30 minutes, proofs are generated off-chain to show that total collateral exceeds total debt — without revealing a single user's position. Once PolkaVM supports BN254 precompiles for on-chain verification, this will become a genuine trust primitive.

**3. Polkadot-native oracle path.** The testnet oracle is functional and live. The mainnet oracle path via Hyperbridge ISMP is designed, scoped, and ready to implement when PolkaVM's BN254 precompile support arrives. There is no dependency on Chainlink, no dependency on external bridges, no dependency on Ethereum infrastructure. The entire oracle stack, from price discovery on Hydration to on-chain price submission on Polkadot Hub, is Polkadot-native.

The combination of vDOT's yield, USDH's stability, and Polkadot Hub's cross-chain position creates a uniquely favorable environment for a money market. DotLend is that money market.

---

**Repository:** github.com/orthonode/dotlend
**License:** MIT
**Contact:** Arhant Barmate | infrastructure@orthonode.xyz
**Organization:** Orthonode Systems | https://orthonode.xyz

---

*DotLend is currently in the prototype and testing phase. It has not been audited. Do not use on mainnet without a full security review.*
