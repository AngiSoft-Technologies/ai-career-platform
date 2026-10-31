import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config.js";

let client: S3Client | null = null;

export function getStorageClient(): S3Client {
  const accessKeyId = config.S3_ACCESS_KEY_ID ?? config.AWS_ACCESS_KEY_ID;
  const secretAccessKey =
    config.S3_SECRET_ACCESS_KEY ?? config.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("STORAGE_NOT_CONFIGURED");
  }

  client ??= new S3Client({
    region:
      config.S3_REGION === "auto"
        ? (config.AWS_REGION ?? config.S3_REGION)
        : config.S3_REGION,
    endpoint: config.S3_ENDPOINT ?? config.AWS_ENDPOINT_URL_S3,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId, secretAccessKey },
  });
  return client;
}

export interface UploadTarget {
  key: string;
  url: string;
  method: "PUT";
  expiresIn: number;
}

export async function createUploadTarget(input: {
  userId: string;
  filename: string;
  contentType: string;
}): Promise<UploadTarget> {
  const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `users/${input.userId}/documents/${randomUUID()}${extname(safeName)}`;

  const command = new PutObjectCommand({
    Bucket: config.S3_BUCKET,
    Key: key,
    ContentType: input.contentType,
  });

  const expiresIn = 900;
  const url = await getSignedUrl(getStorageClient(), command, { expiresIn });

  return { key, url, method: "PUT", expiresIn };
}

export async function downloadObject(
  client: S3Client,
  key: string
): Promise<Buffer> {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const command = new GetObjectCommand({
    Bucket: config.S3_BUCKET,
    Key: key,
  });
  const response = await client.send(command);
  if (!response.Body) throw new Error("OBJECT_NOT_FOUND");
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
