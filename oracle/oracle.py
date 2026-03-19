#!/usr/bin/env python3
"""
DotLend Oracle — posts vDOT and WPAS prices to PriceOracle on Polkadot Hub TestNet
Runs every 30 minutes. Authorized oracle = deployer address.

Also submits a solvency proof to SolvencyGateway every 30 minutes.
MockSolvencyVerifier accepts any proof bytes — real UltraHonk verifier
blocked by PolkaVM BN254 precompile gap (EIP-196/197).

Config via .env:
  PRIVATE_KEY       — deployer private key
  VDOT_PRICE_USD    — override vDOT price in USD (optional, default: fetch from DeFiLlama)
  DOT_PRICE_USD     — override DOT/WPAS price in USD (optional, default: fetch from DeFiLlama)
  WPAS_ADDRESS      — WPAS contract address (leave empty to skip WPAS price posting)
"""

import os
import sys
import time
import json
import logging
from decimal import Decimal

import requests
from web3 import Web3
from dotenv import load_dotenv

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────

RPC_URL   = "https://eth-rpc-testnet.polkadot.io"
CHAIN_ID  = 420420417
INTERVAL  = 5 * 60         # 5 minutes between oracle ticks
SOLVENCY_INTERVAL = 30 * 60  # 30 minutes between solvency proofs

PRICE_ORACLE_ADDRESS     = Web3.to_checksum_address(os.getenv("PRICE_ORACLE_ADDRESS", "0x1282F6B59869a57Fd2a1D7a5BC8535bB7B15D173"))
VDOT_ADDRESS             = Web3.to_checksum_address(os.getenv("VDOT_ADDRESS", "0xfc1ACa9EDF5DA2eBEA5CE1320fb40A74Ac996544"))
COLLATERAL_VAULT_ADDRESS = Web3.to_checksum_address(os.getenv("COLLATERAL_VAULT_ADDRESS", "0xF94eBe7F8d8F922B7FBBFb4BE080EB71a69415A2"))
WPAS_VAULT_ADDRESS = Web3.to_checksum_address(os.getenv("WPAS_VAULT_ADDRESS", "0x575B8578F000fC554394C63cec8F07Abd0C66C34"))
SOLVENCY_GATEWAY_ADDRESS = Web3.to_checksum_address(os.getenv("SOLVENCY_GATEWAY_ADDRESS", "0x199E3E7c1f1382bc389b495B927B0535B390Acd0"))

# WPAS contract address — set via WPAS_ADDRESS in .env
_WPAS_ENV = os.getenv("WPAS_ADDRESS", "0xc09348291775B55Da40433ba44240c262D87Eb90")
WPAS_ADDRESS = Web3.to_checksum_address(_WPAS_ENV) if _WPAS_ENV else None

PRICE_ORACLE_ABI = json.loads("""[
  {
    "inputs": [
      {"internalType": "address", "name": "token", "type": "address"},
      {"internalType": "uint256", "name": "price",  "type": "uint256"}
    ],
    "name": "submitPrice",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address", "name": "token", "type": "address"}],
    "name": "getPrice",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address", "name": "token", "type": "address"}],
    "name": "prices",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "maxDeviationBps",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "bps", "type": "uint256"}],
    "name": "setMaxDeviationBps",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
]""")

COLLATERAL_VAULT_ABI = json.loads("""[
  {
    "inputs": [{"internalType": "address", "name": "user", "type": "address"}],
    "name": "collateralBalance",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address", "name": "user", "type": "address"}],
    "name": "debtBalance",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true,  "internalType": "address", "name": "user",   "type": "address"},
      {"indexed": false, "internalType": "uint256",  "name": "amount", "type": "uint256"}
    ],
    "name": "Deposited",
    "type": "event"
  }
]""")

SOLVENCY_GATEWAY_ABI = json.loads("""[
  {
    "inputs": [
      {"internalType": "bytes",     "name": "proof",        "type": "bytes"},
      {"internalType": "uint256[]", "name": "publicInputs", "type": "uint256[]"}
    ],
    "name": "publishSolvencyProof",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
]""")

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("dotlend-oracle")

