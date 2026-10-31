import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";

const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  max_distance_km: z.number().int().positive().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  remote_ok: z.boolean().optional(),
  willing_to_relocate: z.boolean().optional(),
  preferred_countries: z.array(z.string()).optional(),
  preferred_locations: z.array(z.string()).optional(),
});

export const userLocationRouter = Router();

/**
 * GET /v1/user-location
 * Get the current user's location preferences.
 */
userLocationRouter.get("/", async (request, response, next) => {
  try {
    const userId = response.locals.userId as string;
    const result = await query(
      `SELECT * FROM user_location_prefs WHERE user_id = $1`,
      [userId],
    );
    if (result.rows.length === 0) {
      response.json({ location: null });
      return;
    }
    response.json({ location: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /v1/user-location
 * Set or update the current user's location preferences.
 * Used for location-based job suggestions (like LinkedIn "jobs near you").
 */
userLocationRouter.put("/", async (request, response, next) => {
  try {
    const userId = response.locals.userId as string;
    const input = locationSchema.parse(request.body);

    const result = await query(
      `INSERT INTO user_location_prefs
          (user_id, latitude, longitude, max_distance_km, country, city,
           remote_ok, willing_to_relocate, preferred_countries,
           preferred_locations, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
       ON CONFLICT (user_id) DO UPDATE SET
         latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude,
         max_distance_km = EXCLUDED.max_distance_km,
         country = EXCLUDED.country,
         city = EXCLUDED.city,
         remote_ok = EXCLUDED.remote_ok,
         willing_to_relocate = EXCLUDED.willing_to_relocate,
         preferred_countries = EXCLUDED.preferred_countries,
         preferred_locations = EXCLUDED.preferred_locations,
         updated_at = now()
       RETURNING *`,
      [
        userId,
        input.latitude,
        input.longitude,
        input.max_distance_km ?? 50,
        input.country ?? null,
        input.city ?? null,
        input.remote_ok ?? true,
        input.willing_to_relocate ?? false,
        input.preferred_countries ?? [],
        input.preferred_locations ?? [],
      ],
    );
    response.json({ location: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /v1/user-location
 * Remove the current user's location preferences.
 */
userLocationRouter.delete("/", async (request, response, next) => {
  try {
    const userId = response.locals.userId as string;
    await query(`DELETE FROM user_location_prefs WHERE user_id = $1`, [userId]);
    response.json({ message: "Location preferences removed" });
  } catch (error) {
    next(error);
  }
});
