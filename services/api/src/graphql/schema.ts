import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSchema } from "graphql-yoga";
import {
  createApplication,
  getApplicationBlueprint,
  listApplications,
  updateApplicationStatus,
} from "../services/applications.js";
import { getCompanyBySlug, listCompanies, listProfessions } from "../services/catalog.js";
import { listFollowUps } from "../services/followups.js";
import { listDocuments } from "../services/documents.js";
import { validateDocumentForAts } from "../services/documents/validate.js";
import { isAiConfigured } from "../services/ai/client.js";
import {
  getOpportunityWithMatch,
  rankedOpportunities,
} from "../services/matching.js";
import { getProfile, updateProfile } from "../services/profile.js";
import { query } from "../db/pool.js";

export interface GraphQLContext {
  userId: string;
}

const typeDefs = readFileSync(
  resolve(process.cwd(), "../../packages/contracts/graphql/schema.graphql"),
  "utf8",
);

async function getDocument(
  userId: string,
  id: string,
): Promise<{
  id: string;
  opportunityId: string | null;
  type: string;
  title: string;
  content: string;
  createdAt: string;
} | null> {
  const result = await query<{
    id: string;
    opportunity_id: string | null;
    type: string;
    title: string;
    content: string;
    created_at: Date;
  }>(
    `SELECT id, opportunity_id, type, title, content, created_at
       FROM documents
      WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    type: row.type,
    title: row.title,
    content: row.content,
    createdAt: row.created_at.toISOString(),
  };
}

async function getApplicationById(userId: string, id: string) {
  const applications = await listApplications(userId);
  return applications.find((application) => application.id === id) ?? null;
}

export const schema = createSchema<GraphQLContext>({
  typeDefs,
  resolvers: {
    Query: {
      profile: (_parent, _args, context) => getProfile(context.userId),
      opportunities: (
        _parent,
        args: {
          country?: string;
          q?: string;
          workMode?: string;
          seniority?: string;
          semantic?: boolean;
          limit?: number;
        },
        context,
      ) =>
        rankedOpportunities(context.userId, {
          country: args.country,
          q: args.q,
          workMode: args.workMode,
          seniority: args.seniority,
          semantic: args.semantic ?? false,
          limit: args.limit ?? 25,
        }),
      opportunity: (_parent, args: { id: string }, context) =>
        getOpportunityWithMatch(context.userId, args.id),
      matches: (_parent, args: { limit?: number }, context) =>
        rankedOpportunities(context.userId, {
          semantic: false,
          limit: args.limit ?? 25,
        }),
      applicationWorkspace: (_parent, args: { id: string }, context) =>
        getApplicationBlueprint(context.userId, args.id),
      applications: (_parent, _args, context) => listApplications(context.userId),
      application: (_parent, args: { id: string }, context) =>
        getApplicationById(context.userId, args.id),
      followups: (_parent, args: { status?: string }, context) =>
        listFollowUps(context.userId, args.status),
      documents: (_parent, args: { opportunityId?: string }, context) =>
        listDocuments(context.userId, args.opportunityId),
      document: (_parent, args: { id: string }, context) =>
        getDocument(context.userId, args.id),
      companies: (_parent, args: { q?: string; limit?: number }) =>
        listCompanies({ q: args.q, limit: args.limit }),
      company: (_parent, args: { slug: string }) => getCompanyBySlug(args.slug),
      professions: (_parent, args: { depth?: number }) => listProfessions(args.depth),
      validateDocument: async (
        _parent,
        args: { content: string },
        context,
      ) => {
        const report = await validateDocumentForAts(context.userId, args.content, []);
        return {
          score: report.score,
          grade: report.grade,
          issues: report.issues.map((issue) => `${issue.severity.toUpperCase()}: ${issue.message}`),
        };
      },
      aiStatus: () => ({
        configured: isAiConfigured(),
        mode: process.env.AI_PROVIDER ?? "auto",
      }),
    },
    Mutation: {
      createApplication: (
        _parent,
        args: { opportunityId: string; status?: string },
        context,
      ) =>
        createApplication(
          context.userId,
          args.opportunityId,
          (args.status as never) ?? "SHORTLISTED",
        ),
      updateApplicationStatus: (
        _parent,
        args: { id: string; status: string; version: number },
        context,
      ) => updateApplicationStatus(context.userId, args.id, args.status as never, args.version),
      updateProfile: (_parent, args: { input: Record<string, unknown> }, context) =>
        updateProfile(context.userId, args.input),
      saveDocument: async (
        _parent,
        args: { id: string; title?: string; content?: string },
        context,
      ) => {
        const result = await query(
          `UPDATE documents
              SET title = COALESCE($3, title),
                  content = COALESCE($4, content),
                  updated_at = now()
            WHERE id = $1 AND user_id = $2
            RETURNING id, opportunity_id, type, title, content, created_at`,
          [args.id, context.userId, args.title ?? null, args.content ?? null],
        );
        const row = result.rows[0];
        if (!row) throw new Error("Document not found");
        return {
          id: row.id,
          opportunityId: row.opportunity_id,
          type: row.type,
          title: row.title,
          content: row.content,
          createdAt: row.created_at.toISOString(),
        };
      },
      validateDocument: async (
        _parent,
        args: { content: string },
        context,
      ) => {
        const report = await validateDocumentForAts(context.userId, args.content, []);
        return {
          score: report.score,
          grade: report.grade,
          issues: report.issues.map((issue) => `${issue.severity.toUpperCase()}: ${issue.message}`),
        };
      },
    },
  },
});
