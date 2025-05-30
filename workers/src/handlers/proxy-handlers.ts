/**
 * Proxy handlers for external API requests
 * Implements RFC-SEC-001, P0-E1-S2: Secure External API Proxy
 */

import type { Context } from 'hono';
import { ExternalApiProxyRequestSchema } from '../types.js';
import {
  ValidationError,
  ExternalServiceError,
  createSuccessResponse,
  createErrorResponse
} from '../lib/error-handler.js';
import {
  getServiceConfig,
  buildExternalHeaders,
  validateExternalService
} from '../lib/external-service-configs.js';

/**
 * Handler for POST /api/proxy/external
 * Proxies requests to external AI services using user-provided API keys
 *
 * @param c - Hono context
 * @returns Response from external service or error response
 */
export async function proxyExternalApiHandler(c: Context) {
  const requestId = c.get('requestId');

  try {
    // Parse and validate request body
    const body = await c.req.json();
    const validationResult = ExternalApiProxyRequestSchema.safeParse(body);

    if (!validationResult.success) {
      throw new ValidationError(
        'Invalid request format',
        validationResult.error.flatten()
      );
    }

    const { target_service, api_key, payload } = validationResult.data;

    // Additional service validation (defense in depth)
    if (!validateExternalService(target_service)) {
      throw new ValidationError(`Unsupported service: ${target_service}`);
    }

    // Get service configuration
    const serviceConfig = getServiceConfig(target_service);

    // Build headers for external request
    const headers = buildExternalHeaders(target_service, api_key);

    // Log request (without sensitive data)
    console.info('External API proxy request', {
      requestId,
      targetService: target_service,
      url: serviceConfig.baseUrl,
      payloadKeys: Object.keys(payload)
      // Note: API key is NOT logged for security
    });

    // Make request to external service
    const externalResponse = await fetch(serviceConfig.baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    // Handle external service response
    if (!externalResponse.ok) {
      // Parse error response from external service
      let errorBody: unknown;
      try {
        errorBody = await externalResponse.json();
      } catch {
        // If JSON parsing fails, get text
        errorBody = await externalResponse.text();
      }

      console.warn('External service error', {
        requestId,
        targetService: target_service,
        status: externalResponse.status,
        statusText: externalResponse.statusText,
        errorBody
      });

      throw new ExternalServiceError(
        target_service,
        `Request failed with status ${externalResponse.status}`,
        externalResponse.status,
        errorBody
      );
    }

    // Parse successful response
    const responseData = await externalResponse.json();

    console.info('External API proxy success', {
      requestId,
      targetService: target_service,
      responseDataKeys: responseData && typeof responseData === 'object' ? Object.keys(responseData) : []
    });

    // Return successful response
    return createSuccessResponse(responseData, 200, requestId);

  } catch (error) {
    console.error('Proxy handler error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    if (error instanceof ValidationError || error instanceof ExternalServiceError) {
      return createErrorResponse(error, requestId);
    }

    // Handle unexpected errors
    return createErrorResponse(
      new ExternalServiceError(
        'proxy',
        'An unexpected error occurred while processing the request'
      ),
      requestId
    );
  }
}

/**
 * Handler for GET /api/proxy/health
 * Health check endpoint for the proxy service
 */
export async function proxyHealthHandler(c: Context) {
  const requestId = c.get('requestId');

  return createSuccessResponse(
    {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: Object.keys(getServiceConfig).length
    },
    200,
    requestId
  );
}

/**
 * Handler for GET /api/proxy/services
 * Returns list of supported external services
 */
export async function proxySupportedServicesHandler(c: Context) {
  const requestId = c.get('requestId');

  // Get list of supported services without exposing internal configuration
  const supportedServices = [
    'openai_chat',
    'openai_embedding',
    'anthropic_claude',
    'jina_embedding',
    'cohere_generate',
    'cohere_embed'
  ];

  return createSuccessResponse(
    {
      services: supportedServices,
      count: supportedServices.length
    },
    200,
    requestId
  );
}