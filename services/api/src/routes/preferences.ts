import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { broadcast } from "../realtime/hub.js";

export const preferencesRouter = Router();

const preferencesSchema = z.object({
  preferredCountries: z.array(z.string().min(2).max(80)).max(50).optional(),
  preferredLocations: z.array(z.string().min(2).max(120)).max(50).optional(),
  preferredRoles: z.array(z.string().min(2).max(120)).max(50).optional(),
  desiredSeniority: z
    .enum(["intern", "junior", "mid", "senior", "lead", "executive"])
    .optional(),
  minSalary: z.number().int().min(0).max(100_000_000).nullable().optional(),
  currency: z.string().length(3).optional(),
  remoteOnly: z.boolean().optional(),
  willingToRelocate: z.boolean().optional(),
  notificationsEnabled: z.boolean().optional(),
});

preferencesRouter.get("/", async (request, response, next) => {
  try {
    const userId = response.locals.userId as string;
    const result = await query(
      `SELECT preferred_countries, preferred_locations, preferred_roles,
              desired_seniority, min_salary, currency, remote_only,
              willing_to_relocate, notifications_enabled, updated_at
         FROM candidate_preferences WHERE user_id = $1`,
      [userId],
    );
    const row = result.rows[0];
    if (!row) {
      response.json({
        preferences: {
          preferredCountries: [],
          preferredLocations: [],
          preferredRoles: [],
          desiredSeniority: "junior",
          minSalary: null,
          currency: "KES",
          remoteOnly: false,
          willingToRelocate: false,
          notificationsEnabled: true,
          updatedAt: null,
        },
      });
      return;
    }
    response.json({
      preferences: {
        preferredCountries: row.preferred_countries,
        preferredLocations: row.preferred_locations,
        preferredRoles: row.preferred_roles,
        desiredSeniority: row.desired_seniority,
        minSalary: row.min_salary,
        currency: row.currency,
        remoteOnly: row.remote_only,
        willingToRelocate: row.willing_to_relocate,
        notificationsEnabled: row.notifications_enabled,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

preferencesRouter.put("/", async (request, response, next) => {
  try {
    const userId = response.locals.userId as string;
    const input = preferencesSchema.parse(request.body);

    const result = await query(
      `INSERT INTO candidate_preferences (
         user_id, preferred_countries, preferred_locations, preferred_roles,
         desired_seniority, min_salary, currency, remote_only,
         willing_to_relocate, notifications_enabled, updated_at
       )
       VALUES ($1,
         COALESCE($2, '{}'), COALESCE($3, '{}'), COALESCE($4, '{}'),
         COALESCE($5, 'junior'), $6, COALESCE($7, 'KES'),
         COALESCE($8, false), COALESCE($9, false), COALESCE($10, true), now())
       ON CONFLICT (user_id) DO UPDATE SET
         preferred_countries = COALESCE($2, candidate_preferences.preferred_countries),
         preferred_locations = COALESCE($3, candidate_preferences.preferred_locations),
         preferred_roles = COALESCE($4, candidate_preferences.preferred_roles),
         desired_seniority = COALESCE($5, candidate_preferences.desired_seniority),
         min_salary = COALESCE($6, candidate_preferences.min_salary),
         currency = COALESCE($7, candidate_preferences.currency),
         remote_only = COALESCE($8, candidate_preferences.remote_only),
         willing_to_relocate = COALESCE($9, candidate_preferences.willing_to_relocate),
         notifications_enabled = COALESCE($10, candidate_preferences.notifications_enabled),
         updated_at = now()
       RETURNING *`,
      [
        userId,
        input.preferredCountries ?? null,
        input.preferredLocations ?? null,
        input.preferredRoles ?? null,
        input.desiredSeniority ?? null,
        input.minSalary ?? null,
        input.currency ?? null,
        input.remoteOnly ?? null,
        input.willingToRelocate ?? null,
        input.notificationsEnabled ?? null,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      response.status(500).json({ error: "PREFERENCES_WRITE_FAILED" });
      return;
    }
    broadcast("profile.preferences.updated", { userId }, userId);

    response.json({
      preferences: {
        preferredCountries: row.preferred_countries,
        preferredLocations: row.preferred_locations,
        preferredRoles: row.preferred_roles,
        desiredSeniority: row.desired_seniority,
        minSalary: row.min_salary,
        currency: row.currency,
        remoteOnly: row.remote_only,
        willingToRelocate: row.willing_to_relocate,
        notificationsEnabled: row.notifications_enabled,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    next(error);
  }
});
