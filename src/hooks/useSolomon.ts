"use client";

import { useState, useEffect, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import type { SolomonProtocolData } from "@/lib/integrations/solomon";

const STAKE_PROGRAM_ID = new PublicKey("HSnn7bDvkZSEwujZDPtUcdo9KL7Conycgmy8m6mBFD5");
const USDV_MINT = new PublicKey("Ex5DaKYMCN6QWFA4n67TmMwsH8MJV68RX6YXTmVM532C");
const SUSDV_MINT = new PublicKey("pTA4St7D5WshfLUPBXoaxn5m8e3k2ort2DVt3gUTa17");
const VAULT_SALT = new Uint8Array(8); // 8 zero bytes

// Instruction discriminators from the IDL
const STAKE_DISCRIMINATOR = new Uint8Array([206, 176, 202, 18, 200, 209, 179, 108]);
const START_UNSTAKE_DISCRIMINATOR = new Uint8Array([200, 243, 106, 111, 170, 72, 31, 117]);

function getVaultStatePDA(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault-state"), VAULT_SALT],
    STAKE_PROGRAM_ID,
  );
  return pda;
}

function getStakingTokenPDA(vaultState: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("staking-token"), vaultState.toBuffer()],
    STAKE_PROGRAM_ID,
  );
  return pda;
}

function getVaultTokenAccountPDA(vaultState: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault-token-account"), vaultState.toBuffer()],
    STAKE_PROGRAM_ID,
  );
  return pda;
}

function getBlacklistedPDA(user: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault-state"), VAULT_SALT, user.toBuffer()],
    STAKE_PROGRAM_ID,
  );
  return pda;
}

function getUserDataPDA(user: PublicKey, vaultState: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user-data"), user.toBuffer(), vaultState.toBuffer()],
    STAKE_PROGRAM_ID,
  );
  return pda;
}

/**
 * Build the serialized instruction data for stake/unstake.
 * Uses Uint8Array + DataView to avoid Buffer.writeBigUInt64LE (unavailable in browser).
 */
function buildInstructionData(discriminator: Uint8Array, salt: Uint8Array, amount: bigint): Buffer {
  const data = new Uint8Array(8 + 8 + 8); // discriminator + salt + amount
  data.set(discriminator, 0);
  data.set(salt, 8);
  const view = new DataView(data.buffer);
  view.setBigUint64(16, amount, true); // little-endian
  return Buffer.from(data);
}

export function useSolomonData() {
  const [data, setData] = useState<SolomonProtocolData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { getSolomonData } = await import("@/lib/integrations/solomon");
        setData(await getSolomonData());
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return { data, loading };
}

