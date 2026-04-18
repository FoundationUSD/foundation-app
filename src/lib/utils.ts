import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import Decimal from "decimal.js";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUSDC(lamports: number): string {
  return new Decimal(lamports).div(1_000_000).toFixed(2);
}

export function formatUSDCCompact(lamports: number): string {
  const val = new Decimal(lamports).div(1_000_000).toNumber();
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
}

export function formatUsdCompact(val: number | undefined | null): string {
  if (val == null || !Number.isFinite(val) || val <= 0) return "--";
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
}

export function formatAPY(apy: number | string): string {
  const num = Number(apy);
  if (isNaN(num) || num <= 0) return "--";
  return `${num.toFixed(2)}%`;
}

export function lamportsToUsdc(lamports: number): number {
  return new Decimal(lamports).div(1_000_000).toNumber();
}

export function usdcToLamports(usdc: number): number {
  return new Decimal(usdc).mul(1_000_000).toNumber();
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function formatNumber(num: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

export function formatCurrency(num: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

export function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