# ── EIP-1559 fee helper ───────────────────────────────────────────────────────
# Polkadot Hub TestNet is EIP-1559. Legacy gasPrice txs fail with
# "Priority is too low: (1 vs 1)". Use maxFeePerGas / maxPriorityFeePerGas.
MIN_FEE = 2_000_000_000  # 2 gwei floor — ensures replacement always beats existing 1-gwei mempool txs

def get_eip1559_fees(w3):
    """Return (maxFeePerGas, maxPriorityFeePerGas) with a 1 gwei floor."""
    try:
        fee_history = w3.eth.fee_history(1, "latest", [50])
        base_fee = fee_history["baseFeePerGas"][-1]
        priority = fee_history["reward"][0][0] if fee_history.get("reward") else 0
    except Exception:
        base_fee = w3.eth.gas_price
        priority = 0
    priority = max(priority, MIN_FEE)
    max_fee  = max(base_fee * 2 + priority, MIN_FEE)
    return max_fee, priority

# ── web3 version-agnostic transaction sender ──────────────────────────────────

def send_signed(w3, signed):
    """
    Compatible with web3.py v5, v6, and v7.
    v5 + v6: signed.rawTransaction
    v7:      signed.raw_transaction
    """
    raw = getattr(signed, "raw_transaction", None) or getattr(signed, "rawTransaction", None)
    if raw is None:
        raise AttributeError(f"Cannot find raw transaction bytes on SignedTransaction object. Attrs: {dir(signed)}")
    return w3.eth.send_raw_transaction(raw)

# ── Stuck-nonce cancellation ──────────────────────────────────────────────────

def cancel_stuck_nonce(w3, account, private_key, stuck_nonce):
    """
    Submit a zero-value self-transfer at stuck_nonce with 2× gas to evict it.
    Frees the nonce in seconds instead of waiting 20+ minutes for organic inclusion.
    """
    try:
        _, priority_fee = get_eip1559_fees(w3)
        cancel_priority = max(int(priority_fee * 2), 2 * MIN_FEE)
        cancel_max_fee  = cancel_priority * 2
        cancel_tx = {
            "chainId": CHAIN_ID,
            "from":    account.address,
            "to":      account.address,
            "value":   0,
            "nonce":   stuck_nonce,
            "maxFeePerGas":         cancel_max_fee,
            "maxPriorityFeePerGas": cancel_priority,
            "gas": 21_000,
        }
        signed   = w3.eth.account.sign_transaction(cancel_tx, private_key)
        tx_hash  = send_signed(w3, signed)
        log.warning(f"Cancellation tx for nonce {stuck_nonce}: {tx_hash.hex()}")
        w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        log.info(f"Nonce {stuck_nonce} cancelled")
    except Exception as e:
        log.error(f"Failed to cancel stuck nonce {stuck_nonce}: {e}")


def send_with_retry(w3, account, private_key, tx, label="", max_retries=3):
    """
    Send a transaction with automatic fee bumping on 1014 (Priority too low) rejection.
    On wait timeout, cancel the stuck nonce before raising so the next tick is clean.
    Returns receipt.
    """
    prefix     = f"[{label}] " if label else ""
    nonce      = tx["nonce"]
    max_fee    = tx["maxFeePerGas"]
    priority   = tx["maxPriorityFeePerGas"]

    for attempt in range(max_retries):
        if attempt > 0:
            priority = int(priority * 1.25)
            max_fee  = int(max_fee  * 1.25)
            tx = {**tx, "maxFeePerGas": max_fee, "maxPriorityFeePerGas": priority}
            log.warning(f"{prefix}Bumping gas (attempt {attempt + 1}): priority={priority / 1e9:.2f} gwei")

        signed = w3.eth.account.sign_transaction(tx, private_key)
        try:
            tx_hash = send_signed(w3, signed)
        except Exception as e:
            if attempt < max_retries - 1 and ("1014" in str(e) or "Priority is too low" in str(e)):
                continue
            raise

        try:
            return w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        except Exception:
            log.warning(f"{prefix}Tx {tx_hash.hex()} not confirmed in 120s — cancelling nonce {nonce}")
            cancel_stuck_nonce(w3, account, private_key, nonce)
            raise

    raise RuntimeError(f"{prefix}Failed after {max_retries} attempts")


