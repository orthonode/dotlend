# DotLend — Overview

---

## Tagline

The Aave of Polkadot — the first native money market on Polkadot Hub. Built at the exact moment Snowbridge made multi-asset DeFi possible.

---

## Project Description

### The Ecosystem Gap

Polkadot has $330M in USDH and vDOT at 76% utilization on Hydration — the supply cap is hit, demand is there, and capital is just waiting around. Yet there are **zero native lending markets on Polkadot Hub**. It really bothered me seeing all this yield-bearing vDOT collateral sitting idle. I built DotLend to fix this.

### What DotLend Does

DotLend is Polkadot's native money market — an Aave-style liquidity protocol deployed on **Polkadot Hub**. Users deposit **vDOT** (Bifrost's liquid staking token) or **native DOT/PAS** (via WPAS) to earn staking yield, and borrow against it. Right now on testnet, users borrow **USDH** (our mock stablecoin proxy). On mainnet, USDH is replaced by **USDC, wETH, and wBTC via Snowbridge**. No other protocol on Polkadot Hub does this.

The protocol tracks each user's health factor — `(Collateral Value × 0.80) / Debt` — and opens the position to liquidation when it falls below 1.0, with a 5% bonus to incentivize liquidators. Interest accrues continuously at 0.5% per year via a lazy timestamp-based model, keeping gas costs low and the accounting trustless. Stability fees accrue at 0.5%/yr and flow to the treasury wallet. The on-chain fee split (50% DOT buybacks, 20% incentives, 18% maintenance, 12% team) activates with governance on mainnet.

### Revenue Model — Real Assets for Protocol Growth

**Testnet model:** MockUSDH principal is burned on repay (MockUSDH grants `TreasuryRouter` burn rights). Only the accrued stability fee — the interest above principal — is transferred to the treasury wallet.

**Mainnet model (Aave/Compound):** Hollar (USDH) is a real stablecoin — DotLend cannot burn it. Repaid Hollar principal returns to the LendingPool reserve for the next borrower. Only the stability fee goes to treasury. DotLend is a two-sided lending market, not a stablecoin issuer.

On mainnet, treasury governance directs accumulated fees to:
- **Phase 2 (mainnet):** Buy DOT on Hydration DEX via XCM → stake → vDOT → distribute to stakers
- **Phase 3 (token):** Buy DOTLEND governance token → burn

This creates a self-reinforcing flywheel: every dollar borrowed on DotLend eventually becomes DOT demand.

### The V2 Vision — Snowbridge Makes This Real

Snowbridge has been live for over a year with zero on-chain downtime, $75M+ TVL, and ~24 parachain integrations. wETH, wBTC, and USDC are already bridgeable to Polkadot Hub. DotLend V2 replaces the USDH testnet token with real borrowable assets:

| Asset | Type | Deposit APY | Borrow APY | Status |
|---|---|---|---|---|
| **vDOT** (Bifrost) | Collateral | 15% (staking yield) | — | ✅ Live (testnet) |
| **USDH** (DotLend) | Borrowable | — | 0.5% | ✅ Live (testnet) |
| **USDC** (Snowbridge) | Both | variable | variable | 🔜 Mainnet |
| **wETH** (Snowbridge) | Both | variable | variable | 🔜 Mainnet |
| **wBTC** (Snowbridge) | Collateral | — | — | 🔜 Mainnet |
| **vKSM** (Bifrost) | Collateral | 18% (staking yield) | — | 🔜 Mainnet |
| **vETH** (Bifrost) | Collateral | 4% (staking yield) | — | 🔜 Mainnet |
| **DOT** (Native) | Both | variable | variable | 🔜 Mainnet | Hub EVM even existed.

### The ZK Layer — Built Ahead of the Infrastructure

ZK solvency architecture implemented in Noir/UltraHonk. On-chain verification is mocked because PolkaVM's resolc compiler does not yet support BN254 elliptic curve precompiles (EIP-196/197). The circuit, proof generation, and verifier interface are production-ready — this becomes fully trustless the moment PolkaVM ships EIP-196/197 support, which is on the official roadmap.

### Why Not Hydration?

**Hydration is an AMM. DotLend is a collateralized debt position engine.** They are complementary, not competing. DotLend is actually a liquidity source for Hydration — borrow USDH on DotLend, deploy it into Hydration pools.

### Traction

Thirteen contracts deployed and verified on Polkadot Hub TestNet (Chain ID 420420417). 102 Hardhat tests pass with 0 failures, covering every state transition including a complete price-crash liquidation cycle. Two collateral markets live (vDOT + native DOT via WPAS). Live frontend at nexucore.xyz connects directly to on-chain state — no backend, no subgraph. Oracle posts live prices from DeFiLlama every 30 minutes. ZK solvency architecture runs automatically on Railway. The /advisor page ships an AI risk dashboard: streaming Groq chat with live position context, A–F borrower risk grade (HF + LTV), price drop simulator (−10–50%), liquidation alert banner, mock AML screening, and a transparency card — all client-side from existing wagmi reads, zero new contract calls.

---

## OpenZeppelin Sponsor Track

DotLend uses **OpenZeppelin v4.9.6** as its security foundation across every contract:

| OZ Contract | Used In | Purpose |
|------------|---------|--------|
| `Ownable` | LendingPool, CollateralVault, PriceOracle, TreasuryRouter, SolvencyGateway | Privileged admin functions |
| `ReentrancyGuard` | LendingPool | Prevents reentrancy on borrow/repay/liquidate |
| `ERC20` | MockvDOT, MockUSDH, WPAS | Standard token implementations |

