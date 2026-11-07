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
  Card,
  Field,
  Input,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useOnboarding } from "@/lib/hooks";

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

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `entry-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function OnboardingManualPage() {
  const router = useRouter();
  const toast = useToast();
  const { completeOnboarding } = useOnboarding();

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
        yearsExperience: form.yearsExperience,
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

      await completeOnboarding("manual");
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

  return (
    <div
      className="stack"
      style={{ gap: "1.5rem", maxWidth: 720, margin: "0 auto" }}
    >
      <Card style={{ padding: "1rem 1.5rem" }}>
        <div
          className="row"
          style={{ gap: "0.5rem", overflowX: "auto", paddingBottom: "0.5rem" }}
        >
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const isCurrent = index === stepIndex;
            const isDone = index < stepIndex;
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => setStepIndex(index)}
                style={{
                  display: "inline-flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "0.35rem",
                  padding: "0.5rem 0.75rem",
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  color:
                    index <= stepIndex ? "var(--accent)" : "var(--text-muted)",
                  background:
                    index <= stepIndex ? "var(--accent-soft)" : "transparent",
                  fontSize: "0.75rem",
                  fontWeight: index <= stepIndex ? 600 : 400,
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: isDone
                      ? "var(--accent)"
                      : isCurrent
                        ? "var(--accent-soft)"
                        : "var(--border)",
                    color: isDone
                      ? "white"
                      : isCurrent
                        ? "var(--accent)"
                        : "var(--text-muted)",
                  }}
                >
                  {isDone ? <Check size={12} /> : <Icon size={12} />}
                </span>
                {step.label}
              </button>
            );
          })}
        </div>
        <div
          style={{
            height: 4,
            background: "var(--border)",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${(stepIndex / (STEPS.length - 1)) * 100}%`,
              height: "100%",
              background: "var(--accent)",
              transition: "width 0.3s",
            }}
          />
        </div>
      </Card>

      <Card className="p-6">
        <div
          className="row"
          style={{ gap: "0.6rem", alignItems: "center", marginBottom: "1.5rem" }}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: "var(--accent-soft)",
              color: "var(--accent)",
            }}
          >
            <StepIcon size={16} />
          </span>
          <div>
            <div className="eyebrow">
              Step {stepIndex + 1} of {STEPS.length}
            </div>
            <h2 style={{ fontSize: "1.3rem" }}>
              {STEPS[stepIndex].label}
            </h2>
          </div>
        </div>

        {currentStep === "basics" ? (
          <div className="stack gap-4">
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
            <div className="grid-2">
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
            <div className="grid-2">
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
            <div className="grid-2">
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
                placeholder="Backend engineer specialising in payment systems..."
              />
            </Field>
            <div className="grid-2">
              <Field label="Years of experience">
                <Input
                  type="number"
                  min={0}
                  max={60}
                  value={form.yearsExperience}
                  onChange={(event) =>
                    setField({
                      yearsExperience: Math.max(
                        0,
                        Math.min(60, Number(event.target.value) || 0),
                      ),
                    })
                  }
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
          <div className="stack gap-4">
            <div
              className="row"
              style={{
                justifyContent: "space-between",
                alignItems: "center",
                gap: "0.75rem",
                flexWrap: "wrap",
              }}
            >
              <p
                className="text-[0.85rem] text-muted m-0"
              >
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
                <Card key={entry.id} className="p-4">
                  <div
                    className="row justify-between mb-4"
                  >
                    <Badge tone="accent">Role {index + 1}</Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setExperiences(
                          experiences.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <X size={14} />
                    </Button>
                  </div>
                  <div className="grid-2 gap-3">
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
                    <div className="grid-2">
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
                    <div className="" style={{ gridColumn: "1 / -1" }}>
                      <label
                        className="row"
                        style={{
                          gap: "0.5rem",
                          alignItems: "center",
                          fontSize: "0.9rem",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
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
                    </div>
                    <div className="" style={{ gridColumn: "1 / -1" }}>
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
                </Card>
              ))
            )}
          </div>
        ) : null}

        {currentStep === "education" ? (
          <div className="stack gap-4">
            <div
              className="row"
              style={{
                justifyContent: "space-between",
                alignItems: "center",
                gap: "0.75rem",
                flexWrap: "wrap",
              }}
            >
              <p
                className="text-[0.85rem] text-muted m-0"
              >
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
                <Card key={entry.id} className="p-4">
                  <div
                    className="row justify-between mb-4"
                  >
                    <Badge tone="neutral">Entry {index + 1}</Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setEducation(education.filter((_, i) => i !== index))
                      }
                    >
                      <X size={14} />
                    </Button>
                  </div>
                  <div className="grid-2 gap-3">
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
                </Card>
              ))
            )}
          </div>
        ) : null}

        {currentStep === "skills" ? (
          <div className="stack gap-4">
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
            <Field
              label="Desired roles"
              hint="Comma separated roles you are targeting"
            >
              <Input
                value={form.desiredRoles}
                onChange={(event) =>
                  setField({ desiredRoles: event.target.value })
                }
                placeholder="Backend Engineer, Platform Engineer, DevOps Engineer"
              />
            </Field>
          </div>
        ) : null}

        {currentStep === "projects" ? (
          <div className="stack gap-4">
            <div
              className="row"
              style={{
                justifyContent: "space-between",
                alignItems: "center",
                gap: "0.75rem",
                flexWrap: "wrap",
              }}
            >
              <p
                className="text-[0.85rem] text-muted m-0"
              >
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
                <Card key={entry.id} className="p-4">
                  <div
                    className="row justify-between mb-4"
                  >
                    <Badge tone="neutral">Project {index + 1}</Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setProjects(projects.filter((_, i) => i !== index))
                      }
                    >
                      <X size={14} />
                    </Button>
                  </div>
                  <div className="grid-2 gap-3">
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
                    <div className="" style={{ gridColumn: "1 / -1" }}>
                      <Field label="Description">
                        <Textarea
                          rows={3}
                          value={entry.description}
                          onChange={(event) =>
                            updateProject(index, {
                              description: event.target.value,
                            })
                          }
                          placeholder="Integrated Stripe billing and cut payment failures by 25%..."
                        />
                      </Field>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        ) : null}

        <div
          className="row"
          style={{
            justifyContent: "space-between",
            marginTop: "1.5rem",
            paddingTop: "1rem",
            borderTop: "1px solid var(--border)",
          }}
        >
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
              onClick={handleSubmit}
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
      </Card>

      <Link
        href="/onboarding"
        style={{
          textAlign: "center",
          display: "block",
          color: "var(--accent)",
          fontSize: "0.9rem",
        }}
      >
        ← Choose a different method
      </Link>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "2rem",
        color: "var(--text-muted)",
        fontSize: "0.88rem",
      }}
    >
      {text}
    </div>
  );
}
