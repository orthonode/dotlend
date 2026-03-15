## The Problem

Polkadot has $330M in Hollar stablecoin and vDOT running at 76% utilization on Hydration — supply cap hit. Yet there is **zero native lending market on Polkadot Hub**. Every vDOT holder who needs liquidity must sell their position and forfeit staking yield. Hollar has no collateral utility outside Hydration's Omnipool.

Aave: $20B TVL. Morpho: $3B TVL. Compound: $3B TVL. Polkadot: **$0**. Not zero market share — literally zero money markets on Hub.

---

## 🎥 Live Demo

► [Watch Demo on YouTube](https://youtu.be/WYxeeyrQLWc)
► [Try it live: nexucore.xyz](https://nexucore.xyz)

Full deposit → borrow → repay → liquidation flow running on Polkadot Hub TestNet today.

---

## What DotLend Does

DotLend is the **first money market on Polkadot Hub** — an Aave-style lending protocol. Users deposit **vDOT** (Bifrost liquid staking token, ~15% APY) or **native DOT/PAS** (via WPAS) as collateral and borrow against it. Two live collateral markets. No other protocol on Polkadot Hub does this.

**Three steps:**
1. Deposit vDOT or WPAS as collateral (continues earning Bifrost staking yield)
2. Borrow USDH up to 70% LTV
3. Repay when ready — or face permissionless liquidation at 80% threshold

Health factor monitored in real time: `HF = (Collateral × 0.80) / Debt`. Liquidators receive a 5% bonus for maintaining protocol solvency. Interest accrues lazily per second via block.timestamp — no cron needed.

---

## Revenue Model — Testnet vs Mainnet

**Testnet (current):** MockUSDH is a synthetic token — TreasuryRouter intercepts every repayment, burns the principal (MockUSDH grants burn rights), and routes only the accrued 0.5%/yr stability fee to the treasury. Principal is destroyed because there is no real liquidity pool on testnet.

**Mainnet (Aave/Compound model):** Hollar is a real stablecoin — DotLend cannot burn it. Repaid Hollar principal returns to the LendingPool reserve for the next borrower. Only the stability fee goes to treasury. On mainnet, governance directs treasury fees toward:
- Buying DOT on Hydration DEX via XCM → stake via Bifrost → distribute vDOT to stakers
- DOTLEND governance token buyback and burn (Phase 3)

Every dollar borrowed on DotLend eventually becomes DOT demand.

---

## Why Only Possible on Polkadot

On Ethereum this requires Chainlink oracles, multisig bridges, and wrapped tokens — trust assumptions at every layer.

On Polkadot Hub:
- vDOT is a native Polkadot asset (Bifrost parachain) — no bridge needed
- Hollar is a native Polkadot stablecoin (Hydration/Honzon) — no wrapping
- XCM enables native price feeds from Bifrost with zero external dependency
- Hyperbridge ISMP provides trustless cross-chain state proofs for mainnet oracle

This architecture is not replicable on Ethereum without bridge trust assumptions.

---

## Technical Implementation

**13 Solidity contracts deployed on Polkadot Hub TestNet (Chain ID: 420420417)**

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
| XCMTreasuryDispatch | `0x3FfEAC3766F05752f8D3Ae8eEd00B57259Eb3c2d` |

✅ **102 tests passing, 2 pending (XCM live network), 0 failures**

Stack: Solidity 0.8.20 · OpenZeppelin v4.9.6 · Hardhat · Next.js · TypeScript · viem · wagmi · Noir · Railway · Python

PolkaVM compatibility: No SELFDESTRUCT, no EXTCODECOPY, no assembly, no factory patterns. OZ v4.x only (v5.x incompatible with resolc). Verified clean against all PolkaVM opcode restrictions.

---

## ZK Solvency Architecture

Complete zero-knowledge solvency proof pipeline built in Noir (UltraHonk). The circuit proves `total_collateral_value >= total_debt` without revealing individual positions. Proof submitted on-chain via SolvencyGateway every 30 minutes on Railway.

**What is real:**
- Noir circuit — `nargo compile` clean
- Proof generation pipeline — Railway cron every 30 minutes
- On-chain `SolvencyProven` event via SolvencyGateway
- Full architecture mainnet-ready

**Current testnet limitation:** UltraHonk on-chain verification requires BN254 elliptic curve precompiles (EIP-196/197). PolkaVM's resolc does not yet support these. MockSolvencyVerifier used on testnet. Real verifier deploys the moment PolkaVM adds BN254 support — a known item on the PolkaVM roadmap. This is an honest platform constraint, not a design gap.

---

## XCM Track 2 — Precompile Integration

`XCMTreasuryDispatch.sol` calls the live XCM precompile at `0x0000000000000000000000000000000000000800` directly from Solidity — no Substrate, no Rust. This enables the treasury fee flywheel: stability fees trigger XCM messages to Hydration DEX to buy DOT, entirely from EVM. Deployed and verified on Polkadot Hub TestNet.

---

## AI Advisor

The `/advisor` page ships a live AI risk dashboard: streaming Claude AI chat with live on-chain position context, A–F borrower risk grade (HF + LTV), price drop simulator (−10–50%), liquidation alert banner, mock AML screening, and a protocol transparency card — all from existing wagmi reads, zero new contract calls.

---

## OpenZeppelin Sponsor Track

DotLend uses **OpenZeppelin v4.9.6** as its security foundation across every contract:

| OZ Contract | Used In | Purpose |
|------------|---------|--------|
| `Ownable` | LendingPool, CollateralVault, PriceOracle, TreasuryRouter, SolvencyGateway | Privileged admin functions |
| `ReentrancyGuard` | LendingPool | Prevents reentrancy on borrow/repay/liquidate |
| `ERC20` | MockvDOT, MockUSDH, WPAS | Standard token implementations |

**The TreasuryRouter constraint story:** PolkaVM enforces a strict initcode size limit. LendingPool already inherits from both `Ownable` and `ReentrancyGuard` — adding fee-splitting logic inline pushed the compiled bytecode over the limit. The solution was `TreasuryRouter` — a separate contract implementing the same `IMintBurn` interface, sitting between LendingPool and the real USDH token. It intercepts every `mint()`, `transferFrom()`, and `burn()` call: tracking principal per user, burning principal on repay, and routing only the accrued stability fee to treasury. This pattern exists *specifically because* OpenZeppelin's composition model consumed enough bytecode that fee logic had to be externalized — producing a cleaner, more testable, more auditable architecture than inline fee logic would have been.

---

## Polkadot Hub Features Used

- **EVM on Polkadot Hub** — Hub-native, not a sidechain. Polkadot shared security, relay chain finality, direct XCM connectivity.
- **XCM precompile** — XCMTreasuryDispatch calls the live XCM precompile from pure Solidity (Track 2)
- **WPAS** — zero-admin WETH9-style wrapper enabling native DOT/PAS as collateral without modifying core contracts
- **PolkaVM** — built from scratch for resolc constraints: no forbidden opcodes, OZ v4.x only, no assembly

---

## V2 Asset Roadmap — Snowbridge Makes This Real

| Asset | Type | Status |
|---|---|---|
| vDOT (Bifrost) | Collateral | ✅ Live (testnet) |
| USDH (mock) | Borrowable | ✅ Live (testnet) |
| USDC (Snowbridge) | Both | 🔜 Mainnet |
| wETH (Snowbridge) | Both | 🔜 Mainnet |
| wBTC (Snowbridge) | Collateral | 🔜 Mainnet |
| vKSM, vETH (Bifrost) | Collateral | 🔜 Mainnet |

---

## Mainnet Roadmap

| Phase | Timeline | Milestone |
|-------|----------|-----------|
| 1 | Now | Testnet validation on Polkadot Hub TestNet |
| 2 | Q2 2026 | W3F grant + PAL security audit |
| 3 | Q2 2026 | Mainnet with Hyperbridge ISMP oracle + real Hollar |
| 4 | Q3 2026 | Bifrost SLPx — mint vDOT + collateralize in one tx |
| 5 | Q3 2026 | Velocity Labs DeFi Builders Cohort · $10M TVL target |

---

## Team

**Orthonode Infrastructure Labs** — Bhopal, India
Building verification and governance infrastructure across Polkadot, Arbitrum, Solana, and TON.

**Arhant Barmate** — Founder & Lead Engineer
infrastructure@orthonode.xyz | orthonode.xyz | github.com/orthonode
