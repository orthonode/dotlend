export const COMMON_ADDRESSES = {
  priceOracle:     "0xc12D24cD6DF4521C9A453a325751bB1f38326a91" as `0x${string}`,
  hollar:          "0xA94f7464F3a2cA966CB31881A1614A9CF97859ca" as `0x${string}`,
  treasuryRouter:  "0x68099740bb099970c62F231fE5d8A08ae58de9AA" as `0x${string}`,
  solvencyGateway: "0x3e7D948769818C71075E38bbAA6198908Ba6CFAa" as `0x${string}`,
};

export type MarketAddresses = {
  collateral: `0x${string}`;
  collateralVault: `0x${string}`;
  lendingPool: `0x${string}`;
};

export const MARKETS: Record<"vdot" | "wpas", MarketAddresses> = {
  vdot: {
    collateral: "0xa21443dfC33d44a4BaE8aA6fA6cA2A2d90F7F22F",
    collateralVault: "0x57c1d7f0a596FD53923d7AB6c6F2ed0ea73d51A8",
    lendingPool: "0xda1eBb8A45ea027b6d2d80AcD6b299ceE31B0419",
  },
  wpas: {
    collateral: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    collateralVault: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    lendingPool: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
  }
};

// Kept for backward compat inside specific files temporarily if needed, but we will migrate out of this
export const ADDRESSES = {
  ...COMMON_ADDRESSES,
  vdot: "0xa21443dfC33d44a4BaE8aA6fA6cA2A2d90F7F22F" as `0x${string}`,
  collateralVault: "0x57c1d7f0a596FD53923d7AB6c6F2ed0ea73d51A8" as `0x${string}`,
  lendingPool: "0xda1eBb8A45ea027b6d2d80AcD6b299ceE31B0419" as `0x${string}`,
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
] as const;

export const POOL_ABI = [
  { name: "borrow", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "hollarAmount", type: "uint256" }], outputs: [] },
  { name: "repay", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "hollarAmount", type: "uint256" }], outputs: [] },
  { name: "liquidate", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "borrower", type: "address" }], outputs: [] },
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
