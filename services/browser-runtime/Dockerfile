# Build on the Node image first: TypeScript and npm install do not need a
# browser, and keeping them in a separate stage leaves the runtime image lean.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install --no-audit --no-fund
COPY src ./src
RUN npm run build

# The Playwright image already contains Chromium and its system libraries.
FROM mcr.microsoft.com/playwright:v1.65.1-noble
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# The image ships a non-root `pwuser`; Chromium runs with --no-sandbox because
# we do not grant extra kernel capabilities in the container.
USER pwuser
EXPOSE 8787
CMD ["node", "dist/index.js"]
