import { Router } from "express";
import { z } from "zod";
import {
  createBrowserAgentPairing,
  listBrowserAgents,
  revokeBrowserAgent,
} from "../services/application/browser.js";

export const browserRouter = Router();

browserRouter.get("/devices", async (request, response, next) => {
  try {
    const userId = response.locals.userId as string;
    const devices = await listBrowserAgents(userId);
    response.json({ devices });
  } catch (error) {
    next(error);
  }
});

browserRouter.post("/devices", async (request, response, next) => {
  try {
    const userId = response.locals.userId as string;
    const input = z.object({
      name: z.string().trim().min(1).max(120).optional(),
    }).parse(request.body ?? {});
    const result = await createBrowserAgentPairing({
      userId,
      name: input.name,
    });
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

browserRouter.delete("/devices/:id", async (request, response, next) => {
  try {
    const userId = response.locals.userId as string;
    const deviceId = z.string().uuid().parse(request.params.id);
    const revoked = await revokeBrowserAgent(userId, deviceId);
    if (!revoked) {
      response.status(404).json({ error: "Browser agent not found" });
      return;
    }
    response.json({ revoked });
  } catch (error) {
    next(error);
  }
});
