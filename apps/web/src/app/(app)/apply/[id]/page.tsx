"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { Button, EmptyState, Page, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";

/**
 * The handoff between "I want to apply" and the application desk.
 *
 * This route lives inside the authenticated shell, so an anonymous visitor
 * is sent to sign-in with this exact path as `next`. Once signed in, opening
 * an application is a single idempotent-looking POST; the desk owns the rest
 * of the journey.
 */
export default function ApplyStartPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const started = useRef(0);

  useEffect(() => {
    if (started.current === attempt) return;
    started.current = attempt;

    let cancelled = false;
    const start = async () => {
      setError(null);
      try {
        const response = await api.post<{ application: { id: string } }>(
          "/applications",
          { opportunityId: params.id },
        );
        if (!cancelled) router.replace(`/applications/${response.application.id}`);
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not open the application desk",
          );
        }
      }
    };

    void start();
    return () => {
      cancelled = true;
    };
  }, [params.id, router, attempt]);

  if (error) {
    return (
      <Page>
        <EmptyState
          icon={<LoaderCircle size={26} />}
          title="We could not open the application"
          description={error}
          action={
            <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>
              Try again
            </Button>
          }
        />
      </Page>
    );
  }

  return (
    <Page>
      <div className="flex flex-col gap-5 py-12">
        <div className="flex items-center gap-3">
          <LoaderCircle className="animate-spin text-app-accent" size={22} aria-hidden />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Opening your application desk</h1>
            <p className="mt-1 text-sm text-app-soft">
              Preparing the role, its checklist and your documents.
            </p>
          </div>
        </div>
        <Skeleton height={180} />
        <Skeleton height={320} />
      </div>
    </Page>
  );
}
