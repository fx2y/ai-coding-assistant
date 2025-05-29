/**
 * Error handling utilities for consistent error responses
 * Implements RFC-API-001 error response patterns
 */

import type { Context } from 'hono';
import type { ApiError as ApiErrorType } from '../types.js';

// Custom error classes
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    code?: string,
    details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    if (code !== undefined) {
      this.code = code;
    }
    this.details = details;
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class ExternalServiceError extends ApiError {
  constructor(
    service: string,
    message: string,
    statusCode: number = 502,
    details?: unknown
  ) {
    super(`External service error (${service}): ${message}`, statusCode, 'EXTERNAL_SERVICE_ERROR', details);
    this.name = 'ExternalServiceError';
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends ApiError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.name = 'RateLimitError';
  }
}

/**
 * Generate a unique request ID for tracing
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  error: Error | ApiError,
  requestId?: string
): Response {
  const id = requestId || generateRequestId();
  
  if (error instanceof ApiError) {
    const errorResponse: ApiErrorType = {
      error: error.name,
      message: error.message,
      requestId: id
    };

    if (error.code) {
      errorResponse.code = error.code;
    }
    if (error.details) {
      errorResponse.details = error.details;
    }

    // Log structured error (don't log sensitive details like API keys)
    console.error('API Error', {
      requestId: id,
      error: error.name,
      message: error.message,
      statusCode: error.statusCode,
      code: error.code,
      stack: error.stack
    });

    return new Response(JSON.stringify(errorResponse), {
      status: error.statusCode,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': id
      }
    });
  }

  // Handle unexpected errors
  const errorResponse: ApiErrorType = {
    error: 'InternalServerError',
    message: 'An unexpected error occurred',
    requestId: id
  };

  console.error('Unexpected Error', {
    requestId: id,
    error: error.name,
    message: error.message,
    stack: error.stack
  });

  return new Response(JSON.stringify(errorResponse), {
    status: 500,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': id
    }
  });
}

/**
 * Create a successful response with consistent structure
 */
export function createSuccessResponse<T>(
  data: T,
  status: number = 200,
  requestId?: string
): Response {
  const id = requestId || generateRequestId();
  
  const response = {
    success: true,
    data,
    requestId: id
  };

  return new Response(JSON.stringify(response), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': id
    }
  });
}

/**
 * Hono error handler middleware
 */
export function errorHandler() {
  return async (c: Context, next: () => Promise<void>): Promise<Response> => {
    try {
      await next();
      return c.res;
    } catch (error) {
      const requestId = c.get('requestId') || generateRequestId();
      
      if (error instanceof Error) {
        return createErrorResponse(error, requestId);
      }
      
      // Handle non-Error objects
      console.error('Non-Error thrown', { requestId, error });
      return createErrorResponse(new ApiError('An unexpected error occurred'), requestId);
    }
  };
}

/**
 * Request ID middleware - adds unique ID to each request for tracing
 */
export function requestIdMiddleware() {
  return async (c: Context, next: () => Promise<void>): Promise<void> => {
    const requestId = generateRequestId();
    c.set('requestId', requestId);
    
    console.info('Request started', {
      requestId,
      method: c.req.method,
      path: c.req.path,
      userAgent: c.req.header('User-Agent')
    });
    
    await next();
    
    console.info('Request completed', {
      requestId,
      status: c.res.status
    });
  };
} 