export const API_VERSION = "v1";
export const API_VERSION_HEADER = "x-api-version";
export const SUPPORTED_API_VERSIONS = ["v1"] as const;

export type ApiVersion = (typeof SUPPORTED_API_VERSIONS)[number];
