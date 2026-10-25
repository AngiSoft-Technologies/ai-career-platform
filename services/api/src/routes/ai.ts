import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import {
  analyseProfile,
  summariseOpportunity,
  writeCoverLetter,
} from "../services/ai/insights.js";
import { isAiConfigured } from "../services/ai/client.js";
import { getOpportunity, listOpportunities } from "../services/opportunities.js";
import { getProfile } from "../services/profile.js";

const summarySchema = z.object({
  opportunityId: z.string().uuid(),
});

const coverLetterSchema = z.object({
  opportunityId: z.string().uuid(),
  tone: z.enum(["professional", "enthusiastic", "concise"]).optional(),
  save: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

export const aiRouter = Router();

aiRouter.get("/status", (_request, response) => {
  response.json({
    configured: isAiConfigured(),
    mode: process.env.AI_PROVIDER ?? "auto",
  });
});

aiRouter.post("/job-summary", async (request, response) => {
  const input = summarySchema.parse(request.body);
  const opportunity = await getOpportunity(input.opportunityId);
  if (!opportunity) {
    response.status(404).json({ error: "Opportunity not found" });
    return;
  }

  const insight = await summariseOpportunity(opportunity);
  response.json({ insight });
});

aiRouter.post("/cover-letter", async (request, response) => {
  const input = coverLetterSchema.parse(request.body);
  const userId = response.locals.userId as string;

  const [profile, opportunity] = await Promise.all([
    getProfile(userId),
    getOpportunity(input.opportunityId),
  ]);
  if (!profile) {
    response.status(404).json({ error: "Profile not found" });
    return;
  }
  if (!opportunity) {
    response.status(404).json({ error: "Opportunity not found" });
    return;
  }

  const content = await writeCoverLetter(
    profile,
    opportunity,
    input.tone ?? "professional",
  );

  if (input.save) {
    const inserted = await query<{ id: string }>(
      `INSERT INTO documents (user_id, opportunity_id, type, title, content)
       VALUES ($1, $2, 'cover_letter', $3, $4)
       RETURNING id`,
      [
        userId,
        opportunity.id,
        `Cover letter - ${opportunity.title} at ${opportunity.companyName}`,
        content,
      ],
    );
    response.status(201).json({
      documentId: inserted.rows[0]?.id,
      content,
    });
    return;
  }

  response.json({ content });
});

aiRouter.get("/profile-analysis", async (request, response) => {
  const userId = response.locals.userId as string;
  const profile = await getProfile(userId);
  if (!profile) {
    response.status(404).json({ error: "Profile not found" });
    return;
  }

  const opportunities = await listOpportunities({ limit: 30 });
  const analysis = await analyseProfile(profile, opportunities);
  response.json({ analysis });
});
