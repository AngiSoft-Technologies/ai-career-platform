FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY services/api/package.json services/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json

# Copy source for workspace link dependencies (required by npm ci with file: protocol)
COPY packages/contracts packages/contracts
COPY services/api services/api
COPY apps/web apps/web

RUN npm ci --no-audit --no-fund

# Build contracts first (outputs to packages/contracts/dist)
RUN npm run build -w @angisoft/mboqara-contracts

# Build API (externalizes contracts, which now has dist/)
RUN npm run build -w @angisoft/mboqara-api \
  && npm prune --omit=dev

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

WORKDIR /app/services/api

EXPOSE 8088 50051

USER node

CMD ["node", "dist/index.js"]
