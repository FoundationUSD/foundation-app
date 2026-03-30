# Foundation App — Claude Code Build Prompt

## What You're Building

A working Solana RWA yield app. No custom Solana programs. No Rust. No Anchor.

The "vault" is:

- A **Token-2022 mint** (fdnUSD) with interest-bearing extension → yield accrues automatically
- A **server-side wallet** (keypair) that holds USDC deposits and controls mint authority
- A **Next.js backend** that processes deposits (mint fdnUSD), withdrawals (burn fdnUSD + send USDC), and updates the interest rate daily based on off-chain RWA performance

Users see: connect wallet → deposit USDC → receive fdnUSD → watch yield accrue → withdraw anytime.

---

## Architecture

```
┌───────────────────────────────────────────────────┐
│                    FRONTEND                        │
│  Next.js latest App Router + TypeScript               │
│  @solana/wallet-adapter-react                     │
│  TailwindCSS + shadcn/ui + Recharts               │
│                                                    │
│  Pages:                                            │
│    /              → Landing with vault cards       │
│    /vault/[id]    → Vault detail + deposit/withdraw│
│    /portfolio     → User positions + P&L           │
└──────────────┬────────────────────────────────────┘
               │
               ▼
┌───────────────────────────────────────────────────┐
│                 NEXT.JS API ROUTES                 │
│                                                    │
│  POST /api/deposit                                 │
│    1. Verify user's USDC transfer to vault wallet  │
│    2. Calculate fdnUSD shares at current NAV       │
│    3. Mint fdnUSD to user via Token-2022           │
│    4. Log to Supabase                              │
│                                                    │
│  POST /api/withdraw                                │
│    1. Verify user's fdnUSD burn tx                 │
│    2. Calculate USDC owed at current NAV           │
│    3. Transfer USDC from vault wallet to user      │
│    4. Log to Supabase                              │
│                                                    │
│  GET /api/vaults                                   │
│    → Read vault state from on-chain + Supabase     │
│                                                    │
│  GET /api/vaults/[id]/history                      │
│    → NAV price history for charts                  │
│                                                    │
│  POST /api/admin/update-nav (protected)            │
│    → Update interest rate on Token-2022 mint       │
│                                                    │
│  CRON /api/cron/sync-state                         │
│    → Snapshot on-chain balances → Supabase         │
└──────────────┬────────────────────────────────────┘
               │
               ▼
┌───────────────────────────────────────────────────┐
│                  ON-CHAIN STATE                    │
│                                                    │
│  Token-2022 Mints (one per vault):                │
│    • fdnAPOLLO (interest rate: ~8.77% APY)        │
│    • fdnBUILD  (interest rate: ~4.50% APY)        │
│    • fdnSCOPE  (interest rate: ~6.67% APY)        │
│                                                    │
│  Vault Wallets (server keypairs):                  │
│    • Each vault has a USDC token account           │
│    • Holds all deposited USDC                      │
│    • Is mint authority + rate authority for fdnUSD  │
│                                                    │
│  User Wallets:                                     │
│    • Hold fdnUSD tokens (Token-2022)               │
│    • Interest accrues via interest-bearing ext      │
│    • Displayed balance grows without tx             │
└──────────────┬────────────────────────────────────┘
               │
               ▼
┌───────────────────────────────────────────────────┐
│                   SUPABASE                         │
│                                                    │
│  Tables:                                           │
│    vaults          → metadata, current NAV, APY    │
│    nav_history     → daily NAV snapshots (charts)  │
│    deposits        → all deposit records           │
│    withdrawals     → all withdrawal records        │
│    vault_config    → admin settings                │
└───────────────────────────────────────────────────┘
```

---

## Tech Stack — Exact Packages

