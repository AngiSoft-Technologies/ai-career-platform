/**
 * The HTML worker.
 *
 * HTML→Markdown conversion is synchronous and superlinear in the size of the
 * document, which means it cannot be interrupted, cannot be cancelled, and
 * blocks everything else on the thread while it runs. In production that
 * killed the whole background pipeline: one 3 MB page took 71 seconds inside
 * Turndown, and the worker could not answer Redis, renew a lease, or fire
 * its own deadline for the duration.
 *
 * So the conversion runs here, on its own thread, where a slow page costs
 * the page and nothing else. The parent enforces a deadline and falls back
 * to a linear reading of the page if this thread ever stops answering.
 *
 * This file is a build entry point: it is emitted as `dist/html-worker.js`
 * and started with `new Worker(...)`.
 */

import { parentPort } from "node:worker_threads";

import { processHtml } from "./services/engine/html.js";
import type {
  HtmlWorkerRequest,
  HtmlWorkerResponse,
} from "./services/engine/html-worker-protocol.js";

const port = parentPort;
if (!port) {
  throw new Error("HTML_WORKER_NO_PARENT");
}

port.on("message", (request: HtmlWorkerRequest) => {
  let response: HtmlWorkerResponse;

  try {
    response = {
      id: request.id,
      ok: true,
      result: processHtml(request.html, request.options, request.url),
    };
  } catch (error) {
    response = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  port.postMessage(response);
});