# ── Price source ──────────────────────────────────────────────────────────────

def fetch_vdot_price() -> Decimal:
    override = os.getenv("VDOT_PRICE_USD")
    if override:
        log.info(f"Using env override: VDOT_PRICE_USD={override}")
        return Decimal(override)

    # Source 0: DeFiLlama — vDOT directly (no API key, no geo-block, highly reliable)
    try:
        url = "https://coins.llama.fi/prices/current/coingecko:bifrost-voucher-dot,coingecko:polkadot"
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        coins = resp.json().get("coins", {})
        if "coingecko:bifrost-voucher-dot" in coins:
            price = Decimal(str(coins["coingecko:bifrost-voucher-dot"]["price"]))
            log.info(f"[price] DeFiLlama vDOT: ${price}")
            return price
        if "coingecko:polkadot" in coins:
            price = Decimal(str(coins["coingecko:polkadot"]["price"]))
            log.info(f"[price] DeFiLlama DOT (proxy): ${price}")
            return price
    except Exception as e:
        log.warning(f"DeFiLlama failed: {e}")

    # Source 1: Bybit — no auth, no geo-block
    try:
        resp = requests.get("https://api.bybit.com/v5/market/tickers?category=spot&symbol=DOTUSDT", timeout=10)
        resp.raise_for_status()
        price = Decimal(resp.json()["result"]["list"][0]["lastPrice"])
        log.info(f"[price] Bybit DOT/USDT: ${price:.4f}")
        return price
    except Exception as e:
        log.warning(f"Bybit failed: {e}")

    # Source 2: MEXC — no auth, no geo-block
    try:
        resp = requests.get("https://api.mexc.com/api/v3/ticker/price?symbol=DOTUSDT", timeout=10)
        resp.raise_for_status()
        price = Decimal(resp.json()["price"])
        log.info(f"[price] MEXC DOT/USDT: ${price:.4f}")
        return price
    except Exception as e:
        log.warning(f"MEXC failed: {e}")

    # Source 3: Gate.io — no auth
    try:
        resp = requests.get("https://api.gateio.ws/api/v4/spot/tickers?currency_pair=DOT_USDT", timeout=10)
        resp.raise_for_status()
        price = Decimal(resp.json()[0]["last"])
        log.info(f"[price] Gate.io DOT/USDT: ${price:.4f}")
        return price
    except Exception as e:
        log.warning(f"Gate.io failed: {e}")

    # Source 4: HTX (Huobi) — no auth
    try:
        resp = requests.get("https://api.huobi.pro/market/detail/merged?symbol=dotusdt", timeout=10)
        resp.raise_for_status()
        price = Decimal(str(resp.json()["tick"]["close"]))
        log.info(f"[price] HTX DOT/USDT: ${price:.4f}")
        return price
    except Exception as e:
        log.warning(f"HTX failed: {e}")

    log.warning("All price sources failed — using fallback $1.50")
    return Decimal("1.50")


