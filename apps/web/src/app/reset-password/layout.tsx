import type { Metadata } from "next";

/** Auth/invitation page: never indexed (mirrored in robots.ts). */
export const metadata: Metadata = {
  title: "Reset your MboQara password",
  description: "Request a password reset link to get back into your MboQara account.",
  robots: { index: false, follow: false, nocache: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
