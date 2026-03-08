# DotLend — DoraHacks Submission
## Polkadot Solidity Hackathon 2026 | EVM Track | DeFi/Stablecoin-enabled dApps
## Deadline: March 20, 2026 23:59

---

## Project Name

DotLend

---

## Tagline

The first money market on Polkadot Hub. Solvency cryptographically proven every 6 hours.

---

## Project Description

### The Ecosystem Gap

Polkadot has $330M in HOLLAR and vDOT at 76% utilization on Hydration — supply cap hit, demand proven. Yet there are **zero native lending markets on Polkadot Hub**. Every dollar of yield-bearing vDOT collateral sitting idle is a failure of the ecosystem. DotLend fixes this.

### The ZK Innovation — Why This Is Different

**Every 6 hours, a zero-knowledge proof is published on-chain proving DotLend is solvent. DotLend is the first money market anywhere to do this.**

The Noir circuit (UltraHonk proving system) constrains `sum(collateral_values) > sum(debt_amounts)` with aggregate totals as public inputs and individual positions as private witnesses. Protocol solvency becomes a mathematical fact verifiable by anyone on Blockscout — not a trust claim, not an audit, not a dashboard. A ZK proof published via `SolvencyGateway.publishSolvencyProof()` every 6 hours, on-chain, permanently.

### What DotLend Does

DotLend is a non-custodial money market protocol where users deposit vDOT as collateral and borrow HOLLAR at up to 70% LTV, while continuing to earn Bifrost staking yield on their deposited assets. The protocol tracks each user's health factor — (Collateral Value × 0.80) / Debt — and opens the position to liquidation when it falls below 1.0, with a 5% bonus to incentivize liquidators. Interest accrues continuously at 0.5% per year via a lazy timestamp-based model, keeping gas costs low and the accounting trustless. Every component — deposit, borrow, repay, liquidate, accrue interest — is handled by four auditable Solidity contracts deployed on Polkadot Hub.

### Why Not Hydration?

Hydration is an AMM. DotLend is a collateralized debt position engine. **They are complementary, not competing.**

A vDOT holder on Hydration can supply to a pool — but cannot borrow against their position. DotLend unlocks that: deposit vDOT, borrow HOLLAR, deploy that HOLLAR into Hydration's pools or anywhere in the ecosystem. DotLend is a liquidity source for Hydration, not a competitor. Victor Xu (Bifrost) confirmed vDOT lending is the #1 requested feature from the vDOT community — Hydration's AMM model cannot provide it.

### Why It's Only Possible on Polkadot

vDOT and HOLLAR are native Polkadot assets. On any other chain, building a lending market for these assets would require bridges — introducing trust assumptions and counterparty risk that a lending protocol cannot safely absorb. On Polkadot Hub, XCM makes vDOT and HOLLAR natively composable, and on mainnet, Hyperbridge ISMP will deliver trustless cross-chain price feeds from Hydration's Omnipool directly to the PriceOracle — no Chainlink dependency, no centralized oracle, 100% Polkadot-native architecture.

### Traction

Seven contracts deployed and verified on Polkadot Hub TestNet (Chain ID 420420417). 76 tests pass with 0 failures covering every state transition including a complete price-crash liquidation cycle. Live frontend at nexucore.xyz connects directly to on-chain state — no backend, no subgraph. Oracle posts vDOT prices every 30 minutes. ZK proof pipeline runs automatically on Railway every 6 hours.

### Next Steps

DotLend will apply for a W3F grant as ecosystem-critical DeFi infrastructure — the missing collateral layer that allows HOLLAR to scale beyond Hydration. Alongside the grant application, the team is pursuing a formal security audit via the Polkadot Assurance Legion (PAL) subsidy and targeting acceptance into the Velocity Labs DeFi Builders Cohort 2 for go-to-market support targeting $10M TVL by Q3 2026.

---

## How It Uses Polkadot Hub Features

### EVM on Polkadot Hub (not a sidechain)

DotLend is deployed on Polkadot Hub — the system parachain with native EVM execution via PolkaVM. This is not an EVM sidechain or appchain: it is Hub-native, meaning it benefits from Polkadot's shared security, relay chain finality, and direct XCM connectivity to every parachain. The contract architecture was designed specifically for PolkaVM's execution environment.

### XCM-Readiness for vDOT Price Feeds

