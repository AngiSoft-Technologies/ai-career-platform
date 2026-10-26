# Repository Guidelines

## Project Structure & Module Organization

Job Radar is a JavaScript workspace monorepo plus a Flutter app. `apps/web` contains the Next.js frontend, `services/api` the Express API and workers, and `packages/contracts` shared TypeScript, GraphQL, OpenAPI, and protobuf contracts. The Flutter client is in `apps/mobile/lib` (`features`, `core`, and `shared`). Database migrations and seeds are in `db/migrations` and `db/seeds`; deployment configuration is at the root and in `config`. Keep changes near the owning module and update shared contracts when API shapes change.

## Build, Test, and Development Commands

Use Node.js 22 or newer; install dependencies with `npm install`.

- `npm run dev` starts the API and web app together; `npm run dev:api` or `npm run dev:web` starts one service.
- `npm run build` builds the API and web app. `npm run typecheck` checks API TypeScript; run `npm run typecheck -w @angisoft/job-radar-web` for the web app.
- `npm run db:migrate` and `npm run db:seed` run database migrations and seed data; configure local environment values before using them.
- For the mobile app, run `cd apps/mobile && flutter pub get`, then `flutter run`; use `flutter test` for its tests.

## Coding Style & Naming Conventions

Follow surrounding code: TypeScript uses ES modules, semicolons, and two-space indentation. Use camelCase for variables/functions, PascalCase for React components and types, and established kebab-case directory names. Keep Dart idiomatic and use `snake_case.dart` filenames. No repository-wide formatter or linter script is configured; avoid unrelated formatting changes.

## Testing Guidelines

There is no root `npm test` script or declared JavaScript test framework. Run relevant package typecheck/build commands; add focused tests where a module has a test setup. Flutter tests belong under `apps/mobile/test` and run with `flutter test`.

## Commit & Pull Request Guidelines

Recent commits use concise conventional-style subjects such as `fix: ...` and `chore: ...`. Pull requests should describe the change, note affected apps/services, link related work, include UI screenshots, and report checks run. Call out required environment or database changes.

## Security & Configuration

Do not commit secrets or local environment files. Use ignored `.env` files or deployment secrets for credentials, and keep migrations safe for existing data. Review web and mobile callers when changing shared API contracts or authentication/authorization.
