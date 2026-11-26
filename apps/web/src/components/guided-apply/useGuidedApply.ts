"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui";
import {
  WorkspaceError,
  createBrowserSession,
  deleteBrowserSession,
  fetchFrame,
  getBrowserState,
  getSignedUploadUrl,
  sendBrowserCommand,
} from "./api";
import type {
  ApplicationGuidanceSession,
  ApplicationWorkspacePayload,
  BrowserCommand,
  BrowserSessionInfo,
  BrowserState,
  WorkspaceContext,
} from "./types";

const ACTIVE = new Set(["ACTIVE", "WAITING_FOR_HUMAN"]);
const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED"]);

function normalizeSession(payload: unknown): ApplicationGuidanceSession | null {
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as { session?: ApplicationGuidanceSession };
  if (candidate.session) return candidate.session;
  const direct = payload as ApplicationGuidanceSession;
  return typeof direct.id === "string" ? direct : null;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

function shell(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

interface Options {
  applicationId: string;
  workspace: ApplicationWorkspacePayload;
  onWorkspaceChange?: () => void;
}

export function useGuidedApply({ applicationId, workspace, onWorkspaceChange }: Options) {
  const toast = useToast();
  const [session, setSession] = useState<ApplicationGuidanceSession | null>(null);
  const [browser, setBrowser] = useState<BrowserSessionInfo | null>(null);
  const [state, setState] = useState<BrowserState | null>(null);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<"remote_browser" | "companion_tab">("remote_browser");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playbook, setPlaybook] = useState<unknown>(null);
  const [submitted, setSubmitted] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [uploadSelections, setUploadSelections] = useState<Record<string, string>>({});

  const sessionRef = useRef<ApplicationGuidanceSession | null>(null);
  const browserRef = useRef<BrowserSessionInfo | null>(null);
  const stateRef = useRef<BrowserState | null>(null);
  const frameUrlRef = useRef<string | null>(null);
  const contextRef = useRef<WorkspaceContext | null>(null);
  const lastObservationRef = useRef(0);
  const lastFingerprintRef = useRef("");

  const targetUrl =
    workspace.blueprint.applicationUrl ||
    workspace.opportunity?.applyUrl ||
    workspace.opportunity?.apply_url ||
    "";
  const host = useMemo(() => shell(targetUrl), [targetUrl]);

  const preparationReady =
    workspace.preparation?.status === "READY" && Boolean(workspace.preparation.approvedAt);

  const approvedDocuments = useMemo(() => {
    const ids = new Set<string>();
    if (!preparationReady) return [];
    const documentIds = workspace.preparation?.documentIds ?? {};
    for (const id of Object.values(documentIds)) if (id) ids.add(id);
    for (const id of workspace.preparation?.preparedDocumentIds ?? []) ids.add(id);
    return workspace.documents.filter((document) => ids.has(document.id));
  }, [preparationReady, workspace.documents, workspace.preparation]);

  useEffect(() => {
    sessionRef.current = session;
    contextRef.current = session ? { applicationId, guidanceSessionId: session.id } : null;
  }, [applicationId, session]);

  useEffect(() => {
    browserRef.current = browser;
  }, [browser]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<unknown>(`/applications/${applicationId}/guidance/sessions/current`, {
        fresh: Date.now(),
      })
      .then((payload) => {
        if (cancelled) return;
        const found = normalizeSession(payload);
        if (found && ACTIVE.has(found.status)) {
          setSession(found);
          setMode(found.mode === "companion_tab" ? "companion_tab" : "remote_browser");
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  const maybeObserve = useCallback(
    async (next: BrowserState) => {
      const active = sessionRef.current;
      if (!active || mode === "companion_tab") return;
      const now = Date.now();
      const fingerprint = `${next.title}|${next.fields.map((field) => `${field.key}:${field.value ?? ""}`).join(",")}|${next.blockers.join(",")}`;
      if (now - lastObservationRef.current < 6_000) return;
      if (fingerprint === lastFingerprintRef.current && now - lastObservationRef.current < 20_000) {
        return;
      }
      lastObservationRef.current = now;
      lastFingerprintRef.current = fingerprint;
      try {
        const payload = await api.post<unknown>(
          `/applications/${applicationId}/guidance/sessions/${active.id}/observations`,
          {
            fields: next.fields,
            blockers: next.blockers,
            visibleText: next.visibleText.slice(0, 4_000),
          },
        );
        const updated = normalizeSession(payload);
        if (updated) setSession(updated);
      } catch {
        // Observation delivery is best effort; polling continues either way.
      }
    },
    [applicationId, mode],
  );

  useEffect(() => {
    if (!browser || !session || mode !== "remote_browser") return;
    const activeContext: WorkspaceContext = {
      applicationId,
      guidanceSessionId: session.id,
    };
    const controller = new AbortController();
    let cancelled = false;

    const pollFrame = async () => {
      try {
        const blob = await fetchFrame(activeContext, controller.signal);
        if (cancelled) return;
        const next = URL.createObjectURL(blob);
        const previous = frameUrlRef.current;
        frameUrlRef.current = next;
        setFrameUrl(next);
        if (previous) URL.revokeObjectURL(previous);
      } catch (caught) {
        // A 429 is expected when a slow connection retries too eagerly.
        if (cancelled || (caught instanceof WorkspaceError && caught.status === 429)) return;
        setError(message(caught));
      }
    };

    const pollState = async () => {
      try {
        const next = await getBrowserState(activeContext);
        if (cancelled) return;
        setState(next);
        void maybeObserve(next);
      } catch (caught) {
        if (!cancelled) setError(message(caught));
      }
    };

    const pollSession = async () => {
      try {
        const payload = await api.get<unknown>(
          `/applications/${applicationId}/guidance/sessions/current`,
          { fresh: Date.now() },
        );
        if (cancelled) return;
        const updated = normalizeSession(payload);
        if (updated) setSession(updated);
      } catch {
        // Session polling is best effort; the rail keeps the last good state.
      }
    };

    void pollFrame();
    void pollState();
    const frameTimer = window.setInterval(() => void pollFrame(), 1_200);
    const stateTimer = window.setInterval(() => void pollState(), 2_200);
    const sessionTimer = window.setInterval(() => void pollSession(), 8_000);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(frameTimer);
      window.clearInterval(stateTimer);
      window.clearInterval(sessionTimer);
      if (frameUrlRef.current) {
        URL.revokeObjectURL(frameUrlRef.current);
        frameUrlRef.current = null;
      }
    };
  }, [applicationId, browser?.id, maybeObserve, mode, session?.id]);

  useEffect(() => {
    if (!host) return;
    let cancelled = false;
    api
      .get<unknown>("/site-playbooks/lookup", { host, siteKey: host })
      .then((payload) => {
        if (cancelled) return;
        const candidate = payload as { playbook?: unknown };
        setPlaybook(candidate.playbook ?? payload);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [host]);

  useEffect(
    () => () => {
      const activeContext = contextRef.current;
      if (activeContext?.guidanceSessionId) {
        void deleteBrowserSession(activeContext).catch(() => undefined);
      }
      if (frameUrlRef.current) URL.revokeObjectURL(frameUrlRef.current);
    },
    [],
  );

  const ensureBrowser = useCallback(
    async (active: ApplicationGuidanceSession) => {
      if (browserRef.current) return browserRef.current;
      const activeContext: WorkspaceContext = {
        applicationId,
        guidanceSessionId: active.id,
      };
      let created: BrowserSessionInfo;
      try {
        created = await createBrowserSession(activeContext, active.targetUrl ?? targetUrl);
      } catch (caught) {
        const existing = caught instanceof WorkspaceError && /already has a browser/i.test(caught.message);
        if (!existing) throw caught;
        await deleteBrowserSession(activeContext);
        created = await createBrowserSession(activeContext, active.targetUrl ?? targetUrl);
      }
      browserRef.current = created;
      setBrowser(created);
      return created;
    },
    [applicationId, targetUrl],
  );

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      let active = sessionRef.current;
      if (!active) {
        const payload = await api.post<unknown>(
          `/applications/${applicationId}/guidance/sessions`,
          { mode: "remote_browser", targetUrl, consent: true },
        );
        active = normalizeSession(payload);
        if (!active) throw new Error("The guidance session could not be created");
        setSession(active);
        setMode("remote_browser");
      }
      // Opening the workspace is not a submission. The durable submission run
      // is created only from confirmSubmission(), after the explicit dialog.
      if (active.mode === "remote_browser") await ensureBrowser(active);
      toast.push("Private browser workspace is ready", "success");
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }, [applicationId, ensureBrowser, targetUrl, toast]);

  const runCommand = useCallback(async (command: BrowserCommand) => {
    const active = sessionRef.current;
    if (!active || !browserRef.current) {
      throw new Error("Open the browser workspace before sending a command");
    }
    const activeContext: WorkspaceContext = {
      applicationId,
      guidanceSessionId: active.id,
    };
    setBusy(true);
    setError(null);
    try {
      const result = await sendBrowserCommand(activeContext, command);
      const next = await getBrowserState(activeContext);
      setState(next);
      return result;
    } catch (caught) {
      setError(message(caught));
      throw caught;
    } finally {
      setBusy(false);
    }
  }, [applicationId]);

  const fillField = useCallback(
    async (key: string, value: string) => {
      await runCommand({ type: "fill", key, value });
      setFieldValues((current) => ({ ...current, [key]: value }));
    },
    [runCommand],
  );

  const selectField = useCallback(
    async (key: string, value: string) => {
      await runCommand({ type: "select", key, value });
      setFieldValues((current) => ({ ...current, [key]: value }));
    },
    [runCommand],
  );

  const uploadDocument = useCallback(
    async (key: string, documentId: string) => {
      const active = sessionRef.current;
      if (!active) return;
      const signed = await getSignedUploadUrl(
        { applicationId, guidanceSessionId: active.id },
        documentId,
      );
      await runCommand({
        type: "upload",
        key,
        url: signed.url,
        filename: signed.filename,
      });
    },
    [applicationId, runCommand],
  );

  const refreshFrame = useCallback(async () => {
    const active = sessionRef.current;
    if (!active || !browserRef.current) return;
    const next = await getBrowserState({ applicationId, guidanceSessionId: active.id });
    setState(next);
  }, [applicationId]);

  const returnToStart = useCallback(async () => {
    const active = sessionRef.current;
    if (!active) return;
    await runCommand({ type: "navigate", url: active.targetUrl ?? targetUrl });
  }, [runCommand, targetUrl]);

  const ackHint = useCallback(
    async (hintId: string) => {
      const active = sessionRef.current;
      if (!active) return;
      try {
        await api.post(
          `/applications/${applicationId}/guidance/sessions/${active.id}/hints/${hintId}/ack`,
        );
        setSession((current) =>
          current
            ? {
                ...current,
                hints: current.hints.map((hint) =>
                  hint.id === hintId ? { ...hint, acknowledgedAt: new Date().toISOString() } : hint,
                ),
              }
            : current,
        );
      } catch (caught) {
        setError(message(caught));
      }
    },
    [applicationId],
  );

  const changeMode = useCallback(
    async (next: "remote_browser" | "companion_tab") => {
      const active = sessionRef.current;
      if (!active || next === mode) return;
      setBusy(true);
      setError(null);
      try {
        await api.post(
          `/applications/${applicationId}/guidance/sessions/${active.id}/mode`,
          { mode: next },
        );
        setMode(next);
        setSession((current) => (current ? { ...current, mode: next } : current));
        const activeContext: WorkspaceContext = {
          applicationId,
          guidanceSessionId: active.id,
        };
        if (next === "companion_tab" && browserRef.current) {
          await deleteBrowserSession(activeContext);
          browserRef.current = null;
          setBrowser(null);
        }
        if (next === "remote_browser") await ensureBrowser({ ...active, mode: next });
      } catch (caught) {
        setError(message(caught));
      } finally {
        setBusy(false);
      }
    },
    [applicationId, ensureBrowser, mode],
  );

  const proposePlaybook = useCallback(async () => {
    if (!host || !sessionRef.current) return;
    const current = stateRef.current;
    const steps: Array<{
      label: string;
      action: "fill" | "upload" | "click_next" | "wait_for_user" | "stop";
      fieldKey?: string;
      note?: string;
    }> = (current?.fields ?? [])
      .filter((field) => !field.manualOnly)
      .slice(0, 20)
      .map((field) => ({
        label: `Provide ${field.label}`,
        action: field.type === "file" ? ("upload" as const) : ("fill" as const),
        fieldKey: field.key,
        note: field.type === "file" ? "Attach an approved PDF" : undefined,
      }));
    steps.push({
      label: "Review and submit",
      action: "stop",
      fieldKey: undefined,
      note: "Only after explicit candidate confirmation",
    });
    try {
      await api.post("/site-playbooks/propose", {
        host,
        siteKey: host,
        platform: workspace.blueprint.platform,
        steps,
        blockerPatterns: current?.blockers ?? [],
      });
    } catch {
      // Learning is opportunistic; it must never block the candidate.
    }
  }, [host, workspace.blueprint.platform]);

  const confirmSubmission = useCallback(async () => {
    const active = sessionRef.current;
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      let runId = workspace.submission?.id;
      if (!workspace.submission || TERMINAL.has(workspace.submission.status)) {
        // The session already exists here, so the API can waive the paired
        // extension requirement for this independently authenticated run.
        const created = await api.post<{ run: { id: string } }>(
          `/applications/${applicationId}/submission`,
          { consent: true, guidedSession: true },
        );
        runId = created.run.id;
      }
      await runCommand({ type: "submit", confirm: true });
      // The click is not authoritative until the candidate confirms it above.
      // Only this call advances the run and the application status.
      await api.post(
        `/applications/${applicationId}/guidance/sessions/${active.id}/complete`,
        { url: stateRef.current?.url, runId },
      );
      setSubmitted(true);
      await proposePlaybook();
      onWorkspaceChange?.();
      toast.push("Application marked as submitted", "success");
    } catch (caught) {
      setError(message(caught));
      throw caught;
    } finally {
      setBusy(false);
    }
  }, [applicationId, onWorkspaceChange, proposePlaybook, runCommand, toast, workspace.submission]);

  const endSession = useCallback(async () => {
    const active = sessionRef.current;
    if (!active) return;
    setBusy(true);
    try {
      await api.post(`/applications/${applicationId}/guidance/sessions/${active.id}/end`);
      const activeContext: WorkspaceContext = {
        applicationId,
        guidanceSessionId: active.id,
      };
      await deleteBrowserSession(activeContext);
      setSession(null);
      setBrowser(null);
      setState(null);
      setMode("remote_browser");
      setSubmitted(false);
      onWorkspaceChange?.();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }, [applicationId, onWorkspaceChange]);

  return {
    session,
    browser,
    state,
    frameUrl,
    mode,
    busy,
    error,
    playbook,
    submitted,
    targetUrl,
    host,
    preparationReady,
    approvedDocuments,
    fieldValues,
    setFieldValues,
    uploadSelections,
    setUploadSelections,
    start,
    runCommand,
    fillField,
    selectField,
    uploadDocument,
    refreshFrame,
    returnToStart,
    ackHint,
    changeMode,
    confirmSubmission,
    endSession,
  };
}