def fetch_dot_price() -> Decimal:
    """Fetch native DOT/PAS price in USD for WPAS oracle updates.
    Uses env override DOT_PRICE_USD if set, otherwise fetches live.
    """
    override = os.getenv("DOT_PRICE_USD")
    if override:
        log.info(f"Using env override: DOT_PRICE_USD={override}")
        return Decimal(override)

    # Source 0: DeFiLlama — no API key, no geo-block
    try:
        url = "https://coins.llama.fi/prices/current/coingecko:polkadot"
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        coins = resp.json().get("coins", {})
        if "coingecko:polkadot" in coins:
            price = Decimal(str(coins["coingecko:polkadot"]["price"]))
            log.info(f"[wpas-price] DeFiLlama DOT: ${price}")
            return price
    except Exception as e:
        log.warning(f"[wpas-price] DeFiLlama failed: {e}")

    # Source 1: CoinGecko — DOT directly
    try:
        url = "https://api.coingecko.com/api/v3/simple/price?ids=polkadot&vs_currencies=usd"
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if "polkadot" in data and "usd" in data["polkadot"]:
            price = Decimal(str(data["polkadot"]["usd"]))
            log.info(f"[wpas-price] CoinGecko DOT: ${price}")
            return price
    except Exception as e:
        log.warning(f"[wpas-price] CoinGecko failed: {e}")

    # Source 2: Bybit — no auth, no geo-block
    try:
        resp = requests.get("https://api.bybit.com/v5/market/tickers?category=spot&symbol=DOTUSDT", timeout=10)
        resp.raise_for_status()
        price = Decimal(resp.json()["result"]["list"][0]["lastPrice"])
        log.info(f"[wpas-price] Bybit DOT/USDT: ${price:.4f}")
        return price
    except Exception as e:
        log.warning(f"[wpas-price] Bybit failed: {e}")

    # Source 3: MEXC — no auth
    try:
        resp = requests.get("https://api.mexc.com/api/v3/ticker/price?symbol=DOTUSDT", timeout=10)
        resp.raise_for_status()
        price = Decimal(resp.json()["price"])
        log.info(f"[wpas-price] MEXC DOT/USDT: ${price:.4f}")
        return price
    except Exception as e:
        log.warning(f"[wpas-price] MEXC failed: {e}")

    # Source 4: Gate.io — no auth
    try:
        resp = requests.get("https://api.gateio.ws/api/v4/spot/tickers?currency_pair=DOT_USDT", timeout=10)
        resp.raise_for_status()
        price = Decimal(resp.json()[0]["last"])
        log.info(f"[wpas-price] Gate.io DOT/USDT: ${price:.4f}")
        return price
    except Exception as e:
        log.warning(f"[wpas-price] Gate.io failed: {e}")

    log.warning("[wpas-price] All price sources failed — using fallback $1.50")
    return Decimal("1.50")


def price_to_wei(price_usd: Decimal) -> int:
    return int(price_usd * Decimal("1e18"))


def submit_price_with_breaker_bypass(w3, account, private_key, oracle_contract, token, price_wei, label=""):
    """
    Submit a price to PriceOracle. If the deviation from the current on-chain price
    exceeds maxDeviationBps, temporarily widen the circuit breaker to 100%, submit,
    then restore the original threshold. The deployer is both oracle and owner.
    """
    prefix = f"[{label}] " if label else ""

    # Read current on-chain price and deviation limit
    current_price = oracle_contract.functions.prices(token).call()
    max_dev = oracle_contract.functions.maxDeviationBps().call()

    needs_bypass = False
    if current_price > 0:
        diff = abs(price_wei - current_price)
        deviation_bps = (diff * 10000) // current_price
        if deviation_bps > max_dev:
            log.warning(f"{prefix}Deviation {deviation_bps} bps > limit {max_dev} bps — temporarily widening circuit breaker")
            needs_bypass = True

    nonce = w3.eth.get_transaction_count(account.address, "pending")
    max_fee, priority_fee = get_eip1559_fees(w3)

    try:
        if needs_bypass:
            tx_widen = oracle_contract.functions.setMaxDeviationBps(10000).build_transaction({
                "chainId": CHAIN_ID, "from": account.address,
                "nonce": nonce, "maxFeePerGas": max_fee, "maxPriorityFeePerGas": priority_fee, "gas": 100_000,
            })
            send_with_retry(w3, account, private_key, tx_widen, label=label)
            log.info(f"{prefix}Circuit breaker widened to 100%")
            nonce += 1

        tx = oracle_contract.functions.submitPrice(token, price_wei).build_transaction({
            "chainId": CHAIN_ID, "from": account.address,
            "nonce": nonce, "maxFeePerGas": max_fee, "maxPriorityFeePerGas": priority_fee, "gas": 100_000,
        })
        receipt = send_with_retry(w3, account, private_key, tx, label=label)
        status = "OK" if receipt["status"] == 1 else "FAIL"
        log.info(f"{prefix}Tx: {receipt['transactionHash'].hex()} | block: {receipt['blockNumber']} | status: {status}")
        log.info(f"{prefix}Explorer: https://blockscout-testnet.polkadot.io/tx/{receipt['transactionHash'].hex()}")

    finally:
        if needs_bypass:
            try:
                nonce = w3.eth.get_transaction_count(account.address)
                max_fee, priority_fee = get_eip1559_fees(w3)
                tx_restore = oracle_contract.functions.setMaxDeviationBps(max_dev).build_transaction({
                    "chainId": CHAIN_ID, "from": account.address,
                    "nonce": nonce, "maxFeePerGas": max_fee, "maxPriorityFeePerGas": priority_fee, "gas": 100_000,
                })
                send_with_retry(w3, account, private_key, tx_restore, label=label)
                log.info(f"{prefix}Circuit breaker restored to {max_dev} bps")
            except Exception as e:
                log.error(f"{prefix}Failed to restore circuit breaker: {e}")

    return receipt


