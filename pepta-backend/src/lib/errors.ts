import { ERROR_CODES } from '@pepta/shared';

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;
  public readonly expose: boolean;

  public constructor(params: {
    code: string;
    message: string;
    statusCode: number;
    details?: unknown;
    expose?: boolean;
  }) {
    super(params.message);
    this.name = new.target.name;
    this.code = params.code;
    this.statusCode = params.statusCode;
    this.details = params.details;
    this.expose = params.expose ?? true;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  public constructor(message = 'Validation failed', details?: unknown) {
    super({
      code: ERROR_CODES.validation,
      message,
      statusCode: 400,
      details,
    });
  }
}

export class AuthError extends AppError {
  public constructor(message = 'Authentication failed', details?: unknown) {
    super({
      code: ERROR_CODES.authInvalidToken,
      message,
      statusCode: 401,
      details,
    });
  }
}

export class NotFoundError extends AppError {
  public constructor(message = 'Resource not found', details?: unknown) {
    super({
      code: ERROR_CODES.notFound,
      message,
      statusCode: 404,
      details,
    });
  }
}

export class InternalError extends AppError {
  public constructor(message = 'Internal server error', details?: unknown) {
    super({
      code: ERROR_CODES.internal,
      message,
      statusCode: 500,
      details,
      expose: false,
    });
  }
}