```json
{
  "dependencies": {
    "next": "^14.2",
    "@solana/web3.js": "^1.95",
    "@solana/spl-token": "^0.4",
    "@solana/wallet-adapter-base": "^0.9",
    "@solana/wallet-adapter-react": "^0.15",
    "@solana/wallet-adapter-react-ui": "^0.9",
    "@solana/wallet-adapter-wallets": "^0.19",
    "@supabase/supabase-js": "^2",
    "recharts": "^2.12",
    "tailwindcss": "^3.4",
    "class-variance-authority": "^0.7",
    "clsx": "^2",
    "tailwind-merge": "^2",
    "lucide-react": "^0.400",
    "bs58": "^5",
    "decimal.js": "^10"
  }
}
```

---

## Step 1: Setup Scripts (run once)

Create `scripts/setup-vaults.ts` — this creates the Token-2022 mints and vault wallets.

```typescript
// scripts/setup-vaults.ts
//
// Run once to create:
// 1. Vault authority keypair (server-side, holds USDC, controls mints)
// 2. Token-2022 fdnUSD mints with interest-bearing extension
// 3. USDC token accounts for each vault
//
// Usage: npx ts-node scripts/setup-vaults.ts --network devnet

import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializeInterestBearingMintInstruction,
  getMintLen,
  ExtensionType,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import fs from "fs";

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
// Devnet USDC: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU

const VAULTS = [
  {
    name: "fdnAPOLLO",
    symbol: "fdnAPOLLO",
    rate: 877,
    underlying: "Apollo Diversified Credit (ACRED)",
  },
  {
    name: "fdnBUILD",
    symbol: "fdnBUILD",
    rate: 450,
    underlying: "BlackRock USD Institutional (BUIDL)",
  },
  {
    name: "fdnSCOPE",
    symbol: "fdnSCOPE",
    rate: 667,
    underlying: "Hamilton Lane SCOPE",
  },
];

async function main() {
  const network = process.argv.includes("--mainnet")
    ? "mainnet-beta"
    : "devnet";
  const connection = new Connection(
    process.env.SOLANA_RPC_URL || clusterApiUrl(network),
    "confirmed",
  );

  // Generate or load vault authority keypair
  let vaultAuthority: Keypair;
  const keyPath = `./keys/vault-authority.json`;
  if (fs.existsSync(keyPath)) {
    vaultAuthority = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(keyPath, "utf-8"))),
    );
    console.log(
      "Loaded existing vault authority:",
      vaultAuthority.publicKey.toBase58(),
    );
  } else {
    vaultAuthority = Keypair.generate();
    fs.mkdirSync("./keys", { recursive: true });
    fs.writeFileSync(
      keyPath,
      JSON.stringify(Array.from(vaultAuthority.secretKey)),
    );
    console.log(
      "Generated new vault authority:",
      vaultAuthority.publicKey.toBase58(),
    );
    console.log("⚠️  Fund this wallet with SOL + USDC before proceeding");
  }

  const results: Record<string, any> = {};

  for (const vault of VAULTS) {
    console.log(`\nCreating ${vault.name}...`);

    // Generate mint keypair
    const mintKeypair = Keypair.generate();

    // Calculate space for Token-2022 mint with interest-bearing extension
    const mintLen = getMintLen([ExtensionType.InterestBearingConfig]);
    const lamports =
      await connection.getMinimumBalanceForRentExemption(mintLen);

    // Build transaction:
    // 1. Create account for mint
    // 2. Initialize interest-bearing config (rate in basis points, so 877 = 8.77%)
    // 3. Initialize the mint (6 decimals, authority = vaultAuthority)
    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: vaultAuthority.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: mintLen,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeInterestBearingMintInstruction(
        mintKeypair.publicKey,
        vaultAuthority.publicKey, // rateAuthority — can update interest rate
        vault.rate, // initial rate in bps (877 = 8.77%)
        TOKEN_2022_PROGRAM_ID,
      ),
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        6, // decimals (same as USDC)
        vaultAuthority.publicKey, // mintAuthority
        null, // freezeAuthority (none)
        TOKEN_2022_PROGRAM_ID,
      ),
    );

    await sendAndConfirmTransaction(connection, tx, [
      vaultAuthority,
      mintKeypair,
    ]);
    console.log(`  ✅ Mint created: ${mintKeypair.publicKey.toBase58()}`);

    // Create USDC token account for this vault (to hold deposits)
    const vaultUsdcAta = getAssociatedTokenAddressSync(
      USDC_MINT,
      vaultAuthority.publicKey,
      false,
      TOKEN_PROGRAM_ID,
    );

    // Save mint keypair
    const mintKeyPath = `./keys/${vault.name.toLowerCase()}-mint.json`;
    fs.writeFileSync(
      mintKeyPath,
      JSON.stringify(Array.from(mintKeypair.secretKey)),
    );

    results[vault.name] = {
      mint: mintKeypair.publicKey.toBase58(),
      rate: vault.rate,
      underlying: vault.underlying,
      vaultUsdcAccount: vaultUsdcAta.toBase58(),
    };

    console.log(`  ✅ Rate: ${vault.rate} bps (${vault.rate / 100}% APY)`);
  }

  // Write config
  const config = {
    network,
    vaultAuthority: vaultAuthority.publicKey.toBase58(),
    usdcMint: USDC_MINT.toBase58(),
    vaults: results,
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync("./vault-config.json", JSON.stringify(config, null, 2));
  console.log("\n✅ Config written to vault-config.json");
  console.log(JSON.stringify(config, null, 2));
}

main().catch(console.error);
```

