/**
 * External service configurations for API proxy
 * Implements RFC-SEC-001 external service routing
 */

import type { SupportedExternalService, ExternalServiceConfig } from '../types.js';

/**
 * Configuration mapping for external AI services
 * Each service defines its base URL, authentication method, and default headers
 */
export const EXTERNAL_SERVICE_CONFIGS: Record<SupportedExternalService, ExternalServiceConfig> = {
  // OpenAI Services
  openai_chat: {
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    defaultHeaders: {
      'Content-Type': 'application/json'
    }
  },

  openai_embedding: {
    baseUrl: 'https://api.openai.com/v1/embeddings',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    defaultHeaders: {
      'Content-Type': 'application/json'
    }
  },

  // Anthropic Claude
  anthropic_claude: {
    baseUrl: 'https://api.anthropic.com/v1/messages',
    authHeader: 'x-api-key',
    defaultHeaders: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    }
  },

  // Jina AI Embeddings
  jina_embedding: {
    baseUrl: 'https://api.jina.ai/v1/embeddings',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    defaultHeaders: {
      'Content-Type': 'application/json'
    }
  },

  // Cohere Services
  cohere_generate: {
    baseUrl: 'https://api.cohere.ai/v1/generate',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    defaultHeaders: {
      'Content-Type': 'application/json'
    }
  },

  cohere_embed: {
    baseUrl: 'https://api.cohere.ai/v1/embed',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    defaultHeaders: {
      'Content-Type': 'application/json'
    }
  }
};

/**
 * Get configuration for a specific external service
 */
export function getServiceConfig(service: SupportedExternalService): ExternalServiceConfig {
  const config = EXTERNAL_SERVICE_CONFIGS[service];
  if (!config) {
    throw new Error(`Unsupported external service: ${service}`);
  }
  return config;
}

/**
 * Build headers for external API request
 */
export function buildExternalHeaders(
  service: SupportedExternalService,
  apiKey: string,
  additionalHeaders?: Record<string, string>
): Record<string, string> {
  const config = getServiceConfig(service);

  const headers: Record<string, string> = {
    ...config.defaultHeaders,
    ...additionalHeaders
  };

  // Set authentication header
  const authValue = config.authPrefix ? `${config.authPrefix}${apiKey}` : apiKey;
  headers[config.authHeader] = authValue;

  return headers;
}

/**
 * Validate that a service is supported and in allowlist
 * This prevents the proxy from being used as an open proxy
 */
export function validateExternalService(service: string): service is SupportedExternalService {
  return service in EXTERNAL_SERVICE_CONFIGS;
}