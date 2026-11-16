import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
const client = new S3Client({
  region: "auto",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY },
});
const out = await client.send(new ListObjectsV2Command({
  Bucket: process.env.S3_BUCKET, Prefix: "public/images/", Delimiter: "/",
}));
console.log("public/ PREFIXES:");
for (const p of out.CommonPrefixes ?? []) console.log("  ", p.Prefix);
console.log("public/ KEYS (first 20):");
for (const k of (out.Contents ?? []).slice(0, 20)) console.log("  ", k.Key, k.Size);
