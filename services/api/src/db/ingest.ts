import { runIngestion } from "../services/ingestion/run.js";

async function main(): Promise<void> {
  const only = process.argv[2];
  const { jobSourceAdapters } = await import(
    "../services/ingestion/index.js"
  );
  const adapters = only
    ? jobSourceAdapters.filter(
        (adapter) => adapter.name.toLowerCase() === only.toLowerCase(),
      )
    : jobSourceAdapters;

  if (adapters.length === 0) {
    console.error(`unknown source: ${only}`);
    process.exit(1);
  }

  const results = await runIngestion(adapters);
  const failed = results.filter((result) => result.error);
  process.exit(failed.length === results.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
