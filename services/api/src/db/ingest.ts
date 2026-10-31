import { runIngestion } from "../services/ingestion/run.js";

async function main(): Promise<void> {
  const result = await runIngestion();
  console.log(
    `[ingest] status=${result.status} fetched=${result.fetched} inserted=${result.inserted} updated=${result.updated} failed=${result.failed}`,
  );
  if (result.error) {
    console.error(`[ingest] error: ${result.error}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
