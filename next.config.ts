import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: process.cwd(),
  },
  serverExternalPackages: [
    "@solana/web3.js",
    "@solana/spl-token",
    "@kamino-finance/klend-sdk",
    "@orca-so/whirlpools-core",
    "@drift-labs/sdk",
    "@drift-labs/vaults-sdk",
    "bs58",
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "raw.githubusercontent.com" },
    ],
  },
};

export default nextConfig;
