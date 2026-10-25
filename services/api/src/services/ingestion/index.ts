import type { JobSourceAdapter, RawJob } from "./types.js";
import { arbeitnowAdapter } from "./sources/arbeitnow.js";
import { remoteokAdapter } from "./sources/remoteok.js";
import { remotiveAdapter } from "./sources/remotive.js";

export const jobSourceAdapters: JobSourceAdapter[] = [
  remotiveAdapter,
  arbeitnowAdapter,
  remoteokAdapter,
];

export const adaptersByName = new Map(
  jobSourceAdapters.map((adapter) => [adapter.name.toLowerCase(), adapter]),
);

export type { JobSourceAdapter, RawJob } from "./types.js";
