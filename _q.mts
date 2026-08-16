import { query, disconnect } from "./scripts/snowflake";
async function main() {
  const rows = await query<Record<string, unknown>>(process.argv.slice(2).join(" "));
  console.log(JSON.stringify(rows, null, 1).slice(0, 7000));
  await disconnect();
}
main().catch(async (e) => { console.error("FAIL:", e.message); await disconnect(); process.exit(1); });
