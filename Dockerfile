# Backend-only image for Fly.io.
#
# The Next.js frontend lives in apps/web and is deployed to Netlify
# (see netlify.toml). It is intentionally NOT installed or copied here:
# the API image only needs the root tooling, services/api and packages/contracts.

FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY services/api/package.json services/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json

# Install only the backend workspaces. Without the --workspace filters, npm would
# also install apps/web's dependencies (Next.js, React, Tailwind, Playwright,
# ~350 extra packages) into an image that never serves the web app.
RUN npm ci \
      --workspace @angisoft/mboqara-api \
      --workspace @angisoft/mboqara-contracts \
      --include-workspace-root \
      --no-audit --no-fund

COPY packages/contracts packages/contracts
COPY services/api services/api

# Build contracts first (outputs to packages/contracts/dist)
RUN npm run build -w @angisoft/mboqara-contracts

# Build API (externalizes contracts, which now has dist/)
RUN npm run build -w @angisoft/mboqara-api

# Drop build-only dependencies (tsup, tsx, typescript, ...)
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=8088 \
    GRPC_PORT=50051

WORKDIR /app

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/services/api/package.json services/api/package.json
COPY --from=build /app/services/api/dist services/api/dist
COPY --from=build /app/packages/contracts packages/contracts
COPY db db
COPY services/api/skills services/api/skills

WORKDIR /app/services/api

EXPOSE 8088 50051

USER node

CMD ["node", "dist/index.js"]
