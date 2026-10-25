import { AshbyConnector } from "./ats/ashby.js";
import { GreenhouseConnector } from "./ats/greenhouse.js";
import { LeverConnector } from "./ats/lever.js";
import { RecruiteeConnector } from "./ats/recruitee.js";
import { SmartRecruitersConnector } from "./ats/smartrecruiters.js";
import { WorkableConnector } from "./ats/workable.js";
import { HtmlConnector } from "./html.js";
import { AjiraConnector } from "./kenya/ajira.js";
import { BrighterMondayConnector } from "./kenya/brightermonday.js";
import { JobbermanConnector } from "./kenya/jobberman.js";
import { MyJobsConnector } from "./kenya/myjobs.js";
import { OpenCarrersConnector } from "./kenya/opencarrers.js";
import { SheerLogicConnector } from "./kenya/sheerlogic.js";
import { RssConnector } from "./rss.js";
import type { Connector } from "./types.js";

export const connectors: Connector[] = [
  new GreenhouseConnector(),
  new LeverConnector(),
  new AshbyConnector(),
  new WorkableConnector(),
  new SmartRecruitersConnector(),
  new RecruiteeConnector(),
  new RssConnector(),
  new AjiraConnector(),
  new MyJobsConnector(),
  new SheerLogicConnector(),
  new OpenCarrersConnector(),
  new BrighterMondayConnector(),
  new JobbermanConnector(),
  new HtmlConnector(),
];

export function resolveConnector(url: string): Connector | null {
  return connectors.find((connector) => connector.detect(url)) ?? null;
}

export function connectorCatalog(): Array<{
  name: string;
  kind: string;
  exampleUrl: string;
}> {
  return [
    {
      name: "Greenhouse",
      kind: "ats",
      exampleUrl: "https://boards.greenhouse.io/example",
    },
    {
      name: "Lever",
      kind: "ats",
      exampleUrl: "https://jobs.lever.co/example",
    },
    {
      name: "Ashby",
      kind: "ats",
      exampleUrl: "https://jobs.ashbyhq.com/example",
    },
    {
      name: "Workable",
      kind: "ats",
      exampleUrl: "https://apply.workable.com/example",
    },
    {
      name: "SmartRecruiters",
      kind: "ats",
      exampleUrl: "https://jobs.smartrecruiters.com/example",
    },
    {
      name: "Recruitee",
      kind: "ats",
      exampleUrl: "https://example.recruitee.com",
    },
    {
      name: "RSS",
      kind: "rss",
      exampleUrl: "https://example.com/jobs.xml",
    },
    {
      name: "Ajira",
      kind: "html",
      exampleUrl: "https://www.ajira.org/",
    },
    {
      name: "MyJobs",
      kind: "html",
      exampleUrl: "https://www.myjobs.co.ke/",
    },
    {
      name: "Sheer Logic",
      kind: "html",
      exampleUrl: "https://sheerlogic.co.ke/",
    },
    {
      name: "Open Carrers",
      kind: "html",
      exampleUrl: "https://opencarrers.com/",
    },
    {
      name: "BrighterMonday",
      kind: "html",
      exampleUrl: "https://www.brightermonday.co.ke/",
    },
    {
      name: "Jobberman",
      kind: "html",
      exampleUrl: "https://www.jobberman.com/",
    },
    {
      name: "Generic web",
      kind: "html",
      exampleUrl: "https://example.com/careers",
    },
  ];
}
