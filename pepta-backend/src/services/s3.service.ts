import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
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

export async function createPresignedPutUrl(input: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const config = s3Config();
  const command = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: input.key,
    ContentType: input.contentType,
  });

  return getSignedUrl(getS3Client(), command, {
    expiresIn: input.expiresInSeconds ?? SIGNED_URL_TTL_SECONDS,
  });
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
  });

  await getS3Client().send(command);
}

export async function deleteS3Object(key: string): Promise<void> {
  const config = s3Config();
  const command = new DeleteObjectCommand({
    Bucket: config.bucketName,
    Key: key,
  });

  await getS3Client().send(command);
}
