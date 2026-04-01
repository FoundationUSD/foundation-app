/**
 * Solomon staking transaction builder — client-side compatible.
 */

import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  type Connection,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";

const STAKE_PROGRAM_ID = new PublicKey("HSnn7bDvkZSEwujZDPtUcdo9KL7Conycgmy8m6mBFD5");
const USDV_MINT = new PublicKey("Ex5DaKYMCN6QWFA4n67TmMwsH8MJV68RX6YXTmVM532C");
const SUSDV_MINT = new PublicKey("pTA4St7D5WshfLUPBXoaxn5m8e3k2ort2DVt3gUTa17");
const VAULT_SALT = new Uint8Array(8);
const STAKE_DISC = new Uint8Array([206, 176, 202, 18, 200, 209, 179, 108]);

function pda(seeds: (Buffer | Uint8Array)[]): PublicKey {
  const [p] = PublicKey.findProgramAddressSync(seeds, STAKE_PROGRAM_ID);
  return p;
}

function buildData(disc: Uint8Array, salt: Uint8Array, amount: bigint): Buffer {
  const buf = new Uint8Array(24);
  buf.set(disc, 0);
  buf.set(salt, 8);
  new DataView(buf.buffer).setBigUint64(16, amount, true);
  return Buffer.from(buf);
}

export async function useSolomonStakeTransaction(
  userPubkey: PublicKey,
  usdvAmount: number,
  connection: Connection,
): Promise<string> {
  const amountRaw = BigInt(Math.floor(usdvAmount * 1e9));
  const vaultState = pda([Buffer.from("vault-state"), Buffer.from(VAULT_SALT)]);
  const stakingToken = pda([Buffer.from("staking-token"), vaultState.toBuffer()]);
  const vaultTokenAccount = pda([Buffer.from("vault-token-account"), vaultState.toBuffer()]);
  const blacklisted = pda([Buffer.from("vault-state"), Buffer.from(VAULT_SALT), userPubkey.toBuffer()]);

  const userUsdvAta = getAssociatedTokenAddressSync(USDV_MINT, userPubkey, false, TOKEN_PROGRAM_ID);
  const userSusdvAta = getAssociatedTokenAddressSync(SUSDV_MINT, userPubkey, false, TOKEN_PROGRAM_ID);

  const ixs: TransactionInstruction[] = [];

  try {
    await getAccount(connection, userSusdvAta, "confirmed", TOKEN_PROGRAM_ID);
  } catch {
    ixs.push(createAssociatedTokenAccountInstruction(userPubkey, userSusdvAta, userPubkey, SUSDV_MINT, TOKEN_PROGRAM_ID));
  }

  ixs.push(
    new TransactionInstruction({
      programId: STAKE_PROGRAM_ID,
      keys: [
        { pubkey: vaultState, isSigner: false, isWritable: true },
        { pubkey: stakingToken, isSigner: false, isWritable: true },
        { pubkey: userUsdvAta, isSigner: false, isWritable: true },
        { pubkey: userSusdvAta, isSigner: false, isWritable: true },
        { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
        { pubkey: blacklisted, isSigner: false, isWritable: true },
        { pubkey: userPubkey, isSigner: true, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: buildData(STAKE_DISC, VAULT_SALT, amountRaw),
    }),
  );

  const tx = new Transaction().add(...ixs);
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = userPubkey;

  return Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString("base64");
}
