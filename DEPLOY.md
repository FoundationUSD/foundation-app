# Foundation App — Deployment Guide

## Why not local dev on MacBook Air?

The app uses heavy Solana DeFi SDKs that consume significant memory:

| Package | Size | Why |
|---------|------|-----|
| @drift-labs/sdk | 91MB | Full Anchor runtime + Serum DEX + Switchboard oracle |
| @kamino-finance/klend-sdk | 80MB | Anchor + Orca Whirlpools (WASM binary) |
| @solana/web3.js + spl-token | 57MB | Core Solana — needed |

**Total node_modules: ~1.8GB**, which combined with Next.js Turbopack spawning 15+ worker processes, exceeds what a MacBook Air M3 (16GB) can handle comfortably during `next dev`.

**Solution:** Build and run in Docker on an Azure VM (or deploy to Fly.io).

---

## Option 1: Azure VM (Docker)

### Setup

```bash
# SSH into your Azure VM
ssh user@your-vm-ip

# Clone the repo
git clone <your-repo-url> foundation-app
cd foundation-app

# Create .env file with your secrets
cp .env.example .env
# Edit .env with real values:
#   NEXT_PUBLIC_SUPABASE_URL=https://vhjntobgqfvdyfqhovol.supabase.co
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
#   SUPABASE_SERVICE_ROLE_KEY=your-service-key
#   VAULT_AUTHORITY_SECRET=your-base58-keypair
#   ADMIN_API_KEY=your-admin-key

# Build and run
docker compose up -d --build

# Check logs
docker compose logs -f app
```

The app will be at `http://your-vm-ip:3000`.

### Recommended VM specs

- **Minimum:** 2 vCPU, 4GB RAM (Standard_B2s)
- **Recommended:** 2 vCPU, 8GB RAM (Standard_B2ms) — gives headroom for the build step

### Updating

```bash
git pull
docker compose up -d --build
```

---

## Option 2: Fly.io

### Setup

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Launch (first time only — creates the app)
fly launch --no-deploy

# Set secrets (server-side only, never exposed to client)
fly secrets set \
  VAULT_AUTHORITY_SECRET="your-base58-keypair" \
  SUPABASE_SERVICE_ROLE_KEY="your-service-key" \
  ADMIN_API_KEY="your-admin-key" \
  SOLANA_RPC_URL="https://api.devnet.solana.com"
```

### Deploy

NEXT_PUBLIC_ vars must be set as build args since they're baked into the client bundle:

```bash
fly deploy \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://vhjntobgqfvdyfqhovol.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key \
  --build-arg NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com \
  --build-arg NEXT_PUBLIC_SOLANA_NETWORK=devnet \
  --build-arg NEXT_PUBLIC_VAULT_APOLLO_MINT=your-mint \
  --build-arg NEXT_PUBLIC_VAULT_BUILD_MINT=your-mint \
  --build-arg NEXT_PUBLIC_VAULT_SCOPE_MINT=your-mint
```

### Custom domain

```bash
fly certs add app.foundation.xyz
```

---

## Option 3: Vercel

Vercel handles the build on their infra (no local memory issues):

1. Push to GitHub
2. Connect repo at vercel.com
3. Set env vars in Vercel dashboard (both `NEXT_PUBLIC_*` and server secrets)
4. Deploy

---

## Supabase Migration

Before first deploy, run the SQL migration in your Supabase dashboard:

1. Go to https://supabase.com/dashboard → SQL Editor
2. Paste contents of `scripts/supabase-migration.sql`
3. Run

---

## Token-2022 Vault Setup

After Supabase is ready, create the devnet mints:

```bash
# On the VM or locally with enough RAM
npx tsx scripts/setup-vaults.ts

# This outputs mint addresses — add them to your .env / fly secrets
```
