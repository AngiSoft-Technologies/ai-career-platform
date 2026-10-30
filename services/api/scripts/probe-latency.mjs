#!/usr/bin/env node
/**
 * Regional latency probe.
 *
 * The platform has no African vantage point, so "what does a Kenyan user
 * experience?" is unknowable — unless you measure it. This runs a fixed number
 * of requests against the public API from wherever it is invoked and reports
 * the latency distribution.
 *
 *   node services/api/scripts/probe-latency.mjs [baseUrl] [count]
 *
 * Run it from the region being questioned. From Nairobi it measures the African
 * edge; from Frankfurt it measures the European one. The two together answer
 * the question the architecture document marks unknown.
 */

const BASE = (
  process.argv[2] ??
  process.env.PROBE_BASE ??
  "https://job-radar-api-angisoft.fly.dev"
).replace(/\/+$/, "");
const COUNT = Number(process.argv[3] ?? 20);

const PATH = process.env.PROBE_PATH ?? "/live";

async function once() {
  const started = performance.now();
  const response = await fetch(`${BASE}${PATH}`, { cache: "no-store" });
  await response.arrayBuffer();
  const total = performance.now() - started;
  const ttfb = Number(response.headers.get("server-timing")?.match(/dur=([\d.]+)/)?.[1]);
  const region = response.headers.get("fly-request-id")?.split("-").pop() ?? "?";
  return { total, ttfb: Number.isFinite(ttfb) ? ttfb : null, region, status: response.status };
}

const samples = [];
console.log(`\nProbing ${BASE}${PATH} × ${COUNT}\n`);

for (let index = 0; index < COUNT; index += 1) {
  try {
    samples.push(await once());
  } catch (error) {
    console.error(`request ${index + 1} failed: ${error.message}`);
  }
  // Fixed pace, so the numbers reflect the network rather than a burst.
  await new Promise((resolve) => setTimeout(resolve, 250));
}

if (samples.length === 0) {
  console.error("no successful samples\n");
  process.exit(1);
}

const totals = samples.map((sample) => sample.total).sort((a, b) => a - b);
const regions = [...new Set(samples.map((sample) => sample.region))].join(", ");

function percentile(sorted, fraction) {
  const position = Math.min(
    sorted.length - 1,
    Math.floor(fraction * (sorted.length - 1)),
  );
  return sorted[position];
}

const mean = totals.reduce((sum, value) => sum + value, 0) / totals.length;

console.log(`samples     ${samples.length} of ${COUNT}`);
console.log(`served by   ${regions}`);
console.log(`mean        ${mean.toFixed(1)} ms`);
console.log(`p50         ${percentile(totals, 0.5).toFixed(1)} ms`);
console.log(`p95         ${percentile(totals, 0.95).toFixed(1)} ms`);
console.log(`max         ${totals[totals.length - 1].toFixed(1)} ms`);
console.log(
  `statuses    ${[...new Set(samples.map((s) => s.status))].join(", ")}\n`,
);
