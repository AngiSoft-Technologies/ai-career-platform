"use client";

import { useRef } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  FileCheck2,
  Lightbulb,
  LockKeyhole,
  Sparkles,
} from "lucide-react";
import {
  Badge,
  Button,
  Field,
  Input,
  Panel,
  PanelHead,
  Rows,
  Row,
  SegmentedControl,
  Select,
  type Tone,
} from "@/components/ui";
import { useGuidedApply } from "./useGuidedApply";
import type { GuidanceDetectedField, GuidanceHint, SitePlaybook } from "./types";

interface Props {
  guided: ReturnType<typeof useGuidedApply>;
}

const SENSITIVE =
  /(pass(word|phrase|code)?|otp|mfa|verif(y|ication)|card|cvv|cvc|ssn|social.?security|legal|consent|terms|secret|pin)/i;

function hintTone(severity: GuidanceHint["severity"]): Tone {
  if (severity === "warning") return "warning";
  if (severity === "action") return "accent";
  return "info";
}

function playbookSteps(playbook: unknown): Array<{ label: string; action: string; note?: string }> {
  if (!playbook || typeof playbook !== "object") return [];
  const steps = (playbook as SitePlaybook).steps;
  if (!Array.isArray(steps)) return [];
  return steps.slice(0, 8).map((step) => ({
    label: step.label,
    action: step.action,
    note: step.note,
  }));
}

