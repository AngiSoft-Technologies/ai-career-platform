"use client";

import { useEffect, useState } from "react";
import { Save, Sparkles, UserRound } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  SectionTitle,
  Select,
  Skeleton,
  Switch,
  Textarea,
  useToast,
} from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { api } from "@/lib/api";
import type { Profile } from "@/lib/types";

interface ProfileResponse {
  profile: Profile;
}

interface PreferencesResponse {
  preferences: {
    preferredCountries: string[];
    preferredLocations: string[];
    preferredRoles: string[];
    desiredSeniority: string;
    minSalary: number | null;
    currency: string;
    remoteOnly: boolean;
    willingToRelocate: boolean;
    notificationsEnabled: boolean;
  };
}

const SENIORITIES = ["intern", "junior", "mid", "senior", "lead"];

export default function ProfilePage() {
  const toast = useToast();
  const profile = useApi<ProfileResponse>("/profile");
  const preferences = useApi<PreferencesResponse>("/profile/preferences");

  const [form, setForm] = useState({
    fullName: "",
    headline: "",
    summary: "",
    location: "",
    country: "",
    yearsExperience: 0,
    seniority: "junior",
    skills: "",
    desiredRoles: "",
    preferredCountries: "",
    preferredLocations: "",
    remotePreferred: false,
  });
  const [prefs, setPrefs] = useState({
    preferredCountries: "",
    preferredLocations: "",
    preferredRoles: "",
    desiredSeniority: "junior",
    minSalary: "",
    currency: "KES",
    remoteOnly: false,
    willingToRelocate: false,
    notificationsEnabled: true,
  });
  const [saving, setSaving] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  useEffect(() => {
    const value = profile.data?.profile;
    if (!value) return;
    setForm({
      fullName: value.name ?? "",
      headline: value.headline ?? "",
      summary: value.summary ?? "",
      location: value.location ?? "",
      country: value.country ?? "",
      yearsExperience: value.yearsExperience ?? 0,
      seniority: value.seniority ?? "junior",
      skills: (value.skills ?? []).join(", "),
      desiredRoles: (value.desiredRoles ?? []).join(", "),
      preferredCountries: (value.preferredCountries ?? []).join(", "),
      preferredLocations: (value.preferredLocations ?? []).join(", "),
      remotePreferred: value.remotePreferred ?? false,
    });
  }, [profile.data]);

  useEffect(() => {
    const value = preferences.data?.preferences;
    if (!value) return;
    setPrefs({
      preferredCountries: value.preferredCountries.join(", "),
      preferredLocations: value.preferredLocations.join(", "),
      preferredRoles: value.preferredRoles.join(", "),
      desiredSeniority: value.desiredSeniority,
      minSalary: value.minSalary ? String(value.minSalary) : "",
      currency: value.currency,
      remoteOnly: value.remoteOnly,
      willingToRelocate: value.willingToRelocate,
      notificationsEnabled: value.notificationsEnabled,
    });
  }, [preferences.data]);

  const list = (value: string) =>
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

  const saveProfile = async () => {
    setSaving(true);
    try {
      await api.put("/profile", {
        fullName: form.fullName || undefined,
        headline: form.headline || undefined,
        summary: form.summary || undefined,
        location: form.location || undefined,
        country: form.country || undefined,
        yearsExperience: Number(form.yearsExperience) || undefined,
        seniority: form.seniority,
        skills: list(form.skills),
        desiredRoles: list(form.desiredRoles),
        preferredCountries: list(form.preferredCountries),
        preferredLocations: list(form.preferredLocations),
        remotePreferred: form.remotePreferred,
      });
      toast.push("Profile saved", "success");
      profile.refresh();
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Could not save the profile",
        "danger",
      );
    } finally {
      setSaving(false);
    }
  };

  const savePreferences = async () => {
    setSavingPrefs(true);
    try {
      await api.put("/profile/preferences", {
        preferredCountries: list(prefs.preferredCountries),
        preferredLocations: list(prefs.preferredLocations),
        preferredRoles: list(prefs.preferredRoles),
        desiredSeniority: prefs.desiredSeniority,
        minSalary: prefs.minSalary ? Number(prefs.minSalary) : null,
        currency: prefs.currency,
        remoteOnly: prefs.remoteOnly,
        willingToRelocate: prefs.willingToRelocate,
        notificationsEnabled: prefs.notificationsEnabled,
      });
      toast.push("Preferences saved", "success");
      preferences.refresh();
    } catch (caught) {
      toast.push(
        caught instanceof Error ? caught.message : "Could not save preferences",
        "danger",
      );
    } finally {
      setSavingPrefs(false);
    }
  };

  if (profile.loading && !profile.data) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton height={36} width={280} />
        <Skeleton height={420} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Your profile"
        title="What we know about you"
        description="This is the only source the AI uses. Every suggestion traces back to what you write here."
        actions={
          <Button icon={<Save size={15} />} loading={saving} onClick={() => void saveProfile()}>
            Save profile
          </Button>
        }
      />

      <Card className="p-4 sm:p-5">
        <SectionTitle eyebrow="Basics" title="Identity" action={<UserRound size={17} className="text-app-muted" />} />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <Input
              value={form.fullName}
              onChange={(event) => setForm({ ...form, fullName: event.target.value })}
            />
          </Field>
          <Field label="Headline" hint="One line an employer would understand instantly">
            <Input
              value={form.headline}
              onChange={(event) => setForm({ ...form, headline: event.target.value })}
              placeholder="Backend engineer · payments · 5 years"
            />
          </Field>
          <Field label="Location">
            <Input
              value={form.location}
              onChange={(event) => setForm({ ...form, location: event.target.value })}
              placeholder="Nairobi, Kenya"
            />
          </Field>
          <Field label="Country">
            <Input
              value={form.country}
              onChange={(event) => setForm({ ...form, country: event.target.value })}
              placeholder="Kenya"
            />
          </Field>
          <Field label="Years of experience">
            <Input
              type="number"
              min={0}
              max={60}
              value={form.yearsExperience}
              onChange={(event) =>
                setForm({ ...form, yearsExperience: Number(event.target.value) || 0 })
              }
            />
          </Field>
          <Field label="Seniority">
            <Select
              value={form.seniority}
              onChange={(event) => setForm({ ...form, seniority: event.target.value })}
            >
              {SENIORITIES.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Summary" hint="Two or three sentences. This is what recruiters read first">
            <Textarea
              value={form.summary}
              onChange={(event) => setForm({ ...form, summary: event.target.value })}
              className="min-h-[110px]"
            />
          </Field>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Skills" hint="Comma separated">
            <Textarea
              value={form.skills}
              onChange={(event) => setForm({ ...form, skills: event.target.value })}
              placeholder="TypeScript, PostgreSQL, Kubernetes"
            />
          </Field>
          <Field label="Desired roles" hint="Comma separated">
            <Textarea
              value={form.desiredRoles}
              onChange={(event) => setForm({ ...form, desiredRoles: event.target.value })}
              placeholder="Backend Engineer, Platform Engineer"
            />
          </Field>
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <SectionTitle
          eyebrow="Targeting"
          title="Job preferences"
          description="Used to rank your feed. Set them broadly and we will surface more, or tightly and we will surface fewer but better."
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Preferred countries" hint="Comma separated, any country">
            <Input
              value={prefs.preferredCountries}
              onChange={(event) =>
                setPrefs({ ...prefs, preferredCountries: event.target.value })
              }
              placeholder="Kenya, United Kingdom, Germany"
            />
          </Field>
          <Field label="Preferred locations" hint="City or region">
            <Input
              value={prefs.preferredLocations}
              onChange={(event) =>
                setPrefs({ ...prefs, preferredLocations: event.target.value })
              }
              placeholder="Nairobi, Mombasa, Remote"
            />
          </Field>
          <Field label="Preferred roles">
            <Input
              value={prefs.preferredRoles}
              onChange={(event) => setPrefs({ ...prefs, preferredRoles: event.target.value })}
              placeholder="Backend Engineer"
            />
          </Field>
          <Field label="Target level">
            <Select
              value={prefs.desiredSeniority}
              onChange={(event) =>
                setPrefs({ ...prefs, desiredSeniority: event.target.value })
              }
            >
              {SENIORITIES.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Minimum salary">
            <Input
              type="number"
              value={prefs.minSalary}
              onChange={(event) => setPrefs({ ...prefs, minSalary: event.target.value })}
              placeholder="80000"
            />
          </Field>
          <Field label="Currency">
            <Input
              value={prefs.currency}
              onChange={(event) =>
                setPrefs({ ...prefs, currency: event.target.value.toUpperCase() })
              }
              maxLength={3}
            />
          </Field>
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <Switch
            checked={prefs.remoteOnly}
            onChange={(value) => setPrefs({ ...prefs, remoteOnly: value })}
            label="Remote roles only"
          />
          <Switch
            checked={prefs.willingToRelocate}
            onChange={(value) => setPrefs({ ...prefs, willingToRelocate: value })}
            label="Willing to relocate"
          />
          <Switch
            checked={prefs.notificationsEnabled}
            onChange={(value) => setPrefs({ ...prefs, notificationsEnabled: value })}
            label="Notify me about new matching roles"
          />
        </div>

        <div className="mt-5">
          <Button
            icon={<Save size={15} />}
            loading={savingPrefs}
            onClick={() => void savePreferences()}
          >
            Save preferences
          </Button>
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <SectionTitle
          eyebrow="AI"
          title="Profile analysis"
          description="Ask the model what it thinks is missing from your profile."
        />
        <div className="mt-4">
          <a href="/v1/ai/profile-analysis" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" icon={<Sparkles size={14} />}>
              Run profile analysis
            </Button>
          </a>
          <p className="mt-2 text-[0.78rem] text-app-muted">
            Analysis runs on the API and returns a gap list you can act on directly.
          </p>
        </div>
      </Card>
    </div>
  );
}
