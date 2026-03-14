export const COMMON_ADDRESSES = {
  priceOracle:     "0x1282F6B59869a57Fd2a1D7a5BC8535bB7B15D173" as `0x${string}`,
  usdh:            "0x7d605b39a8EeF1aCA3D63bD7A32E2719abA87683" as `0x${string}`,
  solvencyGateway: "0x199E3E7c1f1382bc389b495B927B0535B390Acd0" as `0x${string}`,
  xcmTreasuryDispatch: "0x3FfEAC3766F05752f8D3Ae8eEd00B57259Eb3c2d" as `0x${string}`,
};

export type MarketAddresses = {
  collateral: `0x${string}`;
  collateralVault: `0x${string}`;
  lendingPool: `0x${string}`;
  treasuryRouter: `0x${string}`;
};

export const MARKETS: Record<"vdot" | "wpas", MarketAddresses> = {
  vdot: {
    collateral:      "0xfc1ACa9EDF5DA2eBEA5CE1320fb40A74Ac996544",
    collateralVault: "0xF94eBe7F8d8F922B7FBBFb4BE080EB71a69415A2",
    lendingPool:     "0x34B22768B16262aD5b7fC23DD797D80791e4e7e6",
    treasuryRouter:  "0x1adEe37eefd054927b14503Ff2076aE12Db76B30",
  },
  wpas: {
    collateral:      "0xc09348291775B55Da40433ba44240c262D87Eb90",
    collateralVault: "0x575B8578F000fC554394C63cec8F07Abd0C66C34",
    lendingPool:     "0xF68bDd12a8904fd6bB0CbED5623722517FDd3408",
    treasuryRouter:  "0xcC2Ca486257eED1201FCdc247F9a3120D0E8Be7a",
  }
};

// Kept for backward compat
export const ADDRESSES = {
  ...COMMON_ADDRESSES,
  vdot:            "0xfc1ACa9EDF5DA2eBEA5CE1320fb40A74Ac996544" as `0x${string}`,
  collateralVault: "0xF94eBe7F8d8F922B7FBBFb4BE080EB71a69415A2" as `0x${string}`,
  lendingPool:     "0x34B22768B16262aD5b7fC23DD797D80791e4e7e6" as `0x${string}`,
  treasuryRouter:  "0x1adEe37eefd054927b14503Ff2076aE12Db76B30" as `0x${string}`,
};

export const EXPLORER = "https://blockscout-testnet.polkadot.io";

export const VAULT_ABI = [
  { name: "collateralBalance", type: "function", stateMutability: "view",
    inputs: [{ name: "user", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "debtBalance", type: "function", stateMutability: "view",
    inputs: [{ name: "user", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "getHealthFactor", type: "function", stateMutability: "view",
    inputs: [{ name: "user", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "getCollateralValue", type: "function", stateMutability: "view",
    inputs: [{ name: "user", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "deposit", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { name: "withdraw", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { name: "Deposited", type: "event",
    inputs: [{ name: "user", type: "address", indexed: true }, { name: "amount", type: "uint256", indexed: false }] },
  { name: "Withdrawn", type: "event",
    inputs: [{ name: "user", type: "address", indexed: true }, { name: "amount", type: "uint256", indexed: false }] },
] as const;

export const POOL_ABI = [
  { name: "borrow", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "usdhAmount", type: "uint256" }], outputs: [] },
  { name: "repay", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "usdhAmount", type: "uint256" }], outputs: [] },
  { name: "liquidate", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "borrower", type: "address" }], outputs: [] },
  { name: "Borrowed", type: "event",
    inputs: [{ name: "user", type: "address", indexed: true }, { name: "usdhAmount", type: "uint256", indexed: false }] },
] as const;

export const GATEWAY_ABI = [
  { name: "publishSolvencyProof", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "proof", type: "bytes" }, { name: "publicInputs", type: "uint256[]" }], outputs: [] },
  { name: "SolvencyProven", type: "event",
    inputs: [
      { name: "totalCollateral", type: "uint256", indexed: false },
      { name: "totalDebt",       type: "uint256", indexed: false },
      { name: "timestamp",       type: "uint256", indexed: false },
    ] },
] as const;

export const ORACLE_ABI = [
  { name: "getPrice", type: "function", stateMutability: "view",
    inputs: [{ name: "token", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "prices", type: "function", stateMutability: "view",
    inputs: [{ name: "token", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "lastUpdated", type: "function", stateMutability: "view",
    inputs: [{ name: "token", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export const MOCK_ABI = [
  { name: "mint", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export const ERC20_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "approve", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { name: "allowance", type: "function", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export const WPAS_ABI = [
  { name: "deposit", type: "function", stateMutability: "payable", inputs: [], outputs: [] },
  { name: "withdraw", type: "function", stateMutability: "nonpayable", inputs: [{ name: "wad", type: "uint256" }], outputs: [] },
] as const;
