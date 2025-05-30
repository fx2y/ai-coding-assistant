# P1-E2-S1: Embedding Generation Orchestration

## Overview

This document describes the implementation of P1-E2-S1: Cloudflare Worker embedding generation orchestration. This feature enables generating embeddings for all text chunks in a project using user-provided API keys via the BYOK (Bring Your Own Key) proxy.

## Architecture

The embedding generation process consists of:

1. **BYOK Proxy Client** (`workers/src/lib/byokProxyClient.ts`) - Handles communication with external embedding APIs
2. **Embedding Orchestration** (`workers/src/services/indexingService.ts`) - Coordinates the embedding generation process
3. **API Endpoint** (`POST /api/project/:projectId/generate_embeddings`) - Triggers embedding generation

## API Usage

### Endpoint

```
POST /api/project/:projectId/generate_embeddings
```

### Request Body

```json
{
  "userEmbeddingApiKey": "your-api-key-here",
  "embeddingModelConfig": {
    "service": "openai_embedding",
    "modelName": "text-embedding-ada-002",
    "batchSize": 20,
    "dimensions": 1536
  }
}
```

### Supported Services

- `openai_embedding` - OpenAI embeddings API
- `jina_embedding` - Jina AI embeddings API  
- `cohere_embed` - Cohere embeddings API

### Response

```json
{
  "processedChunkCount": 150,
  "successfulEmbeddingCount": 148,
  "errors": [
    {
      "chunkId": "chunk-123",
      "filePath": "src/problematic.js",
      "error": "Rate limit exceeded"
    }
  ],
  "totalProcessingTimeMs": 45000
}
```

## Implementation Details

### Batching Strategy

The implementation processes chunks in configurable batches to optimize API usage:

- Default batch size: 20 chunks per request
- Configurable via `embeddingModelConfig.batchSize`
- Respects API rate limits with 100ms delays between batches

### Error Handling

- Individual chunk failures don't stop the entire process
- Detailed error reporting per chunk
- Idempotency: skips chunks that already have embeddings

### Temporary Storage

For P1-E2-S1 verification, embeddings are temporarily stored in KV metadata:

```typescript
interface ChunkMetadata {
  // ... existing fields
  tempEmbeddingVector?: number[]; // Temporary for P1-E2-S1
}
```

This will be replaced by Vectorize storage in P1-E2-S2.

## Testing

### Unit Tests

- **BYOK Proxy Client**: Tests API communication, error handling, batching
- **Embedding Orchestration**: Tests chunk processing, error scenarios, idempotency
- **API Handler**: Tests request validation, response formatting

### Integration Testing

1. Upload a project using `POST /api/project/upload`
2. Process chunks using `POST /api/project/:projectId/process_chunks`
3. Generate embeddings using `POST /api/project/:projectId/generate_embeddings`
4. Verify embeddings are stored in chunk metadata

### Example Integration Test

```bash
# 1. Upload project
curl -X POST http://localhost:8787/api/project/upload \
  -F "codeZipFile=@project.zip"

# 2. Process chunks
curl -X POST http://localhost:8787/api/project/{PROJECT_ID}/process_chunks

# 3. Generate embeddings
curl -X POST http://localhost:8787/api/project/{PROJECT_ID}/generate_embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "userEmbeddingApiKey": "your-openai-key",
    "embeddingModelConfig": {
      "service": "openai_embedding",
      "modelName": "text-embedding-ada-002",
      "batchSize": 10
    }
  }'
```

## Configuration

### Environment Variables

- `PROXY_WORKER_URL`: URL of the BYOK proxy worker (defaults to localhost for development)

### Model Configuration

Different embedding services support different parameters:

#### OpenAI
```json
{
  "service": "openai_embedding",
  "modelName": "text-embedding-ada-002",
  "dimensions": 1536
}
```

#### Jina AI
```json
{
  "service": "jina_embedding", 
  "modelName": "jina-embeddings-v2-base-en",
  "dimensions": 768
}
```

#### Cohere
```json
{
  "service": "cohere_embed",
  "modelName": "embed-english-v3.0"
}
```

## Security Considerations

- API keys are passed through the request body and not logged
- All external API calls go through the BYOK proxy for security
- Input validation prevents injection attacks
- Rate limiting respects external API constraints

## Performance Characteristics

- **Throughput**: ~20 chunks per API request (configurable)
- **Latency**: Depends on external API response times
- **Memory**: Processes chunks in batches to avoid memory issues
- **Reliability**: Continues processing despite individual chunk failures

## Next Steps

This implementation provides the foundation for P1-E2-S2, which will:

1. Replace temporary KV storage with Cloudflare Vectorize
2. Enable vector similarity search
3. Support semantic code search functionality 