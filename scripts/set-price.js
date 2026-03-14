/**
 * set-price.js — fetches live vDOT price and submits to PriceOracle
 * Usage: npx hardhat run scripts/set-price.js --network polkadotHubTestnet
 * Override: VDOT_PRICE=2.45 npx hardhat run scripts/set-price.js --network polkadotHubTestnet
 */
const { ethers } = require("hardhat");

const PRICE_ORACLE = "0xb422522F5eB930e417652deb747956545A969F63";
const VDOT_ADDR    = "0xfc1ACa9EDF5DA2eBEA5CE1320fb40A74Ac996544";
const WPAS_ADDR    = "0x83754cfC4501dc098d5bf37605E77e3bF83a1556";

async function fetchLivePrice() {
  // DeFiLlama — no auth, no geo-block
  try {
    const resp = await fetch("https://coins.llama.fi/prices/current/coingecko:bifrost-voucher-dot,coingecko:polkadot");
    const data = await resp.json();
    const coins = data.coins || {};
    if (coins["coingecko:bifrost-voucher-dot"]) {
      const p = coins["coingecko:bifrost-voucher-dot"].price;
      console.log(`[DeFiLlama] vDOT: $${p}`);
      return p.toString();
    }
    if (coins["coingecko:polkadot"]) {
      const p = coins["coingecko:polkadot"].price;
      console.log(`[DeFiLlama] DOT (proxy): $${p}`);
      return p.toString();
    }
  } catch (e) { console.warn("DeFiLlama failed:", e.message); }

  // Bybit
  try {
    const resp = await fetch("https://api.bybit.com/v5/market/tickers?category=spot&symbol=DOTUSDT");
    const data = await resp.json();
    const p = data.result.list[0].lastPrice;
    console.log(`[Bybit] DOT/USDT: $${p}`);
    return p;
  } catch (e) { console.warn("Bybit failed:", e.message); }

  // MEXC
  try {
    const resp = await fetch("https://api.mexc.com/api/v3/ticker/price?symbol=DOTUSDT");
    const data = await resp.json();
    console.log(`[MEXC] DOT/USDT: $${data.price}`);
    return data.price;
  } catch (e) { console.warn("MEXC failed:", e.message); }

  // Gate.io
  try {
    const resp = await fetch("https://api.gateio.ws/api/v4/spot/tickers?currency_pair=DOT_USDT");
    const data = await resp.json();
    console.log(`[Gate.io] DOT/USDT: $${data[0].last}`);
    return data[0].last;
  } catch (e) { console.warn("Gate.io failed:", e.message); }

  throw new Error("All price sources failed");
}

async function main() {
  const [signer] = await ethers.getSigners();

  // Fetch live price or use override
  const override = process.env.VDOT_PRICE;
  const priceUSD = override || await fetchLivePrice();
  console.log("Signer:      ", signer.address);
  console.log("PriceOracle: ", PRICE_ORACLE);
  console.log("Price:       $" + priceUSD, override ? "(env override)" : "(live)");

  const oracle = await ethers.getContractAt("PriceOracle", PRICE_ORACLE, signer);

  const auth = await oracle.authorizedOracle();
  if (auth.toLowerCase() !== signer.address.toLowerCase()) {
    console.error(`ERROR: signer ${signer.address} is not authorized oracle (${auth})`);
    process.exit(1);
  }

  // Submit vDOT price
  const priceWei = ethers.parseEther(priceUSD);
  console.log("\n--- vDOT price ---");
  const tx1 = await oracle.submitPrice(VDOT_ADDR, priceWei);
  console.log("Tx:", tx1.hash);
  await tx1.wait();
  const stored1 = await oracle.getPrice(VDOT_ADDR);
  console.log("Verified:", ethers.formatEther(stored1), "USD");

  // Submit WPAS price (same as DOT)
  console.log("\n--- WPAS/DOT price ---");
  const dotOverride = process.env.DOT_PRICE;
  const dotPriceUSD = dotOverride || priceUSD;
  const dotWei = ethers.parseEther(dotPriceUSD);
  const tx2 = await oracle.submitPrice(WPAS_ADDR, dotWei);
  console.log("Tx:", tx2.hash);
  await tx2.wait();
  const stored2 = await oracle.getPrice(WPAS_ADDR);
  console.log("Verified:", ethers.formatEther(stored2), "USD");

  console.log("\nDone. Both prices submitted live from market.");
}

main().catch(e => { console.error(e); process.exit(1); });
