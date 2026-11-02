import type { Metadata } from "next";

/** Auth/invitation page: never indexed (mirrored in robots.ts). */
export const metadata: Metadata = {
  title: "Create your MboQara account",
  description: "Create a free MboQara account, build your career profile, and start discovering jobs worldwide, tailored CVs and application tracking.",
  robots: { index: false, follow: false, nocache: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
