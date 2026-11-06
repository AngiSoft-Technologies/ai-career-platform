import { searchWebPlannedAll } from "../services/api/src/services/engine/search-orchestrator.js";
import { detectAts } from "../services/api/src/services/engine/ats.js";

const queries = [
  '"airtel.co.ke" careers jobs',
  "Airtel Kenya careers jobs",
  '"kplc.co.ke" careers jobs',
  "KPLC careers jobs Kenya",
  '"twiga.com" careers jobs',
  "Twiga careers jobs Kenya",
  '"m-pesaafrica.com" careers jobs',
  '"cellulant.io" careers jobs',
];

async function main(): Promise<void> {
  for (const query of queries) {
    const planned = await searchWebPlannedAll(query, {
      limit: 12,
      providers: ["searxng", "duckduckgo", "bing"],
      isValidResult: () => true,
    }).catch((error) => {
      console.log(`${query}: ERROR ${String(error).slice(0, 70)}`);
      return null;
    });
    if (!planned) continue;
    const boards = planned.results
      .map((result) => ({ result, board: detectAts(result.url) }))
      .filter((entry) => entry.board);
    console.log(`\n=== ${query}: results=${planned.results.length} boards=${boards.length}`);
    for (const entry of boards.slice(0, 5)) {
      console.log(`   ${entry.board?.kind}:${entry.board?.token} — ${entry.result.title.slice(0, 60)}`);
    }
    if (boards.length === 0) {
      for (const result of planned.results.slice(0, 4)) {
        console.log(`   - ${result.url.slice(0, 90)} | ${result.title.slice(0, 50)}`);
      }
    }
  }
}

void main();
