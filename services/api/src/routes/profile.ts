import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { getProfile, updateProfile } from "../services/profile.js";
import { runAtsVerification } from "../services/documents/ats-agent.js";
import {
  buildResumeContent,
  saveStructuredResume,
  type StructuredResume,
} from "../services/documents/structured.js";

const updateSchema = z.object({
  fullName: z.string().min(1).optional(),
  headline: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  country: z.string().min(1).optional(),
  yearsExperience: z.number().int().min(0).max(60).optional(),
  seniority: z.enum(["intern", "junior", "mid", "senior", "lead"]).optional(),
  desiredRoles: z.array(z.string().min(1)).max(20).optional(),
  skills: z.array(z.string().min(1)).max(100).optional(),
  preferredCountries: z.array(z.string().min(1)).max(30).optional(),
  preferredLocations: z.array(z.string().min(1)).max(30).optional(),
  remotePreferred: z.boolean().optional(),
});

export const profileRouter = Router();

profileRouter.get("/", async (_request, response) => {
  const profile = await getProfile(response.locals.userId as string);
  response.json({ profile });
});

profileRouter.put("/", async (request, response) => {
  const update = updateSchema.parse(request.body);
  const profile = await updateProfile(
    response.locals.userId as string,
    update,
  );
  if (!profile) {
    response.status(404).json({ error: "Profile not found" });
    return;
  }
  response.json({ profile });
});

const structuredResumeSchema = z.object({
  fullName: z.string().max(160).default(""),
  headline: z.string().max(240).default(""),
  summary: z.string().max(4000).default(""),
  location: z.string().max(160).default(""),
  country: z.string().max(120).default(""),
  email: z.string().max(200).default(""),
  phone: z.string().max(60).default(""),
  linkedin: z.string().max(300).default(""),
  portfolio: z.string().max(300).default(""),
  yearsExperience: z.number().int().min(0).max(60).default(0),
  seniority: z
    .enum(["intern", "junior", "mid", "senior", "lead"])
    .default("junior"),
  skills: z.array(z.string().max(120)).max(100).default([]),
  desiredRoles: z.array(z.string().max(120)).max(20).default([]),
  experiences: z
    .array(
      z.object({
        title: z.string().max(200).default(""),
        company: z.string().max(200).default(""),
        location: z.string().max(160).default(""),
        startDate: z.string().max(20).default(""),
        endDate: z.string().max(20).default(""),
        current: z.boolean().default(false),
        description: z.string().max(4000).default(""),
      }),
    )
    .max(30)
    .default([]),
  education: z
    .array(
      z.object({
        degree: z.string().max(240).default(""),
        institution: z.string().max(240).default(""),
        location: z.string().max(160).default(""),
        graduationDate: z.string().max(20).default(""),
        gpa: z.string().max(40).default(""),
      }),
    )
    .max(20)
    .default([]),
  projects: z
    .array(
      z.object({
        name: z.string().max(200).default(""),
        description: z.string().max(2000).default(""),
        technologies: z.string().max(400).default(""),
        url: z.string().max(300).default(""),
      }),
    )
    .max(30)
    .default([]),
});

/**
 * Saves a resume built with the manual wizard. The structured data is written
 * to the candidate profile, work history and education tables so matching has
 * something real to work with, then rendered into a document.
 */
profileRouter.post("/resume", async (request, response, next) => {
  try {
    const userId = response.locals.userId as string;
    const input = structuredResumeSchema.parse(request.body ?? {});
    const structured = input as StructuredResume;

    if (!structured.fullName.trim()) {
      response.status(400).json({ error: "A full name is required." });
      return;
    }
    if (!structured.headline.trim()) {
      structured.headline =
        structured.experiences[0]?.title || "Professional";
    }

    await saveStructuredResume(userId, structured);
    const content = buildResumeContent(structured);

    const inserted = await query<{ id: string; created_at: Date }>(
      `INSERT INTO documents (user_id, type, title, content, origin, mime_type)
       VALUES ($1, 'cv', $2, $3, 'manual', 'application/json')
       RETURNING id, created_at`,
      [userId, `${structured.fullName} Resume`, content],
    );
    const document = inserted.rows[0];
    if (!document) throw new Error("DOCUMENT_CREATE_FAILED");

    void runAtsVerification({
      userId,
      documentId: document.id,
      content,
    }).catch(() => undefined);

    response.status(201).json({
      document: {
        id: document.id,
        title: `${structured.fullName} Resume`,
        type: "cv",
        content,
        createdAt: document.created_at.toISOString(),
      },
      structured,
    });
  } catch (error) {
    next(error);
  }
});

const onboardingSchema = z.object({
  path: z.enum(["upload", "linkedin", "manual"]).optional(),
});

profileRouter.get("/onboarding", async (request, response, next) => {
  try {
    const result = await query<{
      onboarding_completed_at: Date | null;
      onboarding_path: string;
    }>(
      `SELECT onboarding_completed_at, onboarding_path
         FROM candidate_profiles WHERE user_id = $1`,
      [response.locals.userId as string],
    );
    const row = result.rows[0];
    response.json({
      completed: Boolean(row?.onboarding_completed_at),
      completedAt: row?.onboarding_completed_at ?? null,
      path: row?.onboarding_path ?? "",
    });
  } catch (error) {
    next(error);
  }
});

profileRouter.post("/onboarding-complete", async (request, response, next) => {
  try {
    const userId = response.locals.userId as string;
    const input = onboardingSchema.parse(request.body ?? {});

    await query(
      `UPDATE candidate_profiles
          SET onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
              onboarding_path = CASE WHEN $2 = '' THEN onboarding_path ELSE $2 END,
              updated_at = now()
        WHERE user_id = $1`,
      [userId, input.path ?? ""],
    );

    await query(
      `INSERT INTO candidate_preferences (user_id, updated_at)
       VALUES ($1, now())
       ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );

    response.json({ completed: true, path: input.path ?? "" });
  } catch (error) {
    next(error);
  }
});
