# DotLend
### The first money market on Polkadot Hub. Borrow HOLLAR against vDOT.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Chain: Polkadot Hub TestNet](https://img.shields.io/badge/Chain-Polkadot%20Hub%20TestNet-E6007A)](https://blockscout-testnet.polkadot.io)
[![Hackathon: Polkadot Solidity 2026](https://img.shields.io/badge/Hackathon-Polkadot%20Solidity%202026-pink)](https://dorahacks.io)

---

## What is DotLend?

DotLend is a lending protocol on Polkadot Hub. Users deposit **vDOT** (Bifrost's liquid staking token) as collateral and borrow **HOLLAR** (Hydration's stablecoin) against it.

> **DotLend is the first money market on Polkadot Hub where solvency is cryptographically proven, not assumed.**

**Why this matters:**
- vDOT has 76% utilization on Hydration's lending market — supply cap hit. Demand is proven.
- HOLLAR ($330M TVL) has zero native lending market outside Hydration's Omnipool.
- No money market exists on Polkadot Hub. DotLend is the first.
- Every 6 hours, a ZK proof verifies `total_collateral > total_debt` without revealing individual positions.

---

## Live on Polkadot Hub TestNet

Deployed March 8, 2026. All contracts verified on Blockscout.

| Contract | Address | Explorer |
|----------|---------|---------|
| PriceOracle | `0xea7a8D7Dad04fD3B3Bf0242F3b7114b7CfcCBc1D` | [view](https://blockscout-testnet.polkadot.io/address/0xea7a8D7Dad04fD3B3Bf0242F3b7114b7CfcCBc1D) |
| MockvDOT | `0x95Fa043b8acA6F73AfE03a3085E7Bfe53A5715CA` | [view](https://blockscout-testnet.polkadot.io/address/0x95Fa043b8acA6F73AfE03a3085E7Bfe53A5715CA) |
| MockHOLLAR | `0x2C8C4b2F63E50E566f9BA87EA4f75Caa368c2AAf` | [view](https://blockscout-testnet.polkadot.io/address/0x2C8C4b2F63E50E566f9BA87EA4f75Caa368c2AAf) |
| CollateralVault | `0xc8cdEF13677bEA21e8b8282c9cE118EbBE4fA14c` | [view](https://blockscout-testnet.polkadot.io/address/0xc8cdEF13677bEA21e8b8282c9cE118EbBE4fA14c) |
| LendingPool | `0xd8e2bE395Cb8F54BEDfBc6ed6C249Ad43A4fa52b` | [view](https://blockscout-testnet.polkadot.io/address/0xd8e2bE395Cb8F54BEDfBc6ed6C249Ad43A4fa52b) |
| MockSolvencyVerifier | `0x541051e3d31ef573e7Ff76d67809704b92c6cc0e` | [view](https://blockscout-testnet.polkadot.io/address/0x541051e3d31ef573e7Ff76d67809704b92c6cc0e) |
| SolvencyGateway | `0x6B682835bB25f7cA9e69D54B4B26e3A238Df66C0` | [view](https://blockscout-testnet.polkadot.io/address/0x6B682835bB25f7cA9e69D54B4B26e3A238Df66C0) |

**Network:** Polkadot Hub TestNet | Chain ID `420420417` | [blockscout-testnet.polkadot.io](https://blockscout-testnet.polkadot.io)

---

## On-Chain Evidence

### Oracle price submission — live on Polkadot Hub TestNet

![Oracle tx on Blockscout](./docs/screenshots/oracle-tx-blockscout.png)

> **Tx:** [`0x9dee5cf5...914a94`](https://blockscout-testnet.polkadot.io/tx/0x9dee5cf515a9a42a2b17eb33ec12537f39583007fca5ad5137bc8b4abd914a94)
> **Status:** ✅ Success | **Block:** 6137535 | **Confirmed in:** ≤ 1.426s | **Mar 08 2026 11:03:00 AM**
> Oracle posted DOT price to `PriceOracle` contract — gas used: 1,504 / 100,000 (1.5%)

### Crisis simulation — price crash → liquidation

| Step | Result |
|------|--------|
| vDOT price before | $8.50 |
| vDOT price after crash | $6.00 |
| Health factor before | 1.214 (healthy) |
| Health factor after | 0.857 (liquidatable) |
| Debt repaid | $84 HOLLAR |
| vDOT seized by liquidator | 14.7 vDOT (5% bonus confirmed) |
| Debt remaining | $0.00 ✓ |

[Liquidation tx](https://blockscout-testnet.polkadot.io/tx/0xa09407bb1b8c41d265305de78ddb024144daeb0c47bfc62ff663bb7daf95c085)

---

## Protocol Parameters

| Parameter | Value |
|-----------|-------|
| Loan-to-Value (LTV) | 70% |
| Liquidation Threshold | 80% |
| Stability Fee | 0.5% / year (5 bps) |
| Liquidation Bonus | 5% |
| Oracle Stale Threshold | 1 hour |

---

## Setup

```bash
npm install --legacy-peer-deps
npm install -g pnpm   # required for resolc npm mode

# Compile (resolc for PolkaVM)
npx hardhat compile --network polkadotHubTestnet

# Test (62 tests, local hardhat)
npx hardhat test

# Deploy to Polkadot Hub TestNet
cp .env.example .env   # add PRIVATE_KEY
npx hardhat run scripts/deploy-protocol.js --network polkadotHubTestnet

# Run oracle
python3 -m venv oracle/.venv
oracle/.venv/bin/pip install -r oracle/requirements.txt
VDOT_PRICE_USD=8.50 oracle/.venv/bin/python3 oracle/oracle.py

# Crisis simulation
npx hardhat run scripts/simulate-crisis.js --network polkadotHubTestnet
```

---

## Architecture

```
User
 │
 ├─ deposit(vDOT) ──────────────────► CollateralVault
 │                                         │
 │                                    getHealthFactor()
 │                                         │
 ├─ borrow(HOLLAR) ─────────────────► LendingPool ◄──── PriceOracle
 │                                         │                  │
 │                                    accrueInterest()   submitPrice()
 │                                         │            (oracle.py / Hyperbridge ISMP)
 └─ liquidate(borrower) ────────────► LendingPool
                                           │
                                    vault.seizeCollateral(borrower, amount, liquidator)
                                           │
                                    vDOT → liquidator (direct, no pool hop)
```

**PolkaVM Safety:** No SELFDESTRUCT, CREATE2, EXTCODECOPY, assembly, or block.prevrandao anywhere.

---

## ZK Solvency Proof

DotLend generates a ZK proof every 6 hours proving the protocol is solvent without revealing individual positions.

**Circuit:** `circuits/solvency/src/main.nr` (Noir 1.0.0-beta.19, UltraHonk)

**Public inputs:** `total_collateral_value`, `total_debt`, `oracle_timestamp`

**Private inputs:** individual `(collateral_value, debt)` per user — hidden from verifier

**Constraint:** `sum(collateral_i) > sum(debt_i)` — cryptographically enforced

```bash
# Compile circuit
cd circuits/solvency && nargo compile

# Generate and submit proof (reads on-chain positions)
npx hardhat run scripts/generate-solvency-proof.js --network polkadotHubTestnet
```

The `SolvencyProven(totalCollateral, totalDebt, timestamp)` event is emitted on-chain with every successful proof. The Railway cron job submits automatically every 6 hours.

---

## Tests

```
npx hardhat test
```

76 tests, 0 failures across:
- `PriceOracle.test.js` — access control, staleness, price submission
- `CollateralVault.test.js` — deposit, withdraw, health factor math
- `LendingPool.test.js` — borrow, repay, liquidate, interest accrual
- `Integration.test.js` — full deposit→borrow→price crash→liquidate flow
- `SolvencyProof.test.js` — ZK proof integration: valid/invalid/stale, permissionless, input validation

---

## Docs

- [PHASES.md](./PHASES.md) — project phases and done criteria
- [docs/ROADMAP.md](./docs/ROADMAP.md) — sprint milestones
- [docs/screenshots/](./docs/screenshots/) — on-chain evidence
- [docs/WHITEPAPER.md](./docs/WHITEPAPER.md) — mechanism and math *(Phase 5)*
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — contract diagrams *(Phase 5)*

---

## Hackathon

**Polkadot Solidity Hackathon 2026** — EVM Track — DeFi/Stablecoin-enabled dApps
Submission deadline: March 20, 2026 23:59
Demo Day: March 24–25, 2026

Built by **Orthonode Systems** — Arhant Barmate