export function useSolomonBalances() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [susdvBalance, setSusdvBalance] = useState(0);
  const [usdvBalance, setUsdvBalance] = useState(0);

  const refresh = useCallback(async () => {
    if (!wallet.publicKey) {
      setSusdvBalance(0);
      setUsdvBalance(0);
      return;
    }
    try {
      const susdvAta = getAssociatedTokenAddressSync(SUSDV_MINT, wallet.publicKey, false, TOKEN_PROGRAM_ID);
      const acc = await getAccount(connection, susdvAta, "confirmed", TOKEN_PROGRAM_ID);
      setSusdvBalance(Number(acc.amount) / 1e9);
    } catch {
      setSusdvBalance(0);
    }
    try {
      const usdvAta = getAssociatedTokenAddressSync(USDV_MINT, wallet.publicKey, false, TOKEN_PROGRAM_ID);
      const acc = await getAccount(connection, usdvAta, "confirmed", TOKEN_PROGRAM_ID);
      setUsdvBalance(Number(acc.amount) / 1e9);
    } catch {
      setUsdvBalance(0);
    }
  }, [wallet.publicKey, connection]);

  useEffect(() => {
    const load = () => { refresh(); };
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { susdvBalance, usdvBalance, refresh };
}

export function useSolomonStake() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  const stake = async (usdvAmount: number) => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      setError("Wallet not connected");
      return null;
    }

    setLoading(true);
    setError(null);
    setTxSignature(null);

    try {
      // Amount in 9 decimals
      const amountRaw = BigInt(Math.floor(usdvAmount * 1e9));

      const vaultState = getVaultStatePDA();
      const stakingToken = getStakingTokenPDA(vaultState);
      const vaultTokenAccount = getVaultTokenAccountPDA(vaultState);
      const blacklisted = getBlacklistedPDA(wallet.publicKey);

      const userUsdvAta = getAssociatedTokenAddressSync(
        USDV_MINT,
        wallet.publicKey,
        false,
        TOKEN_PROGRAM_ID,
      );
      const userSusdvAta = getAssociatedTokenAddressSync(
        SUSDV_MINT,
        wallet.publicKey,
        false,
        TOKEN_PROGRAM_ID,
      );

      const instructions: TransactionInstruction[] = [];

      // Ensure sUSDV ATA exists
      try {
        await getAccount(connection, userSusdvAta, "confirmed", TOKEN_PROGRAM_ID);
      } catch {
        instructions.push(
          createAssociatedTokenAccountInstruction(
            wallet.publicKey,
            userSusdvAta,
            wallet.publicKey,
            SUSDV_MINT,
            TOKEN_PROGRAM_ID,
          ),
        );
      }

      // Build stake instruction
      const data = buildInstructionData(STAKE_DISCRIMINATOR, VAULT_SALT, amountRaw);

      const stakeIx = new TransactionInstruction({
        programId: STAKE_PROGRAM_ID,
        keys: [
          { pubkey: vaultState, isSigner: false, isWritable: true },
          { pubkey: stakingToken, isSigner: false, isWritable: true },
          { pubkey: userUsdvAta, isSigner: false, isWritable: true },
          { pubkey: userSusdvAta, isSigner: false, isWritable: true },
          { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
          { pubkey: blacklisted, isSigner: false, isWritable: true },
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
      });

      instructions.push(stakeIx);

      const tx = new Transaction().add(...instructions);
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;

      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");

      setTxSignature(sig);
      return sig;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Stake failed";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { stake, loading, error, txSignature };
}

export function useSolomonUnstake() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  const startUnstake = async (sharesAmount: number) => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      setError("Wallet not connected");
      return null;
    }

    setLoading(true);
    setError(null);
    setTxSignature(null);

    try {
      const sharesRaw = BigInt(Math.floor(sharesAmount * 1e9));

      const vaultState = getVaultStatePDA();
      const stakingToken = getStakingTokenPDA(vaultState);
      const vaultTokenAccount = getVaultTokenAccountPDA(vaultState);
      const blacklisted = getBlacklistedPDA(wallet.publicKey);
      const userData = getUserDataPDA(wallet.publicKey, vaultState);

      const userUsdvAta = getAssociatedTokenAddressSync(
        USDV_MINT,
        wallet.publicKey,
        false,
        TOKEN_PROGRAM_ID,
      );
      const userSusdvAta = getAssociatedTokenAddressSync(
        SUSDV_MINT,
        wallet.publicKey,
        false,
        TOKEN_PROGRAM_ID,
      );

      const data = buildInstructionData(START_UNSTAKE_DISCRIMINATOR, VAULT_SALT, sharesRaw);

      const ix = new TransactionInstruction({
        programId: STAKE_PROGRAM_ID,
        keys: [
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: vaultState, isSigner: false, isWritable: true },
          { pubkey: stakingToken, isSigner: false, isWritable: true },
          { pubkey: userSusdvAta, isSigner: false, isWritable: true },
          { pubkey: userUsdvAta, isSigner: false, isWritable: true },
          { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
          { pubkey: blacklisted, isSigner: false, isWritable: true },
          { pubkey: userData, isSigner: false, isWritable: true },
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
      });

      const tx = new Transaction().add(ix);
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;

      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");

      setTxSignature(sig);
      return sig;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unstake request failed";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { startUnstake, loading, error, txSignature };
}
