"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  ArrowRight,
  Bell,
  MapPin,
  Plane,
  Wifi,
} from "lucide-react";
import {
  Badge,
  Button,
  Field,
  Input,
  Page,
  Panel,
  PanelHead,
  Rows,
  Row,
  Select,
  Skeleton,
  Switch,
  cx,
  useToast,
} from "@/components/ui";
import { SceneBackdrop } from "@/components/app-scene";
import { sceneForPath } from "@/lib/app-scenes";
import { api } from "@/lib/api";
import { useOnboarding } from "@/lib/hooks";
import { takeOnboardingPath } from "@/lib/onboarding";

const EMPLOYMENT_TYPES = [
  { key: "full_time", label: "Full time" },
  { key: "part_time", label: "Part time" },
  { key: "contract", label: "Contract" },
  { key: "internship", label: "Internship" },
  { key: "industrial_attachment", label: "Industrial attachment" },
  { key: "trainee", label: "Trainee" },
  { key: "freelance", label: "Freelance" },
];

interface Preferences {
  preferredCountries: string[];
  preferredLocations: string[];
  preferredRoles: string[];
  desiredSeniority: string;
  remoteOnly: boolean;
  willingToRelocate: boolean;
  notificationsEnabled: boolean;
}

function OnboardingPreferencesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const { completeOnboarding } = useOnboarding();
  const documentId = searchParams.get("documentId") ?? "";

  const [preferences, setPreferences] = useState<Preferences>({
    preferredCountries: [],
    preferredLocations: [],
    preferredRoles: [],
    desiredSeniority: "junior",
    remoteOnly: false,
    willingToRelocate: false,
    notificationsEnabled: true,
  });
  const [countriesInput, setCountriesInput] = useState("");
  const [locationsInput, setLocationsInput] = useState("");
  const [rolesInput, setRolesInput] = useState("");
  const [saving, setSaving] = useState(false);

  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    api
      .get<{ preferences: Partial<Preferences> }>("/profile/preferences")
      .then((response) => {
        const saved = response.preferences;
        if (!saved) return;
        setPreferences((previous) => ({
          ...previous,
          ...saved,
          preferredCountries: saved.preferredCountries ?? [],
          preferredLocations: saved.preferredLocations ?? [],
          preferredRoles: saved.preferredRoles ?? [],
        }));
        setCountriesInput((saved.preferredCountries ?? []).join(", "));
        setLocationsInput((saved.preferredLocations ?? []).join(", "));
        setRolesInput((saved.preferredRoles ?? []).join(", "));
      })
      .catch(() => {
        // An empty form that looks "saved" is how preferences get wiped:
        // say so, and let the person type them again rather than pretend.
        setLoadFailed(true);
      });
  }, []);

  const split = (value: string) =>
    value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);

  const finish = async (path?: "upload" | "linkedin" | "manual") => {
    await completeOnboarding(path);
    router.push(documentId ? `/documents/${documentId}` : "/documents");
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        preferredCountries: split(countriesInput),
        preferredLocations: split(locationsInput),
        preferredRoles: split(rolesInput),
        desiredSeniority: preferences.desiredSeniority,
        remoteOnly: preferences.remoteOnly,
        willingToRelocate: preferences.willingToRelocate,
        notificationsEnabled: preferences.notificationsEnabled,
      };
      await api.put("/profile/preferences", payload);
      toast.push("Preferences saved. Now pick your template.", "success");
      await finish(takeOnboardingPath());
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Failed to save preferences",
        "danger",
      );
    } finally {
      setSaving(false);
    }
  };

  // Skipping still finishes onboarding. Leaving it unfinished sent the
  // candidate back here on their next navigation, which looked like a loop.
  const skip = async () => {
    setSaving(true);
    try {
      await finish(takeOnboardingPath());
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page className="mx-auto max-w-[860px]">
      <SceneBackdrop
        scene={sceneForPath("/onboarding")}
        priority
        minHeight="clamp(240px, 26vw, 320px)"
      >
        <p className="flex items-center gap-2.5 font-mono text-[0.62rem] font-semibold tracking-[0.18em] text-white/65 uppercase">
          <MapPin size={13} aria-hidden />
          Almost there
        </p>
        <h1 className="mt-3 max-w-[26ch] text-[clamp(1.8rem,5vw,2.7rem)] leading-[1.02] font-semibold tracking-[-0.03em] text-balance text-white">
          How should we match you?
        </h1>
        <p className="mt-3 max-w-[54ch] text-[0.92rem] leading-relaxed text-white/75">
          This decides the order roles appear in — nearby first, then same
          country, then continent, then remote.
        </p>

        {/* The stepper. Three steps, one done, one here, one to go. */}
        <ol className="mt-7 flex max-w-[520px] items-center gap-2 text-[0.74rem]">
          {[
            { label: "Resume", state: "done" },
            { label: "Preferences", state: "current" },
            { label: "Template", state: "next" },
          ].map((step, index) => (
            <li key={step.label} className="flex items-center gap-2">
              <span
                className={cx(
                  "grid size-6 place-items-center rounded-full border font-mono text-[0.66rem] font-semibold",
                  step.state === "done"
                    ? "border-app-success/50 bg-app-success/20 text-white"
                    : step.state === "current"
                      ? "border-white bg-white text-[#07070c]"
                      : "border-white/40 text-white/70",
                )}
              >
                {step.state === "done" ? "✓" : index + 1}
              </span>
              <span
                className={cx(
                  "font-medium",
                  step.state === "current" ? "text-white" : "text-white/65",
                )}
              >
                {step.label}
              </span>
              {index < 2 ? (
                <span aria-hidden className="h-px w-8 bg-white/35 sm:w-12" />
              ) : null}
            </li>
          ))}
        </ol>
      </SceneBackdrop>

      {loadFailed ? (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-app-lg border border-app-warning/40 bg-app-warning/10 px-4 py-3.5 text-[0.85rem] leading-relaxed text-app-soft"
        >
          <Bell size={15} className="mt-0.5 shrink-0 text-app-warning" />
          <span>
            We could not read your saved preferences, so the form starts empty.
            Fill it in again — saving now will store what you type here.
          </span>
        </div>
      ) : null}

      <Panel>
        <PanelHead
          eyebrow="Work style"
          title="Three switches that change what you see"
          description="Each one filters the catalogue before ranking, so you spend your time on roles you would actually take."
        />
        <Rows className="border-t border-app-border">
          <Row as="li" className="items-start gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-app-md border border-app-border bg-app-surface-2 text-app-accent">
              <Wifi size={18} />
            </span>
            <div className="min-w-[220px] flex-1">
              <p className="text-[0.92rem] font-semibold text-app-text">
                Remote roles only
              </p>
              <p className="mt-1 max-w-[58ch] text-[0.82rem] leading-relaxed text-app-muted">
                Hide onsite and hybrid roles. You will only ever be shown
                remote work.
              </p>
            </div>
            <Switch
              checked={preferences.remoteOnly}
              onChange={(checked) =>
                setPreferences((previous) => ({ ...previous, remoteOnly: checked }))
              }
              label="Remote roles only"
            />
          </Row>
          <Row as="li" className="items-start gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-app-md border border-app-border bg-app-surface-2 text-app-accent">
              <Plane size={18} />
            </span>
            <div className="min-w-[220px] flex-1">
              <p className="text-[0.92rem] font-semibold text-app-text">
                I am willing to relocate
              </p>
              <p className="mt-1 max-w-[58ch] text-[0.82rem] leading-relaxed text-app-muted">
                Let us surface roles in other cities and countries, not just
                where you are now.
              </p>
            </div>
            <Switch
              checked={preferences.willingToRelocate}
              onChange={(checked) =>
                setPreferences((previous) => ({
                  ...previous,
                  willingToRelocate: checked,
                }))
              }
              label="I am willing to relocate"
            />
          </Row>
          <Row as="li" className="items-start gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-app-md border border-app-border bg-app-surface-2 text-app-accent">
              <Bell size={18} />
            </span>
            <div className="min-w-[220px] flex-1">
              <p className="text-[0.92rem] font-semibold text-app-text">
                Job alerts
              </p>
              <p className="mt-1 max-w-[58ch] text-[0.82rem] leading-relaxed text-app-muted">
                Get notified when a role that matches your profile is
                discovered.
              </p>
            </div>
            <Switch
              checked={preferences.notificationsEnabled}
              onChange={(checked) =>
                setPreferences((previous) => ({
                  ...previous,
                  notificationsEnabled: checked,
                }))
              }
              label="Job alerts"
            />
          </Row>
        </Rows>
      </Panel>

      <Panel>
        <PanelHead
          eyebrow="Geography"
          title="Where do you want to work?"
          description="Locations rank above countries, and countries above the continent. Type a comma-separated list in each field."
        />
        <div className="flex flex-col gap-5 border-t border-app-border px-5 py-5">
          <Field
            label="Preferred countries"
            hint="Comma separated. Used for the same-country tier."
          >
            <Input
              value={countriesInput}
              onChange={(event) => setCountriesInput(event.target.value)}
              placeholder="Kenya, Rwanda, Nigeria"
            />
          </Field>
          <Field
            label="Preferred cities or locations"
            hint="Comma separated. These rank above everything except your own city."
          >
            <Input
              value={locationsInput}
              onChange={(event) => setLocationsInput(event.target.value)}
              placeholder="Nairobi, Mombasa, Kampala"
            />
          </Field>
          <Field label="Target roles" hint="Comma separated job titles.">
            <Input
              value={rolesInput}
              onChange={(event) => setRolesInput(event.target.value)}
              placeholder="Backend Engineer, Software Engineer"
            />
          </Field>
          <Field label="Seniority" className="sm:max-w-[220px]">
            <Select
              value={preferences.desiredSeniority}
              onChange={(event) =>
                setPreferences((previous) => ({
                  ...previous,
                  desiredSeniority: event.target.value,
                }))
              }
            >
              {["intern", "junior", "mid", "senior", "lead", "executive"].map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Panel>

      <Panel>
        <PanelHead
          eyebrow="Contract types"
          title="Employment types we cover"
          description="All of these are matched automatically from your profile — there is nothing to configure here."
        />
        <div className="flex flex-wrap gap-1.5 border-t border-app-border px-5 py-5">
          {EMPLOYMENT_TYPES.map((type) => (
            <Badge key={type.key} tone="neutral">
              {type.label}
            </Badge>
          ))}
        </div>
      </Panel>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={() => void skip()}
          disabled={saving}
          className="text-app-muted"
        >
          ← Skip, choose a template
        </Button>
        <Button
          size="lg"
          icon={<ArrowRight size={14} />}
          loading={saving}
          onClick={() => void save()}
        >
          Continue to templates
        </Button>
      </div>

      <p className="pb-4 text-center text-[0.76rem] text-app-muted">
        You can change all of this later in{" "}
        <Link href="/profile" className="text-app-accent hover:underline">
          your profile
        </Link>
        .
      </p>
    </Page>
  );
}

export default function OnboardingPreferencesPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex max-w-[860px] flex-col gap-4">
          <Skeleton height={40} width={320} />
          <Skeleton height={280} />
        </div>
      }
    >
      <OnboardingPreferencesInner />
    </Suspense>
  );
}
