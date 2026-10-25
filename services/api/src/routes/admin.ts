import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import {
  assignRole,
  getUserPermissions,
  getUserRoles,
  listAllPermissions,
  listAllRoles,
  removeRole,
} from "../services/rbac/index.js";
import { requirePermission } from "../middleware/rbac.js";

export const adminRouter = Router();

adminRouter.get("/stats", requirePermission("users:read"), async (_request, response, next) => {
  try {
    const [users, opportunities, applications, sources, docs, aiTasks, events] = await Promise.all([
      query<{ count: string }>("SELECT count(*)::text AS count FROM users"),
      query<{ count: string }>("SELECT count(*)::text AS count FROM opportunities WHERE status = 'active'"),
      query<{ count: string }>("SELECT count(*)::text AS count FROM applications"),
      query<{ count: string }>("SELECT count(*)::text AS count FROM job_sources"),
      query<{ count: string }>("SELECT count(*)::text AS count FROM documents"),
      query<{ count: string }>("SELECT count(*)::text AS count FROM ai_task_runs"),
      query<{ count: string }>("SELECT count(*)::text AS count FROM events WHERE occurred_at > now() - interval '24 hours'"),
    ]);

    const byCountry = await query(
      `SELECT country, count(*)::int AS count
         FROM opportunities WHERE status = 'active'
        GROUP BY country ORDER BY count DESC LIMIT 20`,
    );
    const bySource = await query(
      `SELECT type, count(*)::int AS count, sum(discovered_count)::int AS jobs
         FROM job_sources GROUP BY type ORDER BY count DESC`,
    );
    const risk = await query(
      `SELECT risk_action, count(*)::int AS count,
              round(avg(risk_score)::numeric, 3) AS avg_score
         FROM opportunities
        WHERE risk_score IS NOT NULL
        GROUP BY risk_action ORDER BY count DESC`,
    );
    const pipeline = await query(
      `SELECT status, count(*)::int AS count FROM opportunities GROUP BY status`,
    );

    response.json({
      totals: {
        users: Number(users.rows[0]?.count ?? 0),
        activeOpportunities: Number(opportunities.rows[0]?.count ?? 0),
        applications: Number(applications.rows[0]?.count ?? 0),
        sources: Number(sources.rows[0]?.count ?? 0),
        documents: Number(docs.rows[0]?.count ?? 0),
        aiTasks: Number(aiTasks.rows[0]?.count ?? 0),
        events24h: Number(events.rows[0]?.count ?? 0),
      },
      opportunitiesByCountry: byCountry.rows,
      sourcesByType: bySource.rows,
      riskDistribution: risk.rows,
      pipelineByStatus: pipeline.rows,
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/roles", requirePermission("users:read"), async (_request, response, next) => {
  try {
    const [roles, permissions] = await Promise.all([listAllRoles(), listAllPermissions()]);
    const assignment = await query(
      `SELECT u.id AS user_id, u.email, r.name AS role, ur.assigned_at, ur.expires_at
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         JOIN users u ON u.id = ur.user_id
        WHERE ur.is_active = true
        ORDER BY r.name, u.email`,
    );
    response.json({ roles, permissions, assignments: assignment.rows });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/roles/assign", requirePermission("roles:write"), async (request, response, next) => {
  try {
    const input = z
      .object({
        userId: z.string().uuid(),
        role: z.string().min(2).max(60),
        expiresAt: z.string().datetime().optional(),
      })
      .parse(request.body);

    await assignRole(
      input.userId,
      input.role,
      response.locals.userId as string,
      input.expiresAt ? new Date(input.expiresAt) : undefined,
    );

    const roles = await getUserRoles(input.userId);
    const permissions = await getUserPermissions(input.userId);
    response.json({ userId: input.userId, roles, permissions });
  } catch (error) {
    next(error);
  }
});

adminRouter.delete("/roles/:userId/:role", requirePermission("roles:write"), async (request, response, next) => {
  try {
    const userId = z.string().uuid().parse(request.params.userId);
    const role = z.string().min(2).max(60).parse(request.params.role);
    await removeRole(userId, role);
    const roles = await getUserRoles(userId);
    const permissions = await getUserPermissions(userId);
    response.json({ userId, roles, permissions });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/users", requirePermission("users:read"), async (request, response, next) => {
  try {
    const search = typeof request.query.q === "string" ? request.query.q : null;
    const result = await query(
      `SELECT u.id, u.email, u.display_name AS name, u.created_at,
              COALESCE(array_agg(r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
         FROM users u
         LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.is_active = true
         LEFT JOIN roles r ON r.id = ur.role_id
        WHERE ($1::text IS NULL OR u.email ILIKE '%' || $1 || '%')
        GROUP BY u.id
        ORDER BY u.created_at DESC
        LIMIT 200`,
      [search],
    );
    response.json({ items: result.rows, total: result.rowCount });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/taxonomy", requirePermission("users:read"), async (_request, response, next) => {
  try {
    const professions = await query(
      `SELECT id, slug, name, depth, mpath, domain, aliases, median_salary,
              currency, is_active, parent_id
         FROM profession_taxonomy ORDER BY depth, name`,
    );
    const closures = await query(
      `SELECT ancestor, descendant, depth FROM profession_closure ORDER BY depth`,
    );
    const linked = await query(
      `SELECT op.opportunity_id, p.slug, p.name, op.confidence
         FROM opportunity_professions op
         JOIN profession_taxonomy p ON p.id = op.profession_id
        LIMIT 200`,
    );
    response.json({
      professions: professions.rows,
      closures: closures.rows,
      opportunityLinks: linked.rows,
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/taxonomy", requirePermission("users:write"), async (request, response, next) => {
  try {
    const input = z
      .object({
        slug: z.string().min(2).max(80),
        name: z.string().min(2).max(120),
        parentId: z.string().uuid().nullable().optional(),
        domain: z.string().max(80).optional(),
        aliases: z.array(z.string().max(80)).max(30).optional(),
        medianSalary: z.number().int().min(0).optional(),
        currency: z.string().length(3).optional(),
      })
      .parse(request.body);

    let depth = 0;
    let mpath = "";
    if (input.parentId) {
      const parent = await query<{ depth: number; mpath: string }>(
        "SELECT depth, mpath FROM profession_taxonomy WHERE id = $1",
        [input.parentId],
      );
      const parentRow = parent.rows[0];
      if (!parentRow) {
        response.status(404).json({ error: "Parent profession not found" });
        return;
      }
      depth = parentRow.depth + 1;
      mpath = `${parentRow.mpath}.${input.slug}`;
    } else {
      mpath = input.slug;
    }

    const result = await query(
      `INSERT INTO profession_taxonomy (slug, name, parent_id, depth, mpath, domain, aliases, median_salary, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name,
         parent_id = EXCLUDED.parent_id, depth = EXCLUDED.depth,
         mpath = EXCLUDED.mpath, domain = EXCLUDED.domain,
         aliases = EXCLUDED.aliases, median_salary = EXCLUDED.median_salary,
         currency = EXCLUDED.currency
       RETURNING id, slug, name, depth, mpath, domain, aliases, parent_id`,
      [
        input.slug,
        input.name,
        input.parentId ?? null,
        depth,
        mpath,
        input.domain ?? "",
        input.aliases ?? [],
        input.medianSalary ?? null,
        input.currency ?? "USD",
      ],
    );

    const profession = result.rows[0];
    if (input.parentId && profession) {
      await query(
        `INSERT INTO profession_closure (ancestor, descendant, depth)
         VALUES ($1, $2, 1)
         ON CONFLICT (ancestor, descendant) DO NOTHING`,
        [input.parentId, profession.id],
      );
      await query(
        `INSERT INTO profession_closure (ancestor, descendant, depth)
         SELECT ancestor, $2, depth + 1 FROM profession_closure
          WHERE descendant = $1
         ON CONFLICT (ancestor, descendant) DO NOTHING`,
        [input.parentId, profession.id],
      );
      await query(
        `INSERT INTO profession_closure (ancestor, descendant, depth)
         VALUES ($1, $2, 0) ON CONFLICT (ancestor, descendant) DO NOTHING`,
        [profession.id, profession.id],
      );
    }

    response.status(201).json({ profession });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/scam-corpus", requirePermission("users:read"), async (_request, response, next) => {
  try {
    const result = await query(
      `SELECT id, simhash, label, sample_url, created_at
         FROM scam_signatures ORDER BY created_at DESC LIMIT 200`,
    );
    response.json({ items: result.rows, total: result.rowCount });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/scam-corpus", requirePermission("users:write"), async (request, response, next) => {
  try {
    const input = z
      .object({
        simhash: z.string().regex(/^-?\d+$/),
        label: z.string().min(2).max(120).default("scam_template"),
        sampleUrl: z.string().url().optional(),
      })
      .parse(request.body);

    const result = await query(
      `INSERT INTO scam_signatures (simhash, label, sample_url)
       VALUES ($1, $2, $3)
       RETURNING id, simhash, label, sample_url, created_at`,
      [input.simhash, input.label, input.sampleUrl ?? null],
    );

    response.status(201).json({ signature: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/event-stream", requirePermission("users:read"), async (request, response, next) => {
  try {
    const limit = Math.min(Number(request.query.limit ?? 100), 500);
    const result = await query(
      `SELECT id, type, aggregate_type, aggregate_id, payload, occurred_at
         FROM events ORDER BY id DESC LIMIT $1`,
      [limit],
    );
    response.json({ items: result.rows, total: result.rowCount });
  } catch (error) {
    next(error);
  }
});
