#!/usr/bin/env python3
"""
DotLend Oracle — posts vDOT price to PriceOracle on Polkadot Hub TestNet
Runs every 30 minutes. Authorized oracle = deployer address.

Also submits a solvency proof to SolvencyGateway every 6 hours.
MockSolvencyVerifier accepts any proof bytes — real UltraHonk verifier
blocked by PolkaVM BN254 precompile gap (EIP-196/197).

Config via .env:
  PRIVATE_KEY       — deployer private key
  VDOT_PRICE_USD    — override price in USD (optional, default: fetch from CoinGecko)
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
SOLVENCY_INTERVAL = 6 * 60 * 60  # 6 hours between solvency proofs

PRICE_ORACLE_ADDRESS   = Web3.to_checksum_address("0xea7a8D7Dad04fD3B3Bf0242F3b7114b7CfcCBc1D")
VDOT_ADDRESS           = Web3.to_checksum_address("0x95Fa043b8acA6F73AfE03a3085E7Bfe53A5715CA")
COLLATERAL_VAULT_ADDRESS = Web3.to_checksum_address("0xc8cdEF13677bEA21e8b8282c9cE118EbBE4fA14c")
SOLVENCY_GATEWAY_ADDRESS = Web3.to_checksum_address("0x6B682835bB25f7cA9e69D54B4B26e3A238Df66C0")

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

    # Source 2: Binance — DOT/USDT
    try:
        resp = requests.get("https://api.binance.com/api/v3/ticker/price?symbol=DOTUSDT", timeout=10)
        resp.raise_for_status()
        price = Decimal(resp.json()["price"])
        log.info(f"[price] Binance DOT/USDT (proxy): ${price:.4f}")
        return price
    except Exception as e:
        log.warning(f"Binance failed: {e}")

    # Source 3: DIA Oracle
    try:
        resp = requests.get(
            "https://api.diadata.org/v1/assetQuotation/Bifrost/0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF",
            timeout=10
        )
        resp.raise_for_status()
        price = Decimal(str(resp.json()["Price"]))
        log.info(f"[price] DIA vDOT: ${price:.4f}")
        return price
    except Exception as e:
        log.warning(f"DIA failed: {e}")

    log.warning("All price sources failed — using fallback $2.45")
    return Decimal("2.45")


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
                # Get current vDOT price to compute USD value
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

    # Heartbeat values when no active positions
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
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

        status = "OK" if receipt["status"] == 1 else "FAIL"
        log.info(f"[solvency] Proof submitted | Tx: {tx_hash.hex()} | block: {receipt['blockNumber']} | {status}")
        log.info(f"[solvency] Explorer: https://blockscout-testnet.polkadot.io/tx/{tx_hash.hex()}")
    except Exception as e:
        log.error(f"[solvency] Submission failed: {e}")


# ── Oracle loop ───────────────────────────────────────────────────────────────

def main():
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
    log.info(f"Chain ID:      {CHAIN_ID}")
    log.info(f"Interval:      {INTERVAL // 60} minutes")
    log.info(f"Solvency proof: every {SOLVENCY_INTERVAL // 3600} hours")

    oracle  = w3.eth.contract(address=PRICE_ORACLE_ADDRESS,    abi=PRICE_ORACLE_ABI)
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
            tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
            receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

            log.info(f"Price submitted: ${price_usd} ({price_wei} wei)")
            log.info(f"Tx: {tx_hash.hex()} | block: {receipt['blockNumber']} | status: {'OK' if receipt['status'] == 1 else 'FAIL'}")
            log.info(f"Explorer: https://blockscout-testnet.polkadot.io/tx/{tx_hash.hex()}")

        except Exception as e:
            log.error(f"Price tick failed: {e}")

        # ── Solvency proof (every 6 hours) ────────────────────────────────────
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
