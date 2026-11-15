"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  ArrowRight,
  Bell,
  Briefcase,
  Globe,
  MapPin,
  Plane,
  Wifi,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Select,
  Skeleton,
  Switch,
  useToast,
} from "@/components/ui";
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
    <div className="mx-auto flex max-w-[760px] flex-col gap-6">
      <header className="pt-6 text-center">
        <p className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold tracking-[0.14em] text-app-accent uppercase">
          <MapPin size={16} /> Almost there
        </p>
        <h1 className="mt-2 text-[clamp(1.8rem,5vw,2.6rem)] leading-[1.1] font-semibold tracking-[-0.02em] text-app-text">
          How should we match you?
        </h1>
        <p className="mx-auto mt-2 max-w-[520px] text-[1.02rem] leading-relaxed text-app-muted">
          This decides the order roles appear in — nearby first, then same country, then continent,
          then remote.
        </p>
      </header>

      {loadFailed ? (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-app-md border border-app-warning/40 bg-app-warning/10 px-4 py-3 text-[0.85rem] leading-relaxed text-app-soft"
        >
          <Bell size={15} className="mt-0.5 shrink-0 text-app-warning" />
          <span>
            We could not read your saved preferences, so the form starts empty. Fill it in again —
            saving now will store what you type here.
          </span>
        </div>
      ) : null}

      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-5">
          <ToggleRow
            icon={<Wifi size={18} className="text-app-accent" />}
            title="Remote roles only"
            description="Hide onsite and hybrid roles. You will only ever be shown remote work."
            checked={preferences.remoteOnly}
            onChange={(checked) =>
              setPreferences((previous) => ({ ...previous, remoteOnly: checked }))
            }
          />
          <ToggleRow
            icon={<Plane size={18} className="text-app-accent" />}
            title="I am willing to relocate"
            description="Let us surface roles in other cities and countries, not just where you are now."
            checked={preferences.willingToRelocate}
            onChange={(checked) =>
              setPreferences((previous) => ({ ...previous, willingToRelocate: checked }))
            }
          />
          <ToggleRow
            icon={<Bell size={18} className="text-app-accent" />}
            title="Job alerts"
            description="Get notified when a role that matches your profile is discovered."
            checked={preferences.notificationsEnabled}
            onChange={(checked) =>
              setPreferences((previous) => ({ ...previous, notificationsEnabled: checked }))
            }
          />
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Globe size={18} className="text-app-accent" />
            <h2 className="text-[1rem] font-semibold text-app-text">Where do you want to work?</h2>
          </div>
          <Field label="Preferred countries" hint="Comma separated. Used for the same-country tier.">
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
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2">
          <Briefcase size={18} className="text-app-accent" />
          <h2 className="text-[1rem] font-semibold text-app-text">Employment types we cover</h2>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EMPLOYMENT_TYPES.map((type) => (
            <Badge key={type.key} tone="neutral">
              {type.label}
            </Badge>
          ))}
        </div>
        <p className="mt-2.5 text-[0.8rem] leading-relaxed text-app-muted">
          All of these are matched automatically based on your profile — there is nothing to
          configure here.
        </p>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={() => void skip()}
          disabled={saving}
          className="text-app-muted"
        >
          ← Skip, choose a template
        </Button>
        <Button size="lg" icon={<ArrowRight size={14} />} loading={saving} onClick={() => void save()}>
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
    </div>
  );
}

function ToggleRow({
  icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-[200px] flex-1">
        <p className="text-[0.92rem] font-semibold text-app-text">{title}</p>
        <p className="mt-1 text-[0.82rem] leading-relaxed text-app-muted">{description}</p>
      </div>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

export default function OnboardingPreferencesPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex max-w-[760px] flex-col gap-4">
          <Skeleton height={40} width={320} />
          <Skeleton height={280} />
        </div>
      }
    >
      <OnboardingPreferencesInner />
    </Suspense>
  );
}
