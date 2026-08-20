import {
  DeleteObjectCommand,
  GetBucketCorsCommand,
  GetBucketEncryptionCommand,
  GetBucketLifecycleConfigurationCommand,
  GetObjectCommand,
  GetPublicAccessBlockCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';
import { InternalError } from '../lib/errors';

export const SIGNED_URL_TTL_SECONDS = 10 * 60;

function s3Config() {
  if (!env.aws.bucketName || !env.aws.region) {
    throw new InternalError('S3 is not configured');
  }

  return {
    region: env.aws.region,
    bucketName: env.aws.bucketName,
    accessKeyId: env.aws.accessKeyId,
    secretAccessKey: env.aws.secretAccessKey,
  };
}

export function getS3Client(): S3Client {
  const config = s3Config();

  return new S3Client({
    region: config.region,
    credentials:
      config.accessKeyId && config.secretAccessKey
        ? {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          }
        : undefined,
  });
}

export function signedUrlExpiresAt(): string {
  return new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString();
}

export async function createPresignedPostUpload(input: {
  key: string;
  contentType: string;
  maxBytes: number;
  expiresInSeconds?: number;
}): Promise<{ uploadUrl: string; fields: Record<string, string> }> {
  const config = s3Config();
  const encryption = 'AES256';
  const result = await createPresignedPost(getS3Client(), {
    Bucket: config.bucketName,
    Key: input.key,
    Expires: input.expiresInSeconds ?? SIGNED_URL_TTL_SECONDS,
    Fields: {
      key: input.key,
      'Content-Type': input.contentType,
      'x-amz-server-side-encryption': encryption,
    },
    Conditions: [
      ['content-length-range', 1, input.maxBytes],
      { key: input.key },
      { 'Content-Type': input.contentType },
      { 'x-amz-server-side-encryption': encryption },
    ],
  });

  return { uploadUrl: result.url, fields: result.fields };
}

export async function createPresignedGetUrl(input: {
  key: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const config = s3Config();
  const command = new GetObjectCommand({
    Bucket: config.bucketName,
    Key: input.key,
  });

  return getSignedUrl(getS3Client(), command, {
    expiresIn: input.expiresInSeconds ?? SIGNED_URL_TTL_SECONDS,
  });
}

export async function putS3Object(input: {
  key: string;
  body: Uint8Array;
  contentType: string;
}): Promise<void> {
  const config = s3Config();
  const command = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: input.key,
    Body: input.body,
    ContentType: input.contentType,
    ServerSideEncryption: 'AES256',
  });

  await getS3Client().send(command);
}

export async function headS3Object(
  key: string,
): Promise<{ contentType: string | null; contentLength: number | null }> {
  const config = s3Config();
  const result = await getS3Client().send(
    new HeadObjectCommand({ Bucket: config.bucketName, Key: key }),
  );

  return {
    contentType: result.ContentType ?? null,
    contentLength: result.ContentLength ?? null,
  };
}

export async function getS3ObjectBytes(key: string): Promise<Uint8Array> {
  const config = s3Config();
  const result = await getS3Client().send(
    new GetObjectCommand({ Bucket: config.bucketName, Key: key }),
  );
  if (!result.Body) {
    throw new InternalError('S3 object has no body');
  }

  return result.Body.transformToByteArray();
}

export async function deleteS3Object(key: string): Promise<void> {
  const config = s3Config();
  const command = new DeleteObjectCommand({
    Bucket: config.bucketName,
    Key: key,
  });

  await getS3Client().send(command);
}

export interface ListedS3Object {
  key: string;
  sizeBytes: number;
  lastModified: Date | null;
}

/** One page of bucket keys under a prefix, for the reconcile orphan scan. */
export async function listS3Objects(input: {
  prefix: string;
  continuationToken?: string;
}): Promise<{ objects: ListedS3Object[]; nextContinuationToken: string | null }> {
  const config = s3Config();
  const result = await getS3Client().send(
    new ListObjectsV2Command({
      Bucket: config.bucketName,
      Prefix: input.prefix,
      ContinuationToken: input.continuationToken,
    }),
  );

  return {
    objects: (result.Contents ?? []).flatMap((object) =>
      object.Key
        ? [
            {
              key: object.Key,
              sizeBytes: object.Size ?? 0,
              lastModified: object.LastModified ?? null,
            },
          ]
        : [],
    ),
    nextContinuationToken: result.IsTruncated
      ? (result.NextContinuationToken ?? null)
      : null,
  };
}

export interface BucketSafetyReport {
  bucketName: string;
  /** null means the bucket has no public-access-block configuration at all. */
  publicAccessBlock: {
    blockPublicAcls: boolean;
    ignorePublicAcls: boolean;
    blockPublicPolicy: boolean;
    restrictPublicBuckets: boolean;
  } | null;
  /** SSE algorithms in effect; null when no encryption configuration exists. */
  encryptionAlgorithms: string[] | null;
  corsRules:
    | { allowedOrigins: string[]; allowedMethods: string[] }[]
    | null;
  lifecycleRules: { id: string | null; status: string | null }[] | null;
}

/**
 * Read-only snapshot of the bucket settings that decide whether user photos
 * can leak or rot: public-access block, encryption at rest, CORS, lifecycle.
 * AWS reports "not configured" as an error per section, so each probe maps
 * its own not-found code to null instead of failing the whole report.
 */
export async function describeBucketSafety(): Promise<BucketSafetyReport> {
  const config = s3Config();
  const client = getS3Client();
  const bucket = { Bucket: config.bucketName };

  const missing = async <T>(probe: Promise<T>, codes: string[]): Promise<T | null> => {
    try {
      return await probe;
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (codes.includes(name)) return null;
      throw error;
    }
  };

  const [publicAccess, encryption, cors, lifecycle] = await Promise.all([
    missing(client.send(new GetPublicAccessBlockCommand(bucket)), [
      'NoSuchPublicAccessBlockConfiguration',
    ]),
    missing(client.send(new GetBucketEncryptionCommand(bucket)), [
      'ServerSideEncryptionConfigurationNotFoundError',
    ]),
    missing(client.send(new GetBucketCorsCommand(bucket)), ['NoSuchCORSConfiguration']),
    missing(client.send(new GetBucketLifecycleConfigurationCommand(bucket)), [
      'NoSuchLifecycleConfiguration',
    ]),
  ]);

  const block = publicAccess?.PublicAccessBlockConfiguration;
  return {
    bucketName: config.bucketName,
    publicAccessBlock: block
      ? {
          blockPublicAcls: block.BlockPublicAcls ?? false,
          ignorePublicAcls: block.IgnorePublicAcls ?? false,
          blockPublicPolicy: block.BlockPublicPolicy ?? false,
          restrictPublicBuckets: block.RestrictPublicBuckets ?? false,
        }
      : null,
    encryptionAlgorithms: encryption
      ? (encryption.ServerSideEncryptionConfiguration?.Rules ?? []).flatMap((rule) =>
          rule.ApplyServerSideEncryptionByDefault?.SSEAlgorithm
            ? [rule.ApplyServerSideEncryptionByDefault.SSEAlgorithm]
            : [],
        )
      : null,
    corsRules: cors
      ? (cors.CORSRules ?? []).map((rule) => ({
          allowedOrigins: rule.AllowedOrigins ?? [],
          allowedMethods: rule.AllowedMethods ?? [],
        }))
      : null,
    lifecycleRules: lifecycle
      ? (lifecycle.Rules ?? []).map((rule) => ({
          id: rule.ID ?? null,
          status: rule.Status ?? null,
        }))
      : null,
  };
}
