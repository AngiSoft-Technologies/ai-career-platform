"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, isOffline, readCache } from "@/lib/api";

interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  offline: boolean;
  refresh: () => void;
  stale: boolean;
}

export function useApi<T>(
  path: string | null,
  query?: Record<string, string | number | boolean | undefined | null>,
  /**
   * Content fetched on the server (see `lib/server-content`). It renders into
   * the first HTML so crawlers and AI assistants see the page content, and the
   * hook skips the duplicate client request unless `refresh()` is called.
   */
  initialData?: T | null,
): QueryState<T> {
  const [data, setData] = useState<T | null>(initialData ?? null);
  const [loading, setLoading] = useState(Boolean(path) && initialData == null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [stale, setStale] = useState(false);
  const [nonce, setNonce] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const hasInitialRef = useRef(initialData != null);

  const queryKey = JSON.stringify(query ?? {});

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }

    if (hasInitialRef.current && nonce === 0) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;

    const cached = readCache<T>(path);
    if (cached && isOffline()) {
      setData(cached.data);
      setStale(true);
      setOffline(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    api
      .get<T>(path, JSON.parse(queryKey) as Record<string, string>, controller.signal)
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setStale(false);
        setOffline(false);
      })
      .catch((caught) => {
        if (cancelled || controller.signal.aborted) return;
        const fallback = readCache<T>(path);
        if (fallback) {
          setData(fallback.data);
          setStale(true);
          setOffline(true);
        }
        setError(caught instanceof Error ? caught.message : "Request failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [path, queryKey, nonce]);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  return { data, loading, error, offline, refresh, stale };
}

export function useDebounced<T>(value: T, delay = 320): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

interface OnboardingState {
  step: "welcome" | "upload" | "manual" | "linkedin" | "complete";
  setStep: (step: "welcome" | "upload" | "manual" | "linkedin" | "complete") => void;
  completeOnboarding: (path?: "upload" | "linkedin" | "manual") => Promise<void>;
}

export function useOnboarding(): OnboardingState {
  const [step, setStep] = useState<OnboardingState["step"]>("welcome");

  const completeOnboarding = async (path?: "upload" | "linkedin" | "manual") => {
    setStep("complete");
    try {
      await api.post("/profile/onboarding-complete", path ? { path } : {});
    } catch {
      // Onboarding completion is best-effort; the resume itself is saved.
    }
  };

  return { step, setStep, completeOnboarding };
}
