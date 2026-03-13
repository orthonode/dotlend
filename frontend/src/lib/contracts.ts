export const COMMON_ADDRESSES = {
  priceOracle:     "0xb422522F5eB930e417652deb747956545A969F63" as `0x${string}`,
  usdh:            "0x7d605b39a8EeF1aCA3D63bD7A32E2719abA87683" as `0x${string}`,
  treasuryRouter:  "0xF1E4172BEC741F69dE0a8Bf4EE88dFF679c6D281" as `0x${string}`,
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
    collateralVault: "0x73b41E4815114859FB0c0CD4F504Ed27CBd37219",
    lendingPool: "0xf909F5096700439E621B83F826Ee6Ff02047381B",
    treasuryRouter: "0xF1E4172BEC741F69dE0a8Bf4EE88dFF679c6D281",
  },
  wpas: {
    collateral: "0x83754cfC4501dc098d5bf37605E77e3bF83a1556",
    collateralVault: "0x462415c604ae6c9bEe99a9357b6B40a0D529FC8B",
    lendingPool: "0x86a97A53304c20122850cD6b80ccCA2d50A90683",
    treasuryRouter: "0x6007cDBEc7D6D114adc68191465c392Bd29d42cf",
  }
};

// Kept for backward compat inside specific files temporarily if needed, but we will migrate out of this
export const ADDRESSES = {
  ...COMMON_ADDRESSES,
  vdot: "0xfc1ACa9EDF5DA2eBEA5CE1320fb40A74Ac996544" as `0x${string}`,
  collateralVault: "0x73b41E4815114859FB0c0CD4F504Ed27CBd37219" as `0x${string}`,
  lendingPool: "0xf909F5096700439E621B83F826Ee6Ff02047381B" as `0x${string}`,
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
