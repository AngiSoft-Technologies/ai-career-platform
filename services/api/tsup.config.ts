import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/db/migrate.ts",
    "src/db/seed.ts",
    "src/db/embed.ts",
    "src/db/ingest.ts",
  ],
  format: ["esm"],
  outDir: "dist",
  sourcemap: true,
  clean: true,
  target: "node24",
  // Externalize workspace packages that are TypeScript source
  external: [
    "@angisoft/mboqara-contracts",
    "sharp",
    "pdfkit",
    "docx",
    "pptxgenjs",
    "detect-libc",
    "@aws-sdk/client-s3",
    "@aws-sdk/s3-request-presigner",
    "@grpc/grpc-js",
    "google-auth-library",
  ],
});
