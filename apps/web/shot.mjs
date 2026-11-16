import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const API = "http://localhost:8088/v1";
const WEB = "http://localhost:3003";
const OUT = "/tmp/ui-shots-v3";
mkdirSync(OUT, { recursive: true });

const res = await fetch(`${API}/auth/sign-in`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "verify@mboqara.local", password: "Verify1234!" }),
});
const session = await res.json();

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE:", m.text().slice(0, 200)); });

// Cold-compiled routes on a dev server take longer than Playwright's
// default 30s navigation timeout.
page.setDefaultNavigationTimeout(120_000);
page.setDefaultTimeout(120_000);

await page.goto(WEB, { waitUntil: "domcontentloaded" });
await page.evaluate(({ token, refresh, session }) => {
  localStorage.setItem("mboqara.auth.token", token);
  localStorage.setItem("mboqara.auth.refresh", refresh);
  localStorage.setItem("mboqara.auth.session", JSON.stringify(session));
}, { token: session.token, refresh: session.refreshToken, session });

const pages = process.argv.slice(2);
const targets = pages.length ? pages : ["/dashboard"];
for (const path of targets) {
  await page.goto(`${WEB}${path}`, { waitUntil: "domcontentloaded" });
  // wait for hydration, then for the slow ranked feed to land
  await page.waitForTimeout(1500);
  await page.waitForTimeout(9000);
  const name = path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root";
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log("shot", name);
}
await browser.close();
