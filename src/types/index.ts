export interface NativeVault {
  id: string;
  type: "native";
  name: string;
  symbol: string;
  underlying: string;
  mintAddress: string;
  vaultAuthority: string;
  rateBps: number;
  apy: number;
  tvlUsdc: number;
  totalDeposits: number;
  createdAt: string;
}

export interface ExternalVault {
  id: string;
  type: "external";
  protocol: "kamino" | "drift" | "solomon";
  name: string;
  description: string;
  apy: number;
  tvlUsdc: number;
  vaultAddress: string;
  externalUrl: string;
  metadata: Record<string, unknown>;
  updatedAt: string;
}

export type Vault = NativeVault | ExternalVault;

export interface UserPosition {
  vaultId: string;
  vaultName: string;
  shares: number;
  value: number;
  costBasis: number;
  pnl: number;
  pnlPercent: number;
}

export interface NavPoint {
  rateBps: number;
  apy: number;
  tvlUsdc: number;
  totalShares: number;
  recordedAt: string;
}

export interface DepositRecord {
  id: number;
  vaultId: string;
  wallet: string;
  usdcAmount: number;
  sharesMinted: number;
  depositTx: string;
  mintTx: string;
  createdAt: string;
}

export interface WithdrawalRecord {
  id: number;
  vaultId: string;
  wallet: string;
  sharesBurned: number;
  usdcReturned: number;
  burnTx: string;
  transferTx: string;
  createdAt: string;
}

export interface DepositRequest {
  vaultId: string;
  txSignature: string;
  userWallet: string;
  amount: number;
}

export interface WithdrawRequest {
  vaultId: string;
  burnTxSignature: string;
  userWallet: string;
  sharesBurned: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