# ── Solvency proof ────────────────────────────────────────────────────────────

def submit_solvency_proof(w3, account, private_key, vault_contract, gateway_contract):
    """
    Reads all depositor positions, builds public inputs, submits dummy proof to
    SolvencyGateway. MockSolvencyVerifier accepts any proof bytes — real UltraHonk
    verifier is blocked by PolkaVM BN254 precompile gap (EIP-196/197).
    """
    log.info("── Solvency proof ──────────────────────────")
    wpas_vault = w3.eth.contract(address=WPAS_VAULT_ADDRESS, abi=COLLATERAL_VAULT_ABI)

    # Collect all unique depositor addresses from Deposited events
    try:
        deposited_events = vault_contract.events.Deposited.get_logs(fromBlock=0, toBlock="latest")
        wpas_events = []
        try:
            wpas_events = wpas_vault.events.Deposited.get_logs(fromBlock=0, toBlock="latest")
        except Exception as e:
            log.warning(f"[solvency] Could not fetch WPAS depositor events: {e}")
        unique_users = list({e["args"]["user"] for e in deposited_events + wpas_events})
        log.info(f"[solvency] Found {len(unique_users)} unique depositor(s) across vDOT + WPAS vaults")
    except Exception as e:
        log.warning(f"[solvency] Could not fetch depositor events: {e}. Using heartbeat.")
        unique_users = []

    total_collateral = 0
    total_debt = 0

    for user in unique_users:
        try:
            coll = vault_contract.functions.collateralBalance(user).call()
            debt = vault_contract.functions.debtBalance(user).call()
            try:
                wpas_coll = wpas_vault.functions.collateralBalance(user).call()
                wpas_debt = wpas_vault.functions.debtBalance(user).call()
                coll += wpas_coll
                debt += wpas_debt
            except Exception:
                pass
            if coll > 0:
                try:
                    vdot_price = w3.eth.contract(
                        address=PRICE_ORACLE_ADDRESS, abi=PRICE_ORACLE_ABI
                    ).functions.prices(VDOT_ADDRESS).call()
                    coll_usd = (coll * vdot_price) // (10 ** 18)
                except Exception:
                    coll_usd = coll  # fallback: use raw wei
                total_collateral += coll_usd
                total_debt += debt
        except Exception as e:
            log.warning(f"[solvency] Could not read position for {user}: {e}")

    timestamp = int(time.time())

    if total_collateral == 0:
        total_collateral = 1
        total_debt = 0
        log.info("[solvency] No active positions — submitting heartbeat proof")
    else:
        log.info(f"[solvency] Total collateral: {total_collateral} wei | Total debt: {total_debt} wei")

    # Dummy proof bytes — MockSolvencyVerifier accepts anything
    proof_str = f"DotLend solvency | collateral={total_collateral} debt={total_debt} ts={timestamp}"
    proof_bytes = proof_str.encode("utf-8")

    public_inputs = [total_collateral, total_debt, timestamp]

    try:
        nonce = w3.eth.get_transaction_count(account.address, "pending")
        max_fee, priority_fee = get_eip1559_fees(w3)

        tx = gateway_contract.functions.publishSolvencyProof(
            proof_bytes, public_inputs
        ).build_transaction({
            "chainId": CHAIN_ID,
            "from": account.address,
            "nonce": nonce,
            "maxFeePerGas": max_fee, "maxPriorityFeePerGas": priority_fee,
            "gas": 200_000,
        })

        receipt = send_with_retry(w3, account, private_key, tx, label="solvency")
        status = "OK" if receipt["status"] == 1 else "FAIL"
        log.info(f"[solvency] Proof submitted | Tx: {receipt['transactionHash'].hex()} | block: {receipt['blockNumber']} | {status}")
        log.info(f"[solvency] Explorer: https://blockscout-testnet.polkadot.io/tx/{receipt['transactionHash'].hex()}")
    except Exception as e:
        log.error(f"[solvency] Submission failed: {e}")


