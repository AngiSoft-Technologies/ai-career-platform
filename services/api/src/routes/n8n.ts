import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { createHmac } from "node:crypto";
import { query } from "../db/pool.js";
import {
  triggerN8nWorkflow,
  getExecutionStatus,
  listWorkflows,
  setWorkflowActive,
  N8nTriggers,
} from "../services/n8n-integration.js";
import { n8nApiClient } from "../services/n8n-api-client.js";
import { requirePermission } from "../middleware/rbac.js";
import type {
  N8nWorkflowCreateInput,
  N8nWorkflowUpdateInput,
  N8nDeployInput,
  N8nDeployResult,
} from "@angisoft/job-radar-contracts";

export const n8nRouter = Router();

// Verify n8n webhook signature (if secret configured)
function verifyN8nWebhook(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const secret = config.N8N_API_KEY;
  if (!secret) return next();

  const signature = request.headers["x-n8n-signature"] as string | undefined;
  if (!signature) {
    response.status(401).json({ error: "Missing signature" });
    return;
  }

  const expected = createHmac("sha256", secret)
    .update(JSON.stringify(request.body))
    .digest("hex");

  if (signature !== expected) {
    response.status(401).json({ error: "Invalid signature" });
    return;
  }

  next();
}

// =========================================================================
// n8n -> API callbacks (n8n calls these endpoints)
// =========================================================================

