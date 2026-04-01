/**
 * Kit RPC client — server-side Solana RPC using @solana/kit.
 * For client-side, the wallet adapter provides its own connection.
 */

import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  sendAndConfirmTransactionFactory,
  type FullySignedTransaction,
  type TransactionWithLifetime,
  type Rpc,
  type SolanaRpcApi,
  type RpcSubscriptions,
  type SolanaRpcSubscriptionsApi,
} from "@solana/kit";

const RPC_URL =
  process.env.SOLANA_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  "https://api.devnet.solana.com";

const WSS_URL = RPC_URL.replace("https://", "wss://").replace(
  "http://",
  "ws://",
);

let _rpc: Rpc<SolanaRpcApi> | null = null;
let _rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi> | null =
  null;

export function getRpc(): Rpc<SolanaRpcApi> {
  if (!_rpc) {
    _rpc = createSolanaRpc(RPC_URL);
  }
  return _rpc;
}

export function getRpcSubscriptions(): RpcSubscriptions<SolanaRpcSubscriptionsApi> {
  if (!_rpcSubscriptions) {
    _rpcSubscriptions = createSolanaRpcSubscriptions(WSS_URL);
  }
  return _rpcSubscriptions;
}

export function getSendAndConfirmTransaction() {
  const inner = sendAndConfirmTransactionFactory({
    rpc: getRpc(),
    rpcSubscriptions: getRpcSubscriptions(),
  });
  // signTransactionMessageWithSigners returns TransactionWithLifetime (union),
  // but sendAndConfirmTransaction requires TransactionWithBlockhashLifetime.
  // We always use blockhash lifetime, so this cast is safe.
  return (
    tx: FullySignedTransaction & TransactionWithLifetime,
    config?: { commitment?: "confirmed" | "finalized" },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => inner(tx as any, config as any);
}
