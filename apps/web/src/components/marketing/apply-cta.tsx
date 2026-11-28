"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useSession } from "@/components/session";

/**
 * The only account gate in the public journey.
 *
 * Reading a role stays anonymous. The moment someone chooses Apply, a
 * signed-in visitor is taken straight to the application desk; everyone else
 * is sent to sign-up/sign-in with `next` pointing back to that same Apply
 * step, so the role and the intent survive the detour.
 */
export function ApplyCta({
  opportunityId,
  title,
  className = "",
}: {
  opportunityId: string;
  title: string;
  className?: string;
}) {
  const { session, loading } = useSession();
  const applyPath = `/apply/${encodeURIComponent(opportunityId)}`;
  // While the local session is being read, point at the protected handoff;
  // AuthGate will do the right thing if there is no session. Once settled,
  // an anonymous visitor goes straight to sign-up with the Apply step kept.
  const href =
    loading || session
      ? applyPath
      : `/signup?next=${encodeURIComponent(applyPath)}`;

  return (
    <Link
      href={href}
      className={`mk-btn mk-btn--primary mk-apply-cta ${className}`.trim()}
      aria-label={`Apply for this role — ${title}`}
    >
      Apply for this role
      <ArrowUpRight aria-hidden="true" size={17} />
    </Link>
  );
}
