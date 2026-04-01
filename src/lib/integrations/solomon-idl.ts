/**
 * Solomon Labs Stake Program IDL
 * Program: HSnn7bDvkZSEwujZDPtUcdo9KL7Conycgmy8m6mBFD5
 */

export const SOLOMON_STAKE_IDL = {
  address: "HSnn7bDvkZSEwujZDPtUcdo9KL7Conycgmy8m6mBFD5",
  metadata: {
    name: "stake",
    version: "0.1.0",
    spec: "0.1.0",
  },
  instructions: [
    {
      name: "stake",
      discriminator: [206, 176, 202, 18, 200, 209, 179, 108],
      accounts: [
        { name: "vault_state", writable: true },
        { name: "staking_token", writable: true },
        { name: "user_deposit_token_account", writable: true },
        { name: "user_staking_token_account", writable: true },
        { name: "vault_token_account", writable: true },
        { name: "blacklisted", writable: true },
        { name: "user", writable: true, signer: true },
        { name: "token_program" },
        { name: "system_program" },
      ],
      args: [
        { name: "salt", type: { array: ["u8", 8] } },
        { name: "amt", type: "u64" },
      ],
    },
    {
      name: "start_unstake",
      discriminator: [200, 243, 106, 111, 170, 72, 31, 117],
      accounts: [
        { name: "token_program" },
        { name: "vault_state", writable: true },
        { name: "staking_token", writable: true },
        { name: "user_staking_token_account", writable: true },
        { name: "user_deposit_token_account", writable: true },
        { name: "vault_token_account", writable: true },
        { name: "blacklisted", writable: true },
        { name: "user_data", writable: true },
        { name: "user", writable: true, signer: true },
        { name: "system_program" },
      ],
      args: [
        { name: "salt", type: { array: ["u8", 8] } },
        { name: "shares", type: "u64" },
      ],
    },
    {
      name: "unstake",
      discriminator: [90, 95, 107, 42, 205, 124, 50, 225],
      accounts: [
        { name: "token_program" },
        { name: "vault_state", writable: true },
        { name: "staking_token", writable: true },
        { name: "user_staking_token_account", writable: true },
        { name: "user_deposit_token_account", writable: true },
        { name: "vault_token_account", writable: true },
        { name: "blacklisted", writable: true },
        { name: "user_data", writable: true },
        { name: "user", writable: true, signer: true },
        { name: "system_program" },
      ],
      args: [
        { name: "salt", type: { array: ["u8", 8] } },
        { name: "assets", type: "u64" },
      ],
    },
    {
      name: "refresh_cooldowns",
      discriminator: [206, 6, 23, 119, 92, 123, 192, 16],
      accounts: [
        { name: "vault_state", writable: true },
        { name: "user_data", writable: true },
        { name: "user", writable: true, signer: true },
        { name: "system_program" },
      ],
      args: [{ name: "_salt", type: { array: ["u8", 8] } }],
    },
  ],
  accounts: [
    { name: "VaultState", discriminator: [228, 196, 82, 165, 98, 210, 235, 152] },
  ],
  types: [
    {
      name: "VaultState",
      type: {
        kind: "struct" as const,
        fields: [
          { name: "admin", type: "pubkey" },
          { name: "deposit_token", type: "pubkey" },
          { name: "vesting_amount", type: "u64" },
          { name: "total_assets", type: "u64" },
          { name: "min_shares", type: "u64" },
          { name: "last_distribution_time", type: "u32" },
          { name: "cooldown", type: "u32" },
          { name: "vesting_period", type: "u32" },
          { name: "bump", type: "u8" },
          { name: "rewarders", type: { vec: "pubkey" } },
        ],
      },
    },
  ],
};
