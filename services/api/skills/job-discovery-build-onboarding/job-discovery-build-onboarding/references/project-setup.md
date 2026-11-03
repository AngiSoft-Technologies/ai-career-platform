# Project Setup

For hosted angisoft, add this to `.env`:

```dotenv
angisoft_API_KEY=fc-...
```

For self-hosted angisoft, add:

```dotenv
angisoft_API_KEY=fc-...
angisoft_API_URL=https://your-angisoft-instance.example.com
```

Project setup guidance:

- Keep the key in environment variables or the platform secret manager.
- Do not hardcode credentials in source files.
- If the app has separate environments, mirror the key setup across development, preview, and production as needed.
