import pino from 'pino';
import { env } from '../config/env';

export const logger = pino({
  level: env.isTest ? 'silent' : env.isProduction ? 'info' : 'debug',
  base: {
    service: 'pepta-backend',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
