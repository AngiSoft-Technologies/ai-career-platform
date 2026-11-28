import { GraphQLError } from "graphql";
import { createSchema } from "graphql-yoga";
import { SCHEMA_SDL } from "./schema-sdl.js";
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
import {
  getPublicOpportunity,
  listPublicOpportunities,
} from "../services/opportunities.js";
import { getProfile, updateProfile } from "../services/profile.js";
import { updateDocumentAndInvalidatePreparation } from "../services/application/preparation.js";
import { query } from "../db/pool.js";

export interface GraphQLContext {
  userId: string;
  authenticated: boolean;
}

const typeDefs = SCHEMA_SDL;

/**
 * Public fields resolve without a session; everything tied to a person must
 * pass this guard. The HTTP handler no longer rejects every anonymous GraphQL
 * request in context, so mobile clients can read public roles without a token.
 */
function requireUser(context: GraphQLContext): string {
  if (!context.authenticated || !context.userId) {
    throw new GraphQLError("UNAUTHORIZED", {
      extensions: { code: "UNAUTHORIZED" },
    });
  }
  return context.userId;
}

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
  const page = await listApplications(userId);
  return page.items.find((application) => application.id === id) ?? null;
}

export const schema = createSchema<GraphQLContext>({
  typeDefs,
  resolvers: {
    Query: {
      profile: (_parent, _args, context) => getProfile(requireUser(context)),
      opportunities: async (
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
      ) => {
        const page = await rankedOpportunities(requireUser(context), {
          country: args.country,
          q: args.q,
          workMode: args.workMode,
          seniority: args.seniority,
          semantic: args.semantic ?? false,
          limit: args.limit ?? 25,
          offset: 0,
        });
        // GraphQL fields are lists; the ranked query is a page. Returning
        // the page object made the client receive one record instead of
        // its rows.
        return page.items;
      },
      opportunity: (_parent, args: { id: string }, context) =>
        getOpportunityWithMatch(requireUser(context), args.id),
      // Public reads for the website and mobile clients. They never touch
      // the caller's identity or expose the source application URL.
      publicOpportunity: (_parent, args: { id: string }) =>
        getPublicOpportunity(args.id),
      publicOpportunities: (_parent, args: { limit?: number }) =>
        listPublicOpportunities(args.limit ?? 24),
      matches: async (_parent, args: { limit?: number }, context) => {
        const page = await rankedOpportunities(requireUser(context), {
          semantic: false,
          limit: args.limit ?? 25,
          offset: 0,
        });
        return page.items;
      },
      applicationWorkspace: (_parent, args: { id: string }, context) =>
        getApplicationBlueprint(requireUser(context), args.id),
      applications: async (_parent, _args, context) =>
        (await listApplications(requireUser(context))).items,
      application: (_parent, args: { id: string }, context) =>
        getApplicationById(requireUser(context), args.id),
      followups: (_parent, args: { status?: string }, context) =>
        listFollowUps(requireUser(context), args.status),
      documents: async (_parent, args: { opportunityId?: string }, context) =>
        (await listDocuments(requireUser(context), {
          opportunityId: args.opportunityId,
        })).items,
      document: (_parent, args: { id: string }, context) =>
        getDocument(requireUser(context), args.id),
      companies: (_parent, args: { q?: string; limit?: number }, context) => {
        requireUser(context);
        return listCompanies({ q: args.q, limit: args.limit });
      },
      company: (_parent, args: { slug: string }, context) => {
        requireUser(context);
        return getCompanyBySlug(args.slug);
      },
      professions: (_parent, args: { depth?: number }, context) => {
        requireUser(context);
        return listProfessions(args.depth);
      },
      validateDocument: async (
        _parent,
        args: { content: string },
        context,
      ) => {
        const report = await validateDocumentForAts(
          requireUser(context),
          args.content,
          [],
        );
        return {
          score: report.score,
          grade: report.grade,
          issues: report.issues.map((issue) => `${issue.severity.toUpperCase()}: ${issue.message}`),
        };
      },
      aiStatus: (_parent, _args, context) => {
        requireUser(context);
        return {
          configured: isAiConfigured(),
          mode: process.env.AI_PROVIDER ?? "auto",
        };
      },
    },
    Mutation: {
      createApplication: (
        _parent,
        args: { opportunityId: string; status?: string },
        context,
      ) =>
        createApplication(
          requireUser(context),
          args.opportunityId,
          (args.status as never) ?? "SHORTLISTED",
        ),
      updateApplicationStatus: (
        _parent,
        args: { id: string; status: string; version: number },
        context,
      ) =>
        updateApplicationStatus(
          requireUser(context),
          args.id,
          args.status as never,
          args.version,
        ),
      updateProfile: (_parent, args: { input: Record<string, unknown> }, context) =>
        updateProfile(requireUser(context), args.input),
      saveDocument: async (
        _parent,
        args: { id: string; title?: string; content?: string },
        context,
      ) => {
        const row = await updateDocumentAndInvalidatePreparation({
          userId: requireUser(context),
          documentId: args.id,
          title: args.title,
          content: args.content,
        });
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
        const report = await validateDocumentForAts(
          requireUser(context),
          args.content,
          [],
        );
        return {
          score: report.score,
          grade: report.grade,
          issues: report.issues.map((issue) => `${issue.severity.toUpperCase()}: ${issue.message}`),
        };
      },
    },
  },
});
