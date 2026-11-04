/**
 * Runs the HTML→Markdown pass off the main thread.
 *
 * Why this exists: the conversion is synchronous and superlinear, so a
 * pathological page blocks the event loop for minutes. When that happened in
 * production the entire background pipeline went silent — no Redis, no
 * lease renewal, no job deadline — because a timer cannot fire on a thread
 * that is not yielding.
 *
 * The contract here is deliberately blunt:
 *
 *  - the conversion happens on a worker thread, so a slow page costs the
 *    page and nothing else;
 *  - every request has a deadline, and a worker that misses one is
 *    terminated — a thread that cannot finish one page cannot be trusted
 *    with the next;
 *  - if the worker is unavailable, too slow, or broken, the page is read
 *    with a linear fallback that cannot itself hang the process.
 *
 * The result is therefore always produced, and the main thread is never
 * blocked for more than the cost of the linear fallback.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import { logger } from "../../logger.js";
import {
  processHtmlFast,
  type CleanOptions,
  type HtmlProcessingResult,
} from "./html.js";
import type {
  HtmlWorkerRequest,
  HtmlWorkerResponse,
} from "./html-worker-protocol.js";

/** How long a page may take before the worker is abandoned. */
const WORKER_TIMEOUT_MS = Number(
  process.env.HTML_WORKER_TIMEOUT_MS ?? 30_000,
);

/** How many pages may be converted at once. */
const POOL_SIZE = Math.max(
  1,
  Number(process.env.HTML_WORKER_POOL_SIZE ?? 2),
);

interface PendingRequest {
  resolve: (result: HtmlProcessingResult) => void;
  fail: (error: unknown) => void;
  timer: NodeJS.Timeout;
}

interface WorkerSlot {
  worker: Worker;
  pending: Map<number, PendingRequest>;
}

interface QueuedRequest {
  request: HtmlWorkerRequest;
  pending: PendingRequest;
}

let slots: WorkerSlot[] = [];
let queue: QueuedRequest[] = [];
let nextId = 1;

/** `undefined` means "not looked up yet"; `null` means "not available". */
let workerEntry: string | null | undefined;

/**
 * Finds the built worker entry.
 *
 * In the built image the caller lives in `dist/` next to `html-worker.js`.
 * In a source checkout (`tsx`) there is no built worker, and the caller
 * falls back to the linear path — which is the right behaviour for
 * development, where pages are small.
 */
function resolveWorkerEntry(): string | null {
  if (workerEntry !== undefined) return workerEntry;

  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "html-worker.js"),
    join(here, "..", "..", "html-worker.js"),
  ];

  workerEntry = candidates.find((candidate) => existsSync(candidate)) ?? null;
  if (!workerEntry) {
    logger.debug(
      { candidates },
      "No built HTML worker; pages will be read on the main thread",
    );
  }
  return workerEntry;
}

function failSlot(slot: WorkerSlot, error: unknown): void {
  for (const [id, pending] of [...slot.pending]) {
    slot.pending.delete(id);
    clearTimeout(pending.timer);
    pending.fail(error);
  }
  const index = slots.indexOf(slot);
  if (index !== -1) slots.splice(index, 1);
}

function spawnSlot(): WorkerSlot | null {
  const entry = resolveWorkerEntry();
  if (!entry) return null;

  const worker = new Worker(entry);
  const slot: WorkerSlot = { worker, pending: new Map() };

  worker.on("message", (response: HtmlWorkerResponse) => {
    const pending = slot.pending.get(response.id);
    if (!pending) return;
    slot.pending.delete(response.id);
    clearTimeout(pending.timer);

    if (response.ok && response.result) {
      pending.resolve(response.result);
    } else {
      pending.fail(new Error(response.error ?? "HTML_WORKER_FAILED"));
    }
  });

  worker.on("error", (error) => {
    failSlot(slot, error);
  });

  worker.on("exit", () => {
    failSlot(slot, new Error("HTML_WORKER_EXITED"));
  });

  // An idle worker must not hold the process open; the pending request's
  // timer keeps the event loop alive while a page is actually being read.
  worker.unref();

  return slot;
}

function dispatch(): void {
  while (queue.length > 0) {
    let slot = slots.find((candidate) => candidate.pending.size === 0);

    if (!slot) {
      if (slots.length >= POOL_SIZE) return;
      const created = spawnSlot();
      if (!created) return;
      slots.push(created);
      slot = created;
    }

    const next = queue.shift()!;
    slot.pending.set(next.request.id, next.pending);
    slot.worker.postMessage(next.request);
  }
}

/**
 * Reads a page, off the main thread when that is possible.
 *
 * Always resolves: a failure anywhere in the worker path degrades to the
 * linear reading of the page rather than failing the scrape.
 */
export async function processHtmlOffThread(
  html: string,
  options: CleanOptions = {},
  url?: string,
): Promise<HtmlProcessingResult> {
  if (!resolveWorkerEntry()) {
    return processHtmlFast(html, options, url);
  }

  const id = nextId++;

  return new Promise<HtmlProcessingResult>((resolve) => {
    const fallback = (): HtmlProcessingResult =>
      processHtmlFast(html, options, url);

    const timer = setTimeout(() => {
      const slot = slots.find((candidate) => candidate.pending.has(id));
      if (slot) {
        slot.pending.delete(id);
        // A thread that cannot finish one page cannot be trusted with the
        // next one either.
        void slot.worker.terminate();
      }
      logger.warn(
        { id, timeoutMs: WORKER_TIMEOUT_MS },
        "HTML worker timed out; reading the page with the linear fallback",
      );
      resolve(fallback());
    }, WORKER_TIMEOUT_MS);

    const pending: PendingRequest = {
      resolve,
      fail: (error) => {
        logger.warn(
          { id, error: error instanceof Error ? error.message : String(error) },
          "HTML worker failed; reading the page with the linear fallback",
        );
        resolve(fallback());
      },
      timer,
    };

    queue.push({ request: { id, html, options, url }, pending });
    dispatch();
  });
}

/**
 * Starts the workers and loads their modules ahead of the first page.
 *
 * The worker thread loads the HTML toolchain when it starts, which costs a
 * couple of seconds. Paying that at boot means the first real page does not
 * pay it, and — more importantly — it happens while nothing is waiting.
 */
export async function warmUpHtmlWorkers(): Promise<void> {
  if (!resolveWorkerEntry()) return;
  const tiny = "<html><body><p>warm up</p></body></html>";
  await Promise.all([
    processHtmlOffThread(tiny),
    processHtmlOffThread(tiny),
  ]);
}

/** Stops every worker. Used on shutdown. */
export async function shutdownHtmlWorkers(): Promise<void> {
  const running = slots;
  slots = [];
  queue = [];
  await Promise.all(running.map((slot) => slot.worker.terminate()));
}