---

## Step 2: API Routes

### POST /api/deposit

The deposit flow from the user's perspective:

1. User enters USDC amount in the UI
2. Frontend builds a USDC transfer tx: user → vault wallet
3. User signs with Phantom/Backpack
4. Frontend sends the signed tx signature to `/api/deposit`
5. Backend verifies the USDC arrived, calculates shares, mints fdnUSD to user

```typescript
// app/api/deposit/route.ts

import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { NextRequest, NextResponse } from "next/server";

// Load vault authority from environment (base58 secret key)
const vaultAuthority = Keypair.fromSecretKey(/* from env */);
const connection = new Connection(process.env.SOLANA_RPC_URL!);

export async function POST(req: NextRequest) {
  const { vaultId, txSignature, userWallet, amount } = await req.json();

  // 1. Look up vault config
  const vault = VAULT_CONFIG[vaultId];
  if (!vault)
    return NextResponse.json({ error: "Unknown vault" }, { status: 400 });

  // 2. Verify the USDC transfer actually happened
  const tx = await connection.getTransaction(txSignature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) return NextResponse.json({ error: "Tx not found" }, { status: 404 });

  // Verify: correct amount of USDC was sent to vault wallet
  // Parse token balance changes from tx metadata
  const preBalances = tx.meta?.preTokenBalances || [];
  const postBalances = tx.meta?.postTokenBalances || [];
  // ... verify vault USDC account increased by `amount`

  // 3. Calculate fdnUSD shares to mint
  //    For interest-bearing tokens, 1 fdnUSD = 1 USDC at deposit time
  //    (yield accrues via interest rate, not share price)
  const sharesToMint = amount; // 1:1 at deposit

  // 4. Get or create user's fdnUSD token account (Token-2022)
  const userPubkey = new PublicKey(userWallet);
  const mintPubkey = new PublicKey(vault.mint);
  const userAta = getAssociatedTokenAddressSync(
    mintPubkey,
    userPubkey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  const instructions = [];

  // Check if ATA exists, create if not
  try {
    await getAccount(connection, userAta, "confirmed", TOKEN_2022_PROGRAM_ID);
  } catch {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        vaultAuthority.publicKey, // payer
        userAta,
        userPubkey,
        mintPubkey,
        TOKEN_2022_PROGRAM_ID,
      ),
    );
  }

  // 5. Mint fdnUSD to user
  instructions.push(
    createMintToInstruction(
      mintPubkey,
      userAta,
      vaultAuthority.publicKey, // mint authority
      sharesToMint,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  // Build, sign with vault authority, send
  const mintTx = new Transaction().add(...instructions);
  mintTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  mintTx.feePayer = vaultAuthority.publicKey;
  mintTx.sign(vaultAuthority);

  const mintSig = await connection.sendRawTransaction(mintTx.serialize());
  await connection.confirmTransaction(mintSig, "confirmed");

  // 6. Log to Supabase
  await supabase.from("deposits").insert({
    vault_id: vaultId,
    wallet: userWallet,
    usdc_amount: amount,
    shares_minted: sharesToMint,
    deposit_tx: txSignature,
    mint_tx: mintSig,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({
    success: true,
    mintTx: mintSig,
    sharesMinted: sharesToMint,
  });
}
```

