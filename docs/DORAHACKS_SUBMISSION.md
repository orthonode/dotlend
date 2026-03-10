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

The protocol tracks each user's health factor — `(Collateral Value × 0.80) / Debt` — and opens the position to liquidation when it falls below 1.0, with a 5% bonus to incentivize liquidators. Interest accrues continuously at 0.5% per year via a lazy timestamp-based model, keeping gas costs low and the accounting trustless. 100% of stability fees flow to the protocol treasury (Aave-style).

### Revenue Model — Real Assets for Protocol Growth

100% of stability fees go to the protocol treasury via `TreasuryRouter`. DotLend does not burn stablecoins — burning a stablecoin destroys borrowing capacity for zero benefit. Aave buys back AAVE, DotLend uses real asset revenue to grow.

On mainnet, treasury governance directs accumulated fees to:
- **Phase 1 (testnet):** Operations, hackathon prizes, liquidity bootstrapping
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

Twelve contracts deployed and verified on Polkadot Hub TestNet (Chain ID 420420417). 92 Hardhat tests + 6 Forge fuzz tests pass with 0 failures, covering every state transition including a complete price-crash liquidation cycle. Two collateral markets live (vDOT + native DOT via WPAS). Live frontend at nexucore.xyz connects directly to on-chain state — no backend, no subgraph. Oracle posts prices every 30 minutes. ZK solvency architecture runs automatically on Railway.

---

## OpenZeppelin Sponsor Track

DotLend uses **OpenZeppelin v4.9.6** as its security foundation across every contract:

| OZ Contract | Used In | Purpose |
|------------|---------|--------|
| `Ownable` | LendingPool, CollateralVault, PriceOracle, TreasuryRouter, SolvencyGateway | Privileged admin functions |
| `ReentrancyGuard` | LendingPool | Prevents reentrancy on borrow/repay/liquidate |
| `ERC20` | MockvDOT, MockUSDH, WPAS | Standard token implementations |

**The TreasuryRouter constraint story:** When building the fee mechanism, the natural pattern was to extend `LendingPool` with fee logic directly. But PolkaVM enforces a strict 24KB initcode size limit. `LendingPool` already inherits from both `Ownable` and `ReentrancyGuard`, and adding fee-splitting logic pushed the compiled PolkaVM bytecode over the limit.

The solution was `TreasuryRouter` — a separate contract implementing the same `IMintBurn` interface as `MockUSDH`, sitting between `LendingPool` and the real USDH token. When `LendingPool` calls `hollar.transferFrom()` during repayment, it's actually calling the router, which intercepts and routes 100% to treasury. This pattern exists *specifically because* OpenZeppelin's composition model consumed enough bytecode that fee logic had to be externalized — producing a cleaner, more testable, more auditable architecture than inline fee logic would have been.

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
| Frontend | Next.js 14, React, TypeScript, viem v2, wagmi v2, TailwindCSS |
| Prover | Node.js cron on Railway (every 30 minutes) |
| Oracle (testnet) | Python 3, web3.py, CoinGecko + Binance + DIA fallback |
| Oracle (mainnet) | Hyperbridge ISMP (PriceOracle implements IIsmpModule) |
| Network | Polkadot Hub TestNet, Chain ID 420420417 |
| Explorer | blockscout-testnet.polkadot.io |

---

## Deployed Contracts (Polkadot Hub TestNet, Chain ID 420420417)

| Contract | Address |
|----------|---------|
| PriceOracle | `0xc12D24cD6DF4521C9A453a325751bB1f38326a91` |
| MockvDOT | `0xa21443dfC33d44a4BaE8aA6fA6cA2A2d90F7F22F` |
| MockUSDH | `0xA94f7464F3a2cA966CB31881A1614A9CF97859ca` |
| TreasuryRouter (vDOT) | `0x68099740bb099970c62F231fE5d8A08ae58de9AA` |
| CollateralVault (vDOT) | `0x57c1d7f0a596FD53923d7AB6c6F2ed0ea73d51A8` |
| LendingPool (vDOT) | `0xda1eBb8A45ea027b6d2d80AcD6b299ceE31B0419` |
| WPAS | `0x2bab91eCF2d6E9af19182dBFC4141D03154B2eE6` |
| TreasuryRouter (WPAS) | `0x4Ff597473986387F8c1683ebAf5E123Fc60A25ba` |
| CollateralVault (WPAS) | `0x4131788B3A068Acf9758C740826A368bf9FBaE4D` |
| LendingPool (WPAS) | `0xC557C3869B6B7572a81dB50C61A369682C035EAD` |
| MockSolvencyVerifier | `0xED2676C995BAA392093Ac0b907EA216c2B8C52cc` |
| SolvencyGateway | `0x3e7D948769818C71075E38bbAA6198908Ba6CFAa` |

---

## GitHub

https://github.com/orthonode/dotlend

---

## Demo

- **Live frontend:** https://nexucore.xyz
- **Demo video:** https://youtu.be/WYxeeyrQLWc

---

## Team

**Orthonode**
**Arhant Barmate** (Founder & Lead Engineer)
Bhopal, India
research@orthonode.xyz
orthonode.xyz | nexucore.xyz
github.com/orthonode
