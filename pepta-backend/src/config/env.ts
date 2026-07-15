import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(8080),
    MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/pepta'),
    JWT_SECRET: z
      .string()
      .min(64)
      .default('dev_test_secret_replace_me_with_real_secret_64_chars_minimum_value'),
    JWT_EXPIRES_IN: z.string().min(1).default('30d'),
    GOOGLE_CLIENT_ID: z.string().min(1).default('local-google-client-id'),
    FRONTEND_ORIGIN: z.string().url().default('http://localhost:8081'),
    AWS_REGION: z.string().min(1).optional(),
    AWS_S3_BUCKET_NAME: z.string().min(1).optional(),
    AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
    AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),
    OPENAI_PRODUCT_SEARCH_MODEL: z.string().min(1).default('gpt-5.5'),
    TOGETHER_API_KEY: z.string().min(1).optional(),
    TOGETHER_VISION_MODEL: z.string().min(1).default('Qwen/Qwen3.5-9B'),
    OPEN_FOOD_FACTS_USER_AGENT: z
      .string()
      .min(1)
      .default('Pepta/1.0 (support@pepta.app)'),
    REVENUECAT_WEBHOOK_SECRET: z.string().min(1).optional(),
    APPLE_TEAM_ID: z.string().min(1).optional(),
    APPLE_CLIENT_ID: z.string().min(1).optional(),
    APPLE_KEY_ID: z.string().min(1).optional(),
    APPLE_PRIVATE_KEY_BASE64: z.string().min(1).optional(),
    SCHEDULER_TIMEZONE: z.string().min(1).default('America/New_York'),
    WEEKLY_RETENTION_CRON: z.string().min(1).default('0 8 * * 1'),
    MEDICATION_LEVEL_CRON: z.string().min(1).default('0 3 * * *'),
    PEP_PUSH_CRON: z.string().min(1).default('*/15 * * * *'),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV !== 'production') {
      return;
    }

    const requiredProductionKeys = [
      'AWS_REGION',
      'AWS_S3_BUCKET_NAME',
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'OPENAI_API_KEY',
      'TOGETHER_API_KEY',
      'REVENUECAT_WEBHOOK_SECRET',
    ] as const;

    for (const key of requiredProductionKeys) {
      if (!value[key]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required in production`,
        });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[env] Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

function decodeApplePrivateKey(value?: string): string | undefined {
  return value ? Buffer.from(value, 'base64').toString('utf8').replace(/\\n/g, '\n') : undefined;
}

const applePrivateKey = decodeApplePrivateKey(parsed.data.APPLE_PRIVATE_KEY_BASE64);
const apple =
  parsed.data.APPLE_TEAM_ID &&
  parsed.data.APPLE_CLIENT_ID &&
  parsed.data.APPLE_KEY_ID &&
  applePrivateKey
    ? {
        teamId: parsed.data.APPLE_TEAM_ID,
        clientId: parsed.data.APPLE_CLIENT_ID,
        keyId: parsed.data.APPLE_KEY_ID,
        privateKey: applePrivateKey,
      }
    : null;

export const env = {
  nodeEnv: parsed.data.NODE_ENV,
  isDevelopment: parsed.data.NODE_ENV === 'development',
  isProduction: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  port: parsed.data.PORT,
  mongoUri: parsed.data.MONGODB_URI,
  frontendOrigin: parsed.data.FRONTEND_ORIGIN,
  jwt: {
    secret: parsed.data.JWT_SECRET,
    expiresIn: parsed.data.JWT_EXPIRES_IN,
  },
  google: {
    clientId: parsed.data.GOOGLE_CLIENT_ID,
  },
  apple,
  aws: {
    region: parsed.data.AWS_REGION,
    bucketName: parsed.data.AWS_S3_BUCKET_NAME,
    accessKeyId: parsed.data.AWS_ACCESS_KEY_ID,
    secretAccessKey: parsed.data.AWS_SECRET_ACCESS_KEY,
  },
  openai: {
    apiKey: parsed.data.OPENAI_API_KEY,
    productSearchModel: parsed.data.OPENAI_PRODUCT_SEARCH_MODEL,
  },
  together: {
    apiKey: parsed.data.TOGETHER_API_KEY,
    visionModel: parsed.data.TOGETHER_VISION_MODEL,
  },
  openFoodFacts: {
    userAgent: parsed.data.OPEN_FOOD_FACTS_USER_AGENT,
  },
  revenueCat: {
    webhookSecret: parsed.data.REVENUECAT_WEBHOOK_SECRET,
  },
  scheduler: {
    timezone: parsed.data.SCHEDULER_TIMEZONE,
    weeklyRetentionCron: parsed.data.WEEKLY_RETENTION_CRON,
    medicationLevelCron: parsed.data.MEDICATION_LEVEL_CRON,
    pepPushCron: parsed.data.PEP_PUSH_CRON,
  },
} as const;
