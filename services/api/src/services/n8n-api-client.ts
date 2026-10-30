import { config } from "../config.js";
import { logger } from "../logger.js";
import type {
  N8nWorkflow,
  N8nWorkflowVersion,
  N8nWorkflowDeployment,
  N8nWebhook,
  N8nExecutionResult,
  N8nWorkflowTrigger,
  N8nWorkflowTriggerResult,
  N8nWorkflowMetadata,
  N8nWorkflowListItem,
  N8nWorkflowCreateInput,
  N8nWorkflowUpdateInput,
  N8nDeployInput,
  N8nDeployResult,
  N8nExecutionStatus,
  N8nWorkflowListResponse,
  N8nWebhookRegistration,
} from "@angisoft/job-radar-contracts";

export class N8nApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "N8nApiError";
  }
}

interface N8nRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string>;
}

class N8nApiClient {
  private baseUrl: string;
  private apiKey: string | undefined;
  private webhookBase: string;

  constructor() {
    const baseUrl = config.N8N_API_URL?.replace(/\/$/, "") ?? "";
    const webhookBase = config.N8N_WEBHOOK_URL?.replace(/\/$/, "") ?? "";
    
    if (!baseUrl && !process.env.N8N_API_URL && !process.env.N8N_WEBHOOK_URL) {
      logger.warn("n8n API URL not configured");
    }
    
    this.baseUrl = baseUrl;
    this.webhookBase = webhookBase;
    this.apiKey = config.N8N_API_KEY;
  }

  private getBaseUrl(): string {
    if (!this.baseUrl) {
      throw new Error("n8n API URL not configured");
    }
    return this.baseUrl;
  }

  private getWebhookBase(): string {
    if (!this.webhookBase) {
      throw new Error("n8n webhook URL not configured");
    }
    return this.webhookBase;
  }

  private async request<T>(
    path: string,
    options: N8nRequestOptions = {},
  ): Promise<T> {
    const baseUrl = this.getBaseUrl();
    const url = new URL(path, baseUrl);
    
    if (options.query) {
      Object.entries(options.query).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url.toString(), {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      let errorDetails: Record<string, unknown> | undefined;
      try {
        errorDetails = JSON.parse(errorText);
      } catch {}

      throw new N8nApiError(
        `n8n request failed: ${response.status} ${errorText}`,
        "N8N_REQUEST_FAILED",
        response.status,
        errorDetails,
      );
    }

    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      return response.json() as Promise<T>;
    }
    return response.text() as Promise<T>;
  }

  // =========================================================================
  // Workflow CRUD
  // =========================================================================

  /**
   * Create a new workflow in n8n
   */
  async createWorkflow(workflow: {
    name: string;
    displayName: string;
    nodes: unknown[];
    connections?: Record<string, unknown>;
    active?: boolean;
    settings?: Record<string, unknown>;
    tags?: string[];
  }): Promise<{ id: string; name: string }> {
    return this.request<{ id: string; name: string }>("/workflows", {
      method: "POST",
      body: {
        name: workflow.name,
        displayName: workflow.displayName,
        nodes: workflow.nodes,
        connections: workflow.connections,
        active: workflow.active ?? false,
        settings: workflow.settings,
        tags: workflow.tags,
      },
    });
  }

  /**
   * Get workflow by ID
   */
  async getWorkflow(id: string): Promise<{
    id: string;
    name: string;
    displayName: string;
    nodes: unknown[];
    connections: Record<string, unknown>;
    active: boolean;
    settings: Record<string, unknown>;
    tags: string[];
    versionId: string;
    updatedAt: string;
  }> {
    return this.request(`/workflows/${id}`);
  }

  /**
   * Update workflow
   */
  async updateWorkflow(
    id: string,
    updates: {
      name?: string;
      displayName?: string;
      nodes?: unknown[];
      connections?: Record<string, unknown>;
      active?: boolean;
      settings?: Record<string, unknown>;
      tags?: string[];
    }
  ): Promise<{ id: string; name: string }> {
    return this.request(`/workflows/${id}`, {
      method: "PUT",
      body: updates,
    });
  }

  /**
   * Delete workflow
   */
  async deleteWorkflow(id: string): Promise<void> {
    await this.request(`/workflows/${id}`, {
      method: "DELETE",
    });
  }

