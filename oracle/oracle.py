#!/usr/bin/env python3
"""
DotLend Oracle — posts vDOT and WPAS prices to PriceOracle on Polkadot Hub TestNet
Runs every 30 minutes. Authorized oracle = deployer address.

Also submits a solvency proof to SolvencyGateway every 30 minutes.
MockSolvencyVerifier accepts any proof bytes — real UltraHonk verifier
blocked by PolkaVM BN254 precompile gap (EIP-196/197).

Config via .env:
  PRIVATE_KEY       — deployer private key
  VDOT_PRICE_USD    — override vDOT price in USD (optional, default: fetch from CoinGecko)
  DOT_PRICE_USD     — override DOT/WPAS price in USD (optional, default: fetch from CoinGecko)
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
INTERVAL  = 30 * 60        # 30 minutes between oracle ticks
SOLVENCY_INTERVAL = 30 * 60  # 30 minutes between solvency proofs

PRICE_ORACLE_ADDRESS     = Web3.to_checksum_address("0xc12D24cD6DF4521C9A453a325751bB1f38326a91")
VDOT_ADDRESS             = Web3.to_checksum_address("0xa21443dfC33d44a4BaE8aA6fA6cA2A2d90F7F22F")
COLLATERAL_VAULT_ADDRESS = Web3.to_checksum_address("0x57c1d7f0a596FD53923d7AB6c6F2ed0ea73d51A8")
SOLVENCY_GATEWAY_ADDRESS = Web3.to_checksum_address("0x3e7D948769818C71075E38bbAA6198908Ba6CFAa")

# WPAS contract address — set via WPAS_ADDRESS in .env after running deploy-wpas.js
# Leave empty string to disable WPAS price posting until deployed.
_WPAS_ENV = os.getenv("WPAS_ADDRESS", "")
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

# ── Price source ──────────────────────────────────────────────────────────────

def fetch_vdot_price() -> Decimal:
    override = os.getenv("VDOT_PRICE_USD")
    if override:
        log.info(f"Using env override: VDOT_PRICE_USD={override}")
        return Decimal(override)

    # Source 1: CoinGecko — vDOT directly, then DOT as proxy
    try:
        url = "https://api.coingecko.com/api/v3/simple/price?ids=bifrost-voucher-dot,polkadot&vs_currencies=usd"
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if "bifrost-voucher-dot" in data and "usd" in data["bifrost-voucher-dot"]:
            price = Decimal(str(data["bifrost-voucher-dot"]["usd"]))
            log.info(f"[price] CoinGecko vDOT: ${price}")
            return price
        if "polkadot" in data and "usd" in data["polkadot"]:
            price = Decimal(str(data["polkadot"]["usd"]))
            log.info(f"[price] CoinGecko DOT (proxy): ${price}")
            return price
    except Exception as e:
        log.warning(f"CoinGecko failed: {e}")

    # Source 2: KuCoin — DOT/USDT (no geo-block, no API key)
    try:
        resp = requests.get("https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=DOT-USDT", timeout=10)
        resp.raise_for_status()
        price = Decimal(resp.json()["data"]["price"])
        log.info(f"[price] KuCoin DOT/USDT (proxy): ${price:.4f}")
        return price
    except Exception as e:
        log.warning(f"KuCoin failed: {e}")

    # Source 3: OKX — DOT/USDT
    try:
        resp = requests.get("https://www.okx.com/api/v5/market/ticker?instId=DOT-USDT", timeout=10)
        resp.raise_for_status()
        price = Decimal(resp.json()["data"][0]["last"])
        log.info(f"[price] OKX DOT/USDT (proxy): ${price:.4f}")
        return price
    except Exception as e:
        log.warning(f"OKX failed: {e}")

    # Source 4: Binance — DOT/USDT
    try:
        resp = requests.get("https://api.binance.com/api/v3/ticker/price?symbol=DOTUSDT", timeout=10)
        resp.raise_for_status()
        price = Decimal(resp.json()["price"])
        log.info(f"[price] Binance DOT/USDT (proxy): ${price:.4f}")
        return price
    except Exception as e:
        log.warning(f"Binance failed: {e}")

    log.warning("All price sources failed — using fallback $2.45")
    return Decimal("2.45")


def fetch_dot_price() -> Decimal:
    """Fetch native DOT/PAS price in USD for WPAS oracle updates.
    Uses env override DOT_PRICE_USD if set, otherwise fetches live.
    """
    override = os.getenv("DOT_PRICE_USD")
    if override:
        log.info(f"Using env override: DOT_PRICE_USD={override}")
        return Decimal(override)

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

    # Source 2: KuCoin
    try:
        resp = requests.get("https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=DOT-USDT", timeout=10)
        resp.raise_for_status()
        price = Decimal(resp.json()["data"]["price"])
        log.info(f"[wpas-price] KuCoin DOT/USDT: ${price:.4f}")
        return price
    except Exception as e:
        log.warning(f"[wpas-price] KuCoin failed: {e}")

    # Source 3: OKX
    try:
        resp = requests.get("https://www.okx.com/api/v5/market/ticker?instId=DOT-USDT", timeout=10)
        resp.raise_for_status()
        price = Decimal(resp.json()["data"][0]["last"])
        log.info(f"[wpas-price] OKX DOT/USDT: ${price:.4f}")
        return price
    except Exception as e:
        log.warning(f"[wpas-price] OKX failed: {e}")

    # Source 4: Binance
    try:
        resp = requests.get("https://api.binance.com/api/v3/ticker/price?symbol=DOTUSDT", timeout=10)
        resp.raise_for_status()
        price = Decimal(resp.json()["price"])
        log.info(f"[wpas-price] Binance DOT/USDT: ${price:.4f}")
        return price
    except Exception as e:
        log.warning(f"[wpas-price] Binance failed: {e}")

    log.warning("[wpas-price] All price sources failed — using fallback $5.00")
    return Decimal("5.00")


def price_to_wei(price_usd: Decimal) -> int:
    return int(price_usd * Decimal("1e18"))


# ── Solvency proof ────────────────────────────────────────────────────────────

def submit_solvency_proof(w3, account, private_key, vault_contract, gateway_contract):
    """
    Reads all depositor positions, builds public inputs, submits dummy proof to
    SolvencyGateway. MockSolvencyVerifier accepts any proof bytes — real UltraHonk
    verifier is blocked by PolkaVM BN254 precompile gap (EIP-196/197).
    """
    log.info("── Solvency proof ──────────────────────────")

    # Collect all unique depositor addresses from Deposited events
    try:
        deposited_events = vault_contract.events.Deposited.get_logs(fromBlock=0, toBlock="latest")
        unique_users = list({e["args"]["user"] for e in deposited_events})
        log.info(f"[solvency] Found {len(unique_users)} unique depositor(s)")
    except Exception as e:
        log.warning(f"[solvency] Could not fetch depositor events: {e}. Using heartbeat.")
        unique_users = []

    total_collateral = 0
    total_debt = 0

    for user in unique_users:
        try:
            coll = vault_contract.functions.collateralBalance(user).call()
            debt = vault_contract.functions.debtBalance(user).call()
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
        nonce = w3.eth.get_transaction_count(account.address)
        gas_price = w3.eth.gas_price

        tx = gateway_contract.functions.publishSolvencyProof(
            proof_bytes, public_inputs
        ).build_transaction({
            "chainId": CHAIN_ID,
            "from": account.address,
            "nonce": nonce,
            "gasPrice": gas_price,
            "gas": 200_000,
        })

        signed = w3.eth.account.sign_transaction(tx, private_key)
        tx_hash = send_signed(w3, signed)  # ← version-agnostic
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

        status = "OK" if receipt["status"] == 1 else "FAIL"
        log.info(f"[solvency] Proof submitted | Tx: {tx_hash.hex()} | block: {receipt['blockNumber']} | {status}")
        log.info(f"[solvency] Explorer: https://blockscout-testnet.polkadot.io/tx/{tx_hash.hex()}")
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
        iteration += 1
        log.info(f"── Tick #{iteration} ────────────────────────────")

        # ── Price update (every tick) ──────────────────────────────────────────
        try:
            price_usd = fetch_vdot_price()
            price_wei = price_to_wei(price_usd)

            nonce = w3.eth.get_transaction_count(account.address)
            gas_price = w3.eth.gas_price

            tx = oracle.functions.submitPrice(VDOT_ADDRESS, price_wei).build_transaction({
                "chainId": CHAIN_ID,
                "from": account.address,
                "nonce": nonce,
                "gasPrice": gas_price,
                "gas": 100_000,
            })

            signed = w3.eth.account.sign_transaction(tx, private_key)
            tx_hash = send_signed(w3, signed)  # ← version-agnostic
            receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

            log.info(f"Price submitted: ${price_usd} ({price_wei} wei)")
            log.info(f"Tx: {tx_hash.hex()} | block: {receipt['blockNumber']} | status: {'OK' if receipt['status'] == 1 else 'FAIL'}")
            log.info(f"Explorer: https://blockscout-testnet.polkadot.io/tx/{tx_hash.hex()}")

        except Exception as e:
            log.error(f"Price tick failed: {e}")

        # ── WPAS (native DOT/PAS) price update ────────────────────────────────
        if WPAS_ADDRESS:
            try:
                dot_price_usd = fetch_dot_price()
                dot_price_wei = price_to_wei(dot_price_usd)

                nonce = w3.eth.get_transaction_count(account.address)
                gas_price = w3.eth.gas_price

                tx = oracle.functions.submitPrice(WPAS_ADDRESS, dot_price_wei).build_transaction({
                    "chainId": CHAIN_ID,
                    "from": account.address,
                    "nonce": nonce,
                    "gasPrice": gas_price,
                    "gas": 100_000,
                })

                signed = w3.eth.account.sign_transaction(tx, private_key)
                tx_hash = send_signed(w3, signed)
                receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

                log.info(f"[wpas] Price submitted: ${dot_price_usd} ({dot_price_wei} wei)")
                log.info(f"[wpas] Tx: {tx_hash.hex()} | block: {receipt['blockNumber']} | status: {'OK' if receipt['status'] == 1 else 'FAIL'}")
                log.info(f"[wpas] Explorer: https://blockscout-testnet.polkadot.io/tx/{tx_hash.hex()}")

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

        log.info(f"Sleeping {INTERVAL // 60} minutes...")
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
