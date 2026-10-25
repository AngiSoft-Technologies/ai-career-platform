import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "../config.js";
import { pool } from "./pool.js";

interface SeedOpportunity {
  company: string;
  companySlug: string;
  industry: string;
  website: string;
  careersUrl: string;
  title: string;
  description: string;
  country: string;
  city: string;
  workMode: string;
  seniority: string;
  employmentType: string;
  currency?: string;
  applyUrl: string;
  applicationMethod: string;
  platform: string;
  postedDaysAgo: number;
  skills: string[];
}

const profileSkills = [
  "Java",
  "Spring Boot",
  "TypeScript",
  "Node.js",
  "Python",
  "PostgreSQL",
  "Docker",
  "React",
  "Flutter",
  "REST APIs",
  "AWS",
];

async function main(): Promise<void> {
  const seedPath = resolve(process.cwd(), "../../db/seeds/opportunities.json");
  const opportunities = JSON.parse(
    await readFile(seedPath, "utf8"),
  ) as SeedOpportunity[];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO users (id, email, display_name)
       VALUES ($1, 'demo@jobradar.local', 'Prof Angera')
       ON CONFLICT (id) DO UPDATE SET display_name = excluded.display_name`,
      [config.DEMO_USER_ID],
    );

    const profile = await client.query<{ id: string }>(
      `INSERT INTO candidate_profiles (
         user_id, full_name, headline, summary, location, country,
         years_experience, seniority, desired_roles, preferred_countries,
         preferred_locations, remote_preferred
       ) VALUES (
         $1, 'Prof Angera', 'Software Engineer & Product Builder',
         'Full-stack engineer building mobile-first products with TypeScript, Flutter, Java and Postgres.',
         'Nairobi', 'Kenya', 4, 'mid',
         ARRAY['Backend Engineer','Full Stack Engineer','AI Engineer'],
         ARRAY['Kenya','Remote'], ARRAY['Nairobi','Remote'], true
       )
       ON CONFLICT (user_id) DO UPDATE SET
         full_name = excluded.full_name,
         headline = excluded.headline,
         summary = excluded.summary,
         location = excluded.location,
         country = excluded.country,
         years_experience = excluded.years_experience,
         seniority = excluded.seniority,
         desired_roles = excluded.desired_roles,
         preferred_countries = excluded.preferred_countries,
         preferred_locations = excluded.preferred_locations,
         remote_preferred = excluded.remote_preferred
       RETURNING id`,
      [config.DEMO_USER_ID],
    );
    const profileId = profile.rows[0]?.id;
    if (!profileId) throw new Error("Profile seed did not return an id");

    await client.query("DELETE FROM candidate_skills WHERE profile_id = $1", [
      profileId,
    ]);
    for (const skill of profileSkills) {
      await client.query(
        "INSERT INTO candidate_skills (profile_id, name, level) VALUES ($1, $2, 'working')",
        [profileId, skill],
      );
    }

    for (const [index, job] of opportunities.entries()) {
      const company = await client.query<{ id: string }>(
        `INSERT INTO companies (name, slug, industry, country, website, careers_url)
         VALUES ($1, $2, $3, 'Kenya', $4, $5)
         ON CONFLICT (slug) DO UPDATE SET
           name = excluded.name,
           industry = excluded.industry,
           website = excluded.website,
           careers_url = excluded.careers_url
         RETURNING id`,
        [job.company, job.companySlug, job.industry, job.website, job.careersUrl],
      );
      const companyId = company.rows[0]?.id;
      if (!companyId) throw new Error(`Company seed failed for ${job.company}`);

      const source = await client.query<{ id: string }>(
        `INSERT INTO job_sources (company_id, type, name, url, external_id, health)
         VALUES ($1, 'company_web', 'Job Radar seed data', $2, 'seed', 'healthy')
         ON CONFLICT (type, url, external_id) DO UPDATE SET
           company_id = excluded.company_id,
           name = excluded.name,
           health = excluded.health
         RETURNING id`,
        [companyId, job.careersUrl],
      );
      const sourceId = source.rows[0]?.id;
      if (!sourceId) throw new Error(`Source seed failed for ${job.company}`);

      const opportunity = await client.query<{ id: string }>(
        `INSERT INTO opportunities (
           company_id, source_id, external_id, title, description, country,
           city, work_mode, seniority, employment_type, currency, apply_url,
           application_method, platform, posted_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
           now() - ($15 || ' days')::interval
         )
         ON CONFLICT (source_id, external_id) DO UPDATE SET
           company_id = excluded.company_id,
           title = excluded.title,
           description = excluded.description,
           country = excluded.country,
           city = excluded.city,
           work_mode = excluded.work_mode,
           seniority = excluded.seniority,
           employment_type = excluded.employment_type,
           currency = excluded.currency,
           apply_url = excluded.apply_url,
           application_method = excluded.application_method,
           platform = excluded.platform,
           posted_at = excluded.posted_at,
           status = 'active'
         RETURNING id`,
        [
          companyId,
          sourceId,
          `seed-${job.companySlug}-${index + 1}`,
          job.title,
          job.description,
          job.country,
          job.city,
          job.workMode,
          job.seniority,
          job.employmentType,
          job.currency ?? null,
          job.applyUrl,
          job.applicationMethod,
          job.platform,
          String(job.postedDaysAgo),
        ],
      );
      const opportunityId = opportunity.rows[0]?.id;
      if (!opportunityId) {
        throw new Error(`Opportunity seed failed for ${job.title}`);
      }

      await client.query(
        "DELETE FROM opportunity_skills WHERE opportunity_id = $1",
        [opportunityId],
      );
      for (const skill of job.skills) {
        await client.query(
          `INSERT INTO opportunity_skills (opportunity_id, skill, required, weight)
           VALUES ($1, $2, true, 1)
           ON CONFLICT (opportunity_id, skill) DO NOTHING`,
          [opportunityId, skill],
        );
      }
    }

    await client.query("COMMIT");
    console.log(
      `Seeded demo profile and ${opportunities.length} opportunities for ${config.DEMO_USER_ID}`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
