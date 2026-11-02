import type { Metadata } from "next";

/** Auth/invitation page: never indexed (mirrored in robots.ts). */
export const metadata: Metadata = {
  title: "Signing you in",
  description: "Completing your MboQara sign-in.",
  robots: { index: false, follow: false, nocache: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
