"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
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
  Button,
  Card,
  Field,
  Input,
  Select,
  Switch,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useOnboarding } from "@/lib/hooks";

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

export default function OnboardingPreferencesPage() {
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

  useEffect(() => {
    api
      .get<{ preferences: Partial<Preferences> }>("/preferences")
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
      .catch(() => undefined);
  }, []);

  const split = (value: string) =>
    value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);

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
      await api.put("/preferences", payload);
      await completeOnboarding();
      toast.push("Preferences saved. Now pick your template.", "success");
      router.push(
        documentId ? `/documents/${documentId}` : "/documents",
      );
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Failed to save preferences",
        "danger",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="stack"
      style={{ gap: "1.5rem", maxWidth: 720, margin: "0 auto" }}
    >
      <div style={{ textAlign: "center", paddingTop: "2rem" }}>
        <div className="eyebrow justify-center">
          <MapPin size={16} /> Almost there
        </div>
        <h1
          className="display"
          style={{ fontSize: "clamp(1.8rem, 5vw, 2.6rem)", marginTop: 8 }}
        >
          How should we match you?
        </h1>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "1.02rem",
            marginTop: 8,
            maxWidth: 520,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          This decides the order roles appear in — nearby first, then same
          country, then continent, then remote.
        </p>
      </div>

      <Card className="p-6">
        <div className="stack" style={{ gap: "1.25rem" }}>
          <ToggleRow
            icon={<Wifi size={18} className="text-accent" />}
            title="Remote roles only"
            description="Hide onsite and hybrid roles. You will only ever be shown remote work."
            checked={preferences.remoteOnly}
            onChange={(checked) =>
              setPreferences((previous) => ({ ...previous, remoteOnly: checked }))
            }
          />
          <ToggleRow
            icon={<Plane size={18} className="text-accent" />}
            title="I am willing to relocate"
            description="Let us surface roles in other cities and countries, not just where you are now."
            checked={preferences.willingToRelocate}
            onChange={(checked) =>
              setPreferences((previous) => ({
                ...previous,
                willingToRelocate: checked,
              }))
            }
          />
          <ToggleRow
            icon={<Bell size={18} className="text-accent" />}
            title="Job alerts"
            description="Get notified when a role that matches your profile is discovered."
            checked={preferences.notificationsEnabled}
            onChange={(checked) =>
              setPreferences((previous) => ({
                ...previous,
                notificationsEnabled: checked,
              }))
            }
          />
        </div>
      </Card>

      <Card className="p-6">
        <div className="stack gap-4">
          <div className="row gap-2 items-center">
            <Globe size={18} className="text-accent" />
            <h3 className="text-[1rem] m-0">Where do you want to work?</h3>
          </div>
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
          <div className="grid-2">
            <Field label="Seniority">
              <Select
                value={preferences.desiredSeniority}
                onChange={(event) =>
                  setPreferences((previous) => ({
                    ...previous,
                    desiredSeniority: event.target.value,
                  }))
                }
              >
                {["intern", "junior", "mid", "senior", "lead", "executive"].map(
                  (level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ),
                )}
              </Select>
            </Field>
          </div>
        </div>
      </Card>

      <Card style={{ padding: "1.25rem" }}>
        <div className="row" style={{ gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" }}>
          <Briefcase size={18} className="text-accent" />
          <h3 className="text-[1rem] m-0">Employment types we cover</h3>
        </div>
        <div className="row" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
          {EMPLOYMENT_TYPES.map((type) => (
            <span
              key={type.key}
              style={{
                fontSize: "0.75rem",
                padding: "0.25rem 0.6rem",
                borderRadius: 999,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--text-muted)",
              }}
            >
              {type.label}
            </span>
          ))}
        </div>
        <p
          style={{
            fontSize: "0.8rem",
            color: "var(--text-muted)",
            marginTop: "0.6rem",
            marginBottom: 0,
          }}
        >
          All of these are matched automatically based on your profile — there is
          nothing to configure here.
        </p>
      </Card>

      <div className="row justify-between">
        <Link
          href={documentId ? `/documents/${documentId}` : "/documents"}
          className="text-muted text-[0.9rem]"
        >
          ← Skip, choose a template
        </Link>
        <Button
          size="lg"
          icon={<ArrowRight size={14} />}
          loading={saving}
          onClick={save}
        >
          Continue to templates
        </Button>
      </div>
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
    <div
      className="row"
      style={{ gap: "0.75rem", alignItems: "flex-start", flexWrap: "wrap" }}
    >
      <span style={{ flexShrink: 0, marginTop: 2 }}>{icon}</span>
      <div className="flex-1" style={{ minWidth: 200 }}>
        <div className="font-semibold text-[0.92rem]">{title}</div>
        <p
          style={{
            margin: "0.25rem 0 0",
            fontSize: "0.82rem",
            color: "var(--text-muted)",
          }}
        >
          {description}
        </p>
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  );
}