### POST /api/withdraw

```typescript
// app/api/withdraw/route.ts
//
// Flow:
// 1. User burns fdnUSD (signs burn tx in frontend)
// 2. Frontend sends burn tx signature to this endpoint
// 3. Backend verifies burn, calculates USDC owed (with accrued interest)
// 4. Backend sends USDC from vault wallet to user
//
// The USDC owed includes accrued interest because Token-2022 interest-bearing
// tokens have a higher "UI amount" than raw amount over time.
// At withdrawal: USDC owed = raw_shares_burned * (1 + accrued_rate)

export async function POST(req: NextRequest) {
  const { vaultId, burnTxSignature, userWallet, sharesBurned } =
    await req.json();

  // 1. Verify burn tx
  // ... confirm fdnUSD was actually burned

  // 2. Calculate USDC owed
  //    For interest-bearing tokens, the "amount" field in the burn
  //    is the raw amount. The UI displays amount * (1 + interest).
  //    We honor the UI amount (i.e., user gets principal + yield).
  const vault = VAULT_CONFIG[vaultId];
  const mintInfo = await getMint(
    connection,
    new PublicKey(vault.mint),
    "confirmed",
    TOKEN_2022_PROGRAM_ID,
  );
  // Read interest rate and calculate accrued value
  // amountToTransfer = shares * accruedInterestMultiplier
  const usdcOwed = calculateUsdcOwed(sharesBurned, mintInfo);

  // 3. Check vault has enough USDC
  const vaultUsdcBalance = await getVaultUsdcBalance(vaultId);
  if (vaultUsdcBalance < usdcOwed) {
    return NextResponse.json(
      { error: "Insufficient liquidity" },
      { status: 400 },
    );
  }

  // 4. Transfer USDC to user
  const transferIx = createTransferInstruction(
    vaultUsdcAccount,
    userUsdcAta,
    vaultAuthority.publicKey,
    usdcOwed,
    [],
    TOKEN_PROGRAM_ID,
  );

  const tx = new Transaction().add(transferIx);
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = vaultAuthority.publicKey;
  tx.sign(vaultAuthority);
  const sig = await connection.sendRawTransaction(tx.serialize());

  // 5. Log
  await supabase.from("withdrawals").insert({
    vault_id: vaultId,
    wallet: userWallet,
    shares_burned: sharesBurned,
    usdc_returned: usdcOwed,
    burn_tx: burnTxSignature,
    transfer_tx: sig,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({
    success: true,
    transferTx: sig,
    usdcReturned: usdcOwed,
  });
}
```

### POST /api/admin/update-nav

