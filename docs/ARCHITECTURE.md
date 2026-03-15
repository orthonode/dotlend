# DotLend — Technical Architecture
## The First Money Market on Polkadot Hub

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Contract Architecture](#2-contract-architecture)
3. [User Flow Diagrams](#3-user-flow-diagrams)
4. [Oracle Architecture](#4-oracle-architecture)
5. [ZK Solvency Architecture](#5-zk-solvency-architecture)
6. [Frontend Architecture](#6-frontend-architecture)
7. [Deployment Topology](#7-deployment-topology)
8. [Security Model](#8-security-model)
9. [PolkaVM Compatibility Notes](#9-polkavm-compatibility-notes)

---

## 1. System Overview

DotLend is a non-custodial money market protocol deployed on Polkadot Hub (EVM-compatible via PolkaVM). Users deposit vDOT as collateral and borrow USDH — a synthetic stablecoin — at a 70% LTV ratio. The protocol is the first native lending market for vDOT, directly addressing the supply cap exhaustion and zero on-chain lending infrastructure that exists today on Hydration.

### Full System Diagram

```
╔══════════════════════════════════════════════════════════════════════════════════════════╗
║                              DOTLEND — FULL SYSTEM                                       ║
║                     Polkadot Hub TestNet  |  Chain ID 420420417                          ║
╚══════════════════════════════════════════════════════════════════════════════════════════╝

                           ┌─────────────────────────────────┐
                           │          USERS (Browser)         │
                           │   MetaMask / injected wallet     │
                           └─────────────┬───────────────────┘
                                         │ HTTPS + JSON-RPC
                                         ▼
                    ┌────────────────────────────────────────────┐
                    │         FRONTEND  (Vercel)                  │
                    │         nexucore.xyz                        │
                    │         Next.js 16 + wagmi v2           │
                    │                                             │
                    │  ┌─────────────────────────────────────┐   │
                    │  │ ConnectButton  │  SolvencyStatus     │   │
                    │  │ LendingDashboard                     │   │
                    │  │ DepositCollateral  │  BorrowUSDH      │   │
                    │  │ RepayAndWithdraw   │  LiquidationMon │   │
                    │  └─────────────────────────────────────┘   │
                    └───────────┬────────────────────────────────┘
                                │ wagmi useReadContract / useWriteContract
                                │ viem getLogs
                                ▼
╔═══════════════════════════════════════════════════════════════════════════════════════════╗
║               POLKADOT HUB TESTNET  (Chain ID 420420417, PolkaVM)                        ║
║                                                                                           ║
║   ┌───────────────┐     ┌──────────────────┐     ┌─────────────────────────────────┐    ║
║   │  MockvDOT     │     │   MockUSDH       │     │         PriceOracle             │    ║
║   │  ERC-20       │     │   ERC-20         │     │  submitPrice / getPrice          │    ║
║   │  mint()       │     │   mint/burn      │     │  stale guard: 3600s             │    ║
║   └───────┬───────┘     └────────┬─────────┘     └───────────────┬─────────────────┘    ║
║           │ deposit/seize        │ mint/burn/transfer             │ getLatestPrice        ║
║           │                      │                                │                      ║
║   ┌───────┴───────┐              │                                │                      ║
║   │    WPAS       │ (Native)     │                                │                      ║
║   │  ERC-20 wrap  │              │                                │                      ║
║   └───────┬───────┘              │                                │                      ║
║           │ deposit/seize        │                                │                      ║
║           ▼                      ▼                                ▼                      ║
║   ┌──────────────────────┐   ┌──────────────────────────────────────────────────────┐   ║
║   │   CollateralVault    │◄──│              LendingPool                             │   ║
║   │  deposit / withdraw  │   │  borrow / repay / liquidate                          │   ║
║   │  setDebt             │   │  lazy interest accrual                               │   ║
║   │  seizeCollateral     │   │  ReentrancyGuard                                     │   ║
║   │  getHealthFactor     │   └──────────────────────────────────────────────────────┘   ║
║   └──────────────────────┘                                                               ║
║                                                                                           ║
║   ┌──────────────────────────────────────────────────────────────────────────┐           ║
║   │                    SolvencyGateway                                        │           ║
║   │  publishSolvencyProof(proof, publicInputs) → emit SolvencyProven          │           ║
║   └──────────────────────────────┬───────────────────────────────────────────┘           ║
║                                  │ verifySolvency()                                      ║
║                                  ▼                                                       ║
║   ┌──────────────────────────────────────────────────────────────────────────┐           ║
║   │                  MockSolvencyVerifier                                     │           ║
║   │  (prod: UltraHonk BN254 verifier — not yet PolkaVM-deployable)            │           ║
║   └──────────────────────────────────────────────────────────────────────────┘           ║
╚═══════════════════════════════════════════════════════════════════════════════════════════╝
          ▲                                          ▲
          │ submitPrice every 5 min                  │ publishSolvencyProof every 30m
          │                                          │
   ┌──────┴──────────────┐              ┌────────────┴────────────────────────────────┐
   │   oracle.py         │              │   Railway Cron Job                           │
   │   Python process    │              │   generate-solvency-proof.js                 │
   │   DeFiLlama API     │              │   Noir ZK prover (UltraHonk)                 │
   │   DOT/USD → wei     │              │   Fallback: dummy proof bytes                │
   └─────────────────────┘              └─────────────────────────────────────────────┘
          ▲
          │ (Mainnet path)
   ┌──────┴────────────────────────────────────────────┐
   │   Hyperbridge ISMP                                 │
   │   Hydration Omnipool (Polkadot) → XCM message      │
   │   → ISMP relay → PriceOracle.submitPrice()         │
   └───────────────────────────────────────────────────┘
```

---

## 2. Contract Architecture

### 2.1 Contract Dependency Graph

```
                         ┌─────────────────┐
                         │   PriceOracle   │
                         │ 0xea7a8D...Bc1D │
                         └────────┬────────┘
                                  │ getLatestPrice()
                    ┌─────────────┼──────────────────┐
                    │             │                   │
                    ▼             ▼                   │
          ┌─────────────┐  ┌─────────────┐           │
          │  MockvDOT   │  │ MockUSDH   │           │
          │ 0x95Fa...CA │  │ 0xA94f...ca │           │
          └──────┬──────┘  └──────┬──────┘           │
                 │                │                   │
           ┌─────┴─────┐          │                   │
           │   WPAS    │          │                   │
           │           │          │                   │
           └─────┬─────┘          │                   │
                 │                │                   │
           transferFrom      mint / burn              │
           transfer          transferFrom             │
                 │                │                   │
           transferFrom      mint / burn              │
           transfer          transferFrom             │
                 │                │                   │
                 ▼                ▼                   ▼
          ┌──────────────────────────────────────────────┐
          │            CollateralVault                    │
          │         0xc8cd...A14c                         │
          │                                              │
          │  deposit()       withdraw()                  │
          │  setDebt()       seizeCollateral()           │
          │  getHealthFactor() getCollateralValue()      │
          └──────────────────────┬───────────────────────┘
                                 │ onlyLendingPool
                                 ▼
          ┌──────────────────────────────────────────────┐
          │               LendingPool                     │
          │            0xd8e2...52b                        │
          │                                              │
          │  borrow()        repay()                     │
          │  liquidate()     accrueInterest()            │
          └──────────────────────────────────────────────┘

          ┌──────────────────────────────────────────────┐
          │            SolvencyGateway                    │
          │          0x6B68...66C0                        │
          │                                              │
          │  publishSolvencyProof(proof, publicInputs)   │
          └──────────────────────┬───────────────────────┘
                                 │ verifySolvency()
                                 ▼
          ┌──────────────────────────────────────────────┐
          │         MockSolvencyVerifier                  │
          │          0x5410...cc0e                        │
          │   verifySolvency(proof, inputs) → bool        │
          └──────────────────────────────────────────────┘
```

### 2.2 Contract Descriptions

#### PriceOracle — `0x1282F6B59869a57Fd2a1D7a5BC8535bB7B15D173`

The single source of truth for vDOT/USD price on-chain.

| Function | Visibility | Description |
|---|---|---|
| `submitPrice(address asset, uint256 priceInWei)` | `authorizedOracle` | Push a new price. Stores timestamp. |
| `getLatestPrice(address asset)` | `public view` | Returns price. Reverts if stale (> 3600s). |
| `setAuthorizedOracle(address)` | `onlyOwner` | Rotate the oracle EOA. |

**Storage:**
```
mapping(address => uint256) public prices;
mapping(address => uint256) public lastUpdated;
address public authorizedOracle;
```

**Access Control:** `Ownable` + `authorizedOracle` modifier. Only one address may submit prices at a time. Owner may rotate the oracle address.

**Stale Guard:** `getLatestPrice` reverts with `"Price stale"` if `block.timestamp - lastUpdated[asset] > 3600`. This prevents the lending pool from accepting liquidations based on stale data.

---

#### MockvDOT — `0xfc1ACa9EDF5DA2eBEA5CE1320fb40A74Ac996544`

Standard OpenZeppelin v4 ERC-20. Public `mint(address, uint256)` for testnet purposes. Represents liquid staked DOT (vDOT from Bifrost) on Polkadot Hub.

---

#### WPAS — Standard ERC-20 Wrapper

Zero-admin WETH9-style wrapper mapping native PAS/DOT 1:1 to an ERC-20 compliant token. Allows native Polkadot assets to be used as collateral directly within the existing `CollateralVault` architecture. Users call `deposit{value: amount}()` to receive WPAS.

---

#### MockUSDH — `0x7d605b39a8EeF1aCA3D63bD7A32E2719abA87683`

Standard OpenZeppelin v4 ERC-20. `mint()` is restricted to `LendingPool` only. `burn()` is called via `burnFrom` by `LendingPool` on repayment. USDH is the protocol-native synthetic dollar.

**Key design decision:** USDH is protocol-minted debt, not a pre-funded reserve. This eliminates liquidity provider risk from the lending side — collateral solvency is the only backstop.

---

#### CollateralVault — `0xF94eBe7F8d8F922B7FBBFb4BE080EB71a69415A2`

Holds all vDOT collateral. Computes health factors. Mediates between user deposits and lending pool debt accounting.

| Function | Visibility | Description |
|---|---|---|
| `deposit(uint256 amount)` | `public` | Transfer vDOT from user, update `collateralBalance`. |
| `withdraw(uint256 amount)` | `public` | Transfer vDOT back, reverts if health factor < 1.0 after. |
| `setDebt(address user, uint256 debt)` | `onlyLendingPool` | Update debt record for a user. |
| `seizeCollateral(address from, uint256 amount, address to)` | `onlyLendingPool` | Transfer collateral to liquidator. |
| `getCollateralValue(address user)` | `public view` | Returns `(collateralBalance[user] * price) / 1e18`. |
| `getHealthFactor(address user)` | `public view` | Returns `(collateralValue * liquidationThreshold) / debt`. |

**Storage:**
```
mapping(address => uint256) public collateralBalance;  // in vDOT wei
mapping(address => uint256) public debtBalance;        // in USDH wei
uint256 public constant LTV = 70;                      // 70%
uint256 public constant LIQUIDATION_THRESHOLD = 80;   // 80%
uint256 public constant LIQUIDATION_BONUS = 5;        // 5%
```

---

#### LendingPool — `0x34B22768B16262aD5b7fC23DD797D80791e4e7e6`

Core protocol logic. Orchestrates borrow, repay, and liquidate. Applies lazy interest accrual per user on each interaction.

| Function | Visibility | Description |
|---|---|---|
| `borrow(uint256 usdhAmount)` | `public nonReentrant` | Check LTV, update debt, mint USDH. |
| `repay(uint256 usdhAmount)` | `public nonReentrant` | Burn USDH, reduce debt. |
| `liquidate(address borrower)` | `public nonReentrant` | Seize collateral, wipe debt, liquidator covers USDH. |
| `accrueInterest(address user)` | `internal` | Compound stability fee since last interaction. |

**Interest Accrual (lazy model):**
```
elapsed     = block.timestamp - lastAccrual[user]
newDebt     = oldDebt * (1 + STABILITY_FEE_BPS/10000) ^ (elapsed / SECONDS_PER_YEAR)
```
Approximated with integer math, no floating point. Stability fee: 0.5% per year (5 bps).

**Liquidation Mechanics:**
- Caller must hold enough USDH to cover the borrower's full debt.
- Liquidator receives collateral worth `debt * (1 + LIQUIDATION_BONUS/100)` at oracle price.
- Full debt wipe only — no partial liquidations in v1.

---

#### MockSolvencyVerifier — `0xED2676C995BAA392093Ac0b907EA216c2B8C52cc`

Test-only verifier. Accepts any proof bytes and returns `true`. In production, this is replaced by the Noir-generated UltraHonk BN254 verifier. The real verifier uses BN254 elliptic curve pairings (assembly-heavy) which are not yet deployable on PolkaVM — hence the mock for testnet.

---

#### SolvencyGateway — `0x199E3E7c1f1382bc389b495B927B0535B390Acd0`

Thin on-chain gate for ZK solvency proofs. Separated from `LendingPool` to stay within the 100KB PolkaVM initcode limit.

| Function | Visibility | Description |
|---|---|---|
| `publishSolvencyProof(bytes proof, uint256[] publicInputs)` | `public` | Call verifier, emit `SolvencyProven`. |
| `setVerifier(address)` | `onlyOwner` | Set once at deploy. Immutable after. |

**Event:**
```solidity
event SolvencyProven(
    uint256 totalCollateral,
    uint256 totalDebt,
    uint256 timestamp,
    bytes32 proofHash
);
```

---

## 3. User Flow Diagrams

### 3.1 Deposit Flow

```
User                    Frontend               CollateralVault          MockvDOT
 │                          │                        │                      │
 │   Click "Deposit vDOT"   │                        │                      │
 │──────────────────────────►                        │                      │
 │                          │  useWriteContract      │                      │
 │                          │  vDOT.approve(vault,n) │                      │
 │                          │────────────────────────────────────────────►  │
 │   MetaMask prompt        │                        │                      │
 │◄─────────────────────────│                        │               approve stored
 │   Confirm tx             │                        │                      │
 │──────────────────────────►                        │                      │
 │                          │                        │                      │
 │                          │  vault.deposit(amount) │                      │
 │                          │────────────────────────►                      │
 │                          │                        │  transferFrom(user,  │
 │                          │                        │    vault, amount)    │
 │                          │                        │─────────────────────►│
 │                          │                        │                      │
 │                          │                        │  collateralBalance   │
 │                          │                        │    [user] += amount  │
 │                          │                        │                      │
 │                          │   Deposited event      │                      │
 │                          │◄────────────────────────                      │
 │   Dashboard refreshes    │                        │                      │
 │◄─────────────────────────│                        │                      │
```

### 3.2 Borrow Flow

```
User            Frontend         LendingPool      CollateralVault   PriceOracle   MockUSDH
 │                  │                │                   │               │              │
 │ Enter amount     │                │                   │               │              │
 │─────────────────►│                │                   │               │              │
 │                  │ Preview HF     │                   │               │              │
 │                  │ getHealthFactor│                   │               │              │
 │                  │ (simulated)    │                   │               │              │
 │ Confirm borrow   │                │                   │               │              │
 │─────────────────►│                │                   │               │              │
 │                  │ borrow(amount) │                   │               │              │
 │                  │───────────────►│                   │               │              │
 │                  │                │ accrueInterest()  │               │              │
 │                  │                │ getCollateralValue│               │               │
 │                  │                │───────────────────►               │              │
 │                  │                │                   │ getLatestPrice│              │
 │                  │                │                   │───────────────►              │
 │                  │                │                   │  price in wei │              │
 │                  │                │                   │◄──────────────│              │
 │                  │                │                   │               │              │
 │                  │                │ collateralValue   │               │              │
 │                  │                │◄──────────────────│               │              │
 │                  │                │                   │               │              │
 │                  │                │ Check: newDebt ≤ collateralValue * 0.70          │
 │                  │                │                   │               │              │
 │                  │                │ vault.setDebt(user, totalDebt)    │              │
 │                  │                │───────────────────►               │              │
 │                  │                │                   │               │              │
 │                  │                │ usdh.mint(user, amount)           │              │
 │                  │                │──────────────────────────────────────────────►  │
 │                  │                │                   │               │              │
 │                  │  Borrowed event│                   │               │              │
 │                  │◄───────────────│                   │               │              │
 │ USDH in wallet   │                │                   │               │              │
 │◄─────────────────│                │                   │               │              │
```

### 3.3 Repay Flow

```
User            Frontend           LendingPool           CollateralVault    MockUSDH
 │                  │                   │                       │                │
 │  Select Repay    │                   │                       │                │
 │─────────────────►│                   │                       │                │
 │                  │  usdh.approve     │                   │                       │                │
 │                  │  (lendingPool, n) │                       │                │
 │                  │────────────────────────────────────────────────────────►  │
 │  Confirm approve │                   │                       │                │
 │◄─────────────────│                   │                       │                │
 │  Sign            │                   │                       │                │
 │─────────────────►│                   │                       │                │
 │                  │  repay(amount)    │                       │                │
 │                  │───────────────────►                       │                │
 │                  │                   │  accrueInterest(user) │                │
 │                  │                   │  usdh.transferFrom  │                │
 │                  │                   │  (user, pool, amount) │                │
 │                  │                   │────────────────────────────────────►  │
 │                  │                   │                       │                │
 │                  │                   │  usdh.burn(amount)    │                │
 │                  │                   │────────────────────────────────────►  │
 │                  │                   │                       │                │
 │                  │                   │  vault.setDebt        │                │
 │                  │                   │  (user, remaining)    │                │
 │                  │                   │───────────────────────►                │
 │                  │  Repaid event     │                       │                │
 │                  │◄──────────────────│                       │                │
 │  Debt reduced    │                   │                       │                │
 │◄─────────────────│                   │                       │                │
```

### 3.4 Liquidation Flow

```
                Price Crash Trigger
                DOT drops → HF < 1.0
                        │
                        ▼
Liquidator      Frontend            LendingPool      CollateralVault   MockUSDH     MockvDOT
    │               │                    │                  │               │            │
    │  Monitor HFs  │                    │                  │               │            │
    │──────────────►│                    │                  │               │            │
    │               │ Scan Borrowed evts │                  │               │            │
    │               │ getHealthFactor    │                  │               │            │
    │               │ for each borrower  │                  │               │            │
    │               │────────────────────────────────────►  │               │            │
    │               │ HF < 1.0 flagged   │                  │               │            │
    │               │◄───────────────────────────────────── │               │            │
    │               │                    │                  │               │            │
    │  Click         │                   │                  │               │            │
    │  "Liquidate"  │                    │                  │               │            │
    │──────────────►│                    │                  │               │            │
    │               │ usdh.approve       │                  │               │            │
    │               │ (lendingPool, debt)│                  │               │            │
    │               │────────────────────────────────────────────────────►  │            │
    │               │ liquidate(borrower)│                  │               │            │
    │               │───────────────────►│                  │               │            │
    │               │                    │ accrueInterest   │               │            │
    │               │                    │ getHealthFactor  │               │            │
    │               │                    │──────────────────►               │            │
    │               │                    │  HF < 1.0 ✓      │               │            │
    │               │                    │◄──────────────── │               │            │
    │               │                    │                  │               │            │
    │               │                    │ usdh.transferFrom                │            │
    │               │                    │ (liquidator, pool, debt)         │            │
    │               │                    │────────────────────────────────►  │            │
    │               │                    │ usdh.burn(debt)   │               │            │
    │               │                    │────────────────────────────────►  │            │
    │               │                    │ vault.setDebt(borrower, 0)        │            │
    │               │                    │──────────────────►                │            │
    │               │                    │ vault.seizeCollateral             │            │
    │               │                    │ (borrower,                        │            │
    │               │                    │  amount * 1.05,  │               │            │
    │               │                    │  liquidator)     │               │            │
    │               │                    │──────────────────►               │            │
    │               │                    │                  │ vDOT.transfer  │            │
    │               │                    │                  │ (liquidator, n)│            │
    │               │                    │                  │────────────────────────────►
    │               │  Liquidated event  │                  │               │            │
    │               │◄───────────────────│                  │               │            │
    │  +5% bonus    │                    │                  │               │            │
    │  in vDOT      │                    │                  │               │            │
    │◄──────────────│                    │                  │               │            │
```

---

## 4. Oracle Architecture

### 4.1 Testnet Oracle (oracle.py)

Python process run locally or on a server every 5 minutes. Pushes DOT/USD price to `PriceOracle` on-chain.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       oracle.py  (30-minute cron)                         │
│                                                                            │
│  1. GET https://coins.llama.fi/prices/current/coingecko:polkadot          │
│        (DeFiLlama — no API key, no geo-blocking)                          │
│                                                                            │
│  2. price_usd  = response["coins"]["coingecko:polkadot"]["price"]        │
│     price_wei  = int(price_usd * 1e18)    # 18 decimal fixed-point        │
│                                                                            │
│  3. web3.eth.contract(PriceOracle_ADDRESS, ABI)                           │
│        .functions.submitPrice(VDOT_ADDRESS, price_wei)                    │
│        .transact({"from": ORACLE_EOA})                                    │
│                                                                            │
│  4. PriceOracle.lastUpdated[vDOT] = block.timestamp                       │
└──────────────────────────────────────────────────────────────────────────┘
         │
         │ on-chain tx
         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│   PriceOracle  (0x1282F6B59869a57Fd2a1D7a5BC8535bB7B15D173)              │
│                                                                            │
│   prices[vDOT]      = price_wei                                           │
│   lastUpdated[vDOT] = block.timestamp                                     │
│                                                                            │
│   Stale guard: revert if block.timestamp - lastUpdated > 3600             │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Mainnet Oracle — Hyperbridge ISMP Path

On mainnet, the oracle EOA is replaced by a trustless cross-chain message from Hydration (Polkadot's DEX parachain), routed through Hyperbridge's Inter-System Message Passing (ISMP) protocol.

```
┌───────────────────────────────────────────────────────────────────────────────┐
│              Hydration Omnipool  (Polkadot Parachain 2034)                    │
│                                                                                │
│  vDOT / USDC pool  →  on-chain TWAP price                                    │
│  XCM message encoding: (asset=vDOT, price=X, timestamp=T)                    │
└──────────────────────────────────┬────────────────────────────────────────────┘
                                   │ XCM outbound message
                                   ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│              Hyperbridge  (ISMP Relay)                                         │
│                                                                                │
│  Receives XCM message from Hydration                                           │
│  Aggregates into ISMP state proof                                              │
│  Routes to destination: Polkadot Hub (EVM)                                     │
│  Calls: ISMPHandler.onAccept(message)                                          │
└──────────────────────────────────┬────────────────────────────────────────────┘
                                   │ EVM call on Polkadot Hub
                                   ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│              ISMPHost  (Polkadot Hub EVM contract)                             │
│                                                                                │
│  Verifies Hyperbridge ISMP proof                                               │
│  Calls: PriceOracle.submitPrice(vDOT, price)                                  │
│  No trusted EOA required — cryptographically verified                          │
└───────────────────────────────────────────────────────────────────────────────┘

Key Property: No oracle EOA private key. No single point of compromise.
Price derives from Hydration's Omnipool TWAP, which is the most liquid
vDOT/USD venue in the Polkadot ecosystem ($330M TVL in USDH).
```

---

## 5. ZK Solvency Architecture

### 5.1 Circuit Structure

**File:** `circuits/solvency/src/main.nr`
**Language:** Noir 1.0.0-beta.19
**Proving system:** UltraHonk (Barretenberg backend)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                    Noir Solvency Circuit                                        │
│                    circuits/solvency/src/main.nr                                │
│                                                                                  │
│  PRIVATE INPUTS (witness — never revealed on-chain):                            │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │  collateral_values : [u64; 64]   // per-user vDOT in gwei (/ 1e9)       │  │
│  │  debt_amounts      : [u64; 64]   // per-user USDH in gwei (/ 1e9)     │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  PUBLIC INPUTS (verified on-chain):                                             │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │  total_collateral_value : Field  // sum of all collateral_values         │  │
│  │  total_debt             : Field  // sum of all debt_amounts              │  │
│  │  oracle_timestamp       : Field  // unix timestamp of price used         │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  CONSTRAINTS:                                                                   │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │  1. sum(collateral_values) == total_collateral_value                     │  │
│  │  2. sum(debt_amounts)      == total_debt                                 │  │
│  │  3. total_collateral_value >= total_debt  (protocol is solvent)          │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  PROOF SYSTEM: UltraHonk (BN254 elliptic curve, Groth16-class succinctness)    │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Off-Chain Proof Generation Pipeline

**Script:** `scripts/generate-solvency-proof.js`
**Runtime:** Railway cron, every 30 minutes

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                  generate-solvency-proof.js  (Railway Cron, every 30m)              │
└──────────────────────────────────────────┬──────────────────────────────────────────┘
                                           │
                                           ▼
                         ┌─────────────────────────────────┐
                         │  Step 1: Fetch Fresh Price        │
                         │  DeFiLlama API → DOT/USD          │
                         │  oracle.submitPrice(vDOT, price)  │
                         └───────────────┬─────────────────┘
                                         │
                                         ▼
                         ┌─────────────────────────────────┐
                         │  Step 2: Collect Active Users     │
                         │  Scan CollateralVault.Deposited   │
                         │  events via viem getLogs          │
                         │  Deduplicate → address[]          │
                         └───────────────┬─────────────────┘
                                         │
                                         ▼
                         ┌─────────────────────────────────┐
                         │  Step 3: Read On-Chain State      │
                         │  For each user:                   │
                         │  collateralBalance[user] (vDOT)   │
                         │  debtBalance[user] (USDH)       │
                         └───────────────┬─────────────────┘
                                         │
                                         ▼
                         ┌─────────────────────────────────┐
                         │  Step 4: Compute Witness          │
                         │  collUSD = (collWei * price)      │
                         │              / 1e18               │
                         │  collGwei = collUSD / 1e9         │
                         │  debtGwei = debtWei / 1e9         │
                         │  Pad arrays to length 64          │
                         └───────────────┬─────────────────┘
                                         │
                                         ▼
                         ┌─────────────────────────────────┐
                         │  Step 5: Generate ZK Proof        │
                         │  Primary path:                    │
                         │  @noir-lang/noir_js               │
                         │  + @noir-lang/backend_barretenberg│
                         │  → UltraHonk proof bytes          │
                         │                                   │
                         │  Fallback (circuit not compiled): │
                         │  dummy proof bytes (0x00...00)    │
                         │  MockSolvencyVerifier accepts any │
                         └───────────────┬─────────────────┘
                                         │
                                         ▼
                         ┌─────────────────────────────────┐
                         │  Step 6: Submit On-Chain          │
                         │  gateway.publishSolvencyProof(   │
                         │    proof,                         │
                         │    [totalCollateral,             │
                         │     totalDebt,                   │
                         │     timestamp]                   │
                         │  )                               │
                         └───────────────┬─────────────────┘
                                         │
                                         ▼
                         ┌─────────────────────────────────┐
                         │  Step 7: SolvencyProven Event    │
                         │  Emitted on Polkadot Hub         │
                         │  Frontend reads via getLogs       │
                         │  Displays: SOLVENT badge          │
                         └─────────────────────────────────┘
```

### 5.3 On-Chain Verification Flow

```
                Railway Cron
                     │
                     │ publishSolvencyProof(proof, [collateral, debt, timestamp])
                     ▼
        ┌────────────────────────────────────────┐
        │           SolvencyGateway               │
        │                                         │
        │  1. Decode publicInputs array           │
        │  2. Call verifier.verifySolvency(       │
        │       proof, publicInputs)              │
        └──────────────────┬──────────────────────┘
                           │
                           ▼
        ┌────────────────────────────────────────┐
        │    MockSolvencyVerifier (testnet)       │
        │    [Real: Noir UltraHonk verifier]      │
        │                                         │
        │  Testnet:  return true (any bytes)      │
        │  Mainnet:  BN254 pairing check          │
        │            π_A, π_B, π_C verification  │
        │            Public input hash check      │
        └──────────────────┬──────────────────────┘
                           │ returns true
                           ▼
        ┌────────────────────────────────────────┐
        │           SolvencyGateway               │
        │                                         │
        │  emit SolvencyProven(                   │
        │    totalCollateral,                     │
        │    totalDebt,                           │
        │    timestamp,                           │
        │    keccak256(proof)                     │
        │  )                                      │
        └────────────────────────────────────────┘
                           │
                           │ event on-chain
                           ▼
        ┌────────────────────────────────────────┐
        │     Frontend SolvencyStatus.tsx         │
        │                                         │
        │  getLogs(SolvencyGateway, SolvencyProven)│
        │  Latest event < 6h ago → SOLVENT (green)│
        │  Latest event > 6h ago → PROOF AGING    │
        │  No event found       → UNVERIFIED      │
        └────────────────────────────────────────┘
```

---

## 6. Frontend Architecture

### 6.1 Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16.1.6 |
| Wallet | wagmi | v2 |
| EVM client | viem | v2 |
| Data fetching | @tanstack/react-query | latest |
| Styling | Tailwind CSS | latest |
| Network | Polkadot Hub TestNet | Chain ID 420420417 |

### 6.2 Component Tree

```
app/
└── layout.tsx  (WagmiProvider + QueryClientProvider)
    └── page.tsx
        ├── ConnectButton.tsx
        │     useAccount, useConnect, useDisconnect
        │     Wrong-chain detection → prompt switch to 420420417
        │
        ├── SolvencyStatus.tsx
        │     getLogs(SolvencyGateway, "SolvencyProven")
        │     Latest event timestamp → SOLVENT / PROOF AGING / UNVERIFIED
        │
        ├── LendingDashboard.tsx
        │     useReadContract(CollateralVault, "collateralBalance")
        │     useReadContract(CollateralVault, "debtBalance")
        │     useReadContract(CollateralVault, "getHealthFactor")
        │     useReadContract(PriceOracle,     "getLatestPrice")
        │     → Health factor bar (green > 1.5, yellow 1.2-1.5, red < 1.2)
        │
        ├── DepositCollateral.tsx
        │     Input: vDOT amount
        │     Live USD preview: amount * oraclePrice
        │     useWriteContract(MockvDOT,       "approve")
        │     useWriteContract(CollateralVault,"deposit")
        │     Two-step: approve → deposit
        │
        ├── BorrowUSDH.tsx
        │     Input: USDH amount
        │     Real-time health factor preview after borrow
        │     Red warning if projected HF < 1.2
        │     useWriteContract(LendingPool, "borrow")
        │
        ├── RepayAndWithdraw.tsx
        │     Tabbed: [Repay | Withdraw]
        │     Repay: approve USDH → repay
        │     Withdraw: checks health factor headroom
        │     useWriteContract(MockUSDH,    "approve")
        │     useWriteContract(LendingPool, "repay")
        │     useWriteContract(CollateralVault, "withdraw")
        │
        ├── LiquidationMonitor.tsx
        │     Scan Borrowed events → active borrower addresses
        │     getHealthFactor for each → display table
        │     HF < 1.0 → "Liquidate" button active
        │     useWriteContract(MockUSDH,    "approve")
        │     useWriteContract(LendingPool, "liquidate")
        │
        └── AiAdvisor.tsx  (/advisor page)
              useReadContracts(collateralBalance, debtBalance, prices)
              A–F risk grade badge — compound HF + LTV thresholds
              Price drop simulator — 10/20/30/40/50% scenarios
              Liquidation alert banner — dismissible, HF < 1.3
              Mock AML screening — 3 hardcoded flagged addresses
              Transparency card — test count, audit status, ZK caveat
              Streaming chat via /api/advisor (Groq Llama 3.3 70B)
              Route prepends PROTOCOL_CONTEXT block server-side
```

### 6.3 Data Flow Diagram

```
                    Polkadot Hub TestNet RPC
                 https://eth-rpc-testnet.polkadot.io
                              │
               ┌──────────────┼──────────────────────────────────┐
               │              │                                   │
               ▼              ▼                                   ▼
   useReadContract       getLogs (viem)               useWriteContract
   (wagmi hook)          (event scan)                 (wagmi hook)
        │                     │                             │
        ▼                     ▼                             ▼
  React Query cache     SolvencyStatus              MetaMask signs tx
  auto-refetch(15s)     LiquidationMonitor          tx submitted to RPC
        │                                                   │
        ▼                                                   ▼
  Component state                                    waitForTransaction
  (collateral, debt,                                 receipt → invalidate
   healthFactor, price)                              React Query cache
        │                                                   │
        ▼                                                   ▼
  UI render                                         UI shows success toast
  (dashboard bars,                                  values refresh from chain
   previews, badges)
```

### 6.4 Wagmi/viem Integration Pattern

All reads are pure on-chain — no backend API, no subgraph. The pattern used throughout:

```typescript
// READ — useReadContract (wagmi v2)
const { data: healthFactor } = useReadContract({
  address: COLLATERAL_VAULT,
  abi: CollateralVaultABI,
  functionName: 'getHealthFactor',
  args: [userAddress],
  query: { refetchInterval: 15_000 },
});

// WRITE — useWriteContract (wagmi v2)
const { writeContractAsync } = useWriteContract();
await writeContractAsync({
  address: LENDING_POOL,
  abi: LendingPoolABI,
  functionName: 'borrow',
  args: [parseUnits(amount, 18)],
});

// EVENT SCAN — viem getLogs
const logs = await publicClient.getLogs({
  address: SOLVENCY_GATEWAY,
  event: parseAbiItem('event SolvencyProven(uint256,uint256,uint256,bytes32)'),
  fromBlock: 'earliest',
});
```

---

## 7. Deployment Topology

### 7.1 Infrastructure Diagram

```
╔══════════════════════════════════════════════════════════════════════════════════════╗
║                           DOTLEND DEPLOYMENT TOPOLOGY                                ║
╚══════════════════════════════════════════════════════════════════════════════════════╝

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │                          VERCEL  (frontend/)                                  │
  │                          nexucore.xyz                                         │
  │                                                                               │
  │  Build: next build                                                            │
  │  Deploy: git push → Vercel auto-deploy from frontend/ subdirectory            │
  │  Env vars: NEXT_PUBLIC_CHAIN_ID, contract addresses                           │
  └───────────────────────────────────┬─────────────────────────────────────────┘
                                      │ JSON-RPC via wagmi
                                      │
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │         Polkadot Hub TestNet  (Chain ID 420420417)                            │
  │         RPC: https://eth-rpc-testnet.polkadot.io                   │
  │         Explorer: https://blockscout-testnet.polkadot.io                     │
  │                                                                               │
  │  PriceOracle          0x1282F6B59869a57Fd2a1D7a5BC8535bB7B15D173            │
  │  MockvDOT             0xfc1ACa9EDF5DA2eBEA5CE1320fb40A74Ac996544            │
  │  MockUSDH           0x7d605b39a8EeF1aCA3D63bD7A32E2719abA87683            │
  │  CollateralVault      0xF94eBe7F8d8F922B7FBBFb4BE080EB71a69415A2            │
  │  LendingPool          0x34B22768B16262aD5b7fC23DD797D80791e4e7e6            │
  │  MockSolvencyVerifier 0xED2676C995BAA392093Ac0b907EA216c2B8C52cc            │
  │  SolvencyGateway      0x199E3E7c1f1382bc389b495B927B0535B390Acd0            │
  └─────────────┬───────────────────────────────────────────────────────────────┘
                │ submitPrice (EOA tx, 5 min)     │ publishSolvencyProof (30 min)
                │                                 │
  ┌─────────────┴──────────────┐   ┌──────────────┴──────────────────────────────┐
  │  oracle.py                  │   │  Railway Cron Job                            │
  │  Local Python process       │   │  railway.json: { "cron": "0 */6 * * *" }    │
  │  30-min interval            │   │  generate-solvency-proof.js                  │
  │  DeFiLlama → submitPrice    │   │  Node.js + @noir-lang/noir_js               │
  └─────────────────────────────┘   └─────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  Compiler: resolc via @parity/hardhat-polkadot                               │
  │  Test/Deploy: Hardhat (hardhat.config.js)                                    │
  │  ZK Circuit: Noir 1.0.0-beta.19 in circuits/solvency/                        │
  └─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Security Model

### 8.1 Access Control Matrix

```
┌─────────────────────────┬──────────────┬──────────────────┬────────────────────────┐
│ Function                │ Caller       │ Modifier         │ Risk if Bypassed        │
├─────────────────────────┼──────────────┼──────────────────┼────────────────────────┤
│ PriceOracle.submitPrice │ Oracle EOA   │ authorizedOracle │ Price manipulation      │
│ PriceOracle.setOracle   │ Owner        │ onlyOwner        │ Oracle rotation abuse   │
│ CollateralVault.setDebt │ LendingPool  │ onlyLendingPool  │ Debt forgery            │
│ CollateralVault.seize   │ LendingPool  │ onlyLendingPool  │ Collateral theft        │
│ MockUSDH.mint         │ LendingPool  │ onlyMinter       │ Infinite USDH mint    │
│ MockUSDH.burn         │ LendingPool  │ internal burn    │ Debt erasure            │
│ LendingPool.borrow      │ Any user     │ nonReentrant     │ Reentrancy → extra debt │
│ LendingPool.repay       │ Any user     │ nonReentrant     │ Reentrancy → debt clear │
│ LendingPool.liquidate   │ Any user     │ nonReentrant     │ Reentrancy → drain      │
│ SolvencyGateway.setVerif│ Owner        │ onlyOwner        │ Verifier swap post-deploy│
│ SolvencyGateway.publish │ Anyone       │ none (public)    │ Proof spam (no value)   │
└─────────────────────────┴──────────────┴──────────────────┴────────────────────────┘
```

### 8.2 Reentrancy Protection

`LendingPool` inherits `ReentrancyGuard` from OpenZeppelin v4. All state-modifying externally-callable functions (`borrow`, `repay`, `liquidate`) carry the `nonReentrant` modifier. The check-effect-interaction pattern is also enforced: debt is updated in `CollateralVault` before any token transfers are initiated.

```
Correct order in borrow():
  1. Check: newDebt ≤ collateralValue * LTV / 100        ← check
  2. vault.setDebt(user, newDebt)                        ← effect
  3. usdh.mint(user, usdhAmount)                     ← interaction
```

### 8.3 Oracle Manipulation Resistance

| Threat | Mitigation |
|---|---|
| Stale price used for liquidation | `getLatestPrice` reverts if `block.timestamp - lastUpdated > 3600` |
| Oracle EOA compromise | Owner can `setAuthorizedOracle` to rotate; private key stored offline |
| Flash-loan price spike | Testnet: single EOA oracle (acceptable). Mainnet: Hyperbridge ISMP TWAP from Hydration |
| No price submitted at all | `getLatestPrice` reverts → `borrow` and `liquidate` revert → protocol pauses naturally |

The stale guard is the primary defense on testnet. On mainnet, the Hyperbridge ISMP path sources price from Hydration's Omnipool TWAP, which requires sustained capital to manipulate and is cryptographically verified by the ISMP relay.

### 8.4 Liquidation Mechanics Safety

**Undercollateralized positions:**
Health factor is computed as:
```
HF = (collateralValue * LIQUIDATION_THRESHOLD) / (debt * 100)
```
A position is liquidatable when `HF < 1.0`, i.e., when debt exceeds 80% of collateral value (at oracle price). The borrow cap is 70% LTV, providing a 10-percentage-point buffer before liquidation.

**Liquidation bonus:**
Liquidators receive 5% bonus collateral. This incentivizes prompt liquidation before bad debt can accrue. The 10% buffer between LTV (70%) and liquidation threshold (80%) ensures the bonus is fully covered in normal price movements.

**Bad debt scenario:**
If price crashes faster than liquidators can act (e.g., instant 20%+ drop), the collateral may not cover the full bonus. In v1, this results in a loss to the liquidator rather than the protocol — the liquidator must choose whether to liquidate at a potential loss. Full debt is still wiped, and the protocol is restored to a solvent state.

**Full liquidation only:**
v1 does not support partial liquidations. This simplifies the state machine and eliminates edge cases around partial seize logic, at the cost of requiring liquidators to hold the full debt amount.

### 8.5 Interest Accrual Safety

Interest accrual is lazy (computed at interaction time, not continuously). This prevents unbounded loops and eliminates the need for keeper infrastructure to maintain accrual state. The stability fee is 0.5%/year (5 bps), low enough that stale accrual for even weeks does not create meaningful divergence from continuous models.

---

## 9. PolkaVM Compatibility Notes

PolkaVM is Polkadot's RISC-V-based virtual machine with an EVM compatibility layer. It does not support all EVM opcodes. DotLend was designed from the ground up for PolkaVM compatibility.

### 9.1 Forbidden Opcodes — What We Avoided

| Opcode / Pattern | Why Forbidden | How We Avoided It |
|---|---|---|
| `SELFDESTRUCT` | Not implemented in PolkaVM | No `selfdestruct()` anywhere |
| `CREATE2` | Factory patterns unsafe | No factory, all contracts deployed directly |
| `EXTCODECOPY` | Not implemented | No low-level code inspection |
| `assembly {}` | Inline assembly not safe | Pure Solidity, no assembly blocks |
| `block.prevrandao` / `block.difficulty` | Unavailable | Not used; block.timestamp is safe |
| OpenZeppelin v5.x | Contains forbidden patterns | Pinned to OZ v4.x throughout |
| Floating point / ABDKMath | No FP support in PolkaVM EVM | All math in 1e18 integer basis |
| Proxy patterns / `delegatecall` | Unsafe initcode size interactions | No proxies; direct deployments |

### 9.2 The 100KB Initcode Limit

PolkaVM enforces a 100KB initcode limit per contract deployment. The original design had `SolvencyGateway` logic inside `LendingPool`. This caused `LendingPool` to exceed the limit.

**Solution:** Extract `SolvencyGateway` as a standalone contract. `LendingPool` holds core lending logic only. `SolvencyGateway` holds the ZK proof submission logic. Both contracts are independently deployable within the 100KB limit.

### 9.3 UltraHonk Verifier Limitation

The Noir-generated `UltraHonk` verifier contract uses `assembly {}` blocks for BN254 elliptic curve pairings. This is required for the pairing check at the core of the PLONK-family proof system. These assembly blocks are not deployable on PolkaVM.

**Testnet mitigation:** `MockSolvencyVerifier` replaces the real verifier. It accepts any proof bytes and returns `true`. The ZK proof is still generated off-chain (Railway cron), the circuit is real, and the on-chain event is emitted — but the cryptographic verification step is mocked.

**Mainnet path:** Two options under investigation:
1. Wait for PolkaVM native BN254 precompile support (Polkadot roadmap item).
2. Deploy real UltraHonk verifier on an EVM chain (e.g., Arbitrum), use Hyperbridge ISMP to relay the verification result to Polkadot Hub.

### 9.4 Safe Patterns Used

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     PolkaVM-Safe Patterns in DotLend                          │
├──────────────────────────────────────────────────────────────────────────────┤
│  All math: 1e18 fixed-point integer arithmetic                                │
│  Interest: block.timestamp delta (safe on PolkaVM)                           │
│  Access control: Ownable + custom modifiers (no assembly)                    │
│  Token: OpenZeppelin v4 ERC20 (no assembly in v4 core)                       │
│  Reentrancy: OZ v4 ReentrancyGuard (no assembly)                             │
│  State: Pure mappings + uint256 — no packed structs with assembly load       │
│  Events: Standard Solidity event emit syntax                                  │
│  Calls: High-level Solidity .transfer() and .call() via OZ SafeERC20        │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Appendix: Contract Addresses (Polkadot Hub TestNet)

| Contract | Address |
|---|---|
| PriceOracle | `0x1282F6B59869a57Fd2a1D7a5BC8535bB7B15D173` |
| MockvDOT | `0xfc1ACa9EDF5DA2eBEA5CE1320fb40A74Ac996544` |
| MockUSDH | `0x7d605b39a8EeF1aCA3D63bD7A32E2719abA87683` |
| CollateralVault (vDOT) | `0xF94eBe7F8d8F922B7FBBFb4BE080EB71a69415A2` |
| LendingPool (vDOT) | `0x34B22768B16262aD5b7fC23DD797D80791e4e7e6` |
| TreasuryRouter (vDOT) | `0x1adEe37eefd054927b14503Ff2076aE12Db76B30` |
| MockSolvencyVerifier | `0xED2676C995BAA392093Ac0b907EA216c2B8C52cc` |
| SolvencyGateway | `0x199E3E7c1f1382bc389b495B927B0535B390Acd0` |

### Market-Specific Addresses (WPAS)

| Contract | Address |
|---|---|
| WPAS (Collateral) | `0xc09348291775B55Da40433ba44240c262D87Eb90` |
| CollateralVault (WPAS) | `0x575B8578F000fC554394C63cec8F07Abd0C66C34` |
| LendingPool (WPAS) | `0xF68bDd12a8904fd6bB0CbED5623722517FDd3408` |
| TreasuryRouter (WPAS) | `0xcC2Ca486257eED1201FCdc247F9a3120D0E8Be7a` |

**Network:** Polkadot Hub TestNet (Chain ID 420420417)
**Chain ID:** 420420417
**RPC:** `https://eth-rpc-testnet.polkadot.io`
**Explorer:** `https://blockscout-testnet.polkadot.io`
**Compiler:** `resolc` via `@parity/hardhat-polkadot`

---

*DotLend — Orthonode | Arhant Barmate (Founder & Lead Engineer) <infrastructure@orthonode.xyz>*
