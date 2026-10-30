import { Router } from "express";
import { aiRouter } from "./ai.js";
import { analysisRouter } from "./analysis.js";
import { sourcesRouter } from "./sources.js";
import { applicationsRouter } from "./applications.js";
import { documentsRouter } from "./documents.js";
import { opportunitiesRouter } from "./opportunities.js";
import { profileRouter } from "./profile.js";
import { preferencesRouter } from "./preferences.js";
import { applicationFollowupsRouter, followupsRouter } from "./followups.js";
import { connectionsRouter } from "./connections.js";
import { adminRouter } from "./admin.js";
import { matchesRouter, companiesRouter } from "./matches.js";
import { meRouter } from "./me.js";
import { notificationsRouter } from "./notifications.js";
import { streamRouter } from "./stream.js";

export const v1Router = Router();

// Mounted before `/me` so `/me/notifications` resolves here rather than being
// swallowed by the account router.
v1Router.use("/me/notifications", notificationsRouter);
v1Router.use("/me", meRouter);
v1Router.use("/profile", profileRouter);
v1Router.use("/profile/preferences", preferencesRouter);
v1Router.use("/opportunities", opportunitiesRouter);
v1Router.use("/applications", applicationsRouter);
v1Router.use("/applications", analysisRouter);
v1Router.use("/applications", applicationFollowupsRouter);
v1Router.use("/documents", documentsRouter);
v1Router.use("/ai", aiRouter);
v1Router.use("/sources", sourcesRouter);
v1Router.use("/followups", followupsRouter);
v1Router.use("/connections", connectionsRouter);
v1Router.use("/admin", adminRouter);
v1Router.use("/matches", matchesRouter);
v1Router.use("/companies", companiesRouter);
v1Router.use("/stream", streamRouter);
