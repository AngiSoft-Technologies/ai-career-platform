import type { Metadata } from "next";

/** Auth/invitation page: never indexed (mirrored in robots.ts). */
export const metadata: Metadata = {
  title: "Authorisation request",
  description: "Review and approve a sign-in request for your MboQara account.",
  robots: { index: false, follow: false, nocache: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