```typescript
// app/api/admin/update-nav/route.ts
//
// Called daily by admin or cron job.
// Updates the interest rate on the Token-2022 mint to reflect
// actual RWA portfolio performance.
//
// Token-2022 interest-bearing extension:
//   rate is in basis points (877 = 8.77% APY)
//   updateRateInterestBearingMint(connection, payer, mint, rateAuthority, newRate)

import { updateRateInterestBearingMint } from "@solana/spl-token";

export async function POST(req: NextRequest) {
  // Auth check (admin API key)
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_API_KEY}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { vaultId, newRateBps } = await req.json();
  // newRateBps: e.g., 877 for 8.77% APY, 450 for 4.50%

  // Safety: rate can't change more than 200bps per update
  const currentRate = await getCurrentRate(vaultId);
  if (Math.abs(newRateBps - currentRate) > 200) {
    return NextResponse.json(
      { error: "Rate change exceeds 2% limit" },
      { status: 400 },
    );
  }

  const vault = VAULT_CONFIG[vaultId];
  const mintPubkey = new PublicKey(vault.mint);

  await updateRateInterestBearingMint(
    connection,
    vaultAuthority, // payer
    mintPubkey, // mint
    vaultAuthority, // rateAuthority
    newRateBps, // new rate in basis points
    [], // additional signers
    undefined, // confirmOptions
    TOKEN_2022_PROGRAM_ID,
  );

  // Log to Supabase
  await supabase.from("nav_history").insert({
    vault_id: vaultId,
    rate_bps: newRateBps,
    apy: newRateBps / 100,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ success: true, newRate: newRateBps });
}
```

---

## Step 3: Frontend

### Deposit Flow (what the user does)

```typescript
// hooks/useDeposit.ts

export function useDeposit(vaultId: string) {
  const { connection } = useConnection();
  const wallet = useWallet();

  const deposit = async (usdcAmount: number) => {
    if (!wallet.publicKey || !wallet.signTransaction)
      throw new Error("Not connected");

    const amountLamports = usdcAmount * 1_000_000; // 6 decimals

    // Step 1: Build USDC transfer tx (user → vault wallet)
    const vaultConfig = await fetch(`/api/vaults/${vaultId}`).then((r) =>
      r.json(),
    );
    const vaultWallet = new PublicKey(vaultConfig.vaultAuthority);

    const userUsdcAta = getAssociatedTokenAddressSync(
      USDC_MINT,
      wallet.publicKey,
    );
    const vaultUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, vaultWallet);

    const transferIx = createTransferInstruction(
      userUsdcAta,
      vaultUsdcAta,
      wallet.publicKey,
      amountLamports,
    );

    const tx = new Transaction().add(transferIx);
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.feePayer = wallet.publicKey;

    // Step 2: User signs the USDC transfer
    const signed = await wallet.signTransaction(tx);
    const sig = await connection.sendRawTransaction(signed.serialize());
    await connection.confirmTransaction(sig, "confirmed");

    // Step 3: Tell backend to mint fdnUSD
    const result = await fetch("/api/deposit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vaultId,
        txSignature: sig,
        userWallet: wallet.publicKey.toBase58(),
        amount: amountLamports,
      }),
    }).then((r) => r.json());

    return {
      depositTx: sig,
      mintTx: result.mintTx,
      shares: result.sharesMinted,
    };
  };

  return { deposit };
}
```

### Withdraw Flow

```typescript
// hooks/useWithdraw.ts

export function useWithdraw(vaultId: string) {
  const { connection } = useConnection();
  const wallet = useWallet();

  const withdraw = async (shareAmount: number) => {
    if (!wallet.publicKey || !wallet.signTransaction)
      throw new Error("Not connected");

    const vaultConfig = await fetch(`/api/vaults/${vaultId}`).then((r) =>
      r.json(),
    );
    const mintPubkey = new PublicKey(vaultConfig.mint);
    const shareLamports = shareAmount * 1_000_000;

    // Step 1: Build burn tx (user burns fdnUSD)
    const userShareAta = getAssociatedTokenAddressSync(
      mintPubkey,
      wallet.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
    );

    const burnIx = createBurnInstruction(
      userShareAta,
      mintPubkey,
      wallet.publicKey,
      shareLamports,
      [],
      TOKEN_2022_PROGRAM_ID,
    );

    const tx = new Transaction().add(burnIx);
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.feePayer = wallet.publicKey;

    // Step 2: User signs the burn
    const signed = await wallet.signTransaction(tx);
    const sig = await connection.sendRawTransaction(signed.serialize());
    await connection.confirmTransaction(sig, "confirmed");

    // Step 3: Tell backend to send USDC
    const result = await fetch("/api/withdraw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vaultId,
        burnTxSignature: sig,
        userWallet: wallet.publicKey.toBase58(),
        sharesBurned: shareLamports,
      }),
    }).then((r) => r.json());

    return {
      burnTx: sig,
      transferTx: result.transferTx,
      usdcReturned: result.usdcReturned,
    };
  };

  return { withdraw };
}
```

