# ---- Base ----
FROM node:22-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---- Dependencies ----
FROM base AS deps
COPY package.json package-lock.json ./
# Need python3 + build tools for native modules (Orca WASM, Anchor, etc.)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm ci --ignore-scripts=false
# Orca whirlpools WASM needs a post-install step — rebuild native modules
RUN npm rebuild

# ---- Builder ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build args become env vars at build time (for NEXT_PUBLIC_ vars)
ARG NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
ARG NEXT_PUBLIC_SOLANA_NETWORK=devnet
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_VAULT_APOLLO_MINT
ARG NEXT_PUBLIC_VAULT_BUILD_MINT
ARG NEXT_PUBLIC_VAULT_SCOPE_MINT

ENV NEXT_PUBLIC_SOLANA_RPC_URL=$NEXT_PUBLIC_SOLANA_RPC_URL
ENV NEXT_PUBLIC_SOLANA_NETWORK=$NEXT_PUBLIC_SOLANA_NETWORK
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_VAULT_APOLLO_MINT=$NEXT_PUBLIC_VAULT_APOLLO_MINT
ENV NEXT_PUBLIC_VAULT_BUILD_MINT=$NEXT_PUBLIC_VAULT_BUILD_MINT
ENV NEXT_PUBLIC_VAULT_SCOPE_MINT=$NEXT_PUBLIC_VAULT_SCOPE_MINT

# Use webpack for build (Turbopack eats too much RAM in containers)
RUN npx next build --webpack

# ---- Runner ----
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Copy built app
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
