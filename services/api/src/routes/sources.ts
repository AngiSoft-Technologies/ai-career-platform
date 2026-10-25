import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { assertPublicUrl } from "../services/sources/http.js";
import { connectorCatalog, connectors } from "../services/sources/connectors/index.js";

const submitSchema = z.object({
  url: z.string().url(),
  name: z.string().min(2).max(120).optional(),
  notes: z.string().max(1000).optional(),
});

export const sourcesRouter = Router();

sourcesRouter.get("/catalog", (_request, response) => {
  response.json({
    total: connectorCatalog.length,
    adapters: connectorCatalog(),
    connectors: connectors.map((connector) => ({
      name: connector.name,
      kind: connector.kind,
    })),
    note: "Platform discovery already monitors this list. Submitting a source is only needed when we are missing one.",
  });
});

sourcesRouter.post("/", async (request, response, next) => {
  try {
    const input = submitSchema.parse(request.body);
    const userId = response.locals.userId as string;

    const url = await assertPublicUrl(input.url);

    const existing = await query<{ id: string; status: string; name: string }>(
      `SELECT id, status, name FROM job_sources
        WHERE url = $1 OR url = $2
        LIMIT 1`,
      [url.toString(), `${url.origin}${url.pathname}`.replace(/\/$/, "")],
    );

    if (existing.rows[0]) {
      response.status(200).json({
        source: existing.rows[0],
        message: "This source is already registered.",
      });
      return;
    }

    const inserted = await query<{ id: string }>(
      `INSERT INTO job_sources (
         type, name, url, external_id, kind, adapter, status, submitted_by,
         health, last_checked_at, config
       )
       VALUES ($1, $2, $3, $4, 'html', null, 'pending_review', $5, 'unverified', now(), $6)
       RETURNING id`,
      [
        "user_submitted",
        input.name ?? url.hostname.replace(/^www\./, ""),
        url.toString(),
        `user-${Date.now()}`,
        userId,
        JSON.stringify({ notes: input.notes ?? null }),
      ],
    );

    response.status(201).json({
      source: { id: inserted.rows[0]?.id, status: "pending_review" },
      message:
        "Thanks. A curator reviews it, and once verified our system monitors it automatically.",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "BlockedUrlError") {
      response.status(400).json({ error: error.message, code: "INVALID_SOURCE_URL" });
      return;
    }
    next(error);
  }
});

sourcesRouter.get("/", async (_request, response, next) => {
  try {
    const result = await query(
      `SELECT id, type, name, url, kind, adapter, status, health,
              reliability, discovered_count, check_frequency_minutes,
              next_check_at, last_checked_at, created_at
         FROM job_sources
        ORDER BY created_at DESC
        LIMIT 100`,
    );
    response.json({ items: result.rows, total: result.rowCount });
  } catch (error) {
    next(error);
  }
});

sourcesRouter.get("/queue", async (_request, response, next) => {
  try {
    const result = await query(
      `SELECT id, name, url, status, health, verification, submitted_by, created_at
         FROM job_sources
        WHERE status = 'pending_review' OR health IN ('unverified','error')
        ORDER BY created_at ASC
        LIMIT 100`,
    );
    response.json({ items: result.rows, total: result.rowCount });
  } catch (error) {
    next(error);
  }
});

sourcesRouter.post("/:id/verify", async (request, response, next) => {
  try {
    const sourceId = z.string().uuid().parse(request.params.id);

    const source = await query<{ url: string; name: string; status: string }>(
      "SELECT url, name, status FROM job_sources WHERE id = $1",
      [sourceId],
    );
    const row = source.rows[0];
    if (!row) {
      response.status(404).json({ error: "Source not found" });
      return;
    }

    const connector = connectors.find((entry) => entry.detect(row.url));
    const startedAt = Date.now();
    const health = connector
      ? await connector.healthCheck({ url: row.url, kind: "html" })
      : { ok: false, error: "NO_ADAPTER" };

    const jobLinks = connector
      ? await connector
          .fetchJobs({ url: row.url, kind: "html" })
          .then((jobs) => jobs.length)
          .catch(() => 0)
      : 0;

    const verified = health.ok && jobLinks > 0;
    const status = verified ? "verified" : "rejected";
    const reason = verified
      ? jobLinks > 0
        ? undefined
        : "NO_JOB_LINKS"
      : (health.error ?? "UNREACHABLE");

    await query(
      `UPDATE job_sources
          SET status = $2,
              health = $3,
              adapter = $4,
              verification = $5,
              last_checked_at = now(),
              next_check_at = now() + interval '1 hour'
        WHERE id = $1`,
      [
        sourceId,
        status,
        health.ok ? "healthy" : "error",
        connector?.name ?? "generic_web",
        JSON.stringify({
          ok: verified,
          httpStatus: health.status,
          contentType: health.contentType,
          jobLinksFound: jobLinks,
          durationMs: Date.now() - startedAt,
          reason,
          verifiedAt: new Date().toISOString(),
        }),
      ],
    );

    await query(
      `INSERT INTO source_checks (source_id, status, http_status, jobs_found, duration_ms, error)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        sourceId,
        health.ok ? "healthy" : "error",
        health.status ?? null,
        jobLinks,
        Date.now() - startedAt,
        reason,
      ],
    );

    await query(
      `INSERT INTO events (type, aggregate_type, aggregate_id, payload)
       VALUES ('source.check.requested', 'job_source', $1, $2)`,
      [sourceId, JSON.stringify({ ok: verified, jobLinks, reason })],
    );

    response.json({
      ok: verified,
      status,
      adapter: connector?.name ?? "generic_web",
      jobLinksFound: jobLinks,
      httpStatus: health.status,
      reason,
      message: verified
        ? "Verified. Our system will now monitor this source automatically."
        : "Could not verify this source. It may be unreachable, blocked, or not a job listing.",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "BlockedUrlError") {
      response.status(400).json({ error: error.message, code: "INVALID_SOURCE_URL" });
      return;
    }
    next(error);
  }
});
