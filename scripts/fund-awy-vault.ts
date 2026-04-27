import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import fs from "fs";

async function main() {
  const secret = fs.readFileSync(".keys_vaults/vault-authority.secret", "utf-8").trim();
  const auth = Keypair.fromSecretKey(bs58.decode(secret));
  const conn = new Connection(process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com", "confirmed");
  const vaultPda = new PublicKey("DgzcpTdMkQkTCa8mW2hsAGYtZehX5YSk4BB52m2VU8xy");
  const lamports = 0.02 * 1e9;

  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: auth.publicKey, toPubkey: vaultPda, lamports })
  );
  const sig = await sendAndConfirmTransaction(conn, tx, [auth]);
  console.log("Funded AWY vault PDA with 0.02 SOL, tx:", sig);
}
main().catch((e) => { console.error(e); process.exit(1); });
