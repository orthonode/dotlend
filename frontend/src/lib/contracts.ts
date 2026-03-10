export const ADDRESSES = {
  priceOracle:     "0xea7a8D7Dad04fD3B3Bf0242F3b7114b7CfcCBc1D" as `0x${string}`,
  vdot:            "0x95Fa043b8acA6F73AfE03a3085E7Bfe53A5715CA" as `0x${string}`,
  hollar:          "0x2C8C4b2F63E50E566f9BA87EA4f75Caa368c2AAf" as `0x${string}`,
  collateralVault: "0x6616cAD74C6fDfd0e64D5e605F4CB241e838aC07" as `0x${string}`,
  lendingPool:     "0x76316a10e293A33Aa89843Fe4d390787ceEEEEa2" as `0x${string}`,
  treasuryRouter:  "0x000ae32C07F153aF485505d63364f49dEBF9518f" as `0x${string}`,
  solvencyGateway: "0x6B682835bB25f7cA9e69D54B4B26e3A238Df66C0" as `0x${string}`,
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
