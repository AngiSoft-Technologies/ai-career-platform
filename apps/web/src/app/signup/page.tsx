"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useSession } from "@/components/session";

function SignupRedirect() {
  const router = useRouter();
  const params = useSearchParams();
  const { session, loading } = useSession();
  const requestedNext = params.get("next") ?? "/dashboard";
  const next =
    requestedNext.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/dashboard";

  useEffect(() => {
    if (loading) return;
    router.replace(
      session
        ? next
        : `/login?mode=signup&next=${encodeURIComponent(next)}`,
    );
  }, [loading, session, next, router]);

  return null;
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupRedirect />
    </Suspense>
  );
}
