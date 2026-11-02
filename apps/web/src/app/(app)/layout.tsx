import type { Metadata } from "next";
import { AppShellClient } from "./app-shell-client";

/**
 * The signed-in app is not public content: no page under this route group
 * should be indexed or followed by crawlers (mirrored in robots.ts).
 */
export const metadata: Metadata = {
  title: {
    default: "MboQara app",
    template: "%s | MboQara app",
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      "max-snippet": -1,
      "max-image-preview": "none",
    },
  },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShellClient>{children}</AppShellClient>;
}