**The TreasuryRouter constraint story:** When building the fee mechanism, the natural pattern was to extend `LendingPool` with fee logic directly. But PolkaVM enforces a strict 24KB initcode size limit. `LendingPool` already inherits from both `Ownable` and `ReentrancyGuard`, and adding fee-splitting logic pushed the compiled PolkaVM bytecode over the limit.

The solution was `TreasuryRouter` — a separate contract implementing the same `IMintBurn` interface as `MockUSDH`, sitting between `LendingPool` and the real USDH token. When `LendingPool` calls `usdh.transferFrom()` during repayment, it's actually calling the router, which intercepts the flow: the principal portion is burned (MockUSDH grants burn rights on testnet) and the accrued stability fee is transferred to the treasury wallet. On mainnet, principal routes back to the reserve instead. This pattern exists *specifically because* OpenZeppelin's composition model consumed enough bytecode that fee logic had to be externalized — producing a cleaner, more testable, more auditable architecture than inline fee logic would have been.

---

## How It Uses Polkadot Hub Features

### EVM on Polkadot Hub (not a sidechain)

DotLend is deployed on Polkadot Hub — the system parachain with native EVM execution via PolkaVM. Not a sidechain or appchain: Hub-native, with Polkadot's shared security, relay chain finality, and direct XCM connectivity to every parachain.

### XCM-Readiness for Cross-Chain Assets

On mainnet, `PriceOracle` will be replaced by a Hyperbridge ISMP adapter receiving vDOT price state proofs from Bifrost via XCM. The interface is already abstracted: `IPriceOracle` exposes `getPrice(address token)`, making the oracle backend swappable without touching any core contracts.

### Native Asset Support via WPAS

WPAS is a zero-admin, permissionless WETH9-style wrapper deployed on Polkadot Hub. Users `deposit{value: x}()` to receive WPAS 1:1, then deposit into CollateralVault. This enables native DOT/PAS as collateral without modifying any existing contracts — a second collateral market alongside vDOT.

### PolkaVM Compatibility

Every contract was built with PolkaVM constraints as hard requirements. No `SELFDESTRUCT`, `CREATE2`, `EXTCODECOPY`, `assembly {}`, or `block.prevrandao`. OpenZeppelin v4.x only (v5.x incompatible with resolc). Compiler: `resolc 0.5.0` via `@parity/hardhat-polkadot`.

---

## Technical Stack

| Layer | Technology |
|-------|-----------| 
| Contracts | Solidity 0.8.20, OpenZeppelin v4.9.6, Hardhat |
| Compiler | resolc 0.5.0 via @parity/hardhat-polkadot |
| ZK Layer | Noir 1.0.0-beta.19, UltraHonk, nargo |
| Frontend | Next.js 16, React, TypeScript, viem v2, wagmi v2, TailwindCSS |
| Prover | Node.js cron on Railway (every 30 minutes) |
| Oracle (testnet) | Python 3, web3.py, DeFiLlama + Bybit + MEXC + Gate.io fallback |
| Oracle (mainnet) | Hyperbridge ISMP (PriceOracle implements IIsmpModule) |
| Network | Polkadot Hub TestNet, Chain ID 420420417 |
| Explorer | blockscout-testnet.polkadot.io |

---

## Deployed Contracts (Polkadot Hub TestNet, Chain ID 420420417)

| Contract | Address |
|----------|---------|
| PriceOracle | `0x1282F6B59869a57Fd2a1D7a5BC8535bB7B15D173` |
| MockvDOT | `0xfc1ACa9EDF5DA2eBEA5CE1320fb40A74Ac996544` |
| MockUSDH | `0x7d605b39a8EeF1aCA3D63bD7A32E2719abA87683` |
| TreasuryRouter (vDOT) | `0x1adEe37eefd054927b14503Ff2076aE12Db76B30` |
| CollateralVault (vDOT) | `0xF94eBe7F8d8F922B7FBBFb4BE080EB71a69415A2` |
| LendingPool (vDOT) | `0x34B22768B16262aD5b7fC23DD797D80791e4e7e6` |
| WPAS | `0xc09348291775B55Da40433ba44240c262D87Eb90` |
| TreasuryRouter (WPAS) | `0xcC2Ca486257eED1201FCdc247F9a3120D0E8Be7a` |
| CollateralVault (WPAS) | `0x575B8578F000fC554394C63cec8F07Abd0C66C34` |
| LendingPool (WPAS) | `0xF68bDd12a8904fd6bB0CbED5623722517FDd3408` |
| MockSolvencyVerifier | `0xED2676C995BAA392093Ac0b907EA216c2B8C52cc` |
| SolvencyGateway | `0x199E3E7c1f1382bc389b495B927B0535B390Acd0` |
| XCMTreasuryDispatch | `0x3FfEAC3766F05752f8D3Ae8eEd00B57259Eb3c2d` | [view](https://blockscout-testnet.polkadot.io/address/0x3FfEAC3766F05752f8D3Ae8eEd00B57259Eb3c2d) |

---

## GitHub

https://github.com/orthonode/dotlend

---

## Demo

- **Live frontend:** https://nexucore.xyz
- **Demo video:** https://youtu.be/Oj9luiA8mJM  *(placeholder — update before final submission)*
- **Pitch Deck (PDF):** [DotLend_Native_Polkadot_Lending.pdf](./assets/DotLend_Native_Polkadot_Lending.pdf)

---

## Team

**Orthonode**
**Arhant Barmate** (Founder & Lead Engineer)
Bhopal, India
infrastructure@orthonode.xyz
orthonode.xyz | nexucore.xyz
github.com/orthonode
