import { Router } from "express";
import { z } from "zod";
import { getProfile, updateProfile } from "../services/profile.js";

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
