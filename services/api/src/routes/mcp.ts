import { Router } from "express";
import { z } from "zod";
import {
  getAiProvider,
  isAiConfigured,
} from "../services/ai/client.js";
import { summariseOpportunity } from "../services/ai/insights.js";
import { getApplicationBlueprint } from "../services/applications.js";
import { getOpportunity, listOpportunities } from "../services/opportunities.js";
import { getProfile } from "../services/profile.js";
import { rankedOpportunities } from "../services/matching.js";

const PROTOCOL_VERSION = "2024-11-05";

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const tools: ToolDefinition[] = [
  {
    name: "search_jobs",
    description:
      "Search open job opportunities for the signed-in candidate, optionally filtered by country, work mode, seniority or free-text query. Returns roles with match scores.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Free-text search" },
        country: { type: "string", description: "Country filter" },
        workMode: {
          type: "string",
          enum: ["onsite", "hybrid", "remote"],
        },
        seniority: {
          type: "string",
          enum: ["intern", "junior", "mid", "senior", "lead"],
        },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
    },
  },
  {
    name: "get_job",
    description: "Get the full details of one job opportunity by id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
    },
  },
  {
    name: "get_profile",
    description:
      "Get the signed-in candidate profile: skills, seniority, location, desired roles.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "summarise_job",
    description:
      "Return an AI summary of a job opportunity with highlights and risks.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
    },
  },
  {
    name: "application_workspace",
    description:
      "Get the application blueprint for an application: method, platform, application url, required documents, fields and questions.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", format: "uuid" } },
      required: ["id"],
    },
  },
];

function textResult(payload: unknown): {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
} {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function errorResult(message: string): {
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
} {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

const uuidSchema = z.string().uuid();

async function callTool(
  name: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  switch (name) {
    case "search_jobs": {
      const limit = Number(args.limit ?? 20);
      const items = await rankedOpportunities(userId, {
        q: typeof args.q === "string" ? args.q : undefined,
        country: typeof args.country === "string" ? args.country : undefined,
        workMode:
          typeof args.workMode === "string" ? args.workMode : undefined,
        seniority:
          typeof args.seniority === "string" ? args.seniority : undefined,
        limit: Math.min(Math.max(limit, 1), 50),
      });
      return textResult({
        count: items.length,
        items: items.map((item) => ({
          id: item.id,
          title: item.title,
          company: item.companyName,
          location: `${item.city}, ${item.country}`,
          workMode: item.workMode,
          seniority: item.seniority,
          applyUrl: item.applyUrl,
          matchScore: item.match.score,
          explanation: item.match.explanation,
          gaps: item.match.gaps,
          skills: item.skills,
        })),
      });
    }
    case "get_job": {
      const id = uuidSchema.parse(args.id);
      const opportunity = await getOpportunity(id);
      if (!opportunity) return errorResult("OPPORTUNITY_NOT_FOUND");
      return textResult(opportunity);
    }
    case "get_profile": {
      const profile = await getProfile(userId);
      if (!profile) return errorResult("PROFILE_NOT_FOUND");
      return textResult(profile);
    }
    case "summarise_job": {
      const id = uuidSchema.parse(args.id);
      const opportunity = await getOpportunity(id);
      if (!opportunity) return errorResult("OPPORTUNITY_NOT_FOUND");
      if (!isAiConfigured()) {
        return textResult({
          summary: opportunity.description.slice(0, 280),
          highlights: opportunity.skills.slice(0, 5),
          risks: [],
          note: "AI provider not configured; returning raw description.",
        });
      }
      return textResult(await summariseOpportunity(opportunity));
    }
    case "application_workspace": {
      const id = uuidSchema.parse(args.id);
      const blueprint = await getApplicationBlueprint(userId, id);
      return textResult(blueprint);
    }
    default:
      return errorResult(`UNKNOWN_TOOL:${name}`);
  }
}

export const mcpRouter = Router();

mcpRouter.post("/", async (request, response) => {
  const body = request.body as JsonRpcRequest | JsonRpcRequest[];
  const requests = Array.isArray(body) ? body : [body];

  const results = await Promise.all(
    requests.map(async (rpc) => {
      const id = rpc.id ?? null;

      try {
        switch (rpc.method) {
          case "initialize":
            return {
              jsonrpc: "2.0",
              id,
              result: {
                protocolVersion: PROTOCOL_VERSION,
                capabilities: { tools: {} },
                serverInfo: { name: "job-radar", version: "1.0.0" },
              },
            };
          case "notifications/initialized":
            return null;
          case "ping":
            return { jsonrpc: "2.0", id, result: {} };
          case "tools/list":
            return { jsonrpc: "2.0", id, result: { tools } };
          case "tools/call": {
            const params = (rpc.params ?? {}) as {
              name?: string;
              arguments?: Record<string, unknown>;
            };
            if (!params.name) {
              return {
                jsonrpc: "2.0",
                id,
                error: { code: -32602, message: "Missing tool name" },
              };
            }
            const result = await callTool(
              params.name,
              params.arguments ?? {},
              response.locals.userId as string,
            );
            return { jsonrpc: "2.0", id, result };
          }
          default:
            return {
              jsonrpc: "2.0",
              id,
              error: {
                code: -32601,
                message: `Method not found: ${rpc.method}`,
              },
            };
        }
      } catch (error) {
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32603,
            message:
              error instanceof Error ? error.message : "Internal MCP error",
          },
        };
      }
    }),
  );

  const payload = results.filter((result) => result !== null);
  if (Array.isArray(body)) {
    response.json(payload);
    return;
  }
  response.json(payload[0] ?? { jsonrpc: "2.0", id: null, result: {} });
});

mcpRouter.get("/status", (_request, response) => {
  const provider = getAiProvider();
  response.json({
    protocolVersion: PROTOCOL_VERSION,
    tools: tools.map((tool) => tool.name),
    ai: provider ? provider.name : null,
  });
});
