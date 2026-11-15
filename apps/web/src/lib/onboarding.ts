/**
 * Which resume path the candidate took into onboarding.
 *
 * Onboarding has more than one screen: pick a path, build the resume, then
 * set matching preferences. Completion is recorded only at the end of the
 * flow, so the intermediate screens hand the chosen path forward through
 * this key instead of marking the whole flow complete before the candidate
 * has set preferences.
 */
export type OnboardingPath = "upload" | "linkedin" | "manual";

const STORAGE_KEY = "jr.onboarding.path";

export function rememberOnboardingPath(path: OnboardingPath): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, path);
  } catch {
    // Storage can be unavailable (private mode, quota). The flow still works;
    // the path is only used to label the completed onboarding.
  }
}

export function takeOnboardingPath(): OnboardingPath | undefined {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    window.localStorage.removeItem(STORAGE_KEY);
    if (value === "upload" || value === "linkedin" || value === "manual") {
      return value;
    }
  } catch {
    // Ignored; treated as "no path recorded".
  }
  return undefined;
}
