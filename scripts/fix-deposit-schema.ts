/**
 * One-shot: ensure sol_deposits has deploy_tx column, then insert the user's
 * orphaned AWY deposit (mint succeeded but DB insert failed due to missing col).
 */
import { createClient } from "@supabase/supabase-js";

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Add the column via PostgREST RPC (requires a function) or direct SQL via REST
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`;
  console.log("Attempting ALTER TABLE via RPC (will fail if no exec_sql RPC defined)...");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql: "ALTER TABLE sol_deposits ADD COLUMN IF NOT EXISTS deploy_tx TEXT;" }),
  });
  console.log("ALTER status:", res.status);
  if (!res.ok) console.log("Body:", await res.text());

  // Try insert with deploy_tx — if column exists now, it works
  const { error: insertErr } = await supabase.from("sol_deposits").insert({
    vault_id: "fdn-awy",
    wallet: "3Mp5ArYysNCXxNnUeBnRCaFWGbCzHAiYoJacYK4Hhc2r",
    usdc_amount: 500000,
    shares_minted: 500000,
    deposit_tx: "5xq21SB7qihdDRWyyerTyvaDqHJUNU1FvXppG7hHUXgG1VZdmZ8xewGE7soMRKnLr3zucnT8ykYkvBy4LwuC7QWW",
    mint_tx: "YsCDAuMyW5cPhXLs1AVquFxUqYRWTSacByhn9r47LniEKzeaXjvkDZGuoy5cfEY8HJDuiZDXsp6D5tmK99octVi",
    deploy_tx: "4cPiQznv3p61AccrVw7ntptf7HNYnjuJPTAVXKqynBCGXA1z7mxNHDYejRMLLX9N3YBKk5K41g3nnh5SeKtgt93j",
  });
  if (insertErr) {
    console.log("Insert with deploy_tx failed:", insertErr.message);
    console.log("Retrying without deploy_tx...");
    const { error: e2 } = await supabase.from("sol_deposits").insert({
      vault_id: "fdn-awy",
      wallet: "3Mp5ArYysNCXxNnUeBnRCaFWGbCzHAiYoJacYK4Hhc2r",
      usdc_amount: 500000,
      shares_minted: 500000,
      deposit_tx: "5xq21SB7qihdDRWyyerTyvaDqHJUNU1FvXppG7hHUXgG1VZdmZ8xewGE7soMRKnLr3zucnT8ykYkvBy4LwuC7QWW",
      mint_tx: "YsCDAuMyW5cPhXLs1AVquFxUqYRWTSacByhn9r47LniEKzeaXjvkDZGuoy5cfEY8HJDuiZDXsp6D5tmK99octVi",
    });
    if (e2) console.error("Retry failed:", e2.message);
    else console.log("✓ Inserted without deploy_tx (column still missing — please run migration)");
  } else {
    console.log("✓ Insert succeeded with deploy_tx");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
