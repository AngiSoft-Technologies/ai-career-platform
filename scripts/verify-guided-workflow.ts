/**
 * Offline verification for the corrected job workflow.
 *
 * Covers the pure rules that must hold before any database is involved:
 * observation redaction, value-free field/playbook storage, deterministic
 * hints, blueprint-derived submission methods, and the shared feed clauses
 * used by profession filtering and the 24-hour daily feed.
 *
 * Run: npx tsx scripts/verify-guided-workflow.ts
 */

import type {
  GuidanceDetectedField,
  SitePlaybook,
} from "../packages/contracts/src/index.js";
import {
  generateGuidanceHints,
  sanitiseBlockers,
  sanitiseDetectedFields,
  sanitiseGuidanceText,
  sanitisePlaybookSteps,
  siteKeyForHost,
} from "../services/api/src/services/guidance-policy.js";
import { submissionMethodForBlueprint } from "../services/api/src/services/application/submission-method.js";
import { opportunityFeedClauses } from "../services/api/src/services/opportunities.js";

let failures = 0;
function check(name: string, condition: boolean, actual?: unknown): void {
  if (condition) return;
  failures += 1;
  console.error(`FAIL: ${name}${actual === undefined ? "" : ` (got ${String(actual)})`}`);
}

function main(): void {
  const redacted = sanitiseGuidanceText(
    "Send to jane.doe@example.com or +254 712 345 678, code 481920, Bearer abcdefghijklmnop sk_live_ABCDEFGH1234",
  );
  check("emails are stripped", !redacted.includes("jane.doe@example.com"), redacted);
  check("phone numbers are stripped", !redacted.includes("712 345 678"), redacted);
  check("long digits are stripped", !redacted.includes("481920"), redacted);
  check("tokens are stripped", !/abcdefghijklmnop|sk_live_ABCDEFGH1234/.test(redacted), redacted);

  const detected: GuidanceDetectedField[] = [{
    key: "full_name",
    label: "Full name",
    type: "text",
    required: true,
    value: "Jane Doe",
    options: ["Nairobi"],
  }];
  const safeFields = sanitiseDetectedFields([
    ...detected,
    {
      key: "password",
      label: "Password",
      type: "password",
      required: true,
      value: "hunter2",
    },
  ]);
  check("field values are not stored", !JSON.stringify(safeFields).includes("Jane Doe"));
  check("sensitive fields are dropped", safeFields.length === 1, safeFields.length);
  check("options are retained without values", safeFields[0]?.options?.[0] === "Nairobi");
  const echoed = sanitiseDetectedFields([{
    key: "city",
    label: "City",
    type: "select",
    required: false,
    value: "Private Town",
    options: ["Private Town"],
  }]);
  check("an option echoing the typed value is dropped", echoed[0]?.options === undefined);

  const steps = sanitisePlaybookSteps([{
    label: "Full name",
    action: "fill",
    fieldKey: "full_name",
    note: "value: jane@example.com",
    value: "Jane Doe",
    answer: "secret",
  }]);
  const stepJson = JSON.stringify(steps);
  check("playbook keeps only labels/keys/actions", steps[0]?.action === "fill", stepJson);
  check("playbook never stores values", !/Jane Doe|secret|jane@example\.com/.test(stepJson), stepJson);
  check("blockers are bounded", sanitiseBlockers(["Call 0712345678", ""]).length === 1);

  const playbook: SitePlaybook = {
    id: "pb",
    siteKey: "example-com",
    host: "example.com",
    version: 2,
    status: "PUBLISHED",
    steps: [{
      label: "Full name",
      action: "fill",
      fieldKey: "full_name",
      note: "Use the approved answer.",
    }],
    blockerPatterns: [],
    confidence: 0.8,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const hints = generateGuidanceHints({
    fields: safeFields,
    blockers: [],
    approvedFieldKeys: ["full_name"],
    playbook,
    now: new Date("2026-11-26T00:00:00.000Z"),
  });
  check("one to three hints are produced", hints.length >= 1 && hints.length <= 3, hints.length);
  check("hints reference the approved field", hints.some((hint) => hint.targetFieldKey === "full_name"));
  check("hints never echo field values", !JSON.stringify(hints).includes("Jane Doe"));
  check("site keys are stable", siteKeyForHost("www.Example.com") === "example-com");

  check("email blueprint is manual_email", submissionMethodForBlueprint("email") === "manual_email");
  check("mailto blueprint is manual_email", submissionMethodForBlueprint("mailto") === "manual_email");
  check("website blueprint stays browser", submissionMethodForBlueprint("website") === "browser");
  check("unknown blueprint stays browser", submissionMethodForBlueprint(undefined) === "browser");

  const base = opportunityFeedClauses({});
  check("default feed clauses are unchanged", base.clauses.length === 2, base.clauses.join(" | "));
  const filtered = opportunityFeedClauses({
    profession: "software-engineer",
    postedSince: "2026-11-25T00:00:00.000Z",
  });
  const clauseSql = filtered.clauses.join(" ");
  check("profession filter uses EXISTS", /EXISTS \([\s\S]*opportunity_professions[\s\S]*profession_taxonomy/.test(clauseSql), clauseSql);
  check("profession filter respects the closure", clauseSql.includes("profession_closure"));
  check("posted-since is shared", clauseSql.includes("o.posted_at >="), clauseSql);
  check("profession filter adds two binds", filtered.values.length === 2, filtered.values.length);
  check("minScore is not a feed clause", !opportunityFeedClauses({ minScore: 60 }).clauses.some((clause) => clause.includes("score")));

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
