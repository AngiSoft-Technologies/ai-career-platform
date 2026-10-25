import { HtmlConnector } from "../html.js";
import type { ConnectorConfig, ConnectorJob } from "../types.js";

export class SheerLogicConnector extends HtmlConnector {
  name = "Sheer Logic";
  kind = "html" as const;
  readonly url = "https://sheerlogic.co.ke/";
  readonly linkHints = ["job", "vacancy", "opportunity", "career"];

  detect(url = ""): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return (
        hostname === "sheerlogic.co.ke" ||
        hostname.endsWith(".sheerlogic.co.ke")
      );
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
