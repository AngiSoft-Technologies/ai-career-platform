import { RouteTransition } from "@/components/marketing/route-transition";

/**
 * Next.js mounts this per route change, which is what makes a page
 * transition possible — see route-transition.tsx.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <RouteTransition>{children}</RouteTransition>;
}
