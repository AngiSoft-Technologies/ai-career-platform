import { createHash, randomBytes } from "node:crypto";
import type { BrowserAgentDevice } from "@angisoft/mboqara-contracts";
import { query } from "../../db/pool.js";

interface BrowserAgentRow {
  id: string;
  user_id: string;
  name: string;
  status: string;
  last_seen_at: Date | null;
  created_at: Date;
}

function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function mapDevice(row: BrowserAgentRow): BrowserAgentDevice {
  return {
    id: row.id,
    name: row.name,
    status: row.status as BrowserAgentDevice["status"],
    lastSeenAt: row.last_seen_at?.toISOString(),
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Creates a short-lived pairing code for a browser agent.
 *
 * The code is shown once in the web app and pasted into the companion. It is
 * never stored in readable form; only its digest is kept.
 */
export async function createBrowserAgentPairing(input: {
  userId: string;
  name?: string;
}): Promise<{ device: BrowserAgentDevice; pairingCode: string }> {
  const pairingCode = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  const inserted = await query<BrowserAgentRow>(
    `INSERT INTO browser_agents (
       user_id, name, pairing_code_hash, pairing_code_expires_at, status
     ) VALUES ($1, $2, $3, $4, 'PENDING')
     RETURNING id, user_id, name, status, last_seen_at, created_at`,
    [
      input.userId,
      input.name?.trim() || "Browser agent",
      hashToken(pairingCode),
      expiresAt,
    ],
  );
  const row = inserted.rows[0];
  if (!row) throw new Error("BROWSER_AGENT_CREATE_FAILED");
  return { device: mapDevice(row), pairingCode };
}

export async function claimBrowserAgent(
  pairingCode: string,
): Promise<{ deviceToken: string; device: BrowserAgentDevice }> {
  const deviceToken = randomBytes(32).toString("base64url");
  const updated = await query<BrowserAgentRow>(
    `UPDATE browser_agents
        SET token_hash = $2,
            status = 'ACTIVE',
            pairing_code_expires_at = now(),
            last_seen_at = now()
      WHERE pairing_code_hash = $1
        AND status = 'PENDING'
        AND pairing_code_expires_at > now()
      RETURNING id, user_id, name, status, last_seen_at, created_at`,
    [hashToken(pairingCode), hashToken(deviceToken)],
  );
  const row = updated.rows[0];
  if (!row) throw new Error("BROWSER_AGENT_PAIRING_INVALID");
  return { deviceToken, device: mapDevice(row) };
}

export async function authenticateBrowserAgent(
  deviceToken: string,
): Promise<{ id: string; userId: string; name: string } | null> {
  const result = await query<BrowserAgentRow>(
    `UPDATE browser_agents
        SET last_seen_at = now()
      WHERE token_hash = $1 AND status = 'ACTIVE'
      RETURNING id, user_id, name, status, last_seen_at, created_at`,
    [hashToken(deviceToken)],
  );
  const row = result.rows[0];
  return row ? { id: row.id, userId: row.user_id, name: row.name } : null;
}

export async function hasActiveBrowserAgent(userId: string): Promise<boolean> {
  const result = await query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM browser_agents
        WHERE user_id = $1 AND status = 'ACTIVE'
     ) AS exists`,
    [userId],
  );
  return result.rows[0]?.exists === true;
}

export async function listBrowserAgents(
  userId: string,
): Promise<BrowserAgentDevice[]> {
  const result = await query<BrowserAgentRow>(
    `SELECT id, user_id, name, status, last_seen_at, created_at
       FROM browser_agents
      WHERE user_id = $1
      ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows.map(mapDevice);
}

export async function revokeBrowserAgent(
  userId: string,
  deviceId: string,
): Promise<boolean> {
  const result = await query(
    `UPDATE browser_agents
        SET status = 'REVOKED', token_hash = NULL
      WHERE id = $1 AND user_id = $2`,
    [deviceId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}
