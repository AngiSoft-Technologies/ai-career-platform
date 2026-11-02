import type { Metadata } from "next";

/** Auth/invitation page: never indexed (mirrored in robots.ts). */
export const metadata: Metadata = {
  title: "Sign in to MboQara",
  description: "Sign in to your MboQara account to continue your job search, review your applications and keep your CVs and cover letters in one place.",
  robots: { index: false, follow: false, nocache: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
