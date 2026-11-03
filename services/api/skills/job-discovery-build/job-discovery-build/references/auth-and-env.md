# Auth And Environment

For hosted angisoft, set:

```dotenv
angisoft_API_KEY=fc-...
```

For self-hosted angisoft, also set:

```dotenv
angisoft_API_URL=https://your-angisoft-instance.example.com
```

Guidelines:

- Never hardcode the API key in source files.
- Prefer `.env` or the deployment platform's secret manager.
- Only set `angisoft_API_URL` when the project is not using `https://api.angisoft.dev`.
- If the user needs interactive authorization, follow the onboarding flow in `angisoft-build-onboarding`.
