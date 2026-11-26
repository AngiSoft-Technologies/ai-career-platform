"use client";

import { useEffect, useState } from "react";
import { Save, Sparkles, UserRound } from "lucide-react";
import {
  Button,
  Field,
  Input,
  Meter,
  Page,
  Panel,
  PanelHead,
  Select,
  Skeleton,
  Switch,
  Textarea,
  useToast,
} from "@/components/ui";
import { HeroSplit } from "@/components/app-art";
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

  const skills = list(form.skills);
  const ready = [
    form.headline,
    form.summary,
    form.location || form.country,
    skills.length > 2 ? "yes" : "",
    form.desiredRoles,
  ].filter(Boolean).length;
  const completeness = Math.round((ready / 5) * 100);
  const initials = (form.fullName || "You")
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <Page>
      <HeroSplit
        src="https://cdn1.angisoft.co.ke/mboqara/images/mboqara/woman-laptop.webp"
        alt="A professional working at a laptop"
        eyebrow="Your profile"
        priority
        title={form.fullName || "What we know about you"}
        description={
          form.headline ||
          "This is the only source the AI uses. Every suggestion traces back to what you write here."
        }
        actions={
          <Button icon={<Save size={15} />} loading={saving} onClick={() => void saveProfile()}>
            Save profile
          </Button>
        }
        badge={
          <div className="rounded-app-lg border border-white/15 bg-black/45 px-4 py-3 backdrop-blur-md">
            <p className="font-mono text-[0.56rem] tracking-[0.2em] text-white/60 uppercase">
              Profile strength
            </p>
            <p className="mt-1 font-display text-[1.75rem] leading-none font-semibold text-white">
              {completeness}%
            </p>
            <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-white/20">
              <span
                className="block h-full rounded-full bg-app-accent"
                style={{ width: `${completeness}%` }}
              />
            </div>
          </div>
        }
        stats={[
          { label: "Skills", value: skills.length, hint: "on your profile" },
          { label: "Level", value: form.seniority, hint: "target seniority" },
          {
            label: "Based in",
            value: form.location || form.country || "—",
            hint: "your location",
          },
          {
            label: "Experience",
            value: `${form.yearsExperience || 0} yrs`,
            hint: "on your CV",
          },
        ].map((stat) => (
          <div key={stat.label}>
            <dt className="font-mono text-[0.56rem] tracking-[0.18em] text-app-muted uppercase">
              {stat.label}
            </dt>
            <dd className="mt-1.5 truncate font-display text-[1.6rem] leading-none font-semibold tracking-[-0.02em] capitalize tabular-nums text-app-text">
              {stat.value}
            </dd>
            <dd className="mt-1 text-[0.7rem] text-app-muted">{stat.hint}</dd>
          </div>
        ))}
      />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel>
            <PanelHead
              eyebrow="Basics"
              title="Identity"
              description="How you appear on every document we generate."
              action={<UserRound size={16} className="text-app-muted" />}
            />
            <div className="grid gap-4 border-t border-app-border px-5 py-5 sm:grid-cols-2">
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
              <Field
                label="Summary"
                hint="Two or three sentences. This is what recruiters read first"
                className="sm:col-span-2"
              >
                <Textarea
                  value={form.summary}
                  onChange={(event) => setForm({ ...form, summary: event.target.value })}
                  className="min-h-[110px]"
                />
              </Field>
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
          </Panel>

          <Panel>
            <PanelHead
              eyebrow="Targeting"
              title="Job preferences"
              description="Used to rank your feed. Broad surfaces more; tight surfaces better."
            />
            <div className="grid gap-4 border-t border-app-border px-5 py-5 sm:grid-cols-2">
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

            <div className="flex flex-col gap-3 border-t border-app-border px-5 py-5">
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

            <div className="flex justify-end border-t border-app-border px-5 py-4">
              <Button
                variant="outline"
                icon={<Save size={15} />}
                loading={savingPrefs}
                onClick={() => void savePreferences()}
              >
                Save preferences
              </Button>
            </div>
          </Panel>
        </div>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-[92px]">
          <Panel>
            <div className="flex items-center gap-3 px-5 pt-5">
              <span className="grid size-14 shrink-0 place-items-center rounded-app-md border border-app-accent/25 bg-app-accent-soft font-display text-[1.2rem] font-semibold text-app-accent">
                {initials || "Y"}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[0.95rem] font-medium text-app-text">
                  {form.fullName || "Your name"}
                </p>
                <p className="truncate text-[0.76rem] text-app-muted">
                  {form.headline || "Add a headline"}
                </p>
              </div>
            </div>
            <div className="px-5 py-5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[0.6rem] tracking-[0.16em] text-app-muted uppercase">
                  How much is filled in
                </span>
                <span className="font-display text-[1.1rem] font-semibold tabular-nums text-app-text">
                  {completeness}%
                </span>
              </div>
              <div className="mt-2">
                <Meter value={completeness} />
              </div>
              <ul className="mt-4 flex flex-col gap-2 border-t border-app-border pt-4">
                {[
                  { label: "Headline", done: Boolean(form.headline) },
                  { label: "Summary", done: Boolean(form.summary) },
                  { label: "Location", done: Boolean(form.location || form.country) },
                  { label: "Three or more skills", done: skills.length > 2 },
                  { label: "Target roles", done: Boolean(form.desiredRoles) },
                ].map((entry) => (
                  <li key={entry.label} className="flex items-center gap-2.5 text-[0.82rem]">
                    <span
                      aria-hidden
                      className={
                        entry.done
                          ? "grid size-4 shrink-0 place-items-center rounded-full bg-app-success/15 text-app-success"
                          : "grid size-4 shrink-0 place-items-center rounded-full border border-app-border-strong text-transparent"
                      }
                    >
                      <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden>
                        <path
                          d="M1.5 5.2 4 7.5 8.5 2.6"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span className={entry.done ? "text-app-soft" : "text-app-muted"}>
                      {entry.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>

          <Panel>
            <PanelHead
              eyebrow="AI"
              title="Profile analysis"
              description="Ask the model what it thinks is missing."
            />
            <div className="border-t border-app-border px-5 py-4">
              <a href="/api/ai/profile-analysis" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" icon={<Sparkles size={14} />} className="w-full">
                  Run analysis
                </Button>
              </a>
              <p className="mt-2 text-[0.72rem] leading-relaxed text-app-muted">
                Returns a gap list you can act on directly.
              </p>
            </div>
          </Panel>
        </aside>
      </div>
    </Page>
  );
}
