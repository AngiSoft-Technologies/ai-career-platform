"use client";

import { useEffect } from "react";

/**
 * Registers the Job Radar service worker so the frontend owns its own
 * offline shell, cached reads and queued background writes. The backend on
 * Fly runs its own dependencies; the frontend runs its own worker.
 */
export function ServiceWorkerRegistrar(): null {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = (): void => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          // Offline support is an enhancement; the app still works without it.
        });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