### Read User Position

```typescript
// hooks/useUserPosition.ts

export function useUserPosition(vaultId: string) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [position, setPosition] = useState(null);

  useEffect(() => {
    if (!wallet.publicKey) return;

    const fetchPosition = async () => {
      const vaultConfig = await fetch(`/api/vaults/${vaultId}`).then((r) =>
        r.json(),
      );
      const mintPubkey = new PublicKey(vaultConfig.mint);

      const userAta = getAssociatedTokenAddressSync(
        mintPubkey,
        wallet.publicKey!,
        false,
        TOKEN_2022_PROGRAM_ID,
      );

      try {
        const account = await getAccount(
          connection,
          userAta,
          "confirmed",
          TOKEN_2022_PROGRAM_ID,
        );

        // Token-2022 interest-bearing: getAmountWithInterest gives the
        // displayed balance including accrued interest
        const rawAmount = Number(account.amount) / 1_000_000;

        // Fetch interest config from mint to calculate accrued value
        const mintInfo = await getMint(
          connection,
          mintPubkey,
          "confirmed",
          TOKEN_2022_PROGRAM_ID,
        );
        // The UI amount includes interest accrual since last interaction
        // Use @solana/spl-token's amountToUiAmount for Token-2022

        setPosition({
          shares: rawAmount,
          // uiValue is raw * (1 + accrued_interest_since_init)
          // This comes from the interest-bearing extension math
          value: rawAmount, // TODO: multiply by interest factor
          vaultId,
        });
      } catch {
        setPosition({ shares: 0, value: 0, vaultId });
      }
    };

    fetchPosition();
    const interval = setInterval(fetchPosition, 10000);
    return () => clearInterval(interval);
  }, [wallet.publicKey, vaultId, connection]);

  return position;
}
```

---

## Step 4: Supabase Schema

```sql
-- Run this in Supabase SQL editor

CREATE TABLE vaults (
  id TEXT PRIMARY KEY,                -- "fdnAPOLLO"
  name TEXT NOT NULL,
  underlying TEXT NOT NULL,
  mint_address TEXT NOT NULL,
  vault_authority TEXT NOT NULL,
  rate_bps INT NOT NULL,              -- current interest rate
  apy NUMERIC NOT NULL,
  total_deposits BIGINT DEFAULT 0,
  total_withdrawals BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE nav_history (
  id BIGSERIAL PRIMARY KEY,
  vault_id TEXT REFERENCES vaults(id),
  rate_bps INT NOT NULL,
  apy NUMERIC NOT NULL,
  total_usdc BIGINT,                  -- vault USDC balance at time of snapshot
  total_shares BIGINT,                -- total minted shares
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_nav_vault_time ON nav_history(vault_id, recorded_at DESC);

CREATE TABLE deposits (
  id BIGSERIAL PRIMARY KEY,
  vault_id TEXT REFERENCES vaults(id),
  wallet TEXT NOT NULL,
  usdc_amount BIGINT NOT NULL,
  shares_minted BIGINT NOT NULL,
  deposit_tx TEXT NOT NULL,           -- user's USDC transfer signature
  mint_tx TEXT NOT NULL,              -- server's fdnUSD mint signature
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_deposits_wallet ON deposits(wallet, timestamp DESC);

CREATE TABLE withdrawals (
  id BIGSERIAL PRIMARY KEY,
  vault_id TEXT REFERENCES vaults(id),
  wallet TEXT NOT NULL,
  shares_burned BIGINT NOT NULL,
  usdc_returned BIGINT NOT NULL,
  burn_tx TEXT NOT NULL,
  transfer_tx TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_withdrawals_wallet ON withdrawals(wallet, timestamp DESC);

-- Seed initial vault data
INSERT INTO vaults (id, name, underlying, mint_address, vault_authority, rate_bps, apy) VALUES
('fdnAPOLLO', 'fdnAPOLLO', 'Apollo Diversified Credit (ACRED)', 'TODO', 'TODO', 877, 8.77),
('fdnBUILD', 'fdnBUILD', 'BlackRock USD Institutional (BUIDL)', 'TODO', 'TODO', 450, 4.50),
('fdnSCOPE', 'fdnSCOPE', 'Hamilton Lane SCOPE', 'TODO', 'TODO', 667, 6.67);
```

