/**
 * Step 2: Register the test wallet as a GRAIL user (full KYC required).
 *
 *   bun run scripts/oro-grail/02-create-user.ts
 *
 * Saves the GRAIL user record to .keys_vaults/oro/test_user/grail-user.json.
 * If the wallet is already registered (409 user_already_exists), looks it up
 * via listUsers and writes the same record.
 */

import { GrailApiError } from "@/lib/integrations/grail";
import {
  loadTestUserKeypair,
  makeAuthedClient,
  saveUserRecord,
  logKv,
} from "./_shared";

async function main() {
  const userKp = loadTestUserKeypair();
  const wallet = userKp.publicKey.toBase58();
  console.log(`Test user wallet: ${wallet}`);

  const client = makeAuthedClient();

  const internalUserId = "fdn-test-user-001";
  const kycVerifiedAt = new Date().toISOString();

  try {
    const user = await client.createUser({
      user_id: internalUserId,
      wallet_address: wallet,
      kyc: {
        country: "AE",
        full_name: "Foundation Test User",
        kyc_provider: "test",
        kyc_level: "full",
        kyc_verified_at: kycVerifiedAt,
        kyc_data: { id_type: "test", id_number: "TEST-0001" },
      },
    });

    saveUserRecord({
      grail_user_id: user.grail_user_id,
      user_id: user.user_id,
      wallet_address: user.wallet_address,
      created_at: user.created_at,
    });

    logKv("created", user);
  } catch (err) {
    if (err instanceof GrailApiError && err.status === 409) {
      console.log("User already exists — fetching existing record...");
      const list = await client.listUsers({ user_id: internalUserId });
      const existing = list.users[0];
      if (!existing) throw new Error("409 user_already_exists but listUsers returned empty");
      saveUserRecord({
        grail_user_id: existing.grail_user_id,
        user_id: existing.user_id,
        wallet_address: existing.wallet_address,
        created_at: existing.created_at,
      });
      logKv("existing", existing);
    } else {
      throw err;
    }
  }
}

main().catch((err) => {
  console.error("FAILED:", err);
  if (err instanceof GrailApiError) {
    console.error(`  status=${err.status} code=${err.code} field=${err.field ?? "-"}`);
  }
  process.exit(1);
});
