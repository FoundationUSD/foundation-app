import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(req: NextRequest) {
  try {
    const { vaultAddress, userWallet, amount } = await req.json();

    if (!vaultAddress || !userWallet || !amount) {
      return NextResponse.json(
        { success: false, error: "Missing vaultAddress, userWallet, or amount" },
        { status: 400 },
      );
    }

    const { DriftClient, Wallet, BN } = await import("@drift-labs/sdk");
    const { getVaultClient, getVaultDepositorAddressSync, VAULT_PROGRAM_ID } =
      await import("@drift-labs/vaults-sdk");
    const web3 = await import("@solana/web3.js");

    const rpcUrl =
      process.env.SOLANA_RPC_URL ||
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      "https://api.mainnet-beta.solana.com";

    const connection = new web3.Connection(rpcUrl, "confirmed");
    const userPubkey = new web3.PublicKey(userWallet);
    const vaultPubkey = new web3.PublicKey(vaultAddress);

    // Dummy wallet for tx building — user signs client-side
    const dummyWallet = new Wallet(web3.Keypair.generate() as any);

    const DRIFT_PROGRAM_ID = new web3.PublicKey(
      "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH",
    );

    const driftClient = new DriftClient({
      connection: connection as any,
      wallet: dummyWallet,
      programID: DRIFT_PROGRAM_ID as any,
      accountSubscription: {
        type: "polling",
        accountLoader: undefined as any,
      },
    });

    await driftClient.subscribe();

    // Use the helper that creates the Anchor program automatically
    const vaultClient = getVaultClient(
      connection as any,
      dummyWallet,
      driftClient,
    );

    const vaultDepositor = getVaultDepositorAddressSync(
      VAULT_PROGRAM_ID as any,
      vaultPubkey as any,
      userPubkey as any,
    );

    const depositAmount = new BN(Math.floor(parseFloat(amount) * 1_000_000));

    // Init vault depositor if it doesn't exist yet
    let initVaultDepositor: any;
    const accountInfo = await connection.getAccountInfo(vaultDepositor as any);
    if (!accountInfo) {
      initVaultDepositor = { authority: userPubkey, vault: vaultPubkey };
    }

    const tx = await vaultClient.createDepositTx(
      vaultDepositor,
      depositAmount,
      initVaultDepositor,
    );

    // Serialize — createDepositTx returns a VersionedTransaction
    const serialized = Buffer.from(tx.serialize()).toString("base64");

    await driftClient.unsubscribe();

    return NextResponse.json({
      success: true,
      data: { transaction: serialized },
    });
  } catch (error) {
    console.error("POST /api/drift/deposit error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to build deposit tx",
      },
      { status: 500 },
    );
  }
}
