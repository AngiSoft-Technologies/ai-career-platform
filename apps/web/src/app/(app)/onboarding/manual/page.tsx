"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Briefcase,
  Check,
  Code,
  GraduationCap,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Field,
  Input,
  Meter,
  Page,
  Panel,
  Select,
  Textarea,
  cx,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { rememberOnboardingPath } from "@/lib/onboarding";

const SENIORITIES = ["intern", "junior", "mid", "senior", "lead"] as const;

const STEPS = [
  { key: "basics", label: "Basics", icon: Sparkles },
  { key: "experience", label: "Experience", icon: Briefcase },
  { key: "education", label: "Education", icon: GraduationCap },
  { key: "skills", label: "Skills", icon: Code },
  { key: "projects", label: "Projects", icon: Award },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

interface ExperienceEntry {
  id: string;
  title: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
}

interface EducationEntry {
  id: string;
  degree: string;
  institution: string;
  location: string;
  graduationDate: string;
  gpa: string;
}

interface ProjectEntry {
  id: string;
  name: string;
  description: string;
  technologies: string;
  url: string;
}

/** Clamped once, not on every keystroke: an empty box must stay empty. */
function clampYears(value: string): string {
  if (value.trim() === "") return "0";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "0";
  return String(Math.max(0, Math.min(60, Math.trunc(parsed))));
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `entry-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function OnboardingManualPage() {
  const router = useRouter();
  const toast = useToast();

  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    fullName: "",
    headline: "",
    location: "",
    country: "",
    email: "",
    phone: "",
    linkedin: "",
    portfolio: "",
    summary: "",
    yearsExperience: 0,
    seniority: "junior",
    skills: "",
    desiredRoles: "",
  });

  const [experiences, setExperiences] = useState<ExperienceEntry[]>([]);
  const [education, setEducation] = useState<EducationEntry[]>([]);
  const [projects, setProjects] = useState<ProjectEntry[]>([]);

  // The years field is text while it is being typed and a number once it is
  // not, so clearing the box does not snap back to zero mid-keystroke.
  const [yearsInput, setYearsInput] = useState("0");

  const currentStep = STEPS[stepIndex].key as StepKey;
  const StepIcon = STEPS[stepIndex].icon;

  const setField = (patch: Partial<typeof form>) =>
    setForm((previous) => ({ ...previous, ...patch }));

  const updateExperience = (index: number, patch: Partial<ExperienceEntry>) =>
    setExperiences((previous) =>
      previous.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    );

  const updateEducation = (index: number, patch: Partial<EducationEntry>) =>
    setEducation((previous) =>
      previous.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    );

  const updateProject = (index: number, patch: Partial<ProjectEntry>) =>
    setProjects((previous) =>
      previous.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    );

  const nextStep = () => {
    if (stepIndex < STEPS.length - 1) setStepIndex(stepIndex + 1);
  };

  const prevStep = () => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  };

  const splitList = (value: string) =>
    value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload = {
        fullName: form.fullName.trim(),
        headline: form.headline.trim(),
        summary: form.summary.trim(),
        location: form.location.trim(),
        country: form.country.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        linkedin: form.linkedin.trim(),
        portfolio: form.portfolio.trim(),
        yearsExperience: Number(clampYears(yearsInput)),
        seniority: form.seniority,
        skills: splitList(form.skills),
        desiredRoles: splitList(form.desiredRoles),
        experiences: experiences
          .filter((entry) => entry.title.trim() || entry.company.trim())
          .map((entry) => ({
            title: entry.title.trim(),
            company: entry.company.trim(),
            location: entry.location.trim(),
            startDate: entry.startDate,
            endDate: entry.current ? "" : entry.endDate,
            current: entry.current,
            description: entry.description.trim(),
          })),
        education: education
          .filter((entry) => entry.degree.trim() || entry.institution.trim())
          .map((entry) => ({
            degree: entry.degree.trim(),
            institution: entry.institution.trim(),
            location: entry.location.trim(),
            graduationDate: entry.graduationDate,
            gpa: entry.gpa.trim(),
          })),
        projects: projects
          .filter((entry) => entry.name.trim())
          .map((entry) => ({
            name: entry.name.trim(),
            description: entry.description.trim(),
            technologies: entry.technologies.trim(),
            url: entry.url.trim(),
          })),
      };

      const { document } = await api.post<{ document: { id: string } }>(
        "/profile/resume",
        payload,
      );

      rememberOnboardingPath("manual");
      toast.push("Resume created. Let's set your matching preferences.", "success");
      router.push(`/onboarding/preferences?documentId=${document.id}`);
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Failed to create resume",
        "danger",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case "basics":
        return Boolean(form.fullName.trim() && form.headline.trim());
      case "experience":
        return experiences.length > 0;
      case "skills":
        return form.skills.trim().length > 0;
      default:
        return true;
    }
  };

  const progress = (stepIndex / (STEPS.length - 1)) * 100;

  return (
    <Page className="mx-auto max-w-[860px]">
      {/* The stepper. Each step is a real button — a person who has already
          answered a step should be able to jump back to it. */}
      <Panel className="p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-mono text-[0.6rem] font-semibold tracking-[0.2em] text-app-muted uppercase">
            Resume builder
          </p>
          <p className="font-mono text-[0.7rem] tabular-nums text-app-muted">
            Step {stepIndex + 1} of {STEPS.length}
          </p>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-2.5">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const isCurrent = index === stepIndex;
            const isDone = index < stepIndex;
            const reachable = index <= stepIndex;
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => setStepIndex(index)}
                aria-current={isCurrent || undefined}
                className={cx(
                  "inline-flex cursor-pointer flex-col items-center gap-1.5 rounded-app-md px-3 py-2 text-[0.75rem] whitespace-nowrap",
                  "transition-colors duration-150",
                  reachable
                    ? "bg-app-accent-soft font-semibold text-app-accent"
                    : "text-app-muted hover:bg-app-surface-2/60",
                )}
              >
                <span
                  className={cx(
                    "grid size-7 place-items-center rounded-full border",
                    isDone
                      ? "border-transparent bg-app-accent text-app-accent-contrast"
                      : isCurrent
                        ? "border-app-accent bg-app-accent-soft text-app-accent"
                        : "border-app-border bg-app-surface-2 text-app-muted",
                  )}
                >
                  {isDone ? <Check size={13} strokeWidth={3} /> : <Icon size={13} />}
                </span>
                {step.label}
              </button>
            );
          })}
        </div>
        <Meter value={progress} />
      </Panel>

      <Panel className="p-5 sm:p-7">
        <div className="mb-6 flex items-center gap-3 border-b border-app-border pb-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-app-md border border-app-accent/30 bg-app-accent-soft text-app-accent">
            <StepIcon size={19} />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[0.6rem] font-semibold tracking-[0.2em] text-app-muted uppercase">
              Step {stepIndex + 1} of {STEPS.length}
            </p>
            <h2 className="mt-1 text-[1.35rem] leading-tight font-semibold tracking-[-0.015em] text-app-text">
              {STEPS[stepIndex].label}
            </h2>
          </div>
        </div>

        {currentStep === "basics" ? (
          <div className="flex flex-col gap-4">
            <Field label="Full name">
              <Input
                value={form.fullName}
                onChange={(event) => setField({ fullName: event.target.value })}
                placeholder="Jane Doe"
              />
            </Field>
            <Field
              label="Professional headline"
              hint="One line an employer would understand instantly"
            >
              <Input
                value={form.headline}
                onChange={(event) => setField({ headline: event.target.value })}
                placeholder="Backend Engineer · Payments · 5 years"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Location">
                <Input
                  value={form.location}
                  onChange={(event) => setField({ location: event.target.value })}
                  placeholder="Nairobi, Kenya"
                />
              </Field>
              <Field label="Country">
                <Input
                  value={form.country}
                  onChange={(event) => setField({ country: event.target.value })}
                  placeholder="Kenya"
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(event) => setField({ email: event.target.value })}
                  placeholder="jane@example.com"
                />
              </Field>
              <Field label="Phone">
                <Input
                  value={form.phone}
                  onChange={(event) => setField({ phone: event.target.value })}
                  placeholder="+254 7XX XXX XXX"
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="LinkedIn URL">
                <Input
                  value={form.linkedin}
                  onChange={(event) => setField({ linkedin: event.target.value })}
                  placeholder="linkedin.com/in/janedoe"
                />
              </Field>
              <Field label="Portfolio / website">
                <Input
                  value={form.portfolio}
                  onChange={(event) => setField({ portfolio: event.target.value })}
                  placeholder="janedoe.dev"
                />
              </Field>
            </div>
            <Field
              label="Professional summary"
              hint="Two or three sentences. This is what recruiters read first."
            >
              <Textarea
                rows={4}
                value={form.summary}
                onChange={(event) => setField({ summary: event.target.value })}
                placeholder="Backend engineer specialising in payment systems…"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Years of experience">
                {/* The value is kept as text while it is being typed:
                    clamping on every keystroke turned an empty box back
                    into "0" and fought the caret. It is clamped once, on
                    blur and on submit. */}
                <Input
                  type="number"
                  min={0}
                  max={60}
                  value={yearsInput}
                  onChange={(event) => setYearsInput(event.target.value)}
                  onBlur={() => setYearsInput(clampYears(yearsInput))}
                />
              </Field>
              <Field label="Seniority level">
                <Select
                  value={form.seniority}
                  onChange={(event) => setField({ seniority: event.target.value })}
                >
                  {SENIORITIES.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
        ) : null}

        {currentStep === "experience" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[0.85rem] leading-relaxed text-app-muted">
                Add each role separately. Most recent first.
              </p>
              <Button
                variant="outline"
                icon={<Plus size={14} />}
                onClick={() =>
                  setExperiences([
                    ...experiences,
                    {
                      id: newId(),
                      title: "",
                      company: "",
                      location: "",
                      startDate: "",
                      endDate: "",
                      current: false,
                      description: "",
                    },
                  ])
                }
              >
                Add role
              </Button>
            </div>
            {experiences.length === 0 ? (
              <EmptyHint text='No experience added yet. Click "Add role" to start.' />
            ) : (
              experiences.map((entry, index) => (
                <Panel key={entry.id} className="p-4">
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <Badge tone="accent">Role {index + 1}</Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Remove role"
                      onClick={() =>
                        setExperiences(experiences.filter((_, i) => i !== index))
                      }
                    >
                      <X size={14} />
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Job title">
                      <Input
                        value={entry.title}
                        onChange={(event) =>
                          updateExperience(index, { title: event.target.value })
                        }
                        placeholder="Senior Backend Engineer"
                      />
                    </Field>
                    <Field label="Company">
                      <Input
                        value={entry.company}
                        onChange={(event) =>
                          updateExperience(index, { company: event.target.value })
                        }
                        placeholder="Acme Corp"
                      />
                    </Field>
                    <Field label="Location">
                      <Input
                        value={entry.location}
                        onChange={(event) =>
                          updateExperience(index, {
                            location: event.target.value,
                          })
                        }
                        placeholder="Nairobi, Kenya"
                      />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Start date">
                        <Input
                          type="month"
                          value={entry.startDate}
                          onChange={(event) =>
                            updateExperience(index, {
                              startDate: event.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field label="End date">
                        <Input
                          type="month"
                          value={entry.endDate}
                          disabled={entry.current}
                          onChange={(event) =>
                            updateExperience(index, {
                              endDate: event.target.value,
                            })
                          }
                        />
                      </Field>
                    </div>
                    <label className="col-span-full flex cursor-pointer items-center gap-2.5 text-[0.9rem] text-app-soft">
                      <input
                        type="checkbox"
                        className="accent-[var(--accent)]"
                        checked={entry.current}
                        onChange={(event) =>
                          updateExperience(index, {
                            current: event.target.checked,
                            endDate: event.target.checked
                              ? ""
                              : entry.endDate,
                          })
                        }
                      />
                      Currently working here
                    </label>
                    <div className="col-span-full">
                      <Field
                        label="Description"
                        hint="Use action verbs and measurable results. One bullet per line."
                      >
                        <Textarea
                          rows={4}
                          value={entry.description}
                          onChange={(event) =>
                            updateExperience(index, {
                              description: event.target.value,
                            })
                          }
                          placeholder={
                            "• Built a payment pipeline handling $10M/month\n• Cut latency 40% with Redis caching\n• Led a team of four engineers"
                          }
                        />
                      </Field>
                    </div>
                  </div>
                </Panel>
              ))
            )}
          </div>
        ) : null}

        {currentStep === "education" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[0.85rem] leading-relaxed text-app-muted">
                Degrees, certifications, and bootcamps.
              </p>
              <Button
                variant="outline"
                icon={<Plus size={14} />}
                onClick={() =>
                  setEducation([
                    ...education,
                    {
                      id: newId(),
                      degree: "",
                      institution: "",
                      location: "",
                      graduationDate: "",
                      gpa: "",
                    },
                  ])
                }
              >
                Add entry
              </Button>
            </div>
            {education.length === 0 ? (
              <EmptyHint text='No education added yet. Click "Add entry" to start.' />
            ) : (
              education.map((entry, index) => (
                <Panel key={entry.id} className="p-4">
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <Badge tone="neutral">Entry {index + 1}</Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Remove entry"
                      onClick={() =>
                        setEducation(education.filter((_, i) => i !== index))
                      }
                    >
                      <X size={14} />
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Degree / certification">
                      <Input
                        value={entry.degree}
                        onChange={(event) =>
                          updateEducation(index, { degree: event.target.value })
                        }
                        placeholder="B.Sc. Computer Science"
                      />
                    </Field>
                    <Field label="Institution">
                      <Input
                        value={entry.institution}
                        onChange={(event) =>
                          updateEducation(index, {
                            institution: event.target.value,
                          })
                        }
                        placeholder="University of Nairobi"
                      />
                    </Field>
                    <Field label="Location">
                      <Input
                        value={entry.location}
                        onChange={(event) =>
                          updateEducation(index, {
                            location: event.target.value,
                          })
                        }
                        placeholder="Nairobi, Kenya"
                      />
                    </Field>
                    <Field label="Graduation date">
                      <Input
                        type="month"
                        value={entry.graduationDate}
                        onChange={(event) =>
                          updateEducation(index, {
                            graduationDate: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="GPA (optional)">
                      <Input
                        value={entry.gpa}
                        onChange={(event) =>
                          updateEducation(index, { gpa: event.target.value })
                        }
                        placeholder="3.8/4.0"
                      />
                    </Field>
                  </div>
                </Panel>
              ))
            )}
          </div>
        ) : null}

        {currentStep === "skills" ? (
          <div className="flex flex-col gap-4">
            <Field
              label="Technical skills"
              hint="Comma or line separated. Group by category if helpful."
            >
              <Textarea
                rows={5}
                value={form.skills}
                onChange={(event) => setField({ skills: event.target.value })}
                placeholder={
                  "Languages: TypeScript, Python, Go\nFrameworks: React, Node.js, Next.js\nDatabases: PostgreSQL, Redis\nCloud: AWS, Docker, Kubernetes"
                }
              />
            </Field>
            <Field label="Desired roles" hint="Comma separated roles you are targeting">
              <Input
                value={form.desiredRoles}
                onChange={(event) => setField({ desiredRoles: event.target.value })}
                placeholder="Backend Engineer, Platform Engineer, DevOps Engineer"
              />
            </Field>
          </div>
        ) : null}

        {currentStep === "projects" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[0.85rem] leading-relaxed text-app-muted">
                Side projects, open source, publications, awards.
              </p>
              <Button
                variant="outline"
                icon={<Plus size={14} />}
                onClick={() =>
                  setProjects([
                    ...projects,
                    {
                      id: newId(),
                      name: "",
                      description: "",
                      technologies: "",
                      url: "",
                    },
                  ])
                }
              >
                Add project
              </Button>
            </div>
            {projects.length === 0 ? (
              <EmptyHint text='No projects added yet. Click "Add project" to start.' />
            ) : (
              projects.map((entry, index) => (
                <Panel key={entry.id} className="p-4">
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <Badge tone="neutral">Project {index + 1}</Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Remove project"
                      onClick={() =>
                        setProjects(projects.filter((_, i) => i !== index))
                      }
                    >
                      <X size={14} />
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Project name">
                      <Input
                        value={entry.name}
                        onChange={(event) =>
                          updateProject(index, { name: event.target.value })
                        }
                        placeholder="Payment gateway integration"
                      />
                    </Field>
                    <Field label="Technologies">
                      <Input
                        value={entry.technologies}
                        onChange={(event) =>
                          updateProject(index, {
                            technologies: event.target.value,
                          })
                        }
                        placeholder="Node.js, PostgreSQL, Stripe API"
                      />
                    </Field>
                    <Field label="Project URL (optional)">
                      <Input
                        value={entry.url}
                        onChange={(event) =>
                          updateProject(index, { url: event.target.value })
                        }
                        placeholder="github.com/user/project"
                      />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="Description">
                        <Textarea
                          rows={3}
                          value={entry.description}
                          onChange={(event) =>
                            updateProject(index, {
                              description: event.target.value,
                            })
                          }
                          placeholder="Integrated Stripe billing and cut payment failures by 25%…"
                        />
                      </Field>
                    </div>
                  </div>
                </Panel>
              ))
            )}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-app-border pt-4">
          <Button
            variant="ghost"
            icon={<ArrowLeft size={14} />}
            onClick={prevStep}
            disabled={stepIndex === 0}
          >
            Back
          </Button>
          {stepIndex === STEPS.length - 1 ? (
            <Button
              size="lg"
              icon={<Sparkles size={14} />}
              loading={submitting}
              onClick={() => void handleSubmit()}
              disabled={!canProceed()}
            >
              Create resume
            </Button>
          ) : (
            <Button
              size="lg"
              icon={<ArrowRight size={14} />}
              onClick={nextStep}
              disabled={!canProceed()}
            >
              Next
            </Button>
          )}
        </div>
      </Panel>

      <Link
        href="/onboarding"
        className="text-center text-[0.9rem] text-app-accent transition-opacity hover:opacity-80"
      >
        ← Choose a different method
      </Link>
    </Page>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="py-8 text-center text-[0.88rem] leading-relaxed text-app-muted">{text}</div>
  );
}