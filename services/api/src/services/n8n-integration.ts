// n8n Integration Service for Job Radar API
// Triggers n8n workflows from the API

import { config } from "../config.js";
import { logger } from "../logger.js";

const N8N_WEBHOOK_BASE = config.N8N_WEBHOOK_URL?.replace(/\/$/, "") ?? "";
const N8N_API_BASE = config.N8N_API_URL?.replace(/\/$/, "") ?? "";

export interface N8nWorkflowTrigger {
  workflowId: string;
  data: Record<string, unknown>;
  options?: {
    waitForCompletion?: boolean;
    timeoutMs?: number;
  };
}

export interface N8nExecutionResult {
  executionId: string;
  status: "success" | "error" | "running" | "waiting";
  data?: Record<string, unknown>;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

export class N8nIntegrationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "N8nIntegrationError";
  }
}

async function n8nRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const baseUrl = N8N_API_BASE || N8N_WEBHOOK_BASE;
  if (!baseUrl) {
    throw new N8nIntegrationError(
      "n8n API URL not configured",
      "N8N_NOT_CONFIGURED",
    );
  }

  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  // Add auth if configured
  const authToken = process.env.N8N_API_KEY;
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new N8nIntegrationError(
      `n8n request failed: ${response.status} ${errorText}`,
      "N8N_REQUEST_FAILED",
      response.status,
    );
  }

  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return response.json() as Promise<T>;
  }
  return response.text() as Promise<T>;
}

/**
 * Trigger an n8n workflow via webhook
 */
export async function triggerN8nWorkflow(input: N8nWorkflowTrigger): Promise<N8nExecutionResult> {
  const { workflowId, data, options } = input;
  
  logger.info({ workflowId, hasData: !!data }, "Triggering n8n workflow");
  
  // Use webhook endpoint for triggering
  const webhookUrl = `${N8N_WEBHOOK_BASE}/webhook/${workflowId}`;
  
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    logger.error({ workflowId, status: response.status, error: errorText }, "n8n webhook trigger failed");
    throw new N8nIntegrationError(
      `n8n webhook failed: ${response.status} ${errorText}`,
      "N8N_WEBHOOK_FAILED",
      response.status,
    );
  }

  const result = await response.json().catch(() => ({})) as N8nExecutionResult;
  logger.info({ workflowId, executionId: result.executionId }, "n8n workflow triggered");
  
  return result;
}

/**
 * Get execution status
 */
export async function getExecutionStatus(executionId: string): Promise<N8nExecutionResult> {
  return n8nRequest<N8nExecutionResult>(`/executions/${executionId}`);
}

/**
 * List workflows
 */
export async function listWorkflows(): Promise<Array<{ id: string; name: string; active: boolean }>> {
  return n8nRequest<Array<{ id: string; name: string; active: boolean }>>("/workflows");
}

/**
 * Activate/Deactivate workflow
 */
export async function setWorkflowActive(workflowId: string, active: boolean): Promise<void> {
  await n8nRequest(`/workflows/${workflowId}`, {
    method: active ? "POST" : "DELETE",
    body: {},
  });
}

/**
 * Pre-built workflow triggers for Job Radar
 */
export const N8nTriggers = {
  /** Trigger when new job is scraped/fetched */
  async jobScraped(data: {
    jobId: string;
    sourceId: string;
    rawData: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }) {
    return triggerN8nWorkflow({
      workflowId: "job-scraped",
      data,
    });
  },

  /** Trigger when candidate applies */
  async candidateApplied(data: {
    applicationId: string;
    candidateId: string;
    jobId: string;
    matchScore?: number;
  }) {
    return triggerN8nWorkflow({
      workflowId: "candidate-applied",
      data,
    });
  },

  /** Trigger for scheduled job sync */
  async scheduledJobSync(data: {
    sourceIds?: string[];
    fullSync?: boolean;
  }) {
    return triggerN8nWorkflow({
      workflowId: "scheduled-job-sync",
      data,
    });
  },

  /** Trigger for candidate matching */
  async candidateMatch(data: {
    candidateId: string;
    jobIds: string[];
    threshold?: number;
  }) {
    return triggerN8nWorkflow({
      workflowId: "candidate-match",
      data,
    });
  },

  /** Trigger for document generation */
  async documentGeneration(data: {
    applicationId: string;
    templateType: "cv" | "cover_letter" | "both";
    customizations?: Record<string, unknown>;
  }) {
    return triggerN8nWorkflow({
      workflowId: "generate-documents",
      data,
    });
  },

  /** Trigger for follow-up scheduling */
  async followUpScheduled(data: {
    applicationId: string;
    followUpType: "email" | "call" | "linkedin";
    scheduledAt: string;
    templateId?: string;
  }) {
    return triggerN8nWorkflow({
      workflowId: "schedule-followup",
      data,
    });
  },

  /** Trigger for source health check */
  async sourceHealthCheck(data: {
    sourceId: string;
    url: string;
    expectedFields?: string[];
  }) {
    return triggerN8nWorkflow({
      workflowId: "source-health-check",
      data,
    });
  },

  /** Trigger for candidate enrichment */
  async candidateEnrichment(data: {
    candidateId: string;
    sources: ("linkedin" | "github" | "portfolio" | "email")[];
  }) {
    return triggerN8nWorkflow({
      workflowId: "candidate-enrichment",
      data,
    });
  },

  /** Trigger for job enrichment */
  async jobEnrichment(data: {
    jobId: string;
    enrichmentTypes: ("company" | "salary" | "skills" | "benefits")[];
  }) {
    return triggerN8nWorkflow({
      workflowId: "job-enrichment",
      data,
    });
  },
};

export default {
  triggerN8nWorkflow,
  getExecutionStatus,
  listWorkflows,
  setWorkflowActive,
  N8nTriggers,
};