---

## Step 5: Project Structure

```
foundation-app/
├── DESIGN.md                    # Full architecture doc
├── CLAUDE.md                    # THIS FILE — build prompt
├── vault-config.json            # Generated by setup script
├── keys/                        # ⚠️ .gitignore this
│   ├── vault-authority.json
│   ├── fdnapollo-mint.json
│   ├── fdnbuild-mint.json
│   └── fdnscope-mint.json
├── scripts/
│   ├── setup-vaults.ts          # One-time: create mints + vault wallets
│   └── seed-devnet.ts           # Seed test USDC for devnet testing
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Root: WalletProvider, Supabase, theme
│   │   ├── page.tsx             # Landing: vault cards grid
│   │   ├── vault/
│   │   │   └── [id]/
│   │   │       └── page.tsx     # Vault detail: stats + deposit/withdraw
│   │   ├── portfolio/
│   │   │   └── page.tsx         # All user positions
│   │   └── api/
│   │       ├── deposit/
│   │       │   └── route.ts     # POST: verify USDC transfer → mint fdnUSD
│   │       ├── withdraw/
│   │       │   └── route.ts     # POST: verify burn → send USDC
│   │       ├── vaults/
│   │       │   ├── route.ts     # GET: all vault data
│   │       │   └── [id]/
│   │       │       ├── route.ts # GET: single vault
│   │       │       └── history/
│   │       │           └── route.ts  # GET: NAV history
│   │       ├── admin/
│   │       │   └── update-nav/
│   │       │       └── route.ts # POST: update interest rate (protected)
│   │       └── cron/
│   │           └── sync-state/
│   │               └── route.ts # Cron: snapshot on-chain → Supabase
│   ├── components/
│   │   ├── WalletProvider.tsx   # Solana wallet adapter setup
│   │   ├── VaultCard.tsx        # Card: name, APY, TVL, deposit button
│   │   ├── DepositForm.tsx      # Amount input → sign → confirm
│   │   ├── WithdrawForm.tsx     # Share input → burn → confirm
│   │   ├── SharePriceChart.tsx  # Recharts: yield over time
│   │   ├── PositionCard.tsx     # User position: shares, value, P&L
│   │   ├── ProtocolStats.tsx    # TVL, total depositors, avg yield
│   │   ├── TxHistory.tsx        # User's deposit/withdrawal history
│   │   └── ui/                  # shadcn components (button, card, input, etc.)
│   ├── hooks/
│   │   ├── useDeposit.ts
│   │   ├── useWithdraw.ts
│   │   ├── useVault.ts          # Fetch vault state (API + on-chain)
│   │   ├── useUserPosition.ts   # User's fdnUSD balance
│   │   └── useNavHistory.ts     # Chart data from Supabase
│   ├── lib/
│   │   ├── constants.ts         # USDC mint, program IDs, vault addresses
│   │   ├── supabase.ts          # Supabase client
│   │   ├── vault-server.ts      # Server-side: vault authority keypair, mint helpers
│   │   └── utils.ts             # Format numbers, parse lamports, etc.
│   └── types/
│       └── index.ts             # Vault, Position, Transaction types
├── .env.example
├── .env.local                   # ⚠️ .gitignore
├── .gitignore
├── next.config.js
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── postcss.config.js
```

---

## Step 6: Environment Variables

