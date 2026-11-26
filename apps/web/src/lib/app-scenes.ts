import { CDN_URL } from "./cdn";

/**
 * One photographic scene per authenticated area.
 *
 * The signed-in app used to be a wall of grey panels with a decorative
 * gradient on top. Each area now gets a real photograph from the shared CDN,
 * chosen for what the person is doing there. The map lives in one file so the
 * visual language stays consistent and a route never invents its own art.
 */
export interface AppScene {
  src: string;
  alt: string;
  caption?: string;
  /** Reserved for the few surfaces where motion earns its weight. */
  video?: string;
  poster?: string;
}

const IMAGES = `${CDN_URL}/images/mboqara`;
const VIDEOS = `${CDN_URL}/images/mboqara`;

export const SCENES: AppScene[] = [
  {
    src: `${IMAGES}/nairobi-skyline.webp`,
    alt: "The Nairobi skyline at dusk",
    caption: "Nairobi · where the work happens",
    video: `${VIDEOS}/radar-loop.mp4`,
    poster: `${IMAGES}/radar-poster.jpg`,
  }, // /dashboard
  {
    src: `${IMAGES}/career-fair.webp`,
    alt: "Recruiters and candidates at a career fair",
    caption: "Open roles · refreshed continuously",
  }, // /opportunities
  {
    src: `${IMAGES}/careers/engineering-professional.webp`,
    alt: "An engineer working through a technical brief",
    caption: "Ranked against your profile",
  }, // /matches
  {
    src: `${IMAGES}/handshake.webp`,
    alt: "Two colleagues shaking hands after an agreement",
    caption: "Your pipeline · one step at a time",
  }, // /applications
  {
    src: `${IMAGES}/woman-laptop.webp`,
    alt: "A professional writing at a laptop",
    caption: "Documents · kept current",
  }, // /documents
  {
    src: `${IMAGES}/mobile-worker.webp`,
    alt: "A professional working from a phone",
    caption: "Follow-ups · nothing slips",
  }, // /followups
  {
    src: `${IMAGES}/nairobi-at-night.webp`,
    alt: "Nairobi at night",
    caption: "Signals · delivered as they happen",
  }, // /notifications
  {
    src: `${IMAGES}/careers/women-in-tech.webp`,
    alt: "A technology professional at work",
    caption: "Your profile · your terms",
  }, // /profile and /verify
  {
    src: `${IMAGES}/team-meeting.webp`,
    alt: "A team working together around a table",
    caption: "People · not just contacts",
  }, // /connections and /moderation
  {
    src: `${IMAGES}/careers/lagos-career-story.webp`,
    alt: "A professional in Lagos",
    caption: "Sources · checked before they reach you",
  }, // /sources
  {
    src: `${IMAGES}/careers/technology-professional.webp`,
    alt: "A professional working at a laptop",
    caption: "Preferences · under your control",
  }, // /settings and /support
  {
    src: `${IMAGES}/careers/healthcare-professional.webp`,
    alt: "A healthcare professional at work",
    caption: "Help · from people who know the platform",
  }, // /support
  {
    src: `${IMAGES}/careers/women-in-tech.webp`,
    alt: "A technology professional mentoring a colleague",
    caption: "Getting started · three short steps",
  }, // /onboarding
];

const ROUTE_SCENES: Array<{ prefixes: string[]; scene: AppScene }> = [
  { prefixes: ["/dashboard"], scene: SCENES[0] },
  { prefixes: ["/opportunities", "/saved"], scene: SCENES[1] },
  { prefixes: ["/matches"], scene: SCENES[2] },
  { prefixes: ["/applications"], scene: SCENES[3] },
  { prefixes: ["/documents"], scene: SCENES[4] },
  { prefixes: ["/followups"], scene: SCENES[5] },
  { prefixes: ["/notifications"], scene: SCENES[6] },
  { prefixes: ["/profile", "/verify"], scene: SCENES[7] },
  { prefixes: ["/connections", "/moderation"], scene: SCENES[8] },
  { prefixes: ["/sources", "/admin"], scene: SCENES[9] },
  { prefixes: ["/settings", "/automation"], scene: SCENES[10] },
  { prefixes: ["/support"], scene: SCENES[11] },
  { prefixes: ["/onboarding"], scene: SCENES[12] },
];

const FALLBACK = SCENES[1];

/** Resolve a route to its scene. Sub-routes and detail pages inherit the area's art. */
export function sceneForPath(pathname: string): AppScene {
  const match = ROUTE_SCENES.find(({ prefixes }) =>
    prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)),
  );
  return match?.scene ?? FALLBACK;
}