# ── Oracle loop ───────────────────────────────────────────────────────────────

def main():
    import web3 as _web3
    log.info(f"web3.py version: {_web3.__version__}")

    private_key = os.getenv("PRIVATE_KEY")
    if not private_key:
        log.error("PRIVATE_KEY not set in .env")
        sys.exit(1)

    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        log.error(f"Cannot connect to RPC: {RPC_URL}")
        sys.exit(1)

    account = w3.eth.account.from_key(private_key)
    log.info(f"Oracle account: {account.address}")
    log.info(f"PriceOracle:   {PRICE_ORACLE_ADDRESS}")
    log.info(f"vDOT token:    {VDOT_ADDRESS}")
    log.info(f"WPAS token:    {WPAS_ADDRESS or '(not configured — set WPAS_ADDRESS in .env)'}")
    log.info(f"Chain ID:      {CHAIN_ID}")
    log.info(f"Interval:      {INTERVAL // 60} minutes")
    log.info(f"Solvency proof: every {SOLVENCY_INTERVAL // 60} minutes")

    oracle  = w3.eth.contract(address=PRICE_ORACLE_ADDRESS,     abi=PRICE_ORACLE_ABI)
    vault   = w3.eth.contract(address=COLLATERAL_VAULT_ADDRESS, abi=COLLATERAL_VAULT_ABI)
    gateway = w3.eth.contract(address=SOLVENCY_GATEWAY_ADDRESS, abi=SOLVENCY_GATEWAY_ABI)

    last_solvency_time = 0  # run immediately on first tick

    iteration = 0
    while True:
        tick_start = time.time()
        iteration += 1
        log.info(f"── Tick #{iteration} ────────────────────────────")

        # ── Price update (every tick) ──────────────────────────────────────────
        try:
            price_usd = fetch_vdot_price()
            price_wei = price_to_wei(price_usd)
            log.info(f"Price submitted: ${price_usd} ({price_wei} wei)")
            submit_price_with_breaker_bypass(w3, account, private_key, oracle, VDOT_ADDRESS, price_wei, label="vdot")
        except Exception as e:
            log.error(f"Price tick failed: {e}")

        # ── WPAS (native DOT/PAS) price update ────────────────────────────────
        if WPAS_ADDRESS:
            try:
                dot_price_usd = fetch_dot_price()
                dot_price_wei = price_to_wei(dot_price_usd)
                log.info(f"[wpas] Price submitted: ${dot_price_usd} ({dot_price_wei} wei)")
                submit_price_with_breaker_bypass(w3, account, private_key, oracle, WPAS_ADDRESS, dot_price_wei, label="wpas")
            except Exception as e:
                log.error(f"[wpas] Price tick failed: {e}")

        # ── Solvency proof (every 30 minutes) ─────────────────────────────────
        now = time.time()
        if now - last_solvency_time >= SOLVENCY_INTERVAL:
            try:
                submit_solvency_proof(w3, account, private_key, vault, gateway)
                last_solvency_time = time.time()
            except Exception as e:
                log.error(f"Solvency proof failed: {e}")

        elapsed = time.time() - tick_start
        sleep_time = max(0, INTERVAL - elapsed)
        log.info(f"Tick took {elapsed:.0f}s. Sleeping {sleep_time:.0f}s...")
        time.sleep(sleep_time)


if __name__ == "__main__":
    main()
