import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  type GetObjectCommandOutput,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import dotenv from "dotenv";
import mongoose from "mongoose";

type ProbeStatus = "pass" | "warn" | "fail";

interface ProbeResult {
  name: string;
  status: ProbeStatus;
  message: string;
}

const backendDir = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(__dirname, "../../..");

function loadEnvFiles(): void {
  for (const envPath of [
    path.join(repoRoot, ".env"),
    path.join(backendDir, ".env"),
    path.join(process.cwd(), ".env"),
  ]) {
    dotenv.config({ path: envPath });
  }
}

function requiredEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`${key} is not set`);
  }

  return value;
}

function optionalEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function result(
  name: string,
  status: ProbeStatus,
  message: string,
): ProbeResult {
  return { name, status, message };
}

async function runProbe(
  name: string,
  probe: () => Promise<ProbeResult>,
): Promise<ProbeResult> {
  try {
    return await probe();
  } catch (error) {
    return result(
      name,
      "fail",
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function probeMongo(): Promise<ProbeResult> {
  const mongoUri = requiredEnv("MONGODB_URI");

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 8000 });
    const ping = await mongoose.connection.db?.admin().ping();
    if (ping?.ok !== 1) {
      throw new Error("Mongo ping did not return ok: 1");
    }

    return result("MongoDB", "pass", "connected and pinged database");
  } finally {
    await mongoose.disconnect();
  }
}

async function responseBodyText(
  response: GetObjectCommandOutput,
): Promise<string> {
  const body = (response as { Body?: unknown }).Body;
  if (
    body &&
    typeof body === "object" &&
    "transformToString" in body &&
    typeof body.transformToString === "function"
  ) {
    return body.transformToString();
  }

  throw new Error("S3 get object response did not include a readable body");
}

async function probeS3(): Promise<ProbeResult> {
  const region = requiredEnv("AWS_REGION");
  const bucketName = requiredEnv("AWS_S3_BUCKET_NAME");
  const accessKeyId = requiredEnv("AWS_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnv("AWS_SECRET_ACCESS_KEY");
  const client = new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
  const key = `pepta/integration-probes/${Date.now()}-${randomUUID()}.txt`;
  const contentType = "text/plain";
  const body = `pepta integration probe ${new Date().toISOString()}`;

  await client.send(new HeadBucketCommand({ Bucket: bucketName }));
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 60 },
  );

  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": contentType },
    body,
  });
  if (!upload.ok) {
    throw new Error(`presigned PUT failed with ${upload.status}`);
  }

  try {
    const object = await client.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      }),
    );
    const downloaded = await responseBodyText(object);
    if (downloaded !== body) {
      throw new Error("downloaded S3 probe object did not match uploaded body");
    }
  } finally {
    await client.send(
      new DeleteObjectCommand({ Bucket: bucketName, Key: key }),
    );
  }

  return result(
    "S3",
    "pass",
    `presigned PUT, GET, and DELETE worked in ${bucketName}`,
  );
}

async function probeOpenAI(): Promise<ProbeResult> {
  const apiKey = requiredEnv("OPENAI_API_KEY");
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: {
      authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`OpenAI models endpoint returned ${response.status}`);
  }

  return result("OpenAI", "pass", "API key can reach models endpoint");
}

async function probeGoogle(): Promise<ProbeResult> {
  const clientId = requiredEnv("GOOGLE_CLIENT_ID");
  if (!clientId.endsWith(".apps.googleusercontent.com")) {
    throw new Error("GOOGLE_CLIENT_ID does not look like an OAuth client ID");
  }

  const response = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!response.ok) {
    throw new Error(`Google JWKS endpoint returned ${response.status}`);
  }

  const payload = (await response.json()) as { keys?: unknown[] };
  if (!Array.isArray(payload.keys) || payload.keys.length === 0) {
    throw new Error("Google JWKS response did not include keys");
  }

  return result(
    "Google Auth",
    "pass",
    "client ID shape is valid and Google JWKS is reachable",
  );
}

async function probeApple(): Promise<ProbeResult> {
  const keys = [
    "APPLE_TEAM_ID",
    "APPLE_CLIENT_ID",
    "APPLE_KEY_ID",
    "APPLE_PRIVATE_KEY_BASE64",
  ];
  const present = keys.filter((key) => optionalEnv(key));

  if (present.length === 0) {
    return result(
      "Apple Auth",
      "warn",
      "APPLE_* env is unset; Apple sign-in remains deferred",
    );
  }

  if (present.length !== keys.length) {
    throw new Error(
      `partial Apple env detected; missing ${keys.filter((key) => !optionalEnv(key)).join(", ")}`,
    );
  }

  const decodedKey = Buffer.from(
    requiredEnv("APPLE_PRIVATE_KEY_BASE64"),
    "base64",
  ).toString("utf8");
  if (!decodedKey.includes("BEGIN PRIVATE KEY")) {
    throw new Error(
      "APPLE_PRIVATE_KEY_BASE64 did not decode to a private key PEM",
    );
  }

  const response = await fetch("https://appleid.apple.com/auth/keys");
  if (!response.ok) {
    throw new Error(`Apple JWKS endpoint returned ${response.status}`);
  }

  const payload = (await response.json()) as { keys?: unknown[] };
  if (!Array.isArray(payload.keys) || payload.keys.length === 0) {
    throw new Error("Apple JWKS response did not include keys");
  }

  return result(
    "Apple Auth",
    "pass",
    "env is complete and Apple JWKS is reachable",
  );
}

async function probeRevenueCat(): Promise<ProbeResult> {
  if (!optionalEnv("REVENUECAT_WEBHOOK_SECRET")) {
    return result(
      "RevenueCat",
      "warn",
      "webhook secret is unset; subscription webhooks remain deferred",
    );
  }

  return result("RevenueCat", "pass", "webhook secret is configured");
}

function printResult(probeResult: ProbeResult): void {
  const label =
    probeResult.status === "pass"
      ? "PASS"
      : probeResult.status === "warn"
        ? "WARN"
        : "FAIL";
  console.log(`[${label}] ${probeResult.name}: ${probeResult.message}`);
}

async function main(): Promise<void> {
  loadEnvFiles();

  const results = await Promise.all([
    runProbe("MongoDB", probeMongo),
    runProbe("S3", probeS3),
    runProbe("OpenAI", probeOpenAI),
    runProbe("Google Auth", probeGoogle),
    runProbe("Apple Auth", probeApple),
    runProbe("RevenueCat", probeRevenueCat),
  ]);

  for (const probeResult of results) {
    printResult(probeResult);
  }

  if (results.some((probeResult) => probeResult.status === "fail")) {
    process.exitCode = 1;
  }
}

void main();
