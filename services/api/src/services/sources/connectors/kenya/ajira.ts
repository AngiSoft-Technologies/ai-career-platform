import { HtmlConnector } from "../html.js";
import type { ConnectorConfig, ConnectorJob } from "../types.js";

export class AjiraConnector extends HtmlConnector {
  name = "Ajira";
  kind = "html" as const;
  readonly url = "https://www.ajira.org/";
  readonly linkHints = ["job", "vacancy", "tender", "ngo"];

  detect(url = ""): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return hostname === "ajira.org" || hostname.endsWith(".ajira.org");
    } catch {
      return false;
    }
  }

  async fetchJobs(config: ConnectorConfig): Promise<ConnectorJob[]> {
    const options: Record<string, unknown> = { ...(config.options ?? {}) };
    options.linkHints = this.linkHints;
    if (typeof options.companyName !== "string" || !options.companyName.trim()) {
      options.companyName = this.name;
    }

    const jobs = await super.fetchJobs({
      ...config,
      url: config.url || this.url,
      options,
    });
    const location = typeof options.location === "string" ? options.location : undefined;
    const country = typeof options.country === "string" ? options.country : undefined;
    if (!location && !country) return jobs;

    return jobs.map((job) => ({
      ...job,
      ...(location && !job.location ? { location } : {}),
      ...(country && !job.country ? { country } : {}),
    }));
  }
}
