export const COMMON_ADDRESSES = {
  priceOracle:     "0x1282F6B59869a57Fd2a1D7a5BC8535bB7B15D173" as `0x${string}`,
  usdh:            "0x7d605b39a8EeF1aCA3D63bD7A32E2719abA87683" as `0x${string}`,
  treasuryRouter:  "0x2Cd79d84A68F9Ba2DeB3e638267A4772f11d8d80" as `0x${string}`,
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
    collateral: "0xfc1ACa9EDF5DA2eBEA5CE1320fb40A74Ac996544",
    collateralVault: "0x7E700a00290f4B12467361030b274769A10A490B",
    lendingPool: "0xb56dB40faa6Ee37c86Aa356682DfeCCcE7c8C668",
    treasuryRouter: "0x2Cd79d84A68F9Ba2DeB3e638267A4772f11d8d80",
  },
  wpas: {
    collateral: "0xc09348291775B55Da40433ba44240c262D87Eb90",
    collateralVault: "0x575B8578F000fC554394C63cec8F07Abd0C66C34",
    lendingPool: "0xF68bDd12a8904fd6bB0CbED5623722517FDd3408",
    treasuryRouter: "0xcC2Ca486257eED1201FCdc247F9a3120D0E8Be7a",
  }
};

// Kept for backward compat inside specific files temporarily if needed, but we will migrate out of this
export const ADDRESSES = {
  ...COMMON_ADDRESSES,
  vdot: "0xfc1ACa9EDF5DA2eBEA5CE1320fb40A74Ac996544" as `0x${string}`,
  collateralVault: "0x7E700a00290f4B12467361030b274769A10A490B" as `0x${string}`,
  lendingPool: "0xb56dB40faa6Ee37c86Aa356682DfeCCcE7c8C668" as `0x${string}`,
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
  // getPrice reverts when stale — only use for on-chain transactions
  { name: "getPrice", type: "function", stateMutability: "view",
    inputs: [{ name: "token", type: "address" }], outputs: [{ type: "uint256" }] },
  // Raw mapping getters — never revert, safe for UI display
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