  /**
   * List workflows
   */
  async listWorkflows(params?: {
    limit?: number;
    offset?: number;
    active?: boolean;
    tags?: string[];
  }): Promise<{
    data: Array<{
      id: string;
      name: string;
      displayName: string;
      active: boolean;
      tags: string[];
      updatedAt: string;
    }>;
    nextCursor?: string;
  }> {
    const query: Record<string, string> = {};
    if (params?.limit) query.limit = String(params.limit);
    if (params?.offset) query.offset = String(params.offset);
    if (params?.active !== undefined) query.active = String(params.active);
    if (params?.tags) query.tags = params.tags.join(",");

    return this.request("/workflows", { query });
  }

  // =========================================================================
  // Workflow Activation/Deactivation
  // =========================================================================

  async activateWorkflow(id: string): Promise<void> {
    await this.request(`/workflows/${id}/activate`, {
      method: "POST",
    });
  }

  async deactivateWorkflow(id: string): Promise<void> {
    await this.request(`/workflows/${id}/deactivate`, {
      method: "POST",
    });
  }

  // =========================================================================
  // Workflow Execution
  // =========================================================================

  async executeWorkflow(workflowId: string, data?: Record<string, unknown>, options?: {
    waitForCompletion?: boolean;
    timeoutMs?: number;
  }): Promise<{ executionId: string; status: string; data?: unknown }> {
    const webhookBase = config.N8N_WEBHOOK_URL?.replace(/\/$/, "") ?? "";
    if (!webhookBase) {
      throw new Error("n8n webhook URL not configured");
    }

    const response = await fetch(`${webhookBase}/webhook/${workflowId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data ?? {}),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`n8n webhook trigger failed: ${response.status} ${errorText}`);
    }

    return response.json();
  }

  async getExecutionStatus(executionId: string): Promise<{
    id: string;
    workflowId: string;
    status: "success" | "error" | "running" | "waiting" | "crashed";
    data?: Record<string, unknown>;
    error?: string;
    startedAt: string;
    finishedAt?: string;
  }> {
    return this.request(`/executions/${executionId}`);
  }

  async waitForExecution(
    executionId: string,
    timeoutMs = 300_000,
    pollIntervalMs = 2000
  ): Promise<{
    id: string;
    status: "success" | "error" | "running" | "waiting" | "crashed";
    data?: Record<string, unknown>;
    error?: string;
  }> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const execution = await this.getExecutionStatus(executionId);
      if (execution.status !== "running" && execution.status !== "waiting") {
        return execution;
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    throw new Error(`Execution timeout after ${timeoutMs}ms`);
  }

  // =========================================================================
  // Workflow Versions
  // =========================================================================

  async getWorkflowVersions(workflowId: string): Promise<Array<{
    id: string;
    version: number;
    createdAt: string;
    createdBy: string;
  }>> {
    return this.request(`/workflows/${workflowId}/versions`);
  }

  async getWorkflowVersion(workflowId: string, versionId: string): Promise<{
    id: string;
    version: number;
    workflow: Record<string, unknown>;
    createdAt: string;
    createdBy: string;
  }> {
    return this.request(`/workflows/${workflowId}/versions/${versionId}`);
  }

  // =========================================================================
  // Webhooks
  // =========================================================================

  async createWebhook(workflowId: string, path: string, method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"): Promise<{
    id: string;
    path: string;
    method: string;
    webhookUrl: string;
  }> {
    return this.request(`/workflows/${workflowId}/webhooks`, {
      method: "POST",
      body: { path, method },
    });
  }

  async deleteWebhook(workflowId: string, webhookId: string): Promise<void> {
    await this.request(`/workflows/${workflowId}/webhooks/${webhookId}`, {
      method: "DELETE",
    });
  }

  // =========================================================================
  // Tags
  // =========================================================================

  async listTags(): Promise<string[]> {
    return this.request("/tags");
  }

  async createTag(name: string): Promise<{ id: string; name: string }> {
    return this.request("/tags", {
      method: "POST",
      body: { name },
    });
  }

  // =========================================================================
  // Health Check
  // =========================================================================

  async healthCheck(): Promise<boolean> {
    try {
      await this.request("/healthz");
      return true;
    } catch {
      return false;
    }
  }
}

export const n8nApiClient = new N8nApiClient();

// Export class for testing/custom instances
export { N8nApiClient };

export default n8nApiClient;