On mainnet, the `PriceOracle` contract will be replaced by a Hyperbridge ISMP adapter that receives vDOT price state proofs from Bifrost via XCM. The interface is already abstracted: `IPriceOracle` exposes a single `getPrice(address token)` function, making the oracle backend swappable without touching CollateralVault or LendingPool. The testnet uses an authorized oracle posting prices every 30 minutes as a direct functional equivalent.

### Hyperbridge ISMP Integration (Mainnet Oracle Path)

The mainnet oracle architecture:
1. Hydration's Omnipool publishes vDOT/USD price as XCM state data on Polkadot
2. Hyperbridge ISMP relayer picks up the state proof
3. `PriceOracle.sol` implements `IIsmpModule.onAccept(ISMPMessage)` to receive and store the price
4. CollateralVault and LendingPool consume the trustlessly-delivered price via `getPrice()`

This design eliminates Chainlink, eliminates bridges, and makes DotLend's oracle as trust-minimized as the Polkadot relay chain itself.

### Native Asset Support

MockvDOT and MockHOLLAR are ERC-20 representations used on testnet. On mainnet, these will be replaced by the actual Polkadot-native vDOT and HOLLAR tokens accessed via their XCM-minted ERC-20 interfaces on Polkadot Hub — not wrapped versions with custodians or synthetic representations with counterparty risk.

### PolkaVM Compatibility

Every contract was written with PolkaVM's execution constraints as a hard requirement. Specifically avoided:

| Forbidden | Reason |
|-----------|--------|
| `SELFDESTRUCT` / `selfdestruct()` | Not supported by PolkaVM |
| `EXTCODECOPY` | Not supported by PolkaVM |
| `CREATE2` / factory patterns | Not supported by PolkaVM |
| `assembly {}` blocks | Bypasses PolkaVM safety guarantees |
| `block.prevrandao` / `block.difficulty` | Not reliable on PolkaVM |
| OpenZeppelin v5.x | Imports patterns incompatible with resolc |

All math is performed in 1e18 fixed-point using Solidity 0.8.20's built-in checked arithmetic. Interest accrual uses `block.timestamp` (safe on PolkaVM). The compiler is `resolc 0.5.0` via `@parity/hardhat-polkadot`, producing `hh-resolc-artifact-1` format artifacts with the `0x50564d00` PolkaVM bytecode prefix.

---

## Technical Stack

| Layer | Technology |
|-------|-----------|
| Contracts | Solidity 0.8.20, OpenZeppelin v4.9.6, Hardhat |
| Compiler | resolc 0.5.0 via @parity/hardhat-polkadot |
| ZK Layer | Noir 1.0.0-beta.19, UltraHonk, nargo |
| Frontend | Next.js 14, React, TypeScript, viem v2, wagmi v2, TailwindCSS |
| Prover | Node.js cron on Railway (every 6 hours) |
| Oracle (testnet) | Python 3, web3.py, CoinGecko + Binance + DIA fallback |
| Oracle (mainnet) | Hyperbridge ISMP (PriceOracle implements IIsmpModule) |
| Network | Polkadot Hub TestNet, Chain ID 420420417 |
| Explorer | blockscout-testnet.polkadot.io |

---

## Deployed Contracts (Polkadot Hub TestNet, Chain ID 420420417)

| Contract | Address |
|----------|---------|
| PriceOracle | `0xea7a8D7Dad04fD3B3Bf0242F3b7114b7CfcCBc1D` |
| MockvDOT | `0x95Fa043b8acA6F73AfE03a3085E7Bfe53A5715CA` |
| MockHOLLAR | `0x2C8C4b2F63E50E566f9BA87EA4f75Caa368c2AAf` |
| CollateralVault | `0xc8cdEF13677bEA21e8b8282c9cE118EbBE4fA14c` |
| LendingPool | `0xd8e2bE395Cb8F54BEDfBc6ed6C249Ad43A4fa52b` |
| MockSolvencyVerifier | `0x541051e3d31ef573e7Ff76d67809704b92c6cc0e` |
| SolvencyGateway | `0x6B682835bB25f7cA9e69D54B4B26e3A238Df66C0` |

---

## GitHub

https://github.com/orthonode/dotlend

---

## Demo

https://nexucore.xyz

---

## Track

EVM Smart Contracts — DeFi / Stablecoin-enabled dApps

---

## Team

**Orthonode Infrastructure Labs**
Bhopal, India
research@orthonode.xyz
orthonode.xyz | nexucore.xyz
github.com/orthonode