function FieldRow({
  field,
  guided,
}: {
  field: GuidanceDetectedField;
  guided: ReturnType<typeof useGuidedApply>;
}) {
  const manual = field.manualOnly || SENSITIVE.test(`${field.label} ${field.key} ${field.type}`);
  const typed = guided.fieldValues[field.key] ?? "";
  const isSelect = field.type.startsWith("select");
  const isFile = field.type === "file";
  const selectedDocument =
    guided.uploadSelections[field.key] ?? guided.approvedDocuments[0]?.id ?? "";

  return (
    <Row className="flex-col gap-3 px-4 py-3.5">
      <div className="flex w-full items-start gap-2.5">
        {field.value ? (
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-app-success" aria-hidden />
        ) : (
          <Circle size={16} className="mt-0.5 shrink-0 text-app-muted" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[0.82rem] leading-snug font-semibold text-app-text">{field.label}</p>
          <p className="mt-0.5 font-mono text-[0.64rem] tracking-wide text-app-muted uppercase">
            {field.type}
            {field.required ? " · required" : ""}
            {field.value ? " · value present" : ""}
          </p>
        </div>
      </div>

      {manual ? (
        <p className="pl-6 text-[0.75rem] leading-relaxed text-app-warning">
          Complete this yourself in the browser. We do not read or fill sensitive values.
        </p>
      ) : isFile ? (
        <div className="flex flex-col gap-2 pl-6 sm:flex-row sm:items-end">
          <Field label="Approved PDF" className="min-w-0 flex-1">
            <Select
              value={selectedDocument}
              onChange={(event) =>
                guided.setUploadSelections((current) => ({
                  ...current,
                  [field.key]: event.target.value,
                }))
              }
              aria-label={`Approved PDF for ${field.label}`}
            >
              <option value="">Choose a document</option>
              {guided.approvedDocuments.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.title}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={guided.busy || !selectedDocument || guided.mode !== "remote_browser"}
            onClick={() => void guided.uploadDocument(field.key, selectedDocument)}
          >
            Upload
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 pl-6 sm:flex-row sm:items-end">
          <Field label={isSelect ? "Choose a value" : "Value"} className="min-w-0 flex-1">
            {isSelect ? (
              <Select
                value={typed}
                onChange={(event) =>
                  guided.setFieldValues((current) => ({
                    ...current,
                    [field.key]: event.target.value,
                  }))
                }
                aria-label={`Value for ${field.label}`}
              >
                <option value="">Choose…</option>
                {(field.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                value={typed}
                onChange={(event) =>
                  guided.setFieldValues((current) => ({
                    ...current,
                    [field.key]: event.target.value,
                  }))
                }
                aria-label={`Value for ${field.label}`}
                placeholder="Type a value"
              />
            )}
          </Field>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={guided.busy || !typed || guided.mode !== "remote_browser"}
            onClick={() =>
              void (isSelect
                ? guided.selectField(field.key, typed)
                : guided.fillField(field.key, typed))
            }
          >
            {isSelect ? "Set" : "Fill"}
          </Button>
        </div>
      )}
    </Row>
  );
}

export function GuidanceRail({ guided }: Props) {
  const confirmRef = useRef<HTMLDialogElement>(null);
  const unacknowledged = (guided.session?.hints ?? []).filter((hint) => !hint.acknowledgedAt);
  const blockers = Array.from(
    new Set([...(guided.session?.blockers ?? []), ...(guided.state?.blockers ?? [])]),
  );
  const steps = playbookSteps(guided.playbook);

  return (
    <aside
      aria-label="Application guidance"
      className="flex w-full shrink-0 flex-col gap-4 lg:w-[24rem] lg:max-h-[calc(100vh-13rem)] lg:overflow-y-auto"
    >
      <Panel>
        <PanelHead
          eyebrow="Guidance rail"
          title="What to do next"
          description="Hints arrive as the browser sees new fields and blockers."
          action={
            guided.session ? (
              <Badge tone="success" dot>
                {guided.session.status.toLowerCase()}
              </Badge>
            ) : null
          }
        />
        <div className="border-t border-app-border px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              label="Browser mode"
              size="sm"
              value={guided.mode}
              options={[
                { value: "remote_browser", label: "Private browser" },
                { value: "companion_tab", label: "My own tab" },
              ]}
              onChange={(value) => {
                if (guided.session && !guided.busy) void guided.changeMode(value);
              }}
            />
            {guided.submitted ? <Badge tone="success">Submit clicked</Badge> : null}
          </div>
          <p className="mt-3 text-[0.75rem] leading-relaxed text-app-muted">
            {guided.mode === "remote_browser"
              ? "This browser starts empty. It cannot use your saved logins, and the site may block automation."
              : "We cannot see your own tab. Use the checklist here and confirm each step yourself."}
          </p>
        </div>
      </Panel>

      {blockers.length ? (
        <div
          role="alert"
          className="rounded-app-lg border border-app-warning/40 bg-app-warning/10 p-4 text-app-warning"
        >
          <p className="flex items-center gap-2 text-[0.82rem] font-semibold">
            <AlertTriangle size={15} aria-hidden />
            Something needs your attention
          </p>
          <ul className="mt-2 space-y-1 text-[0.78rem] leading-relaxed">
            {blockers.slice(0, 5).map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Panel>
        <PanelHead
          eyebrow="Guidance popups"
          title="Hints for this page"
          description="Acknowledging a hint removes it from this list."
        />
        {/* One polite live region for hints; blockers use the alert above. */}
        <Rows className="border-t border-app-border">
          {unacknowledged.length ? (
            unacknowledged.map((hint) => (
              <Row key={hint.id} className="flex-col gap-2 px-4 py-3.5" as="div">
                <div className="flex w-full items-start gap-2">
                  <Lightbulb size={15} className="mt-0.5 shrink-0 text-app-accent" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[0.82rem] font-semibold text-app-text">{hint.title}</p>
                      <Badge tone={hintTone(hint.severity)}>{hint.severity}</Badge>
                    </div>
                    <p className="mt-1 text-[0.78rem] leading-relaxed text-app-muted">{hint.body}</p>
                  </div>
                </div>
                <div className="pl-6">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void guided.ackHint(hint.id)}
                  >
                    Got it
                  </Button>
                </div>
              </Row>
            ))
          ) : (
            <Row className="px-4 py-4 text-[0.78rem] text-app-muted" as="div">
              <span role="status" aria-live="polite">
                No new hints. The checklist below reflects what the browser can see.
              </span>
            </Row>
          )}
        </Rows>
      </Panel>

      <Panel>
        <PanelHead
          eyebrow="Detected fields"
          title="Application checklist"
          description={`${guided.state?.fields.length ?? 0} field${guided.state?.fields.length === 1 ? "" : "s"} on the current page.`}
        />
        <Rows className="border-t border-app-border">
          {guided.state?.fields.length ? (
            guided.state.fields.map((field) => (
              <FieldRow key={field.key} field={field} guided={guided} />
            ))
          ) : (
            <Row className="px-4 py-4 text-[0.78rem] text-app-muted" as="div">
              Open the private browser to detect the form fields.
            </Row>
          )}
        </Rows>
      </Panel>

      <Panel>
        <PanelHead
          eyebrow="Approved documents"
          title="Ready to attach"
          description="Only preparation-approved PDFs can be uploaded."
        />
        <Rows className="border-t border-app-border">
          {guided.approvedDocuments.length ? (
            guided.approvedDocuments.map((document) => (
              <Row key={document.id} className="items-center gap-3 px-4 py-3" as="div">
                <FileCheck2 size={16} className="shrink-0 text-app-success" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.82rem] font-medium text-app-text">{document.title}</p>
                  <p className="font-mono text-[0.62rem] tracking-wide text-app-muted uppercase">
                    {document.type}
                  </p>
                </div>
                <Badge tone="success">Approved</Badge>
              </Row>
            ))
          ) : (
            <Row className="px-4 py-4 text-[0.78rem] text-app-muted" as="div">
              No approved PDFs are attached to this preparation yet.
            </Row>
          )}
        </Rows>
      </Panel>

      {steps.length ? (
        <Panel>
          <PanelHead
            eyebrow="Learned from this site"
            title="Known steps"
            description="Proposed from earlier applications. Always verify them on the page."
          />
          <Rows className="border-t border-app-border">
            {steps.map((step, index) => (
              <Row key={`${step.label}-${index}`} className="px-4 py-3" as="div">
                <Sparkles size={14} className="mt-0.5 shrink-0 text-app-accent" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[0.8rem] font-medium text-app-text">{step.label}</p>
                  <p className="font-mono text-[0.62rem] tracking-wide text-app-muted uppercase">
                    {step.action}
                    {step.note ? ` · ${step.note}` : ""}
                  </p>
                </div>
              </Row>
            ))}
          </Rows>
        </Panel>
      ) : null}

      <Panel>
        <PanelHead
          eyebrow="Submission"
          title="You stay in control"
          description="Nothing is sent until you explicitly confirm it."
        />
        <div className="flex flex-col gap-3 border-t border-app-border px-4 py-4">
          <p className="flex items-start gap-2 text-[0.75rem] leading-relaxed text-app-muted">
            <LockKeyhole size={14} className="mt-0.5 shrink-0 text-app-warning" aria-hidden />
            Review the screenshot and checklist before continuing. The runtime refuses any submit
            command without explicit confirmation.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={
                !guided.session ||
                !guided.state ||
                guided.mode !== "remote_browser" ||
                guided.busy ||
                guided.submitted
              }
              onClick={() => confirmRef.current?.showModal()}
            >
              {guided.submitted ? "Submit clicked" : "Review and submit"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={!guided.session || guided.busy}
              onClick={() => void guided.endSession()}
            >
              Close workspace
            </Button>
          </div>
        </div>
      </Panel>

      <style>{`
        dialog:modal { overscroll-behavior: contain; }
        dialog::backdrop { overflow: hidden; overscroll-behavior: contain; background: rgba(4, 4, 8, 0.78); }
      `}</style>
      <dialog
        ref={confirmRef}
        aria-labelledby="guided-submit-title"
        className="w-[min(32rem,calc(100vw-2rem))] rounded-app-lg border border-app-border bg-app-surface-solid p-0 text-app-text shadow-app-lg"
      >
        <div className="border-b border-app-border px-5 py-4">
          <h2 id="guided-submit-title" className="text-[1rem] font-semibold">
            Submit this application now?
          </h2>
        </div>
        <div className="space-y-3 px-5 py-4 text-[0.85rem] leading-relaxed text-app-muted">
          <p>
            This will click the submit control on the employer page you can see in the live frame.
            mboqara does not decide that you are ready — you do.
          </p>
          <p className="text-app-warning">
            Check that sensitive answers, consent boxes and attachments are correct in the page
            itself. We cannot read password, OTP or card fields on your behalf.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-app-border px-5 py-3.5">
          <Button type="button" variant="ghost" onClick={() => confirmRef.current?.close()}>
            Cancel
          </Button>
          <Button
            type="button"
            loading={guided.busy}
            onClick={() => {
              void guided.confirmSubmission().finally(() => confirmRef.current?.close());
            }}
          >
            I reviewed it — submit
          </Button>
        </div>
      </dialog>
    </aside>
  );
}