```env
# .env.example

# Solana
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_NETWORK=devnet

# Vault Authority (base58 secret key — NEVER commit)
VAULT_AUTHORITY_SECRET=

# Vault Config (set after running setup-vaults.ts)
VAULT_APOLLO_MINT=
VAULT_BUILD_MINT=
VAULT_SCOPE_MINT=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Admin
ADMIN_API_KEY=

# Public
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_SOLANA_NETWORK=devnet
```

---

## UI Design Requirements

### Theme

- Dark theme (black/deep navy background, like app.kamino.finance)
- Gold/amber accent color (#C8A951) for Foundation brand
- Clean, institutional feel — not degen DeFi vibes
- Font: Inter or similar clean sans-serif

### Vault Card

- Vault name (fdnAPOLLO) + underlying name (Apollo ACRED)
- Current APY (large, prominent)
- Total deposits (TVL)
- Liquidity available
- [Deposit] button (gold accent)

### Deposit Form

- USDC amount input with [MAX] button
- Shows: "You receive: X.XX fdnAPOLLO"
- Shows: "Current rate: 8.77% APY"
- Loading state while tx confirms
- Success state with tx link to Solscan

### Withdraw Form

- fdnUSD share amount input with [MAX] button
- Shows: "You receive: X.XX USDC (includes $X.XX yield)"
- Same loading/success states

### Chart

- Recharts line chart showing yield accumulation over time
- Toggle: 7d / 30d / 90d / All
- Gold line on dark background

---

## Build Order

1. `npx create-next-app@14 . --typescript --tailwind --app --src-dir`
2. Install Solana packages + shadcn + recharts + supabase
3. Build `scripts/setup-vaults.ts` — create Token-2022 mints on devnet
4. Build `WalletProvider.tsx` — Phantom/Backpack adapter
5. Build `lib/constants.ts` and `lib/supabase.ts`
6. Build `GET /api/vaults` — read vault data
7. Build `VaultCard.tsx` + landing page with grid of 3 vaults
8. Build `DepositForm.tsx` + `useDeposit.ts` + `POST /api/deposit`
9. Build `WithdrawForm.tsx` + `useWithdraw.ts` + `POST /api/withdraw`
10. Build vault detail page with deposit/withdraw forms
11. Build `useUserPosition.ts` + `PositionCard.tsx`
12. Build `SharePriceChart.tsx` with Supabase NAV history
13. Build portfolio page
14. Build `POST /api/admin/update-nav` for rate updates
15. Polish: loading states, error handling, mobile responsive
16. Deploy to Vercel

---

## Key Technical Notes

### Token-2022 Interest-Bearing Extension

- Rate is set in **basis points** (877 = 8.77% annual)
- Interest accrues continuously — no rebase transactions needed
- `amountToUiAmount()` from `@solana/spl-token` returns the displayed balance with interest
- Rate authority can update rate anytime via `updateRateInterestBearingMint()`
- This is how Ondo USDY works on Solana

### Devnet USDC

- Devnet USDC mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
- Get test USDC from Circle faucet: https://faucet.circle.com
- Mainnet USDC mint: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`

### Security for MVP

- Vault authority keypair stored as env var (NOT in repo)
- API routes verify on-chain state before minting/transferring
- Rate update endpoint is admin-only (API key auth)
- All transactions logged to Supabase for audit trail
- Rate change capped at 2% per update (safety limit)

### What This Is NOT

- This is NOT decentralized — the backend controls minting and withdrawals
- This is NOT trustless — users trust Foundation to honor deposits
- This IS transparent — all token mints, burns, transfers are on-chain and verifiable
- This IS the same model Ondo, Midas, Mountain Protocol use for production RWA tokens
- The decentralized vault program (Anchor) comes in v2

---

## After MVP: Migration Path to On-Chain Vault

1. Build the Anchor vault program (from DESIGN.md)
2. Deploy to devnet, test
3. Migrate: transfer mint authority from server keypair → Anchor program PDA
4. Users interact directly with the program (no backend needed for deposit/withdraw)
5. Backend only handles NAV updates and analytics
6. Transfer vault admin to Squads multisig
