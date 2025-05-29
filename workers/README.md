# AI Coding Assistant Workers

Cloudflare Workers backend for the AI Coding Assistant, implementing secure external API proxying using the BYOK (Bring Your Own Key) model.

## Architecture

This implementation follows RFC-SEC-001 and RFC-API-001, providing:

- **Secure API Proxy (P0-E1-S2)**: Routes client requests to external AI services using user-provided API keys
- **No Server-Side Key Storage**: API keys are transmitted per-request from client, never stored on server
- **Multi-Provider Support**: OpenAI, Anthropic, Jina, Cohere
- **Robust Error Handling**: Comprehensive error propagation and logging
- **Type Safety**: Full TypeScript implementation with Zod validation

## Quick Start

### Prerequisites

- Node.js 18+
- Cloudflare Account
- Wrangler CLI v3+

### Installation

```bash
cd workers
npm install
```

### Local Development

```bash
# Start local development server
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

### Deployment

```bash
# Deploy to staging
npm run deploy:staging

# Deploy to production
npm run deploy
```

## API Endpoints

### POST `/api/proxy/external`

Proxies requests to external AI services using user-provided API keys.

**Request Body:**
```json
{
  "target_service": "openai_chat",
  "api_key": "sk-user-provided-key",
  "payload": {
    "model": "gpt-3.5-turbo",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "choices": [
      {"message": {"content": "Hello there!"}}
    ]
  },
  "requestId": "req_1234567890_abc123"
}
```

**Supported Services:**
- `openai_chat` - OpenAI Chat Completions
- `openai_embedding` - OpenAI Embeddings
- `anthropic_claude` - Anthropic Claude
- `jina_embedding` - Jina AI Embeddings
- `cohere_generate` - Cohere Generate
- `cohere_embed` - Cohere Embeddings

### GET `/api/proxy/health`

Health check endpoint.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-15T10:00:00Z",
    "services": 6
  },
  "requestId": "req_1234567890_def456"
}
```

### GET `/api/proxy/services`

Returns list of supported external services.

**Response:**
```json
{
  "success": true,
  "data": {
    "services": ["openai_chat", "openai_embedding", "anthropic_claude", "jina_embedding", "cohere_generate", "cohere_embed"],
    "count": 6
  },
  "requestId": "req_1234567890_ghi789"
}
```

## Security Features

### API Key Handling

- **No Server Storage**: API keys are never stored in Workers
- **Per-Request Transmission**: Keys are passed in each request from client
- **No Logging**: API keys are explicitly excluded from all logs
- **Service Allowlist**: Only predefined external services are accessible

### Error Handling

- **Structured Errors**: Consistent error format across all endpoints
- **External Error Propagation**: External service errors are properly forwarded
- **Request Tracing**: Unique request IDs for debugging
- **Sanitized Logging**: Sensitive data excluded from logs

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ENVIRONMENT` | Deployment environment | `development` |

### External Service Configuration

External services are configured in `src/lib/external-service-configs.ts`:

```typescript
export const EXTERNAL_SERVICE_CONFIGS = {
  openai_chat: {
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    defaultHeaders: {
      'Content-Type': 'application/json'
    }
  },
  // ... other services
};
```

## Testing

### Unit Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

### Integration Testing

The proxy can be tested with actual external services using development API keys:

```bash
# Example: Test OpenAI integration
curl -X POST http://localhost:8787/api/proxy/external \
  -H "Content-Type: application/json" \
  -d '{
    "target_service": "openai_chat",
    "api_key": "your-dev-api-key",
    "payload": {
      "model": "gpt-3.5-turbo",
      "messages": [{"role": "user", "content": "Hello"}],
      "max_tokens": 50
    }
  }'
```

### Test Coverage

Current test coverage includes:

- ✅ Request validation (Zod schemas)
- ✅ Service routing and header configuration
- ✅ Error handling (auth, rate limits, network)
- ✅ Security (key sanitization, service allowlist)
- ✅ Response formatting

## Client Integration

The workers proxy integrates with the client-side `externalApiService`:

```typescript
import { callOpenAIChat } from '../services/externalApiService';

// Client automatically uses stored API keys
const response = await callOpenAIChat([
  { role: 'user', content: 'Hello!' }
]);

if (response.success) {
  console.log(response.data);
} else {
  console.error(response.error);
}
```

## Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `VALIDATION_ERROR` | Invalid request format | 400 |
| `MISSING_API_KEY` | No API key provided | 400 |
| `EXTERNAL_SERVICE_ERROR` | External service error | 401, 429, 502 |
| `NETWORK_ERROR` | Network communication error | 502 |

## Development

### File Structure

```
workers/
├── src/
│   ├── handlers/           # Route handlers
│   │   ├── proxy-handlers.ts
│   │   └── proxy-handlers.test.ts
│   ├── lib/                # Shared utilities
│   │   ├── error-handler.ts
│   │   └── external-service-configs.ts
│   ├── types.ts            # Shared TypeScript types
│   └── index.ts            # Main Worker entry point
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── wrangler.toml
```

### Adding New External Services

1. Add service type to `SupportedExternalService` in `types.ts`
2. Add configuration to `EXTERNAL_SERVICE_CONFIGS` in `external-service-configs.ts`
3. Update Zod schema validation
4. Add tests for the new service
5. Update documentation

### Best Practices

- Always validate inputs with Zod schemas
- Use structured logging with request IDs
- Never log sensitive data (API keys, user content)
- Propagate external errors with context
- Write comprehensive tests for new features

## Monitoring

### Logs

Structured JSON logs are available in Cloudflare Dashboard:

```json
{
  "level": "info",
  "message": "External API proxy request",
  "requestId": "req_1234567890_abc123",
  "targetService": "openai_chat",
  "url": "https://api.openai.com/v1/chat/completions",
  "payloadKeys": ["model", "messages"]
}
```

### Metrics

Monitor these key metrics:

- Request latency
- Error rates by service
- External service availability
- Request volume

## Support

For issues or questions:

1. Check the test suite for examples
2. Review error logs with request ID
3. Verify external service status
4. Check API key validity

## License

This project is part of the AI Coding Assistant and follows the same license terms. 