n8nRouter.post("/callback/job-processed", verifyN8nWebhook, async (request, response, next) => {
  try {
    const { jobId, status, enrichedData, error } = request.body;
    logger.info({ jobId, status }, "n8n callback: job processed");
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

n8nRouter.post("/callback/candidate-matched", verifyN8nWebhook, async (request, response, next) => {
  try {
    const { candidateId, matches } = request.body;
    logger.info({ candidateId, matchCount: matches?.length }, "n8n callback: candidate matched");
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

n8nRouter.post("/callback/documents-generated", verifyN8nWebhook, async (request, response, next) => {
  try {
    const { applicationId, cvUrl, coverLetterUrl, status, error } = request.body;
    logger.info({ applicationId, status }, "n8n callback: documents generated");
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

n8nRouter.post("/callback/followup-sent", verifyN8nWebhook, async (request, response, next) => {
  try {
    const { followUpId, status, error } = request.body;
    logger.info({ followUpId, status }, "n8n callback: follow-up sent");
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

n8nRouter.post("/callback/source-health", verifyN8nWebhook, async (request, response, next) => {
  try {
    const { sourceId, healthy, lastChecked, error } = request.body;
    logger.info({ sourceId, healthy }, "n8n callback: source health check");
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// =========================================================================
// API -> n8n triggers (API calls these to trigger n8n workflows)
// =========================================================================

n8nRouter.post("/trigger/job-scraped", async (request, response, next) => {
  try {
    const result = await N8nTriggers.jobScraped(request.body);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

n8nRouter.post("/trigger/candidate-applied", async (request, response, next) => {
  try {
    const result = await N8nTriggers.candidateApplied(request.body);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

n8nRouter.post("/trigger/scheduled-job-sync", async (request, response, next) => {
  try {
    const result = await N8nTriggers.scheduledJobSync(request.body);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

n8nRouter.post("/trigger/candidate-match", async (request, response, next) => {
  try {
    const result = await N8nTriggers.candidateMatch(request.body);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

n8nRouter.post("/trigger/generate-documents", async (request, response, next) => {
  try {
    const result = await N8nTriggers.documentGeneration(request.body);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

n8nRouter.post("/trigger/schedule-followup", async (request, response, next) => {
  try {
    const result = await N8nTriggers.followUpScheduled(request.body);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

n8nRouter.post("/trigger/source-health-check", async (request, response, next) => {
  try {
    const result = await N8nTriggers.sourceHealthCheck(request.body);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

n8nRouter.post("/trigger/candidate-enrichment", async (request, response, next) => {
  try {
    const result = await N8nTriggers.candidateEnrichment(request.body);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

n8nRouter.post("/trigger/job-enrichment", async (request, response, next) => {
  try {
    const result = await N8nTriggers.jobEnrichment(request.body);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

// =========================================================================
// Workflow Management (CRUD + Deploy)
// =========================================================================

const createWorkflowSchema = z.object({
  name: z.string().min(1).max(255),
  displayName: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  category: z.enum([
    "job-processing",
    "candidate-processing",
    "document-generation",
    "enrichment",
    "monitoring",
    "automation",
    "notification",
    "integration",
    "other",
  ]),
  tags: z.array(z.string().max(50)).max(20).optional(),
  definition: z.object({
    name: z.string(),
    displayName: z.string().optional(),
    nodes: z.array(z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
      typeVersion: z.number().optional(),
      position: z.tuple([z.number(), z.number()]),
      parameters: z.record(z.string(), z.unknown()),
      credentials: z.record(z.string(), z.string()).optional(),
      disabled: z.boolean().optional(),
      notes: z.string().optional(),
      notesInFlow: z.boolean().optional(),
      executeOnce: z.boolean().optional(),
      alwaysOutputData: z.boolean().optional(),
      continueOnFail: z.boolean().optional(),
    })).min(1),
    connections: z.record(z.string(), z.object({
      main: z.array(z.array(z.object({
        node: z.string(),
        type: z.string().optional(),
        index: z.number().optional(),
      }))).optional(),
      branch: z.array(z.array(z.object({
        node: z.string(),
        type: z.string().optional(),
        index: z.number().optional(),
      }))).optional(),
    })).optional(),
    active: z.boolean().optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
    tags: z.array(z.string()).optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
  }),
  changelog: z.string().max(1000).optional(),
});

const updateWorkflowSchema = z.object({
  displayName: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  category: z.enum([
    "job-processing",
    "candidate-processing",
    "document-generation",
    "enrichment",
    "monitoring",
    "automation",
    "notification",
    "integration",
    "other",
  ]).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  definition: z.object({
    name: z.string(),
    displayName: z.string().optional(),
    nodes: z.array(z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
      typeVersion: z.number().optional(),
      position: z.tuple([z.number(), z.number()]),
      parameters: z.record(z.string(), z.unknown()),
      credentials: z.record(z.string(), z.string()).optional(),
      disabled: z.boolean().optional(),
      notes: z.string().optional(),
      notesInFlow: z.boolean().optional(),
      executeOnce: z.boolean().optional(),
      alwaysOutputData: z.boolean().optional(),
      continueOnFail: z.boolean().optional(),
    })).optional(),
    connections: z.record(z.string(), z.object({
      main: z.array(z.array(z.object({
        node: z.string(),
        type: z.string().optional(),
        index: z.number().optional(),
      }))).optional(),
      branch: z.array(z.array(z.object({
        node: z.string(),
        type: z.string().optional(),
        index: z.number().optional(),
      }))).optional(),
    })).optional(),
    active: z.boolean().optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
    tags: z.array(z.string()).optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
  isActive: z.boolean().optional(),
  changelog: z.string().max(1000).optional(),
});

const deployWorkflowSchema = z.object({
  version: z.number().int().positive().optional(),
  changelog: z.string().max(1000).optional(),
  force: z.boolean().default(false),
});

const webhookRegistrationSchema = z.object({
  path: z.string().min(1).max(255).regex(/^\/[a-zA-Z0-9\-\/_]*$/),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
  isActive: z.boolean().default(true),
});

// =========================================================================
// Workflow CRUD
// =========================================================================

n8nRouter.get("/workflows", requirePermission("analytics:read"), async (request, response, next) => {
  try {
    const { page = "1", pageSize = "20", category, isActive, tags, search } = request.query;
    const workflows = await n8nApiClient.listWorkflows({
      limit: Number(pageSize),
      offset: (Number(page) - 1) * Number(pageSize),
    });
    response.json({
      items: workflows.data,
      total: workflows.data.length,
      page: Number(page),
      pageSize: Number(pageSize),
    });
  } catch (error) {
    next(error);
  }
});

n8nRouter.get("/workflows/:id", requirePermission("analytics:read"), async (request, response, next) => {
  try {
    const workflowId = z.string().min(1).parse(request.params.id);
    const workflow = await n8nApiClient.getWorkflow(workflowId);
    response.json(workflow);
  } catch (error) {
    next(error);
  }
});

n8nRouter.post("/workflows", requirePermission("settings:write"), async (request, response, next) => {
  try {
    const input = createWorkflowSchema.parse(request.body);
    const n8nWorkflow = await n8nApiClient.createWorkflow({
      name: input.name,
      displayName: input.displayName,
      nodes: input.definition.nodes,
      connections: input.definition.connections,
      active: input.definition.active,
      settings: input.definition.settings,
      tags: input.tags,
    });
    const result = await query(
      `INSERT INTO n8n_workflows (name, display_name, description, category, tags, definition, version, changelog, n8n_workflow_id, created_by, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, $9, $10)
       RETURNING *`,
      [
        input.name,
        input.displayName,
        input.description ?? null,
        input.category,
        input.tags ?? [],
        JSON.stringify(input.definition),
        input.changelog ?? null,
        n8nWorkflow.id,
        (request as any).user?.id ?? null,
        false,
      ]
    );
    response.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      response.status(400).json({ error: "Invalid input", details: error.flatten() });
      return;
    }
    next(error);
  }
});

n8nRouter.patch("/workflows/:id", requirePermission("settings:write"), async (request, response, next) => {
  try {
    const input = updateWorkflowSchema.parse(request.body);
    const id = z.string().min(1).parse(request.params.id);

    if (input.definition) {
      await n8nApiClient.updateWorkflow(id, {
        name: input.displayName,
        displayName: input.displayName,
        nodes: input.definition.nodes,
        connections: input.definition.connections,
        active: input.definition.active,
        settings: input.definition.settings,
        tags: input.tags,
      });
    }

    const updates: string[] = [];
    const values: unknown[] = [id];
    let paramIndex = 2;

    if (input.displayName) {
      updates.push(`display_name = $${paramIndex++}`);
      values.push(input.displayName);
    }
    if (input.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(input.description);
    }
    if (input.category) {
      updates.push(`category = $${paramIndex++}`);
      values.push(input.category);
    }
    if (input.tags) {
      updates.push(`tags = $${paramIndex++}`);
      values.push(input.tags);
    }
    if (input.definition) {
      updates.push(`definition = $${paramIndex++}`);
      values.push(JSON.stringify(input.definition));
    }
    if (input.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(input.isActive);
    }
    if (input.changelog) {
      updates.push(`changelog = $${paramIndex++}`);
      values.push(input.changelog);
      const current = await query(
        `SELECT version, definition FROM n8n_workflows WHERE id = $1`,
        [id]
      );
      if (current.rows[0]) {
        await query(
          `INSERT INTO n8n_workflow_versions (workflow_id, version, definition, changelog, created_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, current.rows[0].version, current.rows[0].definition, input.changelog, (request as any).user?.id]
        );
        updates.push(`version = version + 1`);
      }
    }

    if (updates.length === 0) {
      response.status(400).json({ error: "No valid updates provided" });
      return;
    }

    updates.push(`updated_at = now()`);
    const result = await query(
      `UPDATE n8n_workflows SET ${updates.join(", ")} WHERE id = $1 RETURNING *`,
      values
    );

    if (result.rowCount === 0) {
      response.status(404).json({ error: "Workflow not found" });
      return;
    }

    response.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      response.status(400).json({ error: "Invalid input", details: error.flatten() });
      return;
    }
    next(error);
  }
});

n8nRouter.delete("/workflows/:id", requirePermission("settings:write"), async (request, response, next) => {
  try {
    const id = z.string().min(1).parse(request.params.id);
    await n8nApiClient.deleteWorkflow(id);
    await query(`UPDATE n8n_workflows SET is_deleted = true, updated_at = now() WHERE id = $1`, [id]);
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// =========================================================================
// Workflow Deployment
// =========================================================================

n8nRouter.post("/workflows/:id/deploy", requirePermission("settings:write"), async (request, response, next) => {
  try {
    const { id } = request.params;
    const input = deployWorkflowSchema.parse(request.body);
    const userId = (request as any).user?.id;

    const workflowResult = await query(
      `SELECT * FROM n8n_workflows WHERE id = $1 AND is_deleted = false`,
      [id]
    );
    if (workflowResult.rowCount === 0) {
      response.status(404).json({ error: "Workflow not found" });
      return;
    }

    const workflow = workflowResult.rows[0];
    if (!workflow) {
      response.status(404).json({ error: "Workflow not found" });
      return;
    }
    const targetVersion = input.version ?? workflow.version;

    const deploymentResult = await query(
      `INSERT INTO n8n_workflow_deployments (workflow_id, version, deployed_by, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [id, targetVersion, userId]
    );
    const deployment = deploymentResult.rows[0];
    if (!deployment) {
      response.status(500).json({ error: "Deployment could not be recorded" });
      return;
    }

    try {
      let n8nWorkflowId: string | null = workflow.n8n_workflow_id;

      if (!n8nWorkflowId || input.force) {
        if (n8nWorkflowId && !input.force) {
          await n8nApiClient.updateWorkflow(n8nWorkflowId, {
            name: workflow.name,
            displayName: workflow.display_name,
            nodes: workflow.definition.nodes,
            connections: workflow.definition.connections,
            active: true,
            settings: workflow.definition.settings,
            tags: workflow.tags,
          });
        } else {
          const created = await n8nApiClient.createWorkflow({
            name: workflow.name,
            displayName: workflow.display_name,
            nodes: workflow.definition.nodes,
            connections: workflow.definition.connections,
            active: true,
            settings: workflow.definition.settings,
            tags: workflow.tags,
          });
          n8nWorkflowId = created.id;
        }

        if (n8nWorkflowId) {
          await n8nApiClient.activateWorkflow(n8nWorkflowId);
        }

        await query(
          `UPDATE n8n_workflows
           SET n8n_workflow_id = $2, deployed_at = now(), deployed_by = $3, is_active = true, updated_at = now()
           WHERE id = $1`,
        [id, n8nWorkflowId, userId]
        );

        await query(
          `INSERT INTO n8n_workflow_versions (workflow_id, version, definition, changelog, created_by, deployed_at, deployed_by)
           VALUES ($1, $2, $3, $4, $5, now(), $5)`,
        [id, workflow.version, JSON.stringify(workflow.definition), input.changelog ?? null, userId]
        );
      }

      await query(
        `UPDATE n8n_workflow_deployments
         SET status = 'success', n8n_workflow_id = $2, n8n_version_id = $3, completed_at = now()
         WHERE id = $1`,
      [deployment.id, n8nWorkflowId, workflow.n8n_version_id]
      );

      const result = {
        id: deployment.id,
        workflowId: id,
        version: workflow.version,
        n8nWorkflowId,
        n8nVersionId: workflow.n8n_version_id,
        status: "success" as const,
        deployedAt: deployment.deployed_at,
        completedAt: new Date().toISOString(),
      };

      response.json(result);
    } catch (error: unknown) {
      await query(
        `UPDATE n8n_workflow_deployments
         SET status = 'failed', error_message = $2, completed_at = now()
         WHERE id = $1`,
      [deployment.id, error instanceof Error ? error.message : String(error)]
      );

      logger.error({ workflowId: id, error }, "Workflow deployment failed");
      response.status(500).json({
        error: "Deployment failed",
        deploymentId: deployment.id,
      });
    }
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      response.status(400).json({ error: "Invalid input", details: error.flatten() });
      return;
    }
    next(error);
  }
});

// Rollback deployment
n8nRouter.post("/workflows/:id/rollback", requirePermission("settings:write"), async (request, response, next) => {
  try {
    const { id } = request.params;
    const { version } = z.object({ version: z.number().int().positive() }).parse(request.body);
    const userId = (request as any).user?.id;

    const versionResult = await query(
      `SELECT * FROM n8n_workflow_versions WHERE workflow_id = $1 AND version = $2`,
      [id, version]
    );
    if (versionResult.rowCount === 0) {
      response.status(404).json({ error: "Version not found" });
      return;
    }

    const targetVersion = versionResult.rows[0];
    if (!targetVersion) {
      response.status(404).json({ error: "Version not found" });
      return;
    }

    const deploymentResult = await query(
      `INSERT INTO n8n_workflow_deployments (workflow_id, version, deployed_by, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [id, version, userId]
    );
    const deployment = deploymentResult.rows[0];
    if (!deployment) {
      response.status(500).json({ error: "Deployment could not be recorded" });
      return;
    }

    try {
      await n8nApiClient.updateWorkflow(targetVersion.n8n_workflow_id ?? (await n8nApiClient.getWorkflow(targetVersion.n8n_workflow_id)).id, {
        nodes: targetVersion.definition.nodes,
        connections: targetVersion.definition.connections,
        active: true,
        settings: targetVersion.definition.settings,
        tags: targetVersion.definition.tags,
      });

      await query(
        `UPDATE n8n_workflows
         SET definition = $2, version = $3, deployed_at = now(), deployed_by = $4, updated_at = now()
         WHERE id = $1`,
        [id, JSON.stringify(targetVersion.definition), version, userId]
      );

      await query(
        `UPDATE n8n_workflow_deployments
         SET status = 'rolled_back', completed_at = now()
         WHERE id = $1`,
        [deployment.id]
      );

      response.json({ ok: true, rolledBackToVersion: version });
    } catch (error) {
      await query(
        `UPDATE n8n_workflow_deployments
         SET status = 'failed', error_message = $2, completed_at = now()
         WHERE id = $1`,
        [deployment.id, error instanceof Error ? error.message : String(error)]
      );
      throw error;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      response.status(400).json({ error: "Invalid input", details: error.flatten() });
      return;
    }
    next(error);
  }
});

// List workflow versions
n8nRouter.get("/workflows/:id/versions", requirePermission("analytics:read"), async (request, response, next) => {
  try {
    const { id } = request.params;
    const result = await query(
      `SELECT * FROM n8n_workflow_versions WHERE workflow_id = $1 ORDER BY version DESC`,
      [id]
    );
    response.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Get workflow deployment history
n8nRouter.get("/workflows/:id/deployments", requirePermission("analytics:read"), async (request, response, next) => {
  try {
    const { id } = request.params;
    const result = await query(
      `SELECT * FROM n8n_workflow_deployments WHERE workflow_id = $1 ORDER BY deployed_at DESC`,
      [id]
    );
    response.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Webhook registration
n8nRouter.post("/workflows/:id/webhooks", requirePermission("settings:write"), async (request, response, next) => {
  try {
    const id = z.string().min(1).parse(request.params.id);
    const input = webhookRegistrationSchema.parse(request.body);
    const webhook = await n8nApiClient.createWebhook(id, input.path, input.method);

    const result = await query(
      `INSERT INTO n8n_webhooks (workflow_id, path, method, is_active)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (path) DO UPDATE SET method = $3, is_active = $4, updated_at = now()
       RETURNING *`,
      [id, input.path, input.method, input.isActive]
    );

    response.json(webhook);
  } catch (error) {
    if (error instanceof z.ZodError) {
      response.status(400).json({ error: "Invalid input", details: error.flatten() });
      return;
    }
    next(error);
  }
});

// List webhooks for workflow
n8nRouter.get("/workflows/:id/webhooks", requirePermission("analytics:read"), async (request, response, next) => {
  try {
    const { id } = request.params;
    const result = await query(
      `SELECT * FROM n8n_webhooks WHERE workflow_id = $1`,
      [id]
    );
    response.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Delete webhook
n8nRouter.delete("/workflows/:id/webhooks/:webhookId", requirePermission("settings:write"), async (request, response, next) => {
  try {
    const id = z.string().min(1).parse(request.params.id);
    const webhookId = z.string().min(1).parse(request.params.webhookId);
    await n8nApiClient.deleteWebhook(id, webhookId);
    await query(`DELETE FROM n8n_webhooks WHERE id = $1 AND workflow_id = $2`, [webhookId, id]);
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// =========================================================================
// Existing trigger endpoints (kept for backward compatibility)
// =========================================================================

n8nRouter.post("/trigger/job-scraped", async (request, response, next) => {
  try {
    const result = await N8nTriggers.jobScraped(request.body);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

n8nRouter.post("/trigger/candidate-applied", async (request, response, next) => {
  try {
    const result = await N8nTriggers.candidateApplied(request.body);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

n8nRouter.post("/trigger/scheduled-job-sync", async (request, response, next) => {
  try {
    const result = await N8nTriggers.scheduledJobSync(request.body);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

n8nRouter.post("/trigger/candidate-match", async (request, response, next) => {
  try {
    const result = await N8nTriggers.candidateMatch(request.body);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

n8nRouter.post("/trigger/generate-documents", async (request, response, next) => {
  try {
    const result = await N8nTriggers.documentGeneration(request.body);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

n8nRouter.post("/trigger/schedule-followup", async (request, response, next) => {
  try {
    const result = await N8nTriggers.followUpScheduled(request.body);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

n8nRouter.post("/trigger/source-health-check", async (request, response, next) => {
  try {
    const result = await N8nTriggers.sourceHealthCheck(request.body);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

n8nRouter.post("/trigger/candidate-enrichment", async (request, response, next) => {
  try {
    const result = await N8nTriggers.candidateEnrichment(request.body);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

n8nRouter.post("/trigger/job-enrichment", async (request, response, next) => {
  try {
    const result = await N8nTriggers.jobEnrichment(request.body);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

// Workflow management (legacy)
n8nRouter.get("/workflows", async (_request, response, next) => {
  try {
    const workflows = await listWorkflows();
    response.json(workflows);
  } catch (error) {
    next(error);
  }
});

n8nRouter.post("/workflows/:id/activate", async (request, response, next) => {
  try {
    await setWorkflowActive(request.params.id, true);
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

n8nRouter.post("/workflows/:id/deactivate", async (request, response, next) => {
  try {
    await setWorkflowActive(request.params.id, false);
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

n8nRouter.get("/executions/:id", async (request, response, next) => {
  try {
    const execution = await getExecutionStatus(request.params.id);
    response.json(execution);
  } catch (error) {
    next(error);
  }
});

// Health check
n8nRouter.get("/health", (_request, response) => {
  response.json({ ok: true, service: "n8n-integration" });
});

export default n8nRouter;