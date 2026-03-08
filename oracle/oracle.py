#!/usr/bin/env python3
"""
DotLend Oracle — posts vDOT price to PriceOracle on Polkadot Hub TestNet
Runs every 30 minutes. Authorized oracle = deployer address.

Usage:
  python3 oracle/oracle.py

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
INTERVAL  = 30 * 60  # 30 minutes

PRICE_ORACLE_ADDRESS = Web3.to_checksum_address("0xea7a8D7Dad04fD3B3Bf0242F3b7114b7CfcCBc1D")
VDOT_ADDRESS         = Web3.to_checksum_address("0x95Fa043b8acA6F73AfE03a3085E7Bfe53A5715CA")

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
    """
    Fetch live vDOT price in USD from multiple sources.
    Priority: CoinGecko vDOT → Binance DOT/USDT → DIA Oracle → env fallback
    VDOT_PRICE_USD env var overrides everything.
    """
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

    # Source 2: Binance — DOT/USDT (no auth, high rate limits)
    try:
        resp = requests.get("https://api.binance.com/api/v3/ticker/price?symbol=DOTUSDT", timeout=10)
        resp.raise_for_status()
        price = Decimal(resp.json()["price"])
        log.info(f"[price] Binance DOT/USDT (proxy): ${price:.4f}")
        return price
    except Exception as e:
        log.warning(f"Binance failed: {e}")

    # Source 3: DIA Oracle — vDOT fair value
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
    """Convert USD price to 1e18 integer."""
    return int(price_usd * Decimal("1e18"))


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

    oracle = w3.eth.contract(address=PRICE_ORACLE_ADDRESS, abi=PRICE_ORACLE_ABI)

    iteration = 0
    while True:
        iteration += 1
        log.info(f"── Tick #{iteration} ────────────────────────────")

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
            tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction)
            receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

            log.info(f"Price submitted: ${price_usd} ({price_wei} wei)")
            log.info(f"Tx: {tx_hash.hex()} | block: {receipt['blockNumber']} | status: {'OK' if receipt['status'] == 1 else 'FAIL'}")
            log.info(f"Explorer: https://blockscout-testnet.polkadot.io/tx/{tx_hash.hex()}")

        except Exception as e:
            log.error(f"Tick failed: {e}")

        log.info(f"Sleeping {INTERVAL // 60} minutes...")
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
