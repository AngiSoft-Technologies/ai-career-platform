# Job Radar — Mobile App

Job Radar is an AI-powered career intelligence platform. The mobile app lets job seekers discover opportunities, track applications, and generate tailored documents — all offline-first with background sync.

## Features

- **Job Search & Matching** — Search opportunities by role, location, work mode, seniority. Get AI-ranked matches with explanations.
- **Application Workspace** — Track every application, auto-extract form fields from employer sites, generate AI cover letters & CVs.
- **Document Vault** — Generate and store tailored CVs and cover letters per application.
- **Follow-ups & Reminders** — Schedule follow-ups, get local notifications, never miss a deadline.
- **Career Intelligence** — AI-powered profile analysis: strengths, gaps, salary benchmarks, next-step recommendations.
- **Offline-First** — Full read/write access offline. Changes sync automatically when connectivity returns.
- **Google Sign-In** — One-tap sign-in with your Google account (Neon Auth).
- **Email/Password** — Traditional sign-in with secure password handling.
- **Invitation Flow** — Accept team invites with a one-time link, set your password, and join instantly.

## Architecture

```
lib/
├── core/
│   ├── authentication/     # Neon Auth (email/password + Google), token storage, refresh
│   ├── configuration/      # AppSettings (base URL, demo mode)
│   ├── networking/         # ApiClient (JWT auth, 401 auto-refresh, retry)
│   ├── routing/            # go_router + deep links (app_links)
│   ├── storage/            # SQLite (sqflite) + offline outbox
│   └── synchronization/    # SyncEngine (auto-sync on reconnect)
├── features/
│   ├── applications/       # Application CRUD, status machine, offline outbox
│   ├── application_workspace/  # Guided apply, AI analysis, WebView extraction
│   ├── career_profile/     # Profile CRUD, skills, experience
│   ├── career_intelligence/    # AI analysis, strengths/gaps
│   ├── company_intelligence/   # Company signals
│   ├── documents/          # CV/cover letter generation, viewer
│   ├── followups/          # Follow-up scheduling & tracking
│   ├── job_matching/       # Ranked matches, score explanations
│   ├── job_preferences/    # Filters: roles, locations, work modes
│   ├── job_matching/       # Ranked matches
│   ├── notifications/      # Local notification feed + badge
│   ├── onboarding/         # Sign in / sign up / Google / demo
│   ├── opportunities/      # Job board, search, save/bookmark
│   ├── settings/           # API base URL, demo mode, sync status
│   └── invite/             # Invite acceptance + password setup
├── shared/                 # Theme, widgets, formatters
└── main.dart               # DI setup, providers, router
```

## Getting Started

### Prerequisites

- Flutter SDK ^3.13.2 (Dart ^3.13.2)
- Android SDK (minSdk 24, targetSdk 34)
- Xcode 15+ for iOS builds
- Google Cloud project with OAuth client IDs for Android/iOS

### Environment Setup

1. **Install dependencies**
   ```bash
   flutter pub get
   ```

2. **Configure Google Sign-In**
   - Create OAuth 2.0 client IDs in Google Cloud Console for Android (`ke.co.angisoft.job_radar`) and iOS (`ke.co.angisoft.job_radar`).
   - Add them to `android/app/build.gradle.kts` (already configured via `google_sign_in` defaults).
   - For iOS, add `CFBundleURLTypes` with scheme `jobradar` (already in Info.plist).

3. **Configure Neon Auth**
   - The app uses Neon Auth (Managed Better Auth) at `https://ep-mute-glitter-b5uefleh.neonauth.c-7.us-east-2.aws.neon.tech/neondb/auth`.
   - Ensure the Google provider is enabled in the Neon Auth console.
   - Add `jobradar://` as a trusted origin for deep links.

4. **Run the app**
   ```bash
   flutter run
   ```

### Building Release APK / AAB

1. **Create a keystore** (once):
   ```bash
   keytool -genkey -v -keystore android/release.keystore -alias jobradar -keyalg RSA -keysize 2048 -validity 10000
   ```

2. **Create `android/key.properties`** (do not commit):
   ```properties
   storeFile=../release.keystore
   storePassword=your_store_password
   keyAlias=your_key_alias
   keyPassword=your_key_password
   ```

3. **Build release AAB**:
   ```bash
   flutter build appbundle --release
   ```
   Output: `build/app/outputs/bundle/release/app-release.aab`

4. **Build release APK** (for testing/sideloading):
   ```bash
   flutter build apk --release --split-per-abi
   ```

### Deep Links / App Links

- **Custom scheme**: `jobradar://invite/<token>` — opens the invite acceptance screen.
- **HTTPS App Links**: `https://jobs-radar.angisoft.co.ke/invite/<token>` — verified via `assetlinks.json` (hosted on the web app at `/.well-known/assetlinks.json`).
- iOS Universal Links: `applinks:jobs-radar.angisoft.co.ke` (configured in `Info.plist`).

### App Links Verification

Host `assetlinks.json` at `https://jobs-radar.angisoft.co.ke/.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "ke.co.angisoft.job_radar",
    "sha256_cert_fingerprints": ["YOUR_SHA256_FINGERPRINT"]
  }
}]
```

## Configuration

### API Base URL

Set via Settings screen → "API Connection" → Base URL. Defaults to `https://job-radar-api-angisoft.fly.dev/v1`.

### Demo Mode

Toggle in Settings. Uses a local in-memory session with seeded data. No network calls.

### Offline Behavior

- All reads fall back to SQLite cache on network failure.
- Writes are queued in `offline_actions` table and replayed on reconnect.
- Sync status visible in Settings → "Sync status".

## Testing

```bash
flutter test          # Unit/widget tests
flutter analyze       # Static analysis (lints)
```

## Distribution

- **Package ID**: `ke.co.angisoft.job_radar` (Android) / `ke.co.angisoft.job_radar` (iOS)
- **Play Store**: `https://play.google.com/store/apps/details?id=ke.co.angisoft.job_radar`
- **Release signing**: Configure `android/key.properties` (see `android/key.properties`)

## License

Proprietary — AngiSoft Technologies. All rights reserved.